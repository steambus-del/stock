const API_KEY = "d96p5f1r01qr77dldgf0d96p5f1r01qr77dldgfg";

const transactions = Array.isArray(window.sharedTransactions)
    ? window.sharedTransactions
        .map(tx => ({
            date: tx.date || "",
            type: tx.type === "sell" ? "sell" : "buy",
            symbol: String(tx.symbol || "").trim().toUpperCase(),
            shares: Number(tx.shares || 0),
            price: Number(tx.price || 0)
        }))
        .filter(tx => tx.symbol && tx.shares > 0 && tx.price > 0)
    : [];

let portfolioRows = [];
let portfolioChart = null;
let ownershipPieChart = null;
let transactionPage = 1;
let gainLossHistoryPage = 1;

let tableSortKey = "gainLoss";
let tableSortDirection = "desc";

const PAGE_SIZE = 10;

const $ = id => document.getElementById(id);

const portfolioBody = $("portfolioBody");
const transactionBody = $("transactionBody");
const gainLossHistoryBody = $("gainLossHistoryBody");

const totalValueCell = $("totalValueCell");
const totalCostCell = $("totalCostCell");
const totalGainCell = $("totalGainCell");
const totalGainPercentCell = $("totalGainPercentCell");

const chartSummary = $("chartSummary");
const chartSortSelect = $("chartSortSelect");
const portfolioChartCanvas = $("portfolioChart");
const ownershipPieCanvas = $("ownershipPieChart");

const txPrevButton = $("txPrevButton");
const txNextButton = $("txNextButton");
const txPageInfo = $("txPageInfo");
const historyPrevButton = $("historyPrevButton");
const historyNextButton = $("historyNextButton");
const historyPageInfo = $("historyPageInfo");
const gainLossHistoryRecords = Array.isArray(window.gainLossHistory)
    ? window.gainLossHistory
        .map(r => ({date:String(r.date||""), gainLoss:Number(r.gainLoss||0)}))
        .filter(r => r.date)
        .sort((a,b) => b.date.localeCompare(a.date))
    : [];

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
    chartSortSelect.addEventListener("change", drawChartFromCurrentRows);
}


if (historyPrevButton) {
  historyPrevButton.addEventListener("click", () => {
    if (gainLossHistoryPage > 1) {
      gainLossHistoryPage--;
      drawGainLossHistory();
    }
  });
}
if (historyNextButton) {
  historyNextButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(gainLossHistoryRecords.length / PAGE_SIZE));
    if (gainLossHistoryPage < totalPages) {
      gainLossHistoryPage++;
      drawGainLossHistory();
    }
  });
}

if (txPrevButton) {
    txPrevButton.addEventListener("click", () => {
        if (transactionPage > 1) {
            transactionPage--;
            drawTransactions();
        }
    });
}

if (txNextButton) {
    txNextButton.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));

        if (transactionPage < totalPages) {
            transactionPage++;
            drawTransactions();
        }
    });
}

function formatMoney(value) {
    return "$" + Number(value || 0).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "-";
    }

    return number.toLocaleString("zh-CN", {
        maximumFractionDigits: 4
    });
}

function formatPercent(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0.00%";
    }

    return (number >= 0 ? "+" : "") + number.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + "%";
}

function formatChartLabel(gainValue, gainPercent) {
    const sign = gainValue >= 0 ? "+" : "-";

    return sign + "$" + Math.abs(gainValue).toLocaleString("zh-CN", {
        maximumFractionDigits: 0
    }) + " (" + formatPercent(gainPercent) + ")";
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
            return;
        }

        if (position.shares <= 0) {
            return;
        }

        const averageCost = position.costBasis / position.shares;
        const sellShares = Math.min(tx.shares, position.shares);

        position.shares -= sellShares;
        position.costBasis -= sellShares * averageCost;

        if (position.shares < 0.000001) {
            position.shares = 0;
            position.costBasis = 0;
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
        const url =
            "https://finnhub.io/api/v1/quote?symbol=" +
            encodeURIComponent(symbol) +
            "&token=" +
            encodeURIComponent(API_KEY);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

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

    const symbols = Object.keys(positions);

    const quoteResults = await Promise.all(
        symbols.map(async symbol => ({
            symbol,
            quote: await getQuote(symbol)
        }))
    );

    quoteResults.forEach(({ symbol, quote }) => {
        const stock = positions[symbol];

        const currentPrice = quote.currentPrice;
        const marketValue = stock.shares * currentPrice;
        const costBasis = stock.costBasis;
        const averageCost = stock.shares > 0 ? costBasis / stock.shares : 0;
        const gainLoss = marketValue - costBasis;
        const gainPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

        totalValue += marketValue;
        totalCost += costBasis;
        totalGain += gainLoss;

        portfolioRows.push({
            symbol,
            shares: stock.shares,
            avgCost: averageCost,
            currentPrice,
            dailyChange: quote.dailyChange,
            dailyChangePercent: quote.dailyChangePercent,
            marketValue,
            costBasis,
            gainLoss,
            gainPercent,
            priceRange:
                quote.lowPrice > 0 && quote.highPrice > 0
                    ? formatMoney(quote.lowPrice) + " - " + formatMoney(quote.highPrice)
                    : "--"
        });
    });

    const totalGainPercent =
        totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    totalValueCell.textContent = formatMoney(totalValue);
    totalCostCell.textContent = formatMoney(totalCost);

    totalGainCell.textContent =
        (totalGain >= 0 ? "+" : "") + formatMoney(totalGain);
    totalGainCell.className = totalGain >= 0 ? "gain" : "loss";

    totalGainPercentCell.textContent = formatPercent(totalGainPercent);
    totalGainPercentCell.className = totalGain >= 0 ? "gain" : "loss";

    const overallClass = totalValue >= totalCost ? "gain" : "loss";
    chartSummary.innerHTML =
        "总投入：" +
        formatMoney(totalCost) +
        '　|　<span class="' + overallClass + '">当前市值：' +
        formatMoney(totalValue) +
        '</span>　|　<span class="' + overallClass + '">总盈亏：' +
        (totalGain >= 0 ? "+" : "") +
        formatMoney(totalGain) +
        " (" +
        formatPercent(totalGainPercent) +
        ")</span>";

    drawPortfolioTable();
    drawChartFromCurrentRows();
    drawOwnershipPieChart();
    drawGainLossHistory();
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

    sortedRows.forEach(stock => {
        const gainClass = stock.gainLoss >= 0 ? "gain" : "loss";
        const dailyClass =
            stock.dailyChange > 0
                ? "gain"
                : stock.dailyChange < 0
                    ? "loss"
                    : "";

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${stock.symbol}</td>
            <td>${formatNumber(stock.shares)}</td>
            <td>${formatMoney(stock.avgCost)}</td>
            <td>${formatMoney(stock.currentPrice)}</td>
            <td class="${dailyClass}">
                ${stock.dailyChange > 0 ? "+" : ""}${formatMoney(stock.dailyChange)}
                (${formatPercent(stock.dailyChangePercent)})
            </td>
            <td>${formatMoney(stock.marketValue)}</td>
            <td>${formatMoney(stock.costBasis)}</td>
            <td class="${gainClass}">
                ${stock.gainLoss >= 0 ? "+" : ""}${formatMoney(stock.gainLoss)}
            </td>
            <td class="${gainClass}">${formatPercent(stock.gainPercent)}</td>
            <td>${stock.priceRange}</td>
        `;

        portfolioBody.appendChild(row);
    });
}

function getSortedChartRows() {
    const selectedValue = chartSortSelect
        ? chartSortSelect.value
        : "gainLoss:desc";

    const [key, direction] = selectedValue.split(":");

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


function drawOwnershipPieChart() {
    if (!window.Chart || !ownershipPieCanvas) {
        return;
    }

    if (ownershipPieChart) {
        ownershipPieChart.destroy();
    }

    const validRows = portfolioRows.filter(row => row.marketValue > 0);
    const totalMarketValue = validRows.reduce(
        (sum, row) => sum + row.marketValue,
        0
    );

    ownershipPieChart = new Chart(ownershipPieCanvas, {
        type: "pie",
        data: {
            labels: validRows.map(row => row.symbol),
            datasets: [
                {
                    data: validRows.map(row => row.marketValue)
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        boxWidth: 14,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = Number(context.raw || 0);
                            const percentage =
                                totalMarketValue > 0
                                    ? (value / totalMarketValue) * 100
                                    : 0;

                            return (
                                context.label +
                                "：" +
                                formatMoney(value) +
                                " (" +
                                percentage.toFixed(2) +
                                "%)"
                            );
                        }
                    }
                },
                datalabels: {
                    color: "#ffffff",
                    textStrokeColor: "#000000",
                    textStrokeWidth: 3,
                    anchor: "center",
                    align: "center",
                    offset: 10,
                    clamp: true,
                    clip: false,
                    font: {
                        weight: "bold",
                        size: 12
                    },
                    formatter(value, context) {
                        if (totalMarketValue <= 0) {
                            return "";
                        }

                        const percentage =
                            (Number(value) / totalMarketValue) * 100;

                        return percentage >= 3
                            ? context.chart.data.labels[context.dataIndex] +
                                "\n" +
                                percentage.toFixed(1) +
                                "%"
                            : "";
                    }
                }
            }
        }
    });
}


function drawGainLossHistory() {
    if (!gainLossHistoryBody) return;
    gainLossHistoryBody.innerHTML = "";

    const totalPages = Math.max(
        1,
        Math.ceil(gainLossHistoryRecords.length / PAGE_SIZE)
    );

    gainLossHistoryPage = Math.min(
        Math.max(gainLossHistoryPage, 1),
        totalPages
    );

    const startIndex = (gainLossHistoryPage - 1) * PAGE_SIZE;
    const records = gainLossHistoryRecords.slice(
        startIndex,
        startIndex + PAGE_SIZE
    );

    if (!records.length) {
        const row = document.createElement("tr");
        row.innerHTML =
            '<td colspan="3" class="empty-history">暂无盈亏历史记录</td>';
        gainLossHistoryBody.appendChild(row);
    } else {
        records.forEach((record, pageIndex) => {
            const globalIndex = startIndex + pageIndex;

            // Records are sorted newest first.
            // The next item in the array is the previous chronological day.
            const previousRecord =
                gainLossHistoryRecords[globalIndex + 1] || null;

            const dailyGainLoss = previousRecord
                ? record.gainLoss - previousRecord.gainLoss
                : null;

            const totalClass =
                record.gainLoss > 0
                    ? "history-gain"
                    : record.gainLoss < 0
                        ? "history-loss"
                        : "history-neutral";

            const dailyClass =
                dailyGainLoss === null
                    ? "history-neutral"
                    : dailyGainLoss > 0
                        ? "history-gain"
                        : dailyGainLoss < 0
                            ? "history-loss"
                            : "history-neutral";

            const dailyDisplay =
                dailyGainLoss === null
                    ? "--"
                    : (dailyGainLoss > 0 ? "+" : "") +
                      formatMoney(dailyGainLoss);

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${record.date}</td>
                <td class="${totalClass}">
                    ${record.gainLoss > 0 ? "+" : ""}${formatMoney(record.gainLoss)}
                </td>
                <td class="${dailyClass}">
                    ${dailyDisplay}
                </td>
            `;

            gainLossHistoryBody.appendChild(row);
        });
    }

    if (historyPageInfo) {
        historyPageInfo.textContent =
            `第 ${gainLossHistoryPage} 页 / 共 ${totalPages} 页`;
    }

    if (historyPrevButton) {
        historyPrevButton.disabled = gainLossHistoryPage <= 1;
    }

    if (historyNextButton) {
        historyNextButton.disabled = gainLossHistoryPage >= totalPages;
    }
}

function drawTransactions() {
    transactionBody.innerHTML = "";

    const sortedTransactions = [...transactions].reverse();
    const totalPages = Math.max(
        1,
        Math.ceil(sortedTransactions.length / PAGE_SIZE)
    );

    transactionPage = Math.min(
        Math.max(transactionPage, 1),
        totalPages
    );

    const start = (transactionPage - 1) * PAGE_SIZE;
    const rows = sortedTransactions.slice(start, start + PAGE_SIZE);

    rows.forEach(tx => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${tx.date}</td>
            <td class="${tx.type === "buy" ? "buy-action" : "sell-action"}">${tx.type === "buy" ? "买入" : "卖出"}</td>
            <td>${tx.symbol}</td>
            <td>${formatNumber(tx.shares)}</td>
            <td>${formatMoney(tx.price)}</td>
            <td>${formatMoney(tx.shares * tx.price)}</td>
        `;

        transactionBody.appendChild(row);
    });

    txPageInfo.textContent =
        `第 ${transactionPage} 页 / 共 ${totalPages} 页`;

    txPrevButton.disabled = transactionPage <= 1;
    txNextButton.disabled = transactionPage >= totalPages;
}

function drawChart(labels, gains, gainPercents) {
    if (!window.Chart) {
        return;
    }

    if (portfolioChart) {
        portfolioChart.destroy();
    }

    const plugins = {
        legend: {
            display: false
        },
        tooltip: {
            callbacks: {
                label(context) {
                    const gainPercent =
                        context.dataset.gainPercents[context.dataIndex] || 0;

                    return (
                        "盈亏：" +
                        formatMoney(context.raw) +
                        " " +
                        formatPercent(gainPercent)
                    );
                }
            }
        }
    };

    if (window.ChartDataLabels) {
        plugins.datalabels = {
            clamp: true,
            clip: false,
            anchor: "end",
            align: "top",
            offset: 6,
            color(context) {
                return context.dataset.data[context.dataIndex] >= 0
                    ? "#16a34a"
                    : "#dc2626";
            },
            font: {
                weight: "bold",
                size: 11
            },
            formatter(value, context) {
                const gainPercent =
                    context.dataset.gainPercents[context.dataIndex] || 0;

                return formatChartLabel(value, gainPercent);
            }
        };
    }

    portfolioChart = new Chart(portfolioChartCanvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "盈亏",
                    data: gains,
                    gainPercents,
                    backgroundColor: gains.map(value =>
                        value >= 0 ? "#16a34a" : "#dc2626"
                    ),
                    borderColor: gains.map(value =>
                        value >= 0 ? "#15803d" : "#b91c1c"
                    ),
                    borderWidth: 1,
                    borderRadius: 5,
                    barPercentage: 0.6,
                    categoryPercentage: 0.75
                }
            ]
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
            plugins,
            scales: {
                y: {
                    beginAtZero: true,
                    grace: "5%",
                    ticks: {
                        callback(value) {
                            return (
                                "$" +
                                Intl.NumberFormat("en", {
                                    notation: "compact"
                                }).format(value)
                            );
                        }
                    }
                }
            }
        }
    });
}

loadPortfolio();
