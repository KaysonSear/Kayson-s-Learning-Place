# C 微实验室

离线、中文、无账号的 C23 学习工作台。全文来自仓库内的 `content/Coding · C.md`，保留 19 章、118 个知识簇、1064 个知识点，以及代码、表格、公式和知识图。

## 使用

打开 `dist/C-Lab.html` 即可，无需服务器或安装依赖。默认每轮三题，提供 2128 道逐点练习、16 个可操作实验、全文搜索及进度备份。

打开「刷题」可连续做 1064 道四选一挖空题。支持按原题号顺序、随机题序和输入原题号跳转。点击选项查看解析，再进入下一题。刷题进度和正确率独立保存，随学习进度一起导出和导入。

- **Windows**：用 Chrome、Edge 等现代浏览器打开 HTML。
- **安卓**：保存整个 HTML 文件，再用支持执行本地 HTML 的浏览器打开。文件管理器的静态预览可能只显示页面而不运行脚本。
- **进度迁移**：在“设置与备份”导出 JSON，在另一设备导入。导入前可先导出本机进度。复制或移动 HTML、切换浏览器后，本地存储可能不同。
- **离线**：页面不自动访问网络；参考资料链接需要主动点击且需要联网。

## 学习记录

基础题独立通过后，迁移题至少隔日出现；阅读、提示、当天看过答案后的重答不计独立证据。复习间隔为 1、3、7、14 天，实验印记与知识点掌握分开记录。不执行任意 C 代码；所有实验均为明确限定的教学模型。

## 开发和重建

使用 Node.js 24 LTS 和 npm。界面使用 React 19.3.1，项目源码和工具使用 TypeScript 7.0.2，Vite 8.3.8 负责构建。离线成品只需要浏览器。

```powershell
npm ci
npm run typecheck
npm run build
npm test
npm run check
npx playwright install webkit
npm run check:browser
```

`npm run dev` 启动本机开发预览。浏览器检查使用本机 Chrome 断网打开离线成品，并通过 HTTP 在 Chrome 和 Playwright WebKit 上检查 360px、768px 和桌面宽度。测试输出的离线报告及截图位于 `tests/`。手机测试使用触屏仿真。

| 路径 | 维护内容 |
| --- | --- |
| `content/` | 原始 Markdown、挖空题和干扰项 |
| `scripts/` | 三题练习题库、内容转换、构建与检查 |
| `src/App.tsx`、各页面组件、`src/style.css` | 页面和交互 |
| `src/engine.ts`、`src/drill.ts`、`src/labs.ts` | 复习、刷题和实验规则 |
| `src/progress.ts`、`src/storage.ts` | 备份校验与迁移、浏览器本地存储 |
| `tests/` | 回归测试和题目复核记录 |

默认构建使用仓库内的 Markdown，也可通过 `C_LAB_SOURCE` 指定另一份原文。构建生成单文件离线版 `dist/C-Lab.html` 和供 Worker 使用的 `dist-cloud/`。离线版使用浏览器本地存储。Worker 版使用 IndexedDB 保存待同步操作，由 D1 持久保存云端主档。个人进度 JSON 单独保管。

## Cloudflare 同步部署

`npm run build` 后运行 `npm run check:cloud`，用本机 D1 和 Chrome 验收登录、备份导入和双向同步。

### 预览

1. 在项目根目录运行 `npx wrangler login`，用现有 Cloudflare 账户授权。创建独立预览库 `kayson-learning-progress-preview`，可以在控制台创建，或运行 `npx wrangler d1 create kayson-learning-progress-preview`。复制预览库的 Database ID。
2. 在 PowerShell 运行以下命令。输入专用测试密码，使用样例进度验收。

```powershell
$env:C_LAB_PREVIEW_DB_ID = '<预览库 Database ID>'
npm run cloud:preview:config
npm run build
npx wrangler d1 migrations apply DB --local --config .wrangler.preview.json
npx wrangler d1 migrations apply DB --remote --config .wrangler.preview.json
npx wrangler deploy --config .wrangler.preview.json
npx wrangler secret put SITE_PASSWORD --config .wrangler.preview.json
```

3. 打开预览 Worker 的 `workers.dev` 网址。用无痕窗口确认首页、`/library.json` 和 `/api/progress` 都需要会话。用 Windows、安卓、iPhone 登录并从样例备份初始化。分别在两端作答并回到另一端，确认进度会自动接续。预览配置文件由命令生成，且不会进入 Git。

### 正式上线

1. 保持现有 Worker 的 Cloudflare Access 开启。在项目根目录运行 `npx wrangler d1 migrations apply DB --remote`。预览验收通过后合入同步 PR，让 Workers Builds 部署正式站。现有带 `--assets ./dist-cloud` 的部署命令兼容仓库中的 Wrangler 配置。
2. 部署完成后运行 `npx wrangler secret put SITE_PASSWORD`，或在 Worker「设置 → 运行时变量和密钥」添加名为 `SITE_PASSWORD` 的 Secret。密码未设置时，Worker 会拒绝请求。在保留 Access 的情况下先验证站点密码及登录后的页面。
3. 只关闭这个正式 Worker 的 Access 策略。用无痕窗口重新验证首页、`/library.json` 和 `/api/progress` 都受站点密码保护。若验证失败，重新启用 Access，检查部署配置与 Secret。
4. 在 Windows 上登录正式网站，点顶部「初始化云端」，选择已导出的 JSON（上限 4 MB），核对题号、作答和实验数后确认。其余设备登录同一网址后自动拉取主档。

`tests/review-*.json` 记录内容制作和复核情况。题库依据附件逐点设计；如需订正，在对应题库源码中修改后重新构建。完整源文使用 SHA-256 记录来源，构建及检查不会改写原 Markdown。
