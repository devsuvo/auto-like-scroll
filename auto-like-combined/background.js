// Background ticker: browser minimize বা tab লুকানো থাকলে Chrome page-এর timer
// প্রায় বন্ধ করে দেয়। তাই এখান থেকে প্রতি 250ms-এ "tick" পাঠানো হয়।
// Content script প্রতিটা tick-এর জবাব ("pong") দেয়, তাতে এই worker জেগে থাকে।

const ports = new Set();
let timer = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "autolike") return;
  ports.add(port);
  port.onMessage.addListener(() => { /* pong: worker-কে জাগিয়ে রাখে */ });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (!ports.size) stop();
  });
  start();
});

// content script নিজের tab id জানতে চায়
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "whoami") {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
  }
});

// tab বন্ধ হলে চালু-tab তালিকা থেকে বাদ
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get({ enabledTabs: [] }, (v) => {
    const list = (v.enabledTabs || []).filter((id) => id !== tabId);
    if (list.length !== v.enabledTabs.length) chrome.storage.local.set({ enabledTabs: list });
  });
});

// browser নতুন করে খুললে পুরনো tab id অর্থহীন, তাই খালি করা
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ enabledTabs: [] });
});

function start() {
  if (timer) return;
  timer = setInterval(() => {
    for (const p of ports) {
      try {
        p.postMessage("tick");
      } catch (e) {
        ports.delete(p);
      }
    }
    if (!ports.size) stop();
  }, 250);
}

function stop() {
  clearInterval(timer);
  timer = null;
}
