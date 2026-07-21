const toggle = document.querySelector("#langToggle");
const translatable = document.querySelectorAll("[data-zh][data-en]");
const archiveSearch = document.querySelector("#archiveSearch");
const archiveItems = [...document.querySelectorAll("#archiveList .archive-item")];
const archiveCount = document.querySelector("#archiveCount");
const archiveEmpty = document.querySelector("#archiveEmpty");

function currentLanguage() {
  return document.documentElement.lang === "zh-CN" ? "zh" : "en";
}

function filterArchive() {
  if (!archiveSearch) return;

  const query = archiveSearch.value.trim().toLocaleLowerCase();
  let visible = 0;

  archiveItems.forEach((item) => {
    const matches = item.textContent.toLocaleLowerCase().includes(query);
    item.hidden = !matches;
    if (matches) visible += 1;
  });

  if (archiveCount) {
    archiveCount.textContent = currentLanguage() === "zh" ? `${visible} 篇判断` : `${visible} essays`;
  }
  if (archiveEmpty) archiveEmpty.hidden = visible !== 0;
}

function setLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  translatable.forEach((node) => {
    node.textContent = node.dataset[lang];
  });

  if (toggle) {
    toggle.textContent = lang === "zh" ? "EN" : "中文";
    toggle.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切换到中文");
  }

  if (archiveSearch) {
    archiveSearch.placeholder = lang === "zh" ? "搜索行业、公司或问题" : "Search industries, companies, or questions";
  }

  localStorage.setItem("ori-lin-lang", lang);
  filterArchive();
}

toggle?.addEventListener("click", () => {
  setLanguage(currentLanguage() === "zh" ? "en" : "zh");
});

archiveSearch?.addEventListener("input", filterArchive);

setLanguage(localStorage.getItem("ori-lin-lang") || "zh");
