const autoLikeEl = document.getElementById("autoLike");
const autoScrollEl = document.getElementById("autoScroll");

// popup খুললে আগের সেটিং লোড
chrome.storage.local.get({ autoLike: false, autoScroll: false }, (v) => {
  autoLikeEl.checked = !!v.autoLike;
  autoScrollEl.checked = !!v.autoScroll;
});

// toggle করলে সেভ হবে
autoLikeEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoLike: autoLikeEl.checked });
});

autoScrollEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoScroll: autoScrollEl.checked });
});
