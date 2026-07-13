#!/usr/bin/env python3
"""Record one total unrealized gain/loss entry after market close."""

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


def parse_transactions(path: Path) -> list[dict]:
    """Parse the simple object records used by portfolio-data.js."""
    text = path.read_text(encoding="utf-8")

    match = re.search(
        r"window\.sharedTransactions\s*=\s*\[(?P<body>[\s\S]*?)\]\s*;",
        text,
    )
    if not match:
        raise RuntimeError(
            "Could not find window.sharedTransactions in portfolio-data.js"
        )

    transactions: list[dict] = []

    for object_text in re.findall(r"\{([^{}]+)\}", match.group("body")):
        def string_field(name: str, default: str = "") -> str:
            field = re.search(
                rf"{name}\s*:\s*['\"]([^'\"]*)['\"]",
                object_text,
            )
            return field.group(1) if field else default

        def number_field(name: str) -> float:
            field = re.search(
                rf"{name}\s*:\s*(-?\d+(?:\.\d+)?)",
                object_text,
            )
            return float(field.group(1)) if field else 0.0

        record = {
            "date": string_field("date"),
            "type": string_field("type", "buy").lower(),
            "symbol": string_field("symbol").upper(),
            "shares": number_field("shares"),
            "price": number_field("price"),
        }

        if record["symbol"] and record["shares"] > 0 and record["price"] > 0:
            transactions.append(record)

    if not transactions:
        raise RuntimeError(
            "No valid transactions could be parsed from portfolio-data.js"
        )

    return transactions


def parse_history(path: Path) -> list[dict]:
    if not path.exists():
        return []

    text = path.read_text(encoding="utf-8")
    match = re.search(
        r"window\.gainLossHistory\s*=\s*\[(?P<body>[\s\S]*?)\]\s*;",
        text,
    )
    if not match:
        return []

    records: list[dict] = []

    for object_text in re.findall(r"\{([^{}]+)\}", match.group("body")):
        date_match = re.search(
            r"date\s*:\s*['\"]([^'\"]+)['\"]|"
            r"\"date\"\s*:\s*\"([^\"]+)\"",
            object_text,
        )
        gain_match = re.search(
            r"gainLoss\s*:\s*(-?\d+(?:\.\d+)?)|"
            r"\"gainLoss\"\s*:\s*(-?\d+(?:\.\d+)?)",
            object_text,
        )

        if not date_match or not gain_match:
            continue

        date = next(value for value in date_match.groups() if value is not None)
        gain = float(
            next(value for value in gain_match.groups() if value is not None)
        )
        records.append({"date": date, "gainLoss": gain})

    return records


def calculate_positions(transactions: list[dict]) -> dict[str, dict[str, float]]:
    positions: dict[str, dict[str, float]] = {}

    for transaction in transactions:
        symbol = transaction["symbol"]
        shares = float(transaction["shares"])
        price = float(transaction["price"])
        transaction_type = transaction["type"]

        position = positions.setdefault(
            symbol,
            {"shares": 0.0, "cost": 0.0},
        )

        if transaction_type == "sell":
            if position["shares"] <= 0:
                continue

            sold = min(shares, position["shares"])
            average_cost = position["cost"] / position["shares"]
            position["shares"] -= sold
            position["cost"] -= sold * average_cost

            if position["shares"] < 0.000001:
                position["shares"] = 0.0
                position["cost"] = 0.0
        else:
            position["shares"] += shares
            position["cost"] += shares * price

    return {
        symbol: position
        for symbol, position in positions.items()
        if position["shares"] > 0
    }


def get_current_price(symbol: str) -> float:
    query = urllib.parse.urlencode(
        {"symbol": symbol, "token": API_KEY}
    )
    url = f"https://finnhub.io/api/v1/quote?{query}"

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "portfolio-history-action/1.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    price = float(payload.get("c") or 0)

    if price <= 0:
        raise RuntimeError(
            f"Finnhub returned no valid current price for {symbol}: {payload}"
        )

    return price


def write_history(records: list[dict]) -> None:
    records.sort(key=lambda record: record["date"], reverse=True)

    content = (
        "// Shared gain/loss history. Updated automatically by GitHub Actions.\n"
        "// gainLoss is total unrealized portfolio gain/loss for the date.\n\n"
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

    transactions = parse_transactions(PORTFOLIO_FILE)
    positions = calculate_positions(transactions)

    if not positions:
        raise RuntimeError("No open positions were found.")

    total_cost = sum(position["cost"] for position in positions.values())
    total_value = 0.0

    for index, symbol in enumerate(sorted(positions)):
        price = get_current_price(symbol)
        total_value += positions[symbol]["shares"] * price
        print(f"{symbol}: {price}")

        if index < len(positions) - 1:
            time.sleep(1.1)

    gain_loss = round(total_value - total_cost, 2)
    record_date = datetime.now(NEW_YORK).date().isoformat()

    history = [
        record
        for record in parse_history(HISTORY_FILE)
        if record["date"] != record_date
    ]
    history.append(
        {
            "date": record_date,
            "gainLoss": gain_loss,
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
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
