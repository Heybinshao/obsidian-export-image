# 代码块基线

```ts
export async function exportImage(app: App, markdown: string) {
  const host = await renderMarkdownHost(app, markdown, 'note.md', 640);
  return host;
}
```

```python
def normalize_settings(raw: dict) -> dict:
    return {"width": raw.get("width", 640), "padding": {"top": 6}}
```

超长行：

```text
this_is_a_very_long_line_that_should_wrap_or_scroll_without_being_cut_off_in_the_exported_image_0123456789
```
