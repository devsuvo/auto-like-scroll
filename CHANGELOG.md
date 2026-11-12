# Changelog

## 3.0.0 - auto-like-combined
- Facebook, Instagram, X-এর আলাদা নিরাপদ নিয়ম: পোস্টে অপেক্ষা, like %, ঘণ্টা ও ২৪ ঘণ্টার সীমা
- প্রতিটা site-এর জন্য ঘণ্টা/দিনের like সীমা (popup-এর "Site-এর নিয়ম")
- প্ল্যাটফর্মের সতর্কবার্তা ("Try again later", "Action blocked", captcha) দেখলে সেই site ২৪ ঘণ্টা বন্ধ
- মানুষের মতো আচরণ: মাঝে মাঝে থামা, একটু উপরে ফিরে দেখা, এলোমেলো অবস্থান
- নতুন filter.js: ৪৫০+ ইসলামিক শব্দ (বাংলা + English), বাংলা শব্দ পুরো শব্দ হিসেবে মেলে
- ভুল মিল ঠিক: "Rafiqul Islam"-এর মতো নাম, IUT, সরকারি চাকরি, নবীনবরণ, কাবাব ইত্যাদি আর বাদ পড়ে না
- config.js: সব সেটিং এক জায়গায়; tests/filter.test.js: ৯৭টা test

## 2.7.1 - auto-like-combined
- caption আলাদাভাবে খুঁজে পড়ে (TikTok-এ ভিডিওর বাইরের caption-ও)
- একটা আরবি অক্ষর থাকলেও বাদ (আগে ৩টা লাগত); profile নামেও

## 2.7.0 - auto-like-combined
- profile নাম ও username-ও পরীক্ষা করে (islamic_reminder, QuranDaily, আরবি নাম)
- সব site-এর জন্য নাম খোঁজার নিয়ম; TikTok-এ ভিডিওর বাইরের নামও

## 2.6.1 - auto-like-combined
- জোড়া লাগানো hashtag-এর ভেতরেও খোঁজে (#islamicreminder, #masjidvibes)
- TikTok-এ প্রচলিত ইসলামিক শব্দ যোগ (waz, ওয়াজ, তিলাওয়াত, nasheed, umrah, makkah, আজান ইত্যাদি)

## 2.6.0 - auto-like-combined
- ১৫টা like হলে ৫ মিনিট বিরতি, তারপর নিজে থেকে আবার শুরু (সব tab মিলিয়ে হিসাব)
- প্রতি ১০ মিনিটে page reload, reload-এর পর নিজে থেকে চলে
- popup-এ "বিরতি ও reload" অংশ

## 2.5.0 - auto-like-combined
- LinkedIn-এর আলাদা নিয়ম: পোস্ট মাঝখানে এনে ৩০–৫০ সেকেন্ড অপেক্ষা, তারপর like, তারপর পরের পোস্ট
- popup-এ "LinkedIn-এর নিয়ম" অংশ (সেকেন্ড ও like %)

## 2.4.0 - auto-like-combined
- popup-এ "কোণের ছোট window-এ সরাও" বাটন: minimize ছাড়াই background-এ চালানো (TikTok নতুন ভিডিও load করতে থাকে)

## 2.3.0 - auto-like-combined
- TikTok default: প্রতিটা ভিডিও ৮ সেকেন্ড দেখে সব ভিডিওতে like (100%)
- পুরনো সেটিং একবার নতুন মানে বদলানো

## 2.2.1 - auto-like-combined
- TikTok fix: চলমান ভিডিও দেখে সময় গোনে (আগে like বাটন বদলালে timer শূন্য হয়ে যেত)
- ভিডিওর বাইরে থাকা like বাটনও খুঁজে পায়; না পেলে ৩ সেকেন্ড আরো চেষ্টা
- click-এর সাথে mouse event পাঠায়

## 2.2.0 - auto-like-combined
- TikTok-এর আলাদা নিয়ম: প্রতিটা ভিডিও ৭–৮ সেকেন্ড দেখে তারপর like, তারপর পরের ভিডিও
- TikTok-এ আলাদা like %; অন্য site-এর ১–৩ মিনিট বিরতির ওপর প্রভাব ফেলে না
- popup-এ "TikTok-এর নিয়ম" অংশ

## 2.1.0 - auto-like-combined
- শুধু চালু করা tab-এ চলে (অন্য tab/window-এ না)
- site অনুযায়ী on/off (TikTok, LinkedIn, Facebook, Instagram, X)
- নতুন popup design: এই tab-এর অবস্থা, ভাগ করা অংশ, dark mode
- default গতি Slow

## 2.0.0 - auto-like-combined
- Facebook, Instagram, X/Twitter যোগ
- browser minimize বা অন্য tab-এ থাকলেও চলে (background ticker)
- minimize অবস্থায় সরাসরি scroll (smooth animation চলে না বলে)
- content.js গুছিয়ে নতুন করে লেখা, site অনুযায়ী আলাদা অংশ

## 1.5.1 - auto-like-combined
- আরবি লেখা (৩+ অক্ষর) থাকলে পোস্ট বাদ

## 1.5.0 - auto-like-combined
- ধর্মীয় (ইসলামিক সহ) ও রাজনৈতিক পোস্ট বাদ (বাংলা + English শব্দ তালিকা)
- popup-এ on/off আর নিজের শব্দ যোগের ঘর

## 1.4.0 - auto-like-combined
- like-এর মাঝে ১–৩ মিনিট এলোমেলো বিরতি (popup থেকে বদলানো যায়)
- ৬০% পোস্টে like, বাকিগুলো এলোমেলো বাদ (popup থেকে %)
- পোস্টের দৈর্ঘ্য অনুযায়ী ২–১৫ সেকেন্ড "পড়ে" তারপর সিদ্ধান্ত
- Promoted/Sponsored পোস্টে like দেয় না
- status box-এ skip সংখ্যা

## 1.3.0 - auto-like-combined
- প্রতি ২ মিনিটে একটা like (default), popup থেকে মিনিট বদলানো যায়
- সময় ±10% এলোমেলো; সব tab মিলিয়ে হিসাব
- status box-এ পরের like কত সেকেন্ড পর তা দেখায়

## 1.2.0 - auto-like-combined
- অনেক দ্রুত: default Fast speed (like ~0.25s, scroll ~1s পরপর)
- popup-এ Speed option (Fast / Normal / Slow)
- LinkedIn: screen-এর সব পোস্ট একটার পর একটা like করে তারপর scroll

## 1.1.1 - auto-like-combined
- LinkedIn নতুন design-এর like বাটন চেনা (role=button, "Reaction button state" label, aria-pressed ছাড়া)
- LinkedIn-এ আগে like করা পোস্ট বাদ দেওয়া

## 1.1.0 - auto-like-combined
- item selector-এর ওপর নির্ভরতা বাদ: like বাটন/video খুঁজে কাজ করে
- আসল scrollable container খুঁজে scroll (TikTok-এ ArrowDown fallback)
- popup থেকে tab-এ script inject (reload-এর পর refresh লাগবে না)
- page-এ status box
- বাংলা UI-তে like বাটন চেনা
- TikTok-এ আগে like করা ভিডিও unlike না হওয়ার চেক

## 1.0.1 - auto-like-combined
- Like বাটন load না হলে পরের tick-এ আবার চেষ্টা করে (আগে একবারেই হার মানত)
- LinkedIn-এ nested item দুইবার match হওয়ার সমস্যা ঠিক
- TikTok-এ ArrowDown দিয়ে পরের ভিডিও, কাজ না করলে scroll fallback
- Scroll চলাকালীন cooldown, ফলে ভিডিও বাদ পড়বে না
- Debug log যোগ (console-এ `[AutoLike]`)

## 1.0.0 - auto-like-combined
- TikTok ও LinkedIn একই extension-এ
- Auto Like ও Auto Scroll toggle
