// TikTok Auto Like & Scroll - content script
(() => {
  const SELECTORS = {
    item: '[data-e2e="recommend-list-item-container"]',
    likeIcon: '[data-e2e="like-icon"]'
  };

  const WATCH_MIN = 4000;   // ভিডিও কমপক্ষে কত ms দেখা হবে (scroll করার আগে)
  const WATCH_MAX = 8000;   // সর্বোচ্চ কত ms
  const LIKE_AFTER = 2000;  // ভিডিও আসার কত ms পর like দেবে
  const TICK = 1000;

  const state = { autoLike: false, autoScroll: false };
  const likedItems = new WeakSet();
  let currentItem = null;
  let elapsed = 0;
  let watchTarget = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- settings load / live update ----
  try {
    chrome.storage.local.get({ autoLike: false, autoScroll: false }, (v) => {
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.autoLike) state.autoLike = !!changes.autoLike.newValue;
      if (changes.autoScroll) state.autoScroll = !!changes.autoScroll.newValue;
    });
  } catch (e) {
    console.warn("[TT-Auto] storage error", e);
  }

  // ---- helpers ----
  function getAllItems() {
    return Array.from(document.querySelectorAll(SELECTORS.item));
  }

  // screen-এ সবচেয়ে বেশি দেখা যাচ্ছে এমন ভিডিওটা খুঁজে বের করে
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

  function getLikeButton(item) {
    const icon = item.querySelector(SELECTORS.likeIcon);
    if (!icon) return null;
    return icon.closest("button") || icon;
  }

  function isAlreadyLiked(btn) {
    return btn.getAttribute("aria-pressed") === "true";
  }

  function doLike(item) {
    const btn = getLikeButton(item);
    if (!btn) return;
    likedItems.add(item);
    if (isAlreadyLiked(btn)) return;
    btn.click();
    console.log("[TT-Auto] liked");
  }

  function goNext(item) {
    const items = getAllItems();
    const idx = items.indexOf(item);
    const next = items[idx + 1];
    if (next) {
      next.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }
  }

  // ---- main loop (every second) ----
  setInterval(() => {
    if (!state.autoLike && !state.autoScroll) return;

    const item = getVisibleItem();
    if (!item) return;

    // নতুন ভিডিও আসলে timer reset
    if (item !== currentItem) {
      currentItem = item;
      elapsed = 0;
      watchTarget = rand(WATCH_MIN, WATCH_MAX);
    }
    elapsed += TICK;

    if (state.autoLike && !likedItems.has(item) && elapsed >= LIKE_AFTER) {
      doLike(item);
    }

    if (state.autoScroll && elapsed >= watchTarget) {
      elapsed = 0;
      currentItem = null;
      goNext(item);
    }
  }, TICK);
})();
