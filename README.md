# PoooomSkill · 本地 AI 技能管理台

> 万智云集 · <https://poooom.com> · contact@poooom.com
> Copyright © 2026 万智云集

把散落在各个 AI 客户端里的技能（SKILL.md）集中管起来：扫描本机全部技能、用中文备注与分组，
再通过「暗号」「斜杠短码」「中文自然语言」三种方式在自己的习惯语言里直接调用，
同时记录**真实调用次数**（不是安装量）。

覆盖 **Claude Code / Trae CN / Codex / Cursor / Windsurf / Gemini CLI / Qwen Code**，另附 `~/.agents/skills` 共享目录。
全离线运行，只监听 `127.0.0.1`，数据只存在本机。

> 想先了解"这是什么、给谁用、为什么开源"？见 **[产品介绍](docs/产品介绍.md)**（也适合直接用作发布说明）。

---

## 一、安装（普通用户）

运行 `release\PoooomSkill-Setup-1.2.1-x64.exe`（或到 [GitHub Releases](https://github.com/poooom/poooomskill/releases) 下载最新版）：

- **按用户安装**到 `%LOCALAPPDATA%\Programs\PoooomSkill`，**不需要管理员权限、不弹 UAC**
- 自动创建开始菜单快捷方式（可选桌面图标、可选开机自启）
- 在「设置 → 应用」中登记为 **PoooomSkill（万智云集）**，可正常卸载
- 卸载会自动清理写入各 agent 的技能与钩子条目，**但保留你的中文备注与统计**

安装后的运行方式：

- **单实例**：程序只允许运行一个。重复双击图标不会多开，只会把已有窗口调到前台
- **托盘常驻**：关闭窗口 = 收起到右下角托盘（调用统计继续记录）；
  双击托盘图标重新打开界面，右键托盘可「打开数据目录 / 退出 PoooomSkill」
- **开机自启**（可选）：以 `--tray` 静默启动，登录后直接驻留托盘，不弹窗口
- 升级安装或卸载时，安装程序会先把托盘实例完整停掉，不会出现文件占用

> 未做 Authenticode 数字签名，首次运行 SmartScreen 可能提示「未知发布者」。
> 用 `release\*.sha256.txt` 里的 SHA-256 核对文件即可确认未被篡改。

## 二、日常使用

1. 打开「技能库」，给常用技能填 **中文备注名**、**一句话用法**、**分组**
   （短命令按拼音自动生成，如「前端设计」→ `/ps-qdsj`，可手改）
2. 点右上 **生成并写入**
3. 在 agent 里三选一：

| 方式 | 写法 | 确定性 |
| --- | --- | --- |
| **暗号**（三家通用） | `【前端设计】帮我把这个页面重做一版` | 钩子程序识别，极高 |
| **斜杠短码**（Claude Code） | `/ps-qdsj 帮我…` | 程序解析，100% |
| **中文自然语言**（三家通用） | `用界面打磨帮我看看这个页面` | 取决于模型 |

**搜索**：技能库顶部搜索框支持中文名、拼音首字母（`qdsj`）、短命令（`sd-qdsj`）、真名、分组与描述，
结果数实时显示。

**扫描时机**：技能清单只在**每次启动**与**手动点「重新扫描」**时更新，
平时切换标签、窗口从托盘恢复都不会重扫磁盘；右上角会显示上次扫描时间。

一条消息可点多个暗号：`先【界面规范查】审一遍，再用【深度调研】查同行做法`。
暗号可自定义（界面里可选 `【】《》「」：` 或自行填写）。

### 生效条件

- **Trae CN**：必须重启一次才会读到新技能与钩子
- **Codex**：首次触发钩子要在 `/hooks` 里点一次信任
- **Claude Code**：会话内热加载，改完即用
- 想让 Trae 也认 `.agents` 目录：设置 → 技能与命令 → 导入设置 → 打开「启用 .agents 技能目录」

## 三、数据与安全

| 内容 | 位置 |
| --- | --- |
| 中文备注、分组、调用记录（SQLite） | `%APPDATA%\PoooomSkill\poooomskill.db` |
| 生成的产物（别名技能、命令、钩子、对照表） | `%APPDATA%\PoooomSkill\generated\` |
| 运行日志 | `%APPDATA%\PoooomSkill\poooomskill.log` |
| 写入清单（供撤销用） | `%APPDATA%\PoooomSkill\manifest.json` |

- 不联网、不上传任何数据；所有读写都在本机
- 改任何第三方配置前**先备份**（`*.poooomskill-bak-*`），只动自己那几条钩子
- 界面「接入与同步」里的 **一键撤销** 可完整回滚
- 旧版 `%APPDATA%\SkillDock` 的数据会在首次启动时**自动迁移**，备注不丢

## 四、从源码运行 / 参与开发

```powershell
npm install
npm run build        # 构建前端界面
npm start            # 启动服务 → http://127.0.0.1:5273
```

| 命令 | 作用 |
| --- | --- |
| `npm run check` | 全局自检（文件、语法、品牌名、产物生成、钩子行为）；加 `-- --api` 连接口一起测 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run icon` | 由 `brand/icon-source.png` 生成多尺寸 `icon.ico` 与 favicon |
| `npm run dist:runtime` | 编译 C# 启动器、暂存安装内容到 `build/staging` |
| `npm run dist:installer` | 一键出安装包（类型检查 → 构建 → 图标 → 启动器 → Inno Setup → SHA-256） |
| `npm run cli` | 命令行查技能（list / find / code / trigger / stats） |
| `npm run mcp` | 启动 MCP Server（stdio，供其他 agent 接入技能库） |

### 目录结构

```
server/           本地服务（Node，无第三方运行时依赖）
  index.mjs       入口：HTTP 接口、CLI（--open/--status/--stop/--uninstall）
  lib/config.mjs  路径与产品信息、各家 agent 接入面、旧数据迁移
  lib/scan.mjs    扫描各客户端技能目录并按全限定名归并
  lib/store.mjs   SQLite 存储（备注 + 调用记录）
  lib/generate.mjs 产物生成：斜杠命令 / 解析技能 / 两个钩子 / 对照表
  lib/pinyin.mjs  中文备注名 → ASCII 短码
  lib/library.mjs 扫描结果 + 备注 + 标签合并（服务端/CLI/MCP 共用）
  lib/diff.mjs    行级 diff（LCS），用于副本差异对比
  cli.mjs         命令行工具（不开界面也能查技能）
  mcp.mjs         MCP stdio server（零依赖 JSON-RPC）
src/              React + TypeScript + Tailwind + cva 组件层
build/            打包工具链
  launcher.cs     C# 启动器（GUI 子系统、单实例互斥、系统托盘、全局热键、原始字节转发 stdio）
  installer.iss   Inno Setup 安装脚本
  make-icon.mjs   PNG 解码 + 面积平均降采样 → 多尺寸 ICO
  make-wizard-images.mjs  纯代码合成安装向导图片（BMP）
  prepare-runtime.mjs 暂存 + 编译启动器
  check.mjs       全局自检
.github/workflows/  CI（推送时构建+自检+演练打包）与 Release（打 tag 自动出安装包）
brand/            品牌标记（取自主站 logo-cn-white.svg）
```

### 打包架构

安装后目录：`PoooomSkill.exe`（C# 启动器，GUI 子系统无黑框）+ `runtime\node.exe` + `server\` + `dist\`。

- 启动器负责把用户与内置 Node 隔开，并注入 `POOOOMSKILL_LAUNCHER` 让应用识别自己处于安装态
- **单实例**：启动器持有一个命名互斥量；第二次双击只通过命名事件请已有实例把窗口调到前台
- **托盘**：窗口生命周期由启动器管理——关窗后显示托盘图标，服务继续在后台记录统计；
  「退出」会先停服务再关窗口；开机自启走 `--tray` 静默驻留
  （安装程序与 `--stop` 通过命名事件 + `launcher.pid` 等待托盘实例完整退出，避免升级时文件占用）
- agent 钩子通过 `PoooomSkill.exe --run-script <脚本> <agent>` 调起，**不依赖系统是否装了 Node**，
  也不会闪命令行窗口；stdout 以原始字节转发，保证返回给 agent 的 JSON 一字不差
- 源码态（`npm start`）不启动托盘，保持「跑完即关」的开发习惯

## 五、已知边界

- **平台**：当前只发布 Windows 10/11（x64）。应用逻辑本身是跨平台的（Node + React），
  但启动器（C#）、安装包（Inno Setup）、图标（.ico）、数据目录（`%APPDATA%`）与开窗逻辑是
  Windows 实现；macOS 需要替换这几处后再打包。欢迎 PR
- **数字签名**：未签名，SmartScreen 会提示未知发布者；企业分发建议自购证书后用 `signtool` 签名
- **斜杠短码**只在 Claude Code 生效（其余两家无全局命令目录，官方也未提供）
- **Codex** 的 `PreToolUse` 用正则 `.*[Ss]kill.*` 匹配技能类工具；若某版本工具名不含 skill，
  改写那条会退化，但「暗号」那条仍然有效
- 暗号里必须**正好等于**某个备注名（或真名、短码）才触发；`【明天下午三点】开会` 这类完全不干预
- 别名表会进入模型上下文（约 1–2k tokens），建议只给常用技能起名字（当前 78 个约 1.1k tokens）
- 技能是不可信第三方内容，安装前请自行审阅（界面里能看到路径与英文原文）

## 六、开源许可与参与贡献

本项目以 **MIT 许可证**开源，见 [LICENSE](LICENSE)。你可以自由使用、修改、再分发
（包括商用），保留版权与许可声明即可。

- 内置的 Node.js 运行时按其自身许可证分发（见 `build/LICENSE-node.txt`），
  其余第三方组件的许可证见打包产物里的 `THIRD-PARTY-NOTICES.txt`
- 品牌名称「PoooomSkill / 万智云集」与 Logo 不在 MIT 授权范围内，请勿用于衍生发行版的名义
- 贡献流程：Fork → 开分支 → 改代码 → `npm run check -- --api` 全绿 → 提 PR。
  CI（`.github/workflows/ci.yml`）会在 Windows 上重跑类型检查、前端构建、全局自检与打包演练
- 发版流程：改 `package.json` 与 `build/installer.iss` 的版本号 → 打 tag（如 `v1.0.0`）推上去，
  Release 工作流会自动同步版本、构建安装包并发布到 GitHub Releases