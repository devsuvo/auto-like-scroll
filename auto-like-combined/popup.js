const autoLikeEl = document.getElementById("autoLike");
const autoScrollEl = document.getElementById("autoScroll");
const statusEl = document.getElementById("status");

const speedEl = document.getElementById("speed");

chrome.storage.local.get({ autoLike: false, autoScroll: false, speed: "fast" }, (v) => {
  autoLikeEl.checked = !!v.autoLike;
  autoScrollEl.checked = !!v.autoScroll;
  speedEl.value = v.speed;
});

// সংখ্যার ঘরগুলো: id = storage key
const NUM_FIELDS = { gapMinMin: [1, 0, 60], gapMaxMin: [3, 0, 60], likeChance: [60, 0, 100] };
for (const [key, [def, lo, hi]] of Object.entries(NUM_FIELDS)) {
  const el = document.getElementById(key);
  chrome.storage.local.get({ [key]: def }, (v) => { el.value = v[key]; });
  el.addEventListener("change", () => {
    const n = Math.min(hi, Math.max(lo, parseFloat(el.value) || 0));
    el.value = n;
    chrome.storage.local.set({ [key]: n });
  });
}

speedEl.addEventListener("change", () => {
  chrome.storage.local.set({ speed: speedEl.value });
});

// বর্তমান tab-এ script না থাকলে (যেমন extension reload-এর পর) inject করে দেয়
async function ensureInjected() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/([^/]*\.)?(tiktok|linkedin)\.com\//.test(tab.url || "")) {
    statusEl.textContent = "TikTok বা LinkedIn tab খুলে এখানে toggle করুন।";
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    statusEl.textContent = "চালু আছে - page-এর নিচে বাম কোণে status দেখুন।";
  } catch (e) {
    statusEl.textContent = "Inject হয়নি: " + e.message + " (tab refresh করুন)";
  }
}

autoLikeEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoLike: autoLikeEl.checked });
  ensureInjected();
});
autoScrollEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoScroll: autoScrollEl.checked });
  ensureInjected();
});

ensureInjected();
