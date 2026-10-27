/** PoooomSkill · 全局配置：路径、产品信息、各家 agent 接入面 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ---------------- 产品与版权信息（万智云集） ---------------- */
export const PRODUCT = 'PoooomSkill';
export const TAGLINE = '本地 AI 技能管理台';
export const PUBLISHER = '万智云集';
export const HOMEPAGE = 'https://poooom.com';
export const CONTACT = 'contact@poooom.com';
export const COPYRIGHT = `Copyright © 2026 ${PUBLISHER} · ${HOMEPAGE}`;
export const VERSION = '1.2.1';

export const HOME = os.homedir();
export const APPDATA_DIR = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');

/* ---------------- 运行形态识别 ----------------
 * 开发态：node server/index.mjs        → 用系统 node 跑钩子
 * 安装态：PoooomSkill.exe server/…     → 用启动器跑钩子（用户机器可能没装 Node）
 *
 * 安装态下子进程看到的是 runtime\node.exe，光看 execPath 认不出来，
 * 所以由 C# 启动器注入 POOOOMSKILL_LAUNCHER 明确告知。
 */
const exeBase = path.basename(process.execPath).toLowerCase();
const isStockNode = exeBase === 'node.exe' || exeBase === 'node';
const launcher = process.env.POOOOMSKILL_LAUNCHER || '';
export const PACKAGED = Boolean(launcher) || !isStockNode;

export const RUNTIME = {
  packaged: PACKAGED,
  execPath: process.execPath,
  launcher: launcher || process.execPath,
  /** 钩子命令前缀：
   *  安装态 → 走启动器的 --run-script（GUI 子系统，不弹黑框，且继承 stdin/stdout 返回 JSON）
   *  开发态 → 直接用 node 跑 .mjs */
  prefix: PACKAGED ? `"${launcher || process.execPath}" --run-script` : 'node',
};

/** 应用根目录：安装态取 exe 所在目录，开发态取本文件上两级
 *  注意：必须用 fileURLToPath 解码。路径里有中文与「、」时，
 *  new URL().pathname 会给出 %E3%80%81 这种百分号编码，导致路径失效。 */
export const APP = PACKAGED
  ? (process.env.POOOOMSKILL_HOME || path.dirname(process.execPath))
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---------------- 数据目录（含旧版迁移） ---------------- */
const LEGACY_DATA_DIR = path.join(APPDATA_DIR, 'SkillDock');
export const DATA_DIR = process.env.POOOOMSKILL_DATA || path.join(APPDATA_DIR, PRODUCT);

export const DB_FILE = path.join(DATA_DIR, 'poooomskill.db');
export const LOG_FILE = path.join(DATA_DIR, 'poooomskill.log');
export const OUT_DIR = path.join(DATA_DIR, 'generated');

const DB_LEGACY = path.join(DATA_DIR, 'skillock.db');

/** 把旧版 SkillDock 的备注/统计迁到 PoooomSkill，避免用户数据丢失 */
function migrateLegacy() {
  const done = path.join(DATA_DIR, '.migrated-from-skilldock');
  if (fs.existsSync(done)) return null;
  if (!fs.existsSync(LEGACY_DATA_DIR)) return null;
  if (fs.existsSync(DB_FILE)) return null;

  let copied = 0;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of ['skillock.db', 'manifest.json', 'pending-invocations.jsonl', 'generated']) {
    const from = path.join(LEGACY_DATA_DIR, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(DATA_DIR, name);
    try {
      fs.cpSync(from, to, { recursive: true });
      copied += 1;
    } catch { /* 单个文件失败不阻断整体 */ }
  }
  // 旧库文件名统一成新名
  if (!fs.existsSync(DB_FILE) && fs.existsSync(DB_LEGACY)) fs.renameSync(DB_LEGACY, DB_FILE);
  if (copied) fs.writeFileSync(done, `${new Date().toISOString()} 已从 ${LEGACY_DATA_DIR} 迁移 ${copied} 项\n`, 'utf8');
  return copied ? { from: LEGACY_DATA_DIR, items: copied } : null;
}

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return migrateLegacy();
}

/* ---------------- 扫描根 ---------------- */
export const ROOTS = [
  { agent: 'claude', key: 'claude', label: 'Claude Code', dir: '.claude/skills' },
  { agent: 'codex', key: 'codex', label: 'Codex', dir: '.codex/skills' },
  { agent: 'agents', key: 'agents', label: '共享目录', dir: '.agents/skills' },
  { agent: 'trae', key: 'trae', label: 'Trae CN', dir: '.trae-cn/skills' },
  { agent: 'traePlugin', key: 'traePlugin', label: 'Trae 插件', dir: '.trae-cn/plugins', plugin: true },
  { agent: 'cursor', key: 'cursor', label: 'Cursor', dir: '.cursor/skills' },
  { agent: 'cursorAppData', key: 'cursorAppData', label: 'Cursor 用户级', dir: 'AppData/Roaming/Cursor/User/skills' },
  { agent: 'windsurf', key: 'windsurf', label: 'Windsurf', dir: '.windsurf/skills' },
  { agent: 'windsurfAppData', key: 'windsurfAppData', label: 'Windsurf 用户级', dir: 'AppData/Roaming/Windsurf/skills' },
  { agent: 'gemini', key: 'gemini', label: 'Gemini CLI', dir: '.gemini/skills' },
  { agent: 'qwen', key: 'qwen', label: 'Qwen Code', dir: '.qwen/skills' },
  { agent: 'other', key: 'other', label: '其他位置', dir: '.config/agents/skills' },
  { agent: 'ccSwitch', key: 'ccSwitch', label: 'CC Switch', dir: '.cc-switch/skills' },
];

/* ---------------- 各家 agent 接入面（均经官方文档核实） ----------------
 *  Claude Code   ：~/.claude/commands 斜杠命令 + ~/.claude/settings.json 的 hooks
 *  Trae  CN      ：~/.trae-cn/skills 别名技能   + ~/.trae-cn/hooks.json（version:1 格式）
 *  Codex         ：~/.codex/skills 别名技能     + ~/.codex/hooks.json
 *  Cursor        ：~/.cursor/skills（也读 .cursor/commands） + hooks.json（beforeToolUse/pretooluse/postToolUse 标准钩子）
 *  Windsurf      ：~/.windsurf/skills（技能名仅 lowercase+number+hyphen） + hooks.json
 *  Gemini CLI    ：~/.gemini/skills 或 ~/.agents/skills（全局 alias），由 frontmatter description 自动触发
 *  Qwen Code     ：~/.qwen/skills 或 ~/.agents/skills，支持 frontmatter hooks 字段
 */
export const AGENTS = {
  claude: {
    label: 'Claude Code',
    skillsDir: path.join(HOME, '.claude/skills'),
    commandsDir: path.join(HOME, '.claude/commands'),
    hookFile: path.join(HOME, '.claude/settings.json'),
    hookDialect: 'claude',
    skillMatcher: 'Skill',
  },
  trae: {
    label: 'Trae CN',
    skillsDir: path.join(HOME, '.trae-cn/skills'),
    commandsDir: null,
    hookFile: path.join(HOME, '.trae-cn/hooks.json'),
    hookDialect: 'trae',
    skillMatcher: 'Skill',
  },
  codex: {
    label: 'Codex',
    skillsDir: path.join(HOME, '.codex/skills'),
    commandsDir: null,
    hookFile: path.join(HOME, '.codex/hooks.json'),
    hookDialect: 'codex',
    skillMatcher: '.*[Ss]kill.*',
  },
  /** Cursor：全局 ~/.cursor/skills + 项目级 .cursor/skills；钩子 hooks.json */
  cursor: {
    label: 'Cursor',
    skillsDir: path.join(HOME, '.cursor/skills'),
    commandsDir: path.join(HOME, '.cursor/commands'),
    hookFile: path.join(HOME, '.cursor/hooks.json'),
    hookDialect: 'cursor',
    skillMatcher: 'Skill',
  },
  /** Windsurf (Cascade)：全局 ~/.windsurf/skills；技能名仅 lowercase+number+hyphen；钩子 hooks.json */
  windsurf: {
    label: 'Windsurf',
    skillsDir: path.join(HOME, '.windsurf/skills'),
    commandsDir: null,
    hookFile: path.join(HOME, '.windsurf/hooks.json'),
    hookDialect: 'jsonHook',
    skillMatcher: 'Skill',
  },
  /** Gemini CLI：~/.gemini/skills + 全局 alias ~/.agents/skills；无命令目录，靠 description 自动触发 */
  gemini: {
    label: 'Gemini CLI',
    skillsDir: path.join(HOME, '.gemini/skills'),
    commandsDir: null,
    hookFile: null,
    hookDialect: 'none',
    skillMatcher: 'Skill',
  },
  /** Qwen Code：~/.qwen/skills + 读 ~/.agents/skills；钩子在 SKILL.md frontmatter 里 */
  qwen: {
    label: 'Qwen Code',
    skillsDir: path.join(HOME, '.qwen/skills'),
    commandsDir: null,
    hookFile: null,
    hookDialect: 'none',
    skillMatcher: 'Skill',
  },
  /** 跨客户端共享目录：Codex 的用户级技能路径、Trae/Gemini/Qwen/Cursor 都读；本身没有钩子 */
  shared: {
    label: '共享目录 .agents',
    skillsDir: path.join(HOME, '.agents/skills'),
    commandsDir: null,
    hookFile: null,
    hookDialect: 'none',
    skillMatcher: 'Skill',
  },
};

/** 生成的别名技能目录名（各 agent 通用） */
export const ALIAS_SKILL_NAME = 'poooomskill-alias';
/** 旧版本用过的名字，升级时清理 */
export const LEGACY_SKILL_NAMES = ['skill-alias'];

export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.venv', 'venv', 'dist', 'build', '.next', '.cache',
  '__pycache__', '.trash', '.system',
]);

export const MAX_SKILL_BYTES = 300 * 1024;
export const MAX_DEPTH = 9;