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
        <div class="original-news">
          <span>原新闻</span>
          <a href="${escapeHtml(item.originalUrl || item.sources?.[0]?.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.originalNews || item.title)} ↗</a>
          <small>${escapeHtml(item.originalSource || item.source || '')} · ${escapeHtml(item.publishedAt || '')}</small>
        </div>
        <p class="government-intent"><span>政府为什么这样做 · ORI 推断</span>${escapeHtml(item.governmentIntent || '该动作的政策用意仍需结合后续文件判断。')}</p>
        <p class="ori-essence"><span>ORI 看见</span>${escapeHtml(item.essence || item.judgment)}</p>
        <div class="market-conditions">
          <p><strong>板块会动：</strong>${escapeHtml(item.upCondition)}</p>
          <p><strong>板块会跌：</strong>${escapeHtml(item.downCondition)}</p>
        </div>
        <div class="stock-list">
          ${(item.stocks || []).map((stock) => `
            <div class="stock-row">
              <div class="stock-name"><strong>${escapeHtml(stock.name)}</strong><span>${escapeHtml(stock.ticker)}</span></div>
              <p>${escapeHtml(stock.reason)}</p>
              <p><b>触发：</b>${escapeHtml(stock.trigger)}</p>
            </div>
          `).join('')}
        </div>
        <p class="ori-call"><span>ORI 结论</span>${escapeHtml(item.oriCall || item.advice)}</p>
        <div class="news-sources">
          ${(item.sources || [{ label: `${item.source} · ${item.publishedAt}`, url: item.sourceUrl }]).map((source) => `<a class="news-source" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>`).join('')}
        </div>
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
