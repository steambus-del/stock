# 股票投资组合 V5.0 Fixed

This version is rebuilt from the uploaded files so the HTML and JavaScript match.

## Included
- Stock holdings table
- Sortable stock columns
- Gain/loss bar chart
- Sortable chart
- Buy/sell history with 10 records per page
- Compact page layout
- Numeric daily price range

## Removed
- Daily portfolio movement section
- Daily movement pagination
- Earnings date
- EPS Beat
- Revenue Beat
- All leftover JavaScript references to removed elements

## Update holdings
Edit `portfolio-data.js`.


## V5.3 Update

- 每日价格变动 sorting now uses percentage change instead of dollar change.
- Added 股票持仓占比 pie chart before 买卖记录.
- Pie chart allocation is based on current market value.
- Tooltip shows market value and portfolio percentage.


## V5.3.2 Color Enhancements
- Pie labels use white text with a black outline and are positioned closer to the outer edge.
- 当前市值 and 总盈亏 are green when current value is above total invested, red when below.
- 买入 is green and 卖出 is red in the transaction table.


## V5.3.4 Update

- Restored gain/loss labels to the top of every bar in 投资盈亏图.
- Bar labels use `anchor: end`, `align: top`, and `offset: 6`.
- Moved pie-chart ticker labels about 10% farther toward the outer edge.
- Pie labels remain inside the slices and keep the white text with black outline.


## V5.3.5 Update

- Moved pie-chart ticker labels about 30% farther outward.
- Labels remain inside the pie slices.
- White bold text and black outline are preserved.
- Bar-chart labels remain above each bar.

## V5.3.6
- Added 盈亏历史 to the right of 股票持仓占比.
- Added gain-loss-history.js.
- Shows 日期 and 盈利 / 亏损.
- Green for gains, red for losses.
- 10 records per page.


## V5.3.7 Daily Gain/Loss

- Added 每日盈亏 column to 盈亏历史.
- 每日盈亏 = current record gain/loss minus the previous chronological record.
- Positive daily change is green.
- Negative daily change is red.
- The oldest available record shows `--` because there is no earlier record to compare.


## V5.3.8 History Color Fix

- 盈利 / 亏损 is explicitly green when positive and red when negative.
- 每日盈亏 is explicitly green when positive and red when negative.
- Added dedicated CSS classes with `!important` to prevent color overrides.


## V5.3.9 Layout Update

- Moved 盈亏历史 to the left side.
- Moved 股票持仓占比 to the right side.
- Desktop layout uses approximately 40% history / 60% pie chart.
- Mobile layout still stacks vertically.
