# 可迭代优化方向

> 基于 2026-10-27 的 fork 版本（Obsidian 1.15.0 / Pele）。按「现在就能做 → 需要重构 → 长期」排序。

## P0：先验证，再谈优化

| 方向 | 现状 | 下一步 |
|---|---|---|
| Pele 真机矩阵 | 代码已按导出宽度重挂载、清 `.pele-zoom`、等字体；尚未在 1.15.0 主库逐图验收 | 用 6 类 Pele 图 + 明暗两套导出，记录图宽/字号/是否裁切 |
| 手机端保存 | 已加 canvas 面积预算 + Media/share sheet 回退；相册写入依赖 Capacitor Media 插件，Obsidian 公共 API 没有直接写相册的方法 | 在 iPhone/iPad 实测：分享面板能否「存储图像」；确认是否要内置原生插件 |
| 设置持久化 | 弹窗内改动 400ms 防抖写回 `data.json`；设置页原本就会保存 | 改宽度/边距/水印后重启 Obsidian，确认值还在 |

## P1：直接影响成品质量

1. **拆分语义化**：现在按像素/`hr` 切，标题可能落在页尾。改成「标题/表格表头/callout 标题 keep-with-next」，并支持手动 `<!-- export-break -->` 标记。工作量小，收益直接。
2. **图片管线**：已从 vault 读原图；下一步处理外链图（缓存、超时、失败占位）、`srcset`、超大图降采样，以及导出后释放 data URL 内存。
3. **字体策略**：已按 family/weight 过滤并跳过桌面 `local()`；下一步给「字体未安装」一个明确 fallback，避免移动端把 32MB base64 全塞进 SVG。
4. **PDF 质量**：已改 PNG 入页；下一步做页面尺寸/方向预设、页边距、可选页码，长期可考虑 PDF 文字层（当前是位图）。
5. **长文性能**：已做单次栅格化 + 裁页；下一步把 clone/style 计算放进 Worker 或分块，给导出加进度与取消。
6. **错误可观测性**：目前失败只有 Notice。加 dev-only 诊断面板：渲染耗时、SVG 字节、canvas 像素、失败节点、Pele 版本。

## P2：架构与长期

7. **渲染器抽象**：把 `dom-to-image` 封装成 `SnapshotRenderer` 接口，基准对比 `modern-screenshot`/`snapdom`；只有像素、体积、耗时全面胜出才换。
8. **核心与 Obsidian 解耦**：`renderHost`/`capture`/`split` 已接近纯函数；下一步把 Obsidian 适配层独立，核心可用 happy-dom 做 golden test，不依赖真机。
9. **设置模型**：现在是 `ISettings` + 手写 normalize。改成 schema（默认值/范围/迁移版本），支持导入导出 JSON、按 vault 覆盖、预设（按输出场景分档）。
10. **兼容矩阵**：Pele、Bases、Dataview/SQLSeal、Excalidraw、Canvas、嵌入笔记、主题 callout；每个维度至少一个 fixture。
11. **移动端专用路径**：后台导出队列、App 切后台后续跑、失败重试、默认 2x/JPEG 以控制体积；分享面板作为相册的可用替代。
12. **发布与归属**：决定是否上架社区插件；上架需新 id、迁移脚本、MIT NOTICE、更新通道；自用则保留现 id，避免设置丢失。

## 不建议现在做

- 重写整个渲染器（先把 Pele/手机端真机问题收干净）。
- 引入完整 Mermaid 运行时（Obsidian 1.15 已用 Pele，重复打包会增大体积且和宿主版本打架）。
- 做云端导出（用户资料在本机，云端方案已排除）。
