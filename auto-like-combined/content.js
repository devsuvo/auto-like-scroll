// Auto Like & Scroll - content script (v3.1.0)
// TikTok, LinkedIn, Facebook, Instagram, X/Twitter
// - প্রতিটা site-এর আলাদা নিয়ম: অপেক্ষা, like %, ঘণ্টা/দিনের সীমা (config.js)
// - ধর্মীয়/রাজনৈতিক/আরবি filter (filter.js)
// - সতর্কবার্তা ("Try again later", "Action blocked", captcha…) দেখলে নিজে থেকে বন্ধ
// - background থেকে "tick" আসে, তাই minimize/অন্য tab-এও চলে
(() => {
  if (window.__autoLikeLoaded) return; // দুইবার inject হলে বাদ
  window.__autoLikeLoaded = true;

  const CFG = globalThis.AutoLikeConfig;
  const FILTER = globalThis.AutoLikeFilter;
  if (!CFG || !FILTER) {
    console.warn("[AutoLike] config.js/filter.js লোড হয়নি");
    return;
  }

  const SITE = CFG.siteFromHost(location.hostname);
  if (!SITE) return;
  const FEED = SITE !== "tiktok"; // TikTok-এ একবারে একটা ভিডিও, বাকিগুলো feed
  const KEYS = CFG.RULE_KEYS[SITE];

  const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

  // Scroll গতি: পোস্ট খুঁজতে কত দ্রুত নামবে, scroll-এর পর কতক্ষণ থামবে
  const SPEEDS = {
    fast:   { cooldown: 600,  search: 800 },
    normal: { cooldown: 1000, search: 1500 },
    slow:   { cooldown: 1500, search: 2500 }
  };

  // ---- সেটিং (storage থেকে) ----
  const state = {
    autoLike: false, autoScroll: false, autoComment: false, siteOn: true, tabOn: false,
    humanize: true, stopOnWarning: true
  };
  let speed = SPEEDS.slow;
  let rule = { min: 30, max: 50, chance: 1, hourly: 0, daily: 0 };
  let matcher = null;
  let breakAfter = 15, breakMin = 2, reloadEvery = 10;

  // ---- হিসাব (সব tab মিলিয়ে, storage-এ থাকে) ----
  let batchLikes = 0, breakUntil = 0;
  let likeLog = {};          // { site: [like-এর সময়…] } শেষ ২৪ ঘণ্টা
  let siteBlockedUntil = {}; // { site: সময় } সতর্কবার্তার পর বন্ধ

  // ---- এই page-এর অবস্থা ----
  let myTabId = null;
  const clicked = new WeakSet();  // যে পোস্ট/ভিডিওর সিদ্ধান্ত হয়ে গেছে
  const centered = new WeakSet(); // যে পোস্ট মাঝখানে আনা হয়েছে
  let target = null, elapsed = 0, watchFor = 0;
  let cooldownUntil = 0, idleUntil = 0;
  let lastAnchor = null;           // শেষ যে পোস্টে কাজ হয়েছে (scroll container চেনার জন্য)
  let searchingSince = 0, stuckScrolls = 0; // পরের পোস্ট না পেলে কতক্ষণ/কতবার
  const DONE = "data-autolike-done";   // পোস্টে দাগ: LinkedIn বাটন বদলে দিলেও পোস্ট চেনা যায়
  let ttDecided = null, ttScrollAt = 0;
  let likes = 0, skipped = 0, scrolls = 0;
  let comments = 0, lastCommentAt = 0, commentBusy = false;
  const COMMENT_EVERY = 45 * 1000; // ৪৫ সেকেন্ডে সর্বোচ্চ ১টা comment
  let lastMsg = "ready";
  let lastTickAt = 0, lastWarnCheck = 0;
  let viewH = innerHeight, viewW = innerWidth; // minimize হলে শেষ জানা মাপ
  const pageStartedAt = Date.now();

  const rand = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
  const log = (m) => { lastMsg = m; console.log("[AutoLike]", m); };
  const isOn = () => (state.autoLike || state.autoScroll || state.autoComment) && state.siteOn && state.tabOn;

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
  }

  // =====================================================================
  // status box
  // =====================================================================
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:2147483647;pointer-events:none;display:none;" +
    "width:240px;box-sizing:border-box;padding:10px 12px;border-radius:12px;" +
    "background:rgba(20,22,28,.92);color:#e8eaed;font:12px/1.4 system-ui,'Segoe UI',sans-serif;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08)";

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const chip = (name, on) =>
    `<span style="padding:1px 7px;border-radius:999px;font-size:11px;` +
    `background:${on ? "rgba(52,199,89,.18)" : "rgba(255,255,255,.07)"};color:${on ? "#5fdc7f" : "#8a8f98"}">` +
    `${on ? "●" : "○"} ${name}</span>`;
  const stat = (label, val) =>
    `<div style="text-align:center"><div style="font-size:15px;font-weight:600;color:#fff">${val}</div>` +
    `<div style="font-size:10px;color:#8a8f98">${label}</div></div>`;
  function bar(label, n, max) {
    const pct = max ? Math.min(100, (n / max) * 100) : 0;
    const col = pct >= 90 ? "#ff6b6b" : pct >= 70 ? "#ffb347" : "#4c9aff";
    return `<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#b0b4bb">` +
      `<span>${label}</span><span>${n} / ${max || "∞"}</span></div>` +
      (max ? `<div style="height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:3px">` +
        `<div style="height:100%;width:${pct}%;border-radius:2px;background:${col}"></div></div>` : "") +
      `</div>`;
  }

  function renderBadge(btnCount) {
    if (document.hidden) return;
    if (document.body && !badge.isConnected) document.body.appendChild(badge);
    badge.style.display = isOn() ? "block" : "none";
    if (!isOn()) return;
    const name = (CFG.SITE_NAMES && CFG.SITE_NAMES[SITE]) || SITE;
    badge.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">` +
        `<b style="font-size:13px;color:#fff">AutoLike · ${esc(name)}</b>` +
        `<span style="font-size:10px;color:#8a8f98">btn ${btnCount}</span></div>` +
      `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">` +
        chip("Like", state.autoLike) + chip("Scroll", state.autoScroll) +
        (SITE === "linkedin" ? chip(`Comment ${comments}`, state.autoComment) : "") + `</div>` +
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px 0;` +
        `border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)">` +
        stat("Likes", likes) + stat("Skip", skipped) + stat("Scroll", scrolls) + `</div>` +
      (rule.hourly || rule.daily
        ? bar("ঘণ্টায়", recentLikes(HOUR).length, rule.hourly) + bar("দিনে", recentLikes(DAY).length, rule.daily)
        : "") +
      `<div style="margin-top:8px;padding:5px 8px;border-radius:6px;background:rgba(76,154,255,.12);` +
        `color:#9cc4ff;font-size:11.5px">${esc(lastMsg || "...")}</div>`;
  }


  // =====================================================================
  // settings
  // =====================================================================
  function loadAll() {
    chrome.storage.local.get(CFG.DEFAULTS, (v) => {
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
      state.autoComment = SITE === "linkedin" && !!v.autoComment;
      lastCommentAt = num(v.lastCommentAt, 0);
      state.siteOn = (v.sites || {})[SITE] !== false;
      state.tabOn = myTabId != null && (v.enabledTabs || []).includes(myTabId);
      state.humanize = v.humanize !== false;
      state.stopOnWarning = v.stopOnWarning !== false;
      speed = SPEEDS[v.speed] || SPEEDS.slow;

      const d = CFG.RULE_DEFAULTS;
      rule = {
        min: Math.max(1, num(v[KEYS.min], d[KEYS.min])),
        max: Math.max(1, num(v[KEYS.max], d[KEYS.max])),
        chance: Math.min(100, Math.max(0, num(v[KEYS.chance], d[KEYS.chance]))) / 100,
        hourly: Math.max(0, num(v[KEYS.hourly], d[KEYS.hourly])),
        daily: Math.max(0, num(v[KEYS.daily], d[KEYS.daily]))
      };
      if (rule.min > rule.max) [rule.min, rule.max] = [rule.max, rule.min];

      breakAfter = Math.max(0, num(v.breakAfter, 15));
      breakMin = Math.max(0, num(v.breakMin, 2));
      reloadEvery = Math.max(0, num(v.reloadEvery, 10));
      batchLikes = num(v.batchLikes, 0);
      breakUntil = num(v.breakUntil, 0);
      likeLog = v.likeLog || {};
      siteBlockedUntil = v.siteBlockedUntil || {};
      matcher = FILTER.compile({ sensitive: v.blockSensitive !== false, custom: v.blockWords });
      syncTicker();
    });
  }

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    // শুধু হিসাব বদলালে (অন্য tab like দিয়েছে) কাজ থামানো হয় না
    if (Object.keys(c).every((k) => CFG.COUNTER_KEYS.includes(k))) {
      if (c.batchLikes) batchLikes = num(c.batchLikes.newValue, 0);
      if (c.breakUntil) breakUntil = num(c.breakUntil.newValue, 0);
      if (c.likeLog) likeLog = c.likeLog.newValue || {};
      if (c.siteBlockedUntil) siteBlockedUntil = c.siteBlockedUntil.newValue || {};
      if (c.lastCommentAt) lastCommentAt = num(c.lastCommentAt.newValue, 0);
      return;
    }
    loadAll();
    target = null;
  });

  // =====================================================================
  // like-এর সীমা (ঘণ্টা / ২৪ ঘণ্টা) ও বিরতি
  // =====================================================================
  function recentLikes(win, now = Date.now()) {
    return (likeLog[SITE] || []).filter((t) => now - t < win).sort((a, b) => a - b);
  }

  // সীমা পূর্ণ হলে { why, until } ফেরত দেয়
  function limitHit(now) {
    if (rule.daily > 0) {
      const d = recentLikes(DAY, now);
      if (d.length >= rule.daily) return { why: "আজকের like সীমা পূর্ণ", until: d[d.length - rule.daily] + DAY };
    }
    if (rule.hourly > 0) {
      const h = recentLikes(HOUR, now);
      if (h.length >= rule.hourly) return { why: "ঘণ্টার like সীমা পূর্ণ", until: h[h.length - rule.hourly] + HOUR };
    }
    return null;
  }

  function recordLike(now) {
    likeLog = { ...likeLog, [SITE]: recentLikes(DAY, now).concat(now) };
    batchLikes++;
    if (breakAfter > 0 && breakMin > 0 && batchLikes >= breakAfter) {
      breakUntil = now + breakMin * MINUTE;
      batchLikes = 0;
      log(`${breakAfter}টা like হয়েছে - ${breakMin} মিনিট বিরতি`);
    }
    chrome.storage.local.set({ likeLog, batchLikes, breakUntil });
  }

  // =====================================================================
  // সতর্কবার্তা: প্ল্যাটফর্ম আটকাতে শুরু করলে থেমে যাওয়া
  // =====================================================================
  const WARN_RE = new RegExp([
    "try again later", "action blocked", "we restrict certain activity",
    "temporarily (?:blocked|restricted|limited)", "you(?:'|’)re temporarily blocked",
    "can(?:'|’)t use this feature", "misusing this feature", "going too fast",
    "too many requests", "rate limit", "unusual activity", "suspicious activity",
    "automated behavior", "confirm (?:it(?:'|’)s|that it(?:'|’)s) you",
    "verify (?:it(?:'|’)s|that it(?:'|’)s) you", "are you a robot", "not a robot",
    "unable to like", "over the daily limit", "reached (?:the|your) (?:[\\w-]+ ){0,3}limit",
    "সাময়িকভাবে ব্লক", "পরে আবার চেষ্টা করুন", "অস্বাভাবিক কার্যকলাপ", "খুব দ্রুত", "সীমা অতিক্রম"
  ].join("|"), "i");
  const WARN_SEL = '[role="dialog"],[role="alertdialog"],[role="alert"],[data-testid="toast"],[aria-live="assertive"]';
  const CAPTCHA_SEL = '#captcha-verify-container,[id*="captcha" i],[class*="captcha" i],' +
                      'iframe[src*="captcha"],iframe[src*="challenge"]';

  function detectWarning(now) {
    if (now - lastWarnCheck < 2000) return null;
    lastWarnCheck = now;
    for (const el of document.querySelectorAll(WARN_SEL)) {
      if (badge.contains(el) || !el.getClientRects().length) continue; // লুকানো বাদ
      const m = (el.innerText || "").slice(0, 800).match(WARN_RE);
      if (m) return m[0];
    }
    for (const el of document.querySelectorAll(CAPTCHA_SEL)) {
      const r = el.getBoundingClientRect(); // ছোট badge (যেমন reCAPTCHA লোগো) বাদ
      if (r.width >= 200 && r.height >= 150 && inViewport(el)) return "captcha";
    }
    return null;
  }

  // =====================================================================
  // filter (filter.js): caption, পোস্টের লেখা, profile নাম
  // =====================================================================
  const CAPTION_SELECTORS = {
    tiktok: '[data-e2e="video-desc"],[data-e2e="browse-video-desc"],[data-e2e="video-caption"],' +
            '[data-e2e="new-desc-span"],[data-e2e="search-card-desc"]',
    linkedin: ".update-components-text,.feed-shared-update-v2__description,.feed-shared-text",
    facebook: '[data-ad-preview="message"],[data-ad-comet-preview="message"]',
    instagram: "h1,ul li span",
    twitter: '[data-testid="tweetText"]'
  };
  const AUTHOR_SELECTORS = {
    tiktok: '[data-e2e="video-author-uniqueid"],[data-e2e="video-author-nickname"],' +
            '[data-e2e="browse-username"],[data-e2e="browser-nickname"],a[href^="/@"]',
    linkedin: ".update-components-actor__title,.update-components-actor__name," +
              '.update-components-actor__description,a[href*="/in/"],a[href*="/company/"]',
    facebook: 'h2 a,h3 a,h4 a,strong a,a[role="link"] strong',
    instagram: "header a,header span",
    twitter: '[data-testid="User-Name"]'
  };

  // TikTok নতুন design-এ caption/নাম ভিডিওর বাইরে থাকে: তখন screen-এর মাঝের কাছেরটা
  function findIn(post, sel, fallbackCount) {
    let els = Array.from(post.querySelectorAll(sel));
    if (!els.length && SITE === "tiktok") {
      els = Array.from(document.querySelectorAll(sel)).filter(inViewport);
      els.sort((a, b) => distToCenter(a) - distToCenter(b));
      els = els.slice(0, fallbackCount);
    }
    return els;
  }

  function authorName(els) {
    const parts = [];
    for (const el of els) {
      parts.push(el.textContent || "");
      const href = el.getAttribute && el.getAttribute("href");
      const m = href && href.match(/\/@([^/?#]+)|\/in\/([^/?#]+)|\/company\/([^/?#]+)/);
      if (m) parts.push(m[1] || m[2] || m[3]); // username
    }
    return parts.join(" ").trim();
  }

  function filterReason(post) {
    if (!matcher) return null;
    const caption = findIn(post, CAPTION_SELECTORS[SITE], 1).map((e) => e.innerText || e.textContent || "").join(" ");
    let r = matcher.checkText(caption);
    if (r) return `caption: ${r}`;

    // পোস্টের বাকি লেখা: লেখকের নাম মুছে (নামের "Islam" ইত্যাদিতে ভুল না হয়)
    const authorEls = findIn(post, AUTHOR_SELECTORS[SITE], 2);
    let body = post.innerText || "";
    for (const el of authorEls) {
      const s = (el.innerText || el.textContent || "").trim();
      if (s.length > 1) body = body.split(s).join(" ");
    }
    r = matcher.checkText(body);
    if (r) return r;

    r = matcher.checkName(authorName(authorEls));
    if (r) return `profile: ${r}`;
    return null;
  }

  function isPromoted(post) {
    const head = (post.innerText || "").slice(0, 400);
    return /\b(promoted|sponsored)\b|প্রচারিত|স্পনসর|বিজ্ঞাপন/i.test(head);
  }

  // =====================================================================
  // site অনুযায়ী like বাটন
  // =====================================================================
  const LIKE_WORDS = /like|react|পছন্দ|লাইক/i;
  const NOT_LIKE_WORDS = /comment|share|repost|send|reply|unlike|মন্তব্য|শেয়ার/i;

  const SITES = {
    tiktok: {
      post: '[data-e2e="recommend-list-item-container"],article',
      find() {
        const out = [];
        document.querySelectorAll(
          '[data-e2e="like-icon"],[data-e2e="browse-like-icon"],[data-e2e="browse-like"],[data-e2e="video-player-like"]'
        ).forEach((el) => out.push(el.closest('button,[role="button"]') || el));
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
        return /remove like|unlike|change .*reaction/i.test(btn.getAttribute("aria-label") || "");
      }
    },

    instagram: {
      post: "article",
      find() {
        const out = [];
        document.querySelectorAll('svg[aria-label="Like"], svg[aria-label="লাইক"], svg[aria-label="পছন্দ"]')
          .forEach((svg) => {
            if (svg.getBoundingClientRect().height < 20) return; // comment-এর ছোট heart বাদ
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

  // =====================================================================
  // helpers
  // =====================================================================
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

  // feed: এখনো সিদ্ধান্ত না হওয়া, screen-এর মাঝের কাছের পোস্টের like বাটন
  function pickTarget(buttons) {
    const pool = buttons.filter((b) => !S.liked(b) && !clicked.has(b) && !isDone(b));
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

  function isDone(btn) {
    if (!FEED) return false;
    const p = btn.closest(S.post);
    return !!(p && p.hasAttribute(DONE));
  }
  function markDone(btn) {
    const p = FEED && btn.closest(S.post);
    if (p) p.setAttribute(DONE, "1");
  }

  function doLike(btn) {
    if (S.liked(btn)) { log("already liked"); return; }
    // কিছু site শুধু click() নয়, mouse event-ও দেখে; click একবারই হয়
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    btn.click();
    likes++;
    log("liked");
    recordLike(Date.now());
  }

  // filter → বিজ্ঞাপন → % → like
  function decide(btn, post) {
    if (SITE === "linkedin") { doLike(btn); return; } // LinkedIn: কোনো পোস্ট skip নয়
    const bad = filterReason(post);
    if (bad) { skipped++; log(`skip: ${bad}`); return; }
    if (isPromoted(post)) { skipped++; log("ad - skip"); return; }
    if (Math.random() > rule.chance) { skipped++; log("skipped (random)"); return; }
    doLike(btn);
  }

  // =====================================================================
  // LinkedIn auto comment (Gemini AI)
  // =====================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const commentedPosts = new WeakSet();

  async function waitFor(fn, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  }

  // like বাটন থেকে উপরে উঠে এমন container খোঁজা যেখানে Comment বাটনও আছে
  // (পুরো feed নয়, শুধু ঐ পোস্টের action bar / পোস্ট)
  function isCommentBtn(b) {
    const aria = (b.getAttribute("aria-label") || "").trim();
    const text = (b.innerText || "").trim();
    if (text.length > 30) return false;
    if (/repost|share|send|reply|শেয়ার/i.test(aria + " " + text)) return false;
    return /^(comment|মন্তব্য)/i.test(text) || /^comment\b|comment on/i.test(aria) ||
      !!b.querySelector('svg[data-test-icon^="comment"], use[href*="comment"]');
  }

  function postRootFor(likeBtn) {
    const p = likeBtn.closest('[data-urn],[data-id^="urn:li"],.feed-shared-update-v2');
    if (p) return p;
    let n = likeBtn;
    for (let i = 0; i < 12 && n.parentElement; i++) {
      n = n.parentElement;
      if (n.querySelectorAll("[data-urn],.feed-shared-update-v2").length > 1) break; // feed পর্যন্ত চলে গেছে
      if (n.innerText && n.innerText.length > 200 &&
          Array.from(n.querySelectorAll('button,[role="button"]')).some(isCommentBtn)) return n;
    }
    return postOf(likeBtn);
  }

  function findCommentButton(likeBtn, post) {
    // like বাটনের সবচেয়ে কাছের comment বাটন (একই action bar)
    let n = likeBtn;
    for (let i = 0; i < 6 && n.parentElement; i++) {
      n = n.parentElement;
      const b = Array.from(n.querySelectorAll('button,[role="button"]')).find((x) => x !== likeBtn && isCommentBtn(x));
      if (b) return b;
    }
    return Array.from(post.querySelectorAll('button,[role="button"]')).find(isCommentBtn) || null;
  }

  const EDITOR_SEL = '.ql-editor[contenteditable="true"],div[role="textbox"][contenteditable="true"],' +
                     '.comments-comment-box div[contenteditable="true"],div[contenteditable="true"][aria-label*="comment" i]';

  function findEditor(post) {
    const a = document.activeElement;
    if (a && a.isContentEditable && (post.contains(a) || /comment/i.test(a.getAttribute("aria-label") || "") ||
        a.closest(".comments-comment-box,.comments-comment-texteditor"))) return a;
    const inside = Array.from(post.querySelectorAll(EDITOR_SEL)).filter(visible);
    return inside[0] || null;
  }

  function findSubmit(editor) {
    let n = editor;
    for (let i = 0; i < 8 && n.parentElement; i++) {
      n = n.parentElement;
      const b = Array.from(n.querySelectorAll("button")).find((x) =>
        visible(x) && !x.disabled && x.getAttribute("aria-disabled") !== "true" &&
        (/submit-button/.test(x.className) || /^(comment|post|মন্তব্য|পোস্ট)$/i.test((x.innerText || "").trim())));
      if (b) return b;
    }
    return null;
  }

  function editorText(editor) {
    return (editor.innerText || "").replace(/\s+/g, " ").trim();
  }

  async function typeInto(editor, text) {
    editor.click();
    editor.focus();
    // cursor editor-এর ভেতরে রাখা, না হলে insertText কাজ করে না
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(rand(300, 700));
    document.execCommand("insertText", false, text);
    await sleep(300);
    if (editorText(editor).length < 5) {
      // fallback: সরাসরি লিখে input event
      editor.innerHTML = "<p></p>";
      editor.firstChild.textContent = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    return editorText(editor).length >= 5;
  }

  function postText(post) {
    const cap = Array.from(post.querySelectorAll(CAPTION_SELECTORS.linkedin))
      .map((e) => e.innerText || "").join("\n").trim();
    return cap || (post.innerText || "").slice(0, 2000);
  }

  function askGemini(text) {
    return new Promise((r) => {
      try {
        chrome.runtime.sendMessage({ type: "gemini", text }, (x) => {
          const err = chrome.runtime.lastError;
          r(err ? { error: err.message } : (x || { error: "background উত্তর দেয়নি" }));
        });
      } catch (e) {
        r({ error: "extension reload হয়েছে, page refresh করুন" });
      }
    });
  }

  async function doComment(likeBtn) {
    commentBusy = true;
    const post = postRootFor(likeBtn);
    commentedPosts.add(post);
    let ok = false;
    try {
      const text = postText(post);
      if (text.length < 15) { log("comment: পোস্টে লেখা নেই, বাদ"); return; }

      log("comment লিখছে (AI)...");
      const res = await askGemini(text);
      if (res.error) { log("Gemini error: " + res.error); return; }

      let editor = findEditor(post);
      if (!editor) {
        const btn = findCommentButton(likeBtn, post);
        if (!btn) { log("comment বাটন পাওয়া যায়নি"); return; }
        btn.click();
        editor = await waitFor(() => findEditor(post), 8000);
      }
      if (!editor) { log("comment বক্স খোলেনি"); return; }

      if (!(await typeInto(editor, res.comment))) { log("comment বক্সে লেখা যায়নি"); return; }
      await sleep(rand(1500, 3000)); // লেখার পর একটু থামা

      const submit = await waitFor(() => findSubmit(editor), 5000);
      if (!submit) { log("Post বাটন পাওয়া যায়নি"); return; }
      submit.click();
      await sleep(1500);
      ok = true;
      comments++;
      log("✅ commented: " + res.comment.slice(0, 40));
    } catch (e) {
      log("comment error: " + e.message);
    } finally {
      // সফল হলে ৪৫ সেকেন্ড পর পরেরটা; ব্যর্থ হলে ১৫ সেকেন্ড পর আবার চেষ্টা
      lastCommentAt = ok ? Date.now() : Date.now() - COMMENT_EVERY + 15 * SECOND;
      chrome.storage.local.set({ lastCommentAt });
      cooldownUntil = Date.now() + 2000;
      // comment হয়ে গেলে ঐ পোস্টে আর বসে না থেকে like দিয়ে পরের পোস্টে
      if (ok && target === likeBtn) elapsed = watchFor;
      commentBusy = false;
    }
  }

  // সময় হলে screen-এর মাঝের পোস্টে comment। true = comment শুরু হয়েছে
  function maybeComment(likeBtn, now) {
    if (!state.autoComment || SITE !== "linkedin" || commentBusy || !likeBtn) return false;
    if (now - lastCommentAt < COMMENT_EVERY) return false;
    const post = postRootFor(likeBtn);
    if (commentedPosts.has(post)) return false;
    const bad = filterReason(post) || (isPromoted(post) ? "ad" : null);
    if (bad) { commentedPosts.add(post); log("comment বাদ: " + bad); return false; }
    doComment(likeBtn);
    return true;
  }

  // =====================================================================
  // scroll
  // =====================================================================
  const behavior = () => (document.hidden ? "auto" : "smooth"); // minimize-এ smooth চলে না
  const pageScroller = () => document.scrollingElement || document.documentElement;

  function scrollerFor(el) {
    let n = el && el.parentElement;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 20) return n;
      n = n.parentElement;
    }
    const pg = pageScroller();
    if (pg.scrollHeight > pg.clientHeight + 20) return pg;
    // page নিজে scroll হয় না (LinkedIn-এর নতুন UI): সবচেয়ে বড় scroll হওয়া box
    let best = pg, bestH = 0;
    document.querySelectorAll("main, div, section").forEach((d) => {
      if (d.clientHeight < vh() * 0.5 || d.scrollHeight <= d.clientHeight + 20) return;
      if (!/(auto|scroll)/.test(getComputedStyle(d).overflowY)) return;
      if (d.clientHeight > bestH) { bestH = d.clientHeight; best = d; }
    });
    return best;
  }

  // screen-এর নিচে থাকা পরের (কাজ না হওয়া) পোস্ট
  function nextPostBelow() {
    const posts = Array.from(document.querySelectorAll(S.post)).filter((p) => {
      if (p.hasAttribute(DONE) || p.parentElement.closest(S.post)) return false; // ভেতরের (share করা) পোস্ট বাদ
      const r = p.getBoundingClientRect();
      return r.height > 80 && r.top > vh() * 0.35;
    });
    posts.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return posts[0] || null;
  }

  // feed-এর শেষে "Show more" / "See new posts" বাটন থাকলে চাপা
  function clickLoadMore() {
    const re = /^(show more( feed updates| results| posts)?|see (new|more) posts|load more|আরো দেখুন|new posts)$/i;
    const b = Array.from(document.querySelectorAll('button, [role="button"]')).find((x) => {
      const t = ((x.innerText || "").trim().split(/\r?\n/)[0] || x.getAttribute("aria-label") || "").trim();
      return re.test(t) && x.getClientRects().length > 0;
    });
    if (b) { b.click(); log("আরো পোস্ট load করা হলো"); return true; }
    return false;
  }

  // feed-এ পরের পোস্টে যাওয়া। আটকে গেলে ধাপে ধাপে বাড়তি চেষ্টা।
  function feedNext() {
    cooldownUntil = Date.now() + speed.cooldown;
    const next = nextPostBelow();
    if (next && stuckScrolls < 2) {
      next.scrollIntoView({ behavior: behavior(), block: "start" });
      scrolls++;
      stuckScrolls++;
      log("পরের পোস্টে যাচ্ছে");
      return;
    }
    if (stuckScrolls >= 3 && clickLoadMore()) { stuckScrolls = 0; cooldownUntil = Date.now() + 3000; return; }
    stuckScrolls++;
    scrollNext(lastAnchor);
  }

  function scrollNext(anchor) {
    cooldownUntil = Date.now() + speed.cooldown;
    const box = scrollerFor(anchor && anchor.isConnected ? anchor : (document.querySelector("video") || document.body));
    const before = box.scrollTop;
    const amount = SITE === "tiktok" ? (box.clientHeight || vh()) : Math.round(vh() * rand(0.6, 0.85));
    box.scrollBy({ top: amount, behavior: behavior() });
    scrolls++;
    log("scrolled");

    setTimeout(() => {
      if (Math.abs(box.scrollTop - before) > 5) return;
      if (SITE === "tiktok") {
        const ev = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true };
        document.body.dispatchEvent(new KeyboardEvent("keydown", ev));
        document.dispatchEvent(new KeyboardEvent("keydown", ev));
      }
      window.scrollBy({ top: amount, behavior: behavior() });
      // শেষ চেষ্টা: keyboard দিয়ে নিচে (সব site-এ কাজ করে)
      if (Math.abs(box.scrollTop - before) <= 5 && SITE !== "tiktok") {
        const ev = { key: "PageDown", code: "PageDown", keyCode: 34, which: 34, bubbles: true };
        (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", ev));
      }
      log("scroll fallback");
    }, 700);
  }

  // পোস্ট screen-এর মাঝখানে আনা। লম্বা পোস্টে like বাটন যেন screen-এ থাকে।
  function centerPost(btn) {
    const post = postOf(btn);
    const tall = post.getBoundingClientRect().height > vh() * 0.9;
    (tall ? btn : post).scrollIntoView({ behavior: behavior(), block: "center" });
    scrolls++;
    cooldownUntil = Date.now() + 1000;
    if (state.humanize) {
      // ঠিক মাঝখানে নয়, একটু এদিক-ওদিক (মানুষের মতো)
      const off = Math.round(rand(-100, 100));
      setTimeout(() => pageScroller().scrollBy({ top: off, behavior: behavior() }), 700);
    }
  }

  // মানুষের মতো: মাঝে মাঝে একটু উপরে ফিরে দেখা
  function glanceBack() {
    pageScroller().scrollBy({ top: -Math.round(rand(150, 350)), behavior: behavior() });
    cooldownUntil = Date.now() + rand(1500, 3000);
    log("একটু উপরে ফিরে দেখা");
  }

  // =====================================================================
  // Feed (LinkedIn, Facebook, Instagram, X):
  // পোস্ট মাঝখানে → অপেক্ষা → like/বাদ → পরের পোস্ট
  // =====================================================================
  function feedStep(t, now) {
    if (now < idleUntil) { lastMsg = `একটু বিরতি ${fmt(idleUntil - now)}`; return; }

    if (!t) {
      if (!searchingSince) searchingSince = now;
      const waited = now - searchingSince;
      lastMsg = `পরের পোস্ট খুঁজছে... ${Math.round(waited / 1000)}s`;
      if (!state.autoScroll) return;
      // ২ মিনিট কিছুই না পেলে page reload (feed আটকে গেছে)
      if (waited > 2 * MINUTE) { log("feed আটকে গেছে - page reload"); location.reload(); return; }
      if (elapsed >= speed.search) { elapsed = 0; target = null; feedNext(); }
      return;
    }
    searchingSince = 0;
    stuckScrolls = 0;

    // সীমা পূর্ণ হলে like-ও না, scroll-ও না (শুধু scroll করে যাওয়াও bot-এর মতো দেখায়)
    if (state.autoLike) {
      const lim = limitHit(now);
      if (lim) { lastMsg = `${lim.why} - ${fmt(lim.until - now)} পর আবার`; elapsed = 0; return; }
    }

    // ১. পোস্ট মাঝখানে আনা (একবার)
    if (state.autoScroll && !centered.has(t)) {
      centered.add(t);
      centerPost(t);
      elapsed = 0;
      return;
    }

    // comment-এর সময় হলে পোস্টের পুরো অপেক্ষা শেষ হওয়ার আগেই (৩ সেকেন্ড দেখে) comment
    if (elapsed >= 3000 && maybeComment(t, now)) return;

    // ২. অপেক্ষা
    if (elapsed < watchFor) {
      lastMsg = `পোস্টে অপেক্ষা ${Math.ceil((watchFor - elapsed) / 1000)}s`;
      return;
    }

    // ৩. সিদ্ধান্ত
    clicked.add(t);
    markDone(t);
    lastAnchor = t;
    target = null;
    if (state.autoLike) decide(t, postOf(t));
    else log("পরের পোস্ট");
    maybeComment(t, now);

    // ৪. মানুষের মতো: মাঝে মাঝে থামা বা একটু উপরে ফিরে দেখা
    if (state.humanize) {
      const r = Math.random();
      if (r < 0.10) { idleUntil = now + rand(20, 60) * SECOND; log("একটু বিরতি"); }
      else if (r < 0.15 && state.autoScroll) glanceBack();
    }
  }

  // =====================================================================
  // TikTok: ভিডিও দেখা → like/বাদ → পরের ভিডিও
  // =====================================================================
  function tiktokItem() {
    let best = null, bestArea = 0;
    document.querySelectorAll("video").forEach((v) => {
      const r = v.getBoundingClientRect();
      const h = Math.max(0, Math.min(r.bottom, vh()) - Math.max(r.top, 0));
      const w = Math.max(0, Math.min(r.right, vw()) - Math.max(r.left, 0));
      if (h * w > bestArea) { bestArea = h * w; best = v; }
    });
    if (!best) return null;
    return best.closest('article,[data-e2e="recommend-list-item-container"]') || best;
  }

  // item-এর like বাটন: item-এর ভেতরে, না পেলে screen-এর মাঝের কাছেরটা
  function tiktokLikeButton(item, buttons) {
    const inside = buttons.filter((b) => item.contains(b));
    const pool = inside.length ? inside : buttons;
    return pool.slice().sort((a, b) => distToCenter(a) - distToCenter(b))[0] || null;
  }

  function tiktokStep(t, buttons, now) {
    if (!t) {
      if (state.autoScroll && elapsed >= rule.max * SECOND) { elapsed = 0; target = null; scrollNext(null); }
      return;
    }

    if (ttDecided !== t) {
      if (state.autoLike) {
        const lim = limitHit(now);
        if (lim) { lastMsg = `${lim.why} - ${fmt(lim.until - now)} পর আবার`; elapsed = 0; return; }
      }
      const left = watchFor - elapsed;
      lastMsg = `watching ${Math.max(0, Math.ceil(left / 1000))}s`;
      if (left > 0) return;

      // দেখা শেষ: সিদ্ধান্ত
      if (!state.autoLike || clicked.has(t)) {
        ttDecided = t;
        ttScrollAt = elapsed + rand(500, 1500);
        return;
      }
      const btn = tiktokLikeButton(t, buttons);
      if (!btn) {
        if (elapsed < watchFor + 3000) { lastMsg = "like button খুঁজছে..."; return; }
        log("like button পাওয়া যায়নি");
        ttDecided = t;
        ttScrollAt = elapsed;
        return;
      }
      ttDecided = t;
      ttScrollAt = elapsed + rand(500, 1500); // like-এর পর একটু থেমে scroll
      clicked.add(t);
      decide(btn, t.tagName === "VIDEO" ? postOf(t) : t);
      return;
    }

    if (state.autoScroll && elapsed >= ttScrollAt) {
      target = null;
      elapsed = 0;
      scrollNext(t);
    }
  }

  // =====================================================================
  // এক ধাপ কাজ (background বা নিজের timer থেকে ডাকা হয়)
  // =====================================================================
  function tick() {
    const now = Date.now();
    if (now - lastTickAt < 200) return; // দুই উৎস থেকে একসাথে এলে একবারই
    const dt = lastTickAt ? Math.min(now - lastTickAt, 5000) : 250;
    lastTickAt = now;

    if (!document.hidden && innerHeight > 100) { viewH = innerHeight; viewW = innerWidth; }
    if (!isOn()) { renderBadge(0); return; }

    const buttons = findLikeButtons();
    renderBadge(buttons.length);

    // ১. প্ল্যাটফর্মের সতর্কবার্তা → এই site ২৪ ঘণ্টা বন্ধ
    const warning = state.stopOnWarning && detectWarning(now);
    if (warning) {
      siteBlockedUntil = { ...siteBlockedUntil, [SITE]: now + DAY };
      chrome.storage.local.set({ siteBlockedUntil, lastWarning: { site: SITE, text: warning, at: now } });
      log(`⚠️ সতর্কবার্তা "${warning}" - ২৪ ঘণ্টা বন্ধ`);
    }
    const blockedUntil = siteBlockedUntil[SITE] || 0;
    if (now < blockedUntil) {
      lastMsg = `⚠️ সতর্কবার্তা পেয়ে বন্ধ - ${fmt(blockedUntil - now)} পর আবার`;
      target = null; elapsed = 0;
      return;
    }

    // ২. নির্দিষ্ট সময় পরপর page reload (reload-এর পর নিজে থেকে আবার চলবে)
    if (reloadEvery > 0 && now - pageStartedAt >= reloadEvery * MINUTE) {
      log("page reload...");
      location.reload();
      return;
    }

    // ৩. ১৫টা like-এর পর বিরতি
    if (now < breakUntil) {
      lastMsg = `বিরতি ${fmt(breakUntil - now)} বাকি`;
      target = null; elapsed = 0;
      return;
    }

    if (now < cooldownUntil || commentBusy) return;

    const t = SITE === "tiktok" ? tiktokItem() : pickTarget(buttons);
    if (t !== target) {
      target = t;
      elapsed = 0;
      watchFor = rand(rule.min, rule.max) * SECOND;
    }
    elapsed += dt;

    if (FEED) feedStep(t, now);
    else tiktokStep(t, buttons, now);
  }

  // =====================================================================
  // ticker: background port (minimize-এও চলে) + নিজের timer (backup)
  // =====================================================================
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
  // background থেকে নিজের tab id জেনে নেয়, তারপর সেটিং লোড
  chrome.runtime.sendMessage({ type: "whoami" }, (res) => {
    void chrome.runtime.lastError;
    myTabId = res && res.tabId != null ? res.tabId : null;
    loadAll();
  });
})();
