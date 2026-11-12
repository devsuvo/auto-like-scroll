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
  // গতি: popup থেকে বদলানো যায়
  const SPEEDS = {
    fast:   { watch: [800, 1500],  likeAfter: 250,  cooldown: 600 },
    normal: { watch: [2000, 4000], likeAfter: 700,  cooldown: 1000 },
    slow:   { watch: [4000, 8000], likeAfter: 1500, cooldown: 1500 }
  };
  let cfg = SPEEDS.fast;
  let gapMin = 1, gapMax = 3; // দুই like-এর মাঝে ১–৩ মিনিট এলোমেলো
  let likeChance = 0.6;       // ৬০% পোস্টে like, বাকিগুলো বাদ
  let lastLikeAt = 0;         // সব tab মিলিয়ে শেষ like-এর সময়
  let nextGap = 60000;
  let skipped = 0;
  const TICK = 250;
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
      ` | buttons:${btnCount} likes:${likes} skip:${skipped} scrolls:${scrolls} | ${lastMsg}`;
  }

  // ---- settings ----
  function randGap() {
    const lo = Math.min(gapMin, gapMax), hi = Math.max(gapMin, gapMax);
    return (lo + Math.random() * (hi - lo)) * 60000;
  }
  function applySettings(v) {
    if (v.gapMinMin != null) gapMin = Math.max(0, Number(v.gapMinMin) || 0);
    if (v.gapMaxMin != null) gapMax = Math.max(0, Number(v.gapMaxMin) || 0);
    if (v.likeChance != null) likeChance = Math.min(100, Math.max(0, Number(v.likeChance))) / 100;
  }

  chrome.storage.local.get(
    { autoLike: false, autoScroll: false, speed: "fast",
      gapMinMin: 1, gapMaxMin: 3, likeChance: 60, lastLikeAt: 0,
      blockSensitive: true, blockWords: "" },
    (v) => {
      blockOn = v.blockSensitive !== false;
      buildBlock(v.blockWords);
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
      cfg = SPEEDS[v.speed] || SPEEDS.fast;
      applySettings(v);
      nextGap = randGap();
      lastLikeAt = v.lastLikeAt || 0;
    }
  );
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.blockSensitive || c.blockWords) {
      chrome.storage.local.get({ blockSensitive: true, blockWords: "" }, (v) => {
        blockOn = v.blockSensitive !== false;
        buildBlock(v.blockWords);
      });
    }
    const nv = {};
    for (const k of ["gapMinMin", "gapMaxMin", "likeChance"]) if (c[k]) nv[k] = c[k].newValue;
    if (Object.keys(nv).length) { applySettings(nv); nextGap = randGap(); }
    if (c.lastLikeAt) lastLikeAt = c.lastLikeAt.newValue || 0;
    if (c.speed) cfg = SPEEDS[c.speed.newValue] || SPEEDS.fast;
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
    lastLikeAt = Date.now();
    nextGap = randGap();
    chrome.storage.local.set({ lastLikeAt });
    log("liked");
  }

  // like বাটনের পুরো পোস্ট/ভিডিও অংশ
  function postOf(btn) {
    const p = btn.closest(
      '[data-urn],[data-id^="urn:li"],.feed-shared-update-v2,article,[data-e2e="recommend-list-item-container"]'
    );
    if (p) return p;
    let n = btn;
    for (let i = 0; i < 8 && n.parentElement; i++) n = n.parentElement;
    return n;
  }

  // ধর্মীয় ও রাজনৈতিক পোস্ট বাদ দেওয়ার শব্দ
  const DEFAULT_BLOCK = [
    // ধর্ম (English)
    "islam", "islamic", "muslim", "allah", "quran", "koran", "hadith", "prophet",
    "ramadan", "ramzan", "eid", "jummah", "jumma", "mosque", "masjid", "namaz", "salah",
    "dua", "inshallah", "alhamdulillah", "subhanallah", "mashallah", "sunnah", "halal",
    "haram", "iftar", "hijab", "hindu", "hinduism", "puja", "temple", "church",
    "christian", "jesus", "bible", "buddha", "religion", "religious", "god", "spiritual",
    // ধর্ম (বাংলা)
    "ইসলাম", "মুসলিম", "মুসলমান", "আল্লাহ", "কোরআন", "কুরআন", "হাদিস", "নবী", "রাসূল",
    "রাসুল", "রমজান", "ঈদ", "নামাজ", "মসজিদ", "দোয়া", "দোআ", "জুমা", "ইনশাআল্লাহ",
    "আলহামদুলিল্লাহ", "সুবহানাল্লাহ", "মাশাআল্লাহ", "হিন্দু", "পূজা", "মন্দির", "ধর্ম",
    "গির্জা", "খ্রিস্টান", "বৌদ্ধ", "সুন্নাহ", "হালাল", "হারাম",
    // রাজনীতি (English)
    "politics", "political", "election", "elections", "vote", "voting", "government",
    "minister", "parliament", "awami", "bnp", "jamaat", "protest", "modi", "trump",
    "biden", "israel", "palestine", "gaza", "prime minister", "president", "democracy",
    // রাজনীতি (বাংলা)
    "রাজনীতি", "রাজনৈতিক", "নির্বাচন", "ভোট", "সরকার", "মন্ত্রী", "সংসদ", "আওয়ামী",
    "বিএনপি", "জামায়াত", "জামাত", "আন্দোলন", "প্রধানমন্ত্রী", "রাষ্ট্রপতি", "হাসিনা",
    "ইউনূস", "গাজা", "ফিলিস্তিন", "ইসরায়েল"
  ];
  let blockOn = true;
  let blockRegex = null;

  function buildBlock(customText) {
    const custom = String(customText || "").split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    const words = (blockOn ? DEFAULT_BLOCK : []).concat(custom);
    if (!words.length) { blockRegex = null; return; }
    const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // ইংরেজি শব্দ পুরো শব্দ হিসেবে মিলবে (software-এ "war" না), বাংলা সরাসরি
    const parts = words.map((w) => /^[\x00-\x7F]+$/.test(w) ? `\\b${esc(w)}\\b` : esc(w));
    blockRegex = new RegExp(parts.join("|"), "i");
  }
  buildBlock("");

  // আরবি অক্ষর (Arabic, Arabic Supplement/Extended, Presentation Forms)
  const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

  function blockedWord(post) {
    const text = post.innerText || "";
    // ৩টা বা তার বেশি আরবি অক্ষর থাকলে বাদ (ভুলবশত একটা অক্ষরে নয়)
    if (blockOn && (text.match(ARABIC) || []).length >= 3) return "আরবি লেখা";
    // ﷺ ﷲ ﷻ ইত্যাদি একক ধর্মীয় চিহ্ন
    if (blockOn && /[ﷰ-﷽]/.test(text)) return "আরবি চিহ্ন";
    if (!blockRegex) return null;
    const m = text.match(blockRegex);
    return m ? m[0] : null;
  }

  // বিজ্ঞাপন পোস্ট
  function isPromoted(post) {
    const head = (post.innerText || "").slice(0, 400);
    return /\b(promoted|sponsored)\b|প্রচারিত|স্পনসর/i.test(head);
  }

  // পোস্ট যত বড়, তত বেশি সময় "পড়বে" (২–১৫ সেকেন্ড)
  const readTimes = new WeakMap();
  function readTime(post) {
    if (!readTimes.has(post)) {
      const len = (post.innerText || "").length;
      const ms = Math.min(15000, 2000 + Math.min(len, 1500) * 12) * rand(0.8, 1.2);
      readTimes.set(post, ms);
    }
    return readTimes.get(post);
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
    cooldownUntil = Date.now() + cfg.cooldown;
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
    }, 700);
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
      watchFor = rand(cfg.watch[0], cfg.watch[1]);
    }
    elapsed += TICK;

    const waitLeft = lastLikeAt + nextGap - Date.now();
    if (state.autoLike && waitLeft > 0) {
      lastMsg = `next like ${Math.ceil(waitLeft / 1000)}s`;
    }
    let reading = false;
    if (state.autoLike && waitLeft <= 0 && t && t.tagName !== "VIDEO" && !clicked.has(t)) {
      const post = postOf(t);
      const need = Math.max(cfg.likeAfter, readTime(post));
      const bad = blockedWord(post);
      if (bad) {
        clicked.add(t);
        skipped++;
        log(`skip: "${bad}"`);
        if (SITE === "linkedin") target = null;
      } else if (isPromoted(post)) {
        clicked.add(t);
        log("ad - skip");
        if (SITE === "linkedin") target = null;
      } else if (elapsed < need) {
        reading = true; // পড়া শেষ না হওয়া পর্যন্ত scroll থামবে
        lastMsg = `reading ${Math.ceil((need - elapsed) / 1000)}s`;
      } else if (Math.random() > likeChance) {
        clicked.add(t);
        skipped++;
        log("skipped (random)");
        if (SITE === "linkedin") target = null;
      } else {
        doLike(t);
        if (SITE === "linkedin") target = null;
      }
    }
    if (state.autoLike && !buttons.length && elapsed % 4000 < TICK) {
      log("like button পাওয়া যায়নি");
    }

    if (state.autoScroll && !reading && elapsed >= watchFor) {
      target = null;
      elapsed = 0;
      scrollNext(t);
    }
  }, TICK);
})();
