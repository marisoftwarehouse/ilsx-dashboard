/****************************************************************************************
 * DIGITAL SHEKEL — FULL ANALYTICS ENGINE
 * Subgraph-powered reporting for Mint / Burn / Rate / Reserve / Security / Global Stats
 * Version fully adapted to the updated index.html IDs
 ****************************************************************************************/

const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1717468/digital-shekel-mainnet/version/latest";
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
      minteds(first: 1000) { amount }
      burneds(first: 1000) { amount }
      reserveFundeds(first: 1000) { amountEth }
      reserveWithdrawns(first: 1000) { amountEth }
      rateUpdateds(orderBy: blockTimestamp, orderDirection: desc, first: 1) { newRate }
    }`;

    const result = await fetchSubgraph(query);
    const mints = result?.minteds || [];
    const burns = result?.burneds || [];
    const fundeds = result?.reserveFundeds || [];
    const withdrawns = result?.reserveWithdrawns || [];
    const rate = result?.rateUpdateds?.[0]?.newRate ?? null;

    if (mints.length || burns.length || fundeds.length || withdrawns.length) {
        const totalMinted = mints.reduce((acc, ev) => acc + BigInt(ev.amount ?? "0"), 0n);
        const totalBurned = burns.reduce((acc, ev) => acc + BigInt(ev.amount ?? "0"), 0n);
        const reserveIn = fundeds.reduce((acc, ev) => acc + BigInt(ev.amountEth ?? "0"), 0n);
        const reserveOut = withdrawns.reduce((acc, ev) => acc + BigInt(ev.amountEth ?? "0"), 0n);
        const reserveBalance = reserveIn - reserveOut;

        applyValue("statTotalMinted", formatNumber(totalMinted));
        applyValue("statTotalBurned", formatNumber(totalBurned));
        applyValue("statReserve", formatEther(reserveBalance) + " ETH");

        const ratio = totalMinted > 0n
            ? (Number(reserveBalance) / Number(totalMinted)).toFixed(4)
            : "0.0000";
        applyValue("statReserveRatio", ratio);

        if (rate) {
            applyValue("rateInfo", `${formatNumber(rate)} ILSX/ETH`);
        }

        // Holders are not tracked in this subgraph; skip quietly
        applyValue("statHolders", "-");
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
            applyValue("statReserveRatio", "-");
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
      minteds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        id
        to
        amount
        transactionHash
        blockTimestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.minteds || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("Minted", "amount", "to");
    }

    let html = "";

    events.forEach(ev => {
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
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
      burneds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        id
        from
        amount
        transactionHash
        blockTimestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.burneds || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("Burned", "amount", "from");
    }

    let html = "";

    events.forEach(ev => {
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
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
      rateUpdateds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        id
        newRate
        transactionHash
        blockTimestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    let events = data?.rateUpdateds || [];

    if ((!events || events.length === 0) && window.contract && window.provider) {
        events = await fetchOnChainEvents("RateUpdated", "newRate");
    }

    let html = "";

    events.forEach(ev => {
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        const rateValue = ev.newRate ? formatNumber(ev.newRate) : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
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
      reserveFundeds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        id
        from
        amountEth
        transactionHash
        blockTimestamp
      }
      reserveWithdrawns(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        id
        to
        amountEth
        transactionHash
        blockTimestamp
      }
    }`;

    const data = await fetchSubgraph(query);

    let html = "";

    let deposits = data?.reserveFundeds || [];
    let withdraws = data?.reserveWithdrawns || [];

    if (deposits.length === 0 && window.contract && window.provider) {
        deposits = await fetchOnChainEvents("ReserveFunded", "amountEth", "from");
    }
    if (withdraws.length === 0 && window.contract && window.provider) {
        withdraws = await fetchOnChainEvents("ReserveWithdrawn", "amountEth", "to");
    }

    // Deposits
    deposits.forEach(ev => {
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
            <td>Deposit</td>
            <td>${shortAddress(ev.from)}</td>
            <td>${formatEther(ev.amountEth)}</td>
            <td>${txLink}</td>
          </tr>`;
    });

    // Withdrawals
    withdraws.forEach(ev => {
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
            <td>Withdraw</td>
            <td>${shortAddress(ev.to)}</td>
            <td>${formatEther(ev.amountEth)}</td>
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
      blacklisteds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        wallet
        blockTimestamp
        transactionHash
      }
      unblacklisteds(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        wallet
        blockTimestamp
        transactionHash
      }
      frozens(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        wallet
        blockTimestamp
        transactionHash
      }
      unfrozens(orderBy: blockTimestamp, orderDirection: desc, first: 100) {
        wallet
        blockTimestamp
        transactionHash
      }
    }`;

    const data = await fetchSubgraph(query);

    let html = "";

    const blacks = (data?.blacklisteds || []).map(ev => ({ action: "blacklist", wallet: ev.wallet, timestamp: ev.blockTimestamp, txHash: ev.transactionHash }));
    const unblacks = (data?.unblacklisteds || []).map(ev => ({ action: "unblacklist", wallet: ev.wallet, timestamp: ev.blockTimestamp, txHash: ev.transactionHash }));
    const freezes = (data?.frozens || []).map(ev => ({ action: "freeze", wallet: ev.wallet, timestamp: ev.blockTimestamp, txHash: ev.transactionHash }));
    const unfreezes = (data?.unfrozens || []).map(ev => ({ action: "unfreeze", wallet: ev.wallet, timestamp: ev.blockTimestamp, txHash: ev.transactionHash }));

    let events = [...blacks, ...unblacks, ...freezes, ...unfreezes]
        .filter(ev => ev.txHash)
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
        .slice(0, 100);

    if (events.length === 0 && window.contract && window.provider) {
        const chainBlacks = await fetchOnChainEvents("Blacklisted", null, "account", "blacklist");
        const chainUnblacks = await fetchOnChainEvents("Unblacklisted", null, "account", "unblacklist");
        const chainFreezes = await fetchOnChainEvents("Frozen", null, "account", "freeze");
        const chainUnfreezes = await fetchOnChainEvents("Unfrozen", null, "account", "unfreeze");
        events = [...chainBlacks, ...chainUnblacks, ...chainFreezes, ...chainUnfreezes]
            .sort((a,b)=>Number(b.timestamp)-Number(a.timestamp))
            .slice(0,100);
    }

    events.forEach(ev => {
        const label = mapSecurityAction(ev.action);
        const txHash = ev.transactionHash || ev.txHash;
        const ts = ev.blockTimestamp || ev.timestamp;
        const txLink = txHash
            ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" class="text-blue-400">View</a>`
            : "-";
        html += `
          <tr>
            <td>${formatDate(ts)}</td>
            <td>${label}</td>
            <td>${shortAddress(ev.wallet || ev.account)}</td>
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
    // This schema does not expose per-account balances, so skip gracefully.
    return null;
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

async function loadLastOracleUpdate() {
    const query = `
    {
      rateUpdateds(orderBy: blockTimestamp, orderDirection: desc, first: 1) {
        newRate
        transactionHash
        blockTimestamp
      }
    }`;

    const data = await fetchSubgraph(query);
    const ev = data?.rateUpdateds?.[0];

    if (!ev) return;

    document.getElementById("lastOracleRate").textContent =
        formatNumber(ev.newRate) + " ILSX/ETH";

    document.getElementById("lastOracleTime").textContent =
        formatDate(ev.blockTimestamp);

    const link = document.getElementById("lastOracleTx");
    link.href = `https://etherscan.io/tx/${ev.transactionHash}`;
    link.textContent = ev.transactionHash.slice(0, 10) + "...";
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
    await loadLastOracleUpdate();   // <<< NEW
    console.log("ILSX Analytics Loaded ✔");
}

/* Auto-run on page load */
window.addEventListener("load", initAnalytics);
