const $ = (id) => document.getElementById(id);

const SITE_NAMES = {
  tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook",
  instagram: "Instagram", twitter: "X / Twitter"
};

const DEFAULTS = {
  autoLike: false, autoScroll: false, speed: "slow",
  gapMinMin: 1, gapMaxMin: 3, likeChance: 60,
  blockSensitive: true, blockWords: "",
  sites: { tiktok: true, linkedin: true, facebook: true, instagram: true, twitter: true },
  enabledTabs: []
};

let currentTab = null;
let currentSite = null;

function siteFromUrl(url) {
  let h = "";
  try { h = new URL(url).hostname; } catch (e) { return null; }
  if (h.endsWith("tiktok.com")) return "tiktok";
  if (h.endsWith("linkedin.com")) return "linkedin";
  if (h.endsWith("facebook.com")) return "facebook";
  if (h.endsWith("instagram.com")) return "instagram";
  if (h === "x.com" || h.endsWith(".x.com") || h.endsWith("twitter.com")) return "twitter";
  return null;
}

// উপরের অংশ: এই tab-এর অবস্থা
function renderHero(v) {
  const tabOn = currentTab && v.enabledTabs.includes(currentTab.id);
  const siteOn = currentSite && v.sites[currentSite] !== false;
  const doing = v.autoLike || v.autoScroll;

  $("siteName").textContent = currentSite ? SITE_NAMES[currentSite] : "সমর্থিত site নয়";
  $("tabOn").checked = !!tabOn;
  $("tabOn").disabled = !currentSite;

  const pill = $("tabState");
  let text = "বন্ধ", cls = "off";
  if (!currentSite) { text = "এই page-এ চলবে না"; }
  else if (tabOn && !siteOn) { text = `${SITE_NAMES[currentSite]} নিচে বন্ধ করা`; cls = "warn"; }
  else if (tabOn && !doing) { text = "Like/Scroll কোনোটাই চালু নয়"; cls = "warn"; }
  else if (tabOn) { text = "এই tab-এ চলছে"; cls = "on"; }
  pill.textContent = text;
  pill.className = "pill " + cls;
}

function render(v) {
  $("autoLike").checked = !!v.autoLike;
  $("autoScroll").checked = !!v.autoScroll;
  $("speed").value = v.speed;
  $("gapMinMin").value = v.gapMinMin;
  $("gapMaxMin").value = v.gapMaxMin;
  $("likeChance").value = v.likeChance;
  $("blockSensitive").checked = v.blockSensitive !== false;
  $("blockWords").value = v.blockWords;
  document.querySelectorAll("[data-site]").forEach((el) => {
    el.checked = v.sites[el.dataset.site] !== false;
  });
  renderHero(v);
}

function reload() {
  chrome.storage.local.get(DEFAULTS, render);
}

// tab-এ script না থাকলে (extension reload-এর পর) inject
async function ensureInjected() {
  if (!currentTab || !currentSite) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
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

for (const id of ["autoLike", "autoScroll", "blockSensitive"]) {
  $(id).addEventListener("change", () => chrome.storage.local.set({ [id]: $(id).checked }, reload));
}

$("speed").addEventListener("change", () => chrome.storage.local.set({ speed: $("speed").value }));
$("blockWords").addEventListener("change", () => chrome.storage.local.set({ blockWords: $("blockWords").value }));

const NUM_FIELDS = { gapMinMin: [0, 60], gapMaxMin: [0, 60], likeChance: [0, 100] };
for (const [id, [lo, hi]] of Object.entries(NUM_FIELDS)) {
  $(id).addEventListener("change", () => {
    const n = Math.min(hi, Math.max(lo, parseFloat($(id).value) || 0));
    $(id).value = n;
    chrome.storage.local.set({ [id]: n });
  });
}

document.querySelectorAll("[data-site]").forEach((el) => {
  el.addEventListener("change", () => {
    chrome.storage.local.get({ sites: DEFAULTS.sites }, (v) => {
      const sites = { ...DEFAULTS.sites, ...v.sites, [el.dataset.site]: el.checked };
      chrome.storage.local.set({ sites }, reload);
    });
  });
});

// ---- শুরু ----
$("ver").textContent = "v" + chrome.runtime.getManifest().version;
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentTab = tab || null;
  currentSite = tab ? siteFromUrl(tab.url || "") : null;
  reload();
});
