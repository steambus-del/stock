const API_KEY = "d96p5f1r01qr77dldgf0d96p5f1r01qr77dldgfg";

let transactions = loadTransactions();
let portfolioChart = null;

const actionInput = document.getElementById("actionInput");
const symbolInput = document.getElementById("symbolInput");
const sharesInput = document.getElementById("sharesInput");
const priceInput = document.getElementById("priceInput");
const addButton = document.getElementById("addButton");
const portfolioBody = document.getElementById("portfolioBody");
const transactionBody = document.getElementById("transactionBody");
const totalCostCell = document.getElementById("totalCostCell");
const totalGainCell = document.getElementById("totalGainCell");
const totalGainPercentCell = document.getElementById("totalGainPercentCell");
const chartSummary = document.getElementById("chartSummary");
const portfolioChartCanvas = document.getElementById("portfolioChart");

Chart.register(ChartDataLabels);

addButton.addEventListener("click", addTransaction);

function loadTransactions() {
    const savedTransactions = JSON.parse(localStorage.getItem("transactions") || "null");

    if (Array.isArray(savedTransactions)) {
        return savedTransactions;
    }

    const oldPortfolio = JSON.parse(localStorage.getItem("portfolio") || "[]");

    if (Array.isArray(oldPortfolio) && oldPortfolio.length > 0) {
        const migrated = oldPortfolio.map(item => ({
            id: Date.now() + Math.random(),
            date: new Date().toLocaleString("zh-CN"),
            type: "buy",
            symbol: String(item.symbol || "").toUpperCase(),
            shares: Number(item.shares || 0),
            price: Number(item.cost || 0)
        })).filter(item => item.symbol && item.shares > 0 && item.price > 0);

        localStorage.setItem("transactions", JSON.stringify(migrated));
        return migrated;
    }

    return [];
}

function saveTransactions() {
    localStorage.setItem("transactions", JSON.stringify(transactions));
}

function formatMoney(value) {
    return "$" + Number(value).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    if (!Number.isFinite(Number(value))) return "-";
    return Number(value).toLocaleString("zh-CN", {
        maximumFractionDigits: 4
    });
}

function formatPercent(value) {
    if (!Number.isFinite(Number(value))) return "0.00%";
    const sign = value >= 0 ? "+" : "";
    return sign + Number(value).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + "%";
}

function formatChartLabel(gainValue, gainPercent) {
    const sign = gainValue >= 0 ? "+" : "-";
    const moneyText = sign + "$" + Math.abs(gainValue).toLocaleString("zh-CN", {
        maximumFractionDigits: 0
    });
    return moneyText + " (" + formatPercent(gainPercent) + ")";
}

function addTransaction() {
    const type = actionInput.value;
    const symbol = symbolInput.value.trim().toUpperCase();
    const shares = Number(sharesInput.value);
    const price = Number(priceInput.value);

    if (!symbol || shares <= 0 || price <= 0) {
        alert("请输入正确的股票代码、股数和交易价格。");
        return;
    }

    const currentPosition = calculatePositions()[symbol];
    const currentShares = currentPosition ? currentPosition.shares : 0;

    if (type === "sell" && shares > currentShares) {
        alert("卖出股数不能大于目前持股数量。");
        return;
    }

    transactions.push({
        id: Date.now() + Math.random(),
        date: new Date().toLocaleString("zh-CN"),
        type: type,
        symbol: symbol,
        shares: shares,
        price: price
    });

    saveTransactions();

    symbolInput.value = "";
    sharesInput.value = "";
    priceInput.value = "";

    loadPortfolio();
}

function calculatePositions() {
    const positions = {};

    transactions.forEach(tx => {
        if (!positions[tx.symbol]) {
            positions[tx.symbol] = {
                symbol: tx.symbol,
                shares: 0,
                costBasis: 0
            };
        }

        const position = positions[tx.symbol];

        if (tx.type === "buy") {
            position.shares += tx.shares;
            position.costBasis += tx.shares * tx.price;
        } else if (tx.type === "sell") {
            if (position.shares <= 0) return;

            const avgCost = position.costBasis / position.shares;
            const sellShares = Math.min(tx.shares, position.shares);

            position.shares -= sellShares;
            position.costBasis -= sellShares * avgCost;

            if (position.shares < 0.000001) {
                position.shares = 0;
                position.costBasis = 0;
            }
        }
    });

    Object.keys(positions).forEach(symbol => {
        if (positions[symbol].shares <= 0) {
            delete positions[symbol];
        }
    });

    return positions;
}

async function getQuote(symbol) {
    try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        return {
            currentPrice: Number(data.c) || 0,
            highPrice: Number(data.h) || 0,
            lowPrice: Number(data.l) || 0
        };
    } catch (error) {
        console.error("获取股票价格失败:", symbol, error);
        return {
            currentPrice: 0,
            highPrice: 0,
            lowPrice: 0
        };
    }
}

async function loadPortfolio() {
    portfolioBody.innerHTML = "";

    const positions = calculatePositions();

    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;

    const labels = [];
    const gains = [];
    const gainPercents = [];

    for (const symbol of Object.keys(positions).sort()) {
        const stock = positions[symbol];
        const quote = await getQuote(symbol);

        const currentPrice = quote.currentPrice;
        const marketValue = stock.shares * currentPrice;
        const costBasis = stock.costBasis;
        const avgCost = stock.shares > 0 ? costBasis / stock.shares : 0;
        const gainLoss = marketValue - costBasis;
        const gainPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

        totalValue += marketValue;
        totalCost += costBasis;
        totalGain += gainLoss;

        labels.push(symbol);
        gains.push(gainLoss);
        gainPercents.push(gainPercent);

        const gainClass = gainLoss >= 0 ? "gain" : "loss";
        const gainText = (gainLoss >= 0 ? "+" : "") + formatMoney(gainLoss);
        const priceRange = quote.lowPrice > 0 && quote.highPrice > 0
            ? formatMoney(quote.lowPrice) + " - " + formatMoney(quote.highPrice)
            : "-";

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${symbol}</td>
            <td>${formatNumber(stock.shares)}</td>
            <td>${formatMoney(avgCost)}</td>
            <td>${formatMoney(currentPrice)}</td>
            <td>${formatMoney(marketValue)}</td>
            <td>${formatMoney(costBasis)}</td>
            <td class="${gainClass}">${gainText}</td>
            <td class="${gainClass}">${formatPercent(gainPercent)}</td>
            <td>${priceRange}</td>
            <td>
                <button onclick="prefillBuy('${symbol}')">加仓</button>
                <button onclick="prefillSell('${symbol}')">减仓</button>
            </td>
        `;

        portfolioBody.appendChild(row);
    }

    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    totalCostCell.textContent = formatMoney(totalCost);

    totalGainCell.textContent = (totalGain >= 0 ? "+" : "") + formatMoney(totalGain);
    totalGainCell.className = totalGain >= 0 ? "gain" : "loss";

    totalGainPercentCell.textContent = formatPercent(totalGainPercent);
    totalGainPercentCell.className = totalGain >= 0 ? "gain" : "loss";

    chartSummary.textContent = "总投入：" + formatMoney(totalCost) + "　|　当前市值：" + formatMoney(totalValue) + "　|　总盈亏：" + (totalGain >= 0 ? "+" : "") + formatMoney(totalGain);

    drawChart(labels, gains, gainPercents);
    drawTransactions();
}

function drawTransactions() {
    transactionBody.innerHTML = "";

    [...transactions].reverse().forEach(tx => {
        const row = document.createElement("tr");
        const typeText = tx.type === "buy" ? "买入" : "卖出";
        const amount = tx.shares * tx.price;

        row.innerHTML = `
            <td>${tx.date}</td>
            <td>${typeText}</td>
            <td>${tx.symbol}</td>
            <td>${formatNumber(tx.shares)}</td>
            <td>${formatMoney(tx.price)}</td>
            <td>${formatMoney(amount)}</td>
            <td><button class="delete-btn" onclick="deleteTransaction(${tx.id})">删除</button></td>
        `;

        transactionBody.appendChild(row);
    });
}

function drawChart(labels, gains, gainPercents) {
    if (portfolioChart) {
        portfolioChart.destroy();
    }

    portfolioChart = new Chart(portfolioChartCanvas, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "盈亏",
                data: gains,
                gainPercents: gainPercents,
                backgroundColor: gains.map(value => value >= 0 ? "#16a34a" : "#dc2626"),
                borderColor: gains.map(value => value >= 0 ? "#15803d" : "#b91c1c"),
                borderWidth: 1,
                borderRadius: 5,
                barPercentage: 0.6,
                categoryPercentage: 0.75
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 28,
                    bottom: 8
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const gainPercent = context.dataset.gainPercents[context.dataIndex] || 0;
                            return "盈亏：" + formatMoney(context.raw) + " " + formatPercent(gainPercent);
                        }
                    }
                },
                datalabels: {
                    clamp: true,
                    clip: false,
                    anchor: "end",
                    align: "top",
                    offset: 6,
                    color: function(context) {
                        return context.dataset.data[context.dataIndex] >= 0 ? "#16a34a" : "#dc2626";
                    },
                    font: {
                        weight: "bold",
                        size: 11
                    },
                    formatter: function(value, context) {
                        const gainPercent = context.dataset.gainPercents[context.dataIndex] || 0;
                        return formatChartLabel(value, gainPercent);
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: "5%",
                    ticks: {
                        callback: function(value) {
                            return "$" + Intl.NumberFormat("en", {
                                notation: "compact"
                            }).format(value);
                        }
                    }
                }
            }
        }
    });
}

function prefillBuy(symbol) {
    actionInput.value = "buy";
    symbolInput.value = symbol;
    sharesInput.focus();
}

function prefillSell(symbol) {
    actionInput.value = "sell";
    symbolInput.value = symbol;
    sharesInput.focus();
}

function deleteTransaction(id) {
    if (!confirm("确定要删除这笔交易吗？")) return;

    transactions = transactions.filter(tx => tx.id !== id);
    saveTransactions();
    loadPortfolio();
}

loadPortfolio();
