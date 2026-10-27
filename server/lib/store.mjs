/** 本地存储：用户备注（永久保留）+ 调用记录 */
import { DatabaseSync } from 'node:sqlite';
import { ensureDirs, DB_FILE } from './config.mjs';

let db;

/** SQLite 没有 ALTER TABLE ADD COLUMN 的 IF NOT EXISTS，手动检查列存在性 */
function ensureColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

export function store() {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS note (
      fqn TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      alias TEXT NOT NULL DEFAULT '',
      usage TEXT NOT NULL DEFAULT '',
      grp TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fqn TEXT NOT NULL,
      entry TEXT NOT NULL DEFAULT '',
      agent TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      ts TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inv_fqn ON invocation(fqn);
    CREATE INDEX IF NOT EXISTS idx_inv_ts ON invocation(ts);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    /* 标签：一个技能可挂多个标签（多对多），与分组互补 */
    CREATE TABLE IF NOT EXISTS tag (
      fqn TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (fqn, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(tag);
  `);
  // 旧库迁移：补 favorite / pinned 列
  ensureColumn('note', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('note', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
  return db;
}

export const getNotes = () => Object.fromEntries(
  store().prepare('SELECT * FROM note').all().map(r => [r.fqn, r]),
);

export function saveNote({ fqn, name, alias, usage, grp, code, favorite, pinned }) {
  if (!fqn) return null;
  const cur = store().prepare('SELECT * FROM note WHERE fqn = ?').get(fqn) || {};
  const row = {
    fqn,
    // 字段为 undefined 时保留旧值；显式传 '' 才算主动清空（不能用参数默认值，否则部分更新会把已有值顶成空）
    name: name ?? cur.name ?? '',
    alias: alias ?? cur.alias ?? '',
    usage: usage ?? cur.usage ?? '',
    grp: grp ?? cur.grp ?? '',
    code: code ?? cur.code ?? '',
    favorite: favorite ?? cur.favorite ?? 0,
    pinned: pinned ?? cur.pinned ?? 0,
    updated_at: new Date().toISOString(),
  };
  store().prepare(`INSERT INTO note (fqn,name,alias,usage,grp,code,favorite,pinned,updated_at)
    VALUES (@fqn,@name,@alias,@usage,@grp,@code,@favorite,@pinned,@updated_at)
    ON CONFLICT(fqn) DO UPDATE SET name=@name,alias=@alias,usage=@usage,grp=@grp,
      code=@code,favorite=@favorite,pinned=@pinned,updated_at=@updated_at`)
    .run(row);
  return row;
}

export function toggleFavorite(fqn) {
  const cur = store().prepare('SELECT favorite FROM note WHERE fqn = ?').get(fqn);
  const next = cur ? (cur.favorite ? 0 : 1) : 1;
  store().prepare(`INSERT INTO note (fqn,favorite,updated_at) VALUES (?,?,?)
    ON CONFLICT(fqn) DO UPDATE SET favorite=excluded.favorite,updated_at=excluded.updated_at`)
    .run(fqn, next, new Date().toISOString());
  return { favorite: Boolean(next) };
}

export function togglePinned(fqn) {
  const cur = store().prepare('SELECT pinned FROM note WHERE fqn = ?').get(fqn);
  const next = cur ? (cur.pinned ? 0 : 1) : 1;
  store().prepare(`INSERT INTO note (fqn,pinned,updated_at) VALUES (?,?,?)
    ON CONFLICT(fqn) DO UPDATE SET pinned=excluded.pinned,updated_at=excluded.updated_at`)
    .run(fqn, next, new Date().toISOString());
  return { pinned: Boolean(next) };
}

export function clearNote(fqn) {
  store().prepare('DELETE FROM note WHERE fqn = ?').run(fqn);
}

export function logInvocation({ fqn, entry = '', agent = '', source = 'hook' }) {
  if (!fqn) return;
  store().prepare('INSERT INTO invocation (fqn,entry,agent,source,ts) VALUES (?,?,?,?,?)')
    .run(fqn, entry, agent, source, new Date().toISOString());
}

/** 汇总：总数、按客户端、按技能、按技能×客户端、每日 */
export function stats() {
  const s = store();
  const rows = s.prepare(`
    SELECT fqn, COUNT(*) AS n, MIN(ts) AS first_ts, MAX(ts) AS last_ts
    FROM invocation GROUP BY fqn`).all();
  const daily = s.prepare(`
    SELECT substr(ts,1,10) AS d, COUNT(*) AS n FROM invocation
    WHERE ts >= datetime('now','-30 days') GROUP BY d ORDER BY d`).all();
  const total = s.prepare('SELECT COUNT(*) AS n FROM invocation').get().n;
  const byAgent = s.prepare('SELECT agent, COUNT(*) AS n FROM invocation GROUP BY agent').all();
  const bySkillAgent = s.prepare(`
    SELECT fqn, agent, COUNT(*) AS n FROM invocation
    GROUP BY fqn, agent`).all();
  const byAgentMap = {};
  for (const r of bySkillAgent) {
    if (!byAgentMap[r.fqn]) byAgentMap[r.fqn] = {};
    byAgentMap[r.fqn][r.agent || 'unknown'] = r.n;
  }
  return {
    total,
    byAgent: Object.fromEntries(byAgent.map(r => [r.agent || 'unknown', r.n])),
    bySkill: Object.fromEntries(rows.map(r => [r.fqn, { count: r.n, first: r.first_ts, last: r.last_ts, byAgent: byAgentMap[r.fqn] || {} }])),
    daily,
    since: s.prepare("SELECT MIN(ts) AS t FROM invocation").get()?.t || null,
  };
}

/** 清空调用记录（不影响备注与分组） */
export function clearInvocations() {
  const n = store().prepare('SELECT COUNT(*) AS c FROM invocation').get().c;
  store().prepare('DELETE FROM invocation').run();
  return n;
}

export function setMeta(k, v) {
  store().prepare('INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
}
export function getMeta(k) {
  return store().prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v ?? null;
}

/* ---------------- 标签（多对多） ---------------- */

/** 标签归一化：去 # 与首尾空白、压掉换行、限长 24 */
export function normTag(raw) {
  return String(raw || '').replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

/** { fqn: ['前端','高频'] } */
export function getTags() {
  const out = {};
  for (const r of store().prepare('SELECT fqn, tag FROM tag ORDER BY created_at, tag').all()) {
    (out[r.fqn] ||= []).push(r.tag);
  }
  return out;
}

/** 全部标签及使用次数：[{ tag, count }] */
export function allTags() {
  return store().prepare('SELECT tag, COUNT(*) AS count FROM tag GROUP BY tag ORDER BY count DESC, tag').all();
}

/** 覆盖式设置某技能的标签集合 */
export function setTags(fqn, list) {
  if (!fqn) return [];
  const tags = [...new Set((Array.isArray(list) ? list : []).map(normTag).filter(Boolean))];
  const s = store();
  s.prepare('DELETE FROM tag WHERE fqn = ?').run(fqn);
  const ins = s.prepare('INSERT OR IGNORE INTO tag (fqn,tag,created_at) VALUES (?,?,?)');
  const now = new Date().toISOString();
  for (const t of tags) ins.run(fqn, t, now);
  return tags;
}

export function addTag(fqn, tag) {
  const t = normTag(tag);
  if (!fqn || !t) return [];
  store().prepare('INSERT OR IGNORE INTO tag (fqn,tag,created_at) VALUES (?,?,?)').run(fqn, t, new Date().toISOString());
  return getTags()[fqn] || [];
}

export function removeTag(fqn, tag) {
  store().prepare('DELETE FROM tag WHERE fqn = ? AND tag = ?').run(fqn, normTag(tag));
  return getTags()[fqn] || [];
}

/** 批量打标：一个标签挂到多个技能上 */
export function batchAddTag(fqns, tag) {
  const t = normTag(tag);
  const list = Array.isArray(fqns) ? fqns.filter(Boolean) : [];
  if (!t || !list.length) return { tag: t, count: 0 };
  const ins = store().prepare('INSERT OR IGNORE INTO tag (fqn,tag,created_at) VALUES (?,?,?)');
  const now = new Date().toISOString();
  let n = 0;
  for (const f of list) n += ins.run(f, t, now).changes ? 1 : 0;
  return { tag: t, count: n };
}

/** 重命名标签（全库） */
export function renameTag(from, to) {
  const a = normTag(from), b = normTag(to);
  if (!a || !b || a === b) return { ok: false };
  const s = store();
  const rows = s.prepare('SELECT fqn FROM tag WHERE tag = ?').all();
  const ins = s.prepare('INSERT OR IGNORE INTO tag (fqn,tag,created_at) VALUES (?,?,?)');
  for (const r of rows) ins.run(r.fqn, b, new Date().toISOString());
  s.prepare('DELETE FROM tag WHERE tag = ?').run(a);
  return { ok: true, renamed: rows.length };
}

/** 彻底删除某标签（全库） */
export function dropTag(tag) {
  const t = normTag(tag);
  if (!t) return { ok: false };
  const n = store().prepare('DELETE FROM tag WHERE tag = ?').run(t).changes;
  return { ok: true, removed: n };
}
