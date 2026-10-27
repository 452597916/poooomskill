/** 扫描本机各 agent 的 SKILL.md，按全限定名归并跨目录副本 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME, ROOTS, SKIP_DIRS, MAX_SKILL_BYTES, MAX_DEPTH, ALIAS_SKILL_NAME, LEGACY_SKILL_NAMES } from './config.mjs';

/** 极简 YAML frontmatter 解析（够用于 SKILL.md） */
function parseSkill(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (raw.length > MAX_SKILL_BYTES) return null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return { name: '', description: '', whenToUse: '', author: '', body: raw };

  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let val = kv[2].trim();
    if (/^[|>][-+]?$/.test(val) || val === '') {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim());
      val = buf.join(' ');
    }
    out[kv[1]] = val.replace(/^["']|["']$/g, '');
  }
  return {
    name: out.name || '',
    description: out.description || '',
    whenToUse: out.when_to_use || '',
    author: out.author || out.authors || '',
    body: raw.slice(m[0].length),
  };
}

function walk(dir, depth, hit) {
  if (depth > MAX_DEPTH) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === 'SKILL.md') { hit.push(p); continue; }
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(p, depth + 1, hit);
  }
}

/** 扫描全部根目录，返回归并后的技能清单 */
export function scanAll() {
  const found = [];
  for (const root of ROOTS) {
    const base = path.join(HOME, root.dir);
    if (!fs.existsSync(base)) continue;
    const files = [];
    walk(base, 0, files);
    for (const f of files) {
      // 跳过 PoooomSkill 自己生成的别名技能，避免自我污染清单
      const ownDir = path.basename(path.dirname(f));
      if (ownDir === ALIAS_SKILL_NAME || LEGACY_SKILL_NAMES.includes(ownDir)) continue;
      const parsed = parseSkill(f);
      if (!parsed) continue;
      const skillDir = path.dirname(f);
      const rel = path.relative(base, skillDir).split(path.sep).filter(Boolean);
      const dirName = path.basename(skillDir).toLowerCase() === 'skill.md'
        ? (rel[rel.length - 1] || 'unknown')
        : path.basename(skillDir);
      let fqn = dirName;
      if (root.plugin && rel.length >= 3) fqn = `${rel[0]}:${rel[1]}:${dirName}`;
      else if (root.plugin && rel.length === 2) fqn = `${rel[0]}:${rel[1]}`;
      found.push({
        fqn,
        name: dirName,
        realName: parsed.name || dirName,
        author: parsed.author || '',
        skillDir,                      // 技能目录（物理删除目标）
        agent: root.agent,
        agentLabel: root.label,
        path: f.replace(HOME, '~'),
        absPath: f,                    // 绝对路径（物理删除用）
        desc: `${parsed.description} ${parsed.whenToUse}`.replace(/\s+/g, ' ').trim().slice(0, 400),
        hash: crypto.createHash('sha256').update(parsed.body || '').digest('hex').slice(0, 12),
      });
    }
  }

  const map = new Map();
  for (const r of found) {
    if (!map.has(r.fqn)) {
      map.set(r.fqn, {
        fqn: r.fqn, name: r.name, realName: r.realName, author: r.author, desc: r.desc,
        agents: new Set(), copies: 0, hashes: new Set(),
        paths: [], absPaths: [], skillDirs: [],
        samplePath: r.path,
      });
    }
    const g = map.get(r.fqn);
    g.agents.add(r.agentLabel);
    g.copies += 1;
    g.hashes.add(r.hash);
    g.paths.push(r.path);
    g.absPaths.push(r.absPath);
    g.skillDirs.push(r.skillDir);
    if (!g.desc && r.desc) g.desc = r.desc;
    if (!g.author && r.author) g.author = r.author;
  }
  return [...map.values()]
    .map(g => ({
      fqn: g.fqn,
      name: g.name,
      realName: g.realName,
      author: g.author,
      desc: g.desc,
      agents: [...g.agents].join(' / '),
      agentCount: g.agents.size,
      copies: g.copies,
      multiVersion: g.hashes.size > 1,
      path: g.samplePath,                     // 保留给兼容
      paths: [...new Set(g.paths)],           // 所有副本路径（~ 开头）
      absPaths: [...new Set(g.absPaths)],     // 绝对路径数组
      skillDirs: [...new Set(g.skillDirs)],   // 所有技能目录
    }))
    .sort((a, b) => b.copies - a.copies || a.fqn.localeCompare(b.fqn));
}

/** 读取单个技能的完整 SKILL.md 内容 + frontmatter */
export function readSkillContent(absPath) {
  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    return parseSkill(absPath) || { body: raw, name: '', description: '', whenToUse: '', author: '' };
  } catch {
    return null;
  }
}
