# stock-portfolio-public-readonly-v4.0

Clean rebuilt public read-only GitHub Pages portfolio tracker.

## Included
- Sortable stock table
- Sortable bar chart
- Default sort by 盈亏 high to low
- Daily price change column
- Earnings date column
- EPS Beat column
- Revenue Beat column
- Daily movement table with pagination
- Buy/sell history with pagination
- Total 市值 / 总成本 / 总盈亏 footer

## Edit holdings
Update `portfolio-data.js`.

## Edit daily movement history
Update `daily-history.js`.

## Note
Finnhub free/API availability may affect earnings and beat/miss data. If data is unavailable, the table shows `--`.


## V4.0.1 Fix

- Fixed EPS Beat and Revenue Beat showing false `-100%`.
- Missing/null earnings values now display `--`.
- Earnings date still uses upcoming earnings.
- EPS/Revenue beat now attempts to use the most recent reported earnings data instead of upcoming unreleased earnings.


## V4.2 Update

- Replaced 今日价格范围 numeric text with a graphical mini range bar.
- Left label = today's low.
- Right label = today's high.
- Black marker = current price position in today's range.


V4.3: Compact price range indicator.


## V4.3.1 Fix

- Fixed 今日价格范围 still displaying as `number - number`.
- The stock table now renders a compact graphical range bar directly.
- Low price is shown on the left.
- High price is shown on the right.
- Black marker shows current price position in today's range.


## V4.4 Volume Update

- Removed EPS Beat and Revenue Beat columns.
- Added 今日成交量 column.
- Added 10日平均成交量 column.
- Volume data is fetched from Finnhub daily candle data.
- 今日价格范围 remains the compact graphical display.
