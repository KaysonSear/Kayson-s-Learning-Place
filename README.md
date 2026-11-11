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

默认构建使用仓库内的 Markdown，也可通过 `C_LAB_SOURCE` 指定另一份原文。构建生成 `content/library.json`、单文件离线版 `dist/C-Lab.html`，以及供 HTTP 服务使用的 `dist-cloud/`，其中 HTML、CSS、JavaScript 和题库 JSON 各有一个文件。两个版本目前均使用浏览器本地存储。个人进度 JSON 单独保管。

`tests/review-*.json` 记录内容制作和复核情况。题库依据附件逐点设计；如需订正，在对应题库源码中修改后重新构建。完整源文使用 SHA-256 记录来源，构建及检查不会改写原 Markdown。
