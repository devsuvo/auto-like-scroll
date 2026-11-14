// Background ticker: browser minimize বা tab লুকানো থাকলে Chrome page-এর timer
// প্রায় বন্ধ করে দেয়। তাই এখান থেকে প্রতি 250ms-এ "tick" পাঠানো হয়।
// Content script প্রতিটা tick-এর জবাব ("pong") দেয়, তাতে এই worker জেগে থাকে।

const ports = new Set();
let timer = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "autolike") return;
  ports.add(port);
  // minimize/লুকানো থাকলেও Chrome যেন এই tab বন্ধ (discard) না করে
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  if (tabId != null) chrome.tabs.update(tabId, { autoDiscardable: false }, () => void chrome.runtime.lastError);
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
  if (msg && msg.type === "gemini") {
    geminiComment(msg.text).then(
      (comment) => sendResponse({ comment }),
      (e) => sendResponse({ error: String(e.message || e) })
    );
    return true; // async
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

// v2.3.0: TikTok-এ ৮ সেকেন্ড দেখে সব ভিডিওতে like - পুরনো সেটিং একবার বদলানো
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ migrated_tt_230: false }, (v) => {
    if (v.migrated_tt_230) return;
    chrome.storage.local.set({
      ttWatchMin: 8, ttWatchMax: 8, ttLikeChance: 100, migrated_tt_230: true
    });
  });
});

// LinkedIn পোস্টের জন্য Gemini দিয়ে ছোট comment লেখা
async function geminiComment(postText) {
  const { geminiKey } = await chrome.storage.local.get({ geminiKey: "" });
  if (!geminiKey) throw new Error("Gemini API key দেওয়া নেই");
  const prompt =
    "You are a professional on LinkedIn. Write ONE short, natural, relevant comment (1-2 sentences, " +
    "max 30 words) on the post below. Be specific to the post content, sound human, no hashtags, " +
    "at most one emoji, no quotes around it. Reply in the same language as the post. " +
    "If the post is sad (death, layoff, illness) write a kind, supportive comment.\n\nPOST:\n" +
    String(postText).slice(0, 3000);
  let data = null, lastErr = "";
  // একটা model ব্যস্ত/না থাকলে পরেরটা
  for (const model of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]) {
    const gen = { temperature: 0.9, maxOutputTokens: 300 };
    if (model.startsWith("gemini-2.5")) gen.thinkingConfig = { thinkingBudget: 0 };
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: gen })
        }
      );
    } catch (e) {
      lastErr = "network: " + e.message;
      continue;
    }
    const d = await res.json().catch(() => ({}));
    if (res.ok) { data = d; break; }
    lastErr = (d.error && d.error.message) || "HTTP " + res.status;
    if (res.status === 400 || res.status === 401 || res.status === 403) break; // key ভুল: আর চেষ্টা নয়
  }
  if (!data) throw new Error(lastErr || "Gemini উত্তর দেয়নি");
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map((p) => p.text || "").join("").trim().replace(/^["']|["']$/g, "");
  if (!text) throw new Error("Gemini খালি উত্তর দিয়েছে");
  return text;
}
