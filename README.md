# 公开只读股票投资组合

这是适合 GitHub Pages 使用的公开只读版本。

## 如何更新你的投资组合

打开 `portfolio-data.js`，编辑里面的 `window.sharedTransactions`。

例子：

```js
window.sharedTransactions = [
    { date: "2026-07-01", type: "buy", symbol: "AAPL", shares: 10, price: 150 },
    { date: "2026-07-06", type: "sell", symbol: "AAPL", shares: 2, price: 190 }
];
```

保存后上传到 GitHub。所有访问你 GitHub Pages 网站的人都会看到同一个公开投资组合。

## 注意

这个版本是公开只读版本：
- 访客不能修改持仓。
- 投资组合数据是公开的。
- Finnhub API key 在浏览器中可见。
