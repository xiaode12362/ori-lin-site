const toggle = document.querySelector("#langToggle");
const translatable = document.querySelectorAll("[data-zh][data-en]");

function setLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  translatable.forEach((node) => {
    node.textContent = node.dataset[lang];
  });
  toggle.textContent = lang === "zh" ? "EN" : "中";
  localStorage.setItem("ori-lin-lang", lang);
}

toggle.addEventListener("click", () => {
  const next = document.documentElement.lang === "zh-CN" ? "en" : "zh";
  setLanguage(next);
});

setLanguage(localStorage.getItem("ori-lin-lang") || "zh");
