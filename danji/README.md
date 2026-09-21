# 单机小站

一个用来放单机游戏资源的静态站。**没有框架**，整站由一个 `build.mjs` 生成纯 HTML + CSS，
可直接部署到 **Cloudflare Pages**。

- **快**：构建产物是纯 HTML/CSS，客户端 JS 只有 9 KB
- **安全**：没有服务端接口和数据库，配合严格的 CSP / 安全响应头，攻击面接近于零
- **好维护**：新增一款游戏 = 新增一个 Markdown 文件，列表、详情页、站点地图全自动生成
- **文件少**：全站 52 个文件 / 约 344 KB（最大单文件 26 KB），只有 2 个 npm 依赖
  （`marked` 解析 Markdown、`js-yaml` 解析文章头部）

> 部署到 Cloudflare Pages 完全无压力：Pages 的单文件上限是 **25 MiB**，
> 本站最大的 `index.html` 也才 **26 KB**，相差约 1000 倍。

---

## 目录结构

```
.
├── build.mjs            ★ 全站唯一脚本：配置 + 模板 + 构建 + 预览 + 新建文章
├── start.bat            ★ Windows 双击这个（内置菜单）
├── package.json
├── content/             ★ 所有游戏文章，一个游戏一个 .md
├── assets/
│   ├── style.css        全站样式
│   └── app.js           前端交互（主题、复制、灯箱、筛选、预取）
└── public/              原样复制到 dist/（Cloudflare 配置也在里面）
    ├── _headers         Cloudflare 安全响应头 / 缓存策略
    ├── _redirects       Cloudflare 重定向规则
    ├── robots.txt
    └── favicon.svg
```

就这些。想改站名，在 `build.mjs` 最顶上的「站点配置」段里（`SITE`）。

---

## 快速开始（Windows）

**双击 `start.bat`，选 1。** 第一次运行会自动安装依赖（2 个包，几秒钟），
之后每次都是「构建 → 启动本地服务 → 自动打开浏览器」，一两秒看到结果。

双击后会看到一个菜单：

| 选项 | 做什么 |
| --- | --- |
| **1** 启动预览 | 构建 → 起本地服务 → 自动打开浏览器（日常就用这个） |
| 2 新建游戏 | 问答式新建一篇（只问游戏名、内容、四个网盘链接、解压码） |

也可以直接在命令行里带参数调用（菜单里不放的也用得上）：

```bash
start.bat build     # 只构建，产出 dist/（不启动服务）
start.bat new       # 新建文章
start.bat serve     # 用已有的 dist/ 预览，不重新构建
start.bat --lan     # 允许局域网访问（默认只监听 127.0.0.1）
```

脚本会自己去找 Node.js（PATH、官方安装目录、nvm 常见位置都试一遍）。
如果没装，窗口里会给出说明并打开下载页 —— 装的时候选 **LTS** 版本，一路点「下一步」即可。

- 端口 4321 被别的程序占用时会自动改用 4322、4323…，不用手动处理
- 停止服务：在窗口里按 Ctrl+C
- 第一次启动时 Windows 可能弹出防火墙提示，**选「取消」即可**，本站不需要放行

### 命令行方式（macOS / Linux，或习惯用终端）

```bash
npm install       # 安装依赖（只需一次，只有 2 个包）
npm start         # 构建 + 本地预览 http://localhost:4321
npm run build     # 构建到 dist/（Cloudflare Pages 用的也是这条）
npm run new       # 新建文章
```

需要 Node.js 18+。

---

## 添加一款游戏（最常用）

### 方式一：自动生成模板（推荐）

**Windows**：双击 `start.bat` → 选 `2`，按提示回答 7 个问题：

| # | 问题 | 说明 |
| --- | --- | --- |
| 1 | 游戏名 | **必填**，同时用来生成文件名 |
| 2 | 内容 | **必填**，一行一行写，可写多行，写完单独打一个 `.` 回车结束 |
| 3 | 迅雷链接 | 可留空 |
| 4 | 夸克链接 | 可留空 |
| 5 | 百度网盘链接 | 可留空 |
| 6 | UC 网盘链接 | 可留空 |
| 7 | 解压码 | 可留空，填了才会在下载区显示「解压密码」那一块 |

只有前两项必填，后面几项留空就直接回车跳过（空的那条不会写进文件，之后编辑 `.md` 里的
`downloads` 也能随时补）。粘贴多行文本也没问题。

链接可以整条粘（`https://pan.quark.cn/s/xxxx`），也可以只写 `pan.quark.cn/s/xxxx` 或
`www.qq.com` —— 构建时缺协议会自动补上 `https://`，避免被浏览器当成当前页面下的相对路径。

**命令行**：

```bash
node build.mjs new "赛博朋克2077" "夜之城的开放世界 RPG。" "https://pan.xunlei.com/s/xxx"
```

参数顺序是 `游戏名 内容 迅雷 夸克 百度 UC 解压码`，后面几个都可以省略。

两种方式都会在 `content/` 生成/保存一个 Markdown 文件，首页列表、详情页、`sitemap.xml`
会一起更新。

> 文件名（也就是网址）直接取自游戏名：纯英文名会变成小写连字符（`Bus Bound` → `bus-bound`），
> 中文名就原样保留（`缘之空` → `/games/缘之空/`）。想换网址，重命名 `content/` 下的文件即可。

### 方式二：手写 Markdown

在 `content/` 下新建任意 `.md` 文件，文件名就是网址（`elden-ring.md` → `/games/elden-ring/`）：

```markdown
---
title: 游戏中文名
originalTitle: Original Title          # 可省略
date: 2026-09-18T10:00:00+08:00
platform: PC
extractCode: danji                     # 解压码，可省略（留空则不显示解压密码块）
downloads:
  - name: 迅雷
    url: https://pan.xunlei.com/s/xxxx
    note: 推荐 · 满速
  - name: 夸克
    url: https://pan.quark.cn/s/xxxx
    code: 8f2k                          # 提取码（2026-09-20 起页面不显示，仅留档）
screenshots:
  - /shots/xxx-1.jpg
draft: false                           # true 则不参与构建
---

这里直接写正文，支持完整的 Markdown 语法（标题、列表、表格、图片、引用、代码块）。
不用刻意分「游戏简介 / 玩法特色 / 安装说明」这类小标题，想分才分。
```

**不需要改任何代码**，保存后首页列表、详情页、`sitemap.xml` 会一起更新。

### 字段速查

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 中文名，卡片与详情页的主标题 |
| `date` | ✅ | 发布时间，卡片左下角显示「x小时前」 |
| `originalTitle` | | 原名 / 英文名，显示在斜杠后面 |
| `platform` | | 平台，默认 `PC` |
| `extractCode` | | 解压码，会在下载区高亮并可一键复制；留空则不显示那一块 |
| `downloads` | | 下载渠道数组，每项含 `name` / `url` / `note`(备注) / `code`(提取码，**页面不显示，仅留档**)；`url` 留空的项会被忽略，缺 `https://` 会自动补上 |
| `screenshots` | | 截图数组，点击可放大 |
| `updated` | | 更新时间，留空则用 `date` |
| `draft` | | `true` 则该文章不参与构建 |

> **2026-09-20 起详情页不再显示封面图和标题下的一句话简介**：卡片也跟着改成纯文字卡片
> （只有「中文名 / 原名」+ 站长 + 时间）。所以 frontmatter 里的 `cover`、`summary`、
> `version`、`size`、`language` 现在都不参与渲染，写在文件里也不会出错（会被忽略），
> 历史文章不用改。

> **标签已整体下线**（2026-09-20）：导航里的「分类」、`/tags/` 分类页、列表页那排标签筛选、
> 卡片上的标签全部去掉，只保留按名称搜索。frontmatter 里的 `tags` 同样属于「写了会被忽略」，
> 老文章不用改。

> **关于页已整体下线**（2026-09-20）：`/about/` 不再生成
> （旧链接由 `public/_redirects` 301 回首页）。想加回静态内容页，在 `build.mjs` 里照着
> `pageGames` 写一个 `pageXxx`，再在 `buildSite()` 里 `put()` 一行即可。

> **页脚站点地图链接已去掉**（2026-09-20）：页脚现在只有站名 + 版权一行。`sitemap.xml`
> 本身照常生成（搜索引擎用，`head` 里的 `<link rel="sitemap">` 也还在），只是不再在
> 页面上摆链接。

> **全站只剩一页**（2026-09-20）：本站只有游戏，没有「首页 / 全部游戏」之分，所以顶部导航
> 整个去掉了，首页 `/` 直接就是完整游戏列表（标题「全部游戏」+ 实时筛选框）。
> `/games/` 不再生成（`public/_redirects` 里 301 回 `/`）。游戏详情页仍在 `/games/<文件名>/`，
> 详情页面包屑是「首页 / 游戏名」。移动端汉堡菜单一并删除。
> （当时顺手删掉的 `SITE.pageSize` 与分页样式，当天晚些时候又按需求以**纯前端分页**的方式
> 加回来了，见上面那条。）

> **列表页有分页了**（2026-09-20）：**纯前端分页**。所有卡片仍然渲染在同一个 `index.html` 里，
> 翻页只是把不属于当前页的卡片 `hidden` 掉 —— 零请求、零额外页面文件、翻页瞬时。
> 每页几条由 `build.mjs` 顶部 `SITE.pageSize` 决定（当前 **21** 条 = 3 列 × 7 行，
> 改完重新构建即可；想回到「一页到底」就调大，比如 999）。站点现有 **42** 款游戏
> → 21 条一页正好 **2 页**，两页都是满的；只有一页时它会自动隐藏。
> 分页条在列表下方（`.pager`），只有一页时自动隐藏；上一页 / 下一页在首尾页自动置灰。
> **筛选与分页是联动的**：筛选框一改，就按新的匹配结果重新分页并回到第 1 页，
> 页数不足时自动收敛。URL 上可以用 `?p=2` 直达第几页、`?q=关键词` 预置筛选（两者可叠加）。
> ⚠️ CSS 里 `.pager[hidden] { display: none }` 那条不能删 —— `.pager` 自己是 `display: flex`，
> 会盖掉 `hidden` 属性自带的 `display: none`。

> **顶栏整个下线**（2026-09-20）：连 logo「单机小站」在内整条 sticky 顶栏删掉，页面顶部
> 不再有任何固定栏。主题切换按钮从顶栏挪到列表页筛选框的右侧（`.page-head > .page-tools`）。
> `build.mjs` 的 `header()` 函数、`assets/style.css` 里的 `.site-header` / `.header-inner` /
> `.brand` / `.brand-mark` / `.header-right` 及 `--header-bg` 变量全部删除。
> 注意：详情页没有主题切换按钮（主题存在 localStorage，从首页切过再点进详情依然生效）。

> **整体布局收了一轮**（2026-09-20，用户反馈「有点怪怪的」）：实测宽屏下有三个毛病 ——
> 页脚没贴底（内容到 y=744 就结束了，视口 950，下方留 206px 纯空白背景）、
> 卡片 392×108 里 `.card-top` 占 76px 只放一个标题、h1 和搜索框分居两头中间空 768px。
> 相应地改了四处：
> 1. `body` 变成 `flex-direction: column` + `min-height: 100vh/100dvh`，
>    `.main` 用 `flex: 1 0 auto` 撑开，**页脚永远贴视口底**；`.site-footer` 去掉了 `margin-top`。
> 2. `--maxw` 1240 → **1120**（3 列卡片从 392 降到 352，不那么空）；
>    `.card-top` 76 → **54**（卡片 108 → 86）。
> 3. `.page-head` 的 `align-items` 由 `flex-end` 改成 `flex-start`，
>    搜索框跟 h1 对齐，不再掉到副标题那一行。
> 4. 顺手给 `.card-title` 加了 `text-wrap: balance`，免得「…BEFORE / 4」这种尾字被孤立到第二行。
>
> **随后用户要求「内容往上移、页头顶格、每页多放卡片」**：当轮给 `.main` 加的
> `display: flex` / `justify-content: center`（垂直居中）**已撤掉** —— 现在页头就是
> 老老实实从页顶开始，`.page-head` 的上内边距 38px 是它唯一的顶部留白。
> `.main` 只剩 `flex: 1 0 auto` + `padding-bottom: 64px`。
> `SITE.pageSize` 同时由 9 提到 **12**（3 列 × 4 行，一屏铺满）。
> **2026-09-20 深夜又提到 21**（3 列 × 7 行）—— 用户反馈「一页再增加 3 行，有点空了」，
> 当时站上 42 款，21 条一页正好 2 页、两页都铺满。
> ⚠️ `pageSize` 要按 **列数 × 目标行数** 来定（3 列时就是 3 的倍数），
> 不然最后一列会缺角；4 行→12 条、7 行→21 条是实测「一屏刚好」的两档。
> ⚠️ 页脚贴底带来的副作用：**内容比视口短时**，空白会堆在页脚上方（12 条/页时实测约 340px）。
> 这是「贴底」的必然结果，不是 bug；想压掉这块空白只有两个旋钮 ——
> 把 `.card-top` 调高（卡片变高）或把 `SITE.pageSize` 调大。
> 现在 21 条/页下文档高 **1037** > 视口 950，**刚好略超一屏**，这块空白自然就没了。

> **详情页改成「上下两块、铺满一屏」**（2026-09-20 深夜，用户反馈「这个下载不美观」）：
> 原来的两栏是 `游戏介绍 | 右侧下载侧栏`（`.layout-with-side` + `.side-sticky`，窄屏时侧栏
> 还会 `order: -1` 提到正文前面）。现在整块拆掉，改成单列自上而下：
> `面包屑 → 标题（+原名）→ 游戏介绍面板 → 截图 → 下载地址面板`。
>
> 1. **下载卡片重做**：`.dl-list` 从竖排列表改成 `grid`（`repeat(auto-fit, minmax(240px, 1fr))`），
>    4 个网盘正好一行排满。每张卡是「色点 + 网盘名 + 说明」在上、「前往下载」按钮在下，
>    `.dl-item` 用 `flex-direction: column` + `justify-content: space-between`，
>    所以卡片等高时按钮自动对齐到底部。
> 2. **`240px` 这个下限是实测算出来的**：版心内容宽约 1072px，`240 × 4 + 12 × 3` 刚好放得下
>    4 列；写到 258 就会掉成 3 列、第 4 个网盘被挤到第二行。
> 3. **页面铺满**：`<div class="container detail">` 用 `flex: 1 0 auto` + `flex-direction: column`
>    撑满 `.main`，里面每块 `.panel` 是 `flex: 1 0 auto` —— 内容不满一屏时多余高度由两块面板
>    平分，落到面板内部；内容超过一屏时 auto 归零，等同于普通从上往下排。
> 4. **别再把下载卡片拉高**：试过给 `.dl-list` 加 `flex: 1 1 auto` + `grid-auto-rows: 1fr`，
>    卡片会被撑到 250px 高，「名称在上、按钮在下」中间一大片空腔，比留白更难看。已回退。
>
> 副作用：游戏介绍只有几行文字时，面板里会留着约 100px 空腔（宽屏实测 267px 面板 / 107px 正文）。
> 这是「面板铺满一屏」换来的，属于取舍。想回到紧贴内容，把 `.container.detail > .panel`
> 的 `flex: 1 0 auto` 删掉即可（页面底部会重新出现空白）。

> **提取码不再显示**（2026-09-20 深夜，用户：「不需要提取码」）：下载卡片里那个
> 「提取码 xxxx + 复制」的小胶囊（`.code-chip`）整块删掉了，每张卡现在只剩「前往下载」一个按钮。
> - `build.mjs`：`pageDetail()` 里生成 `code` 的 `const` 和 `<div class="dl-actions">${code}` 里的插值都删了。
> - `assets/style.css`：`.code-chip` 及其 `code` / `button` / `.icon` 四条规则全删。
> - frontmatter 里的 `downloads[].code` **仍然会被 `parseNetdisk()` 解析并写进文件**（这样粘贴
>   「链接 + 提取码」时 url 依然干净，码也留了档），只是页面不渲染。想彻底不写这一行，
>   删掉 `newGame()` 里 `downloadLines` 拼接的 `d.code` 分支即可。
> - 顶部那条 `解压密码：xxx`（`extractCode`）**保留**，它和每项的提取码是两回事。

---

## 部署到 Cloudflare Pages

1. 把整个项目推到 GitHub / GitLab 仓库
2. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 选择仓库，构建配置填：

   | 配置项 | 值 |
   | --- | --- |
   | Framework preset | `None` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. 点 **Save and Deploy**，几十秒后就能拿到 `xxx.pages.dev` 域名
5. 绑定自定义域名：项目 → **Custom domains** → 添加你的域名

`public/_headers` 里的安全响应头和缓存策略会被 Cloudflare Pages 自动读取并生效，
不需要额外配置。

> 也可以本地跑 `npm run build`，然后把 `dist/` 目录直接拖到 Cloudflare Pages 的
> 「Direct Upload」上传 —— 一共就几十个文件，秒传。

### 上线前记得改这两处

| 文件 | 改什么 |
| --- | --- |
| `build.mjs` 顶部 `SITE.url` | 改成你的正式域名（影响 canonical 与 sitemap） |
| `public/robots.txt` | 里面的 Sitemap 域名 |
| `build.mjs` 顶部 `SITE` | 站名、简介、作者、版权 |

---

## 源码有多精简

整站只有 **4 个源文件**需要维护，加起来约 **80 KB**：

| 文件 | 行数 | 体积 | 职责 |
| --- | --- | --- | --- |
| `build.mjs` | 1234 | 46 KB | 配置 + 模板 + 构建 + 预览 + 新建文章 |
| `assets/style.css` | 1122 | 22 KB | 全站样式（手写，含两套主题） |
| `assets/app.js` | 270 | 9 KB | 前端交互（主题 / 复制 / 灯箱 / 筛选 / 分页 / 预取） |
| `start.bat` | 101 | 3 KB | Windows 启动菜单 |

2026-09-20 做过一轮**只删不增**的瘦身，页面外观零变化（改前改后逐页 HTML 二进制对比，
42 个详情页完全一致）：

- **图标库**从 29 个剪到 10 个 —— 只保留页面上真正渲染出来的那几个
- **`normalize()`** 删掉 4 个永不渲染的字段（`version` / `size` / `language` / `featured`）
- **CSS** 删掉 4 个死类（`.head-count` / `.btn-ghost` / `.panel-plain` /
  `:root:not(...).prefers-dark`）
- **`app.js`** 把复制功能的独立函数 + `.then()` 回调合并进一个 async 事件监听
- **`content/*.md`** 用一次性脚本清掉 12 篇文章里的 76 个死字段
  （`cover` / `tags` / `version` / `size` / `language` / `views` / `likes` / `featured` /
  `requirements`）

2026-09-21 又砍掉一批**用不到的功能**（代码整块删除，不是藏起来）：

- **开发模式（`dev`）整体下线** —— `fs.watch` 监听、`/__build` 轮询路由、
  给页面动态注入的自动刷新脚本全删，`build.mjs` 少 62 行。
  同时从启动菜单、`package.json`（`npm run dev`）里拿掉。
- **启动菜单从 4 项精简到 2 项**，只留「启动预览」和「新建游戏」。
  ⚠️ **`build` 模式本身保留了**：Cloudflare Pages 的构建命令就是 `npm run build`
  （= `node build.mjs build`），删了会直接部署失败。它只是不再出现在菜单里，
  `start.bat build` 和 `npm run build` 照常用。

⚠️ **`summary` 不在精简范围内。** 页面上虽然不显示它，但它会被写进详情页的
`<meta name="description">` 和 JSON-LD，删了会掉 SEO 描述 —— 别顺手删。

---

## 常见自定义

**改站名 / 简介 / 页脚**：编辑 `build.mjs` 顶部的 `SITE`（版权文案是 `COPYRIGHT`，
留空自动显示「© 年份 站名」）。页脚结构在 `footer()` 里，已经没有任何链接了。

**改每页显示几款**：`build.mjs` 顶部 `SITE.pageSize`（当前 **21** = 3 列 × 7 行）。
这是纯前端分页，调完重新构建即可，不会多出页面文件；调成 999 就等于取消分页。
建议按「列数 × 目标行数」来取（3 列 → 12 / 21 / 30），不然最后一列会缺角。

**改版心宽度**：`assets/style.css` 顶部 `:root` 里的 `--maxw`（当前 1120px）。
再配 `.game-grid` 的 `minmax(298px, 1fr)` 决定一行几列 —— 1120 时是 3 列（每张 352px），
把 `minmax` 调到 260 左右就能挤成 4 列。

**改卡片高度**：`assets/style.css` 里 `.card-top` 的高度（当前 54px）+ `.card-meta` 的高度
≈ 卡片总高（54 + 30 + 2px 边框 = 86px）。`.card-top` 是固定高度，同一行的卡片才能齐平。
把 `.card-top` 调大就能让卡片变高、页面显得更满（但两行标题的呼吸感也会跟着变）。

**让页面更满**：只有两个旋钮 —— `SITE.pageSize`（每页多放几款）和 `.card-top` 高度
（卡片变高）。页脚是贴底的，内容不够高时空白只会堆在页脚上方，没法靠别的方式「填满」。
1706×950 视口下实测：每页 **12** 条（4 行）→ 文档高 ~744、**底部空 340px**；
每页 **21** 条（7 行）→ 文档高 **1037**，刚好略超一屏 —— 现在是这个档位。

**改详情页「下载地址」一行几个网盘**：`assets/style.css` 里 `.dl-list` 的
`grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`。版心内容宽约 1072px，
240 刚好 4 列；调大到 258 会掉成 3 列，调小到 200 左右能挤下 5 列。

**改主题色**：编辑 `assets/style.css` 顶部 `:root` 里的 `--brand`（浅色）和
暗色块里的 `--brand`。整套配色都由 CSS 变量驱动，改一处全站生效。

**加新图标**：在 `build.mjs` 的 `ICONS` 里加一条 SVG 路径，然后用 `icon('你的名字')` 调用。
图标是内联 SVG，不产生额外请求。

**暗色模式**：默认跟随系统，列表页筛选框右侧的按钮可手动切换，选择会记住（localStorage）。
想永久锁定某一个模式，删掉 `build.mjs` 里 `pageGames()` 中的主题切换按钮即可。

---

## 安全说明

本站没有服务端、没有数据库、没有登录，所有页面都是构建时生成的静态文件，因此不存在
SQL 注入、越权访问、服务端 RCE 之类的风险面。在此之上，`public/_headers` 额外加固了：

- `X-Frame-Options: DENY` + `frame-ancestors 'none'` —— 防点击劫持
- `Content-Security-Policy` —— 只允许本站脚本执行，图片额外放行 https 外链
- `Strict-Transport-Security` —— 强制 HTTPS
- `Permissions-Policy` —— 关闭摄像头、麦克风、定位等所有用不到的浏览器能力
- `X-Content-Type-Options: nosniff` —— 防 MIME 嗅探

> 如果你后续想接入第三方统计（如 Cloudflare Web Analytics 或 Umami），
> 需要把它的域名加进 CSP 的 `script-src` 和 `connect-src`，否则会被浏览器拦截。

---

## 免责声明

本站仅提供资源索引，所有资源均来自网络公开分享，仅供学习交流，请于下载后 24 小时内删除。
请支持正版。
