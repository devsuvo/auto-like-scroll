const $ = (id) => document.getElementById(id);
const CFG = globalThis.AutoLikeConfig;
const { SITE_NAMES, RULE_KEYS, RULE_DEFAULTS, TIPS, DEFAULTS, siteFromHost } = CFG;
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

let currentTab = null;
let currentSite = null;
let ruleSite = "tiktok"; // "Site-এর নিয়ম" কার্ডে যে site দেখানো হচ্ছে

function fmtLeft(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} ঘণ্টা ${m % 60} মিনিট` : `${m} মিনিট`;
}

// ---- উপরের অংশ: এই tab-এর অবস্থা ----
function renderHero(v) {
  const now = Date.now();
  const tabOn = currentTab && v.enabledTabs.includes(currentTab.id);
  const siteOn = currentSite && v.sites[currentSite] !== false;
  const doing = v.autoLike || v.autoScroll;
  const blockedUntil = currentSite ? (v.siteBlockedUntil || {})[currentSite] || 0 : 0;
  const blocked = blockedUntil > now;

  $("siteName").textContent = currentSite ? SITE_NAMES[currentSite] : "সমর্থিত site নয়";
  $("tabOn").checked = !!tabOn;
  $("tabOn").disabled = !currentSite;
  $("unblock").hidden = !blocked;

  let text = "বন্ধ", cls = "off";
  if (!currentSite) text = "এই page-এ চলবে না";
  else if (blocked) { text = `সতর্কবার্তা পেয়ে বন্ধ (${fmtLeft(blockedUntil - now)} বাকি)`; cls = "bad"; }
  else if (tabOn && !siteOn) { text = `${SITE_NAMES[currentSite]} নিচে বন্ধ করা`; cls = "warn"; }
  else if (tabOn && !doing) { text = "Like/Scroll কোনোটাই চালু নয়"; cls = "warn"; }
  else if (tabOn) { text = "এই tab-এ চলছে"; cls = "on"; }
  $("tabState").textContent = text;
  $("tabState").className = "pill " + cls;

  const w = v.lastWarning;
  if (blocked && w && w.site === currentSite) {
    $("status").textContent = `${SITE_NAMES[currentSite]} দেখিয়েছে: "${w.text}"। আগে ঐ বার্তা বন্ধ করুন, তারপর চালু করুন।`;
  }
}

// ---- site-এর নিয়ম ----
function renderRule(v) {
  const k = RULE_KEYS[ruleSite];
  $("ruleSite").value = ruleSite;
  $("ruleMin").value = v[k.min];
  $("ruleMax").value = v[k.max];
  $("ruleChance").value = v[k.chance];
  $("ruleHourly").value = v[k.hourly];
  $("ruleDaily").value = v[k.daily];
  $("ruleWaitLabel").textContent = ruleSite === "tiktok" ? "প্রতিটা ভিডিও দেখবে" : "প্রতিটা পোস্টে অপেক্ষা";
  $("ruleTip").textContent = TIPS[ruleSite];

  const now = Date.now();
  const list = (v.likeLog || {})[ruleSite] || [];
  const hour = list.filter((t) => now - t < HOUR).length;
  const day = list.filter((t) => now - t < DAY).length;
  $("ruleCount").textContent = `${SITE_NAMES[ruleSite]}: শেষ ১ ঘণ্টায় ${hour}টা, ২৪ ঘণ্টায় ${day}টা like`;
}

function render(v) {
  for (const id of ["autoLike", "autoScroll", "blockSensitive", "humanize", "stopOnWarning"]) {
    $(id).checked = !!v[id];
  }
  $("speed").value = v.speed;
  $("breakAfter").value = v.breakAfter;
  $("breakMin").value = v.breakMin;
  $("reloadEvery").value = v.reloadEvery;
  $("blockWords").value = v.blockWords;
  document.querySelectorAll("[data-site]").forEach((el) => {
    el.checked = v.sites[el.dataset.site] !== false;
  });
  renderHero(v);
  renderRule(v);
}

function reload() {
  chrome.storage.local.get(DEFAULTS, render);
}

// tab-এ script না থাকলে (extension reload-এর পর) inject
async function ensureInjected() {
  if (!currentTab || !currentSite) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["config.js", "filter.js", "content.js"]
    });
  } catch (e) {
    $("status").textContent = "চালু করা যায়নি: " + e.message + " (tab refresh করুন)";
  }
}

// ---- events ----
$("tabOn").addEventListener("change", () => {
  chrome.storage.local.get({ enabledTabs: [] }, (v) => {
    const set = new Set(v.enabledTabs);
    if ($("tabOn").checked) set.add(currentTab.id); else set.delete(currentTab.id);
    chrome.storage.local.set({ enabledTabs: [...set] }, reload);
    if ($("tabOn").checked) ensureInjected();
  });
});

for (const id of ["autoLike", "autoScroll", "blockSensitive", "humanize", "stopOnWarning"]) {
  $(id).addEventListener("change", () => chrome.storage.local.set({ [id]: $(id).checked }, reload));
}

$("speed").addEventListener("change", () => chrome.storage.local.set({ speed: $("speed").value }));
$("blockWords").addEventListener("change", () => chrome.storage.local.set({ blockWords: $("blockWords").value }));

function clampInput(el, lo, hi, whole) {
  let n = parseFloat(el.value);
  if (!Number.isFinite(n)) n = lo;
  n = Math.min(hi, Math.max(lo, whole ? Math.round(n) : n));
  el.value = n;
  return n;
}

const NUM_FIELDS = { breakAfter: [0, 1000], breakMin: [0, 600], reloadEvery: [0, 600] };
for (const [id, [lo, hi]] of Object.entries(NUM_FIELDS)) {
  $(id).addEventListener("change", () => chrome.storage.local.set({ [id]: clampInput($(id), lo, hi, true) }));
}

// site-এর নিয়মের ঘর: id → [কোন নিয়ম, কম, বেশি, পূর্ণসংখ্যা?]
const RULE_FIELDS = {
  ruleMin: ["min", 1, 600, false],
  ruleMax: ["max", 1, 600, false],
  ruleChance: ["chance", 0, 100, true],
  ruleHourly: ["hourly", 0, 1000, true],
  ruleDaily: ["daily", 0, 10000, true]
};
for (const [id, [field, lo, hi, whole]] of Object.entries(RULE_FIELDS)) {
  $(id).addEventListener("change", () => {
    chrome.storage.local.set({ [RULE_KEYS[ruleSite][field]]: clampInput($(id), lo, hi, whole) }, reload);
  });
}

$("ruleSite").addEventListener("change", () => {
  ruleSite = $("ruleSite").value;
  reload();
});

$("ruleReset").addEventListener("click", () => {
  const d = {};
  for (const key of Object.values(RULE_KEYS[ruleSite])) d[key] = RULE_DEFAULTS[key];
  chrome.storage.local.set(d, reload);
});

$("unblock").addEventListener("click", () => {
  chrome.storage.local.get({ siteBlockedUntil: {} }, (v) => {
    const s = { ...v.siteBlockedUntil };
    delete s[currentSite];
    chrome.storage.local.set({ siteBlockedUntil: s }, reload);
  });
});

document.querySelectorAll("[data-site]").forEach((el) => {
  el.addEventListener("change", () => {
    chrome.storage.local.get({ sites: DEFAULTS.sites }, (v) => {
      const sites = { ...DEFAULTS.sites, ...v.sites, [el.dataset.site]: el.checked };
      chrome.storage.local.set({ sites }, reload);
    });
  });
});

// minimize করলে Chrome page আঁকা বন্ধ করে, TikTok নতুন ভিডিও load করে না।
// তাই tab-টা screen-এর ডান-নিচের কোণে ছোট window-এ সরানো হয়: চোখে পড়ে, page চলতে থাকে।
$("bgWindow").addEventListener("click", () => {
  if (!currentTab) return;
  const w = 420, h = 720;
  const left = Math.max(0, (screen.availLeft || 0) + screen.availWidth - w - 10);
  const top = Math.max(0, (screen.availTop || 0) + screen.availHeight - h - 10);
  chrome.windows.create(
    { tabId: currentTab.id, type: "normal", width: w, height: h, left, top, focused: false },
    () => {
      if (chrome.runtime.lastError) {
        $("status").textContent = "সরানো যায়নি: " + chrome.runtime.lastError.message;
        return;
      }
      $("status").textContent = "সরানো হয়েছে। ঐ ছোট window minimize করবেন না, অন্য window-এর পাশে রাখুন।";
      $("bgWindow").disabled = true;
    }
  );
});

// ---- শুরু ----
$("ver").textContent = "v" + chrome.runtime.getManifest().version;
const st = globalThis.AutoLikeFilter && globalThis.AutoLikeFilter.stats;
if (st) {
  $("filterStats").textContent =
    `ইসলামিক ${st.islamic}টি, অন্য ধর্ম ${st.religion}টি, রাজনৈতিক ${st.politics}টি শব্দ + আরবি লেখা`;
}
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentTab = tab || null;
  let host = "";
  try { host = new URL((tab && tab.url) || "").hostname; } catch (e) { /* chrome:// ইত্যাদি */ }
  currentSite = siteFromHost(host);
  ruleSite = currentSite || "tiktok";
  reload();
});
