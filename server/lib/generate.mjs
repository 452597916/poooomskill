/** PoooomSkill · 产物生成：A 斜杠短命令 + B 中文解析技能 + C 符号入口与兜底钩子 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME, OUT_DIR, DATA_DIR, AGENTS, RUNTIME, PRODUCT, HOMEPAGE,
         ALIAS_SKILL_NAME, LEGACY_SKILL_NAMES, ensureDirs } from './config.mjs';
import { usableAliases, dedupeCodes } from './pinyin.mjs';

const MANIFEST = path.join(DATA_DIR, 'manifest.json');
export const PENDING = path.join(DATA_DIR, 'pending-invocations.jsonl');
const ALIAS_INDEX = path.join(OUT_DIR, 'alias-index.json');
const HOOK_DIR = path.join(OUT_DIR, 'hook');

const readManifest = () => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; } };

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

/** 钩子命令行：安装态用自带 exe（用户机器可能没有 Node），开发态用 node */
const hookCommand = (file, agent) => `${RUNTIME.prefix} "${path.join(HOOK_DIR, file)}" ${agent}`;

/** 各家 hooks 方言差异：
 *  claude  : ~/.claude/settings.json → top-level "hooks" → { PreToolUse, UserPromptSubmit } 数组
 *  trae    : version:1 + hooks → { PreToolUse, UserPromptSubmit }
 *  codex   : ~/.codex/hooks.json → hooks → { PreToolUse, UserPromptSubmit }
 *  cursor  : ~/.cursor/hooks.json → version:1 + hooks → { beforeToolUse, sessionStart }  (Cursor 不认 PreToolUse/Pretool)
 *  jsonHook: ~/.windsurf/hooks.json → version:1 + hooks → { beforeToolUse, sessionStart }
 *  none    : 无钩子（Gemini CLI、Qwen Code）
 */
const DIALECT_STAGES = {
  claude:   { pretool: 'PreToolUse',    userprompt: 'UserPromptSubmit' },
  trae:     { pretool: 'PreToolUse',    userprompt: 'UserPromptSubmit' },
  codex:    { pretool: 'PreToolUse',    userprompt: 'UserPromptSubmit' },
  cursor:   { pretool: 'beforeToolUse', userprompt: 'sessionStart' },
  jsonHook: { pretool: 'beforeToolUse', userprompt: 'sessionStart' },
  none:     null,
};
const DIALECT_VERSION = { trae: 1, cursor: 1, jsonHook: 1 };

function hookEnvelope(dialect, hooks) {
  const ver = DIALECT_VERSION[dialect];
  return ver != null ? { version: ver, hooks } : { hooks };
}

function hookEntries(agent) {
  const conf = AGENTS[agent];
  const stages = DIALECT_STAGES[conf.hookDialect];
  if (!stages) return { hooks: {} };
  return hookEnvelope(conf.hookDialect, {
    [stages.userprompt]: [{ hooks: [{ type: 'command', command: hookCommand('userprompt.mjs', agent), timeout: 10 }] }],
    [stages.pretool]: [{ matcher: conf.skillMatcher, hooks: [{ type: 'command', command: hookCommand('pretool.mjs', agent), timeout: 10 }] }],
  });
}

/** 生成全部产物；install=true 时写入各 agent 目录 */
export function generate(skills, { install = true, trigger = '【', triggerEnd = '】' } = {}) {
  ensureDirs();
  const named = usableAliases(skills);
  const conflicts = skills.filter(s => s.alias && s.conflictWith);
  const report = { aliased: named.length, conflicts: conflicts.length, written: [], skipped: [], runtime: RUNTIME.packaged ? 'exe' : 'node' };

  /* ---------- 别名索引（两个钩子共用） ---------- */
  write(ALIAS_INDEX, JSON.stringify({
    product: PRODUCT, trigger, triggerEnd,
    list: named.map(s => ({ alias: s.alias, fqn: s.fqn, name: s.name, code: s.code, usage: s.usage || '' })),
  }, null, 2));

  /* ---------- A：斜杠短命令（仅 Claude Code 有命令目录） ---------- */
  // 短码正常由调用方（loadSkills）算好；万一调用方只给了别名，这里兜底补算，
  // 否则会静默不产出任何斜杠命令。
  if (named.some(s => !s.code)) dedupeCodes(named);
  const cmdSrc = path.join(OUT_DIR, 'commands');
  fs.rmSync(cmdSrc, { recursive: true, force: true });
  fs.mkdirSync(cmdSrc, { recursive: true });
  for (const s of named) {
    if (!s.code) continue;
    write(path.join(cmdSrc, `${s.code}.md`),
`---
description: 【${PRODUCT}】${s.alias}${s.usage ? ' · ' + s.usage.replace(/[\r\n]/g, ' ') : ''}
---

这是「${PRODUCT}」登记的硬调用入口。请立即调用真实技能 \`${s.fqn}\`（本名 \`${s.name}\`），不要追问用户要用哪个技能，也不要改用其他技能。

用户此刻的诉求：$ARGUMENTS

如果该技能在本机不可用，请告诉用户：${PRODUCT} 登记的真名是 \`${s.fqn}\`，来源 \`${s.path}\`，可让智能体从 GitHub 搜索同名技能并安装后再试。
`);
  }

  /* ---------- B：中文解析技能 ---------- */
  const lead = `${PRODUCT} 的中文别名表。用户用中文点名技能时，先查本表换成真实技能名，再按真名调用，不要反问“你指的是哪个技能”。`;
  let fit = '';
  const overflow = [];
  for (const s of named) {
    const piece = (fit ? '、' : '') + s.alias;
    if ((lead.length + fit.length + piece.length) <= 900) fit += piece; else overflow.push(s.alias);
  }
  const aliasList = named.map(s =>
    `- 「${s.alias}」→ 真名 \`${s.fqn}\`${s.usage ? '：' + s.usage : ''}${s.code ? `（硬调用命令 /${s.code}）` : ''}`);

  write(path.join(OUT_DIR, ALIAS_SKILL_NAME, 'SKILL.md'),
`---
name: ${ALIAS_SKILL_NAME}
description: ${lead}已登记别名：${fit}
when_to_use: 用户提到中文技能称呼、说“我备注的那个”“上次那个技能”，或要求列出、查找他的技能时。未列出的别名：${(overflow.slice(0, 40).join('、') || '无')}。
---

# ${PRODUCT} · 中文别名解析

用户习惯用中文称呼技能。下面是他的备注名与真实技能名的对照表。

## 调用规则

1. 命中下列任一中文备注名 → **直接**调用对应真名的技能，不要向用户确认“是不是这个技能”。若你的环境没有技能调用工具，请改为读取该技能目录下的 \`SKILL.md\` 并严格按其指令执行。
2. 中文说法接近但不完全等于表里的名字 → 先给 1–2 个候选让用户选，别猜。
3. 表里没有、但听起来是他已有的某个技能 → 用关键词在表内模糊匹配；仍无结果就问他要不要从 GitHub 找并安装，**不要擅自安装**。
4. 用户输入了以 \`/ps-\` 开头的斜杠命令，或用「${trigger}」「${triggerEnd}」把中文技能名包起来（例如 ${trigger}前端设计${triggerEnd}）→ 都是硬映射，无条件按对应真名调用。
5. 用户新增或改动了别名 → 提醒他在 ${PRODUCT} 里改，由 ${PRODUCT} 重新生成，别手改本文件。

> 本文件由 ${PRODUCT}（${HOME} 本机）自动生成，请勿手改。${PRODUCT} · ${HOMEPAGE}

## 别名对照表（共 ${named.length} 条）

${aliasList.join('\n') || '（表为空——请先在 ' + PRODUCT + ' 里给技能填中文备注名）'}
`);

  /* ---------- C：钩子脚本 ---------- */
  write(path.join(HOOK_DIR, 'record.mjs'),
`/** ${PRODUCT} · 调用计数：同技能+同说法+同来源 3 秒内只记一次。
 *  同一个客户端可能同时加载多份钩子配置（Trae 会读自己的 hooks.json 与 ~/.claude/settings.json）。 */
import fs from 'node:fs';
const PENDING = ${JSON.stringify(PENDING)};

export function record(agent, fqn, entry, source) {
  try {
    let tail = '';
    try {
      const size = fs.statSync(PENDING).size;
      const len = Math.min(size, 8192);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(PENDING, 'r');
      fs.readSync(fd, buf, 0, len, Math.max(0, size - len));
      fs.closeSync(fd);
      tail = buf.toString('utf8');
    } catch { /* 还没有历史 */ }
    const now = Date.now();
    const dup = tail.split('\\n').some(l => {
      if (!l.trim()) return false;
      try {
        const o = JSON.parse(l);
        return o.fqn === fqn && o.entry === entry && o.source === source && now - Date.parse(o.ts) < 3000;
      } catch { return false; }
    });
    if (dup) return false;
    fs.appendFileSync(PENDING, JSON.stringify({ fqn, entry, agent, source, ts: new Date().toISOString() }) + '\\n');
    return true;
  } catch { return false; }
}
`);

  write(path.join(HOOK_DIR, 'pretool.mjs'),
`#!/usr/bin/env node
/** ${PRODUCT} · 兜底改写与计数：模型拿中文别名调用时改写成真实技能名。永不抛错、永不阻断。 */
import fs from 'node:fs';
import { record } from './record.mjs';
const ALIAS_FILE = ${JSON.stringify(ALIAS_INDEX)};
const AGENT = process.argv[2] || 'claude';
const NAME_KEYS = ['name', 'skill', 'command', 'skill_name', 'skillName', 'skillPath'];

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(input || '{}');
    const tool = String(ev.tool_name || ev.llm_tool_name || '');
    if (!/skill/i.test(tool)) return;
    const ti = ev.tool_input || {};
    const claimed = NAME_KEYS.map(k => ti[k]).find(v => typeof v === 'string' && v.trim()) || '';
    if (!claimed) return;

    const list = (JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')).list) || [];
    const bare = claimed.replace(/^\\//, '');
    const hit = list.find(x => x.alias === claimed || x.alias === bare || x.name === claimed || x.fqn === claimed
      || (x.code && bare === x.code));
    if (!hit) return;

    record(AGENT, hit.fqn, claimed, hit.alias === claimed || hit.alias === bare ? 'alias' : 'realname');
    if (hit.alias === claimed || hit.alias === bare || (hit.code && bare === hit.code)) {
      const next = { ...ti };
      for (const k of NAME_KEYS) if (k in next) next[k] = hit.fqn;
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: next },
      }));
    }
  } catch { /* 钩子异常一律静默放行 */ }
});
`);

  write(path.join(HOOK_DIR, 'userprompt.mjs'),
`#!/usr/bin/env node
/** ${PRODUCT} · 暗号入口：识别「${trigger}中文备注名${triggerEnd}」，注入真名指令并计数。永不抛错、永不阻断。 */
import fs from 'node:fs';
import { record } from './record.mjs';
const ALIAS_FILE = ${JSON.stringify(ALIAS_INDEX)};
const AGENT = process.argv[2] || 'claude';
const OPEN = ${JSON.stringify(trigger)};
const CLOSE = ${JSON.stringify(triggerEnd)};
const STOP = '，。、；：？！,.;:?!()（）[]{}<>《》“”‘’"\\'';

/** 从消息里取出被符号包住的技能名（不用正则，避免符号本身是正则元字符） */
function extract(text) {
  const names = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf(OPEN, i);
    if (at < 0) break;
    const start = at + OPEN.length;
    if (CLOSE) {
      const end = text.indexOf(CLOSE, start);
      if (end < 0) break;
      const inner = text.slice(start, end).trim();
      if (inner && inner.length <= 24 && !inner.includes(OPEN)) names.push(inner);
      i = end + CLOSE.length;
    } else {
      let j = start;
      while (j < text.length && !STOP.includes(text[j]) && !/\\s/.test(text[j])) j++;
      const inner = text.slice(start, j).trim();
      if (inner) names.push(inner);
      i = Math.max(j, start + 1);
    }
  }
  return names;
}

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(input || '{}');
    const prompt = String(ev.prompt || ev.user_prompt || '');
    if (!prompt.includes(OPEN)) return;

    const list = (JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')).list) || [];
    const found = [];
    for (const said of extract(prompt)) {
      const bare = said.replace(/^\\//, '');
      const hit = list.find(x => x.alias === said || x.alias === bare || x.name === said || x.fqn === said || (x.code && x.code === bare));
      if (hit && !found.some(f => f.hit === hit)) found.push({ hit, said });
    }
    if (!found.length) return;   // 括号里不是已知技能名 → 完全不干预

    for (const { hit, said } of found) {
      try { record(AGENT, hit.fqn, OPEN + said + CLOSE, 'symbol'); } catch { /* 忽略 */ }
    }
    const lines = found.map(({ hit, said }) => '· 用户说的「' + OPEN + said + CLOSE + '」= ' + ${JSON.stringify(PRODUCT)} + ' 登记的技能，真名 ' + hit.fqn + (hit.usage ? '（' + hit.usage + '）' : ''));
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: '${PRODUCT} 别名映射（来自本机 ${PRODUCT}，可信）：\\n' + lines.join('\\n')
          + '\\n请立即调用上面真名对应的技能来完成用户这次的要求，不要反问用户指的是哪个技能；'
          + '如果你的环境没有技能调用工具，请改为读取该技能目录下的 SKILL.md 并严格按其指令执行。'
          + '若该技能在本机不存在，请告诉用户登记的路径，并先询问是否从 GitHub 安装再继续。',
      },
    }));
  } catch { /* 静默 */ }
});
`);

  write(path.join(OUT_DIR, 'hooks-snippet.json'),
    JSON.stringify(Object.fromEntries(Object.entries(AGENTS).filter(([, c]) => c.hookFile).map(([a]) => [a, hookEntries(a)])), null, 2));

  /* ---------- 人看的对照表 ---------- */
  const byGroup = new Map();
  for (const s of named) {
    const g = s.group || '未分组';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(s);
  }
  let md = `# ${PRODUCT} · 中文别名对照表\n\n> 由 ${PRODUCT} 自动生成，请勿手改。${PRODUCT} · ${HOMEPAGE}\n`;
  for (const [g, items] of byGroup) {
    md += `\n## ${g}\n\n| 中文备注名 | 暗号调用 | 硬调用命令 | 真实技能名 |\n|---|---|---|---|\n`;
    for (const s of items) md += `| ${s.alias} | ${trigger}${s.alias}${triggerEnd} | ${s.code ? '`/' + s.code + '`' : '—'} | \`${s.fqn}\` |\n`;
  }
  report.tableFile = write(path.join(OUT_DIR, '别名对照表.md'), md);

  /* ---------- 写入各 agent 目录 ---------- */
  const prev = new Set(readManifest().map(x => x.path));
  const next = [];
  if (install) {
    for (const [agent, conf] of Object.entries(AGENTS)) {
      if (!fs.existsSync(path.dirname(conf.skillsDir))) { report.skipped.push(`${agent}（未安装）`); continue; }
      const f = path.join(conf.skillsDir, ALIAS_SKILL_NAME, 'SKILL.md');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.copyFileSync(path.join(OUT_DIR, ALIAS_SKILL_NAME, 'SKILL.md'), f);
      next.push(f);
      if (conf.commandsDir) {
        fs.mkdirSync(conf.commandsDir, { recursive: true });
        const src = path.join(OUT_DIR, 'commands');
        for (const name of (fs.existsSync(src) ? fs.readdirSync(src) : [])) {
          const d = path.join(conf.commandsDir, name);
          fs.copyFileSync(path.join(src, name), d);
          next.push(d);
        }
      }
      report.written.push(agent);

      // 清理旧版遗留的 skill-alias 目录
      for (const legacy of LEGACY_SKILL_NAMES) {
        const old = path.join(conf.skillsDir, legacy);
        if (fs.existsSync(old)) { try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* 忽略 */ } }
      }
    }
    for (const old of prev) if (!next.includes(old) && fs.existsSync(old)) { try { fs.rmSync(old); } catch { /* 忽略 */ } }
  }
  fs.writeFileSync(MANIFEST, install
    ? JSON.stringify(next.map(p => ({ path: p })), null, 2)
    : JSON.stringify([...prev].map(p => ({ path: p }))));
  report.outDir = OUT_DIR;
  return report;
}

export function uninstallAll() {
  const removed = [];
  for (const p of readManifest().map(x => x.path)) {
    try { fs.rmSync(p); removed.push(p); } catch { /* 忽略 */ }
    // 顺手清掉因此变空的目录（例如各 agent 下的 poooomskill-alias）
    const dir = path.dirname(p);
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch { /* 目录非空或被占用就留着 */ }
  }
  fs.writeFileSync(MANIFEST, '[]');
  for (const agent of Object.keys(AGENTS)) { try { disableHook(agent); } catch { /* 忽略 */ } }
  // 顺带清掉旧版本可能留下的目录
  for (const conf of Object.values(AGENTS)) {
    for (const legacy of LEGACY_SKILL_NAMES) {
      const old = path.join(conf.skillsDir, legacy);
      if (fs.existsSync(old)) { try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* 忽略 */ } }
    }
  }
  return removed;
}

export function hookState(agent = 'claude') {
  const conf = AGENTS[agent] || AGENTS.claude;
  if (!conf.hookFile) return { agent, installed: false, supported: false, reason: '该目录无独立钩子，由 agent 自己的配置负责' };
  if (!fs.existsSync(conf.hookFile)) return { agent, installed: false, supported: true, file: conf.hookFile, reason: '配置文件不存在，点接入会创建' };
  let text;
  try { text = fs.readFileSync(conf.hookFile, 'utf8'); } catch { return { agent, installed: false, supported: true, file: conf.hookFile, reason: '无法读取' }; }
  const pretool = text.includes('pretool.mjs');
  const userprompt = text.includes('userprompt.mjs');
  return { agent, installed: pretool && userprompt, supported: true, pretool, userprompt, file: conf.hookFile };
}

export function allHookStates() {
  return Object.keys(AGENTS).map(a => hookState(a));
}

/** 备份配置文件：只保留「最早一份（原始状态）」与「最新一份」，避免备份越堆越多 */
function backupConfig(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const base = path.basename(file);
  fs.writeFileSync(path.join(dir, `${base}.poooomskill-bak-${Date.now()}`), raw, 'utf8');
  try {
    const isBak = f => f.startsWith(base + '.') && /-(poooomskill|skillock)-bak-\d+$/.test(f);
    const all = fs.readdirSync(dir).filter(isBak).sort();   // 文件名里的时间戳递增
    for (const f of all.slice(1, -1)) fs.rmSync(path.join(dir, f), { force: true });
  } catch { /* 清理失败不影响主流程 */ }
}

/** 接入钩子：备份后合并写入 */
export function enableHook(agent = 'claude') {
  const conf = AGENTS[agent];
  if (!conf) return { ok: false, message: '未知 agent' };
  if (!conf.hookFile) return { ok: false, agent, message: `${conf.label} 没有钩子配置` };
  const file = conf.hookFile;
  const entries = hookEntries(agent).hooks;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  let json = {};
  if (fs.existsSync(file)) {
    backupConfig(file);
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.trim()) {
      try { json = JSON.parse(raw); }
      catch { return { ok: false, message: '现有配置不是合法 JSON，未做改动（已备份）' }; }
    }
  }

  // 先清掉历史遗留条目（旧品牌名，或旧版本/源码态留下的同一批钩子），
  // 再写入当前这一份，保证「以现在为准」而不是越堆越多。
  const stale = /pretool\.mjs|userprompt\.mjs|SkillDock|skilldock/i;
  for (const event of Object.keys(json.hooks || {})) {
    if (Array.isArray(json.hooks[event])) json.hooks[event] = json.hooks[event].filter(x => !stale.test(JSON.stringify(x)));
  }

  json.hooks = json.hooks || {};
  const ver = DIALECT_VERSION[conf.hookDialect];
  if (ver != null) json.version = ver;
  const added = [];
  for (const [event, list] of Object.entries(entries)) {
    json.hooks[event] = Array.isArray(json.hooks[event]) ? json.hooks[event] : [];
    for (const entry of list) {
      const cmd = entry.hooks?.[0]?.command || '';
      const needle = JSON.stringify(cmd).slice(1, -1);
      if (!json.hooks[event].some(x => JSON.stringify(x).includes(needle))) { json.hooks[event].push(entry); added.push(event); }
    }
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2), 'utf8');
  return { ok: true, agent, changed: added.length > 0, added, file, message: added.length ? `${conf.label} 已接入：${added.join('、')}` : `${conf.label} 钩子已在位` };
}

/** 撤销某个 agent 的钩子（只删自己加的那几条） */
export function disableHook(agent = 'claude') {
  const conf = AGENTS[agent];
  const file = conf?.hookFile;
  if (!file || !fs.existsSync(file)) return { ok: true, agent, removed: 0 };
  let json;
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, agent, message: '无法解析，跳过' }; }
  let removed = 0;
  for (const event of Object.keys(json.hooks || {})) {
    const before = json.hooks[event].length;
    json.hooks[event] = json.hooks[event].filter(x => !/pretool\.mjs|userprompt\.mjs|SkillDock|skilldock/i.test(JSON.stringify(x)));
    removed += before - json.hooks[event].length;
    if (!json.hooks[event].length) delete json.hooks[event];
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2), 'utf8');
  return { ok: true, agent, removed, file };
}