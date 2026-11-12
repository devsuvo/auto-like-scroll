// পোস্ট বাদ দেওয়ার filter: ধর্মীয় (বিশেষ করে ইসলামিক), রাজনৈতিক, আরবি লেখা, নিজের শব্দ।
// content.js এটা ব্যবহার করে। Test: node tests/filter.test.js
//
// নিয়ম:
// - ইংরেজি/বাংলিশ শব্দ পুরো শব্দ হিসেবে মেলে (শেষে s/es চলবে): "selection"-এ "election" ধরে না
// - বাংলা শব্দও পুরো শব্দ হিসেবে মেলে, শেষে র/এর/ে/তে/জি… চলবে: "নবীজির" ধরে, "নবীন" ধরে না
// - hashtag-এর ভেতরে জোড়া লাগানো শব্দও খোঁজে: #islamicreminder
// - মানুষের নামের অংশ বাদ: "Rafiqul Islam", "রফিকুল ইসলাম", "Muslim Uddin" ধর্মীয় পোস্ট নয়
// - profile নামে শুধু স্পষ্ট শব্দ (Islamic, Quran, Masjid…), মানুষের নাম হতে পারে এমন শব্দ নয়
(function (root) {
  "use strict";

  const norm = (s) => String(s == null ? "" : s).normalize("NFC");
  const isAscii = (s) => /^[\x00-\x7F]+$/.test(s);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uniq = (arr) => Array.from(new Set(arr));

  // আরবি হরফ (আরবি, উর্দু, ফারসি; ﷺ ﷲ-এর মতো চিহ্নসহ)। একটা অক্ষর থাকলেই ধরা হয়।
  const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;

  // =====================================================================
  // ইসলামিক
  // =====================================================================
  const ISLAMIC_EN = [
    "islam", "islamic", "islamically", "muslim", "muslimah", "muslima", "ummah", "ummat", "deen", "deeni",
    "allah", "allahu akbar", "allahuakbar", "subhanallah", "subhan allah", "subhanaallah",
    "subhanallahi wa bihamdihi", "alhamdulillah", "alhamdulilah", "alhamdulliah", "alhamdolillah",
    "alhamdu lillah", "mashallah", "masha allah", "mashaallah", "mashaalah", "tabarakallah",
    "inshallah", "insha allah", "inshaallah", "insha'allah", "insha’allah", "inshaa allah",
    "astaghfirullah", "astagfirullah", "bismillah", "bismillahir rahmanir rahim",
    "la ilaha illallah", "lailahaillallah", "assalamualaikum", "assalamu alaikum", "asalamualaikum",
    "assalamu alaykum", "salamualaikum", "walaikum assalam", "walaikumassalam",
    "jazakallah", "jazakallahu khair", "jazakallah khair", "jazakallahu khairan",
    "quran", "qur'an", "qur’an", "koran", "quranic", "holy quran", "tilawat", "tilawah", "tilawa",
    "hifz", "hafiz e quran", "hadith", "hadees", "hadis", "sunnah", "sunnat", "seerah", "sirah",
    "seerat", "tafsir", "tafseer", "fiqh", "fatwa", "sharia", "shariah", "halal", "haram", "makruh",
    "wudu", "wudhu", "wuzu", "salat", "salaah", "namaz", "namaaz", "jummah", "jumma", "jumuah",
    "jumu'ah", "jummah mubarak", "jumma mubarak", "taraweeh", "tarawih", "tahajjud", "fajr", "zuhr",
    "dhuhr", "maghrib", "witr", "sujood", "sajdah", "sajda", "dua", "dhikr", "zikr", "durood",
    "darood", "istighfar", "tawbah", "taubah", "tawheed", "tawhid", "kufr", "kafir", "jannah",
    "jahannam", "akhirah", "akhirat", "qiyamah", "qiyamat", "imaan", "taqwa",
    "ramadan", "ramzan", "ramadhan", "ramadan kareem", "ramadan mubarak", "iftar", "sehri", "suhoor",
    "sahur", "eid", "eid mubarak", "eid ul fitr", "eid al fitr", "eidul fitr", "eid ul adha",
    "eid al adha", "eidul adha", "qurbani", "qurban", "udhiyah", "hajj", "haj", "umrah", "makkah",
    "mecca", "madinah", "madina", "medina", "kaaba", "kabah", "masjid", "mosque", "masjid al haram",
    "masjid an nabawi", "al aqsa", "aqsa", "prophet", "prophet muhammad", "rasulullah", "rasool",
    "rasul", "pbuh", "sallallahu alaihi wasallam", "sahaba", "sahabi", "caliph", "caliphate", "imam",
    "mufti", "maulana", "mawlana", "moulana", "molana", "hujur", "huzur", "qari", "ustadh", "ustaz",
    "dawah", "da'wah", "tabligh", "tablighi", "ijtema", "ijtima", "bishwa ijtema", "madrasa",
    "madrasah", "madrassa", "qawmi", "hijab", "hijabi", "niqab", "burqa", "abaya", "nasheed", "naat",
    "naat sharif", "hamd", "waz", "waaz", "waz mahfil", "mahfil", "milad", "mawlid", "eid e milad",
    "shab e barat", "shab e qadr", "laylatul qadr", "lailatul qadr", "ashura", "muharram", "zakat",
    "zakah", "sadaqah", "sadaqa", "sadqa", "fitra", "sunni", "shia", "shiite", "salafi", "sufi",
    "tasawwuf", "mazar", "dargah", "khutbah", "khutba", "adhan", "azan", "azaan", "takbir",
    "takbeer", "kalima", "kalma", "shahada", "shahadah", "tasbih", "tasbeeh", "miswak", "bukhari",
    "sahih bukhari", "tirmidhi", "riyadus salihin", "islamic reminder", "islamic quotes",
    "islamic video", "islamic status"
  ];

  const ISLAMIC_BN = [
    "ইসলাম", "ইসলামিক", "ইসলামী", "ইসলামি", "মুসলিম", "মুসলমান", "উম্মাহ", "উম্মত", "দ্বীন", "দ্বীনি", "দ্বীনী",
    "আল্লাহ", "আল্লাহু আকবার", "আল্লাহতায়ালা", "সুবহানাল্লাহ", "সুবহানআল্লাহ", "সুবহানাল্লাহি",
    "আলহামদুলিল্লাহ", "আলহামদুলিল্লাহ্", "মাশাআল্লাহ", "মাশাল্লাহ", "মাশআল্লাহ", "ইনশাআল্লাহ", "ইনশাল্লাহ",
    "ইনশা আল্লাহ", "আস্তাগফিরুল্লাহ", "বিসমিল্লাহ", "বিসমিল্লাহির রাহমানির রাহিম", "লা ইলাহা ইল্লাল্লাহ",
    "আসসালামু আলাইকুম", "আসসালামুয়ালাইকুম", "আস্সালামু আলাইকুম", "ওয়ালাইকুম আসসালাম",
    "জাযাকাল্লাহ", "জাজাকাল্লাহ", "কুরআন", "কোরআন", "কোরান", "কুরআনুল কারিম", "তিলাওয়াত", "তেলাওয়াত",
    "হাফেজে কুরআন", "হাদিস", "হাদীস", "সুন্নাহ", "সুন্নত", "সিরাত", "সীরাত", "তাফসির", "তাফসীর", "ফিকহ",
    "ফতোয়া", "শরিয়া", "শরীয়া", "শরিয়ত", "শরীয়ত", "হালাল", "হারাম", "অজু", "ওজু", "ওযু",
    "নামাজ", "নামায", "সালাত", "জামাত", "জুমা", "জুম্মা", "জুমআ", "জুমাবার", "জুম্মা মোবারক", "জুমা মোবারক",
    "তারাবি", "তারাবিহ", "তারাবীহ", "তাহাজ্জুদ", "ফজর", "যোহর", "জোহর", "মাগরিব", "বিতর", "সিজদা", "সেজদা",
    "রুকু", "দোয়া", "দোআ", "দুআ", "দুয়া", "জিকির", "যিকির", "দরুদ", "দুরুদ", "ইস্তেগফার", "তওবা", "তাওবা",
    "তাওহিদ", "তাওহীদ", "শিরক", "কুফর", "কাফির", "কাফের", "জাহান্নাম", "আখিরাত", "আখেরাত", "পরকাল",
    "কিয়ামত", "কেয়ামত", "ঈমান", "তাকওয়া", "রমজান", "রমযান", "রোজা", "রোযা", "ইফতার", "সেহরি", "সাহরি",
    "ঈদ", "ঈদ মোবারক", "ঈদুল ফিতর", "ঈদুল আযহা", "ঈদুল আজহা", "কোরবানি", "কুরবানি", "কোরবানী",
    "হজ", "হজ্জ", "হজ্ব", "ওমরাহ", "উমরাহ", "ওমরা", "মক্কা", "মদিনা", "মদীনা", "কাবা", "কাবা শরীফ",
    "মসজিদ", "মসজিদুল হারাম", "আল আকসা", "আকসা", "নবী", "রাসূল", "রাসুল", "রাসুলুল্লাহ", "রাসূলুল্লাহ",
    "সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম", "(সাঃ)", "(সা.)", "(সা:)", "(রাঃ)", "(রা.)",
    "সাহাবি", "সাহাবী", "সাহাবা", "ইমাম", "মুফতি", "মাওলানা", "মওলানা", "হুজুর", "ক্বারী", "দাওয়াহ",
    "তাবলীগ", "তাবলিগ", "ইজতেমা", "বিশ্ব ইজতেমা", "মাদ্রাসা", "মাদরাসা", "কওমি", "হিজাব", "নিকাব", "বোরকা",
    "বোরখা", "আবায়া", "নাশিদ", "গজল", "হামদ", "নাতে রাসূল", "ইসলামী সংগীত", "ওয়াজ", "ওয়াজ মাহফিল",
    "মাহফিল", "মিলাদ", "মিলাদুন্নবী", "শবে বরাত", "শবেবরাত", "শবে কদর", "শবেকদর", "লাইলাতুল কদর", "আশুরা",
    "মহররম", "মুহাররম", "যাকাত", "জাকাত", "সদকা", "সাদকা", "ফিতরা", "সুন্নি", "শিয়া", "সুফি", "মাজার",
    "দরগাহ", "খুতবা", "আজান", "আযান", "তাকবির", "তাকবীর", "কালেমা", "তাসবিহ", "তাসবীহ", "মিসওয়াক"
  ];

  // hashtag-এর ভেতরে খোঁজা হয় (#islamicreminder, #masjidvibes)
  const ISLAMIC_TAG = [
    "islam", "muslim", "allah", "quran", "koran", "hadith", "hadees", "sunnah", "masjid", "mosque",
    "ramadan", "ramzan", "jummah", "jumma", "namaz", "salat", "ummah", "nasheed", "tilawat", "tilawah",
    "dawah", "jannah", "akhirah", "umrah", "hajj", "makkah", "madina", "kaaba", "alhamdulillah",
    "subhanallah", "mashallah", "inshallah", "astaghfirullah", "bismillah", "assalamualaikum",
    "prophet", "sahaba", "hijab", "niqab", "iftar", "sehri", "taraweeh", "tahajjud", "zikr", "dhikr",
    "durood", "seerah", "tafsir", "tafseer", "madrasa", "maulana", "mufti", "imaan", "taqwa",
    "wazmahfil", "waaz", "eidmubarak", "eidulfitr", "eiduladha", "deenislam"
  ];

  // =====================================================================
  // অন্য ধর্ম
  // =====================================================================
  const RELIGION_EN = [
    "religion", "religious", "spiritual", "spirituality", "prayer", "prayers", "praying", "worship",
    "hindu", "hinduism", "puja", "pooja", "durga puja", "temple", "krishna", "hare krishna", "shiva",
    "mahadev", "ganesh", "bhagavad gita", "diwali", "janmashtami", "rath yatra", "church", "christian",
    "christianity", "jesus", "christ", "bible", "gospel", "pastor", "christmas", "easter", "buddha",
    "buddhist", "buddhism", "pagoda", "monk", "sikh", "gurdwara"
  ];
  const RELIGION_BN = [
    "ধর্ম", "ধর্মীয়", "ধর্মপ্রাণ", "হিন্দু", "পূজা", "পুজা", "দুর্গাপূজা", "দুর্গাপুজা", "কালীপূজা",
    "সরস্বতী পূজা", "মন্দির", "ভগবান", "ঈশ্বর", "প্রার্থনা", "উপাসনা", "রথযাত্রা", "জন্মাষ্টমী", "গির্জা",
    "খ্রিস্টান", "খ্রিষ্টান", "যিশু", "যীশু", "বাইবেল", "বড়দিন", "ইস্টার", "বৌদ্ধ", "প্যাগোডা", "বুদ্ধ পূর্ণিমা"
  ];
  const RELIGION_TAG = [
    "religion", "spiritual", "hindu", "puja", "pooja", "church", "christian", "jesus", "bible",
    "buddha", "krishna", "mahadev", "harekrishna"
  ];

  // =====================================================================
  // রাজনীতি
  // =====================================================================
  const POLITICS_EN = [
    "politics", "political", "politician", "election", "electoral", "vote", "voting", "voter", "ballot",
    "government", "govt", "minister", "prime minister", "parliament", "awami", "awami league", "bnp",
    "jamaat", "jamaat e islami", "jatiya party", "chhatra league", "chatro league", "chhatra dal",
    "chatro dal", "chhatra shibir", "shibir", "jubo league", "ncp", "interim government",
    "chief adviser", "hartal", "blockade", "dr yunus", "dr. yunus", "muhammad yunus",
    "yunus government", "sheikh hasina", "hasina government", "hasina regime", "khaleda zia",
    "tarique rahman", "modi", "narendra modi", "bjp", "trump", "donald trump", "biden",
    "kamala harris", "putin", "netanyahu", "zelensky", "israel", "israeli", "palestine",
    "palestinian", "gaza", "hamas", "zionist", "zionism", "genocide", "free palestine", "protest",
    "democracy", "dictator", "dictatorship", "fascist", "fascism", "quota movement",
    "july revolution", "july uprising"
  ];
  const POLITICS_BN = [
    "রাজনীতি", "রাজনৈতিক", "রাজনীতিবিদ", "নির্বাচন", "নির্বাচনী", "ভোট", "ভোটার", "ভোটকেন্দ্র", "ব্যালট",
    "সংসদ", "সংসদ সদস্য", "এমপি", "মন্ত্রী", "প্রধানমন্ত্রী", "রাষ্ট্রপতি", "প্রধান উপদেষ্টা",
    "অন্তর্বর্তী সরকার", "অন্তর্বর্তীকালীন সরকার", "আওয়ামী", "আওয়ামী লীগ", "আওয়ামীলীগ", "বিএনপি",
    "জামায়াত", "জামায়াতে ইসলামী", "জাতীয় পার্টি", "ছাত্রলীগ", "ছাত্রদল", "যুবলীগ", "যুবদল", "ছাত্রশিবির",
    "এনসিপি", "হরতাল", "অবরোধ", "আন্দোলন", "গণঅভ্যুত্থান", "গণ অভ্যুত্থান", "স্বৈরাচার", "স্বৈরশাসক",
    "ফ্যাসিস্ট", "ফ্যাসিবাদ", "শেখ হাসিনা", "হাসিনা সরকার", "খালেদা জিয়া", "তারেক রহমান", "ড. ইউনূস",
    "ড ইউনূস", "ডক্টর ইউনূস", "ইউনূস সরকার", "মুহাম্মদ ইউনূস", "মোদি", "মোদী", "ট্রাম্প", "বাইডেন",
    "পুতিন", "নেতানিয়াহু", "ইসরায়েল", "ইসরায়েলি", "ফিলিস্তিন", "ফিলিস্তিনি", "গাজা", "হামাস", "গণহত্যা",
    "জুলাই বিপ্লব", "জুলাই আন্দোলন", "কোটা আন্দোলন", "কোটা সংস্কার", "সরকার পতন"
  ];
  // "modi"/"trump" নয়: #modified, #trumpet-এ ভুল মিল হতো
  const POLITICS_TAG = [
    "politic", "election", "awamileague", "awami", "bnp", "jamaat", "shibir", "chhatraleague",
    "chatroleague", "chhatradal", "chatrodal", "sheikhhasina", "khaledazia", "dryunus",
    "narendramodi", "donaldtrump", "palestine", "gaza", "israel", "zionis", "genocide", "democracy",
    "quotamovement", "julyrevolution", "hartal"
  ];

  // =====================================================================
  // profile নাম: শুধু স্পষ্ট ধর্মীয়/রাজনৈতিক account।
  // "Islam", "Muslim", "Imam", "Sheikh", "Jannat", "সরকার" ইত্যাদি মানুষের নাম/পদবি হয়, তাই নেই।
  // =====================================================================
  const NAME_EN = [
    "islamic", "quran", "quranic", "hadith", "hadees", "sunnah", "masjid", "mosque", "deen", "deeni",
    "ummah", "dawah", "nasheed", "tilawat", "tilawah", "waz", "mahfil", "allah", "allahu",
    "alhamdulillah", "subhanallah", "mashallah", "inshallah", "bismillah", "astaghfirullah", "jannah",
    "akhirah", "hijab", "niqab", "madrasa", "madrasah", "maulana", "mufti", "hujur", "huzur", "ijtema",
    "tabligh", "seerah", "tafsir", "islamic tv", "peace tv", "ramadan", "jummah",
    "awami", "awami league", "bnp", "jamaat", "chhatra league", "chhatra dal", "jubo league",
    "chhatra shibir", "shibir"
  ];
  const NAME_BN = [
    "ইসলামিক", "ইসলামী", "কুরআন", "কোরআন", "হাদিস", "হাদীস", "সুন্নাহ", "মসজিদ", "ওয়াজ", "তিলাওয়াত",
    "তেলাওয়াত", "দ্বীন", "দ্বীনি", "উম্মাহ", "দাওয়াহ", "মাদ্রাসা", "মাদরাসা", "মাওলানা", "মুফতি", "হুজুর",
    "আল্লাহ", "আলহামদুলিল্লাহ", "সুবহানাল্লাহ", "ইনশাআল্লাহ", "মাশাআল্লাহ", "বিসমিল্লাহ", "নাশিদ", "গজল",
    "মাহফিল", "ইজতেমা", "তাবলীগ", "আওয়ামী", "আওয়ামী লীগ", "বিএনপি", "জামায়াত", "ছাত্রলীগ", "ছাত্রদল",
    "যুবলীগ", "ছাত্রশিবির"
  ];
  // জোড়া লাগানো username-এর ভেতরে খোঁজা হয় (QuranDaily, islamic_status_bd)
  const NAME_TAG = [
    "islamic", "quran", "hadith", "sunnah", "masjid", "mosque", "ummah", "dawah", "nasheed", "tilawat",
    "alhamdulillah", "subhanallah", "mashallah", "inshallah", "bismillah", "astaghfirullah", "allahu",
    "madrasa", "maulana", "mufti", "hujur", "deenislam", "awamileague", "chhatraleague",
    "chatroleague", "jamaat", "chhatradal"
  ];

  // =====================================================================
  // ভুল মিল এড়াতে: এগুলো ধর্মীয়/রাজনৈতিক পোস্ট নয়, পরীক্ষার আগে মুছে ফেলা হয়
  // =====================================================================
  const SAFE_EN = [
    "islamic university of technology", "international islamic university chittagong",
    "international islamic university", "islamic university", "islami bank",
    "first security islami bank", "social islami bank", "shahjalal islami bank", "global islami bank",
    "vote of thanks", "dua lipa", "christian dior", "temple university", "temple run", "trump card",
    "bnp paribas"
  ];
  const SAFE_BN = [
    "ইসলামী ব্যাংক", "ইসলামী বিশ্ববিদ্যালয়", "ইসলামিক বিশ্ববিদ্যালয়", "ইসলামিক ইউনিভার্সিটি",
    "ইসলামী ইউনিভার্সিটি"
  ];

  // বাংলা শব্দের শেষে যা যোগ হতে পারে: প্রথমে (ী/িক/ুল/জি/গুলো…), তারপর (র/এর/ে/তে/কে…)
  const BN_SUFFIX_1 = ["ী", "ি", "ীয়", "িক", "ুল", "জি", "জী", "গুলো", "গুলি", "সমূহ", "টি", "টা", "খানা"];
  const BN_SUFFIX_2 = ["র", "ের", "এর", "ে", "য়", "য়ে", "য়ের", "কে", "তে", "রা", "দের"];

  function byLengthDesc(a, b) { return b.length - a.length; }

  function enRegex(words, flags) {
    const list = uniq(words.map((w) => norm(w).toLowerCase().trim()).filter(Boolean)).sort(byLengthDesc);
    if (!list.length) return null;
    const body = list.map((w) => esc(w).replace(/\s+/g, "[\\s\\-_]+")).join("|");
    return new RegExp("\\b(?:" + body + ")(?:s|es)?\\b", flags || "i");
  }

  function bnRegex(words) {
    const list = uniq(words.map((w) => norm(w).trim()).filter(Boolean)).sort(byLengthDesc);
    if (!list.length) return null;
    const opt = (arr) => "(?:" + arr.map((s) => esc(norm(s))).join("|") + ")?";
    const body = list.map((w) => esc(w).replace(/\s+/g, "\\s*")).join("|");
    return new RegExp(
      "(?<![\\p{L}\\p{M}])(?:" + body + ")" + opt(BN_SUFFIX_1) + opt(BN_SUFFIX_2) + "(?![\\p{L}\\p{M}])",
      "u"
    );
  }

  const SAFE_EN_RE = new RegExp(enRegex(SAFE_EN).source, "gi");
  const SAFE_BN_RE = new RegExp(
    uniq(SAFE_BN.map(norm)).sort(byLengthDesc).map((w) => esc(w).replace(/\s+/g, "\\s*")).join("|"),
    "gu"
  );

  function stripSafe(text) {
    return text.replace(SAFE_EN_RE, " ").replace(SAFE_BN_RE, " ");
  }

  // ---- মানুষের নামের "Islam"/"Muslim" বাদ ----
  // "In Islam", "Learn Islam", "Beautiful Islam" ধর্মীয়; "Tanvir Islam", "Rafiqul Islam" নাম
  const WORDS_BEFORE_RELIGIOUS_ISLAM = new Set([
    "in", "of", "the", "about", "and", "on", "for", "through", "to", "from", "into", "learn",
    "learning", "understanding", "embrace", "embraced", "embracing", "accept", "accepted", "revert",
    "reverted", "convert", "converted", "teachings", "teaching", "history", "light", "pillars",
    "pillar", "spread", "defend", "why", "what", "how", "is", "was", "true", "real", "beautiful",
    "religion", "deen", "political", "radical", "modern", "early", "classical", "sunni", "shia",
    "practice", "practicing", "love", "peace", "women", "rights", "faith", "welcome", "join",
    "allah", "quran", "prophet", "my", "our", "your", "dear"
  ]);
  const NAME_STRIP = [
    // Rafiqul Islam, Saif-ul-Islam (beautiful/soul বাদ)
    [/\b([a-z]*ul)[\s\-_]*islam\b/gi, (m, w) => (/(?:ful|soul)$/i.test(w) ? m : " ")],
    // Md Tanvir Islam
    [/\b(?:md|mohammad|mohammed|muhammad|mohd)\.?\s+[a-z]+\s+islam\b/gi, " "],
    // Tanvir Islam (আগের শব্দ বড় হাতের নাম)
    [/\b([A-Z][a-zA-Z]+)\s+Islam\b/g,
      (m, w) => (WORDS_BEFORE_RELIGIOUS_ISLAM.has(w.toLowerCase()) ? m : " ")],
    // Muslim Uddin, Md. Muslim
    [/\bmuslim\s+(?:uddin|mia|miah|hossain|hossen|ali|khan)\b/gi, " "],
    [/\b(?:md|mohammad|mohammed|muhammad|mohd)\.?\s+muslim\b/gi, " "],
    // রফিকুল ইসলাম, সাইফ উল ইসলাম, মোঃ তানভীর ইসলাম, মুসলিম উদ্দিন
    [new RegExp(norm("[\\p{L}\\p{M}]*ুল\\s*ইসলাম"), "gu"), " "],
    [new RegExp(norm("উল\\s+ইসলাম"), "gu"), " "],
    [new RegExp(norm("(?:মোঃ|মো\\.|মোহাম্মদ|মুহাম্মদ|মোহাম্মাদ)\\s*[\\p{L}\\p{M}]+\\s+ইসলাম"), "gu"), " "],
    [new RegExp(norm("মুসলিম\\s+(?:উদ্দিন|উদ্দীন|মিয়া|মিঞা|হোসেন|আলী)"), "gu"), " "]
  ];

  function stripNames(text) {
    let t = text;
    for (const [re, rep] of NAME_STRIP) t = t.replace(re, rep);
    return t;
  }

  const TAG_RE = /#[\p{L}\p{M}\p{N}_]+/gu;

  function parseCustom(text) {
    const words = uniq(
      String(text || "").split(/[,\n،]+/).map((s) => norm(s).trim().replace(/^#/, "")).filter(Boolean)
    );
    const ascii = words.filter(isAscii).map((w) => w.toLowerCase());
    return {
      ascii,
      other: words.filter((w) => !isAscii(w)),
      roots: ascii.map((w) => w.replace(/[\s_.\-]+/g, "")).filter((w) => w.length >= 4)
    };
  }

  // opts: { sensitive: true/false (ধর্মীয়/রাজনৈতিক/আরবি), custom: "শব্দ, শব্দ" }
  function compile(opts) {
    opts = opts || {};
    const sensitive = opts.sensitive !== false;
    const custom = parseCustom(opts.custom);

    const textEn = sensitive ? enRegex(ISLAMIC_EN.concat(RELIGION_EN, POLITICS_EN)) : null;
    const textBn = sensitive ? bnRegex(ISLAMIC_BN.concat(RELIGION_BN, POLITICS_BN)) : null;
    const tagRoots = sensitive ? uniq(ISLAMIC_TAG.concat(RELIGION_TAG, POLITICS_TAG)) : [];
    const nameEn = sensitive ? enRegex(NAME_EN) : null;
    const nameBn = sensitive ? bnRegex(NAME_BN) : null;
    const nameRoots = sensitive ? NAME_TAG : [];
    const customEn = enRegex(custom.ascii);

    // পোস্ট/caption-এর লেখা। বাদ দেওয়ার কারণ ফেরত দেয়, ঠিক থাকলে null।
    function checkText(input) {
      let text = norm(input);
      if (!text.trim()) return null;
      if (sensitive && ARABIC.test(text)) return "আরবি লেখা";
      text = stripNames(stripSafe(text));
      let m;
      if (textEn && (m = text.match(textEn))) return m[0];
      if (textBn && (m = text.match(textBn))) return m[0];
      if (customEn && (m = text.match(customEn))) return m[0];
      for (const w of custom.other) if (text.includes(w)) return w;

      // জোড়া লাগানো hashtag
      for (const tag of text.match(TAG_RE) || []) {
        const t = tag.slice(1).toLowerCase();
        for (const r of tagRoots) if (t.includes(r)) return tag;
        for (const r of custom.roots) if (t.includes(r)) return tag;
        if (textBn && textBn.test(t.replace(/_/g, " "))) return tag;
      }
      return null;
    }

    // profile-এর নাম ও username
    function checkName(input) {
      let name = norm(input);
      if (!name.trim()) return null;
      if (sensitive && ARABIC.test(name)) return "আরবি নাম";
      name = stripSafe(name);
      const spaced = name.replace(/[_.\-]+/g, " ");
      let m;
      if (nameEn && (m = spaced.match(nameEn))) return m[0];
      if (nameBn && (m = spaced.match(nameBn))) return m[0];
      if (customEn && (m = spaced.match(customEn))) return m[0];
      for (const w of custom.other) if (name.includes(w)) return w;
      const compact = name.toLowerCase().replace(/[\s_.\-]+/g, "");
      for (const r of nameRoots) if (compact.includes(r)) return r;
      for (const r of custom.roots) if (compact.includes(r)) return r;
      return null;
    }

    return { checkText, checkName };
  }

  root.AutoLikeFilter = {
    compile,
    stats: {
      islamic: uniq(ISLAMIC_EN.concat(ISLAMIC_BN)).length,
      religion: uniq(RELIGION_EN.concat(RELIGION_BN)).length,
      politics: uniq(POLITICS_EN.concat(POLITICS_BN)).length
    }
  };
})(globalThis);
