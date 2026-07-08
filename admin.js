(function () {
  const form = document.querySelector("#adminForm");
  const status = document.querySelector("#adminStatus");
  const list = document.querySelector("#adminList");
  if (!form || !status || !list) return;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(items) {
    if (!items.length) {
      list.innerHTML = "<p class='comments-empty'>还没有申请。</p>";
      return;
    }

    list.innerHTML = items.map((item) => `
      <article class="admin-item">
        <div class="comment-meta">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.created_at)}</span>
        </div>
        <p><strong>联系方式：</strong>${escapeHtml(item.contact)}</p>
        <p><strong>资产范围：</strong>${escapeHtml(item.asset_range)}</p>
        <p><strong>想看什么：</strong>${escapeHtml(item.note)}</p>
      </article>
    `).join("");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "正在读取...";
    list.innerHTML = "";
    const token = new FormData(form).get("token");

    try {
      const response = await fetch(`/api/applications?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error("bad_password");
      const items = await response.json();
      status.textContent = "已加载。";
      render(items);
    } catch (error) {
      status.textContent = "密码不对，或后台暂时没连上。";
    }
  });
})();
