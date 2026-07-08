// Public read-only portfolio data
// Edit this file to update what everyone sees on GitHub Pages.
//
// type:
//   "buy"  = 买入 / 增加持股
//   "sell" = 卖出 / 减少持股
//
// IMPORTANT:
// Use window.sharedTransactions so app.js can read the data.

window.sharedTransactions = [
    { date: "2026-07-01", type: "buy", symbol: "AAPL", shares: 10, price: 150 },
    { date: "2026-07-03", type: "buy", symbol: "AAPL", shares: 5, price: 175 },
    { date: "2026-07-05", type: "buy", symbol: "NVDA", shares: 3, price: 900 },
    { date: "2026-07-06", type: "sell", symbol: "AAPL", shares: 2, price: 190 }
];
