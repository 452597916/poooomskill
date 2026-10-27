# 参与贡献 · PoooomSkill

感谢你愿意为 PoooomSkill 出一分力。这篇文档告诉你：怎么提问题、怎么提需求、怎么改代码。

---

## 我能帮什么忙？

| 你会什么 | 可以做的事 |
|---------|-----------|
| 会用这个工具 | 提 bug、提需求、分享你的用法截图 |
| 会写文档 | 翻译 README、补充使用教程、写 FAQ |
| 会前端（React/TS/Tailwind） | 界面改进、新组件、暗色模式细节 |
| 会 Node.js | 服务端 API、新客户端接入、CLI/MCP 增强 |
| 会 C# | 启动器（托盘、热键、安装行为） |
| 会设计 | 图标、品牌图、界面视觉 |
| 会 macOS/Linux | 移植启动器与打包链路（目前只发 Windows） |

---

## 提 Bug

到 [Issues](https://github.com/452597916/poooomskill/issues) 点 **New Issue → Bug 报告**，按模板填：

- 你装了什么版本（界面右上角能看到）
- 在哪个客户端里出的问题（Claude Code / Trae CN / Codex / Cursor / …）
- 怎么操作出现的（步骤越细越好）
- 附上日志文件：`%APPDATA%\PoooomSkill\poooomskill.log`

**不要**把包含你本机路径或技能内容的完整日志直接贴公开区，挑相关几行即可。

## 提需求

到 [Issues](https://github.com/452597916/poooomskill/issues) 点 **New Issue → 功能建议**，描述：

- 你想解决什么痛点（而不是"建议加 XX 功能"）
- 你期望的用法是什么

先提 Issue 讨论再动手写代码，避免方向偏差白费力。

## 提代码（PR）

### 流程

```
Fork 本仓库
  ↓
克隆到本地 → 开分支（如 fix/收藏丢备注 或 feat/标签批量）
  ↓
改代码 → npm run check -- --api 全绿
  ↓
推到你的 Fork → 回主仓库提 PR
```

### 分支命名

- `fix/xxx` — bug 修复
- `feat/xxx` — 新功能
- `docs/xxx` — 纯文档
- `refactor/xxx` — 重构（不改行为）

### 提交信息

格式：`类型: 中文一句话`，类型从 `fix/feat/docs/refactor/ci/build` 里选。

```
fix: 收藏时保留已有中文备注
feat: 详情页加版本差异对比
docs: README 补 MCP 接入示例
```

### 代码规范（重要）

- **前端组件样式必须用 cva 管理变体**，禁止在 JSX 里写长串 className
- 重复出现 2 次以上的样式组合 → 抽成 `components/ui/` 下的独立组件
- 服务端零第三方运行时依赖（只用 Node 标准库），新加依赖需要先在 Issue 里讨论
- 中文注释 + 中文提交信息 + 中文文档

### 自检命令

```powershell
npm install
npm run typecheck        # TS 类型检查
npm run build            # 前端构建
npm run check -- --api   # 全局自检（含接口实测）
```

三条全绿再提 PR。CI 会在 Windows 上重跑这些 + 打包演练，红了的 PR 不会合入。

---

## 代码所有权

- 合并进来的代码按 [MIT](../LICENSE) 授权
- 品牌名称「PoooomSkill / 万智云集」与 Logo 不在 MIT 范围内，请勿用于衍生发行版的名义

## 交流渠道

- **Issue**：bug 与具体功能
- **Discussions**：用法讨论、想法碰撞、求助
- **邮件**：contact@poooom.com（慢，但一定会回）

---

*万智云集 · https://poooom.com*
