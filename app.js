const { ethers } = window.ethers;

const CONTRACT_ADDRESS = "0x2a2e78F8C21d62a7bF4cfaFf2e0F6Ae4c5B86c59";
const CONTRACT_ARTIFACT_PATH = "./DigitalShekel.json";
const SUBGRAPH_ENDPOINT = "https://api.studio.thegraph.com/query/1717468/digital-shekel/v0.0.3";
const DASHBOARD_SUBGRAPH_AUTH = "cb3bfdb2620ee4eb0c92266e584180b0";

let CONTRACT_ABI = null;

/* --------------------------------------------------------
   GLOBALS
---------------------------------------------------------*/
let provider, signer, contract;
let supplyChart;
let oracleChart;
let oracleAutoInterval = null;
let lastOracleOnline = false;
let tokenDecimals = 18;
let roleIds = {};
window.provider = null;
window.contract = null;

async function ensureContractAbi() {
  if (CONTRACT_ABI) return CONTRACT_ABI;

  try {
    const res = await fetch(CONTRACT_ARTIFACT_PATH);
    if (res.ok) {
      const artifact = await res.json();
      if (artifact && Array.isArray(artifact.abi)) {
        CONTRACT_ABI = artifact.abi;
        return CONTRACT_ABI;
      }
    }
  } catch (err) {
    console.error("Failed to load ABI from artifact", err);
  }

  // Fallback subset to keep the UI working if the artifact is unreachable
  CONTRACT_ABI = [
    { inputs: [], name: "name", outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "symbol", outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "decimals", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "totalMinted", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "totalBurned", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "MAX_SUPPLY", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "maxSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "tokensPerEth", outputs: [{ type: "uint256"}], stateMutability: "view", type: "function" },
    { inputs: [], name: "reserveBalance", outputs: [{ type: "uint256"}], stateMutability: "view", type: "function" },
    { inputs: [{ type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "buyTokensWithETH", outputs: [], stateMutability: "payable", type: "function" },
    { inputs: [{ type: "uint256" }], name: "sellTokensForETH", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address" }, { type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address" }, { type: "uint256" }], name: "burn", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "uint256"}], name: "setTokensPerEth", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [], name: "fundReserve", outputs: [], stateMutability: "payable", type: "function" },
    { inputs: [{ type: "address" }, { type: "uint256" }], name: "withdrawReserve", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address" }], name: "blacklist", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address" }], name: "unblacklist", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address"}], name: "blacklisted", outputs: [{ type: "bool"}], stateMutability: "view", type: "function"},
    { inputs: [{ type: "address" }], name: "freeze", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address" }], name: "unfreeze", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "address"}], name: "isFrozen", outputs: [{ type: "bool"}], stateMutability: "view", type: "function"},
    { inputs: [], name: "pause", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [], name: "unpause", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "bytes32" }, { type: "address" }], name: "grantRole", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "bytes32" }, { type: "address" }], name: "revokeRole", outputs: [], stateMutability: "nonpayable", type: "function" },
    { inputs: [{ type: "bytes32" }, { type: "address" }], name: "hasRole", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "DEFAULT_ADMIN_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "MINTER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "BURNER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "PAUSER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "BLACKLISTER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "RESERVE_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "RATE_SETTER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "FREEZER_ROLE", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" }
  ];

  return CONTRACT_ABI;
}

async function refreshRoleIds() {
  if (!contract) return;

  const roleNames = [
    "DEFAULT_ADMIN_ROLE",
    "MINTER_ROLE",
    "BURNER_ROLE",
    "PAUSER_ROLE",
    "BLACKLISTER_ROLE",
    "RESERVE_ROLE",
    "RATE_SETTER_ROLE",
    "FREEZER_ROLE"
  ];

  for (const name of roleNames) {
    try {
      // @ts-ignore dynamic property lookup on contract instance
      roleIds[name] = await contract[name]();
    } catch (err) {
      roleIds[name] = name === "DEFAULT_ADMIN_ROLE" ? ethers.ZeroHash : ethers.id(name);
      console.warn(`Role constant ${name} unavailable, using hash`, err);
    }
  }
}

async function getRoleId(roleName) {
  if (!roleIds[roleName]) {
    roleIds[roleName] = roleName === "DEFAULT_ADMIN_ROLE" ? ethers.ZeroHash : ethers.id(roleName);
  }
  return roleIds[roleName];
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 4
});

const ERROR_MESSAGES = {
  "0x28b35f21": "Insufficient reserve liquidity. Try a smaller sell or fund the reserve.",
  "0xd93c0665": "Contract is paused.",
  "0xab31471e": "Account is frozen.",
  "0xe137861c": "Account is blacklisted.",
  "0xcbca5aa2": "Amount must be greater than zero.",
  "0xea8e4eb5": "Not authorized for this action."
};

function formatCompactNumber(value) {
  try {
    const num = typeof value === "bigint" ? Number(value) : Number(value);
    if (!isFinite(num)) return String(value);
    return num < 100000 ? num.toLocaleString("en-US") : compactNumberFormatter.format(num);
  } catch {
    return String(value);
  }
}

function decodeRevertError(err) {
  const data = err?.data || err?.info?.error?.data || err?.error?.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    const selector = data.slice(0, 10).toLowerCase();
    if (ERROR_MESSAGES[selector]) return ERROR_MESSAGES[selector];
  }
  if (err?.message) return err.message;
  return "Transaction failed";
}

function formatMaxSupplyDisplay(rawValue) {
  try {
    const formatted = ethers.formatUnits(rawValue, tokenDecimals);
    const [i, f = ""] = formatted.split(".");
    if (i.length > 6) {
      // Large integer part: show leading and trailing digits
      return `${i.slice(0, 3)}…${i.slice(-3)}`;
    }
    const trimmed = f ? `${i}.${f.slice(0, 4)}` : i;
    if (trimmed.length > 12) return `${trimmed.slice(0, 12)}…`;
    return trimmed;
  } catch (err) {
    console.warn("formatMaxSupplyDisplay failed", err);
    return "Unlimited";
  }
}

// נשמור גם את השערים האחרונים מה־Oracle לשימוש בכפתור "העתק שער עדכני"
window.latestOracleEthUsd = null;
window.latestOracleUsdIls = null;
window.latestOracleEthIls = null;

/* --------------------------------------------------------
   TX HISTORY (LocalStorage)
---------------------------------------------------------*/
function saveTx(action, details) {
  const key = "ilsx_tx_history";
  const list = JSON.parse(localStorage.getItem(key) || "[]");

  list.unshift({
    action,
    details,
    time: new Date().toLocaleString()
  });

  if (list.length > 200) {
    list.splice(200);
  }

  localStorage.setItem(key, JSON.stringify(list));
  renderHistory();
}

function renderHistory() {
  const key = "ilsx_tx_history";
  const list = JSON.parse(localStorage.getItem(key) || "[]" );
  const box = document.getElementById("txHistory");
  if (!box) return;
  box.innerHTML = "";
  box.style.maxHeight = "200px";
  box.style.minHeight = "200px";
  box.style.overflowY = "auto";

  list.slice(0, 5).forEach(tx => {
    const card = document.createElement("div");
    card.className = "p-4 bg-slate-800 rounded-xl border border-slate-700 text-sm";
    card.innerHTML = `
      <div class="font-semibold">${tx.action}</div>
      <div class="text-slate-300 mt-1">${tx.details}</div>
      <div class="text-slate-500 text-xs mt-1">${tx.time}</div>
    `;
    box.appendChild(card);
  });
}
renderHistory();

/* --------------------------------------------------------
   SUPPLY CHART (Subgraph history)
---------------------------------------------------------*/
async function fetchSupplySeriesFromSubgraph() {
  const query = `
  {
    mintEvents(orderBy: timestamp, orderDirection: asc, first: 500) {
      amount
      timestamp
    }
    burnEvents(orderBy: timestamp, orderDirection: asc, first: 500) {
      amount
      timestamp
    }
  }`;

  try {
    const res = await fetch(SUBGRAPH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ilsx-dashboard",
        ...(DASHBOARD_SUBGRAPH_AUTH ? { Authorization: `Bearer ${DASHBOARD_SUBGRAPH_AUTH}` } : {})
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      console.error("Subgraph supply query failed", res.status);
      return [];
    }

    const json = await res.json();
    const data = json?.data || {};
    const mints = data.mintEvents || [];
    const burns = data.burnEvents || [];

    const events = [];
    mints.forEach(ev => events.push({ ts: Number(ev.timestamp), delta: BigInt(ev.amount || "0") }));
    burns.forEach(ev => events.push({ ts: Number(ev.timestamp), delta: -BigInt(ev.amount || "0") }));

    events.sort((a, b) => {
      if (a.ts === b.ts) {
        return a.delta > b.delta ? -1 : 1;
      }
      return a.ts - b.ts;
    });

    let running = 0n;
    const series = [];

    for (const ev of events) {
      running += ev.delta;
      if (running < 0n) running = 0n;

      const label = new Date(ev.ts * 1000).toLocaleString();
      const value = Number(ethers.formatUnits(running, tokenDecimals));
      series.push({ time: label, value });
    }

    let onChainSupply = null;
    if (contract) {
      try {
        const current = await contract.totalSupply();
        onChainSupply = Number(ethers.formatUnits(current, tokenDecimals));
      } catch (err) {
        console.error("Failed to fetch on-chain supply fallback", err);
      }
    }

    if (!series.length && onChainSupply !== null) {
      series.push({
        time: new Date().toLocaleString(),
        value: onChainSupply
      });
    } else if (series.length && onChainSupply !== null) {
      const last = series[series.length - 1];
      if (Math.abs(onChainSupply - Number(last.value)) > 1e-9) {
        series.push({
          time: new Date().toLocaleString(),
          value: onChainSupply
        });
      }
    }

    return series;
  } catch (err) {
    console.error("Failed to fetch supply history from subgraph", err);
    return [];
  }
}

function renderSupplyChart(series = []) {
  const canvas = document.getElementById("supplyChart");
  if (!canvas) return;

  if (!series.length) {
    if (supplyChart) supplyChart.destroy();
    return;
  }

  const labels = series.map(x => x.time);
  const data = series.map(x => x.value);

  const ctx = canvas.getContext("2d");
  if (supplyChart) supplyChart.destroy();

  supplyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data,
        borderColor: "#3b82f6",
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.35
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" }},
        y: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" }}
      }
    }
  });
}

async function syncSupplyChartFromSubgraph() {
  const series = await fetchSupplySeriesFromSubgraph();
  renderSupplyChart(series);
}

syncSupplyChartFromSubgraph();

async function initAnalyticsSafe() {
  if (typeof initAnalytics !== "function") return;

  try {
    await initAnalytics();
  } catch (err) {
    console.error("Analytics refresh failed", err);
  }
}

async function refreshAnalyticsAndCharts() {
  await initAnalyticsSafe();
  await syncSupplyChartFromSubgraph();
}

/* --------------------------------------------------------
   ORACLE HISTORY + CHART (ETH/ILS)
---------------------------------------------------------*/
function setOracleStatus(isOnline) {
  lastOracleOnline = isOnline;
  const el = document.getElementById("oracleStatus");
  if (!el) return;

  el.textContent = isOnline ? "🟢 Oracle LIVE" : "🔴 Oracle OFFLINE";
  el.className = isOnline
    ? "text-xs mt-2 text-green-400"
    : "text-xs mt-2 text-red-400";
}

function updateOracleHistory(ethUsd, usdIls, ethIls) {
  const key = "ilsx_oracle_history";
  let list = JSON.parse(localStorage.getItem(key) || "[]");

  const latest = list[0];
  const newValue = Number(ethIls.toFixed(4));

  if (!latest || Number(latest.ethIls) !== newValue) {
    list.unshift({
      time: new Date().toLocaleString(),
      ethUsd: Number(ethUsd.toFixed(4)),
      usdIls: Number(usdIls.toFixed(4)),
      ethIls: newValue
    });

    if (list.length > 500) {
      list = list.slice(0, 500);
    }

    localStorage.setItem(key, JSON.stringify(list));
  }

  renderOracleChart();
}

function renderOracleChart() {
  const canvas = document.getElementById("oracleChart");
  if (!canvas || typeof Chart === "undefined") return;

  const list = JSON.parse(localStorage.getItem("ilsx_oracle_history") || "[]");
  if (!list.length) {
    if (oracleChart) oracleChart.destroy();
    return;
  }

  const reversed = list.slice().reverse();
  const labels = reversed.map(x => x.time);
  const data = reversed.map(x => Number(x.ethIls));

  const ctx = canvas.getContext("2d");
  if (oracleChart) oracleChart.destroy();

  oracleChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data,
        borderColor: "#22c55e",
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.35
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" }},
        y: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" }}
      }
    }
  });
}
renderOracleChart();

/* --------------------------------------------------------
   CONNECT WALLET
---------------------------------------------------------*/
document.getElementById("connectButton").onclick = connectWallet;

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask אינו זמין בדפדפן");
    return;
  }

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    // Require user to switch network to Sepolia
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // chainId of Sepolia
    });

    const abi = await ensureContractAbi();

    window.provider = new ethers.BrowserProvider(window.ethereum);
    provider = window.provider;
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
    window.contract = contract;

    try {
      tokenDecimals = Number(await contract.decimals());
    } catch (err) {
      console.warn("Failed to load decimals, defaulting to 18", err);
      tokenDecimals = 18;
    }

    await refreshRoleIds();

    const addr = await signer.getAddress();
    setText("myAddress", addr);
    setText("contractAddress", CONTRACT_ADDRESS);
    setText(
      "sidebarContractShort",
      CONTRACT_ADDRESS.slice(0, 6) + "..." + CONTRACT_ADDRESS.slice(-4)
    );

    setText("connectionStatus", "מחובר ✓");

    await loadOnChainContractInfo();
    await loadMyBalance();
    await loadRoles();
    await loadOracleData();
    await initAnalyticsSafe();
    await syncSupplyChartFromSubgraph();
    startOracleAutoRefresh();
  } catch (err) {
    alert("שגיאה בהתחברות: " + err.message);
  }
}

/* --------------------------------------------------------
   LOAD CONTRACT INFO (supply + rate + reserve)
---------------------------------------------------------*/
async function loadOnChainContractInfo() {
  if (!contract) return;

  const [name, symbol, supply, decimalsValue, rate, reserve] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.totalSupply(),
    contract.decimals(),
    contract.tokensPerEth(),
    contract.reserveBalance()
  ]);

  tokenDecimals = Number(decimalsValue);

  let maxSupplyValue;
  try {
    maxSupplyValue = await contract.MAX_SUPPLY();
  } catch (err) {
    try {
      maxSupplyValue = await contract.maxSupply();
    } catch (err2) {
      maxSupplyValue = undefined;
    }
  }

  const total = ethers.formatUnits(supply, tokenDecimals);
  const formattedRate = ethers.formatUnits(rate, 18);
  const reserveEth = ethers.formatEther(reserve);

  setText("tokenName", name);
  setText("tokenSymbol", symbol);
  setText("totalSupply", `${total} ${symbol}`);
  setText("rateInfo", `${formattedRate} ${symbol} / ETH`);
  setText("reserveInfo", `${reserveEth} ETH`);
  setText("contractAddress", CONTRACT_ADDRESS);
  setText(
    "sidebarContractShort",
    CONTRACT_ADDRESS.slice(0, 6) + "..." + CONTRACT_ADDRESS.slice(-4)
  );

  const totalSupplyStat = document.getElementById("statTotalSupplyOnChain");
  if (totalSupplyStat) totalSupplyStat.textContent = total;

  const maxSupplyEl = document.getElementById("statMaxSupply");
  if (maxSupplyEl) {
    let maxDisplay = "Unlimited";
    if (maxSupplyValue !== undefined) {
      try {
        maxDisplay = formatMaxSupplyDisplay(maxSupplyValue);
      } catch (err) {
        console.warn("Failed to format maxSupply", err);
      }
    }
    maxSupplyEl.textContent = maxDisplay;
    maxSupplyEl.style.whiteSpace = "nowrap";
    maxSupplyEl.style.overflow = "hidden";
    maxSupplyEl.style.textOverflow = "ellipsis";
    maxSupplyEl.style.direction = "ltr";
  }

  const reserveStat = document.getElementById("statReserve");
  if (reserveStat) reserveStat.textContent = `${reserveEth} ETH`;
}

/* --------------------------------------------------------
   LOAD USER BALANCE
---------------------------------------------------------*/
async function loadMyBalance() {
  const addr = await signer.getAddress();
  const raw = await contract.balanceOf(addr);
  const formatted = ethers.formatUnits(raw, tokenDecimals);
  setText("myBalance", `${formatted} ILSX`);
}

/* --------------------------------------------------------
   BUY TOKENS (ETH → ILSX)
---------------------------------------------------------*/
document.getElementById("buyButton").onclick = async () => {
  const amountEth = document.getElementById("buyEthAmount").value.trim();
  const status = document.getElementById("buyStatus");

  if (!amountEth) {
    status.textContent = "נא להזין כמות ETH";
    return;
  }

  try {
    status.textContent = "מבצע קנייה...";
    const tx = await contract.buyTokensWithETH({
      value: ethers.parseEther(amountEth)
    });
    await tx.wait();

    status.textContent = "✔ נקנו מטבעות ILSX";
    saveTx("Buy", `${amountEth} ETH → ILSX`);

    await loadMyBalance();
    await loadOnChainContractInfo();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "❌ " + decodeRevertError(err);
  }
};

/* --------------------------------------------------------
   SELL TOKENS (ILSX → ETH)
---------------------------------------------------------*/
document.getElementById("sellButton").onclick = async () => {
  const amount = document.getElementById("sellAmount").value.trim();
  const status = document.getElementById("sellStatus");

  if (!amount) {
    status.textContent = "נא להזין כמות";
    return;
  }

  try {
    const parsed = ethers.parseUnits(amount, tokenDecimals);

    status.textContent = "מוכר...";
    const tx = await contract.sellTokensForETH(parsed);
    await tx.wait();

    status.textContent = "✔ נמכר וקיבלת ETH";
    saveTx("Sell", `${amount} ILSX → ETH`);

    await loadMyBalance();
    await loadOnChainContractInfo();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "❌ " + decodeRevertError(err);
  }
};

/* --------------------------------------------------------
   UPDATE RATE (Admin-only)
---------------------------------------------------------*/

// כפתור "העתק שער עדכני" – ממלא את השדה מתוך ה־Oracle האחרון
const copyOracleRateButton = document.getElementById("copyOracleRateButton");
if (copyOracleRateButton) {
  copyOracleRateButton.onclick = () => {
    const ethUsd = window.latestOracleEthUsd;
    const usdIls = window.latestOracleUsdIls;

    if (!ethUsd || !usdIls || ethUsd <= 0 || usdIls <= 0) {
      alert("השער העדכני אינו זמין כרגע. נסה לרענן את ה־Oracle או להתחבר מחדש.");
      return;
    }

    const ethIls = ethUsd * usdIls; // כמה ILS עבור ETH אחד
    const input = document.getElementById("newRate");
    if (input) {
      input.value = ethIls.toFixed(4);
    }
  };
}

document.getElementById("setRateButton").onclick = async () => {
  const input = document.getElementById("newRate");
  const status = document.getElementById("setRateStatus");

  let rate = input.value.trim();

  if (!rate) {
    const ethUsd = window.latestOracleEthUsd;
    const usdIls = window.latestOracleUsdIls;

    if (ethUsd && usdIls && ethUsd > 0 && usdIls > 0) {
      const ethIls = ethUsd * usdIls;
      rate = ethIls.toFixed(4);
      input.value = rate;
    } else {
      status.textContent = "No oracle rate yet. Click 'Copy latest rate' or enter manually.";
      return;
    }
  }

  try {
    const parsed = ethers.parseUnits(rate, 18);

    status.textContent = "Updating...";
    const tx = await contract.setTokensPerEth(parsed);
    await tx.wait();

    status.textContent = "✔ Rate updated";
    saveTx("SetRate", `Updated rate to ${rate} ILSX/ETH`);

    await loadOnChainContractInfo();
    await loadOracleData();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "? " + decodeRevertError(err);
  }
};

/* --------------------------------------------------------
   FUND RESERVE (Admin-only)
---------------------------------------------------------*/
document.getElementById("fundButton").onclick = async () => {
  const amount = document.getElementById("fundAmount").value.trim();
  const status = document.getElementById("fundStatus");

  if (!amount) {
    status.textContent = "Please enter ETH amount";
    return;
  }

  try {
    status.textContent = "Depositing...";
    const tx = await contract.fundReserve({
      value: ethers.parseEther(amount)
    });
    await tx.wait();

    status.textContent = "✔ Deposit successful";
    saveTx("FundReserve", `${amount} ETH deposited`);

    await loadOnChainContractInfo();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "? " + decodeRevertError(err);
  }
};

/* --------------------------------------------------------
   WITHDRAW RESERVE (Admin-only)
---------------------------------------------------------*/
document.getElementById("withdrawButton").onclick = async () => {
  const amount = document.getElementById("withdrawAmount").value.trim();
  const to = document.getElementById("withdrawAddress").value.trim();
  const status = document.getElementById("withdrawStatus");

  if (!amount || !to) {
    status.textContent = "Please enter amount and destination";
    return;
  }

  try {
    status.textContent = "Withdrawing...";
    const tx = await contract.withdrawReserve(to, ethers.parseEther(amount));
    await tx.wait();

    status.textContent = "✔ Withdrawal complete";
    saveTx("WithdrawReserve", `${amount} ETH to ${to}`);

    await loadOnChainContractInfo();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "? " + decodeRevertError(err);
  }
};

/* --------------------------------------------------------
   BLACKLIST CHECK
---------------------------------------------------------*/
document.getElementById("checkBlacklistButton").onclick = async () => {
  const addr = document.getElementById("checkBlacklistAddress").value.trim();
  const status = document.getElementById("checkBlacklistStatus");

  if (!addr) {
    status.textContent = "Please enter address";
    return;
  }

  try {
    const res = await contract.blacklisted(addr);
    status.textContent = res ? "🚫 Address is blacklisted" : "✔ Address is clear";

  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

/* --------------------------------------------------------
   MINT (ADMIN ONLY)
---------------------------------------------------------*/
const mintBtn = document.getElementById("mintButton");
if (mintBtn) {
  mintBtn.onclick = async () => {
    const to = document.getElementById("mintAddress").value.trim();
    const amount = document.getElementById("mintAmount").value.trim();
    const status = document.getElementById("mintStatus");

    if (!to || !amount) {
      status.textContent = "Please enter address and amount";
      return;
    }

    try {
      const parsed = ethers.parseUnits(amount, tokenDecimals);

      status.textContent = "Minting...";
      const tx = await contract.mint(to, parsed);
      await tx.wait();

      status.textContent = `✔ Minted ${amount} ILSX to ${to}`;
      saveTx("Mint", `${amount} ILSX → ${to}`);

      await loadOnChainContractInfo();
      await loadMyBalance();
      await refreshAnalyticsAndCharts();
    } catch (err) {
      status.textContent = "❌ " + err.message;
    }
  };
}

/* --------------------------------------------------------
   BURN (ADMIN ONLY)
---------------------------------------------------------*/
const burnBtn = document.getElementById("burnButton");
if (burnBtn) {
  burnBtn.onclick = async () => {
    const amount = document.getElementById("burnAmount").value.trim();
    const status = document.getElementById("burnStatus");

    if (!amount) {
      status.textContent = "Please enter amount";
      return;
    }

    try {
      const parsed = ethers.parseUnits(amount, tokenDecimals);

      status.textContent = "Burning...";
      const tx = await contract.burn(await signer.getAddress(), parsed);
      await tx.wait();

      status.textContent = `🔥 Burned ${amount} ILSX`;
      saveTx("Burn", `${amount} ILSX burned`);

      await loadOnChainContractInfo();
      await loadMyBalance();
      await refreshAnalyticsAndCharts();
    } catch (err) {
      status.textContent = "❌ " + err.message;
    }
  };
}

/* --------------------------------------------------------
   PAUSE / UNPAUSE
---------------------------------------------------------*/
document.getElementById("pauseButton").onclick = async () => {
  const status = document.getElementById("pauseStatus");
  try {
    const tx = await contract.pause();
    await tx.wait();
    status.textContent = "⏸ Paused";
    saveTx("Pause", "Contract paused");
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

document.getElementById("unpauseButton").onclick = async () => {
  const status = document.getElementById("pauseStatus");
  try {
    const tx = await contract.unpause();
    await tx.wait();
    status.textContent = "▶ Unpaused";
    saveTx("Unpause", "Contract unpaused");
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

/* --------------------------------------------------------
   BLACKLIST ADMIN
---------------------------------------------------------*/
document.getElementById("blacklistButton").onclick = async () => {
  const addr = document.getElementById("blacklistAddress").value.trim();
  const status = document.getElementById("blacklistStatus");

  if (!addr) {
    status.textContent = "Please enter address";
    return;
  }

  try {
    status.textContent = "Blacklisting...";
    const tx = await contract.blacklist(addr);
    await tx.wait();
    status.textContent = "🚫 Blacklisted";
    saveTx("Blacklist", addr);
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

document.getElementById("unblacklistButton").onclick = async () => {
  const addr = document.getElementById("blacklistAddress").value.trim();
  const status = document.getElementById("blacklistStatus");

  if (!addr) {
    status.textContent = "Please enter address";
    return;
  }

  try {
    status.textContent = "Unblocking...";
    const tx = await contract.unblacklist(addr);
    await tx.wait();
    status.textContent = "✔ Removed from blacklist";
    saveTx("Unblacklist", addr);
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

const freezeBtn = document.getElementById("freezeButton");
if (freezeBtn) {
  freezeBtn.onclick = async () => {
    const addrInput = document.getElementById("freezeAddress") || document.getElementById("blacklistAddress");
    const status = document.getElementById("freezeStatus") || document.getElementById("blacklistStatus");
    const addr = addrInput ? addrInput.value.trim() : "";

    if (!addr) {
      if (status) status.textContent = "Please enter address";
      return;
    }

    try {
      if (status) status.textContent = "Freezing...";
      const tx = await contract.freeze(addr);
      await tx.wait();
      if (status) status.textContent = "🧊 Frozen";
      saveTx("Freeze", addr);
      await refreshAnalyticsAndCharts();
    } catch (err) {
      if (status) status.textContent = "❌ " + err.message;
    }
  };
}

const unfreezeBtn = document.getElementById("unfreezeButton");
if (unfreezeBtn) {
  unfreezeBtn.onclick = async () => {
    const addrInput = document.getElementById("freezeAddress") || document.getElementById("blacklistAddress");
    const status = document.getElementById("freezeStatus") || document.getElementById("blacklistStatus");
    const addr = addrInput ? addrInput.value.trim() : "";

    if (!addr) {
      if (status) status.textContent = "Please enter address";
      return;
    }

    try {
      if (status) status.textContent = "Unfreezing...";
      const tx = await contract.unfreeze(addr);
      await tx.wait();
      if (status) status.textContent = "✔ Unfrozen";
      saveTx("Unfreeze", addr);
      await refreshAnalyticsAndCharts();
    } catch (err) {
      if (status) status.textContent = "❌ " + err.message;
    }
  };
}

/* --------------------------------------------------------
   ROLES DISPLAY + ADMIN UI
---------------------------------------------------------*/
function applyRoleUI(isAdmin) {
  const adminEls = document.querySelectorAll(".admin-only");
  adminEls.forEach(el => {
    if (isAdmin) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

applyRoleUI(false);

async function loadRoles() {
  if (!contract) return;

  const addr = await signer.getAddress();

  await refreshRoleIds();

  const roles = [];

  const adminRole = await getRoleId("DEFAULT_ADMIN_ROLE");
  const isAdmin = await contract.hasRole(adminRole, addr);

  const roleChecks = [
    ["MINTER_ROLE", "Minter"],
    ["BURNER_ROLE", "Burner"],
    ["PAUSER_ROLE", "Pauser"],
    ["BLACKLISTER_ROLE", "Blacklister"],
    ["RESERVE_ROLE", "Reserve"],
    ["RATE_SETTER_ROLE", "RateSetter"],
    ["FREEZER_ROLE", "Freezer"]
  ];

  for (const [key, label] of roleChecks) {
    const roleId = await getRoleId(key);
    if (await contract.hasRole(roleId, addr)) roles.push(label);
  }

  setText("roleList", roles.join(" | ") || "-");

  applyRoleUI(isAdmin);
}

async function handleRoleUpdate(mode) {
  const addressEl = document.getElementById("roleManageAddress");
  const typeEl = document.getElementById("roleManageType");
  const status = document.getElementById("roleManageStatus");

  if (!addressEl || !typeEl || !status) return;

  const target = addressEl.value.trim();
  const roleKey = typeEl.value;

  if (!target || !roleKey) {
    status.textContent = "נא להזין כתובת ותפקיד";
    return;
  }

  if (!contract) {
    status.textContent = "התחבר לארנק תחילה";
    return;
  }

  try {
    const roleId = await getRoleId(roleKey);
    status.textContent = mode === "grant" ? "מוסיף תפקיד..." : "מסיר תפקיד...";
    const tx = mode === "grant"
      ? await contract.grantRole(roleId, target)
      : await contract.revokeRole(roleId, target);
    await tx.wait();

    status.textContent = mode === "grant" ? "✔ התפקיד נוסף" : "✔ התפקיד הוסר";
    saveTx(mode === "grant" ? "GrantRole" : "RevokeRole", `${roleKey} ${target}`);

    await loadRoles();
    await refreshAnalyticsAndCharts();
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
}

const grantRoleButton = document.getElementById("grantRoleButton");
if (grantRoleButton) {
  grantRoleButton.onclick = () => handleRoleUpdate("grant");
}

const revokeRoleButton = document.getElementById("revokeRoleButton");
if (revokeRoleButton) {
  revokeRoleButton.onclick = () => handleRoleUpdate("revoke");
}

/* --------------------------------------------------------
   SIDEBAR NAVIGATION
---------------------------------------------------------*/
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.section;
    const section = document.getElementById(targetId);

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn("🔍 Section not found:", targetId);
    }
  });
});

// —— Chainlink ETH/USD Feed על רשת Sepolia —— 
const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

const aggregatorAbi = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { type: "uint80" },
      { type: "int256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint80" }
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  }
];

/* --------------------------------------------------------
   FX HELPERS — USD/ILS & ETH/USD
   שימוש ב-API חינמי ומדויק יותר, עם fallback ל-API הקודם
---------------------------------------------------------*/

async function getUsdIlsRate() {
  // ניסיון ראשי: exchangerate.host (חינמי, ללא API KEY)
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=ILS");

    if (res.ok) {
      const json = await res.json();
      if (json && json.rates && json.rates.ILS) {
        console.log("FX API (exchangerate.host) ILS:", json.rates.ILS);
        return json.rates.ILS;
      }
    } else {
      console.log("❌ exchangerate.host HTTP Error:", res.status);
    }
  } catch (err) {
    console.log("❌ exchangerate.host fetch error:", err);
  }

  // Fallback: open.er-api.com (ה־API שבו השתמשת קודם)
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");

    if (!res.ok) {
      console.log("❌ FX API HTTP Error:", res.status);
      return null;
    }

    const json = await res.json();
    if (!json || !json.rates || !json.rates.ILS) {
      console.log("❌ FX API returned no ILS rate!");
      return null;
    }

    return json.rates.ILS;

  } catch (err) {
    console.log("❌ FX API fetch error (fallback):", err);
    return null;
  }
}


async function getEthUsdRate() {

  // ניסיון ראשי: Chainlink על Sepolia
  try {
    const rpc = new ethers.JsonRpcProvider(
      "https://sepolia.infura.io/v3/fda2863bb17f492dbe50418435f09efd"
    );
    const feed = new ethers.Contract(ETH_USD_FEED, aggregatorAbi, rpc);

    const decimalsBig = await feed.decimals();

    if (!decimalsBig) {
      console.log("❌ decimalsBig is null/undefined");
      throw new Error("No decimals from Chainlink");
    }

    const decimals = Number(decimalsBig.toString());

    const round = await feed.latestRoundData();

    const answerBig = round[1];

    if (answerBig == null) {
      console.log("❌ answerBig is null/undefined");
      throw new Error("No answer from Chainlink");
    }
    if (answerBig <= 0n) {
      console.log("❌ answerBig <= 0n");
      throw new Error("Non-positive answer from Chainlink");
    }

    const answer = Number(answerBig.toString());

    const scale = 10 ** decimals;

    const result = answer / scale;

    return result;

  } catch (e) {
    console.log("❌ ERROR in getEthUsdRate (Chainlink failed):");
    console.error(e);
    console.log("Trying public REST fallback (CoinGecko)...");

    // Fallback: CoinGecko public API ל-ETH/USD
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      if (!res.ok) {
        console.log("❌ CoinGecko HTTP Error:", res.status);
        return null;
      }
      const json = await res.json();
      if (
        json &&
        json.ethereum &&
        typeof json.ethereum.usd === "number" &&
        json.ethereum.usd > 0
      ) {
        console.log("CoinGecko ETH/USD:", json.ethereum.usd);
        console.log("----- Oracle ETH/USD Debug END (CoinGecko) -----");
        return json.ethereum.usd;
      }
      console.log("❌ CoinGecko returned invalid ETH/USD");
      console.log("----- Oracle ETH/USD Debug END (CoinGecko ERROR) -----");
      return null;
    } catch (err) {
      console.log("❌ ERROR in CoinGecko fallback:", err);
      console.log("----- Oracle ETH/USD Debug END (ERROR) -----");
      return null;
    }
  }
}

/* --------------------------------------------------------
   ORACLE LOAD + AUTO REFRESH
---------------------------------------------------------*/
async function loadOracleData() {
  if (!provider) {
    console.log("provider not ready yet");
    return;
  }

  const ethUsd = await getEthUsdRate();
  const usdIls = await getUsdIlsRate();

  if (!ethUsd || !usdIls || ethUsd <= 0 || usdIls <= 0) {
    console.log("❌ loadOracleData: Missing/invalid value:", { ethUsd, usdIls });
    setOracleStatus(false);
    return; // לא מוחקים ערכים תקינים קיימים
  }

  const ethIls = ethUsd * usdIls;

  const ethUsdEl = document.getElementById("oracleEthUsd");
  if (ethUsdEl) ethUsdEl.textContent = ethUsd.toFixed(2);

  const usdIlsEl = document.getElementById("oracleUsdIls");
  if (usdIlsEl) usdIlsEl.textContent = usdIls.toFixed(4);

  const ethIlsEl = document.getElementById("oracleEthIls");
  if (ethIlsEl) ethIlsEl.textContent = ethIls.toFixed(2);

  const tsEl = document.getElementById("oracleTimestamp");
  if (tsEl) tsEl.textContent = new Date().toLocaleString();

  // שמירה גלובלית לשימוש בכפתור "העתק שער עדכני"
  window.latestOracleEthUsd = ethUsd;
  window.latestOracleUsdIls = usdIls;
  window.latestOracleEthIls = ethIls;

  setOracleStatus(true);
  updateOracleHistory(ethUsd, usdIls, ethIls);
}

function startOracleAutoRefresh() {
  if (oracleAutoInterval) clearInterval(oracleAutoInterval);
  oracleAutoInterval = setInterval(() => {
    loadOracleData();
  }, 10000); // כל 10 שניות
}


/* ידני: כפתור "רענן שער (Oracle)" */
document.getElementById("oracleUpdateButton").onclick = async () => {
  const box = document.getElementById("oracleUpdateStatus");
  box.textContent = "מרענן...";

  await loadOracleData();

  box.textContent = lastOracleOnline
    ? "✔ עודכן!"
    : "⚠️ כשל בעדכון — Oracle Offline";
};


document.addEventListener("DOMContentLoaded", () => {
  console.log("ILSX Dashboard Loaded ✔");

  // הדפסת וידוא שהכפתורים קיימים
  console.log("Mint button:", document.getElementById("mintButton"));
  console.log("Burn button:", document.getElementById("burnButton"));
  console.log("Sidebar buttons:", document.querySelectorAll(".nav-btn").length);
});

/* --------------------------------------------------------
   END OF FILE
---------------------------------------------------------*/
