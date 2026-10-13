# 文章包 schemaVersion 1

一次加载一个 JSON。`examples/article-package.json` 仅用于查看格式，使用保留示例域名，不能直接运行或发布。

| 字段 | 约束 |
|---|---|
| schemaVersion | 1 |
| articleId | 1–100 位字母、数字、横线或下划线；同篇保持稳定 |
| title | 1–64 字符 |
| summary | 字符串，最多 120 字符 |
| source.kind | mdnice-rendered |
| source.url | 实际 https://editor.mdnice.com/ 文章 URL |
| source.theme | 主题名或“当前主题” |
| source.htmlSha256 | UTF-8 原始 html 的 SHA-256 十六进制值 |
| html | 实际导出的 MDnice 富文本；至多 2 MB；不重新用模板渲染 Markdown |
| images | 按正文顺序排列的 1–50 张图片，每项 mdniceUrl；可选 wechatUrl 仅接受 qpic.cn HTTPS 地址 |
| coverIndex | 封面图片在 images 中的下标，从 0 开始 |

所有图片 src 必须与 images 顺序一致。作者、接收人、草稿 ID 和执行指令不能写进包。插件从设置读取身份，启动时固定本次配置。HTML 只允许排版标签与普通 HTTPS 图片/链接，拒绝事件处理器、脚本、iframe、SVG、srcset 和含外部 URL 的 CSS。

有实际 MDnice HTML 导出时可用命令生成包：

```sh
python3 skills/wechat-mdnice-workflow/scripts/build_package.py \
  --html /absolute/article-mdnice.html \
  --source-url 'https://editor.mdnice.com/?outId=YOUR_DOCUMENT_ID' \
  --article-id my-article-001 --title '本篇标题' --summary '本篇摘要' \
  --cover 1 --output /absolute/article-package.json
```

脚本不进行排版、不访问网站、不上传图片、不自动证明 HTML 来源。MDnice 来源由实际导出过程保证；哈希只是完整性校验，不是第三方签名。
