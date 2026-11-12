// Auto Like & Scroll - TikTok + LinkedIn (v1.1.0)
// item container-এর ওপর নির্ভর করে না: like বাটন / video খুঁজে নেয়,
// আর scroll করে আসল scrollable container ধরে।
(() => {
  if (window.__autoLikeLoaded) return; // দুইবার inject হলে বাদ
  window.__autoLikeLoaded = true;

  const host = location.hostname;
  const SITE = host.includes("tiktok.com") ? "tiktok"
    : host.includes("linkedin.com") ? "linkedin" : null;
  if (!SITE) return;

  // ---- সেটিং ----
  const WATCH_MIN = 4000;
  const WATCH_MAX = 8000;
  const LIKE_AFTER = 1500;
  const TICK = 500;
  const LIKE_WORDS = /like|react|পছন্দ|লাইক/i;
  const NOT_LIKE_WORDS = /comment|share|repost|send|মন্তব্য|শেয়ার/i;

  const state = { autoLike: false, autoScroll: false };
  const clicked = new WeakSet();
  let target = null;          // বর্তমান like বাটন / video
  let elapsed = 0;
  let watchFor = 0;
  let cooldownUntil = 0;
  let likes = 0;
  let scrolls = 0;
  let lastMsg = "ready";

  const rand = (a, b) => a + Math.random() * (b - a);
  const log = (m) => { lastMsg = m; console.log("[AutoLike]", m); };

  // ---- status box (কী হচ্ছে দেখা যাবে) ----
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;left:10px;bottom:10px;z-index:2147483647;" +
    "background:rgba(0,0,0,.8);color:#fff;font:12px/1.4 system-ui,sans-serif;" +
    "padding:6px 10px;border-radius:8px;pointer-events:none;display:none;max-width:260px";
  const mountBadge = () => document.body && !badge.isConnected && document.body.appendChild(badge);

  function renderBadge(btnCount) {
    mountBadge();
    const on = state.autoLike || state.autoScroll;
    badge.style.display = on ? "block" : "none";
    if (!on) return;
    badge.textContent =
      `AutoLike [${SITE}] Like:${state.autoLike ? "ON" : "off"} Scroll:${state.autoScroll ? "ON" : "off"}` +
      ` | buttons:${btnCount} likes:${likes} scrolls:${scrolls} | ${lastMsg}`;
  }

  // ---- settings ----
  chrome.storage.local.get({ autoLike: false, autoScroll: false }, (v) => {
    state.autoLike = !!v.autoLike;
    state.autoScroll = !!v.autoScroll;
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.autoLike) state.autoLike = !!c.autoLike.newValue;
    if (c.autoScroll) state.autoScroll = !!c.autoScroll.newValue;
    target = null;
  });

  // ---- helpers ----
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight &&
      r.right > 0 && r.left < innerWidth;
  }

  function distToCenter(el) {
    const r = el.getBoundingClientRect();
    return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2);
  }

  function labelOf(el) {
    return ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).trim();
  }

  // page-এর সব like বাটন
  function findLikeButtons() {
    const set = new Set();
    if (SITE === "tiktok") {
      document.querySelectorAll(
        '[data-e2e="like-icon"],[data-e2e="browse-like-icon"],[data-e2e="browse-like"],[data-e2e="video-player-like"]'
      ).forEach((el) => set.add(el.closest("button") || el));
      if (!set.size) {
        document.querySelectorAll("button[aria-label]").forEach((b) => {
          const l = b.getAttribute("aria-label");
          if (LIKE_WORDS.test(l) && !NOT_LIKE_WORDS.test(l)) set.add(b);
        });
      }
    } else {
      // LinkedIn: পুরনো + নতুন design দুটোই
      document.querySelectorAll(
        'button.react-button__trigger, button[aria-label*="reaction" i], button[aria-label*="like" i], ' +
        '[role="button"][aria-label*="like" i], [role="button"][aria-label*="reaction" i], button, [role="button"]'
      ).forEach((b) => {
        const aria = b.getAttribute("aria-label") || "";
        const text = (b.innerText || "").trim();
        if (text.length > 40) return; // বড় container বাদ
        const l = aria + " " + text;
        if (NOT_LIKE_WORDS.test(l)) return;
        if (b.classList.contains("react-button__trigger") ||
            /reaction button state|react like|^like\b|^লাইক|^পছন্দ/i.test(aria) ||
            /^(like|লাইক|পছন্দ)$/i.test(text)) {
          set.add(b);
        }
      });
    }
    return Array.from(set).filter(inViewport);
  }

  // screen-এর মাঝখানের কাছের like বাটন (TikTok-এ চলমান ভিডিওর পাশেরটা)
  function pickTarget(buttons) {
    let pool = buttons;
    if (SITE === "linkedin") {
      // LinkedIn: যেগুলো এখনো like দেওয়া হয়নি
      pool = buttons.filter((b) => !isLiked(b) && !clicked.has(b));
    }
    if (!pool.length && SITE === "tiktok") {
      // like বাটন না পেলে অন্তত চলমান video ধরে scroll চালু থাকবে
      pool = Array.from(document.querySelectorAll("video")).filter(inViewport);
    }
    pool.sort((a, b) => distToCenter(a) - distToCenter(b));
    return pool[0] || null;
  }

  function isLiked(btn) {
    if (btn.getAttribute("aria-pressed") === "true") return true;
    if (SITE === "linkedin") {
      const aria = btn.getAttribute("aria-label") || "";
      // "Reaction button state: no reaction" = like হয়নি; অন্য state = like করা
      if (/reaction button state/i.test(aria)) return !/no reaction/i.test(aria);
      if (/^unlike|remove.*reaction/i.test(aria)) return true;
      if (/^liked$/i.test((btn.innerText || "").trim())) return true;
      return false;
    }
    // TikTok: like করা থাকলে আইকন লাল (fill) হয়
    const path = btn.querySelector("svg path, svg");
    if (path) {
      const fill = (getComputedStyle(path).fill || "") + (getComputedStyle(path).color || "");
      if (/254,\s*44,\s*85|255,\s*59,\s*92|#fe2c55/i.test(fill)) return true;
    }
    return false;
  }

  function doLike(btn) {
    if (btn.tagName === "VIDEO") return;
    clicked.add(btn);
    if (isLiked(btn)) { log("already liked"); return; }
    btn.click();
    likes++;
    log("liked");
  }

  // সত্যিকারের scroll হওয়া container খুঁজে বের করে
  function scrollerFor(el) {
    let n = el && el.parentElement;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 20) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollNext(anchor) {
    cooldownUntil = Date.now() + 1500;
    const box = scrollerFor(anchor || document.querySelector("video") || document.body);
    const before = box.scrollTop;
    const amount = SITE === "tiktok" ? box.clientHeight : Math.round(innerHeight * 0.75);
    box.scrollBy({ top: amount, behavior: "smooth" });
    scrolls++;
    log("scrolled");

    // scroll না হলে TikTok-এ ArrowDown / window scroll চেষ্টা
    setTimeout(() => {
      if (Math.abs(box.scrollTop - before) > 5) return;
      if (SITE === "tiktok") {
        const ev = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true };
        document.body.dispatchEvent(new KeyboardEvent("keydown", ev));
        document.dispatchEvent(new KeyboardEvent("keydown", ev));
      }
      window.scrollBy({ top: amount, behavior: "smooth" });
      log("scroll fallback");
    }, 1000);
  }

  // ---- main loop ----
  setInterval(() => {
    const on = state.autoLike || state.autoScroll;
    if (!on) { renderBadge(0); return; }

    const buttons = findLikeButtons();
    renderBadge(buttons.length);
    if (Date.now() < cooldownUntil) return;

    const t = pickTarget(buttons);
    if (t !== target) {
      target = t;
      elapsed = 0;
      watchFor = rand(WATCH_MIN, WATCH_MAX);
    }
    elapsed += TICK;

    if (state.autoLike && t && !clicked.has(t) && elapsed >= LIKE_AFTER) {
      doLike(t);
    }
    if (state.autoLike && !buttons.length && elapsed % 4000 < TICK) {
      log("like button পাওয়া যায়নি");
    }

    if (state.autoScroll && elapsed >= watchFor) {
      target = null;
      elapsed = 0;
      scrollNext(t);
    }
  }, TICK);
})();
