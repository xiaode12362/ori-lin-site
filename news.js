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
    const visible = filter === 'all' ? items : items.filter((item) => item.group === filter);
    if (!visible.length) {
      list.innerHTML = '<p class="news-empty">这一栏今天没有足够可靠的消息。宁可空着，不拿噪音凑数。</p>';
      return;
    }
    list.innerHTML = visible.map((item, index) => `
      <article class="news-card">
        <div class="news-card-meta">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <span>${escapeHtml(item.group)} · ${escapeHtml(item.region)} · ${escapeHtml(item.category)}</span>
          <span class="news-verdict ${escapeHtml(item.verdictTone || '')}">${escapeHtml(item.verdict)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-plain"><strong>新闻是风：</strong>${escapeHtml(item.plain)}</p>
        <dl class="news-analysis">
          <div><dt>钱在怎么动</dt><dd>${escapeHtml(item.capitalAction || '尚未看到可验证的资金动作。')}</dd></div>
          <div><dt>周期位置</dt><dd>${escapeHtml(item.cycle || '等待确认')}</dd></div>
          <div><dt>ORI 判断</dt><dd>${escapeHtml(item.judgment)}</dd></div>
          <div><dt>可能涨跌路径</dt><dd>${escapeHtml(item.marketPath || item.impact)}</dd></div>
          <div><dt>ORI 观察标的</dt><dd>${escapeHtml(item.targets || '暂无。')}</dd></div>
          <div class="news-advice"><dt>ORI 动作</dt><dd>${escapeHtml(item.advice)}</dd></div>
          <div><dt>验证信号</dt><dd>${escapeHtml(item.watch)}</dd></div>
          <div><dt>失效条件</dt><dd>${escapeHtml(item.invalidation || '核心假设被后续数据否定。')}</dd></div>
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
