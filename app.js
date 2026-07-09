const API_KEY="d96p5f1r01qr77dldgf0d96p5f1r01qr77dldgfg";
const transactions=Array.isArray(window.sharedTransactions)?window.sharedTransactions.map(tx=>({date:tx.date||"",type:tx.type==="sell"?"sell":"buy",symbol:String(tx.symbol||"").toUpperCase(),shares:Number(tx.shares||0),price:Number(tx.price||0)})).filter(tx=>tx.symbol&&tx.shares>0&&tx.price>0):[];
const savedSnapshots=Array.isArray(window.dailySnapshots)?window.dailySnapshots.map(r=>({date:r.date||"",totalUnrealizedGain:Number(r.totalUnrealizedGain||0),totalCost:Number(r.totalCost||0),note:r.note||"手动记录"})).filter(r=>r.date):[];

let portfolioChart=null,portfolioRows=[],dailyMovementRows=[];
let tableSortKey="gainLoss",tableSortDirection="desc",dailyPage=1,transactionPage=1;
const PAGE_SIZE=10;

const $=id=>document.getElementById(id);
const portfolioBody=$("portfolioBody"),transactionBody=$("transactionBody"),dailyMovementBody=$("dailyMovementBody");
const totalValueCell=$("totalValueCell"),totalCostCell=$("totalCostCell"),totalGainCell=$("totalGainCell"),totalGainPercentCell=$("totalGainPercentCell");
const chartSummary=$("chartSummary"),portfolioChartCanvas=$("portfolioChart"),chartSortSelect=$("chartSortSelect");
const dailyPrevButton=$("dailyPrevButton"),dailyNextButton=$("dailyNextButton"),dailyPageInfo=$("dailyPageInfo"),txPrevButton=$("txPrevButton"),txNextButton=$("txNextButton"),txPageInfo=$("txPageInfo");

if(window.Chart&&window.ChartDataLabels)Chart.register(ChartDataLabels);

document.querySelectorAll(".sort-header").forEach(btn=>btn.addEventListener("click",()=>{const k=btn.dataset.sortKey;if(tableSortKey===k)tableSortDirection=tableSortDirection==="asc"?"desc":"asc";else{tableSortKey=k;tableSortDirection=k==="symbol"?"asc":"desc"}drawPortfolioTable()}));
chartSortSelect&&chartSortSelect.addEventListener("change",drawChartFromCurrentRows);
dailyPrevButton.addEventListener("click",()=>{if(dailyPage>1){dailyPage--;drawDailyMovementTable()}});
dailyNextButton.addEventListener("click",()=>{const t=Math.max(1,Math.ceil(dailyMovementRows.length/PAGE_SIZE));if(dailyPage<t){dailyPage++;drawDailyMovementTable()}});
txPrevButton.addEventListener("click",()=>{if(transactionPage>1){transactionPage--;drawTransactions()}});
txNextButton.addEventListener("click",()=>{const t=Math.max(1,Math.ceil(transactions.length/PAGE_SIZE));if(transactionPage<t){transactionPage++;drawTransactions()}});

function formatMoney(v){return "$"+Number(v).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2})}
function formatNumber(v){return Number.isFinite(Number(v))?Number(v).toLocaleString("zh-CN",{maximumFractionDigits:4}):"-"}
function formatPercent(v){if(!Number.isFinite(Number(v)))return"0.00%";return(v>=0?"+":"")+Number(v).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"}
function formatChartLabel(g,p){return (g>=0?"+":"-")+"$"+Math.abs(g).toLocaleString("zh-CN",{maximumFractionDigits:0})+" ("+formatPercent(p)+")"}
function todayString(){return new Date().toLocaleDateString("en-CA")}

function calculatePositions(){const pos={};transactions.forEach(tx=>{if(!pos[tx.symbol])pos[tx.symbol]={symbol:tx.symbol,shares:0,costBasis:0};const p=pos[tx.symbol];if(tx.type==="buy"){p.shares+=tx.shares;p.costBasis+=tx.shares*tx.price}else{if(p.shares<=0)return;const avg=p.costBasis/p.shares,sell=Math.min(tx.shares,p.shares);p.shares-=sell;p.costBasis-=sell*avg;if(p.shares<.000001){p.shares=0;p.costBasis=0}}});Object.keys(pos).forEach(s=>{if(pos[s].shares<=0)delete pos[s]});return pos}

async function getQuote(symbol){try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`);const d=await r.json();return{currentPrice:Number(d.c)||0,highPrice:Number(d.h)||0,lowPrice:Number(d.l)||0,dailyChange:Number(d.d)||0,dailyChangePercent:Number(d.dp)||0}}catch(e){console.error(e);return{currentPrice:0,highPrice:0,lowPrice:0,dailyChange:0,dailyChangePercent:0}}}

async function getEarningsInfo(symbol) {
    try {
        const today = new Date();
        const todayText = today.toLocaleDateString("en-CA");

        const future = new Date(today);
        future.setMonth(future.getMonth() + 12);
        const futureText = future.toLocaleDateString("en-CA");

        const past = new Date(today);
        past.setMonth(past.getMonth() - 18);
        const pastText = past.toLocaleDateString("en-CA");

        // 1) Upcoming earnings date
        const futureUrl = `https://finnhub.io/api/v1/calendar/earnings?from=${todayText}&to=${futureText}&symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;
        const futureResponse = await fetch(futureUrl);
        const futureData = await futureResponse.json();

        const upcomingRows = Array.isArray(futureData.earningsCalendar)
            ? futureData.earningsCalendar.filter(row => row.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))
            : [];

        let display = "--";
        let days = 999999;
        let className = "earnings-unknown";

        if (upcomingRows.length > 0) {
            const upcoming = upcomingRows[0];
            const earningsDate = new Date(upcoming.date + "T00:00:00");
            const todayStart = new Date(todayText + "T00:00:00");
            days = Math.ceil((earningsDate - todayStart) / 86400000);

            className = days <= 7 ? "earnings-soon" : (days <= 30 ? "earnings-medium" : "earnings-later");
            display = upcoming.date + "（" + days + "天）";
        }

        // 2) Most recent reported earnings for EPS/revenue beat.
        // Upcoming rows usually do not have actual results yet.
        const pastUrl = `https://finnhub.io/api/v1/calendar/earnings?from=${pastText}&to=${todayText}&symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;
        const pastResponse = await fetch(pastUrl);
        const pastData = await pastResponse.json();

        const reportedRows = Array.isArray(pastData.earningsCalendar)
            ? pastData.earningsCalendar
                .filter(row => row.date)
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            : [];

        let epsBeat = NaN;
        let revenueBeat = NaN;

        for (const row of reportedRows) {
            const eps = calcBeat(row.epsActual, row.epsEstimate);
            const rev = calcBeat(row.revenueActual, row.revenueEstimate);

            if (Number.isFinite(eps) || Number.isFinite(rev)) {
                epsBeat = eps;
                revenueBeat = rev;
                break;
            }
        }

        return {
            display,
            days,
            className,
            epsBeat,
            revenueBeat
        };
    } catch (error) {
        console.error("获取财报信息失败:", symbol, error);
        return {
            display: "--",
            days: 999999,
            className: "earnings-unknown",
            epsBeat: NaN,
            revenueBeat: NaN
        };
    }
}
function calcBeat(actual, estimate) {
    // Do not treat missing/null/empty values as zero.
    // Many upcoming earnings records do not have actual EPS/revenue yet.
    if (actual === null || actual === undefined || actual === "" ||
        estimate === null || estimate === undefined || estimate === "") {
        return NaN;
    }

    const actualNumber = Number(actual);
    const estimateNumber = Number(estimate);

    if (!Number.isFinite(actualNumber) ||
        !Number.isFinite(estimateNumber) ||
        estimateNumber === 0) {
        return NaN;
    }

    return ((actualNumber - estimateNumber) / Math.abs(estimateNumber)) * 100;
}


function makeRangeDisplay(low, high, current) {
    low=Number(low)||0; high=Number(high)||0; current=Number(current)||0;
    if(low<=0||high<=0||high<=low||current<=0) return '<span class="range-missing">--</span>';
    let p=((current-low)/(high-low))*100;
    p=Math.max(0,Math.min(100,p));
    return `<div class="compact-range">
      <div class="compact-labels"><span>${formatMoney(low)}</span><span>${formatMoney(high)}</span></div>
      <div class="compact-track"><div class="compact-fill"></div><div class="compact-marker" style="left:${p}%"></div></div>
      <div class="compact-pos">${p.toFixed(0)}%</div>
    </div>`;
}

async function loadPortfolio(){portfolioRows=[];const positions=calculatePositions();let totalValue=0,totalCost=0,totalGain=0;
for(const symbol of Object.keys(positions)){const stock=positions[symbol],quote=await getQuote(symbol),earn=await getEarningsInfo(symbol);const currentPrice=quote.currentPrice,marketValue=stock.shares*currentPrice,costBasis=stock.costBasis,avgCost=stock.shares>0?costBasis/stock.shares:0,gainLoss=marketValue-costBasis,gainPercent=costBasis>0?gainLoss/costBasis*100:0;totalValue+=marketValue;totalCost+=costBasis;totalGain+=gainLoss;portfolioRows.push({symbol,shares:stock.shares,avgCost,currentPrice,dailyChange:quote.dailyChange,dailyChangePercent:quote.dailyChangePercent,marketValue,costBasis,gainLoss,gainPercent,priceRange:makeRangeDisplay(quote.lowPrice, quote.highPrice, currentPrice),earningsDisplay:earn.display,earningsSort:earn.days,earningsClass:earn.className})}
const totalGainPercent=totalCost>0?totalGain/totalCost*100:0;totalValueCell.textContent=formatMoney(totalValue);totalCostCell.textContent=formatMoney(totalCost);totalGainCell.textContent=(totalGain>=0?"+":"")+formatMoney(totalGain);totalGainCell.className=totalGain>=0?"gain":"loss";totalGainPercentCell.textContent=formatPercent(totalGainPercent);totalGainPercentCell.className=totalGain>=0?"gain":"loss";chartSummary.textContent="总投入："+formatMoney(totalCost)+"　|　当前市值："+formatMoney(totalValue)+"　|　总盈亏："+(totalGain>=0?"+":"")+formatMoney(totalGain)+" ("+formatPercent(totalGainPercent)+")";buildDailyMovement(totalGain,totalCost);drawPortfolioTable();drawChartFromCurrentRows();drawDailyMovementTable();drawTransactions()}

function compareRows(a,b,k){if(k==="symbol")return String(a.symbol).localeCompare(String(b.symbol));const av=Number(a[k]),bv=Number(b[k]);if(!Number.isFinite(av)&&!Number.isFinite(bv))return 0;if(!Number.isFinite(av))return -1;if(!Number.isFinite(bv))return 1;return av-bv}
function drawPortfolioTable(){portfolioBody.innerHTML="";document.querySelectorAll(".sort-header").forEach(b=>{b.classList.remove("active-sort","desc");if(b.dataset.sortKey===tableSortKey){b.classList.add("active-sort");if(tableSortDirection==="desc")b.classList.add("desc")}});[...portfolioRows].sort((a,b)=>{const r=compareRows(a,b,tableSortKey);return tableSortDirection==="asc"?r:-r}).forEach(x=>{const g=x.gainLoss>=0?"gain":"loss",d=x.dailyChange>0?"gain":x.dailyChange<0?"loss":"",tr=document.createElement("tr");tr.innerHTML=`<td>${x.symbol}</td><td>${formatNumber(x.shares)}</td><td>${formatMoney(x.avgCost)}</td><td>${formatMoney(x.currentPrice)}</td><td class="${d}">${x.dailyChange>0?"+":""}${formatMoney(x.dailyChange)} (${formatPercent(x.dailyChangePercent)})</td><td>${formatMoney(x.marketValue)}</td><td>${formatMoney(x.costBasis)}</td><td class="${g}">${x.gainLoss>=0?"+":""}${formatMoney(x.gainLoss)}</td><td class="${g}">${formatPercent(x.gainPercent)}</td><td class="range-cell">${x.priceRange}</td><td class="${x.earningsClass}">${x.earningsDisplay}</td>`;portfolioBody.appendChild(tr)})}
function getSortedChartRows(){const [k,dir]=(chartSortSelect?chartSortSelect.value:"gainLoss:desc").split(":");return[...portfolioRows].sort((a,b)=>{const r=compareRows(a,b,k);return dir==="asc"?r:-r})}
function drawChartFromCurrentRows(){const rows=getSortedChartRows();drawChart(rows.map(r=>r.symbol),rows.map(r=>r.gainLoss),rows.map(r=>r.gainPercent))}
function buildDailyMovement(todayGain,todayCost){const s=[...savedSnapshots].sort((a,b)=>String(b.date).localeCompare(String(a.date))),prev=s[0]||null,pg=prev?prev.totalUnrealizedGain:0,pc=prev&&prev.totalCost>0?prev.totalCost:todayCost;dailyMovementRows=[{date:todayString(),movement:todayGain-pg,percent:pc>0?(todayGain-pg)/pc*100:0,currentGain:todayGain,previousGain:pg,note:prev?"自动计算：今日总未实现盈亏 − "+prev.date+" 总未实现盈亏":"自动计算：没有前一日快照，默认以前一日盈亏 $0.00 比较"}];for(let i=0;i<s.length;i++){const c=s[i],p=s[i+1],cg=p?p.totalUnrealizedGain:0,cc=p&&p.totalCost>0?p.totalCost:c.totalCost,m=c.totalUnrealizedGain-cg;dailyMovementRows.push({date:c.date,movement:m,percent:cc>0?m/cc*100:0,currentGain:c.totalUnrealizedGain,previousGain:cg,note:c.note||"历史快照计算"})}}
function drawDailyMovementTable(){dailyMovementBody.innerHTML="";const tp=Math.max(1,Math.ceil(dailyMovementRows.length/PAGE_SIZE));dailyPage=Math.min(Math.max(dailyPage,1),tp);dailyMovementRows.slice((dailyPage-1)*PAGE_SIZE,(dailyPage-1)*PAGE_SIZE+PAGE_SIZE).forEach(r=>{const c=r.movement>=0?"gain":"loss",tr=document.createElement("tr");tr.innerHTML=`<td>${r.date}</td><td class="${c}">${r.movement>=0?"+":""}${formatMoney(r.movement)}</td><td class="${c}">${formatPercent(r.percent)}</td><td>${formatMoney(r.currentGain)}</td><td>${formatMoney(r.previousGain)}</td><td>${r.note}</td>`;dailyMovementBody.appendChild(tr)});dailyPageInfo.textContent=`第 ${dailyPage} 页 / 共 ${tp} 页`;dailyPrevButton.disabled=dailyPage<=1;dailyNextButton.disabled=dailyPage>=tp}
function drawTransactions(){transactionBody.innerHTML="";const sorted=[...transactions].reverse(),tp=Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));transactionPage=Math.min(Math.max(transactionPage,1),tp);sorted.slice((transactionPage-1)*PAGE_SIZE,(transactionPage-1)*PAGE_SIZE+PAGE_SIZE).forEach(tx=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${tx.date}</td><td>${tx.type==="buy"?"买入":"卖出"}</td><td>${tx.symbol}</td><td>${formatNumber(tx.shares)}</td><td>${formatMoney(tx.price)}</td><td>${formatMoney(tx.shares*tx.price)}</td>`;transactionBody.appendChild(tr)});txPageInfo.textContent=`第 ${transactionPage} 页 / 共 ${tp} 页`;txPrevButton.disabled=transactionPage<=1;txNextButton.disabled=transactionPage>=tp}
function drawChart(labels,gains,gainPercents){if(!window.Chart)return;if(portfolioChart)portfolioChart.destroy();const plugins={legend:{display:false},tooltip:{callbacks:{label:c=>"盈亏："+formatMoney(c.raw)+" "+formatPercent(c.dataset.gainPercents[c.dataIndex]||0)}}};if(window.ChartDataLabels)plugins.datalabels={clamp:true,clip:false,anchor:"end",align:"top",offset:6,color:c=>c.dataset.data[c.dataIndex]>=0?"#16a34a":"#dc2626",font:{weight:"bold",size:11},formatter:(v,c)=>formatChartLabel(v,c.dataset.gainPercents[c.dataIndex]||0)};portfolioChart=new Chart(portfolioChartCanvas,{type:"bar",data:{labels,datasets:[{label:"盈亏",data:gains,gainPercents,backgroundColor:gains.map(v=>v>=0?"#16a34a":"#dc2626"),borderColor:gains.map(v=>v>=0?"#15803d":"#b91c1c"),borderWidth:1,borderRadius:5,barPercentage:.6,categoryPercentage:.75}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,bottom:8}},plugins,scales:{y:{beginAtZero:true,grace:"5%",ticks:{callback:v=>"$"+Intl.NumberFormat("en",{notation:"compact"}).format(v)}}}}})}
loadPortfolio();
