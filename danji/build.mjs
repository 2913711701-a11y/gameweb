#!/usr/bin/env node
/**
 * ============================================================================
 *  单机小站 · 一体化构建器
 * ============================================================================
 *
 *  整站由这一个文件构建：读 content/ 里的 Markdown，渲染成静态 HTML 输出到 dist/。
 *  只有两个依赖（marked 解析 Markdown、js-yaml 解析文章头部），没有框架。
 *
 *  命令：
 *    node build.mjs            构建 + 本地预览 + 打开浏览器
 *    node build.mjs build      只构建，产出 dist/（Cloudflare Pages 的构建命令就是它）
 *    node build.mjs serve      用已有的 dist/ 起预览（不重新构建）
 *    node build.mjs new        新建一款游戏（问答：游戏名 + 内容 + 四个网盘链接 + 解压码）
 *
 *  可选参数：
 *    -p, --port <n>   指定端口（默认 4321，被占用时自动顺延）
 *        --no-open    启动后不自动打开浏览器
 *        --lan        允许局域网访问（默认只监听本机 127.0.0.1）
 *
 *  目录约定：
 *    content/         一篇文章一个 .md，文件名就是网址
 *    assets/          style.css 与 app.js（会自动加内容哈希后输出）
 *    public/          原样复制到 dist/（_headers、_redirects、robots.txt、favicon.svg）
 *    dist/            构建产物，部署时把这个目录交给 Cloudflare Pages
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/* marked 与 js-yaml 在入口处动态载入 —— 这样还没装依赖时也能给出友好提示并自动安装 */
let marked = null;
let yaml = null;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const CONTENT_DIR = path.join(ROOT, 'content');
const ASSETS_DIR = path.join(ROOT, 'assets');
const PUBLIC_DIR = path.join(ROOT, 'public');
const isWin = process.platform === 'win32';

/* ══════════════════════════════════════════════════════════════════════════
 *  ①  站点配置 —— 改站名、域名、分页、页脚，只动这一段就够了
 * ══════════════════════════════════════════════════════════════════════════ */

const SITE = {
  /** 部署后的最终域名：用于 canonical、og:url、sitemap.xml。上线前记得改 */
  url: 'https://danji.pages.dev',
  /** 站点名称（浏览器标题 + 页脚） */
  name: '单机小站',
  /** 站点副标题 */
  tagline: '精选单机游戏资源库',
  /** 站点描述（SEO 与首页 meta） */
  description:
    '精选单机游戏资源分享，提供 PC 单机游戏下载、版本信息、配置要求与常见问题解答。',
  /** 站点关键词 */
  keywords: '单机游戏,游戏下载,单机游戏资源,PC游戏,游戏库',
  /**
   * 列表页每页显示几款游戏。
   * 分页是**纯前端**的：所有卡片都渲染在同一个 HTML 里，翻页只是「显不显示」，
   * 不发任何请求、也不产生额外页面文件；游戏多了只影响这一个 HTML 的体积。
   * 21 = 3 列 × 7 行，一屏铺满不显空（1706×950 视口实测刚好占满、页脚贴底）；
   * 想回到「一页到底」就调大（比如 999）。
   */
  pageSize: 21,
  /** 站长信息（显示在每张卡片左下角），avatar 留空则显示首字母 */
  author: { name: '站长', avatar: '' },
};

/** 版权信息，留空则自动显示「© 年份 站点名」 */
const COPYRIGHT = '';

/* ══════════════════════════════════════════════════════════════════════════
 *  ②  基础工具
 * ══════════════════════════════════════════════════════════════════════════ */

/** HTML 转义（含引号，可直接用于属性值） */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

/** 路径片段转 URL 安全形式（中文 slug / 文件名都可能出现在网址里） */
const urlEnc = (seg) => encodeURIComponent(String(seg).trim());

/* 图标库（描边风格，随字号缩放、随文字颜色变化）。
   只留页面上真正在用的 —— 加新图标时在这里补一条，再用 icon('名字') 调用。 */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.7-3.7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  ghost:
    '<path d="M12 2.5a7 7 0 0 0-7 7V21l2.3-2.1L9.7 21l2.3-2.1L14.3 21l2.3-2.1L19 21V9.5a7 7 0 0 0-7-7z"/><path d="M9.5 10h.01M14.5 10h.01"/>',
};

function icon(name, cls = '') {
  const body = ICONS[name] ?? ICONS.file;
  return (
    `<svg class="${`icon ${cls}`.trim()}" viewBox="0 0 24 24" aria-hidden="true" ` +
    `focusable="false" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/**
 * 智能压缩：只删掉「跨行」的标签间缩进空白，同一行里的单个空格原样保留
 * （模板里靠空格排版的地方不能被吃掉），<pre>/<textarea> 内部完全不动。
 */
function minify(html) {
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<textarea[\s\S]*?<\/textarea>)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/>[ \t]*\r?\n[ \t]*</g, '><')))
    .join('')
    .trim();
}

/**
 * 载入依赖。只有两个包（marked 解析 Markdown、js-yaml 解析文章头部）。
 * 没装就自动装一次，所以第一次双击 start.bat 也能直接用。
 */
async function ensureDeps() {
  const load = async () => {
    const m = await import('marked');
    const y = await import('js-yaml');
    marked = m.marked ?? m.default;
    yaml = y.default ?? y;
    marked.setOptions({ gfm: true, breaks: false });
  };

  try {
    await load();
    return;
  } catch {
    /* 还没装，走下面的自动安装 */
  }

  console.log('');
  console.log(`  ${C.bold('首次运行，正在安装依赖…')} ${C.dim('（只有 2 个包，几秒钟）')}`);
  console.log('');

  const nodeDir = path.dirname(process.execPath);
  const npmCli = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((p) => fs.existsSync(p));

  const args = ['install', '--no-audit', '--no-fund'];
  const code = await new Promise((resolve) => {
    const child = spawn(
      npmCli ? process.execPath : isWin ? 'npm.cmd' : 'npm',
      npmCli ? [npmCli, ...args] : args,
      { cwd: ROOT, stdio: 'inherit' }
    );
    child.on('close', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });

  if (code !== 0) {
    console.log('');
    console.log(`${FAIL} 依赖安装失败。请检查网络后重试，或在当前目录手动执行：npm install`);
    process.exit(1);
  }

  try {
    await load();
    console.log('');
    console.log(`${OK} 依赖安装完成`);
  } catch (e) {
    console.log(`${FAIL} 依赖仍然不可用：${e.message}`);
    process.exit(1);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ③  页面骨架组件
 *
 *  没有顶栏 —— 全站只有「游戏列表」这一个页面，导航栏纯属多余，
 *  主题切换按钮挪到列表页筛选框右侧（见 pageGames）。
 * ══════════════════════════════════════════════════════════════════════════ */

function footer() {
  const year = new Date().getFullYear();
  const copy = COPYRIGHT || `© ${year} ${SITE.name}`;

  return `<footer class="site-footer">
<div class="container">
<p style="margin:0 0 4px;color:var(--text-2);font-weight:600">${esc(SITE.name)}</p>
<p style="margin:0">${esc(copy)} · 本站所有资源均来自网络收集，仅供学习交流，请于下载后 24 小时内删除。</p>
</div>
</footer>`;
}

/** 整页骨架 */
function layout({ path: urlPath, title, description, image, type = 'website', noindex = false, body, cssHref, jsHref }) {
  const pageTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`;
  const desc = description || SITE.description;

  let canonical = '';
  let ogImage = '';
  try {
    canonical = new URL(urlPath, SITE.url).href;
    if (image) ogImage = new URL(image, SITE.url).href;
  } catch {
    /* 域名写错时不至于让构建崩掉 */
  }

  return minify(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="keywords" content="${esc(SITE.keywords)}" />
<link rel="canonical" href="${esc(canonical)}" />
${noindex ? '<meta name="robots" content="noindex,follow" />' : ''}
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0e1014" media="(prefers-color-scheme: dark)" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="sitemap" type="application/xml" href="/sitemap.xml" />
<meta property="og:type" content="${esc(type)}" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:title" content="${esc(pageTitle)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(canonical)}" />
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
<link rel="stylesheet" href="${cssHref}" />
<script>
(function () {
  try {
    var p = new URLSearchParams(location.search).get('theme');
    var t = p === 'dark' || p === 'light' ? p : localStorage.getItem('dj:theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<main class="main" id="main">${body}</main>
${footer()}
<button class="to-top" type="button" aria-label="返回顶部">${icon('arrowUp')}</button>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="lightbox" id="lightbox" role="dialog" aria-label="查看大图"><img src="" alt="预览大图" /></div>
<script type="module" src="${jsHref}"></script>
</body>
</html>`);
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ④  卡片 / 标签 / 通用块
 * ══════════════════════════════════════════════════════════════════════════ */

function gameCard(game) {
  const d = game.data;
  const isoDate = d.date.toISOString();
  const timeText = relativeTime(d.date);
  const author = SITE.author.name;
  const initial = author.slice(0, 1);
  const searchKey = [d.title, d.originalTitle].filter(Boolean).join(' ').toLowerCase();

  const avatar = SITE.author.avatar
    ? `<img class="avatar" src="${esc(SITE.author.avatar)}" alt="${esc(author)}" width="19" height="19" loading="lazy" />`
    : `<span class="avatar">${esc(initial)}</span>`;

  return `<a class="game-card" href="/games/${urlEnc(game.slug)}/" data-game data-search="${esc(searchKey)}">
<div class="card-top">
<div class="card-body">
<h3 class="card-title"><span>${esc(d.title)}</span>${
    d.originalTitle
      ? ` <span class="slash">/</span><span class="orig">${esc(d.originalTitle)}</span>`
      : ''
  }</h3>
</div>
</div>
<div class="card-meta">
<div class="meta-author">
${avatar}
<span class="who">${esc(author)}</span>
<time class="time" datetime="${isoDate}" data-time="${isoDate}">${timeText}</time>
</div>
</div>
</a>`;
}

const crumbs = (parts) =>
  `<nav class="crumbs" aria-label="面包屑">${parts
    .map((p, i) =>
      i === parts.length - 1
        ? `<span>${esc(p.text)}</span>`
        : `<a href="${esc(p.href)}">${esc(p.text)}</a><span class="sep">/</span>`
    )
    .join('')}</nav>`;

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑤  页面模板
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 首页 = 游戏列表
 * 本站只有游戏，没有「首页 / 全部游戏」之分，所以首页直接就是完整列表 + 搜索框。
 */
function pageGames(ctx) {
  const { games } = ctx;

  const body = `<div class="container">
<div class="page-head">
<div>
<h1>全部游戏</h1>
<p class="sub">共 <span data-filter-count>${games.length}</span> 款 · 支持按名称搜索</p>
</div>
<div class="page-tools">
<form class="search" role="search" onsubmit="return false">
${icon('search')}
<label class="sr-only" for="filter-input">在列表中筛选</label>
<input id="filter-input" type="search" placeholder="输入名称筛选…" autocomplete="off" data-filter-input />
</form>
<button class="icon-btn theme-toggle" type="button" aria-label="切换深色 / 浅色模式" data-theme-toggle>
${icon('sun', 'sun')}${icon('moon', 'moon')}
</button>
</div>
</div>
${
  games.length
    ? `<div class="game-grid" data-filter-grid data-page-size="${SITE.pageSize}">${games
        .map((g) => gameCard(g))
        .join('')}</div>
<nav class="pager" data-pager aria-label="分页" hidden></nav>
<div class="empty" data-filter-empty hidden>
${icon('search')}
<h3>没有找到匹配的游戏</h3>
<p>换个关键词试试。</p>
</div>`
    : `<div class="empty">${icon('file')}<h3>还没有内容</h3>
<p>在 <code>content/</code> 目录下新建一个 .md 文件即可自动出现在这里。</p></div>`
}
</div>`;

  return layout({
    path: '/',
    description: `共收录 ${games.length} 款单机游戏资源，支持按名称关键词搜索。`,
    body,
    ...ctx.assets,
  });
}

/** 网盘名称 -> 圆点色相 */
function netdiskHue(name) {
  if (/迅雷/i.test(name)) return 210;
  if (/夸克/i.test(name)) return 248;
  if (/百度/i.test(name)) return 222;
  if (/^UC|UC网盘/i.test(name)) return 28;
  if (/阿里/i.test(name)) return 200;
  if (/123/i.test(name)) return 150;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** 游戏详情页 */
function pageDetail(ctx, game) {
  const d = game.data;
  const slug = game.slug;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: d.title,
    ...(d.originalTitle ? { alternateName: d.originalTitle } : {}),
    description: d.summary || SITE.description,
    applicationCategory: 'Game',
    gamePlatform: d.platform,
    datePublished: d.date.toISOString(),
  };

  const shots = d.screenshots.length
    ? `<section class="panel">
<div class="panel-head">${icon('grid')} 游戏截图 <span class="count">${d.screenshots.length}</span></div>
<div class="shots">${d.screenshots
        .map(
          (src) =>
            `<img src="${esc(src)}" alt="${esc(d.title)} 游戏截图" loading="lazy" decoding="async" data-zoom />`
        )
        .join('')}</div>
</section>`
    : '';

  const downloads = d.downloads.length
    ? `<section class="panel" id="download">
<div class="panel-head">${icon('download')} 下载地址 <span class="count">${
        d.downloads.length
      }</span></div>
${
  d.extractCode
    ? `<div class="notice">${icon('lock')}<span>解压密码：<strong>${esc(
        d.extractCode
      )}</strong></span><button class="btn btn-sm" type="button" data-copy="${esc(
        d.extractCode
      )}">${icon('copy')} 复制密码</button></div>`
    : ''
}
<div class="dl-list">${d.downloads
        .map((item) => {
          return `<div class="dl-item" style="--h:${netdiskHue(item.name)}">
<div class="dl-top">
<span class="dl-dot"></span>
<div class="dl-main"><div class="dl-name">${esc(item.name)}</div>${
              item.note ? `<div class="dl-note">${esc(item.note)}</div>` : ''
            }</div>
</div>
<div class="dl-actions"><a class="btn btn-primary btn-sm" href="${esc(
              item.url
            )}" target="_blank" rel="noopener nofollow noreferrer">前往下载 ${icon(
              'chevronRight'
            )}</a></div>
</div>`;
        })
        .join('')}</div>
</section>`
    : '';

  const body = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(
    /</g,
    '\\u003c'
  )}</script>
<div class="container detail">
${crumbs([{ text: '首页', href: '/' }, { text: d.title }])}
<section class="game-hero">
<h1>${esc(d.title)}</h1>
${d.originalTitle ? `<p class="hero-orig">${esc(d.originalTitle)}</p>` : ''}
</section>
<section class="panel">
<div class="panel-head">${icon('file')} 游戏介绍</div>
<div class="prose">${game.html}</div>
</section>
${shots}
${downloads}
</div>`;

  return layout({
    path: `/games/${slug}/`,
    title: d.title,
    /* summary 页面上不显示，但作为 SEO 描述仍然有用（见 normalize 的注释） */
    description: d.summary || `${d.title} 单机游戏资源下载。`,
    type: 'article',
    body,
    ...ctx.assets,
  });
}

/** 404 */
function page404(ctx) {
  const body = `<div class="container">
<div class="empty" style="padding:110px 20px">
${icon('ghost')}
<h3 style="font-size:30px;font-weight:700;color:var(--text);margin-bottom:10px">404</h3>
<p style="margin-bottom:22px">你要找的页面不见了，也许它从未存在过。</p>
<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
<a class="btn btn-primary" href="/">回到首页</a>
</div>
</div>
</div>`;

  return layout({ path: '/404.html', title: '页面不存在', noindex: true, body, ...ctx.assets });
}

/** 站点地图 */
function sitemap(ctx) {
  const { games } = ctx;
  const newest = games.reduce((acc, g) => (!acc || g.data.date > acc ? g.data.date : acc), null);
  const base = SITE.url.replace(/\/$/, '');

  const entries = [
    { loc: '/', lastmod: newest?.toISOString(), priority: '1.0' },
    ...games.map((g) => ({
      loc: `/games/${urlEnc(g.slug)}/`,
      lastmod: (g.data.updated ?? g.data.date).toISOString(),
      priority: '0.8',
    })),
  ];

  const body = entries
    .map(
      (e) =>
        `  <url><loc>${base}${e.loc}</loc>${
          e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''
        }<priority>${e.priority}</priority></url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑥  读取文章
 * ══════════════════════════════════════════════════════════════════════════ */

/** 拆出 frontmatter 与正文 */
function splitFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  let data = {};
  try {
    data = yaml.load(m[1]) || {};
  } catch (e) {
    throw new Error(`frontmatter 不是合法的 YAML：${e.message}`);
  }
  return { data, body: m[2] };
}

/** 归一化字段，补齐默认值。
 *  只保留真正参与渲染的字段 —— 老文章里的 `tags` / `cover` / `views` /
 *  `version` / `size` / `language` / `requirements` / `featured` 都已被忽略，
 *  写在 .md 里不会报错，也不会出现在页面上，不用特意去删。
 *  `summary` 页面上不显示，但会作为详情页的 `<meta name="description">`，别删。 */
function normalize(data) {
  const date = data.date ? new Date(data.date) : new Date();
  return {
    title: String(data.title ?? '未命名'),
    originalTitle: data.originalTitle ? String(data.originalTitle) : '',
    summary: data.summary ? String(data.summary) : '',
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    updated: data.updated ? new Date(data.updated) : null,
    platform: data.platform ? String(data.platform) : 'PC',
    extractCode: data.extractCode ? String(data.extractCode) : '',
    downloads: (Array.isArray(data.downloads) ? data.downloads : [])
      .map((x) => {
        const parsed = parseNetdisk(x?.url);
        return {
          name: String(x?.name ?? '').trim(),
          url: parsed.url,
          code: x?.code ? String(x.code) : parsed.code,
          note: x?.note ? String(x.note) : '',
        };
      })
      /* 没写地址的网盘直接丢掉：留着会渲染成一个 href="" 的按钮，点了等于刷新当前页 */
      .filter((x) => x.url),
    screenshots: Array.isArray(data.screenshots) ? data.screenshots.map(String) : [],
    draft: data.draft === true,
  };
}

function loadGames() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  const games = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data, body } = splitFrontmatter(raw);
    const norm = normalize(data);
    if (norm.draft) continue;
    games.push({ slug, data: norm, html: marked.parse(body) });
  }

  games.sort((a, b) => b.data.date - a.data.date);
  return games;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑦  构建
 * ══════════════════════════════════════════════════════════════════════════ */

const hash8 = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function walkStats(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        bytes += fs.statSync(p).size;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { files, bytes };
}

function buildSite() {
  const t0 = Date.now();

  const games = loadGames();

  // 样式与脚本：按内容加哈希输出，这样可以永久强缓存
  const cssSource = fs.readFileSync(path.join(ASSETS_DIR, 'style.css'), 'utf8');
  const jsSource = fs.readFileSync(path.join(ASSETS_DIR, 'app.js'), 'utf8');
  const cssFile = `style.${hash8(cssSource)}.css`;
  const jsFile = `app.${hash8(jsSource)}.js`;
  const assets = { cssHref: `/_assets/${cssFile}`, jsHref: `/_assets/${jsFile}` };

  const ctx = { games, assets };

  // 收集所有要输出的文件
  const outputs = new Map();
  const put = (out, html) => outputs.set(out, html);

  put('index.html', pageGames(ctx));
  put('404.html', page404(ctx));
  put('sitemap.xml', sitemap(ctx));

  for (const g of games) put(`games/${g.slug}/index.html`, pageDetail(ctx, g));

  // 写盘
  rmDir(DIST);
  fs.mkdirSync(path.join(DIST, '_assets'), { recursive: true });

  for (const [out, content] of outputs) {
    const file = path.join(DIST, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }

  fs.writeFileSync(path.join(DIST, '_assets', cssFile), cssSource, 'utf8');
  fs.writeFileSync(path.join(DIST, '_assets', jsFile), jsSource, 'utf8');

  if (fs.existsSync(PUBLIC_DIR)) copyDir(PUBLIC_DIR, DIST);

  const stats = walkStats(DIST);
  return { stats, seconds: ((Date.now() - t0) / 1000).toFixed(2), pages: outputs.size };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑧  本地预览服务器（行为与线上 Cloudflare Pages 保持一致）
 * ══════════════════════════════════════════════════════════════════════════ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
};

/** 把 URL 路径解析成 dist 里的真实文件，顺带挡掉路径穿越 */
function resolveFile(pathname) {
  let clean;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (clean.includes('\0')) return null;

  const base = path.resolve(DIST, clean.replace(/^[/\\]+/, ''));
  if (base !== DIST && !base.startsWith(DIST + path.sep)) return null;

  for (const p of [base, path.join(base, 'index.html'), `${base}.html`]) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* 试下一个候选 */
    }
  }
  return null;
}

function sendFile(req, res, file, status) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };

  res.writeHead(status, { ...headers, 'Content-Length': fs.statSync(file).size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* 彩色输出：终端不支持 ANSI 时自动降级成纯文本，避免出现乱码控制符 */
const colorOK =
  !!process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  (typeof process.stdout.hasColors === 'function' ? process.stdout.hasColors() : true);

const C = {
  dim: (s) => (colorOK ? `\u001b[2m${s}\u001b[0m` : String(s)),
  bold: (s) => (colorOK ? `\u001b[1m${s}\u001b[0m` : String(s)),
  cyan: (s) => (colorOK ? `\u001b[36m${s}\u001b[0m` : String(s)),
  green: (s) => (colorOK ? `\u001b[32m${s}\u001b[0m` : String(s)),
  red: (s) => (colorOK ? `\u001b[31m${s}\u001b[0m` : String(s)),
  yellow: (s) => (colorOK ? `\u001b[33m${s}\u001b[0m` : String(s)),
};
const OK = C.green('[ OK ]');
const FAIL = C.red('[FAIL]');
const WARN = C.yellow('[WARN]');

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('405 Method Not Allowed');
    }

    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400);
      return res.end('400 Bad Request');
    }

    const file = resolveFile(pathname);
    if (file) return sendFile(req, res, file, 200);

    const custom404 = path.join(DIST, '404.html');
    if (fs.existsSync(custom404)) return sendFile(req, res, custom404, 404);

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>404</title><h1>404 Not Found</h1>');
  });
}

/** 能连上就说明这个地址上已经有服务了 */
function canConnect(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(400);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

/**
 * 端口是否被占用。IPv4 和 IPv6 回环都要查 ——
 * 有些程序只监听 ::1，此时我们仍能绑上 127.0.0.1，但浏览器访问 localhost 会打到别人那里。
 */
async function portBusy(port) {
  const [v4, v6] = await Promise.all([canConnect('127.0.0.1', port), canConnect('::1', port)]);
  return v4 || v6;
}

async function pickPort(startPort) {
  for (let p = startPort; p < startPort + 40; p++) {
    if (!(await portBusy(p))) return p;
  }
  return 0;
}

/** 兜底：并发抢占时自动往后顺延 */
function listenOn(server, startPort, host) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryOnce = () => {
      const onError = (e) => {
        if (e.code === 'EADDRINUSE' && port < startPort + 30) {
          port++;
          setImmediate(tryOnce);
        } else {
          reject(e);
        }
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        resolve(server.address().port);
      });
    };
    tryOnce();
  });
}

function openBrowser(url, enabled) {
  if (!enabled) return;
  try {
    const cmd = isWin ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = isWin ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* 打不开浏览器不影响服务运行 */
  }
}

async function serve({ port, host, open }) {
  const server = createServer();
  let actual;
  try {
    actual = await listenOn(server, await pickPort(port), host);
  } catch (e) {
    console.log(`${FAIL} 启动本地服务失败：${e.message}`);
    process.exit(1);
  }

  const url = `http://localhost:${actual}`;
  console.log('');
  console.log(C.dim('─'.repeat(60)));
  console.log(`  ${C.bold('本地预览已启动')}`);
  console.log(C.dim('─'.repeat(60)));
  console.log(`  ${C.dim('访问地址')}  ${C.bold(C.cyan(url))}`);
  if (actual !== port) {
    console.log(`  ${C.dim('说明')}      ${port} 端口被别的程序占用了，已自动改用 ${actual}`);
  }
  console.log(`  ${C.dim('网站目录')}  dist/`);
  if (host === '0.0.0.0') {
    console.log(`  ${C.dim('局域网')}    同一 WiFi 下的手机可用本机 IP 访问（端口 ${actual}）`);
  }
  console.log(`  ${C.dim('停止服务')}  按 Ctrl + C`);
  console.log('');

  openBrowser(url, open);

  const bye = () => {
    console.log('');
    console.log(`${OK} 服务已停止。`);
    process.exit(0);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);

  return { server, url };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑨  新建文章
 * ══════════════════════════════════════════════════════════════════════════ */

const toSlug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const PAD = (n) => String(n).padStart(2, '0');

/** 把游戏名变成一个能当文件名用的网址标识。
 *  纯英文/数字标题 → 小写连字符（Bus Bound → bus-bound）；
 *  含中文的标题 → 直接保留原名（缘之空 → 缘之空），网址里会被 percent-encode 成 %E7%BC%98… */
function slugOf(title) {
  const t = String(title || '').trim();
  if (!t) return '';
  if (/^[\x20-\x7e]+$/.test(t)) return toSlug(t);
  return t
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '');
}

/** 把用户手填的地址补成能点开的链接。
 *  只写 www.qq.com 的话，浏览器会把它当成当前页面下的相对路径
 *  （/games/千恋万花/www.qq.com → 404），这里统一补上 https://。
 *  已经是协议开头的（http/https/magnet/thunder/ed2k…）和站内路径（/、#、./）原样保留。 */
function absUrl(raw) {
  const u = String(raw ?? '').trim();
  if (!u) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|\.{1,2}\/)/i.test(u)) return u;
  return `https://${u}`;
}

/** 把「链接 + 提取码」这类从资源站复制来的文本拆开。
 *  常见形态：`https://pan.quark.cn/s/xxxx 提取码: 8f2k` 或 `https://xxx 8f2k`。
 *  地址里不会有空格，所以以第一个空白为界，前半段当地址（走 absUrl 补协议），
 *  后半段只在明确写着「提取码/访问码/提取密码」或整段就是个短码时才当作提取码。 */
function parseNetdisk(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { url: '', code: '' };
  const parts = s.split(/\s+/);
  const head = parts.shift() || '';
  const tail = parts.join(' ');
  let code = '';
  if (tail) {
    const m =
      tail.match(/(?:提取码|访问码|提取密码)\s*[:：]?\s*([A-Za-z0-9]{2,12})/) ||
      tail.match(/^([A-Za-z0-9]{4,12})$/);
    if (m) code = m[1];
  }
  return { url: absUrl(head), code };
}

/** 写进 YAML 的字符串统一加单引号，避免标题里的冒号 / 引号把 frontmatter 弄坏 */
const yamlStr = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;

/** 去掉开头与结尾的空行 */
function trimBlankLines(lines) {
  const out = lines.slice();
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/** 逐行读输入：常驻一个 line 监听，把收到的行先排队，再按提问顺序取走。
 *  不用 rl.question —— 它只认「提问那一刻之后」到达的行，一次粘贴多行时
 *  多出来的行会被 readline 直接丢掉，结果只录到第一行。 */
function lineReader(rl) {
  const queue = [];
  let waiting = null;
  rl.on('line', (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  });
  return (promptText) => {
    rl.setPrompt(promptText);
    rl.prompt();
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve) => {
      waiting = resolve;
    });
  };
}

async function askQuestions() {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = lineReader(rl);

  const bail = () => {
    console.log('\n  没有读到输入，已取消，未创建任何文件。\n');
    process.exit(1);
  };
  if (stdin.readableEnded) bail();
  stdin.once('end', bail);

  try {
    console.log('');
    console.log(C.bold('  新建一款游戏'));
    console.log(C.dim('  只有前两项必填；四个网盘链接和解压码都可以留空，之后编辑 .md 文件也能补。'));
    console.log('');

    const title = (await ask('  1/7 游戏名（必填）          : ')).trim();
    if (!title) {
      console.log('\n  没有填游戏名，已取消，没有创建任何文件。\n');
      return null;
    }

    console.log('  2/7 内容（必填）');
    console.log('       一行一行写，可以写多行；全部写完之后，单独打一个 . 再回车结束。');
    const lines = [];
    for (;;) {
      const line = await ask('       | ');
      if (line.trim() === '.') break;
      lines.push(line);
    }
    const text = trimBlankLines(lines).join('\n').trim();
    if (!text) {
      console.log('\n  没有填内容，已取消，没有创建任何文件。\n');
      return null;
    }

    console.log('');
    console.log('       下面四个链接都可以直接回车跳过。');
    console.log(C.dim('       （整条粘贴进来就行；只写 www.qq.com 也可以，会自动补 https://）'));
    const links = {
      '迅雷': (await ask('  3/7 迅雷链接（可留空）      : ')).trim(),
      '夸克': (await ask('  4/7 夸克链接（可留空）      : ')).trim(),
      '百度网盘': (await ask('  5/7 百度网盘链接（可留空）  : ')).trim(),
      'UC网盘': (await ask('  6/7 UC网盘链接（可留空）    : ')).trim(),
    };
    const extractCode = (await ask('  7/7 解压码（可留空）        : ')).trim();
    console.log('');
    return { title, text, links, extractCode };
  } catch {
    console.log('\n  已取消，没有创建任何文件。\n');
    return null;
  } finally {
    try {
      rl.close();
    } catch {
      /* 已经关掉了 */
    }
  }
}

async function newGame(argv) {
  let spec;
  if (argv && argv.length) {
    /* 命令行直传：node build.mjs new "游戏名" "内容" "迅雷" "夸克" "百度" "UC" "解压码" */
    const [t, c = '', xunlei = '', quark = '', baidu = '', uc = '', code = ''] = argv;
    spec = {
      title: t,
      text: c,
      links: { '迅雷': xunlei, '夸克': quark, '百度网盘': baidu, 'UC网盘': uc },
      extractCode: code,
    };
  } else {
    spec = await askQuestions();
  }
  if (!spec) process.exit(0);

  const title = String(spec.title ?? '').trim();
  const text = String(spec.text ?? '').trim();
  if (!title || !text) {
    console.error('');
    console.error('  [X] 游戏名和内容都是必填的，没有创建任何文件。');
    console.error('');
    process.exit(1);
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${PAD(now.getMonth() + 1)}${PAD(now.getDate())}-${PAD(
    now.getHours()
  )}${PAD(now.getMinutes())}${PAD(now.getSeconds())}`;
  const iso = `${now.getFullYear()}-${PAD(now.getMonth() + 1)}-${PAD(
    now.getDate()
  )}T${PAD(now.getHours())}:${PAD(now.getMinutes())}:00+08:00`;

  const slug = slugOf(title) || `game-${stamp}`;
  const mdPath = path.join(CONTENT_DIR, `${slug}.md`);

  if (fs.existsSync(mdPath)) {
    console.error('');
    console.error(`  [X] 已经有一篇叫「${title}」的文章了，没有覆盖：content/${slug}.md`);
    console.error('      直接编辑那个文件就行；想再建一篇，把游戏名改一下。');
    console.error('');
    process.exit(1);
  }

  /* 四个网盘里填了链接的才写进 frontmatter，留空的直接省略。
     粘贴时带上的「提取码 xx」仍会被 parseNetdisk 拆出来：一是让 url 保持干净，
     二是写进 code 存档（详情页不显示提取码，code 只是留档）。*/
  const backends = [
    { name: '迅雷', ...parseNetdisk(spec.links?.['迅雷']) },
    { name: '夸克', ...parseNetdisk(spec.links?.['夸克']) },
    { name: '百度', ...parseNetdisk(spec.links?.['百度网盘']) },
    { name: 'UC', ...parseNetdisk(spec.links?.['UC网盘']) },
  ].filter((d) => d.url);

  /* 解压码留空就整行不写，详情页也就不会出现「解压密码」那块 */
  const extractCode = String(spec.extractCode ?? '').trim();

  const downloadLines = backends.map(
    (d) =>
      `  - name: ${d.name}\n    url: ${yamlStr(d.url)}` +
      (d.code ? `\n    code: ${yamlStr(d.code)}` : '') +
      (d.name === '迅雷' ? '\n    note: 推荐' : '')
  );

  const content = `---
title: ${yamlStr(title)}
originalTitle: ''
summary: ''
date: ${iso}
platform: PC
${extractCode ? `extractCode: ${yamlStr(extractCode)}\n` : ''}downloads:${
    downloadLines.length ? `\n${downloadLines.join('\n')}` : ' []'
  }
---

${text}
`;

  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.writeFileSync(mdPath, content, 'utf8');

  console.log('');
  console.log(`  [OK] 已创建      content/${slug}.md`);
  console.log(`  ${C.dim('详情页网址')}  /games/${slug}/`);
  if (backends.length) {
    console.log(
      `  ${C.dim('下载链接')}    ${backends
        .map((d) => `${d.name} → ${d.url}${d.code ? `（提取码 ${d.code}）` : ''}`)
        .join('   ')}`
    );
  }
  if (extractCode) console.log(`  ${C.dim('解压码')}      ${extractCode}`);
  if (!backends.length) {
    console.log(
      C.dim('  这次没填网盘链接，详情页暂时没有下载区；补链接改 .md 里的 downloads 就行。')
    );
  }
  console.log('');
  console.log('  接下来：');
  console.log(C.dim('    - 补链接、改内容或换标题，用记事本 / VSCode 打开那个 .md 文件就行'));
  console.log(C.dim('    - 想加原名就补一句 originalTitle: "Original Title"'));
  console.log(C.dim('    - 双击 start.bat 选 1，看看效果'));
  console.log('');
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ⑩  命令行入口
 * ══════════════════════════════════════════════════════════════════════════ */

const argv = process.argv.slice(2);
let mode = 'preview';
const opts = { port: 4321, open: true, build: true, host: '127.0.0.1' };
const rest = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === 'build') mode = 'build';
  else if (a === 'serve' || a === 'preview') mode = 'preview';
  else if (a === 'new') mode = 'new';
  else if (a === '-p' || a === '--port') opts.port = Number(argv[++i]) || 4321;
  else if (a.startsWith('--port=')) opts.port = Number(a.slice(7)) || 4321;
  else if (a === '--no-open') opts.open = false;
  else if (a === '--no-build') opts.build = false;
  else if (a === '--lan') opts.host = '0.0.0.0';
  else if (a === '-h' || a === '--help') {
    console.log(
      fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, '')
    );
    process.exit(0);
  } else rest.push(a);
}

function reportBuild(res) {
  console.log('');
  console.log(
    `${OK} 构建完成  ${C.dim(
      `${res.pages} 个页面 · ${res.stats.files} 个文件 · ${fmtSize(res.stats.bytes)} · 耗时 ${
        res.seconds
      }s`
    )}`
  );
}

console.log('');
console.log(`  ${C.bold(C.cyan(SITE.name))} ${C.dim('· 一体化构建器')}`);

await ensureDeps();

if (mode === 'build') {
  const res = buildSite();
  reportBuild(res);
  console.log('');
  console.log(`${OK} 输出目录  ${C.bold('dist/')}  ${C.dim(`(${fmtSize(res.stats.bytes)})`)}`);
  console.log(C.dim('     部署时把这个目录交给 Cloudflare Pages，或提交 Git 后自动部署。'));
  console.log('');
} else if (mode === 'new') {
  await newGame(rest);
} else {
  if (opts.build) {
    console.log('');
    console.log(`${OK} 正在构建…`);
    reportBuild(buildSite());
  } else if (!fs.existsSync(DIST)) {
    console.log(`${WARN} dist/ 不存在，仍然执行一次构建。`);
    reportBuild(buildSite());
  } else {
    const s = walkStats(DIST);
    console.log('');
    console.log(`${OK} 使用已有构建  ${C.dim(`${s.files} 个文件 · ${fmtSize(s.bytes)}`)}`);
  }

  await serve({ port: opts.port, host: opts.host, open: opts.open });
  console.log(C.dim('  停掉后按 Ctrl + C，下次双击 start.bat 即可。'));
  console.log('');
}
