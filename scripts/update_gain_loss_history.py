from __future__ import annotations

import json
import os
import re
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


def read_javascript_array(path: Path, variable_name: str) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    pattern = rf"window\.{re.escape(variable_name)}\s*=\s*(\[[\s\S]*?\])\s*;"
    match = re.search(pattern, text)

    if not match:
        raise RuntimeError(f"Could not find window.{variable_name} in {path.name}")

    array_text = re.sub(r"//.*", "", match.group(1))
    return json.loads(array_text)


def parse_transactions(path: Path) -> list[dict]:
    raw_transactions = read_javascript_array(path, "sharedTransactions")
    transactions: list[dict] = []

    for index, tx in enumerate(raw_transactions):
        raw_type = str(
            tx.get("type")
            or tx.get("action")
            or tx.get("operation")
            or tx.get("操作")
            or tx.get("类型")
            or ""
        ).strip().lower()

        transaction_type = (
            "sell"
            if raw_type in {"sell", "sale", "sold", "卖出", "出售"}
            else "buy"
        )

        symbol = str(
            tx.get("symbol")
            or tx.get("ticker")
            or tx.get("股票代码")
            or ""
        ).strip().upper()

        shares = float(
            tx.get("shares")
            or tx.get("quantity")
            or tx.get("qty")
            or tx.get("股数")
            or tx.get("卖出股数")
            or tx.get("买入股数")
            or 0
        )

        price = float(
            tx.get("price")
            or tx.get("salePrice")
            or tx.get("sellPrice")
            or tx.get("buyPrice")
            or tx.get("价格")
            or tx.get("卖出价格")
            or tx.get("买入价格")
            or 0
        )

        date = str(tx.get("date") or tx.get("日期") or "").strip()

        if symbol and shares > 0 and price > 0:
            transactions.append(
                {
                    "date": date,
                    "type": transaction_type,
                    "symbol": symbol,
                    "shares": shares,
                    "price": price,
                    "originalIndex": index,
                }
            )

    transactions.sort(key=lambda tx: (tx["date"], tx["originalIndex"]))
    return transactions


def calculate_positions(transactions: list[dict]) -> dict[str, dict[str, float]]:
    positions: dict[str, dict[str, float]] = {}

    for tx in transactions:
        position = positions.setdefault(
            tx["symbol"],
            {"shares": 0.0, "cost": 0.0},
        )

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
    query = urllib.parse.urlencode(
        {"symbol": symbol, "token": API_KEY}
    )
    url = f"https://finnhub.io/api/v1/quote?{query}"

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "portfolio-history-action/2.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    current_price = float(payload.get("c") or 0)
    daily_change = float(payload.get("d") or 0)

    if current_price <= 0:
        raise RuntimeError(
            f"Finnhub returned no valid current price for {symbol}: {payload}"
        )

    return {
        "currentPrice": current_price,
        "dailyChange": daily_change,
    }


def parse_history(path: Path) -> list[dict]:
    if not path.exists():
        return []

    try:
        return read_javascript_array(path, "gainLossHistory")
    except Exception:
        return []


def write_history(records: list[dict]) -> None:
    records.sort(key=lambda record: str(record["date"]), reverse=True)

    content = (
        "// Shared gain/loss history. Updated automatically by GitHub Actions.\n"
        "// gainLoss: total unrealized portfolio gain/loss.\n"
        "// dailyGainLoss: 今日总盈亏 = sum(remaining shares × daily price change).\n\n"
        "window.gainLossHistory = "
        + json.dumps(records, indent=2, ensure_ascii=False)
        + ";\n"
    )

    HISTORY_FILE.write_text(content, encoding="utf-8")


def main() -> None:
    if not API_KEY:
        raise RuntimeError(
            "FINNHUB_API_KEY is missing. Add it under "
            "Settings > Secrets and variables > Actions."
        )

    positions = calculate_positions(parse_transactions(PORTFOLIO_FILE))

    if not positions:
        raise RuntimeError("No open positions were found.")

    total_cost = sum(position["cost"] for position in positions.values())
    total_value = 0.0
    daily_gain_loss = 0.0

    for index, symbol in enumerate(sorted(positions)):
        quote = get_quote(symbol)
        shares = positions[symbol]["shares"]

        total_value += shares * quote["currentPrice"]
        daily_gain_loss += shares * quote["dailyChange"]

        print(
            f"{symbol}: current={quote['currentPrice']}, "
            f"dailyChange={quote['dailyChange']}, shares={shares}"
        )

        if index < len(positions) - 1:
            time.sleep(1.1)

    gain_loss = round(total_value - total_cost, 2)
    daily_gain_loss = round(daily_gain_loss, 2)
    record_date = datetime.now(NEW_YORK).date().isoformat()

    history = [
        record
        for record in parse_history(HISTORY_FILE)
        if str(record.get("date", "")) != record_date
    ]

    history.append(
        {
            "date": record_date,
            "gainLoss": gain_loss,
            "dailyGainLoss": daily_gain_loss,
        }
    )

    write_history(history)

    print(
        json.dumps(
            {
                "date": record_date,
                "totalCost": round(total_cost, 2),
                "totalValue": round(total_value, 2),
                "gainLoss": gain_loss,
                "dailyGainLoss": daily_gain_loss,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
