#!/usr/bin/env node
/** PoooomSkill MCP Server —— 让任意支持 MCP 的 agent 直接查技能库
 *
 * 零依赖：只用 Node 标准库实现 stdio 版 JSON-RPC（MCP spec 2024-11-05 起的 line-delimited JSON）。
 *
 * 接入示例（把绝对路径换成你的安装目录）：
 *   Claude Code / Cursor / Trae / Gemini CLI / Qwen Code 的 MCP 配置里加：
 *   {
 *     "mcpServers": {
 *       "poooomskill": {
 *         "command": "node",
 *         "args": ["D:/work/.../SkillDock/server/mcp.mjs"]
 *       }
 *     }
 *   }
 *   安装版可用 "command": "C:/.../PoooomSkill.exe", "args": ["--run-script", "server/mcp.mjs"]
 *
 * 工具：list_skills / find_skill / get_skill / skill_stats
 * 注意：日志一律写 stderr，stdout 只允许出现 JSON-RPC 报文。
 */
import readline from 'node:readline';
import { loadLibrary } from './lib/library.mjs';
import { readSkillContent } from './lib/scan.mjs';
import { stats, getMeta } from './lib/store.mjs';
import { PRODUCT, VERSION } from './lib/config.mjs';

const PROTOCOL = '2024-11-05';
const logErr = (...a) => { try { process.stderr.write(a.join(' ') + '\n'); } catch { /* 忽略 */ } };
const send = obj => { process.stdout.write(JSON.stringify(obj) + '\n'); };

let skills = null;
const lib = () => (skills ||= loadLibrary());
const trigger = () => getMeta('trigger') || '【';
const triggerEnd = () => getMeta('trigger_end') ?? '】';
const label = s => s.alias || s.name;

function match(s, q) {
  if (!q) return true;
  const qq = String(q).toLowerCase();
  const compact = qq.replace(/[\s-]/g, '');
  const hay = [s.alias, s.name, s.fqn, s.usage, s.group, s.tags.join(' '), s.code, s.py]
    .join(' ').toLowerCase();
  return hay.includes(qq) || (compact.length >= 2 && hay.replace(/[\s-]/g, '').includes(compact));
}

const TOOLS = [
  {
    name: 'list_skills',
    description: '列出本机已安装的 AI 技能（含中文备注名、斜杠命令、分组、标签）。可按关键词 / 标签 / 分组筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词：中文名、拼音首字母、真名、标签都可以' },
        tag: { type: 'string', description: '只看某个标签' },
        group: { type: 'string', description: '只看某个分组' },
        limit: { type: 'number', description: '最多返回几条，默认 30' },
      },
    },
  },
  {
    name: 'find_skill',
    description: '按用户的一句话需求找最合适的技能，返回中文名、硬调用暗号（如【前端设计】）和斜杠命令（如 /ps-qdsj）。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '需求或关键词' } },
      required: ['query'],
    },
  },
  {
    name: 'get_skill',
    description: '读取某个技能的完整信息：备注、用法、分组、标签、副本路径、作者、以及 SKILL.md 全文。',
    inputSchema: {
      type: 'object',
      properties: { fqn: { type: 'string', description: '技能全限定名（可用 find_skill 先查）' } },
      required: ['fqn'],
    },
  },
  {
    name: 'skill_stats',
    description: '技能使用统计：累计调用次数、按 agent 分布、调用最多的技能。',
    inputSchema: { type: 'object', properties: {} },
  },
];

function brief(s) {
  return {
    fqn: s.fqn,
    alias: s.alias,
    trigger: s.alias ? `${trigger()}${s.alias}${triggerEnd()}` : '',
    slash: s.code ? `/${s.code}` : '',
    usage: s.usage,
    group: s.group,
    tags: s.tags,
    agents: s.agents,
    copies: s.copies,
    path: s.path,
  };
}

function callTool(name, args = {}) {
  const list = [...lib()].sort((a, b) =>
    (b.pinned - a.pinned) || (b.favorite - a.favorite) || (a.alias || a.name).localeCompare(b.alias || b.name, 'zh'));

  if (name === 'list_skills') {
    const limit = Math.max(1, Math.min(200, Number(args.limit) || 30));
    let rows = list.filter(s => match(s, args.query));
    if (args.tag) rows = rows.filter(s => s.tags.includes(String(args.tag).replace(/^#/, '')));
    if (args.group) rows = rows.filter(s => s.group === args.group);
    return {
      total: list.length,
      shown: Math.min(rows.length, limit),
      skills: rows.slice(0, limit).map(brief),
    };
  }

  if (name === 'find_skill') {
    const q = String(args.query || '');
    const hits = list.filter(s => match(s, q)).slice(0, 5).map(brief);
    return hits.length
      ? { query: q, best: hits[0], candidates: hits }
      : { query: q, best: null, candidates: [], hint: '本机没有匹配技能，可以换个说法或用 list_skills 看全量清单' };
  }

  if (name === 'get_skill') {
    const fqn = String(args.fqn || '');
    const s = list.find(x => x.fqn === fqn) || list.find(x => x.alias === fqn) || list.find(x => x.name === fqn);
    if (!s) return { error: `没有找到技能 ${fqn}` };
    const abs = s.absPaths?.[0];
    const content = abs ? readSkillContent(abs) : null;
    return {
      ...brief(s),
      realName: s.realName,
      author: s.author || content?.author || '',
      desc: s.desc,
      paths: s.paths,
      body: content ? String(content.body || '').slice(0, 12000) : '',
    };
  }

  if (name === 'skill_stats') {
    const st = stats();
    const top = Object.entries(st.bySkill)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      .map(([fqn, v]) => ({ fqn, alias: (list.find(x => x.fqn === fqn) || {}).alias || '', count: v.count, byAgent: v.byAgent || {} }));
    return { total: st.total, since: st.since, byAgent: st.byAgent, topSkills: top };
  }

  throw new Error(`未知工具：${name}`);
}

function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'poooomskill', version: VERSION },
      instructions: `${PRODUCT} 本地技能库：先 find_skill 找到技能，再按返回的 trigger（中文暗号）或 slash（斜杠命令）调用。`,
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;   // 通知无需回复
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const out = callTool(params?.name, params?.arguments || {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: String(e.message || e) }], isError: true });
    }
  }
  if (id !== undefined) fail(id, -32601, `不支持的方法：${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try { msg = JSON.parse(text); } catch { return fail(null, -32700, '解析 JSON 失败'); }
  Promise.resolve(handle(msg)).catch(e => { logErr('处理失败：', String(e && e.stack || e)); if (msg.id !== undefined) fail(msg.id, -32603, String(e.message || e)); });
});
rl.on('close', () => process.exit(0));
logErr(`${PRODUCT} MCP server v${VERSION} 已就绪（stdio）`);
