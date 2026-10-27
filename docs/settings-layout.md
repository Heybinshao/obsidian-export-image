# 导出设置界面规划

> 目标：分组清晰、默认值可预期、设置改动即时反映到导出预览；不因调设置重新渲染整篇 Markdown。
> 范围：插件设置页（`formConfig.ts`）与导出弹窗（`file/ModalContent.tsx`、`folder/ModalContent.tsx`）。

## 1. 分组逻辑与顺序

顺序按「先决定输出，再决定内容，最后决定装饰」排列：

| 顺序 | 分组 | 解决的问题 | 说明 |
|---|---|---|---|
| 1 | 基础输出 | 导出成什么 | 宽度、清晰度、格式、快速导出 |
| 2 | 主题 | 导出图什么配色 | 跟随主题 / 浅色 / 深色 |
| 3 | 版式与边距 | 画布留白 | 上下左右边距，默认 50 |
| 4 | 内容信息 | 哪些笔记信息进入图片 | 剔除笔记信息、文件名、笔记属性 |
| 5 | 表格 | 超宽表格怎么处理 | 强制换行开关，默认关闭 |
| 6 | 长图分割 | 超长笔记怎么拆 | 分割模式、高度、重叠 |
| 7 | 作者信息 | 署名区 | 头像、名称、备注、对齐、位置 |
| 8 | 水印 | 版权/防搬运 | 文字或图片水印 |

分组理由：

- **基础输出放最前**：宽度、分辨率、格式是每次导出最先确认的项。
- **主题紧跟基础输出**：它决定整张图的底色与文字色，比边距更早影响观感。
- **版式与内容分开**：边距是「画布」属性，文件名/属性是「内容」属性，避免混在一起。
- **表格单独成组**：它不是通用排版项，而是「超宽表格」的特例，独立分组更容易找到。
- **长图分割放中段**：属于高级输出形态，放在内容之后、装饰之前。
- **作者信息与水印放最后**：属于品牌/版权装饰，不改也能导出。

## 2. 设置项总表

类型：开关 = toggle，数值 = number，下拉 = select，文本 = text，颜色 = color，文件 = file。

| 分组 | 设置项 | 字段 | 类型 | 默认值 | 作用域/显示条件 |
|---|---|---|---|---|---|
| 基础输出 | 图片宽度 | `width` | 数值 | `640` | 设置页 + 导出弹窗 |
| 基础输出 | 分辨率 | `resolutionMode` | 下拉 | `3x` | 设置页 + 导出弹窗；可选 1x/2x/3x/4x |
| 基础输出 | 文件格式 | `format` | 下拉 | `png0` | 仅设置页；导出弹窗沿用当前值 |
| 基础输出 | 快速导出选中内容 | `quickExportSelection` | 开关 | `false` | 仅设置页 |
| 主题 | 导出主题 | `themeMode` | 下拉 | `follow` | 设置页 + 导出弹窗 + 文件夹导出；可选 跟随主题 / 浅色 / 深色 |
| 版式与边距 | 上边距 | `padding.top` | 数值 | `50` | 设置页 + 导出弹窗 |
| 版式与边距 | 右边距 | `padding.right` | 数值 | `50` | 设置页 + 导出弹窗 |
| 版式与边距 | 下边距 | `padding.bottom` | 数值 | `50` | 设置页 + 导出弹窗 |
| 版式与边距 | 左边距 | `padding.left` | 数值 | `50` | 设置页 + 导出弹窗 |
| 内容信息 | 剔除笔记信息 | `stripNoteInfo` | 开关 | `false` | 设置页 + 导出弹窗 + 文件夹导出；开启后强制隐藏文件名与笔记属性 |
| 内容信息 | 包含文件名 | `showFilename` | 开关 | `true` | 设置页 + 导出弹窗 + 文件夹导出；`stripNoteInfo=true` 时隐藏 |
| 内容信息 | 显示笔记属性 | `showMetadata` | 开关 | `false` | 仅设置页；`stripNoteInfo=true` 时隐藏 |
| 表格 | 强制表格换行 | `tableForceWrap` | 开关 | `false` | 设置页 + 导出弹窗 + 文件夹导出 |
| 长图分割 | 分割模式 | `split.mode` | 下拉 | `none` | 设置页 + 导出弹窗；none/fixed/hr/auto |
| 长图分割 | 分割高度 | `split.height` | 数值 | `1000` | 模式为 fixed/auto 时显示 |
| 长图分割 | 重叠高度 | `split.overlap` | 数值 | `80` | 模式为 fixed 时显示 |
| 作者信息 | 显示作者信息 | `authorInfo.show` | 开关 | `false` | 设置页 + 导出弹窗 |
| 作者信息 | 名称 | `authorInfo.name` | 文本 | 空 | 显示作者信息时显示 |
| 作者信息 | 备注 | `authorInfo.remark` | 文本 | 空 | 显示作者信息时显示 |
| 作者信息 | 头像 | `authorInfo.avatar` | 文件 | 空 | 显示作者信息时显示 |
| 作者信息 | 对齐 | `authorInfo.align` | 下拉 | `right` | 显示作者信息时显示 |
| 作者信息 | 位置 | `authorInfo.position` | 下拉 | `bottom` | 显示作者信息时显示 |
| 水印 | 启用水印 | `watermark.enable` | 开关 | `false` | 设置页 + 导出弹窗 |
| 水印 | 类型 | `watermark.type` | 下拉 | `text` | 启用水印时显示 |
| 水印 | 文字内容 | `watermark.text.content` | 文本 | 空 | 类型为 text 时显示 |
| 水印 | 文字颜色 | `watermark.text.color` | 颜色 | `#cccccc` | 类型为 text；仅设置页 |
| 水印 | 字号 | `watermark.text.fontSize` | 数值 | `28` | 类型为 text；仅设置页 |
| 水印 | 图片 | `watermark.image.src` | 文件 | 空 | 类型为 image 时显示 |
| 水印 | 透明度 | `watermark.opacity` | 数值 | `0.2` | 启用水印时显示 |
| 水印 | 旋转 | `watermark.rotate` | 数值 | `30` | 启用水印时显示 |
| 水印 | 水印宽度 | `watermark.width` | 数值 | `120` | 启用水印时显示 |
| 水印 | 水印高度 | `watermark.height` | 数值 | `64` | 启用水印时显示 |
| 水印 | 水平间距 | `watermark.x` | 数值 | `100` | 启用水印时显示；仅设置页 |
| 水印 | 垂直间距 | `watermark.y` | 数值 | `100` | 启用水印时显示；仅设置页 |

## 3. 新增设置的行为

### 3.1 强制表格换行（`tableForceWrap`）

- 默认 `false`：不加任何表格 CSS，保留主题的 `overflow-x` / 不换行行为，超宽表格可以左右滑动。
- `true`：给导出根节点加 `export-image-table-force-wrap`，只在该 class 下生效：
  - `table-layout: fixed`
  - `width: 100%`
  - `th/td { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }`
- 切换只改 class，不重新渲染 Markdown，导出预览即时响应。
- 代价：强制换行会压窄列宽；如果表格列很多，建议同时加大图片宽度或保持关闭。

### 3.2 剔除笔记信息（`stripNoteInfo`）

- 默认 `false`。
- `true` 时导出不渲染文件名（`showFilename`）和笔记属性（`showMetadata`），优先级高于这两个开关；两个子开关在 UI 中隐藏，但原值保留，关掉总开关后恢复。
- 只影响 `Target` 的标题/属性区域，不触碰正文内容，因此不会触发 Markdown 重新渲染。

### 3.3 导出主题（`themeMode`）

- 默认 `follow`：导出图与 Obsidian 当前外观一致，行为同改造前。
- `light` / `dark`：导出图强制使用固定配色，App 界面本身不变。
- 实现方式不是「给导出根节点加 `theme-light`/`theme-dark` 类」——Obsidian 只在 `.theme-light` / `.theme-dark` 上定义基础色板，`--background-primary`、`--text-normal` 这些派生变量声明在 `body` 上并已在 `body` 处求值，嵌套元素加类只会换掉色板，派生的底色和文字色仍然是 App 主题的。
- 实际做法（`src/utils/themeVars.ts`）：同步地把 `body` 临时切到目标主题 → 读取全部自定义属性 → 立刻还原 → 把这些值内联到导出根节点，并补 `color: var(--text-normal)`。切换与读取在同一个任务内完成，浏览器不会绘制中间状态，App 界面无闪烁；根节点同时带 `theme-light`/`theme-dark` 类，让 `.theme-light .callout` 这类选择器规则也命中。
- 缓存按 `body.className + body 内联样式 + html.className` 作为签名，App 主题、强调色或片段变化时自动失效；弹窗打开期间监听 `body` 的 class/style 变化并重新应用。
- 已知边界：只对「通过 CSS 变量着色」的内容完全等价；如果某个主题/片段用 `body.theme-dark .x` 这类选择器直接写死颜色，强制另一主题时仍会走 App 主题那条规则。

## 4. 排版方案

### 4.1 设置页

- 单列纵向排列，分组标题使用 `h4` + 一行灰色说明，标题下加细分隔线。
- 每个设置项保持「左侧名称/说明，右侧控件」的现有结构。
- 分组标题与设置项之间留 24px，组内设置项保持 10px 垂直间距。
- 长列表不折叠：设置页可以滚动，避免折叠造成「找不到项」。

### 4.2 导出弹窗

- 左侧设置栏仍为单列，按同样分组顺序渲染；分组标题字号比设置项名称小一号，避免抢视觉层级。
- 弹窗高度固定为 `--dialog-max-height`（默认 85vh）：左栏在弹窗内独立滚动，右栏预览随窗口高度撑满并保持固定，滚动设置不会把预览带走。
- 预览视口高度由 `ResizeObserver` 实测 `.export-image-preview-out` 得到，窗口缩放自动跟随；不再使用 `Math.min(764, …)` 的硬编码上限。
- 右侧预览不变：宽度/边距/表格/剔除信息都是 CSS 或轻量条件渲染，拖动数值时预览即时变化，不重渲染正文。
- 移动端/窄屏（≤1000px）：保留原来的上下堆叠、整页滚动布局。

### 4.3 阅读模式（所见即所得）响应

- `Target` 的内容克隆只在 `markdownEl` 变化时执行；改宽度、边距、表格开关、剔除信息只更新 React 属性/class，不重新执行 `MarkdownRenderer`。
- 表格开关通过根节点 class 生效；剔除信息通过条件渲染标题/属性块生效。
- 因此保留现有阅读模式的即时预览能力，不引入「改一个设置整篇重排」的卡顿。

## 5. 落地映射

| 文件 | 改动 |
|---|---|
| `src/settingGroups.ts` | 分组定义、排序、`groupForPath` |
| `src/formConfig.ts` | 设置页 schema、新增两项、分组映射、默认 50 |
| `src/components/common/form/FormItems.tsx` | 按分组渲染标题 |
| `src/SettingRenderer.ts` | 设置页按分组渲染标题 |
| `src/components/file/ModalContent.tsx` | 导出弹窗新增两项、分组 |
| `src/components/folder/ModalContent.tsx` | 文件夹导出新增两项、分组 |
| `src/components/common/Target.tsx` | `stripNoteInfo` 条件渲染、`tableForceWrap` 根 class、主题 class 与调色板内联 |
| `src/utils/themeVars.ts` | 读取目标主题调色板并内联到导出根节点（缓存 + `body` 变化监听） |
| `styles.css` | 分组标题、表格强制换行样式 |
| `src/settings-normalize.ts` | 默认值 50、两个新开关默认 false、`themeMode` 默认 `follow` |

## 6. 验收清单

- [ ] 设置页出现 8 个分组标题，顺序为：基础输出 → 主题 → 版式与边距 → 内容信息 → 表格 → 长图分割 → 作者信息 → 水印。
- [ ] 边距四项默认 50，保存后重启仍为 50。
- [ ] 表格强制换行默认关闭；关闭时主题的超宽表格仍可横向滑动；开启后导出图内表格按宽度换行。
- [ ] 剔除笔记信息开启后，导出图不出现文件名与属性块；关闭后恢复原子开关状态。
- [ ] 导出主题为「跟随主题」时与 App 外观一致；切「浅色」/「深色」后预览与导出图立即换色，App 界面本身不变色。
- [ ] 深色 App 中强制浅色，导出图底色为浅色（`--background-primary` 不再是 `#161616` 一类深色值）。
- [ ] 改宽度/边距/表格/剔除信息时，右侧预览即时变化，正文不重新渲染。
- [ ] 导出弹窗与设置页的分组顺序一致。
- [ ] `pnpm test`、`tsc`、`pnpm build` 全绿。
