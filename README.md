# stock-portfolio-public-readonly-v3.0

Public read-only GitHub Pages stock portfolio tracker.

## Files

- `index.html`
- `style.css`
- `portfolio-data.js`
- `daily-history.js`
- `app.js`

## How to update holdings

Edit `portfolio-data.js`.

## How to update daily movement history

At the end of a trading day, copy your current total unrealized gain into `daily-history.js`:

```js
window.dailySnapshots = [
    { date: "2026-07-09", totalUnrealizedGain: 500.00, totalCost: 5000.00, note: "手动记录" }
];
```

The site calculates:

Daily Movement = Current total unrealized gain - previous snapshot total unrealized gain.

## Notes

GitHub Pages is static, so it cannot automatically save daily snapshots. You update `daily-history.js` manually.


## V3.1 Update

- Added `每日价格变动` column after `最新价格`.
- Shows daily dollar change and percentage change from Finnhub quote data.

- V3.1.1: 每日价格变动按涨跌着色（绿色=上涨，红色=下跌）。

## V3.1.2 Update

- Fixed empty 每日价格变动 cells causing table columns to shift.
- 每日价格变动 now always displays a value, including $0.00 (0.00%).


## V3.1.3 Update

- Added total 市值 to the 总盈亏 footer row under the 市值 column.


## V3.1.4 Update

- Fixed 总盈亏 footer alignment after adding 每日价格变动 column.


## V3.3 Update

- Rebuilt sorting logic.
- Stock table headers are clickable and sortable.
- Bar chart sorting dropdown works independently.
