from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PORTFOLIO_FILE = ROOT / "portfolio-data.js"
HISTORY_FILE = ROOT / "gain-loss-history.js"
API_KEY = os.environ.get("FINNHUB_API_KEY", "").strip()
NEW_YORK = ZoneInfo("America/New_York")


def read_javascript_variable(path: Path, variable_name: str) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")

    node_code = r"""
const fs = require("fs");
const vm = require("vm");
const filePath = process.argv[1];
const variableName = process.argv[2];
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
const value = context.window[variableName];
if (!Array.isArray(value)) {
  throw new Error(`window.${variableName} was not found or is not an array`);
}
process.stdout.write(JSON.stringify(value));
"""

    completed = subprocess.run(
        ["node", "-e", node_code, str(path), variable_name],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def parse_transactions(path: Path) -> list[dict]:
    raw_transactions = read_javascript_variable(path, "sharedTransactions")
    transactions: list[dict] = []

    for index, tx in enumerate(raw_transactions):
        raw_type = str(
            tx.get("type") or tx.get("action") or tx.get("operation")
            or tx.get("操作") or tx.get("类型") or ""
        ).strip().lower()
        transaction_type = (
            "sell" if raw_type in {"sell", "sale", "sold", "卖出", "出售"}
            else "buy"
        )
        symbol = str(
            tx.get("symbol") or tx.get("ticker") or tx.get("股票代码") or ""
        ).strip().upper()
        shares = float(
            tx.get("shares") or tx.get("quantity") or tx.get("qty")
            or tx.get("股数") or tx.get("卖出股数") or tx.get("买入股数") or 0
        )
        price = float(
            tx.get("price") or tx.get("salePrice") or tx.get("sellPrice")
            or tx.get("buyPrice") or tx.get("价格")
            or tx.get("卖出价格") or tx.get("买入价格") or 0
        )
        date = str(tx.get("date") or tx.get("日期") or "").strip()

        if symbol and shares > 0 and price > 0:
            transactions.append({
                "date": date,
                "type": transaction_type,
                "symbol": symbol,
                "shares": shares,
                "price": price,
                "originalIndex": index,
            })

    transactions.sort(key=lambda tx: (tx["date"], tx["originalIndex"]))
    return transactions


def calculate_positions(transactions: list[dict]) -> dict[str, dict[str, float]]:
    positions: dict[str, dict[str, float]] = {}

    for tx in transactions:
        position = positions.setdefault(tx["symbol"], {"shares": 0.0, "cost": 0.0})

        if tx["type"] == "buy":
            position["shares"] += tx["shares"]
            position["cost"] += tx["shares"] * tx["price"]
            continue

        if position["shares"] <= 0:
            continue

        shares_sold = min(tx["shares"], position["shares"])
        average_cost = position["cost"] / position["shares"]
        position["shares"] -= shares_sold
        position["cost"] -= shares_sold * average_cost

        if position["shares"] < 0.000001:
            position["shares"] = 0.0
            position["cost"] = 0.0

    return {
        symbol: position
        for symbol, position in positions.items()
        if position["shares"] > 0
    }


def get_quote(symbol: str) -> dict[str, float]:
    query = urllib.parse.urlencode({"symbol": symbol, "token": API_KEY})
    url = f"https://finnhub.io/api/v1/quote?{query}"
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "portfolio-history-action/3.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    current_price = float(payload.get("c") or 0)
    daily_change = float(payload.get("d") or 0)

    if current_price <= 0:
        raise RuntimeError(f"Finnhub returned no valid current price for {symbol}: {payload}")

    return {"currentPrice": current_price, "dailyChange": daily_change}


def parse_history(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        return read_javascript_variable(path, "gainLossHistory")
    except Exception as error:
        print(f"Warning: could not read existing history: {error}")
        return []


def write_history(records: list[dict]) -> None:
    records.sort(key=lambda record: str(record["date"]), reverse=True)
    content = (
        "// Shared gain/loss history. Updated automatically by GitHub Actions.\n"
        "// gainLoss: total unrealized portfolio gain/loss.\n"
        "// dailyGainLoss: transaction-aware daily gain/loss.\n\n"
        "window.gainLossHistory = "
        + json.dumps(records, indent=2, ensure_ascii=False)
        + ";\n"
    )
    HISTORY_FILE.write_text(content, encoding="utf-8")


def main() -> None:
    if not API_KEY:
        raise RuntimeError(
            "FINNHUB_API_KEY is missing. Add it under Settings > Secrets and variables > Actions."
        )

    record_date = datetime.now(NEW_YORK).date().isoformat()
    transactions = parse_transactions(PORTFOLIO_FILE)
    beginning_transactions = [tx for tx in transactions if tx["date"] < record_date]
    beginning_positions = calculate_positions(beginning_transactions)
    ending_positions = calculate_positions(transactions)

    today_transactions = [tx for tx in transactions if tx["date"] == record_date]
    symbols = sorted(
        set(beginning_positions)
        | set(ending_positions)
        | {tx["symbol"] for tx in today_transactions}
    )

    if not symbols:
        raise RuntimeError("No positions or transactions were found.")

    quotes: dict[str, dict[str, float]] = {}
    for index, symbol in enumerate(symbols):
        quotes[symbol] = get_quote(symbol)
        if index < len(symbols) - 1:
            time.sleep(1.1)

    total_cost = sum(position["cost"] for position in ending_positions.values())
    total_value = sum(
        position["shares"] * quotes[symbol]["currentPrice"]
        for symbol, position in ending_positions.items()
    )

    daily_gain_loss = 0.0

    for symbol in symbols:
        quote = quotes[symbol]
        current_price = quote["currentPrice"]
        previous_close = current_price - quote["dailyChange"]
        beginning_shares = beginning_positions.get(symbol, {}).get("shares", 0.0)
        ending_shares = ending_positions.get(symbol, {}).get("shares", 0.0)

        today_buy_cost = sum(
            tx["shares"] * tx["price"]
            for tx in today_transactions
            if tx["symbol"] == symbol and tx["type"] == "buy"
        )
        today_sell_proceeds = sum(
            tx["shares"] * tx["price"]
            for tx in today_transactions
            if tx["symbol"] == symbol and tx["type"] == "sell"
        )

        symbol_daily_gain = (
            ending_shares * current_price
            + today_sell_proceeds
            - today_buy_cost
            - beginning_shares * previous_close
        )
        daily_gain_loss += symbol_daily_gain

        print(
            f"{symbol}: beginningShares={beginning_shares:.4f}, "
            f"endingShares={ending_shares:.4f}, previousClose={previous_close:.4f}, "
            f"current={current_price:.4f}, buys={today_buy_cost:.2f}, "
            f"sells={today_sell_proceeds:.2f}, dailyGain={symbol_daily_gain:.2f}"
        )

    gain_loss = round(total_value - total_cost, 2)
    daily_gain_loss = round(daily_gain_loss, 2)

    history = [
        record for record in parse_history(HISTORY_FILE)
        if str(record.get("date", "")) != record_date
    ]
    history.append({
        "date": record_date,
        "gainLoss": gain_loss,
        "dailyGainLoss": daily_gain_loss,
    })
    write_history(history)

    print(json.dumps({
        "date": record_date,
        "totalCost": round(total_cost, 2),
        "totalValue": round(total_value, 2),
        "gainLoss": gain_loss,
        "dailyGainLoss": daily_gain_loss,
    }, indent=2))


if __name__ == "__main__":
    main()
