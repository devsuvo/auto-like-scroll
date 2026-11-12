// Auto Like & Scroll - content script (v3.0.0)
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
    autoLike: false, autoScroll: false, siteOn: true, tabOn: false,
    humanize: true, stopOnWarning: true
  };
  let speed = SPEEDS.slow;
  let rule = { min: 30, max: 50, chance: 1, hourly: 0, daily: 0 };
  let matcher = null;
  let breakAfter = 15, breakMin = 5, reloadEvery = 10;

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
  let ttDecided = null, ttScrollAt = 0;
  let likes = 0, skipped = 0, scrolls = 0;
  let lastMsg = "ready";
  let lastTickAt = 0, lastWarnCheck = 0;
  let viewH = innerHeight, viewW = innerWidth; // minimize হলে শেষ জানা মাপ
  const pageStartedAt = Date.now();

  const rand = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
  const log = (m) => { lastMsg = m; console.log("[AutoLike]", m); };
  const isOn = () => (state.autoLike || state.autoScroll) && state.siteOn && state.tabOn;

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
    "position:fixed;left:10px;bottom:10px;z-index:2147483647;" +
    "background:rgba(0,0,0,.8);color:#fff;font:12px/1.4 system-ui,sans-serif;" +
    "padding:6px 10px;border-radius:8px;pointer-events:none;display:none;max-width:300px";

  function renderBadge(btnCount) {
    if (document.hidden) return;
    if (document.body && !badge.isConnected) document.body.appendChild(badge);
    badge.style.display = isOn() ? "block" : "none";
    if (!isOn()) return;
    const limits = rule.hourly || rule.daily
      ? ` | ঘণ্টায় ${recentLikes(HOUR).length}/${rule.hourly || "∞"} দিনে ${recentLikes(DAY).length}/${rule.daily || "∞"}`
      : "";
    badge.textContent =
      `AutoLike [${SITE}] Like:${state.autoLike ? "ON" : "off"} Scroll:${state.autoScroll ? "ON" : "off"}` +
      ` | buttons:${btnCount} likes:${likes} skip:${skipped} scrolls:${scrolls}${limits} | ${lastMsg}`;
  }

  // =====================================================================
  // settings
  // =====================================================================
  function loadAll() {
    chrome.storage.local.get(CFG.DEFAULTS, (v) => {
      state.autoLike = !!v.autoLike;
      state.autoScroll = !!v.autoScroll;
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
      breakMin = Math.max(0, num(v.breakMin, 5));
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
    const pool = buttons.filter((b) => !S.liked(b) && !clicked.has(b));
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
    const bad = filterReason(post);
    if (bad) { skipped++; log(`skip: ${bad}`); return; }
    if (isPromoted(post)) { skipped++; log("ad - skip"); return; }
    if (Math.random() > rule.chance) { skipped++; log("skipped (random)"); return; }
    doLike(btn);
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
    return pageScroller();
  }

  function scrollNext(anchor) {
    cooldownUntil = Date.now() + speed.cooldown;
    const box = scrollerFor(anchor || document.querySelector("video") || document.body);
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
      lastMsg = "পরের পোস্ট খুঁজছে...";
      if (state.autoScroll && elapsed >= speed.search) { elapsed = 0; target = null; scrollNext(null); }
      return;
    }

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

    // ২. অপেক্ষা
    if (elapsed < watchFor) {
      lastMsg = `পোস্টে অপেক্ষা ${Math.ceil((watchFor - elapsed) / 1000)}s`;
      return;
    }

    // ৩. সিদ্ধান্ত
    clicked.add(t);
    target = null;
    if (state.autoLike) decide(t, postOf(t));
    else log("পরের পোস্ট");

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

    if (now < cooldownUntil) return;

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
