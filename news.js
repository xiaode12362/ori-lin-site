(() => {
  const list = document.querySelector('#newsList');
  const date = document.querySelector('#editionDate');
  const title = document.querySelector('#editionTitle');
  const note = document.querySelector('#editionNote');
  const trackingSummary = document.querySelector('#trackingSummary');
  const learningPanel = document.querySelector('#learningPanel');
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
    list.innerHTML = visible.map((item, index) => {
      const tracking = item.tracking || {};
      const reviews = tracking.reviews || [];
      const latest = reviews[reviews.length - 1];
      return `
      <article class="news-card">
        <div class="news-card-meta">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <span>${escapeHtml(item.group)} · ${escapeHtml(item.region)} · ${escapeHtml(item.category)}</span>
          <span class="news-verdict ${escapeHtml(item.verdictTone || '')}">${escapeHtml(item.verdict)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <dl class="news-analysis news-simple">
          <div>
            <dt>发生了什么</dt>
            <dd>${escapeHtml(item.whatHappened || item.essence || item.judgment)}</dd>
          </div>
          <div>
            <dt>跟你有什么关系</dt>
            <dd>${escapeHtml(item.whatItMeans || item.governmentIntent)}</dd>
          </div>
        </dl>
        <div class="original-news">
          <span>原新闻</span>
          <a href="${escapeHtml(item.originalUrl || item.sources?.[0]?.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.originalNews || item.title)} ↗</a>
          <small>${escapeHtml(item.originalSource || item.source || '')} · ${escapeHtml(item.publishedAt || '')}</small>
        </div>
        <h4 class="stock-section-title">具体影响哪些股票</h4>
        <div class="stock-list">
          ${(item.stocks || []).map((stock) => `
            <div class="stock-row">
              <div class="stock-name"><strong>${escapeHtml(stock.name)}</strong><span>${escapeHtml(stock.ticker)}</span><em>${escapeHtml(stock.direction || '条件性影响')}</em></div>
              <div class="stock-explain"><b>为什么受影响</b><p>${escapeHtml(stock.reason)}</p><small>证据：${escapeHtml(stock.evidence || stock.reason || '暂无直接证据')}</small></div>
              <div class="stock-check"><p><b>确认信号：</b>${escapeHtml(stock.trigger)}</p><p><b>判断失效：</b>${escapeHtml(stock.invalidCondition || item.downCondition)}</p></div>
            </div>
          `).join('')}
        </div>
        <dl class="news-analysis news-simple news-next">
          <div>
            <dt>接下来盯什么</dt>
            <dd>${escapeHtml(item.watchNext || item.upCondition)}</dd>
          </div>
          <div class="news-advice">
            <dt>一句话结论</dt>
            <dd>${escapeHtml(item.oriCall || item.advice)}</dd>
          </div>
        </dl>
        <details class="prediction-tracking analysis-details">
          <summary>展开看详细分析与涨跌条件</summary>
          <div class="tracking-body">
            <p><strong>官方目标与 ORI 分析</strong>${escapeHtml(item.governmentIntent || '仍需结合后续文件判断。')}</p>
            <p><strong>可能上涨的条件</strong>${escapeHtml(item.upCondition)}</p>
            <p><strong>判断失效的条件</strong>${escapeHtml(item.downCondition)}</p>
          </div>
        </details>
        <details class="prediction-tracking">
          <summary>预测跟踪 · ${escapeHtml(latest?.verdict || tracking.verdict || '跟踪中')}</summary>
          <div class="tracking-body">
            <p><strong>复盘节点</strong>${escapeHtml((tracking.reviewSchedule || ['D+1', 'D+7', 'D+30', 'D+90']).join(' / '))}</p>
            <p><strong>下次复盘</strong>${escapeHtml(tracking.nextReviewAt || '待安排')}</p>
            ${latest ? `
              <p><strong>实际发生</strong>${escapeHtml(latest.actual)}</p>
              <p><strong>联动验证</strong>${escapeHtml(latest.linkage)}</p>
              <p><strong>为什么对或错</strong>${escapeHtml(latest.reason)}</p>
              <p><strong>政策为何偏离 ORI 路径</strong>${escapeHtml(latest.policyDeviation)}</p>
              <div class="tracking-evidence">${(latest.sources || []).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>`).join('')}</div>
            ` : '<p class="tracking-pending">尚未到复盘节点。ORI 不用当天涨跌冒充预测正确。</p>'}
          </div>
        </details>
        <div class="news-sources">
          ${(item.sources || [{ label: `${item.source} · ${item.publishedAt}`, url: item.sourceUrl }]).map((source) => `<a class="news-source" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>`).join('')}
        </div>
      </article>
    `}).join('');
  };

  filters.forEach((button) => button.addEventListener('click', () => {
    filters.forEach((item) => item.classList.toggle('is-active', item === button));
    render(button.dataset.filter);
  }));

  Promise.all([
    fetch(`news.json?v=${Date.now()}`).then((response) => {
      if (!response.ok) throw new Error('news data unavailable');
      return response.json();
    }),
    fetch(`news-learning.json?v=${Date.now()}`).then((response) => response.ok ? response.json() : null)
  ])
    .then(([data, learning]) => {
      const edition = data.editions?.[0];
      if (!edition) throw new Error('no edition');
      items = edition.items || [];
      const resolved = items.filter((item) => ['正确', '部分正确', '错误'].includes(item.tracking?.verdict));
      const correct = resolved.filter((item) => item.tracking.verdict === '正确').length;
      trackingSummary.innerHTML = `<span>预测账本</span><strong>${items.length} 条跟踪中</strong><small>${resolved.length ? `已验证 ${resolved.length} 条 · 正确 ${correct} 条` : '命中率等待 D+7 后形成'}</small>`;
      date.textContent = edition.date;
      date.dateTime = edition.date;
      title.textContent = edition.title || '今日新闻判断';
      note.textContent = edition.note || '';
      if (learning) {
        const metrics = learning.metrics || {};
        learningPanel.innerHTML = `
          <div class="learning-meta"><strong>方法版本 ${escapeHtml(learning.methodologyVersion)}</strong><span>${escapeHtml(metrics.eligibleReviews || 0)} 次有效复盘</span><span>至少 ${escapeHtml(learning.minimumIndependentSamples || 3)} 个独立样本才改规则</span></div>
          <div class="learning-rules">${(learning.activeRules || []).map((item) => `
            <article><span>${escapeHtml(item.scope)}</span><p>${escapeHtml(item.rule)}</p><small>${escapeHtml(item.reason)}</small></article>
          `).join('')}</div>
        `;
      }
      render();
    })
    .catch(() => {
      list.innerHTML = '<p class="news-empty">今日内容正在核验中。没有可靠来源之前，不发布。</p>';
    });
})();
