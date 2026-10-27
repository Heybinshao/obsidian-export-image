# 移动端适配方案

> 状态：已执行（2026-10-27，v2.5.0；M1/M2 全做，M3 除「移动端默认参数」外全做）
> 基线：v2.4.10
> 目标：手机上能顺畅走完「选图 → 调参 → 预览 → 保存/分享」，而不是把桌面布局缩小
> 证据标记：【代码】读源码确认；【实测】离线 harness 量测；【推断】需真机确认

## 执行记录（v2.5.2，2026-10-27 03:30）

- **导出字体（关键结论）**：`@font-face` 内嵌字体在 **WebKit 的 SVG 图像里生效、在 Chromium 里被忽略**。实测（本机 Chromium + Playwright WebKit，同一份 5.4 MB TTF、同一段 SVG）：Chromium 带/不带 `@font-face` 的像素完全一致（ink 1928 vs 1928），WebKit 差异明显（1745 vs 1993）；系统已装字体两边都能用（Trattatello 684/718 vs sans 813/898）。因此手机（WKWebView）这条路可行，桌面（Electron/Chromium）只靠 `local()` 命中。**`extraFontCss` 只在 WebKit 上有意义，手机端必须保证它真的被塞进 SVG**。
- 字体管线加固：`@font-face` 块改用「引号/大括号配对扫描」（原 `[^}]*` 正则遇到嵌套大括号会静默丢块）；缺失判定改为 family+weight+style 三元组，且**可读表里只有 `local()` 的 face 依然算缺失**（手机上 local 必然落空）；`font-display: swap → block`（SVG 图像只栅格化一次，swap 会先把回退字形画进去）；读文件三档回退 `read → readBinary → getResourcePath+fetch`，并用 `stat().size` 检出截断（截断会让后面的 face 全丢）；导出前 `document.fonts.load()` 逐个 family 预热。
- 诊断：手机端导出时把 `fontSources`（files/notes/vaultFaces/missing/embedded/bytes）+ 平台标志 + blob 字节写进 `.obsidian/plugins/obsidian-export-image/export-debug.json`，随同步盘回桌面可读。
- **导出逻辑**：修了两个实际问题。①在「设置」tab 下点分享时预览是 `display:none`，`clientWidth = 0` → 截图为 0×0；现在导出前自动切回预览 tab 并轮询等布局就绪。②分享面板需要新鲜手势，抓图耗时超过激活窗口时 `NotAllowedError`：原来只弹「请再点一次分享」，现在保留已生成的 File，在遮罩里给一个**独立的「分享」按钮**（点它即新号令），不用重新渲染。
- **手机弹窗形态**：改为贴底抽屉（`align-self: flex-end`、顶部留 `max(56px, safe-area-top)`、`--modal-radius` 取 `--touch-radius-s` 顶部两角），跟主题原生 sheet 一致；实测 390×844：弹窗 top 59 / 高 785 / 底对齐 844，关闭按钮距顶 71px，预览视口 294×496。桌面（1440×900）仍是 85vh 居中（757px），无回归。
- **单指拖动**：`TransformWrapper` 的 `panning` 不再按缩放禁用，并给 `.export-image-preview-out` 及其子节点补 `touch-action: none`——不补的话浏览器把拖动当滚动手势并 `pointercancel`，组件根本收不到移动。实测计算值 `touch-action: none`。

## 执行记录

- 2026-10-27：M1 布局。弹窗宽度按平台（手机 100%，桌面 85vw/800px）；导出弹窗加 `export-image-file-modal` 类；手机端「预览/设置」tab（默认预览）；预览 `panning` 在 fit scale 时关闭、放大后恢复；图片选择弹窗手机版改单列（预览在上 160px、列表在下，行高 44px + 缩略图）；头像控件行 `flex-wrap`。
- 2026-10-27：M2 操作流。手机端动作栏按钮 `flex:1`、44px、隐藏复制按钮；保存按钮文案「分享」；文件输入 `accept="image/*"`、数字输入 `inputmode="decimal"`；导出遮罩 + 取消（`ExportCancelledError` + `shouldCancel`）；自动降倍率时 Notice 提示。
- 2026-10-27：手机端导出只走系统分享面板，不写 vault。`saveMobile` 移除 Capacitor 相册与 vault 回退；分页/文件夹导出把所有图片放进**一次** `navigator.share`。Web Share 需要用户手势，长笔记渲染可能超过激活窗口（`NotAllowedError`）：此时缓存已生成的 File 并提示「再点一次分享」，第二次点击直接用缓存调起分享，不重新渲染。
- 2026-10-27：M3 打磨（除 #15）。底部安全区 padding、手机字号 15px、选图缩略图、ribbon 入口「导出当前笔记为图片」、手机端文件夹/分页导出多张时一次性调起系统分享面板（附上全部文件），不写入 vault。
- 未做 #15「移动端默认 2x + JPEG」：`data.json` 跨设备同步，写死手机默认会连带改到桌面；要做需要单独的移动端覆盖层，留到下一轮。
- 离线 harness（390×844 + `is-phone`）实测：弹窗全宽、tab 52px、预览区撑满剩余高度、动作按钮 44px；设置 tab `scrollHeight 3293 / clientHeight 1955` 可滚；选图弹窗 `column-reverse`、预览 510×160 在上、列表行高 44px。
- 2026-10-27：修复移动端导出丢字体。根因方向：移动端 vault CSS（snippets/themes）与页面不同源，`styleSheet.cssRules` 读取抛错，dom-to-image 看不到 `@font-face`，导出的 SVG 里没有字体数据 → 回退系统字体。修复：新增 `src/utils/fontSources.ts`，比对「导出子树实际用到的 family」与「document.styleSheets 里可见的 @font-face」，缺的那部分从 `.obsidian/snippets/*.css` 和当前主题 `theme.css` 读取（按 mtime 缓存），通过 dom-to-image 新增的 `extraFontCss` 选项直接塞进 SVG 的字体样式，不注入 document。Playwright WebKit 实测：文档里没有该字体时，带 `extraFontCss` 的截图与无衬线基线差异 10.2%，不带时 3.8%（仅字体回退差异），证明内嵌字体生效。

## 1. 结论

现在手机端不是「没优化」，是**桌面布局直接套用**。三处直接影响可用性：图片选择弹窗是固定两栏、头像控件一行塞三个按钮、预览区会吃掉竖向滚动手势；两处与手机习惯相反：复制按钮在手机上不可用却占位、保存按钮写着「保存到 vault」但实际先走分享面板。建议按 M1 布局 → M2 操作流 → M3 打磨三段做，**M1 必做，M2 决定好不好用**。

## 2. 现状取证

| # | 问题 | 证据 | 手机上会怎样 |
|---|---|---|---|
| 1 | 图片选择弹窗固定两栏：列表 `flex:1` + 预览 `width:200px; height:300px` | 【代码】`styles.css:187-223`；`ImageSelectModal` 不设宽度 | 390px 宽屏下列表只剩 ~110px，文件路径全截断，基本没法选图 |
| 2 | 头像控件一行三个按钮 + 36px 头像 | 【代码】`Control.tsx:127-180`、`SettingRenderer.ts` 同结构 | 375px 宽下按钮被挤/换行，删除按钮与「上传」重叠 |
| 3 | 弹窗宽度写死 | 【代码】`exportImage.tsx:82` `85vw`、`exportFolder.tsx:16` `800px` | 覆盖 Obsidian 手机端 `--dialog-width:100vw`（app.css `.is-phone .modal-container`），不是全宽底部抽屉 |
| 4 | 预览区抢手势 | 【代码】`react-zoom-pan-pinch` `onPanningStart` 对 pointerdown 调 `preventDefault/stopPropagation`（dist:1506-1516） | 手指在预览上竖滑 → 平移图片而不是滚弹窗，长表单滚不下去 |
| 5 | 复制按钮在手机上不可用 | 【代码】`isCopiable` 用 `navigator.clipboard.write(ClipboardItem)`（`imageFormatTester/index.ts:4-19`） | iOS WKWebView 基本不支持 → 禁用按钮 + 红字「无法直接复制 PNG 格式」白占一行 |
| 6 | 保存文案与实际行为不符 | 【代码】`ModalContent.tsx:506` 显示 `saveVault()`；`capture.ts:110-142` 实际是 Media → 分享面板 → 回退 vault | 用户以为存进 vault，实际弹分享面板 |
| 7 | 文件输入没有 `accept` | 【代码】`Control.tsx:170-175`、`SettingRenderer.ts` fileInput | 手机弹「文件浏览器」而不是「照片图库 / 拍照」 |
| 8 | 无进度、无取消、降倍率无提示 | 【代码】`processing` 只禁用按钮（`ModalContent.tsx:500-510`）；`getEffectiveScale` 只 `console.warn`（`capture.ts:52-54`） | 长笔记导出数秒到十几秒，界面像卡死；图糊了不知道为什么 |
| 9 | 触控目标偏小 | 【代码】动作栏按钮 `margin: 0 32px`（`styles.css:147-149`）；文件行 `padding-top:10px` + 16px checkbox（`299-303`）；设置行 `padding:10px 0` | 手指点不准，误触 |
| 10 | 设置与预览上下堆叠 | 【代码】`styles.css:53-64` ≤1000px 换行；20+ 设置项在预览上方 | 要滚 3-4 屏才看得到预览，等于没有预览 |
| 11 | 底部安全区未留白 | 【代码】`.is-phone .modal` 只处理左右（app.css:574080） | iPhone home indicator 压住动作栏 |
| 12 | 手机端沿用桌面默认参数 | 【代码】`settings-normalize.ts` 全局一份设置 | 3x PNG 长图容易撞 16M px 预算，被迫降倍率 |

## 3. 方案

### M1 布局（P0，必做）

1. **弹窗宽度按平台**：文件导出 `Platform.isPhone ? '100%' : '85vw'`，文件夹导出 `Platform.isPhone ? '100%' : '800px'`；`.is-phone .export-image-modal` 去掉外阴影/圆角，贴底抽屉。
2. **图片选择弹窗手机版单列**：预览在上 160px、列表在下，列表项 44px 行高 + 省略号；桌面保持两栏。
3. **头像控件行 `flex-wrap: wrap`**：按钮组单独一行；不改交互结构（URL 仍可直接点）。
4. **预览手势**：手机上 `panning={{ disabled: true }}`，保留 pinch 与双击复位；`.export-image-preview-out { touch-action: pan-y }`，竖向滑动交还弹窗。

### M2 操作流（P1，决定好不好用）

5. **手机端导出弹窗改 tab**：「设置 / 预览」两个 tab，各占满可用高度（推荐；比「预览置顶 40vh」省空间，也不用滚）。
6. **动作栏手机版**：两个按钮 `flex:1`、高 44px、间距 8px；`Platform.isPhone` 时隐藏复制按钮。
7. **输入控件**：文件输入加 `accept="image/*"`；数字输入加 `inputmode="decimal"`；手机端设置行 `min-height: 44px`。
8. **保存文案与回执**：手机端按钮改「保存 / 分享」；成功后 Notice 附「在文件列表中显示」（`app.showInFolder` / `openLinkText`），相册路径保留现有分享面板文案。
9. **导出反馈**：遮罩 + 阶段进度（渲染 → 截图 → 保存）+ 取消按钮（`processing` 标志位，取消后丢弃结果）；文件夹导出复用现有进度条。
10. **降倍率提示**：`getEffectiveScale` 触发时 `new Notice('已按设备内存降到 {n}x')`，只提示一次。

### M3 打磨（P2）

11. 底部安全区：`padding-bottom: calc(16px + env(safe-area-inset-bottom))`。
12. 手机端设置项字号 14 → 15px、行高 28 → 32px。
13. 图片选择列表加 40px 缩略图（现在是纯路径）。
14. 移动端 ribbon 入口「导出当前笔记为图片」（手机没有右键菜单，命令面板之外多一个入口）。
15. 移动端默认 2x + JPEG（单独记忆，或首次启动按平台给默认值）。
16. 文件夹导出在手机上会逐张弹分享面板：改为先打包进 vault 再提示，或单次限制 ≤10 张。

## 4. 验收

- iPhone 真机：选图单列可用；头像行不溢出；弹窗全宽；预览不抢滚动；tab 切换；保存走分享面板且能在相册找到；长笔记有进度可取消；降倍率有提示。
- 桌面回归：≥1001px 与 v2.4.10 一致；`pnpm test` 全绿。
- 不引入新依赖，手势只用 `react-zoom-pan-pinch` 现有配置。

## 5. 待拍板

| # | 决策 | 建议 |
|---|---|---|
| 1 | 手机端设置/预览：tab 还是上下堆叠+预览置顶 | **tab**（各占满屏，少滚动） |
| 2 | 手机端是否单独记忆默认分辨率/格式 | **是，2x + JPEG**（省内存和体积） |
| 3 | 是否加移动端 ribbon 入口 | **加**（手机没有右键菜单） |
