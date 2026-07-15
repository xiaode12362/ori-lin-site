(() => {
  const list = document.querySelector('#newsList');
  const date = document.querySelector('#editionDate');
  const title = document.querySelector('#editionTitle');
  const note = document.querySelector('#editionNote');
  const filters = document.querySelectorAll('[data-filter]');
  let items = [];

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  const render = (filter = 'all') => {
    const visible = filter === 'all' ? items : items.filter((item) => item.category === filter);
    if (!visible.length) {
      list.innerHTML = '<p class="news-empty">这一栏今天没有足够可靠的消息。宁可空着，不拿噪音凑数。</p>';
      return;
    }
    list.innerHTML = visible.map((item, index) => `
      <article class="news-card">
        <div class="news-card-meta">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <span>${escapeHtml(item.region)} · ${escapeHtml(item.category)}</span>
          <span class="news-verdict ${escapeHtml(item.verdictTone || '')}">${escapeHtml(item.verdict)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-plain">${escapeHtml(item.plain)}</p>
        <dl class="news-analysis">
          <div><dt>ORI 判断</dt><dd>${escapeHtml(item.judgment)}</dd></div>
          <div><dt>谁希望你怎么理解</dt><dd>${escapeHtml(item.publisherGoal)} <small>ORI 推断</small></dd></div>
          <div><dt>对谁有影响</dt><dd>${escapeHtml(item.impact)}</dd></div>
          <div><dt>下一步看什么</dt><dd>${escapeHtml(item.watch)}</dd></div>
        </dl>
        <a class="news-source" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source)} · ${escapeHtml(item.publishedAt)} ↗</a>
      </article>
    `).join('');
  };

  filters.forEach((button) => button.addEventListener('click', () => {
    filters.forEach((item) => item.classList.toggle('is-active', item === button));
    render(button.dataset.filter);
  }));

  fetch(`news.json?v=${Date.now()}`)
    .then((response) => {
      if (!response.ok) throw new Error('news data unavailable');
      return response.json();
    })
    .then((data) => {
      const edition = data.editions?.[0];
      if (!edition) throw new Error('no edition');
      items = edition.items || [];
      date.textContent = edition.date;
      date.dateTime = edition.date;
      title.textContent = edition.title || '今日新闻判断';
      note.textContent = edition.note || '';
      render();
    })
    .catch(() => {
      list.innerHTML = '<p class="news-empty">今日内容正在核验中。没有可靠来源之前，不发布。</p>';
    });
})();
