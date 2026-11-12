// Auto Like & Scroll - TikTok, LinkedIn, Facebook, Instagram, X/Twitter (v2.0.0)
// - like বাটন খুঁজে কাজ করে (container selector-এর ওপর কম নির্ভর)
// - background থেকে "tick" আসে, তাই browser minimize/অন্য tab-এও চলে
(() => {
  if (window.__autoLikeLoaded) return; // দুইবার inject হলে বাদ
  window.__autoLikeLoaded = true;

  const host = location.hostname;
  const SITE =
    host.includes("tiktok.com") ? "tiktok" :
    host.includes("linkedin.com") ? "linkedin" :
    host.includes("facebook.com") ? "facebook" :
    host.includes("instagram.com") ? "instagram" :
    (host.includes("x.com") || host.includes("twitter.com")) ? "twitter" : null;
  if (!SITE) return;

  // TikTok-এ একবারে একটা ভিডিও; বাকিগুলো feed (screen-এ কয়েকটা পোস্ট)
  const FEED = SITE !== "tiktok";

  // ---- সেটিং ----
  const SPEEDS = {
    fast:   { watch: [800, 1500],  likeAfter: 250,  cooldown: 600 },
    normal: { watch: [2000, 4000], likeAfter: 700,  cooldown: 1000 },
    slow:   { watch: [4000, 8000], likeAfter: 1500, cooldown: 1500 }
  };
  let cfg = SPEEDS.fast;
  let gapMin = 1, gapMax = 3; // দুই like-এর মাঝে ১–৩ মিনিট এলোমেলো
  let likeChance = 0.6;       // ৬০% পোস্টে like
  let lastLikeAt = 0;         // সব tab মিলিয়ে শেষ like-এর সময়
  let nextGap = 60000;

  const state = { autoLike: false, autoScroll: false };
  const clicked = new WeakSet();
  let target = null;
  let elapsed = 0;
  let watchFor = 0;
  let cooldownUntil = 0;
  let likes = 0, skipped = 0, scrolls = 0;
  let lastMsg = "ready";
  let lastTickAt = 0;
  let viewH = innerHeight, viewW = innerWidth; // minimize হলে শেষ জানা মাপ

  const rand = (a, b) => a + Math.random() * (b - a);
  const log = (m) => { lastMsg = m; console.log("[AutoLike]", m); };
  const isOn = () => state.autoLike || state.autoScroll;

  // ---- status box ----
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;left:10px;bottom:10px;z-index:2147483647;" +
    "background:rgba(0,0,0,.8);color:#fff;font:12px/1.4 system-ui,sans-serif;" +
    "padding:6px 10px;border-radius:8px;pointer-events:none;display:none;max-width:280px";

  function renderBadge(btnCount) {
    if (document.hidden) return;
    if (document.body && !badge.isConnected) document.body.appendChild(badge);
    badge.style.display = isOn() ? "block" : "none";
    if (!isOn()) return;
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

  const DEFAULTS = {
    autoLike: false, autoScroll: false, speed: "fast",
    gapMinMin: 1, gapMaxMin: 3, likeChance: 60, lastLikeAt: 0,
    blockSensitive: true, blockWords: ""
  };

  function loadAll() {
    chrome.storage.local.get(DEFAULTS, (v) => {
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
      cfg = SPEEDS[v.speed] || SPEEDS.fast;
      applySettings(v);
      nextGap = randGap();
      lastLikeAt = v.lastLikeAt || 0;
      blockOn = v.blockSensitive !== false;
      buildBlock(v.blockWords);
      syncTicker();
    });
  }

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.lastLikeAt && Object.keys(c).length === 1) {
      lastLikeAt = c.lastLikeAt.newValue || 0; // অন্য tab like দিয়েছে
      return;
    }
    loadAll();
    target = null;
  });

  // ---- ধর্মীয় / রাজনৈতিক filter ----
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
    // ইংরেজি শব্দ পুরো শব্দ হিসেবে মিলবে, বাংলা সরাসরি
    const parts = words.map((w) => /^[\x00-\x7F]+$/.test(w) ? `\\b${esc(w)}\\b` : esc(w));
    blockRegex = new RegExp(parts.join("|"), "i");
  }

  // আরবি অক্ষর
  const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/g;
  const ARABIC_SIGN = /[ﷰ-﷽]/; // ﷺ ﷲ ﷻ

  function blockedWord(post) {
    const text = post.innerText || "";
    if (blockOn && (text.match(ARABIC) || []).length >= 3) return "আরবি লেখা";
    if (blockOn && ARABIC_SIGN.test(text)) return "আরবি চিহ্ন";
    if (!blockRegex) return null;
    const m = text.match(blockRegex);
    return m ? m[0] : null;
  }

  function isPromoted(post) {
    const head = (post.innerText || "").slice(0, 400);
    return /\b(promoted|sponsored)\b|প্রচারিত|স্পনসর|বিজ্ঞাপন/i.test(head);
  }

  // ---- site অনুযায়ী like বাটন ----
  const LIKE_WORDS = /like|react|পছন্দ|লাইক/i;
  const NOT_LIKE_WORDS = /comment|share|repost|send|reply|unlike|মন্তব্য|শেয়ার/i;

  const SITES = {
    tiktok: {
      post: '[data-e2e="recommend-list-item-container"],article',
      find() {
        const out = [];
        document.querySelectorAll(
          '[data-e2e="like-icon"],[data-e2e="browse-like-icon"],[data-e2e="browse-like"],[data-e2e="video-player-like"]'
        ).forEach((el) => out.push(el.closest("button") || el));
        if (!out.length) {
          document.querySelectorAll("button[aria-label]").forEach((b) => {
            const l = b.getAttribute("aria-label");
            if (LIKE_WORDS.test(l) && !NOT_LIKE_WORDS.test(l)) out.push(b);
          });
        }
        return out;
      },
      liked(btn) {
        if (btn.getAttribute("aria-pressed") === "true") return true;
        const svg = btn.querySelector("svg path, svg");
        if (!svg) return false;
        const cs = getComputedStyle(svg);
        return /254,\s*44,\s*85|255,\s*59,\s*92/.test(cs.fill + cs.color);
      }
    },

    linkedin: {
      post: '[data-urn],[data-id^="urn:li"],.feed-shared-update-v2,article',
      find() {
        const out = [];
        document.querySelectorAll('button, [role="button"]').forEach((b) => {
          const aria = b.getAttribute("aria-label") || "";
          const text = (b.innerText || "").trim();
          if (text.length > 40) return;
          if (NOT_LIKE_WORDS.test(aria + " " + text)) return;
          if (b.classList.contains("react-button__trigger") ||
              /reaction button state|react like|^like\b|^লাইক|^পছন্দ/i.test(aria) ||
              /^(like|লাইক|পছন্দ)$/i.test(text)) out.push(b);
        });
        return out;
      },
      liked(btn) {
        if (btn.getAttribute("aria-pressed") === "true") return true;
        const aria = btn.getAttribute("aria-label") || "";
        if (/reaction button state/i.test(aria)) return !/no reaction/i.test(aria);
        if (/^unlike|remove.*reaction/i.test(aria)) return true;
        return /^liked$/i.test((btn.innerText || "").trim());
      }
    },

    facebook: {
      post: 'div[aria-posinset],[role="article"]',
      find() {
        const out = [];
        document.querySelectorAll('[role="button"][aria-label], button[aria-label]').forEach((b) => {
          const aria = b.getAttribute("aria-label") || "";
          if (!/^(like|লাইক|লাইক করুন|পছন্দ)$/i.test(aria.trim())) return;
          // comment-এর like বাদ: বাটনের উপরে আরেকটা article থাকলে সেটা comment
          const art = b.closest('[role="article"]');
          if (art && art.parentElement && art.parentElement.closest('[role="article"]')) return;
          out.push(b);
        });
        return out;
      },
      liked(btn) {
        if (btn.getAttribute("aria-pressed") === "true") return true;
        const aria = btn.getAttribute("aria-label") || "";
        return /remove like|unlike|change .*reaction/i.test(aria);
      }
    },

    instagram: {
      post: "article",
      find() {
        const out = [];
        document.querySelectorAll('svg[aria-label="Like"], svg[aria-label="লাইক"], svg[aria-label="পছন্দ"]')
          .forEach((svg) => {
            // comment-এর ছোট heart বাদ (পোস্টের heart ২৪px)
            if (svg.getBoundingClientRect().height < 20) return;
            out.push(svg.closest('button,[role="button"]') || svg);
          });
        return out;
      },
      liked(btn) {
        return !!btn.querySelector('svg[aria-label="Unlike"]');
      }
    },

    twitter: {
      post: 'article[data-testid="tweet"],article',
      find() {
        // X: like না করা = data-testid="like", করা = "unlike"
        return Array.from(document.querySelectorAll('[data-testid="like"]'));
      },
      liked(btn) {
        return btn.getAttribute("data-testid") === "unlike";
      }
    }
  };
  const S = SITES[SITE];

  // ---- helpers ----
  function vh() { return innerHeight > 100 ? innerHeight : viewH; }
  function vw() { return innerWidth > 100 ? innerWidth : viewW; }

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh() && r.right > 0 && r.left < vw();
  }

  function distToCenter(el) {
    const r = el.getBoundingClientRect();
    return Math.abs((r.top + r.bottom) / 2 - vh() / 2);
  }

  function findLikeButtons() {
    return Array.from(new Set(S.find())).filter(inViewport);
  }

  function pickTarget(buttons) {
    let pool = FEED ? buttons.filter((b) => !S.liked(b) && !clicked.has(b)) : buttons;
    if (!pool.length && SITE === "tiktok") {
      pool = Array.from(document.querySelectorAll("video")).filter(inViewport);
    }
    pool.sort((a, b) => distToCenter(a) - distToCenter(b));
    return pool[0] || null;
  }

  function postOf(btn) {
    const p = btn.closest(S.post);
    if (p) return p;
    let n = btn;
    for (let i = 0; i < 8 && n.parentElement; i++) n = n.parentElement;
    return n;
  }

  const readTimes = new WeakMap();
  function readTime(post) {
    if (!readTimes.has(post)) {
      const len = (post.innerText || "").length;
      readTimes.set(post, Math.min(15000, 2000 + Math.min(len, 1500) * 12) * rand(0.8, 1.2));
    }
    return readTimes.get(post);
  }

  function doLike(btn) {
    clicked.add(btn);
    if (S.liked(btn)) { log("already liked"); return; }
    btn.click();
    likes++;
    lastLikeAt = Date.now();
    nextGap = randGap();
    chrome.storage.local.set({ lastLikeAt });
    log("liked");
  }

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
    // minimize অবস্থায় smooth animation চলে না, তাই সরাসরি scroll
    const behavior = document.hidden ? "auto" : "smooth";
    const box = scrollerFor(anchor || document.querySelector("video") || document.body);
    const before = box.scrollTop;
    const amount = SITE === "tiktok" ? (box.clientHeight || vh()) : Math.round(vh() * 0.75);
    box.scrollBy({ top: amount, behavior });
    scrolls++;
    log("scrolled");

    setTimeout(() => {
      if (Math.abs(box.scrollTop - before) > 5) return;
      if (SITE === "tiktok") {
        const ev = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true };
        document.body.dispatchEvent(new KeyboardEvent("keydown", ev));
        document.dispatchEvent(new KeyboardEvent("keydown", ev));
      }
      window.scrollBy({ top: amount, behavior });
      log("scroll fallback");
    }, 700);
  }

  // ---- এক ধাপ কাজ (background বা নিজের timer থেকে ডাকা হয়) ----
  function tick() {
    const now = Date.now();
    if (now - lastTickAt < 200) return; // দুই উৎস থেকে একসাথে এলে একবারই
    const dt = lastTickAt ? Math.min(now - lastTickAt, 5000) : 250;
    lastTickAt = now;

    if (!document.hidden && innerHeight > 100) { viewH = innerHeight; viewW = innerWidth; }
    if (!isOn()) { renderBadge(0); return; }

    const buttons = findLikeButtons();
    renderBadge(buttons.length);
    if (now < cooldownUntil) return;

    const t = pickTarget(buttons);
    if (t !== target) {
      target = t;
      elapsed = 0;
      watchFor = rand(cfg.watch[0], cfg.watch[1]);
    }
    elapsed += dt;

    const waitLeft = lastLikeAt + nextGap - now;
    if (state.autoLike && waitLeft > 0) lastMsg = `next like ${Math.ceil(waitLeft / 1000)}s`;

    let reading = false;
    if (state.autoLike && waitLeft <= 0 && t && t.tagName !== "VIDEO" && !clicked.has(t)) {
      const post = postOf(t);
      const bad = blockedWord(post);
      if (bad) {
        clicked.add(t); skipped++; log(`skip: "${bad}"`);
        if (FEED) target = null;
      } else if (isPromoted(post)) {
        clicked.add(t); log("ad - skip");
        if (FEED) target = null;
      } else if (elapsed < Math.max(cfg.likeAfter, readTime(post))) {
        reading = true;
        lastMsg = `reading ${Math.ceil((readTime(post) - elapsed) / 1000)}s`;
      } else if (Math.random() > likeChance) {
        clicked.add(t); skipped++; log("skipped (random)");
        if (FEED) target = null;
      } else {
        doLike(t);
        if (FEED) target = null;
      }
    }

    if (state.autoScroll && !reading && elapsed >= watchFor) {
      target = null;
      elapsed = 0;
      scrollNext(t);
    }
  }

  // ---- ticker: background port (minimize-এও চলে) + নিজের timer (backup) ----
  let port = null;
  function connect() {
    if (port || !isOn()) return;
    try {
      port = chrome.runtime.connect({ name: "autolike" });
    } catch (e) {
      port = null; // extension reload হলে পুরনো script আর কাজ করবে না
      return;
    }
    port.onMessage.addListener((m) => {
      if (m === "tick") {
        tick();
        try { port && port.postMessage("pong"); } catch (e) { /* ignore */ }
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, 1000); // background ঘুমিয়ে গেলে আবার যুক্ত হয়
    });
  }
  function syncTicker() {
    if (isOn()) connect();
    else if (port) { const p = port; port = null; p.disconnect(); }
  }

  setInterval(tick, 250);
  loadAll();
})();
