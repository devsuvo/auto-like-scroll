// Auto Like & Scroll - TikTok + LinkedIn combined content script (v1.0.1)
(() => {
  // ---- site ভিত্তিক selector ও সেটিং ----
  const SITES = {
    tiktok: {
      match: "tiktok.com",
      items: [
        '[data-e2e="recommend-list-item-container"]',
        '[data-e2e="browse-video"]'
      ],
      likeSelectors: [
        '[data-e2e="like-icon"]',
        '[data-e2e="browse-like"]',
        '[data-e2e="browse-like-icon"]'
      ],
      keyNav: true // TikTok পরের ভিডিও ArrowDown দিয়ে নেয়
    },
    linkedin: {
      match: "linkedin.com",
      items: [
        '[data-urn^="urn:li:activity"]',
        ".feed-shared-update-v2"
      ],
      likeSelectors: [
        'button.react-button__trigger[aria-pressed="false"]',
        'button[aria-label*="Like" i][aria-pressed="false"]'
      ],
      keyNav: false
    }
  };

  const host = location.hostname;
  const site = Object.values(SITES).find((s) => host.includes(s.match));
  if (!site) return;

  const WATCH_MIN = 4000;   // আইটেম কমপক্ষে কত ms দেখা হবে
  const WATCH_MAX = 8000;   // সর্বোচ্চ কত ms
  const LIKE_AFTER = 2000;  // আইটেম আসার কত ms পর like চেষ্টা
  const LIKE_MAX_TRIES = 8; // like বাটন না পেলে কতবার চেষ্টা
  const SCROLL_COOLDOWN = 1500;
  const TICK = 1000;

  const state = { autoLike: false, autoScroll: false };
  const likedItems = new WeakSet();
  let currentItem = null;
  let elapsed = 0;
  let watchTarget = 0;
  let likeTries = 0;
  let cooldownUntil = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const log = (...a) => console.log("[AutoLike]", ...a);

  // ---- settings load / live update ----
  try {
    chrome.storage.local.get({ autoLike: false, autoScroll: false }, (v) => {
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
      log("settings", state);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.autoLike) state.autoLike = !!changes.autoLike.newValue;
      if (changes.autoScroll) state.autoScroll = !!changes.autoScroll.newValue;
    });
  } catch (e) {
    console.warn("[AutoLike] storage error", e);
  }

  // ---- helpers ----
  // nested match বাদ দিয়ে শুধু সবচেয়ে বাইরের item রাখে (একই পোস্ট দুইবার না আসে)
  function getAllItems() {
    const found = new Set();
    for (const sel of site.items) {
      document.querySelectorAll(sel).forEach((el) => found.add(el));
      if (found.size) break; // প্রথম কাজ করা selector-টাই যথেষ্ট
    }
    return Array.from(found).filter(
      (el) => !Array.from(found).some((other) => other !== el && other.contains(el))
    );
  }

  // screen-এ সবচেয়ে বেশি দেখা যাচ্ছে এমন item
  function getVisibleItem() {
    const vh = window.innerHeight;
    let best = null;
    let bestVisible = 0;
    for (const el of getAllItems()) {
      const r = el.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (visible > bestVisible) {
        bestVisible = visible;
        best = el;
      }
    }
    return best;
  }

  function findLikeButton(item) {
    for (const sel of site.likeSelectors) {
      const el = item.querySelector(sel);
      if (el) return el.closest("button") || el;
    }
    return null;
  }

  // true মানে like করা গেছে বা আগেই like করা আছে
  function tryLike(item) {
    const btn = findLikeButton(item);
    if (!btn) return false; // বাটন এখনো load হয়নি, পরের tick-এ আবার চেষ্টা
    if (btn.getAttribute("aria-pressed") === "true") return true;
    btn.click();
    log("liked");
    return true;
  }

  function goNext(item) {
    const items = getAllItems();
    const next = items[items.indexOf(item) + 1];
    cooldownUntil = Date.now() + SCROLL_COOLDOWN;

    if (site.keyNav) {
      const ev = new KeyboardEvent("keydown", {
        key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40,
        bubbles: true, cancelable: true
      });
      (document.activeElement || document.body).dispatchEvent(ev);
      document.dispatchEvent(ev);

      // ArrowDown কাজ না করলে scroll করে fallback
      setTimeout(() => {
        if (getVisibleItem() === item) fallbackScroll(next);
      }, 1200);
      return;
    }
    fallbackScroll(next);
  }

  function fallbackScroll(next) {
    if (next) {
      next.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }
  }

  // ---- main loop (প্রতি সেকেন্ডে) ----
  setInterval(() => {
    if (!state.autoLike && !state.autoScroll) return;
    if (Date.now() < cooldownUntil) return; // scroll চলাকালীন অপেক্ষা

    const item = getVisibleItem();
    if (!item) return;

    if (item !== currentItem) {
      currentItem = item;
      elapsed = 0;
      likeTries = 0;
      watchTarget = rand(WATCH_MIN, WATCH_MAX);
    }
    elapsed += TICK;

    if (state.autoLike && !likedItems.has(item) && elapsed >= LIKE_AFTER) {
      likeTries++;
      if (tryLike(item)) {
        likedItems.add(item);
      } else if (likeTries >= LIKE_MAX_TRIES) {
        likedItems.add(item); // বাটন পাওয়া যাচ্ছে না, আর চেষ্টা বন্ধ
        log("like button not found - selector check করুন");
      }
    }

    if (state.autoScroll && elapsed >= watchTarget) {
      elapsed = 0;
      currentItem = null;
      goNext(item);
    }
  }, TICK);
})();
