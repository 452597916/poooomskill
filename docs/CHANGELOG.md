# PoooomSkill · 更新日志

本文档记录 PoooomSkill 的全部版本改动。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [1.2.1] — 2026-10-27

**一句话：体验修复版本。修掉收藏丢备注的严重 bug，收藏/置顶换线性图标，小尺寸图标改为简化旋窝，安装支持自定义路径。**

### 🐛 Bug 修复

- **点收藏/置顶后中文备注名丢失**：`saveNote` 的参数默认值 `alias = ''` 让部分更新（只传 favorite/pinned）把已有备注顶成空串；改为字段为 `undefined` 时保留旧值，显式传 `''` 才算主动清空
- **托盘 / 任务栏图标显示为字母「P」**：上一版把 ≤32px 改成了「紫圆+字母 P」，丢失了 logo 形态。现重新设计 `brand/mark-small.svg` 为**粗线条简化旋窝**（紫底圆角方块 + 三条 120° 旋转白弧 + 中心白点），16px 下也可辨识；非透明覆盖率从 ~75% 提到 ~97%
- **收藏 / 置顶图标不清晰**：换掉 emoji 回退图标，统一为描边式线性 SVG（抽 `components/ui/icons.tsx` 的 `IconStar` / `IconPin` 共用，列表行与详情页一致）
- **安装包不能自定义安装路径**：`installer.iss` 增加 `DisableDirPage=no`，强制显示目录选择页（默认仍为 `%LOCALAPPDATA%\Programs`）

### 🎨 视觉微调

- 列表与详情页中「来源 Badge」（如 `Claude Code / Codex / …`）去掉加粗；真实技能名（fqn）保持加粗不变

---

## [1.2.0] — 2026-10-27

**一句话：可扩展版本。标签、暗色模式、全局快捷键、版本差异对比、CLI、MCP Server、4 家新客户端。**

### 🎉 新功能

- **标签（多对多）**：详情页给技能挂多个标签（`#前端` `#高频`），列表顶部按标签筛选，批量栏可给选中项一次打标；支持重命名 / 彻底删除标签
- **暗色模式**：右上角按钮在「跟随系统 → 浅色 → 深色」之间循环，选择存 localStorage；首屏内联脚本避免暗色下白屏闪烁。所有 `bg-white` 收敛为语义色 `bg-card`，组件无需感知主题
- **全局快捷键 Ctrl+K**：C# 启动器注册系统级热键（被占用时依次退到 Ctrl+Alt+K → Ctrl+Shift+K → Ctrl+Alt+P），按下即唤醒界面；界面内 Ctrl+K 聚焦搜索框
- **版本差异对比**：`GET /api/skill/diff?fqn=` 对比同一技能的所有副本，详情页展开为行级 diff（+新增 / -删除 / 折叠相同行）
- **CLI 工具** `server/cli.mjs`：`list` / `find` / `code` / `trigger` / `stats` / `groups` / `tags` / `open`，支持 `--json`，可直接脚本化
- **MCP Server** `server/mcp.mjs`：零依赖 stdio JSON-RPC，提供 `list_skills` / `find_skill` / `get_skill` / `skill_stats` 四个工具，Claude Code / Cursor / Trae / Gemini CLI / Qwen Code 均可接入
- **新增 4 家客户端**：Cursor（`~/.cursor/skills`，钩子 `beforeToolUse` / `sessionStart`）、Windsurf（`~/.windsurf/skills`）、Gemini CLI（`~/.gemini/skills`）、Qwen Code（`~/.qwen/skills`）

### 🔌 新增 API

| 方法 | 路径 | 作用 |
|------|------|------|
| GET  | `/api/skill/diff?fqn=xxx` | 副本行级差异 |
| POST | `/api/tag` | 覆盖式设置标签 |
| POST | `/api/tag/add` / `remove` | 增删单个标签 |
| POST | `/api/tag/batch` | 批量打标 |
| POST | `/api/tag/rename` / `drop` | 全库重命名 / 删除标签 |

### 🗄️ 数据库迁移

- 新增 `tag(fqn, tag, created_at)` 表，主键 `(fqn, tag)`，自动建表并建索引，老库无需手动处理

### 🧩 新增/改动组件

- `components/ui/theme-toggle.tsx` — 三态主题切换（cva）
- `components/SkillDetail.tsx` — 新增标签区、版本差异区、暗色适配
- `SkillRow.tsx` — 分组列下方展示标签胶囊
- `App.tsx` — 标签筛选行、批量打标、Ctrl+K、ThemeToggle

### 🐛 修复

- `/api/skill/diff` 曾被 `/api/skill` 前缀判断吞掉（导致 400）；改为精确匹配 `url === '/api/skill'`
- 技能合并逻辑抽到 `server/lib/library.mjs`，服务端 / CLI / MCP 三处共用一份，避免逻辑漂移

### 📚 文档

- 新增 `docs/版本功能说明.md` v1.2.0 段落、CLI/MCP 使用说明
- 更新 `docs/产品介绍.md`、`README.md` 的版本号与命令示例（`/sd-` → `/ps-`）

---

## [1.1.0] — 2026-10-27

**一句话：功能增量版本。详情页、收藏/置顶、批量清理、点击复制、小尺寸图标修复。**

### 🎉 新功能

- **技能详情页**：点击列表行「详情」或双击行 → 弹出模态，展示完整 SKILL.md 全文、所有副本路径、作者、调用统计（按 agent 细分）。详情页内可直接编辑中文名、用法、分组、切换收藏/置顶、物理删除全部副本
- **收藏 ⭐ / 置顶 📌**：每行右侧两个图标按钮切换状态。置顶的永远排最前，收藏的可单独筛选
- **彻底清理本地副本**：详情页底部「🗑 彻底清理」一键物理删除本机所有副本 SKILL.md，并顺手删空相关目录
- **批量删除**：每行首 checkbox，全选表头；选中数量 > 0 时顶部出现红色批量栏，二次确认后批量物理删除
- **点击复制**：暗号 badge（如 `【前端设计】`）和斜杠命令 badge（如 `/ps-qdsj`）点击即复制到剪贴板，带「已复制」提示
- **调用次数按 agent 细分**：详情页统计区现在显示每个 agent（如 Trae CN、Claude Code）的独立调用次数

### 🎨 视觉改进

- **主色改为 #8b5cf6**（紫色），与 Logo 渐变色一致；原来的青绿色 `#0f6b5c` 已移除
- **真实技能名 + 来源加粗**：列表中 fqn 和来源 Badge 现在都是 font-bold，一眼区分"备注名"和"真名"
- **小尺寸图标修复**：16/24/32px 改用 `brand/mark-small.svg`（紫色圆 + 白色字母 P），完整旋窝只在 48px+ 保留。托盘图标终于清晰可辨

### ⚙️ 硬命令前缀变更

- 自动生成的斜杠命令前缀从 `/sd-` 改为 `/ps-`（P = Poooom）。例："前端设计" → `/ps-qdsj`
- **影响**：旧的 `/sd-xxx` 命令仍在你机器上，但不会被新钩子识别。迁移步骤：点一次「生成并写入」即可
- 手动填的短命令（codeManual）不受影响

### 🗄️ 数据库迁移

- `note` 表新增 `favorite INTEGER DEFAULT 0` 和 `pinned INTEGER DEFAULT 0` 列，自动 `ALTER TABLE ADD COLUMN`
- `invocation` 表结构不变
- 调用统计查询现在返回每个 fqn 下的 `byAgent` 明细

### 🔌 新增 API

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/api/note/toggle-favorite` | 切换收藏 |
| POST | `/api/note/toggle-pinned` | 切换置顶 |
| GET  | `/api/skill?fqn=xxx` | 返回技能详情 + 完整 SKILL.md 内容 |
| POST | `/api/delete` | 物理删除一个技能的所有副本 |
| POST | `/api/batch-delete` | 批量物理删除多个技能 |

### 🧩 新增前端组件

- `components/ui/modal.tsx` — cva 管理的模态框基础组件
- `components/SkillDetail.tsx` — 技能详情模态
- `components/SkillRow.tsx` — 重写：新增 checkbox / 收藏 / 置顶 / 详情 / 点击复制

### 🐛 Bug 修复

- `stats()` 查询可能在某些 SQLite 版本上返回 null 而不是 0 → 全部 `COALESCE` 兜底
- `scanAll()` 只返回 samplePath → 现在返回 `absPaths`（所有绝对路径数组），物理删除终于能删干净

### 📚 文档

- 新增 `docs/版本功能说明.md` — 面向用户和 GitHub 访客
- 新增 `docs/CHANGELOG.md` — 本文档
- 更新 `docs/产品介绍.md` 版本号 1.0.0 → 1.1.0

---

## [1.0.0] — 2026-10-24

**初版。本地 AI 技能管理台的第一次发布。**

### 功能

- 扫描 Claude Code / Trae CN / Codex / 共享目录的 SKILL.md
- 全限定名归并跨客户端副本
- SQLite 持久化：中文备注名、一句话用法、分组、斜杠命令
- 自动生成暗号钩子（`【xxx】`）、斜杠短命令（`/sd-xxx`）、中文解析技能
- 真实调用计数（钩子脚本写入 `pending-invocations.jsonl`）
- 顶部标签页：技能库 / 使用统计 / 接入与同步
- 一键「生成并写入」+ 一键「撤销全部」，写入前自动备份各客户端配置
- Windows 托盘、开机自启命令行选项、安装程序

### 技术

- Node 22（无第三方运行时依赖）+ SQLite（`node:sqlite`）
- React 18 + TypeScript 5 + Tailwind CSS 4 + Vite 6 + cva
- pinyin-pro 做中文拼音首字母
- C# 启动器（托盘 + 窗口管理）+ Inno Setup 安装包

---

## 未来版本 · 规划中

按优先级排序（待社区反馈确认）：

| 方向 | 说明 |
|------|------|
| **Cursor / Windsurf / Gemini CLI 接入** | 调研各家技能目录和钩子方言，在 `server/lib/config.mjs` 按 `AGENTS` 结构加条目 |
| **技能标签**（比分组更灵活） | 一个技能可以有多个标签，跨分组筛选 |
| **别名表导入 / 导出** | `export.json` / `import.json`，方便团队共享 |
| **英文界面 + 英文文档** | 面向海外用户 |
| **快捷键** | 如 Ctrl+K 快速搜索、Ctrl+D 打开详情 |
| **暗色模式** | `prefers-color-scheme` 自动跟随 |
| **技能版本差异对比** | 多版本时 diff 显示差异 |
| **macOS 首发** | 数据目录、托盘、打包链路都要 macOS 实现 |

---

*changelog 维护者：万智云集 · contact@poooom.com · https://poooom.com*
