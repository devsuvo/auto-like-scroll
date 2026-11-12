# Changelog

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
