const API_KEY = "d96p5f1r01qr77dldgf0d96p5f1r01qr77dldgfg";

const transactions = Array.isArray(window.sharedTransactions)
    ? window.sharedTransactions.map(tx => ({
        date: tx.date || "",
        type: tx.type === "sell" ? "sell" : "buy",
        symbol: String(tx.symbol || "").toUpperCase(),
        shares: Number(tx.shares || 0),
        price: Number(tx.price || 0)
    })).filter(tx => tx.symbol && tx.shares > 0 && tx.price > 0)
    : [];

const savedSnapshots = Array.isArray(window.dailySnapshots)
    ? window.dailySnapshots.map(row => ({
        date: row.date || "",
        totalUnrealizedGain: Number(row.totalUnrealizedGain || 0),
        totalCost: Number(row.totalCost || 0),
        note: row.note || "手动记录"
    })).filter(row => row.date)
    : [];

let portfolioChart = null;
let portfolioRows = [];
let dailyMovementRows = [];

let tableSortKey = "symbol";
let tableSortDirection = "asc";
let dailyPage = 1;
let transactionPage = 1;

const PAGE_SIZE = 10;

const portfolioBody = document.getElementById("portfolioBody");
const transactionBody = document.getElementById("transactionBody");
const dailyMovementBody = document.getElementById("dailyMovementBody");

const totalValueCell = document.getElementById("totalValueCell");
const totalCostCell = document.getElementById("totalCostCell");
const totalGainCell = document.getElementById("totalGainCell");
const totalGainPercentCell = document.getElementById("totalGainPercentCell");
const chartSummary = document.getElementById("chartSummary");
const portfolioChartCanvas = document.getElementById("portfolioChart");
const chartSortSelect = document.getElementById("chartSortSelect");

const dailyPrevButton = document.getElementById("dailyPrevButton");
const dailyNextButton = document.getElementById("dailyNextButton");
const dailyPageInfo = document.getElementById("dailyPageInfo");

const txPrevButton = document.getElementById("txPrevButton");
const txNextButton = document.getElementById("txNextButton");
const txPageInfo = document.getElementById("txPageInfo");

if (window.Chart && window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
}

document.querySelectorAll(".sort-header").forEach(button => {
    button.addEventListener("click", () => {
        const key = button.dataset.sortKey;

        if (tableSortKey === key) {
            tableSortDirection = tableSortDirection === "asc" ? "desc" : "asc";
        } else {
            tableSortKey = key;
            tableSortDirection = key === "symbol" ? "asc" : "desc";
        }

        drawPortfolioTable();
    });
});

if (chartSortSelect) {
    chartSortSelect.addEventListener("change", () => {
        drawChartFromCurrentRows();
    });
}

dailyPrevButton.addEventListener("click", () => {
    if (dailyPage > 1) {
        dailyPage--;
        drawDailyMovementTable();
    }
});

dailyNextButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(dailyMovementRows.length / PAGE_SIZE));
    if (dailyPage < totalPages) {
        dailyPage++;
        drawDailyMovementTable();
    }
});

txPrevButton.addEventListener("click", () => {
    if (transactionPage > 1) {
        transactionPage--;
        drawTransactions();
    }
});

txNextButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
    if (transactionPage < totalPages) {
        transactionPage++;
        drawTransactions();
    }
});

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

function todayString() {
    return new Date().toLocaleDateString("en-CA");
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
            lowPrice: Number(data.l) || 0,
            dailyChange: Number(data.d) || 0,
            dailyChangePercent: Number(data.dp) || 0
        };
    } catch (error) {
        console.error("获取股票价格失败:", symbol, error);
        return {
            currentPrice: 0,
            highPrice: 0,
            lowPrice: 0,
            dailyChange: 0,
            dailyChangePercent: 0
        };
    }
}

async function loadPortfolio() {
    portfolioRows = [];

    const positions = calculatePositions();

    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;

    for (const symbol of Object.keys(positions)) {
        const stock = positions[symbol];
        const quote = await getQuote(symbol);

        const currentPrice = quote.currentPrice;
        const marketValue = stock.shares * currentPrice;
        const costBasis = stock.costBasis;
        const avgCost = stock.shares > 0 ? costBasis / stock.shares : 0;
        const gainLoss = marketValue - costBasis;
        const gainPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
        const priceRange = quote.lowPrice > 0 && quote.highPrice > 0
            ? formatMoney(quote.lowPrice) + " - " + formatMoney(quote.highPrice)
            : "-";

        totalValue += marketValue;
        totalCost += costBasis;
        totalGain += gainLoss;

        portfolioRows.push({
            symbol,
            shares: stock.shares,
            avgCost,
            currentPrice,
            dailyChange: Number(quote.dailyChange) || 0,
            dailyChangePercent: Number(quote.dailyChangePercent) || 0,
            marketValue,
            costBasis,
            gainLoss,
            gainPercent,
            priceRange
        });
    }

    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    totalValueCell.textContent = formatMoney(totalValue);
    totalCostCell.textContent = formatMoney(totalCost);

    totalGainCell.textContent = (totalGain >= 0 ? "+" : "") + formatMoney(totalGain);
    totalGainCell.className = totalGain >= 0 ? "gain" : "loss";

    totalGainPercentCell.textContent = formatPercent(totalGainPercent);
    totalGainPercentCell.className = totalGain >= 0 ? "gain" : "loss";

    chartSummary.textContent =
        "总投入：" + formatMoney(totalCost) +
        "　|　当前市值：" + formatMoney(totalValue) +
        "　|　总盈亏：" + (totalGain >= 0 ? "+" : "") + formatMoney(totalGain) +
        " (" + formatPercent(totalGainPercent) + ")";

    buildDailyMovement(totalGain, totalCost);

    drawPortfolioTable();
    drawChartFromCurrentRows();
    drawDailyMovementTable();
    drawTransactions();
}

function compareRows(a, b, key) {
    if (key === "symbol") {
        return String(a.symbol).localeCompare(String(b.symbol));
    }

    return Number(a[key] || 0) - Number(b[key] || 0);
}

function drawPortfolioTable() {
    portfolioBody.innerHTML = "";

    document.querySelectorAll(".sort-header").forEach(button => {
        button.classList.remove("active-sort", "desc");
        if (button.dataset.sortKey === tableSortKey) {
            button.classList.add("active-sort");
            if (tableSortDirection === "desc") {
                button.classList.add("desc");
            }
        }
    });

    const sortedRows = [...portfolioRows].sort((a, b) => {
        const result = compareRows(a, b, tableSortKey);
        return tableSortDirection === "asc" ? result : -result;
    });

    sortedRows.forEach(item => {
        const row = document.createElement("tr");
        const gainClass = item.gainLoss >= 0 ? "gain" : "loss";
        const dailyClass = item.dailyChange > 0 ? "gain" : (item.dailyChange < 0 ? "loss" : "");

        row.innerHTML = `
            <td>${item.symbol}</td>
            <td>${formatNumber(item.shares)}</td>
            <td>${formatMoney(item.avgCost)}</td>
            <td>${formatMoney(item.currentPrice)}</td>
            <td class="${dailyClass}">${item.dailyChange > 0 ? "+" : ""}${formatMoney(item.dailyChange)} (${formatPercent(item.dailyChangePercent)})</td>
            <td>${formatMoney(item.marketValue)}</td>
            <td>${formatMoney(item.costBasis)}</td>
            <td class="${gainClass}">${item.gainLoss >= 0 ? "+" : ""}${formatMoney(item.gainLoss)}</td>
            <td class="${gainClass}">${formatPercent(item.gainPercent)}</td>
            <td>${item.priceRange}</td>
        `;

        portfolioBody.appendChild(row);
    });
}

function getSortedChartRows() {
    if (!chartSortSelect) {
        return [...portfolioRows].sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    const [key, direction] = chartSortSelect.value.split(":");

    return [...portfolioRows].sort((a, b) => {
        const result = compareRows(a, b, key);
        return direction === "asc" ? result : -result;
    });
}

function drawChartFromCurrentRows() {
    const rows = getSortedChartRows();
    drawChart(
        rows.map(row => row.symbol),
        rows.map(row => row.gainLoss),
        rows.map(row => row.gainPercent)
    );
}

function buildDailyMovement(todayTotalUnrealizedGain, todayTotalCost) {
    const sortedSnapshots = [...savedSnapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const previousSnapshot = sortedSnapshots.length > 0 ? sortedSnapshots[0] : null;
    const previousGain = previousSnapshot ? previousSnapshot.totalUnrealizedGain : 0;
    const previousCost = previousSnapshot && previousSnapshot.totalCost > 0 ? previousSnapshot.totalCost : todayTotalCost;

    const todayMovement = todayTotalUnrealizedGain - previousGain;
    const todayMovementPercent = previousCost > 0 ? (todayMovement / previousCost) * 100 : 0;

    dailyMovementRows = [
        {
            date: todayString(),
            movement: todayMovement,
            percent: todayMovementPercent,
            currentGain: todayTotalUnrealizedGain,
            previousGain: previousGain,
            note: previousSnapshot
                ? "自动计算：今日总未实现盈亏 − " + previousSnapshot.date + " 总未实现盈亏"
                : "自动计算：没有前一日快照，默认以前一日盈亏 $0.00 比较"
        }
    ];

    for (let i = 0; i < sortedSnapshots.length; i++) {
        const current = sortedSnapshots[i];
        const previous = sortedSnapshots[i + 1];

        const compareGain = previous ? previous.totalUnrealizedGain : 0;
        const compareCost = previous && previous.totalCost > 0 ? previous.totalCost : current.totalCost;

        const movement = current.totalUnrealizedGain - compareGain;
        const percent = compareCost > 0 ? (movement / compareCost) * 100 : 0;

        dailyMovementRows.push({
            date: current.date,
            movement: movement,
            percent: percent,
            currentGain: current.totalUnrealizedGain,
            previousGain: compareGain,
            note: current.note || "历史快照计算"
        });
    }
}

function drawDailyMovementTable() {
    dailyMovementBody.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(dailyMovementRows.length / PAGE_SIZE));
    dailyPage = Math.min(Math.max(dailyPage, 1), totalPages);

    const start = (dailyPage - 1) * PAGE_SIZE;
    const rows = dailyMovementRows.slice(start, start + PAGE_SIZE);

    rows.forEach(rowData => {
        const row = document.createElement("tr");
        const gainClass = rowData.movement >= 0 ? "gain" : "loss";
        const movementText = (rowData.movement >= 0 ? "+" : "") + formatMoney(rowData.movement);

        row.innerHTML = `
            <td>${rowData.date}</td>
            <td class="${gainClass}">${movementText}</td>
            <td class="${gainClass}">${formatPercent(rowData.percent)}</td>
            <td>${formatMoney(rowData.currentGain)}</td>
            <td>${formatMoney(rowData.previousGain)}</td>
            <td>${rowData.note}</td>
        `;

        dailyMovementBody.appendChild(row);
    });

    dailyPageInfo.textContent = `第 ${dailyPage} 页 / 共 ${totalPages} 页`;
    dailyPrevButton.disabled = dailyPage <= 1;
    dailyNextButton.disabled = dailyPage >= totalPages;
}

function drawTransactions() {
    transactionBody.innerHTML = "";

    const sortedTransactions = [...transactions].reverse();
    const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / PAGE_SIZE));
    transactionPage = Math.min(Math.max(transactionPage, 1), totalPages);

    const start = (transactionPage - 1) * PAGE_SIZE;
    const rows = sortedTransactions.slice(start, start + PAGE_SIZE);

    rows.forEach(tx => {
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
        `;

        transactionBody.appendChild(row);
    });

    txPageInfo.textContent = `第 ${transactionPage} 页 / 共 ${totalPages} 页`;
    txPrevButton.disabled = transactionPage <= 1;
    txNextButton.disabled = transactionPage >= totalPages;
}

function drawChart(labels, gains, gainPercents) {
    if (!window.Chart) return;

    if (portfolioChart) {
        portfolioChart.destroy();
    }

    const pluginsConfig = {
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
        }
    };

    if (window.ChartDataLabels) {
        pluginsConfig.datalabels = {
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
        };
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
            plugins: pluginsConfig,
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

loadPortfolio();
