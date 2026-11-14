// সব জায়গায় (popup ও content script) একই সেটিং, এক জায়গায় লেখা।
(function (root) {
  "use strict";

  const SITE_NAMES = {
    tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook",
    instagram: "Instagram", twitter: "X / Twitter"
  };

  // প্রতিটা site-এর নিয়মের storage key
  // min/max: ভিডিও দেখা বা পোস্টে অপেক্ষা (সেকেন্ড), chance: কত % পোস্টে like,
  // hourly/daily: ঘণ্টায়/২৪ ঘণ্টায় সর্বোচ্চ like (0 = সীমা নেই)
  const RULE_KEYS = {
    tiktok:    { min: "ttWatchMin", max: "ttWatchMax", chance: "ttLikeChance", hourly: "ttHourly", daily: "ttDaily" },
    linkedin:  { min: "liWaitMin",  max: "liWaitMax",  chance: "liLikeChance", hourly: "liHourly", daily: "liDaily" },
    facebook:  { min: "fbWaitMin",  max: "fbWaitMax",  chance: "fbLikeChance", hourly: "fbHourly", daily: "fbDaily" },
    instagram: { min: "igWaitMin",  max: "igWaitMax",  chance: "igLikeChance", hourly: "igHourly", daily: "igDaily" },
    twitter:   { min: "xWaitMin",   max: "xWaitMax",   chance: "xLikeChance",  hourly: "xHourly",  daily: "xDaily" }
  };

  // নিরাপদ মান। Facebook/Instagram/X-এর সংখ্যাগুলো প্রচলিত অভিজ্ঞতা থেকে আন্দাজ,
  // প্ল্যাটফর্মগুলো আসল সীমা প্রকাশ করে না।
  const RULE_DEFAULTS = {
    ttWatchMin: 8,  ttWatchMax: 8,  ttLikeChance: 100, ttHourly: 0,  ttDaily: 0,
    liWaitMin: 10,  liWaitMax: 20,  liLikeChance: 100, liHourly: 0,  liDaily: 200,
    fbWaitMin: 20,  fbWaitMax: 45,  fbLikeChance: 50,  fbHourly: 30, fbDaily: 150,
    igWaitMin: 25,  igWaitMax: 60,  igLikeChance: 40,  igHourly: 20, igDaily: 100,
    xWaitMin: 15,   xWaitMax: 40,   xLikeChance: 50,   xHourly: 30,  xDaily: 150
  };

  const TIPS = {
    tiktok: "TikTok: সব ভিডিওতে like দিলে ঝুঁকি বেশি। ঘণ্টার সীমা (যেমন ১০০) দিলে নিরাপদ।",
    linkedin: "LinkedIn: প্রতি পোস্টে ১০–২০ সেকেন্ড অপেক্ষা, দিনে ২০০ like। ৫০০-৬০০ দিলে restriction-এর ঝুঁকি বেশি।",
    facebook: "Facebook দ্রুত like দেখলে \"misusing this feature\" বলে সাময়িক block করে। ঘণ্টায় ৩০, দিনে ১৫০-এর মধ্যে রাখুন।",
    instagram: "Instagram সবচেয়ে কড়া, \"Action Blocked\" সহজে আসে। ঘণ্টায় ২০, দিনে ১০০-এর বেশি না। নতুন account হলে আরো কম।",
    twitter: "X automation ধরলে account lock করে। ঘণ্টায় ৩০, দিনে ১৫০-এর মধ্যে রাখুন।"
  };

  const DEFAULTS = Object.assign({
    autoLike: false, autoScroll: false, speed: "slow",
    autoComment: false, geminiKey: "", lastCommentAt: 0, // LinkedIn AI comment
    humanize: true,        // মাঝে মাঝে থামা, একটু উপরে ফিরে দেখা, এলোমেলো অবস্থান
    stopOnWarning: true,   // "Try again later"/captcha দেখলে ২৪ ঘণ্টা বন্ধ
    breakAfter: 15, breakMin: 2, reloadEvery: 10,
    blockSensitive: true, blockWords: "",
    sites: { tiktok: true, linkedin: true, facebook: true, instagram: true, twitter: true },
    enabledTabs: [],
    // হিসাব (সব tab মিলিয়ে)
    batchLikes: 0, breakUntil: 0, likeLog: {}, siteBlockedUntil: {}, lastWarning: null
  }, RULE_DEFAULTS);

  // এগুলো বদলালে কাজ থামানো হয় না (শুধু হিসাব আপডেট)
  const COUNTER_KEYS = ["batchLikes", "breakUntil", "likeLog", "siteBlockedUntil", "lastWarning", "lastLikeAt", "lastCommentAt"];

  function siteFromHost(host) {
    const h = String(host || "").toLowerCase();
    const is = (d) => h === d || h.endsWith("." + d);
    if (is("tiktok.com")) return "tiktok";
    if (is("linkedin.com")) return "linkedin";
    if (is("facebook.com")) return "facebook";
    if (is("instagram.com")) return "instagram";
    if (is("x.com") || is("twitter.com")) return "twitter";
    return null;
  }

  root.AutoLikeConfig = Object.freeze({
    SITE_NAMES, RULE_KEYS, RULE_DEFAULTS, TIPS, DEFAULTS, COUNTER_KEYS, siteFromHost
  });
})(globalThis);
