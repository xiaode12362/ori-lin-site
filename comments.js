(function () {
  const mount = document.querySelector("[data-comments-page]");
  if (!mount) return;

  const page = mount.dataset.commentsPage || location.pathname;
  const api = "/api/comments";

  mount.innerHTML = `
    <section class="comments-shell">
      <div class="comments-head">
        <div>
          <p class="eyebrow">COMMENTS</p>
          <h2>评论</h2>
        </div>
        <p>所有人都可以评论、回复、点赞。说人话，别发广告。</p>
      </div>
      <form class="comment-form" data-role="new-comment">
        <input name="name" maxlength="40" placeholder="你的名字 / 昵称" required>
        <textarea name="body" maxlength="1000" placeholder="写下你的看法。越具体越好。" required></textarea>
        <button class="button primary" type="submit">发布评论</button>
      </form>
      <p class="comments-empty" data-role="comment-status" hidden></p>
      <div class="comments-list" data-role="comments-list"></div>
    </section>
  `;

  const list = mount.querySelector("[data-role='comments-list']");
  const form = mount.querySelector("[data-role='new-comment']");
  const status = mount.querySelector("[data-role='comment-status']");

  function setStatus(message, isError) {
    status.hidden = !message;
    status.textContent = message || "";
    status.style.color = isError ? "#8c1d18" : "";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function groupComments(items) {
    const roots = [];
    const byId = new Map();
    items.forEach((item) => {
      item.children = [];
      byId.set(item.id, item);
    });
    items.forEach((item) => {
      if (item.parent_id && byId.has(item.parent_id)) {
        byId.get(item.parent_id).children.push(item);
      } else {
        roots.push(item);
      }
    });
    return roots;
  }

  function renderComment(item, depth) {
    const replies = item.children.map((child) => renderComment(child, depth + 1)).join("");
    return `
      <article class="comment-item ${depth ? "is-reply" : ""}" data-id="${item.id}">
        <div class="comment-meta">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${new Date(item.created_at).toLocaleString("zh-CN")}</span>
        </div>
        <p>${escapeHtml(item.body).replace(/\n/g, "<br>")}</p>
        <div class="comment-actions">
          <button type="button" data-action="like">赞 <span>${item.likes || 0}</span></button>
          <button type="button" data-action="reply">回复</button>
        </div>
        <form class="comment-form reply-form" hidden>
          <input name="name" maxlength="40" placeholder="你的名字 / 昵称" required>
          <textarea name="body" maxlength="1000" placeholder="回复 ${escapeHtml(item.name)}" required></textarea>
          <button class="button primary" type="submit">发布回复</button>
        </form>
        <div class="comment-children">${replies}</div>
      </article>
    `;
  }

  async function loadComments() {
    list.innerHTML = "<p class='comments-empty'>正在加载评论...</p>";
    const response = await fetch(`${api}?page=${encodeURIComponent(page)}`);
    if (!response.ok) throw new Error(`load_failed_${response.status}`);
    const items = await response.json();
    const roots = groupComments(items);
    list.innerHTML = roots.length
      ? roots.map((item) => renderComment(item, 0)).join("")
      : "<p class='comments-empty'>还没有评论。你可以先说第一句。</p>";
  }

  async function postComment(data) {
    const response = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `post_failed_${response.status}`);
    }
    await loadComments();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    setStatus("正在发布...", false);
    try {
      await postComment({
        page,
        name: formData.get("name"),
        body: formData.get("body"),
      });
      form.reset();
      setStatus("已发布。", false);
      setTimeout(() => setStatus("", false), 1800);
    } catch (error) {
      console.error(error);
      setStatus("发布失败。请刷新页面后再试，或者稍后再发。", true);
    } finally {
      button.disabled = false;
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const item = event.target.closest(".comment-item");
    if (!item) return;
    const id = item.dataset.id;

    if (button.dataset.action === "reply") {
      const replyForm = item.querySelector(".reply-form");
      replyForm.hidden = !replyForm.hidden;
      return;
    }

    if (button.dataset.action === "like") {
      try {
        setStatus("", false);
        const response = await fetch(`${api}/${id}/like`, { method: "POST" });
        if (!response.ok) throw new Error(`like_failed_${response.status}`);
        await loadComments();
      } catch (error) {
        console.error(error);
        setStatus("点赞失败。请稍后再试。", true);
      }
    }
  });

  list.addEventListener("submit", async (event) => {
    const replyForm = event.target.closest(".reply-form");
    if (!replyForm) return;
    event.preventDefault();
    const item = replyForm.closest(".comment-item");
    const formData = new FormData(replyForm);
    const button = replyForm.querySelector("button[type='submit']");
    button.disabled = true;
    setStatus("正在发布回复...", false);
    try {
      await postComment({
        page,
        parent_id: Number(item.dataset.id),
        name: formData.get("name"),
        body: formData.get("body"),
      });
      setStatus("回复已发布。", false);
      setTimeout(() => setStatus("", false), 1800);
    } catch (error) {
      console.error(error);
      setStatus("回复失败。请刷新页面后再试。", true);
    } finally {
      button.disabled = false;
    }
  });

  loadComments().catch(() => {
    list.innerHTML = "<p class='comments-empty'>评论区暂时没连上。稍后再试。</p>";
  });
})();
