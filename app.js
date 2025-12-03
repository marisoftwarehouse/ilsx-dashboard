const { ethers } = window.ethers;

const CONTRACT_ADDRESS = "0x1E5B771DF24401F92F67dAEA77333Dc5F1Af71aD";


/* --------------------------------------------------------
   ABI — Updated to full DigitalShekel contract
---------------------------------------------------------*/
const CONTRACT_ABI = [

  // Basic ERC20
  { "inputs": [], "name": "name", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "symbol", "outputs": [{ "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "decimals", "outputs": [{ "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalSupply", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "type": "address" }], "name": "balanceOf", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },

  // Mint / Burn — Admin Only
  { "inputs": [{ "type": "address" }, { "type": "uint256" }], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "type": "address" }, { "type": "uint256" }], "name": "burn", "outputs": [], "stateMutability": "nonpayable", "type": "function" },

  // Stablecoin BUY / SELL
  { "inputs": [], "name": "buyTokensWithETH", "outputs": [], "stateMutability": "payable", "type": "function" },
  { "inputs": [{ "type": "uint256" }], "name": "sellTokensForETH", "outputs": [], "stateMutability": "nonpayable", "type": "function" },

  // Reserve + Rate
  { "inputs": [], "name": "reserveBalance", "outputs": [{ "type": "uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "tokensPerEth", "outputs": [{ "type": "uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "type": "uint256"}], "name": "setTokensPerEth", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "fundReserve", "outputs": [], "stateMutability": "payable", "type": "function" },
  { "inputs": [{ "type": "address" }, { "type": "uint256" }], "name": "withdrawReserve", "outputs": [], "stateMutability": "nonpayable", "type": "function" },

  // Pause / Unpause
  { "inputs": [], "name": "pause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "unpause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },

  // Blacklist
  { "inputs": [{ "type": "address" }], "name": "blacklist", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "type": "address" }], "name": "unblacklist", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "type": "address"}], "name": "blacklisted", "outputs": [{ "type": "bool"}], "stateMutability": "view", "type": "function"},

  // Roles
  { "inputs": [{ "type": "bytes32" }, { "type": "address" }], "name": "hasRole", "outputs": [{ "type": "bool" }], "stateMutability": "view", "type": "function" },

];

/* --------------------------------------------------------
   GLOBALS
---------------------------------------------------------*/
let provider, signer, contract;
let supplyChart;
let oracleChart;
let oracleAutoInterval = null;
let lastOracleOnline = false;
window.provider = null;

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

  localStorage.setItem(key, JSON.stringify(list));
  renderHistory();
}

function renderHistory() {
  const key = "ilsx_tx_history";
  const list = JSON.parse(localStorage.getItem(key) || "[]" );
  const box = document.getElementById("txHistory");
  if (!box) return;
  box.innerHTML = "";

  list.forEach(tx => {
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
   SUPPLY CHART (LocalStorage History)
---------------------------------------------------------*/
function updateSupplyHistory(supplyStr) {
  const key = "ilsx_supply_history";
  let list = JSON.parse(localStorage.getItem(key) || "[]");

  if (!list.length || list[0].value !== supplyStr) {
    list.unshift({
      time: new Date().toLocaleString(),
      value: supplyStr
    });
    localStorage.setItem(key, JSON.stringify(list));
  }

  renderSupplyChart();
}

function renderSupplyChart() {
  const canvas = document.getElementById("supplyChart");
  if (!canvas) return;

  const list = JSON.parse(localStorage.getItem("ilsx_supply_history") || "[]");
  if (!list.length) {
    if (supplyChart) supplyChart.destroy();
    return;
  }

  const reversed = list.slice().reverse();
  const labels = reversed.map(x => x.time);
  const data = reversed.map(x => Number(x.value));

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
        tension: 0.4
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
renderSupplyChart();

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
  try {
    await ethereum.request({ method: "eth_requestAccounts" });
    // Require user to switch network to Sepolia
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // chainId of Sepolia
    });

    window.provider = new ethers.BrowserProvider(window.ethereum);
    provider = window.provider;

    signer = await provider.getSigner();

    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const addr = await signer.getAddress();
    document.getElementById("myAddress").textContent = addr;
    document.getElementById("contractAddress").textContent = CONTRACT_ADDRESS;
    document.getElementById("sidebarContractShort").textContent =
      CONTRACT_ADDRESS.slice(0, 6) + "..." + CONTRACT_ADDRESS.slice(-4);

    document.getElementById("connectionStatus").textContent = "מחובר ✓";

    await loadContractInfo();
    await loadMyBalance();
    await loadRoles();
    await loadOracleData();
    startOracleAutoRefresh();
  } catch (err) {
    alert("שגיאה בהתחברות: " + err.message);
  }
}

/* --------------------------------------------------------
   LOAD CONTRACT INFO (supply + rate + reserve)
---------------------------------------------------------*/
async function loadContractInfo() {
  const [name, symbol, supply, decimals, rate, reserve] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.totalSupply(),
    contract.decimals(),
    contract.tokensPerEth(),
    contract.reserveBalance()
  ]);

  const total = ethers.formatUnits(supply, decimals);
  const formattedRate = ethers.formatUnits(rate, 18);
  const reserveEth = ethers.formatEther(reserve);

  document.getElementById("tokenName").textContent = name;
  document.getElementById("tokenSymbol").textContent = symbol;
  document.getElementById("totalSupply").textContent = total + " " + symbol;
  document.getElementById("rateInfo").textContent = `${formattedRate} ILSX / ETH`;
  document.getElementById("reserveInfo").textContent = `${reserveEth} ETH`;

  updateSupplyHistory(total);
}

/* --------------------------------------------------------
   LOAD USER BALANCE
---------------------------------------------------------*/
async function loadMyBalance() {
  const addr = await signer.getAddress();
  const decimals = await contract.decimals();
  const raw = await contract.balanceOf(addr);
  const formatted = ethers.formatUnits(raw, decimals);
  document.getElementById("myBalance").textContent = `${formatted} ILSX`;
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
    await loadContractInfo();
  } catch (err) {
    status.textContent = "❌ " + err.message;
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
    const decimals = await contract.decimals();
    const parsed = ethers.parseUnits(amount, decimals);

    status.textContent = "מוכר...";
    const tx = await contract.sellTokensForETH(parsed);
    await tx.wait();

    status.textContent = "✔ נמכר וקיבלת ETH";
    saveTx("Sell", `${amount} ILSX → ETH`);

    await loadMyBalance();
    await loadContractInfo();
  } catch (err) {
    status.textContent = "❌ " + err.message;
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

  // אם השדה ריק – ננסה להשתמש בשער העדכני מה־Oracle
  if (!rate) {
    const ethUsd = window.latestOracleEthUsd;
    const usdIls = window.latestOracleUsdIls;

    if (ethUsd && usdIls && ethUsd > 0 && usdIls > 0) {
      const ethIls = ethUsd * usdIls;
      rate = ethIls.toFixed(4);
      input.value = rate;
    } else {
      status.textContent = "אין שער עדכני זמין. לחץ על 'העתק שער עדכני' או הזן ידנית.";
      return;
    }
  }

  try {
    const parsed = ethers.parseUnits(rate, 18);

    status.textContent = "מעדכן...";
    const tx = await contract.setTokensPerEth(parsed);
    await tx.wait();

    status.textContent = "✔ השער עודכן";
    saveTx("SetRate", `Updated rate to ${rate} ILSX/ETH`);

    await loadContractInfo();
    // רענון גם של ה־Oracle להצגה עקבית
    await loadOracleData();
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

/* --------------------------------------------------------
   FUND RESERVE (Admin-only)
---------------------------------------------------------*/
document.getElementById("fundButton").onclick = async () => {
  const amount = document.getElementById("fundAmount").value.trim();
  const status = document.getElementById("fundStatus");

  if (!amount) {
    status.textContent = "נא להזין כמות ETH";
    return;
  }

  try {
    status.textContent = "מפקיד...";
    const tx = await contract.fundReserve({
      value: ethers.parseEther(amount)
    });
    await tx.wait();

    status.textContent = "✔ הופקד בהצלחה";
    saveTx("FundReserve", `${amount} ETH deposited`);

    await loadContractInfo();
  } catch (err) {
    status.textContent = "❌ " + err.message;
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
    status.textContent = "נא להזין נתונים";
    return;
  }

  try {
    status.textContent = "מושך...";
    const tx = await contract.withdrawReserve(to, ethers.parseEther(amount));
    await tx.wait();

    status.textContent = "✔ נמשך בהצלחה";
    saveTx("WithdrawReserve", `${amount} ETH to ${to}`);

    await loadContractInfo();
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

/* --------------------------------------------------------
   BLACKLIST CHECK
---------------------------------------------------------*/
document.getElementById("checkBlacklistButton").onclick = async () => {
  const addr = document.getElementById("checkBlacklistAddress").value.trim();
  const status = document.getElementById("checkBlacklistStatus");

  if (!addr) {
    status.textContent = "נא להזין כתובת";
    return;
  }

  try {
    const res = await contract.blacklisted(addr);
    status.textContent = res ? "🚫 כתובת חסומה" : "✔ הכתובת אינה חסומה";

  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

/* --------------------------------------------------------
   MINT (ADMIN ONLY)
---------------------------------------------------------*/
const mintBtn = document.getElementById("mintButton");
if (mintBtn) {
  console.log("Mint listener attached");
  mintBtn.onclick = async () => {
    const to = document.getElementById("mintAddress").value.trim();
    const amount = document.getElementById("mintAmount").value.trim();
    const status = document.getElementById("mintStatus");

    if (!to || !amount) {
      status.textContent = "נא להזין כתובת וכמות";
      return;
    }

    try {
      const decimals = await contract.decimals();
      const parsed = ethers.parseUnits(amount, decimals);

      status.textContent = "מבצע הנפקה...";
      const tx = await contract.mint(to, parsed);
      await tx.wait();

      status.textContent = `✔ הונפקו ${amount} ILSX ל־${to}`;
      saveTx("Mint", `${amount} ILSX → ${to}`);

      await loadContractInfo();
      await loadMyBalance();
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
  console.log("Burn listener attached");
  burnBtn.onclick = async () => {
    const amount = document.getElementById("burnAmount").value.trim();
    const status = document.getElementById("burnStatus");

    if (!amount) {
      status.textContent = "נא להזין כמות";
      return;
    }

    try {
      const decimals = await contract.decimals();
      const parsed = ethers.parseUnits(amount, decimals);

      status.textContent = "שורף...";
      const tx = await contract.burn(await signer.getAddress(), parsed);
      await tx.wait();

      status.textContent = `🔥 נשרפו ${amount} ILSX`;
      saveTx("Burn", `${amount} ILSX burned`);

      await loadContractInfo();
      await loadMyBalance();
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
    status.textContent = "⏸ נעצר";
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
    status.textContent = "▶ הופעל";
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
    status.textContent = "נא להזין כתובת";
    return;
  }

  try {
    const tx = await contract.blacklist(addr);
    await tx.wait();
    status.textContent = "🚫 נחסם";
    saveTx("Blacklist", addr);
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

document.getElementById("unblacklistButton").onclick = async () => {
  const addr = document.getElementById("blacklistAddress").value.trim();
  const status = document.getElementById("blacklistStatus");

  if (!addr) {
    status.textContent = "נא להזין כתובת";
    return;
  }

  try {
    const tx = await contract.unblacklist(addr);
    await tx.wait();
    status.textContent = "✔ שוחרר";
    saveTx("Unblacklist", addr);
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
};

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

async function loadRoles() {
  const addr = await signer.getAddress();

  const roles = [];

  // DEFAULT_ADMIN_ROLE = 0x00
  const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

  const isAdmin = await contract.hasRole(ADMIN_ROLE, addr);

  if (isAdmin) roles.push("Admin");
  if (await contract.hasRole(ethers.id("MINTER_ROLE"), addr)) roles.push("Minter");
  if (await contract.hasRole(ethers.id("PAUSER_ROLE"), addr)) roles.push("Pauser");
  if (await contract.hasRole(ethers.id("BLACKLISTER_ROLE"), addr)) roles.push("Blacklister");

  document.getElementById("roleList").textContent = roles.join(" | ") || "—";

  applyRoleUI(isAdmin);
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
