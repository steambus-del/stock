import json, os, re, time, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
KEY = os.environ["FINNHUB_API_KEY"]
NY = ZoneInfo("America/New_York")

def read_array(path, var):
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"window\\.{var}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;", text)
    if not m:
        raise RuntimeError(f"Missing window.{var}")
    return json.loads(re.sub(r"//.*", "", m.group(1)))

def positions(txs):
    p = {}
    for t in txs:
        s = str(t.get("symbol","")).upper()
        q = float(t.get("shares",0) or 0)
        price = float(t.get("price",0) or 0)
        if not s or q <= 0 or price <= 0:
            continue
        x = p.setdefault(s, {"shares":0.0,"cost":0.0})
        if t.get("type") == "sell":
            if x["shares"] <= 0:
                continue
            sold = min(q, x["shares"])
            avg = x["cost"] / x["shares"]
            x["shares"] -= sold
            x["cost"] -= sold * avg
        else:
            x["shares"] += q
            x["cost"] += q * price
    return {s:x for s,x in p.items() if x["shares"] > 0}

def quote(symbol):
    qs = urllib.parse.urlencode({"symbol":symbol,"token":KEY})
    with urllib.request.urlopen(f"https://finnhub.io/api/v1/quote?{qs}", timeout=30) as r:
        d = json.load(r)
    price = float(d.get("c") or 0)
    if price <= 0:
        raise RuntimeError(f"No valid price for {symbol}")
    return price

txs = read_array(ROOT / "portfolio-data.js", "sharedTransactions")
pos = positions(txs)
total_cost = sum(x["cost"] for x in pos.values())
total_value = 0.0
for i, symbol in enumerate(sorted(pos)):
    total_value += pos[symbol]["shares"] * quote(symbol)
    if i < len(pos)-1:
        time.sleep(1.1)

gain = round(total_value - total_cost, 2)
today = datetime.now(NY).date().isoformat()
history_file = ROOT / "gain-loss-history.js"
try:
    history = read_array(history_file, "gainLossHistory")
except Exception:
    history = []

history = [r for r in history if str(r.get("date","")) != today]
history.append({"date": today, "gainLoss": gain})
history.sort(key=lambda r: r["date"], reverse=True)

history_file.write_text(
    "// Shared gain/loss history. Updated automatically by GitHub Actions.\n"
    "window.gainLossHistory = " + json.dumps(history, indent=2) + ";\n",
    encoding="utf-8"
)
print({"date":today,"gainLoss":gain})
