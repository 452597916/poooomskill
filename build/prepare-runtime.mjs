/** 准备安装包要分发的文件（staging）+ 编译 C# 启动器
 *  用法：node build/prepare-runtime.mjs
 *
 *  产物：build/staging/
 *    PoooomSkill.exe      ← C# 启动器（GUI 子系统、含版本信息与图标、asInvoker 免 UAC）
 *    runtime/node.exe     ← Node.js 运行时（原样分发，附完整许可证）
 *    server/…             ← 应用源码
 *    dist/…               ← 前端界面（vite 构建产物）
 *    brand/mark.svg
 *    使用说明.txt
 *    THIRD-PARTY-NOTICES.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const STAGE = path.join(BUILD, 'staging');
const ICON = path.join(BUILD, 'icon.ico');
const MANIFEST = path.join(BUILD, 'launcher.manifest');
const LAUNCHER_CS = path.join(BUILD, 'launcher.cs');

const CSC = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
].find(p => fs.existsSync(p));

const step = t => console.log(`\n== ${t} ==`);

/* ---------- 0. 前置检查 ---------- */
step('前置检查');
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('缺少前端构建产物 dist/index.html，请先执行 npm run build');
  process.exit(1);
}
if (!fs.existsSync(ICON)) { console.error('缺少 build/icon.ico，请先执行 npm run icon'); process.exit(1); }
if (!CSC) { console.error('未找到 C# 编译器 csc.exe（.NET Framework 4.x）'); process.exit(1); }
console.log('前端产物 dist/index.html 存在');
console.log('图标 build/icon.ico 存在');
console.log('C# 编译器：' + CSC);
console.log('Node 运行时：' + process.execPath + '（' + process.version + '）');

/* ---------- 1. 准备干净的 staging 目录 ---------- */
step('准备 staging 目录');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

const copyTree = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    if (!filter(src, e)) continue;
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst, filter);
    else fs.copyFileSync(src, dst);
  }
};

/* ---------- 2. 编译启动器 ---------- */
step('编译 C# 启动器');
const exe = path.join(STAGE, 'PoooomSkill.exe');
const cscArgs = [
  '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
  '/codepage:65001',
  '/r:System.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
  `/win32icon:${ICON}`,
  `/win32manifest:${MANIFEST}`,
  `/out:${exe}`,
  LAUNCHER_CS,
];
const cc = spawnSync(CSC, cscArgs, { encoding: 'utf8', windowsHide: true });
if (!fs.existsSync(exe)) {
  console.error('编译失败：\n' + (cc.stdout || '') + (cc.stderr || ''));
  process.exit(1);
}
const warn = (cc.stdout || '').split('\n').filter(l => /warning|error/i.test(l));
if (warn.length) console.log('编译器提示：\n  ' + warn.join('\n  '));
else console.log('编译无警告。');
console.log(`已生成 ${path.relative(ROOT, exe)}（${fs.statSync(exe).size} 字节）`);

/* ---------- 3. 运行时与应用文件 ---------- */
step('拷贝运行时与应用文件');
fs.mkdirSync(path.join(STAGE, 'runtime'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(STAGE, 'runtime', 'node.exe'));
console.log(`runtime/node.exe ← ${process.execPath}（${(fs.statSync(path.join(STAGE, 'runtime', 'node.exe')).size / 1048576).toFixed(1)} MB）`);

copyTree(path.join(ROOT, 'server'), path.join(STAGE, 'server'));
console.log('server/ 已拷贝');

// 服务端唯一的运行时依赖（中文拼音，MIT、零依赖）：必须随包分发，
// 否则安装态算不出拼音短码（「前端设计」会退化成 sd-fronte 而不是 sd-qdsj）
const pinyinSrc = path.join(ROOT, 'node_modules', 'pinyin-pro');
if (!fs.existsSync(pinyinSrc)) {
  console.error('缺少 node_modules/pinyin-pro，请先在项目根目录执行 npm install');
  process.exit(1);
}
copyTree(pinyinSrc, path.join(STAGE, 'node_modules', 'pinyin-pro'));
console.log('node_modules/pinyin-pro 已拷贝（中文拼音短码）');

copyTree(path.join(ROOT, 'dist'), path.join(STAGE, 'dist'));
console.log('dist/ 已拷贝（前端界面）');

fs.mkdirSync(path.join(STAGE, 'brand'), { recursive: true });
for (const f of ['mark.svg', 'logo-cn.svg']) {
  const p = path.join(ROOT, 'brand', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(STAGE, 'brand', f));
}
console.log('brand/ 已拷贝');

// 多尺寸 ico 随包分发：启动器取托盘需要的那一档，避免系统缩放出模糊的托盘图标
fs.copyFileSync(ICON, path.join(STAGE, 'PoooomSkill.ico'));
console.log('PoooomSkill.ico 已放入（托盘图标用原生小尺寸）');

/* ---------- 4. 许可证与说明 ---------- */
step('许可证与说明文件');
const notices = [];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

notices.push(`PoooomSkill v${pkg.version}
${pkg.description}

Copyright © 2026 万智云集 · ${pkg.homepage}
联系邮箱：contact@poooom.com

本程序以 MIT 许可证开源，完整条款见随附的 LICENSE 文件。

本程序按用户权限安装与运行，不修改系统级设置。
卸载时请使用「设置 → 应用」或开始菜单中的卸载入口。

────────────────────────────────────────────

本程序分发的第三方组件及其许可证如下。

【1】Node.js（运行时 runtime/node.exe）
版权归 Node.js 贡献者所有，以 MIT 许可证授权。
完整许可证见随附的 LICENSE-node.txt。

【2】pinyin-pro（中文拼音，MIT）
【3】React / ReactDOM（MIT）
【4】clsx（MIT）
【5】tailwind-merge（MIT）
【6】class-variance-authority（Apache-2.0）
【7】Tailwind CSS（MIT，仅构建期使用）

以上第 2–7 项均已随前端资源或服务端代码一同分发，
其许可证在各自 npm 包内随附（node_modules/<包名>/LICENSE）。
`);

const nodeLicense = path.join(BUILD, 'LICENSE-node.txt');
if (fs.existsSync(nodeLicense)) {
  fs.copyFileSync(nodeLicense, path.join(STAGE, 'LICENSE-node.txt'));
  console.log('LICENSE-node.txt 已放入（Node.js 完整许可证）');
} else {
  console.warn('警告：未找到 build/LICENSE-node.txt，Node.js 许可证缺失');
}

const ownLicense = path.join(ROOT, 'LICENSE');
if (fs.existsSync(ownLicense)) {
  fs.copyFileSync(ownLicense, path.join(STAGE, 'LICENSE'));
  console.log('LICENSE 已放入（本程序 MIT 许可证）');
} else {
  console.warn('警告：未找到根目录 LICENSE');
}

fs.writeFileSync(path.join(STAGE, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'), 'utf8');
console.log('THIRD-PARTY-NOTICES.txt 已生成');

fs.writeFileSync(path.join(STAGE, '使用说明.txt'), `PoooomSkill · 本地 AI 技能管理台
万智云集 · ${pkg.homepage} · contact@poooom.com

【怎么启动】
  双击桌面或开始菜单里的「PoooomSkill」。
  程序只允许运行一个实例；重复双击只会把已有窗口调到前台。
  窗口点关闭 = 收起到右下角托盘（统计继续记录），
  双击托盘图标可重新打开界面，右键托盘图标可以「退出 PoooomSkill」。
  选了「开机自动启动」的，登录后会自动驻留托盘，不弹窗口。

【三步上手】
  1. 打开「技能库」，给常用技能填中文备注名 / 一句话用法 / 分组
     （顶部搜索框可按中文名、拼音首字母、短命令、真名快速找技能）
  2. 点右上「生成并写入」
  3. 在 Trae CN、Claude Code、Codex、Cursor、Windsurf、Gemini CLI、Qwen Code 里用 【中文备注名】 点名技能
     Claude Code 还可以用 /ps-xxxx 这种硬命令
  Trae CN 需要重启一次才会读到新技能；Codex 首次跑钩子要在 /hooks 里点信任。
  技能清单只在启动与手动点「重新扫描」时更新，平时不会反复扫描磁盘。

【进阶用法】
  全局快捷键：Ctrl+K 呼出界面（若被其他程序占用，会自动退到 Ctrl+Alt+K；界面内 Ctrl+K 聚焦搜索）
  主题：右上角按钮在 跟随系统 / 浅色 / 深色 之间切换
  标签：详情页可给一个技能挂多个标签，列表顶部可按标签筛选
  版本差异：同一个技能装了多份且内容不同时，详情页可展开对比
  命令行：node server/cli.mjs list | find 关键词 | code 关键词 | stats
  MCP：把 server/mcp.mjs 配到任意支持 MCP 的 agent（工具名 list_skills / find_skill / get_skill / skill_stats）

【数据在哪】
  备注与统计都在：%APPDATA%\\PoooomSkill
  想备份就把这个文件夹复制走；想清空就在「使用统计」里清空记录，
  或在「接入与同步」里点「一键撤销全部」撤掉写入到各 agent 的文件与钩子。

【卸载】
  设置 → 应用 → PoooomSkill → 卸载（会自动清理写入各 agent 的技能与钩子条目）。
  卸载不会删除你的备注数据；如需一并删除，请手动删除 %APPDATA%\\PoooomSkill。

【安全说明】
  本程序不联网、不上传任何数据；所有读写都发生在你自己的电脑上。
  写入第三方 agent 配置前会先生成备份文件（*.poooomskill-bak-*）。

${pkg.author}
`, 'utf8');
console.log('使用说明.txt 已生成');

/* ---------- 5. 统计 ---------- */
step('完成');
let total = 0, files = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else { total += fs.statSync(p).size; files += 1; }
  }
})(STAGE);
console.log(`staging 就绪：${files} 个文件，合计 ${(total / 1048576).toFixed(1)} MB`);
console.log(`目录：${STAGE}`);