# 微信公众号文章自动流程 · wechat-workflow

可配置 Skill + Chrome 插件，支持 **MDnice 普通文章** 和 **原图纯文本贴图**。一次安装，每篇导入新的文章包；作者、原创作者、预览微信号由使用者在本机配置。正式发表始终由用户完成。

- [下载最新插件](https://github.com/huixuedai-arch/wechat-mdnice-workflow/releases/latest)
- [安装和操作步骤](docs/quickstart.md)
- [贴图素材、打包与恢复](docs/image-text.md)
- [普通文章包协议](docs/article-package.md)
- [wechat-workflow Skill](skills/wechat-workflow/SKILL.md)

## 两种流程

| 类型 | 素材准备 | 保存后 |
| --- | --- | --- |
| 文章 | 真实 MDnice 排版 HTML 与图片 | 刷新核对后发送指定微信号预览 |
| 贴图 | 原始 PNG/JPEG + 标题 + 纯文本正文，无需 MDnice | 刷新核对后预览；只有扫码入口时交付已核验草稿，由用户审核发表 |

每篇保存在 `<输出根目录>/<文章标题>/`。素材 Agent 同时交付 JSON 包；修改素材后由它重新打包，保持 articleId，不要求使用者手改 JSON。`运行步骤.txt` 面向插件使用者。

## 使用

下载 ZIP 解压，Chrome 扩展管理页开启开发者模式，加载包含 `manifest.json` 的文件夹（或本仓库 `extension/`）。打开公众号并新建对应类型的空白编辑页 → 从工具栏打开插件 → 本机设置 → 导入包 → 核对图片 → 主按钮执行。文章可选择封面；贴图首图为封面。

升级覆盖同一目录并重新加载，不卸载。清空文章包保留本机设置、网页草稿、运行历史和防重发记录。诊断运行中也能只读采集，包含私人信息时不要公开提交。

安装 Skill：将 `skills/wechat-workflow/` 复制到宿主技能目录。普通文章打包脚本、贴图打包脚本和参考说明均随 Skill 提供。Skill 不授予网站权限；配置与稿件不提交 Git。

权限仅为 `activeTab`、`scripting`、`storage`、`unlimitedStorage`。插件操作使用者选定页面的 DOM，不读取 Cookie、不调用私有发布接口。发送前写入防重发记录；`preview-unknown` 禁止自动重发。`draft-ready` 表示草稿已保存核对、待人工审核，不能当作已发送。

## 验证范围

普通文章流程已有真实预览收件记录。本次贴图实站完成 10 张图片、标题正文导入及保存刷新核验；用户看到二维码，转为草稿人工审核发表，没有确认微信号收件。1.9.5 的二维码结束状态通过本地浏览器测试。未宣称所有账号和未来微信界面均已验证。

```sh
npm install
npm test
npx playwright install chromium
npm run test:popup
npm run test:newspic
npm run test:feedback
npm run test:prosemirror
```

可用 `CHROME_PATH` 指定本机 Chrome。测试使用隔离本地页面，不登录公众号或发送真实消息。
