# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

C 微实验室 (C Micro Lab): a Chinese-language C23 study app built with React 19 + strict TypeScript + Vite. The whole course lives in one Markdown file, `content/Coding · C.md`. Builds produce two outputs from the same React source:
- `dist/C-Lab.html`: one self-contained offline HTML file (inline script, CSS and course data, no network, progress kept in localStorage).
- `dist-cloud/` + `worker/`: a Cloudflare Worker that serves the app behind a site password and syncs progress through D1.

User-facing docs and deployment steps are in README.md (in Chinese). Keep UI text and error messages in Chinese.

## Commands

Requires Node 24 (`.node-version`). Node runs `.ts` files directly through type stripping, with no tsx or ts-node. That is why `tsconfig.json` sets `erasableSyntaxOnly` and `allowImportingTsExtensions`: use only erasable syntax (no enums, namespaces or parameter properties) and import with explicit `.ts`/`.tsx` extensions.

```sh
npm ci
npm run build        # generate library + vite build → dist-cloud/ and dist/C-Lab.html
npm run typecheck    # regenerates content/library.json first, then tsc --noEmit
npm test             # node --test tests/*.test.ts
node --test tests/drill.test.ts                          # single file
node --test --test-name-pattern="sequential" tests/drill.test.ts   # single test
npm run check        # content integrity asserts over content/library.json + dist/C-Lab.html (needs a build first)
npm run check:browser  # Chrome + Playwright WebKit checks at 360/768/desktop; needs `npx playwright install webkit`
npm run check:cloud    # local D1 + Chrome end-to-end login/import/sync check (run after build)
npm run dev          # vite dev server; serves content/library.json at /library.json
```

CI (`.github/workflows/check.yml`) runs build → typecheck → test → check. `check` and the browser checks write reports and screenshots into `tests/`. Those files are gitignored.

## Architecture

**Content pipeline (`scripts/`).** `generate-library.ts` parses the course Markdown by heading level: `##` chapters (19), `###` clusters `NN.N` (118+), `####` numbered points (1064+). It renders them with markdown-it and KaTeX (MathML), converts Obsidian `[[#links]]` and `> [!callout]` blocks, and draws mermaid blocks as inline SVG diagrams. It then attaches questions and writes two files:
- `content/library.json`: the full `Library` (see `src/types.ts`), loaded by the app.
- `content/sync-catalog.json`: a trimmed id/revision catalog that the Worker imports to validate operations.

Both files are generated and gitignored. The script throws if the source no longer meets the expected counts. `C_LAB_SOURCE` overrides the Markdown path (`scripts/course-source.ts`). The build must never modify the original Markdown. `sourceHash` (SHA-256) records which source a build used, and `check.ts` verifies it.

**Question banks.**
- Three-question practice (two exercises per point, stages `a`/`b`): authored in TypeScript in `scripts/questions-a.ts` and `scripts/questions-b*.ts`, with interactive overrides in `scripts/interactive-questions.ts`.
- Drill (one four-option cloze per point): `content/drill-NN-NN.txt` (`id§prompt§answer§distractor…`) plus `content/drill-options-NN-NN.txt` (extra distractors), loaded by `scripts/drill-bank.ts`. Option order comes from a deterministic hash shuffle.
- `content/drill-option-baseline.json` maps older option sets to legacy option ids and grades, so saved answers from earlier bank versions still restore and grade correctly. Each question's `revision` and `optionIds` are content hashes. Changing a prompt, its answer or its options changes them.

To fix a question, edit the bank source and rebuild. `tests/review-*.json` records how the content was reviewed.

**Single-file build (`scripts/build.ts`).** First it runs the normal vite build (→ `dist-cloud/`) and copies library.json into it. Then it runs a second Vite lib build of `src/main.tsx` as one IIFE. That build must produce exactly one chunk with no imports, so don't add dynamic imports or asset imports. The script then fills the `<!-- STYLE -->`, `<!-- DATA -->` and `<!-- SCRIPT -->` placeholders in `src/shell.html`. At runtime `src/main.tsx` reads the inline `#library-data` JSON. If that is missing, it fetches `./library.json`, and the Worker's `X-CLab-Cloud: 1` header switches the app into cloud mode.

**App logic (`src/`).** Rule modules are kept free of UI code and are unit-tested:
- `engine.ts`: spaced-review scheduling and progress import validation. Intervals are 1/3/7/14 days. A transfer question appears at least one day after an independent pass. Reading the material, using a hint, or retrying after seeing the answer the same day does not count as an independent pass.
- `drill.ts`: drill rounds.
- `labs.ts`: 16 limited teaching models. No arbitrary C code is executed.

`progress.ts` builds backup files and restores them with validation. `storage.ts` wraps localStorage under key `c-micro-lab-v1`. Views are `App.tsx`, `*View(s).tsx` and `SettingsDialog.tsx`, with styles in `style.css`.

**Cloud sync.** Progress changes become `CloudOperation`s:
- `cloud-progress.ts`: `createChange` diffs two progress states into an operation. `applyOperation` and `createOperationDecoder` are shared by the client and the Worker.
- `cloud-journal.ts`: an IndexedDB queue of pending operations.
- `cloud-sync.ts`: pushes and pulls against `/api/progress`, retries with backoff, and shows checkpoint + pending operations as visible progress.

The Worker (`worker/index.ts`, `worker/auth.ts`) handles password login with sessions and rate limiting, and serves `/api/progress` plus `/api/progress/initialize` (seed upload, 4 MB limit). Every other path goes to `ASSETS` behind the session check. The D1 schema lives in `migrations/`, the binding is `DB`, and the secret is `SITE_PASSWORD`. `wrangler.jsonc` is the production config. `npm run cloud:preview:config` generates a gitignored `.wrangler.preview.json` from `C_LAB_PREVIEW_DB_ID`.

**Compatibility constraint.** Progress JSON exported by earlier versions must keep importing and grading correctly. When changing question banks, progress shape or operation formats, keep the restore paths (`progress.ts`, `drill.ts` `restore`, legacy option maps) and their tests working.
