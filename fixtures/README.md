# Fixture vault

用于手工验收导出效果的最小 vault。它不包含你的主库配置，也不应该被 Obsidian 同步。

## 打开

1. `pnpm build`
2. `./fixtures/install-plugin.sh`
3. Obsidian → Open folder as vault → 选择 `fixtures/vault`
4. 对每篇笔记执行 `Export as image`，重点看：
   - `01-cjk`：中文断行、标点、列表缩进
   - `02-table`：宽表、公式、右边界
   - `03-callout`：图标、折叠 callout
   - `05-mermaid`：Pele 图宽、字号、是否带缩放按钮
   - `06-images`：内嵌 SVG 清晰度
   - `07-embed`：嵌入笔记/标题/块
   - `08-long`：长文高度、截断
   - `10-split`：hr 分割是否拆标题
   - `11-code`：超长行是否被截断

## 注意

- 这个 vault 的 `.obsidian/plugins/` 被 gitignore，插件产物不提交。
- 如果要测暗色，在 Obsidian 里切到 dark 再重复导出；不要改 fixture 内容。
