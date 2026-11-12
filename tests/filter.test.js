// filter.js-এর test। চালানো: node tests/filter.test.js
// BLOCK = like দেবে না, ALLOW = like দিতে পারবে
const path = require("path");
require(path.join(__dirname, "..", "auto-like-combined", "filter.js"));

const F = globalThis.AutoLikeFilter;
let pass = 0, fail = 0;

function check(matcher, kind, input, shouldBlock) {
  const reason = kind === "text" ? matcher.checkText(input) : matcher.checkName(input);
  const ok = !!reason === shouldBlock;
  ok ? pass++ : fail++;
  if (!ok || process.argv.includes("-v")) {
    console.log(`${ok ? "✓" : "✗"} [${kind}] ${shouldBlock ? "BLOCK" : "ALLOW"} ${JSON.stringify(input)} → ${reason}`);
  }
}

const m = F.compile({ sensitive: true, custom: "" });
const text = (s, b) => check(m, "text", s, b);
const name = (s, b) => check(m, "name", s, b);

// ---- ইসলামিক: বাদ পড়বে ----
[
  "Alhamdulillah for everything",
  "Jummah Mubarak everyone",
  "Beautiful Quran recitation",
  "nice video #islamicreminder #fyp",
  "#masjidvibes",
  "Allahu Akbar",
  "Insha'Allah next week",
  "In Islam, patience is key",
  "Beautiful Islam",
  "Ramadan Kareem to all",
  "Dua for exam success",
  "Eid Mubarak from our team",
  "#AllahuAkbar",
  "আলহামদুলিল্লাহ, আজকে নতুন চাকরি",
  "মসজিদে নামাজ পড়লাম",
  "ঈদ মোবারক সবাইকে",
  "রমজানের শুভেচ্ছা",
  "নবীজির জীবনী",
  "ঈদুল ফিতরের ছুটি",
  "ইনশাআল্লাহ হবে",
  "জুম্মা মোবারক",
  "কোরবানির হাট",
  "ওয়াজ মাহফিল",
  "হুজুরের বয়ান",
  "রাসূল (সাঃ) বলেছেন",
  "#ইসলামিক_ভিডিও",
  "بسم الله الرحمن الرحيم",
  "নবী ﷺ",
  "الله"
].forEach((s) => text(s, true));

// ---- অন্য ধর্ম ও রাজনীতি: বাদ পড়বে ----
[
  "Happy Durga Puja",
  "Merry Christmas",
  "Sheikh Hasina said",
  "নির্বাচনের ফলাফল",
  "Free Palestine #gaza",
  "ড. ইউনূস বলেছেন",
  "আওয়ামী লীগের সমাবেশ",
  "বিএনপির মিছিল",
  "ধর্মীয় অনুষ্ঠান"
].forEach((s) => text(s, true));

// ---- সাধারণ পোস্ট: like পাবে (ভুল মিল হওয়া উচিত নয়) ----
[
  "Congratulations to Rafiqul Islam on his new role",
  "Thanks Tanvir Islam for the session",
  "Md Tanvir Islam joined as SQA engineer",
  "Saif-ul-Islam won the hackathon",
  "রফিকুল ইসলাম ভাইকে অভিনন্দন",
  "মোঃ তানভীর ইসলাম",
  "Muslim Uddin joined our team",
  "Graduated from Islamic University of Technology (IUT)",
  "Software engineer at Islami Bank",
  "নবীনবরণ অনুষ্ঠান",
  "হজম শক্তি বাড়ানোর উপায়",
  "খাবার বিতরণ কর্মসূচি",
  "কাবাব পার্টি",
  "অজুহাত দিও না",
  "শিয়াল মামা",
  "সরকারি চাকরির খবর",
  "এমপিওভুক্ত শিক্ষক",
  "We are hiring a React developer",
  "The selection process is complete",
  "Vote of thanks by our CEO",
  "Elected as president of the IEEE student branch",
  "nice video ❤️ 😂 #fyp #funny",
  "Hello বাংলা #coding",
  "Upvote if you agree",
  "জামাতা আদর",
  "সুফিয়া কামাল"
].forEach((s) => text(s, false));

// ---- profile নাম: বাদ পড়বে ----
[
  "islamic_reminder",
  "QuranDaily",
  "masjid.vibes",
  "মসজিদের কথা",
  "Islamic Status BD",
  "deen_islam_24",
  "Bangladesh Awami League",
  "আল্লাহর বান্দা",
  "عبد الله",
  "Mufti Menk"
].forEach((s) => name(s, true));

// ---- profile নাম: সাধারণ মানুষ, like পাবে ----
[
  "Rafiqul Islam",
  "Tanvir Islam",
  "tanvir_islam_07",
  "Muslim Uddin",
  "Jannatul Ferdous",
  "জান্নাতুল ফেরদৌস",
  "রফিকুল ইসলাম",
  "Abdullah Al Mamun",
  "আব্দুল্লাহ আল মামুন",
  "Sheikh Rafi",
  "Salahuddin Ahmed",
  "Md. Imam Hossain",
  "Puja Das",
  "Fardeen Khan",
  "Suvo Dev",
  "Islamic University of Technology"
].forEach((s) => name(s, false));

// ---- filter বন্ধ থাকলে ধর্মীয় পোস্টেও like, কিন্তু নিজের শব্দ কাজ করবে ----
const off = F.compile({ sensitive: false, custom: "crypto, betting, islamicworld24, ক্যাসিনো" });
check(off, "text", "Alhamdulillah", false);
check(off, "text", "بسم الله", false);
check(off, "text", "Bitcoin crypto news", true);
check(off, "text", "#cryptotrading tips", true);
check(off, "text", "অনলাইন ক্যাসিনো", true);
check(off, "name", "islamicworld24", true);
check(off, "text", "Normal post about coding", false);

console.log(`\n${pass} পাস, ${fail} ফেল  (সব দেখতে: node tests/filter.test.js -v)`);
console.log(`শব্দ: ইসলামিক ${F.stats.islamic}, অন্য ধর্ম ${F.stats.religion}, রাজনীতি ${F.stats.politics}`);
process.exit(fail ? 1 : 0);
