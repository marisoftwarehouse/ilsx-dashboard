/****************************************************************************************
 * DIGITAL SHEKEL — FULL ANALYTICS ENGINE
 * Subgraph-powered reporting for Mint / Burn / Rate / Reserve / Security / Global Stats
 * Version fully adapted to the updated index.html IDs
 ****************************************************************************************/

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1717468/digital-shekel/v0.0.3";
const ANALYTICS_SUBGRAPH_AUTH = "cb3bfdb2620ee4eb0c92266e584180b0"; // provided deploy key

const compact4 = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    notation: "compact"
});

const fixed4 = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
});

/* ============================================================
    Generic GraphQL Fetch
============================================================ */
async function fetchSubgraph(query, variables = {}) {
    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "ilsx-dashboard",
                ...(ANALYTICS_SUBGRAPH_AUTH ? { "Authorization": `Bearer ${ANALYTICS_SUBGRAPH_AUTH}` } : {})
            },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
            console.error("Subgraph HTTP error", response.status, await response.text());
            return null;
        }

        const json = await response.json();
        if (json.errors) {
            console.error("Subgraph returned errors", json.errors);
            return null;
        }
        return json.data;
    } catch (err) {
        console.error("Subgraph fetch failed", err);
        return null;
    }
}

/* ============================================================
    GLOBAL STATS (Minted / Burned / Holders / Reserve / Supply)
============================================================ */
async function loadGlobalStats() {
    const query = `
    {
      globalStats(id: "stats") {
        totalMinted
        totalBurned
        reserveBalance
        currentRate
        holders
      }
    }`;

    const result = await fetchSubgraph(query);
    const s = result?.globalStats;

    if (s) {
        applyValue("statTotalMinted", formatNumber(s.totalMinted));
        applyValue("statTotalBurned", formatNumber(s.totalBurned));
        applyValue("statReserve", formatEther(s.reserveBalance) + " ETH");

        const ratio = Number(s.totalMinted) > 0
            ? (Number(s.reserveBalance) / Number(s.totalMinted)).toFixed(4)
            : "0.0000";

        applyValue("statReserveRatio", ratio);

        if (s.currentRate) {
            applyValue("rateInfo", `${formatNumber(s.currentRate)} ILSX/ETH`);
        }

        let holderValue = formatHolderCount(s.holders);
        const fallbackHolders = await fetchHolderCountFallback();
        if (fallbackHolders !== null && fallbackHolders !== undefined && fallbackHolders !== false) {
            holderValue = formatHolderCount(fallbackHolders);
        }
        applyValue("statHolders", holderValue);
        return;
    }

    // Fallback to on-chain reads if subgraph is empty/offline
    if (window.contract) {
        try {
            const [tm, tb, reserve, rate] = await Promise.all([
                window.contract.totalMinted ? window.contract.totalMinted() : Promise.resolve(0n),
                window.contract.totalBurned ? window.contract.totalBurned() : Promise.resolve(0n),
                window.contract.reserveBalance ? window.contract.reserveBalance() : Promise.resolve(0n),
                window.contract.tokensPerEth ? window.contract.tokensPerEth() : Promise.resolve(0n)
            ]);
            applyValue("statTotalMinted", formatNumber(tm));
            applyValue("statTotalBurned", formatNumber(tb));
            applyValue("statReserve", formatEther(reserve) + " ETH");
            applyValue("statReserveRatio", "—");
            applyValue("rateInfo", `${formatNumber(rate)} ILSX/ETH`);
            applyValue("statHolders", formatHolderCount(await fetchHolderCountFallback()));
        } catch (err) {
            console.error("On-chain stats fallback failed", err);
        }
    }
}


/* ============================================================
    SUPPLY (On-chain totalSupply)
============================================================ */
async function loadTotalSupplyOnChain() {
    try {
        if (!window.contract) return;

        const supply = await window.contract.totalSupply();
        applyValue(
            "statTotalSupplyOnChain",
            fixed4.format(Number(supply) / 1e18)
        );
    } catch (err) {
        console.error("Failed to load totalSupply (on-chain):", err);
    }
}

/* ============================================================
    MINT HISTORY
============================================================ */
async function loadMintHistory() {
    const query = `
    {
      mintEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        to
        amount
        txHash
        timestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.mintEvents || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("Minted", "amount", "to");
    }

    let html = "";

    events.forEach(ev => {
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>${shortAddress(ev.to)}</td>
            <td>${formatNumber(ev.amount)}</td>
            <td>${txLink}</td>
          </tr>
        `;
    });

    if (!html) {
        html = `<tr><td colspan="4" class="text-center text-slate-400 py-2">אין נתונים</td></tr>`;
    }

    document.getElementById("mintHistoryBody").innerHTML = html;
    applyTableScroll("mintHistoryBody");
}

/* ============================================================
    BURN HISTORY
============================================================ */
async function loadBurnHistory() {
    const query = `
    {
      burnEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        from
        amount
        txHash
        timestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.burnEvents || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("Burned", "amount", "from");
    }

    let html = "";

    events.forEach(ev => {
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>${shortAddress(ev.from)}</td>
            <td>${formatNumber(ev.amount)}</td>
            <td>${txLink}</td>
          </tr>
        `;
    });

    if (!html) {
        html = `<tr><td colspan="4" class="text-center text-slate-400 py-2">אין נתונים</td></tr>`;
    }

    document.getElementById("burnHistoryBody").innerHTML = html;
    applyTableScroll("burnHistoryBody");
}

/* ============================================================
    RATE HISTORY
============================================================ */
async function loadRateChanges() {
    const query = `
    {
      rateChangeEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        newRate
        txHash
        timestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.rateChangeEvents || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("RateUpdated", "newRate");
    }

    let html = "";

    events.forEach(ev => {
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        const rateValue = ev.newRate ? formatNumber(ev.newRate) : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>${rateValue}</td>
            <td>${txLink}</td>
          </tr>
        `;
    });

    if (!html) {
        html = `<tr><td colspan="3" class="text-center text-slate-400 py-2">אין נתונים</td></tr>`;
    }

    document.getElementById("rateHistoryBody").innerHTML = html;
    applyTableScroll("rateHistoryBody");
}

/* ============================================================
    RESERVE HISTORY
============================================================ */
async function loadReserveHistory() {
    const query = `
    {
      reserveDepositEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        from
        amount
        txHash
        timestamp
      }
      reserveWithdrawEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        to
        amount
        txHash
        timestamp
      }
    }`;

    const data = await fetchSubgraph(query);

    let html = "";

    let deposits = data?.reserveDepositEvents || [];
    let withdraws = data?.reserveWithdrawEvents || [];

    if (deposits.length === 0 && window.contract && window.provider) {
        deposits = await fetchOnChainEvents("ReserveFunded", "amountEth", "from");
    }
    if (withdraws.length === 0 && window.contract && window.provider) {
        withdraws = await fetchOnChainEvents("ReserveWithdrawn", "amountEth", "to");
    }

    // Deposits
    deposits.forEach(ev => {
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>Deposit</td>
            <td>${shortAddress(ev.from)}</td>
            <td>${formatEther(ev.amount)}</td>
            <td>${txLink}</td>
          </tr>`;
    });

    // Withdrawals
    withdraws.forEach(ev => {
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>Withdraw</td>
            <td>${shortAddress(ev.to)}</td>
            <td>${formatEther(ev.amount)}</td>
            <td>${txLink}</td>
          </tr>`;
    });

    if (!html) {
        html = `<tr><td colspan="5" class="text-center text-slate-400 py-2">No data</td></tr>`;
    }

    document.getElementById("reserveHistoryBody").innerHTML = html;
    applyTableScroll("reserveHistoryBody");
}

/* ============================================================
    SECURITY HISTORY (Blacklist / Freeze)
============================================================ */
async function loadSecurityHistory() {
    const query = `
    {
      blacklistEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        account
        action
        txHash
        timestamp
      }
    }`;

    const data = await fetchSubgraph(query);

    let html = "";

    let events = data?.blacklistEvents || [];

    if (events.length === 0 && window.contract && window.provider) {
        const blacks = await fetchOnChainEvents("Blacklisted", null, "account", "blacklist");
        const unblacks = await fetchOnChainEvents("Unblacklisted", null, "account", "unblacklist");
        const freezes = await fetchOnChainEvents("Frozen", null, "account", "freeze");
        const unfreezes = await fetchOnChainEvents("Unfrozen", null, "account", "unfreeze");
        events = [...blacks, ...unblacks, ...freezes, ...unfreezes].sort((a,b)=>Number(b.timestamp)-Number(a.timestamp)).slice(0,100);
    }

    events.forEach(ev => {
        const label = mapSecurityAction(ev.action);
        const txLink = ev.txHash
            ? `<a href="https://sepolia.etherscan.io/tx/${ev.txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ev.timestamp)}</td>
            <td>${label}</td>
            <td>${shortAddress(ev.account)}</td>
            <td>${txLink}</td>
          </tr>`;
    });

    if (!html) {
        html = `<tr><td colspan="4" class="text-center text-slate-400 py-2">No data</td></tr>`;
    }

    document.getElementById("securityHistoryBody").innerHTML = html;
    applyTableScroll("securityHistoryBody");
}

/* ============================================================
    Helpers
============================================================ */
function shortAddress(a) {
    if (!a) return "-";
    const s = typeof a === "string" ? a : a.toString();
    if (s.length <= 10) return s;
    return s.slice(0, 6) + "..." + s.slice(-4);
}

function formatNumber(v) {
    if (v === null || v === undefined) return "-";
    let num = v;
    try {
        if (typeof v === "object" && "toString" in v) {
            num = Number(v.toString());
        } else {
            num = Number(v);
        }
        if (!isFinite(num)) return "-";
        num = num / 1e18;
        return num < 100000 ? fixed4.format(num) : compact4.format(num);
    } catch {
        return "-";
    }
}

function formatEther(v) {
    const num = Number(v) / 1e18;
    return num < 100000 ? num.toFixed(6) : compact4.format(num);
}

function formatDate(ts) {
    return new Date(Number(ts) * 1000).toLocaleString("he-IL");
}

function formatHolderCount(v) {
    try {
        const n = Number(v);
        if (!isFinite(n)) return "-";
        return n < 100000 ? n.toLocaleString("en-US") : compact4.format(n);
    } catch {
        return "-";
    }
}

function mapSecurityAction(actionRaw) {
    const a = (actionRaw || "").toLowerCase();
    if (a.includes("blacklist")) return "Blacklist";
    if (a.includes("unblacklist") || a.includes("remove")) return "Unblacklist";
    if (a.includes("freeze")) return "Freeze";
    if (a.includes("unfreeze")) return "Unfreeze";
    return actionRaw || "Security Event";
}

function applyTableScroll(bodyId, maxHeightPx = 165) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const wrapper = body.closest(".overflow-x-auto") || body.parentElement;
    if (!wrapper) return;
    wrapper.style.maxHeight = `${maxHeightPx}px`;
    wrapper.style.overflowY = "auto";
}

async function fetchHolderCountFallback() {
    const query = `
    {
      accounts(where: { balance_gt: "0" }, first: 1000) {
        id
      }
    }`;

    try {
        const data = await fetchSubgraph(query);
        if (data?.accounts) return data.accounts.length;
        return null;
    } catch (err) {
        console.warn("holders fallback failed", err);
        return null;
    }
}

async function fetchOnChainEvents(eventName, amountField = "amount", addrField = null, actionLabel = null) {
    try {
        const current = await window.provider.getBlockNumber();
        const fromBlock = Math.max(current - 20000, 0);
        // @ts-ignore dynamic filter
        const filter = window.contract.filters[eventName]();
        const logs = await window.contract.queryFilter(filter, fromBlock, current);
        const recent = logs.slice(-100);
        const blocks = await Promise.all(recent.map(l => window.provider.getBlock(l.blockNumber)));
        const results = recent.map((log, idx) => {
            const obj = {
                amount: log.args && amountField ? (log.args[amountField] ?? log.args[1] ?? null) : null,
                txHash: log.transactionHash,
                timestamp: blocks[idx]?.timestamp || 0
            };
            if (addrField) {
                obj[addrField] = log.args && (log.args[addrField] ?? log.args[0]);
            }
            if (actionLabel) obj.action = actionLabel;
            return obj;
        });
        return results
            .filter(ev => ev.txHash)
            .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
            .map(ev => ({
                ...ev,
                timestamp: ev.timestamp || Date.now() / 1000
            }));
    } catch (err) {
        console.error("fetchOnChainEvents failed for", eventName, err);
        return [];
    }
}

function applyValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
        el.style.whiteSpace = "nowrap";
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
        el.style.direction = "ltr";
    }
}

/* ============================================================
    INIT
============================================================ */
async function initAnalytics() {
    await loadGlobalStats();
    await loadTotalSupplyOnChain();
    await loadMintHistory();
    await loadBurnHistory();
    await loadRateChanges();
    await loadReserveHistory();
    await loadSecurityHistory();

    console.log("ILSX Analytics Loaded ✔");
}

/* Auto-run on page load */
window.addEventListener("load", initAnalytics);
