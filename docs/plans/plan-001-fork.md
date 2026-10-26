# obsidian-export-image Fork 改造方案

> 状态：已批准执行（2026-10-27）
> 基线：upstream master `d8b16f5`（2025-04-23，v2.4.4）
> 本机：Obsidian **1.15.0**（运行版 asar：`~/Library/Application Support/obsidian/obsidian-1.15.0.asar`；`/Applications/Obsidian.app` 的 Info.plist / obsidian.asar 仍是安装器 1.13.7，会滞后）；插件 2.4.4；自用主库 `data.json`：`width=640`、`png0`、旧键 `2x=true`、**无 `padding`**
> 证据标记：【代码】读源码确认；【issue】上游 issue/PR；【实测】本机读取；【推断】需 fixture 复现

## 执行记录

- 2026-10-27：M0 完成。仓库为本地工作副本，分支 `feat/fork-m1`；合入 PR #129（异步等待）与 PR #120（callout + MarkdownRenderer），构建通过。
- 2026-10-27：M1 第一轮完成。新增 `renderHost`（attached host、字体/图片/异步/Pele 等待、`.pele-zoom` 清理）；`exportImage`/`makeHTML` 改为在导出宽度下 canonical 渲染；设置深合并 + 旧 `2x` 迁移；格式探测校验 `blob.type`；split 空结果回退单页。`pnpm build` 与 `tsc` 通过。
- 2026-10-27：M2 性能第一轮完成。`@font-face` 只嵌入导出子树实际用到的 family/weight；桌面端 `local()` 命中时跳过 32MB base64；split/PDF 改为整篇渲染一次后裁页，超过 canvas 面积预算才回退逐页。新增 4 个测试文件、11 个测试，全绿。
- 待真机验收：用 `fixtures/vault` 在 Obsidian 1.15.0 上导出 11 篇 fixture；重点看 Pele 图宽/字号、文件夹导出、callout、长文、split。

## 0. 结论

1. 上游确实停更（最后提交 2025-04-23），41 个 open issue、4 个 open PR。其中 **PR #120（callout 图标 + 改回 MarkdownRenderer）** 和 **PR #129（等异步渲染器）** 都是 MERGEABLE、零 review 的现成修复，fork 第一件事是把它们合进来，而不是从零重写。
2. 真正的问题不是零散 bug，是 2.4.4 的架构选择：**导出时抓 CodeMirror 实时预览 DOM，并把传入的 markdown 参数丢掉**。后果是「导出选中=导出整篇」「右键 A 文件=导出当前打开的 B 文件」「阅读模式导出空白」。预览与导出不一致、长文截断、Pele 无法按导出宽度排版，都是同一条根因的下游症状。
3. 因此顺序必须是：**先把渲染管线改成 canonical（MarkdownRenderer 在导出宽度下渲染）→ 立即接 Pele（1.15 已上线，当前就是坏的）→ 再修保真/性能**。反过来的话，Pele 适配会建在错误的宽度/克隆模型上，做完还要再拆一次。
4. 本机有一个真实配置损坏：`data.json` 是旧 schema，缺 `padding`、只有 `2x`。当前 `loadSettings` 是浅合并，导致导出实际是 **3x（默认值）+ 0 边距**，不是使用者以为的 2x + 6px。这是 P0，不是边角。
5. Pele 已在本机 **1.15.0** 启用（asar 内含 `/lib/pele.min.js`、`pele.mount`、`.pele-zoom`）。当前 2.4.4 的导出路径没有适配：它把编辑器宽度下的 `.mermaid` SVG 克隆进 640px 容器，并可能把 `.pele-zoom` 按钮一起拍进去；文件夹导出在 detached 容器里渲染，Obsidian 的 Pele 挂载会被 `isShown()` 推迟，图直接是空的。Pele 不是「以后再说」，是当前 P0。

## 1. 现状取证

### 1.1 上游

| 项 | 事实 | 证据 |
|---|---|---|
| 最后提交 | 2025-04-23 `d8b16f5`，Merge PR #108 | 【代码】`git log` |
| 版本 | 2.4.4（2025-02-17） | 【代码】`manifest.json` |
| open issues | 41 | 【issue】`gh issue list` |
| open PRs | #131（gutter，功能）、#129（异步等待，修复）、#120（callout，修复）、#100（dependabot） | 【issue】`gh pr list` |
| 许可证 | MIT | 【代码】`LICENSE` |

### 1.2 本机

| 项 | 事实 | 证据 |
|---|---|---|
| Obsidian | **1.15.0**（运行版 asar：`~/Library/Application Support/obsidian/obsidian-1.15.0.asar`，`package.json` version=1.15.0） | 【实测】asar 解包 |
| 安装器 | `/Applications/Obsidian.app` 的 Info.plist / obsidian.asar 仍是 1.13.7，**不能当运行版本** | 【实测】plist + asar |
| Pele | 1.15.0 已内置：`/lib/pele.min.js`、`pele.mount`、`--pele-*`、`.pele-zoom` | 【实测】asar 解包 + `app.js` |
| 插件 | 2.4.4，`main.js` 1.35MB | 【实测】插件目录 |
| 配置 | `width=640`、`png0`、`2x=true`（旧键）、无 `padding`、水印开、作者信息开 | 【实测】`data.json` |
| 字体片段 | `自用字体片段.css` 32MB，4 个 `@font-face` | 【实测】文件大小 + grep |

### 1.3 代码级发现（先修这四条）

1. **导出内容错位/空白**【代码】`src/components/file/exportImage.tsx:106-162`：`loadDocumentContent(app, el)` 完全忽略 `markdown` 参数，改为抓 `view.editor.cm` 的 `.cm-content`。选中导出传的是选区，实际抓整篇；文件菜单导出传的是目标文件，实际抓当前打开的笔记；阅读模式 `editor.cm` 不存在，`html=""`，导出空白。
2. **文件夹导出是 detached 元素**【代码】`src/utils/makeHTML.tsx:59-60`：`MarkdownRenderer` 渲染进一个从未挂到文档的 `element`，React `Target` 渲染在另一个 `container`；`element.closest('.export-image-root')` 永远返回 `null`，于是 `saveMultipleFiles` 捕获的是无样式、`clientWidth=0` 的 detached 元素。默认 split=none 时会生成一张 0 宽空白图，split 模式可能直接空 ZIP。
3. **设置浅合并**【代码】`src/ExportImagePlugin.ts:170-172`：`{ ...DEFAULT_SETTINGS, ...data }` 只合并第一层。旧 `data.json` 没有 `padding`，`setting.padding.top` 是 `undefined`，模板拼出 `undefinedpx`，整条 `padding` 声明被浏览器丢弃；`2x` 旧键也不会迁移到 `resolutionMode`。
4. **Pele 导出路径未适配**【代码 + 1.15.0 实测】：1.15 的 post-processor 把 `<pre>` 换成 `div.mermaid`，再 `pele.mount(div, source, { zoom, math, sanitize, onRender })`；外层 `UB` 先看 `isShown()`，不可见时把 `Qle`（真正 mount 的那步）推迟到 `onNodeInserted`。所以任何「在 detached 容器里 MarkdownRenderer.render」的路径（文件夹导出、PR #120 的 `loadDocumentContent`）拿到的 `.mermaid` 是空的，克隆进 Target 后图就是空白。live-preview 路径虽然能抓到 SVG，但宽度是编辑器宽度，且可能把 `.pele-zoom` 控件一起拍进去。Pele 根 SVG 的 class 是 `pele`，缩放条是 `pele pele-zoom`。

## 2. 目标与验收

**目标一句话**：把插件从「抓编辑器 DOM 的截图工具」改成「以 markdown 为输入、在导出宽度下重新渲染的确定性导出器」，并在这条管线上修 bug、提性能、接 Pele。

验收清单（每条都要有数）：

- [ ] 4 条入口（文件菜单 / 选中 / 阅读模式 / 文件夹）导出的内容与源文件一致；同一 fixture 连续 3 次像素 diff < 0.1%。
- [ ] 预览与导出像素 diff < 0.5%（表格、callout、公式、图片四类）。
- [ ] 异步渲染器 fixture（Dataview/SQLSeal 模拟）不出现空表/空白。
- [ ] 3000 字 + 20 图 + 10 公式的笔记，3x PNG 导出 < 5s（当前基线待测）。
- [ ] 5 页 split 总耗时 < 单页 × 1.5（当前是逐页重渲染，约 ×5）。
- [ ] 32MB 字体片段的 vault，导出 SVG 字符串 < 5MB，耗时不再随字体体积线性增长。
- [ ] Obsidian **1.15.0（Pele）** 为主矩阵，1.13.7 仅作 legacy fallback；明暗两套通过。
- [ ] 现有功能零回归：宽度/边距/水印/作者信息/元数据/分割/PDF/ZIP 逐项复验。

## 3. 目标架构（管线契约）

```
输入层  file / selection / folder / active note
        └─ 只负责拿到：markdown 源文本 + sourcePath + frontmatter
渲染层  MarkdownRenderer.render(app, md, host, sourcePath, ctx)
        host = 导出宽度（setting.width）的已挂载容器
        └─ 后处理：Pele 重挂载 / 异步渲染器稳定 / 图片原始分辨率 / 字体就绪
组装层  Target（width / padding / title / metadata / watermark / author / cssclasses）
        └─ 快照：一次 clone + 一次字体内联 + 一次栅格化
输出层  PNG / JPEG / WebP / PDF / ZIP
        └─ split：从同一张高分辨率位图裁切，不逐页重渲染
```

三条设计决策：

1. **默认 `renderMode: 'reading'`**（canonical），保留 `live-preview` 作为可选 fallback，只给「只在编辑器里渲染」的插件（Multi-Column 等）用。
2. **快照只做一次**；split/PDF 从整张 canvas 裁切。
3. **Pele 不打包**，用宿主 `window.pele`；没有则走旧 Mermaid SVG 路径。

## 4. 任务清单（按实施顺序）

### M0 基线（1 天）

| ID | 改动点 | 验收 |
|---|---|---|
| T0.1 | fork + `upstream` remote + `feat/fork` 分支；保留 `main` 与 upstream 同步 | `git remote -v` 有 upstream；`pnpm build` 绿 |
| T0.2 | 锁包管理器：只留 `pnpm-lock.yaml`，CI 改 `pnpm install --frozen-lockfile` | 干净 clone 可复现构建 |
| T0.3 | 建 fixture vault：12 篇（CJK/表格/callout/公式/mermaid(Pele)/图片/嵌入/长文/frontmatter/split/代码/暗色） | 每篇能打开、能导出 |
| T0.4 | 加 dev-only 命令 `Export fixtures`，导出到 `fixtures/out/`；Node 脚本用 `pixelmatch` 对比 golden | `node scripts/compare-fixtures.mjs` 输出 PASS/FAIL |
| T0.5 | 记录基线：`bench/baseline.json`（fixture、scale、ms、svgBytes、pngBytes、canvasPx） | 5 篇 × 3 次，数字落盘 |

### M1 正确性（3–5 天，P0）

| ID | 改动点 | 优先级 | 验收 |
|---|---|---|---|
| T1.1 | 合入 **PR #120**（callout + MarkdownRenderer）与 **PR #129**（异步等待）；先合 #129 再合 #120，冲突按新渲染管线解 | P0 | 4 条入口内容正确；callout 图标在导出中出现 |
| T1.2 | 把渲染职责收进 `Target`：`Target` 接收 `markdown/sourcePath`，在 `contentRef` 内 `MarkdownRenderer.render`；删除 `loadDocumentContent` 与 `makeHTML` 的双重克隆 | P0 | 4 条入口输出同一张图；无 detached 元素 |
| T1.3 | 等待管线：`await document.fonts.ready` → `img.decode()` → `waitForAsyncRenderers` → 2×`requestAnimationFrame` → 量 `scrollHeight`；删固定 100/500ms | P0 | 异步 fixture 非空；字体/图片 fixture 不截断 |
| T1.4 | 设置深合并 + 迁移：递归 merge；`2x`→`resolutionMode:'2x'`；补 `padding/split/watermark/authorInfo` 默认值；数值校验 | P0 | 载入本机 `data.json` 后 `padding=6`、`resolutionMode=2x`；导出有 6px 边距 |
| T1.5 | 格式探测：`await detectFormats()` 后再渲染设置；`canvas.toBlob` 回调校验 `blob.type === mime`；去掉 `delay(50)` hack | P1 | 不支持的格式不出现；不误报 webp |
| T1.6 | 快速导出竞态：`flushSync` 或 `Target` ready promise；`querySelector` 前确认已 commit | P1 | 连续 10 次快速导出，0 次 null/空白 |

### M2 保真（3–4 天，P1）

| ID | 改动点 | 优先级 | 验收 |
|---|---|---|---|
| T2.1 | 字体按需内联：扫描 `contentRef` 实际用到的 `font-family/weight`，只内联命中的 `@font-face`；`document.fonts.check()` 命中则跳过 base64；按 family 集合缓存 | P0（本机）/P1（通用） | 32MB 片段导出 SVG < 5MB；耗时 < 基线 1/3；正文仍是自用字体 |
| T2.2 | 图片原图管线：`img.src` → `TFile`（`getFirstLinkpathDest`/`vault.adapter`）→ 原始二进制 → `createImageBitmap`；保留显示尺寸；导出后 revoke | P1 | 3x 下内嵌图清晰；外链图仍可导出 |
| T2.3 | callout 图标：移植 PR #120 的 `calloutIcons.ts`；覆盖 `--callout-icon`、`background-image`、`mask-image`、空 SVG；用 Prism/自用 CSS 片段实测 | P1 | 所有 callout 类型图标不丢 |
| T2.4 | 截断修复：字体/图片就绪后再量；用 `scrollHeight`；测量期 `overflow: visible`；`ResizeObserver` 后再量一次 | P1 | #112 类 fixture 不截断、不异常换行 |
| T2.5 | 明暗两套 golden：同一 fixture 在 light/dark 各导一次，对比主题 CSS | P1 | 无浅底白字/深底黑字 |

### M3 性能（3–4 天，P1）

| ID | 改动点 | 优先级 | 验收 |
|---|---|---|---|
| T3.1 | 并行 clone/inline：按层 `Promise.all`（并发上限 4–8），保持子节点顺序；替换逐节点 `then` 链 | P1 | 3000 字 fixture clone 时间 −40% |
| T3.2 | 单次栅格化 + 裁切：`toCanvas` 一次；split 用 `ctx.drawImage` 裁页；PDF 页从同一 canvas 出 | P1 | 5 页 split < 单页 × 1.5；输出像素不差于逐页 |
| T3.3 | Canvas 预算：桌面 64M px / iOS 16M px 上限；超限自动降 scale 并 Notice；超长图分块 | P1 | 4x 超长笔记不空白；提示实际 scale |
| T3.4 | 埋点：`performance.mark/measure` 分阶段；dev 命令写 `bench/after.json` | P1 | 有 before/after 对照表 |
| T3.5 | 样式拷贝优化：denylist `animation/transition/cursor/will-change` 等；按 tag/class 缓存；无 `::before/::after` 时跳过伪元素扫描 | P2 | clone 时间 −20%；像素 diff < 0.1% |
| T3.6 | 引擎基准：`modern-screenshot@4.7` vs 内置 dom-to-image，跑同一 fixture 套件（时间/体积/像素） | P2 | 只有全面胜出才换；否则保留 |

### M4 Pele 适配（3–5 天，当前 P0；M1 完成后立即做）

| ID | 改动点 | 优先级 | 验收 |
|---|---|---|---|
| T4.0 | 先复现：用 1.15.0 导出一篇含 mermaid 的笔记，记录「图宽/字号/是否带 `.pele-zoom`/文件夹导出是否空」 | P0 | 基线截图 + 失败项清单 |
| T4.1 | 适配层：`isPeleAvailable()` = `window.pele?.mount` 或 `.mermaid .pele`；`renderDiagrams(container, markdown)`；不打包 Pele | P0 | 1.15.0 走新路径；1.13.7 走旧路径 |
| T4.2 | 导出宽度重挂载：从 markdown 围栏取源文本，对每个图 `window.pele.mount(el, source, { maxWidth: contentWidth, zoom: false })`（或 `handle.update`）；等 `svg` 出现 | P0 | 图宽 = 正文宽；字号 16px；不裁切 |
| T4.3 | 去 UI：捕获前移除 `.pele-zoom`、焦点框、拖拽提示；`zoom:false` | P0 | 导出图无缩放按钮/焦点环 |
| T4.4 | 字体/颜色：`--pele-font`/`--pele-font-mono` 跟 `--font-text`；等 `document.fonts.ready`；明暗对比度实测 | P0 | 无 fallback 字体；对比度 ≥ 4.5:1 |
| T4.5 | 隐藏容器/懒挂载：渲染 host 先以目标宽度挂到文档（离屏），再渲染；宿主不自动 mount 时手动 mount | P1 | 文件夹导出图正常 |
| T4.6 | Fallback：无 Pele → 旧 SVG 克隆；mount 抛错 → 保留宿主 SVG 并记录 | P1 | 1.13.7 legacy fixture 不回归 |
| T4.7 | 矩阵：**1.15.0 主矩阵** + 1.13.7 legacy × 48 个真实 mermaid 块 × 明暗 | P0 | 48/48 渲染，无空白/无 UI 残留 |

### M5 边界（2–3 天，P2）

| ID | 改动点 | 验收 |
|---|---|---|
| T5.1 | split `hr/auto`：无 `hr` 时回退单页；跳过 0 高页；标题 keep-with-next；可选页码 | #126 类 fixture 不空、不拆标题 |
| T5.2 | PDF：用 PNG 入 PDF；页尺寸 clamp；文件名 sanitize；元数据 | 长图/透明图不报错 |
| T5.3 | iOS canvas：面积预算 + 分块；iPad 实测（若有） | 3x/4x 不空白 |
| T5.4 | 剪贴板：能力探测；失败回退保存并 Notice | #56/#41 类环境有可用路径 |
| T5.5 | 内存：revoke blob URL；清 `urlCache`；限制缓存条目 | 连续导出 20 次内存不涨 |
| T5.6 | 内部 API：`getAllPropertyInfos` 换 metadata cache；`editor.cm` 只留在 live-preview adapter | 1.15 不因内部 API 崩 |
| T5.7 | 构建卫生：单 lockfile、`--frozen-lockfile`、删未用依赖、`minAppVersion` 提到 1.8+ | CI 可复现 |

### M6 发布（1–2 天）

| ID | 改动点 | 验收 |
|---|---|---|
| T6.1 | fork 身份：`manifest.id` / name / author / README / MIT NOTICE | 安装不覆盖原插件（或明确覆盖策略） |
| T6.2 | Release：tag、CI 产物 `main.js/manifest.json/styles.css` | 干净 vault 可安装 |
| T6.3 | 文档：DOM 结构、Pele 说明、迁移说明 | README 能照着装 |

## 5. 优先级汇总

- **P0（不做就不能交付）**：T1.1–T1.4、T2.1（本机 32MB 字体）、T4.0–T4.4、T4.7。
- **P1（决定好不好用）**：T1.5–T1.6、T2.2–T2.5、T3.1–T3.4、T4.5–T4.6。
- **P2（边界与长期）**：T3.5–T3.6、T5.*、T6.*。

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| Pele 在 detached host 里不挂载 | 文件夹导出 / PR #120 路径图空白 | 渲染 host 先以目标宽度挂到文档（离屏但 `isShown()` 为真），或手动 `pele.mount`；T4.5 验收 |
| MarkdownRenderer 与实时预览视觉差异 | 部分编辑器专属插件失效 | 默认 canonical + `live-preview` 开关；golden 对比 |
| PR #120/#129 无人维护 | 后续冲突 | 尽早合入并打 tag；记录 upstream commit |
| 32MB 字体片段 | 首次导出仍慢 | 插件侧按需内联 + 缓存；建议精简片段（vault 侧，另行决定） |
| dom-to-image 是 vendored fork | 上游修复不流入 | 保持 adapter；M3 基准后决定是否换引擎 |
| 插件 id/上架冲突 | 设置丢失/更新冲突 | M0 就定 id 策略 |

回滚：每个里程碑独立分支 + tag `v2.4.4-fork.0`；`renderMode`、`pele` 都做 feature flag；单任务可 `git revert`。

## 7. 待拍板

| # | 决策 | 建议默认 |
|---|---|---|
| 1 | 自用还是上架？ | 自用优先，保留 `obsidian-export-image` id；上架另开 id + 迁移脚本 |
| 2 | 默认渲染模式？ | canonical（reading）默认，保留 live-preview 开关 |
| 3 | Pele 适配插在哪？ | **M1 完成后立即做（当前 P0）**；不按原计划排到 M4 末尾 |
| 4 | 32MB 字体片段动不动？ | 只改插件（按需内联），不动 vault 片段 |
| 5 | 是否换渲染引擎？ | 先 patch 内置 dom-to-image；M3 基准后再决定 |
| 6 | 发布节奏？ | 公开 fork + 保留 upstream remote，季度 cherry-pick |
