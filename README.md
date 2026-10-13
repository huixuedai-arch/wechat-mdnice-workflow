# WeChat MDnice Workflow

公众号工作流 Skill：MDnice 排版 → 署名和文字原创 → 草稿保存核对 → 指定微信预览。正式发表由人完成。

## 安装和配置
将 skills/wechat-mdnice-workflow 复制到你的技能目录。首次使用时助手收集作者、原创作者、预览微信号和保存目录；也可由开发者配置：

```sh
python3 skills/wechat-mdnice-workflow/scripts/profile.py --author "你的署名" --recipient "你的微信号" --output-root "/你的文章目录" --original enabled
```

原创作者默认与署名一致，可用 --original-author 单独设置。配置只存本机，不上传仓库。对于转载等不适合声明原创的文章，使用 disabled 或在当篇明确覆盖。

## 日常使用
“用这个 Skill 处理这篇文章，先经过 MDnice，保存核对后发预览，发表我自己来。”
局部操作：“只改两个作者并保存，不发预览。”或“只读核对原创设置。”

## 当前交付范围
本仓库提供 Skill、配置脚本和交互设计。需要宿主具备允许访问相关站点的浏览器执行能力。Skill 不是浏览器扩展，也不授予网站权限。专用案例插件尚未通用化，未包含在本仓库；不能直接把本包当作 Chrome 扩展加载。通用插件设计见 Skill 的 references/interaction.md。

不包含实际文章、图片、作者、接收人、草稿 ID、MDnice 文档 ID、登录信息或用户诊断。使用者运行时产生的数据只存本地。未公开发表任何文章。
