const autoLikeEl = document.getElementById("autoLike");
const autoScrollEl = document.getElementById("autoScroll");
const statusEl = document.getElementById("status");

chrome.storage.local.get({ autoLike: false, autoScroll: false }, (v) => {
  autoLikeEl.checked = !!v.autoLike;
  autoScrollEl.checked = !!v.autoScroll;
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
