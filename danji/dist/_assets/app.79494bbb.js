/**
 * 单机小站 · 前端脚本
 * 无任何第三方依赖，全部逻辑按需初始化（页面上没有的模块直接跳过）
 */
const doc = document;

/** 相对时间：3小时前 / 2天前 */
function relativeTime(date, now = Date.now()) {
  const s = Math.floor((now - date.getTime()) / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}个月前`;
  return `${Math.floor(mo / 12)}年前`;
}

/* ---------------- 本地存储 ---------------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('dj:' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('dj:' + key, JSON.stringify(value));
    } catch {
      /* 隐私模式忽略 */
    }
  },
};

/* ---------------- 1. 主题切换 ----------------
 * 用 querySelectorAll：按钮现在放在列表页的筛选框右侧，
 * 以后想在别的页面再加一个，不用改脚本。
 */
doc.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const current =
      doc.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    doc.documentElement.dataset.theme = next;
    store.set('theme', next);
  });
});

/* ---------------- 2. 提示条 ---------------- */
let toastTimer;
function toast(message) {
  const el = doc.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1900);
}

/* ---------------- 3. 复制解压密码（事件委托） ---------------- */
doc.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.getAttribute('data-copy') || '';
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    /* 降级到 execCommand */
  }
  if (!ok) {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    doc.body.appendChild(ta);
    ta.select();
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
  }
  toast(ok ? `已复制：${text}` : '复制失败，请手动选择');
});

/* ---------------- 4. 相对时间实时刷新 ---------------- */
doc.querySelectorAll('time[data-time]').forEach((el) => {
  const date = new Date(el.getAttribute('data-time'));
  if (Number.isNaN(date.getTime())) return;
  el.textContent = relativeTime(date);
});

/* ---------------- 5. 返回顶部 ---------------- */
(() => {
  const btn = doc.querySelector('.to-top');
  if (!btn) return;
  const onScroll = () => btn.classList.toggle('show', window.scrollY > 480);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ---------------- 6. 图片灯箱 ---------------- */
(() => {
  const box = doc.getElementById('lightbox');
  if (!box) return;
  const img = box.querySelector('img');
  doc.addEventListener('click', (event) => {
    const target = event.target.closest('[data-zoom]');
    if (target) {
      img.src = target.currentSrc || target.src;
      box.classList.add('show');
      return;
    }
    if (event.target === box) box.classList.remove('show');
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') box.classList.remove('show');
  });
})();

/* ---------------- 7. 列表实时筛选 + 前端分页 ----------------
 * 所有卡片都在 HTML 里，分页只是把不属于当前页的卡片 hidden 掉 ——
 * 翻页零请求、也不生成额外页面文件。筛选框一改，就按新结果重新分页并回到第 1 页。
 */
(() => {
  const grid = doc.querySelector('[data-filter-grid]');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('[data-game]'));
  const input = doc.querySelector('[data-filter-input]');
  const empty = doc.querySelector('[data-filter-empty]');
  const count = doc.querySelector('[data-filter-count]');
  const pager = doc.querySelector('[data-pager]');
  const perPage = Math.max(1, Number(grid.dataset.pageSize) || 9999);

  let page = 1;

  /** 该显示哪些页码：页数少就全列，多了就折成「1 … 4 5 6 … 20」 */
  function pageNumbers(total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const keep = new Set([1, total, page - 1, page, page + 1]);
    const nums = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const n of nums) {
      if (prev && n - prev > 1) out.push('gap');
      out.push(n);
      prev = n;
    }
    return out;
  }

  function renderPager(totalPages) {
    if (!pager) return;
    if (totalPages <= 1) {
      pager.hidden = true;
      pager.innerHTML = '';
      return;
    }
    const jump = (label, target, disabled) =>
      `<button class="pager-btn" type="button" data-page="${target}"${
        disabled ? ' disabled' : ''
      }>${label}</button>`;
    const nums = pageNumbers(totalPages)
      .map((n) => {
        if (n === 'gap') return '<span class="pager-gap">…</span>';
        if (n === page) return `<span class="pager-num is-active" aria-current="page">${n}</span>`;
        return `<button class="pager-num" type="button" data-page="${n}">${n}</button>`;
      })
      .join('');
    pager.innerHTML = `${jump('上一页', page - 1, page <= 1)}${nums}${jump(
      '下一页',
      page + 1,
      page >= totalPages
    )}`;
    pager.hidden = false;
  }

  function apply(scrollToGrid) {
    const q = (input?.value || '').trim().toLowerCase();
    const matched = cards.filter((card) => !q || (card.dataset.search || '').includes(q));
    const totalPages = Math.max(1, Math.ceil(matched.length / perPage));
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * perPage;
    const onPage = new Set(matched.slice(start, start + perPage));
    for (const card of cards) card.hidden = !onPage.has(card);

    if (empty) empty.hidden = matched.length > 0;
    if (count) count.textContent = String(matched.length);
    renderPager(totalPages);

    // 翻页后如果列表顶端已经滚出屏幕，把它拉回视野
    if (scrollToGrid) {
      const top = grid.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: top + window.scrollY - 16, behavior: 'smooth' });
    }
  }

  input?.addEventListener('input', () => {
    page = 1;
    apply(false);
  });

  pager?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    const target = Number(btn.dataset.page);
    if (!Number.isInteger(target) || target < 1 || target === page) return;
    page = target;
    apply(true);
    // 让刷新 / 分享链接还能停在这一页（replaceState，不往历史里塞记录）
    try {
      const url = new URL(location.href);
      if (page > 1) url.searchParams.set('p', String(page));
      else url.searchParams.delete('p');
      history.replaceState(null, '', url);
    } catch {
      /* file:// 下会抛，忽略 */
    }
  });

  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if (q && input) input.value = q;
  const p = Number(params.get('p'));
  if (Number.isInteger(p) && p > 1) page = p;
  apply(false);

  // 从其他页面带着参数跳过来时，直接滚到列表
  if (q) grid.scrollIntoView({ block: 'start' });
})();

/* ---------------- 8. 悬停 / 触摸预取 ----------------
 * 鼠标移到站内链接上（或手指按住）时，提前把目标页面拉进缓存，
 * 点击后几乎瞬时打开。只预取站内、只预取前 40 个，且失败静默忽略。
 */
(() => {
  const seen = new Set();
  const warm = (target) => {
    const a = target && target.closest ? target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (seen.has(href) || seen.size >= 40) return;
    seen.add(href);
    const link = doc.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    doc.head.appendChild(link);
  };
  doc.addEventListener('mouseover', (e) => warm(e.target), { passive: true });
  doc.addEventListener('touchstart', (e) => warm(e.target), { passive: true });
})();
