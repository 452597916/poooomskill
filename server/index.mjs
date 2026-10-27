/** PoooomSkill · 本地服务（只监听 127.0.0.1，无任何外部网络依赖）
 *
 *  CLI（安装版由 PoooomSkill.exe 启动器代管界面与托盘）：
 *    node server/index.mjs --open        源码态：启动并打开界面窗口
 *    … --uninstall                       撤销写入的产物与钩子后退出
 *    … --status                          打印 JSON 状态后退出
 *    … --stop                            停止正在运行的实例后退出
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { APP, DATA_DIR, LOG_FILE, PRODUCT, TAGLINE, PUBLISHER, HOMEPAGE, CONTACT,
         COPYRIGHT, VERSION, RUNTIME, ensureDirs, HOME } from './lib/config.mjs';
import { scanAll, readSkillContent } from './lib/scan.mjs';
import { store, getNotes, saveNote, clearNote, stats, logInvocation, setMeta, getMeta, clearInvocations, toggleFavorite, togglePinned,
         getTags, allTags, setTags, addTag, removeTag, batchAddTag, renameTag, dropTag } from './lib/store.mjs';
import { mergeSkills } from './lib/library.mjs';
import { PINYIN_READY } from './lib/pinyin.mjs';
import { generate, allHookStates, enableHook, disableHook, uninstallAll, PENDING } from './lib/generate.mjs';
import { diffLines, compactDiff, diffStat } from './lib/diff.mjs';
import { importLegacyCsv } from './lib/legacy.mjs';
import { AGENTS } from './lib/config.mjs';

/* ---------------- 日志（GUI 子系统下没有控制台，必须落盘） ---------------- */
ensureDirs();
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* 忽略 */ }
  try { if (process.stdout?.writable) process.stdout.write(line + '\n'); } catch { /* GUI 模式无控制台 */ }
}

const migration = ensureDirs();
if (migration) log(`已从旧版目录迁移数据：${migration.from}（${migration.items} 项）`);

const imported = importLegacyCsv();
store();
const HOOK_AGENTS = Object.keys(AGENTS).filter(a => AGENTS[a].hookFile);
const PID_FILE = path.join(DATA_DIR, 'server.pid');
let wrotePid = false;
process.on('exit', () => { if (wrotePid) { try { fs.rmSync(PID_FILE, { force: true }); } catch { /* 忽略 */ } } });

/* ---------------- CLI 模式 ---------------- */
if (process.argv.includes('--stop')) {
  let pid = 0;
  try { pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim()); } catch { /* 没有记录 */ }
  if (pid > 0) {
    try { process.kill(pid); log(`已停止正在运行的实例（pid=${pid}）`); }
    catch (e) { log(`停止实例失败：${e.message}`); }
  } else {
    log('没有记录到正在运行的实例。');
  }
  try { fs.rmSync(PID_FILE, { force: true }); } catch { /* 忽略 */ }
  process.exit(0);
}
if (process.argv.includes('--uninstall')) {
  const removed = uninstallAll();
  log(`${PRODUCT} 已撤销写入：${removed.length} 个文件，并清理三家钩子条目`);
  process.exit(0);
}
if (process.argv.includes('--status')) {
  const hookStates = allHookStates();
  process.stdout.write(JSON.stringify({
    product: PRODUCT, version: VERSION, packaged: RUNTIME.packaged,
    dataDir: DATA_DIR, logFile: LOG_FILE,
    hooks: hookStates.map(h => ({ agent: h.agent, installed: h.installed })),
    invocationRows: stats().total,
  }, null, 2) + '\n');
  process.exit(0);
}

/* ---------------- 数据 ----------------
 * 技能清单只在两个时机重新扫描磁盘：
 *   1) 服务启动后的第一次读取（= 每次打开应用）
 *   2) 手动点「重新扫描」
 * 备注改动只重新合并一次数据库；窗口从托盘恢复、切换标签页等都不会重扫。 */
let scanCache = null;   // { at, skills }

const readTrigger = () => ({ trigger: getMeta('trigger') || '【', triggerEnd: getMeta('trigger_end') ?? '】' });

/** 摄入钩子写下的调用记录。同一秒内同技能同说法只算一次
 *  （Trae CN 会同时读自己的 hooks.json 与 ~/.claude/settings.json，导致一次调用被记两遍） */
function ingestPending() {
  if (!fs.existsSync(PENDING)) return 0;
  const lines = fs.readFileSync(PENDING, 'utf8').split('\n').filter(Boolean);
  if (!lines.length) return 0;
  const seen = new Set(
    store().prepare("SELECT fqn, entry, substr(ts,1,19) AS s FROM invocation WHERE ts > datetime('now','-1 day')")
      .all().map(r => `${r.fqn}|${r.entry}|${r.s}`),
  );
  let kept = 0;
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      const key = `${o.fqn}|${o.entry}|${String(o.ts).slice(0, 19)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      logInvocation(o);
      kept += 1;
    } catch { /* 忽略坏行 */ }
  }
  fs.writeFileSync(PENDING, '');
  return kept;
}

function loadSkills(force = false) {
  if (force || !scanCache) scanCache = { at: Date.now(), skills: scanAll() };
  return mergeSkills(scanCache.skills, getNotes(), getTags());
}

/* ---------------- HTTP ---------------- */
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
};

function serveStatic(req, res) {
  const dist = path.join(APP, 'dist');
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const fallback = path.join(dist, 'index.html');
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(fs.readFileSync(fallback));
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('未找到前端文件。若从源码运行，请先执行 npm run build。');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

async function readBody(req) {
  let raw = '';
  for await (const c of req) raw += c;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];

    if (url === '/api/state') {
      ingestPending();
      const skills = loadSkills();
      const byAlias = new Map();
      for (const s of skills) {
        const a = s.alias.trim();
        if (!a) continue;
        if (!byAlias.has(a)) byAlias.set(a, []);
        byAlias.get(a).push(s.fqn);
      }
      const { trigger, triggerEnd } = readTrigger();
      return json(res, 200, {
        product: PRODUCT, tagline: TAGLINE, version: VERSION,
        publisher: PUBLISHER, homepage: HOMEPAGE, contact: CONTACT, copyright: COPYRIGHT,
        runtime: RUNTIME.packaged ? '安装版' : '源码版',
        skills,
        stats: stats(),
        groups: [...new Set(skills.map(s => s.group).filter(Boolean))].sort(),
        tags: allTags(),
        conflicts: [...byAlias.entries()].filter(([, v]) => v.length > 1).map(([alias, fqns]) => ({ alias, fqns })),
        trigger, triggerEnd,
        hooks: allHookStates().map(h => ({ ...h, label: (AGENTS[h.agent] || {}).label || h.agent })),
        dataDir: DATA_DIR,
        logFile: LOG_FILE,
        scannedAt: new Date(scanCache.at).toISOString(),
      });
    }

    if (url === '/api/note' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.fqn) return json(res, 400, { error: '缺少 fqn' });
      saveNote({ fqn: b.fqn, name: b.name, alias: b.alias, usage: b.usage, grp: b.group, code: b.code });
      return json(res, 200, { ok: true });
    }

    if (url === '/api/note/clear' && req.method === 'POST') {
      const b = await readBody(req);
      clearNote(b.fqn);
      return json(res, 200, { ok: true });
    }

    if (url === '/api/note/toggle-favorite' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.fqn) return json(res, 400, { error: '缺少 fqn' });
      return json(res, 200, toggleFavorite(b.fqn));
    }

    if (url === '/api/note/toggle-pinned' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.fqn) return json(res, 400, { error: '缺少 fqn' });
      return json(res, 200, togglePinned(b.fqn));
    }

    if (url === '/api/group/rename' && req.method === 'POST') {
      const b = await readBody(req);
      for (const n of Object.values(getNotes())) {
        if (n.grp === b.from) saveNote({ fqn: n.fqn, name: n.name, grp: b.to, alias: n.alias, usage: n.usage, code: n.code });
      }
      return json(res, 200, { ok: true });
    }

    /* ---------------- 标签 ---------------- */
    if (url === '/api/tag' && req.method === 'POST') {
      // 覆盖式：{ fqn, tags: [] }
      const b = await readBody(req);
      if (!b.fqn) return json(res, 400, { error: '缺少 fqn' });
      return json(res, 200, { tags: setTags(b.fqn, b.tags) });
    }
    if (url === '/api/tag/add' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.fqn || !b.tag) return json(res, 400, { error: '缺少 fqn 或 tag' });
      return json(res, 200, { tags: addTag(b.fqn, b.tag) });
    }
    if (url === '/api/tag/remove' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.fqn || !b.tag) return json(res, 400, { error: '缺少 fqn 或 tag' });
      return json(res, 200, { tags: removeTag(b.fqn, b.tag) });
    }
    if (url === '/api/tag/batch' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, batchAddTag(b.fqns, b.tag));
    }
    if (url === '/api/tag/rename' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, renameTag(b.from, b.to));
    }
    if (url === '/api/tag/drop' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, dropTag(b.tag));
    }

    if (url === '/api/scan' && req.method === 'POST') {
      const skills = loadSkills(true);
      setMeta('last_scan', new Date().toISOString());
      return json(res, 200, { ok: true, count: skills.length });
    }

    if (url === '/api/generate' && req.method === 'POST') {
      const b = await readBody(req);
      ingestPending();
      return json(res, 200, generate(loadSkills(), { install: b.install !== false, ...readTrigger() }));
    }

    if (url === '/api/trigger' && req.method === 'POST') {
      const b = await readBody(req);
      const t = String(b.trigger ?? '【').slice(0, 2);
      const e = b.triggerEnd == null ? '】' : String(b.triggerEnd).slice(0, 2);
      setMeta('trigger', t);
      setMeta('trigger_end', e);
      const report = generate(loadSkills(), { install: true, trigger: t, triggerEnd: e });
      return json(res, 200, { trigger: t, triggerEnd: e, ...report });
    }

    if (url === '/api/hook/enable' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.agent === 'all') return json(res, 200, { results: HOOK_AGENTS.map(a => enableHook(a)) });
      return json(res, 200, enableHook(b.agent || 'claude'));
    }

    if (url === '/api/hook/disable' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.agent === 'all') return json(res, 200, { results: HOOK_AGENTS.map(a => disableHook(a)) });
      return json(res, 200, disableHook(b.agent || 'claude'));
    }

    if (url === '/api/uninstall' && req.method === 'POST') {
      return json(res, 200, { removed: uninstallAll() });
    }

    if (url === '/api/stats/clear' && req.method === 'POST') {
      const n = clearInvocations();
      if (fs.existsSync(PENDING)) fs.writeFileSync(PENDING, '');
      return json(res, 200, { ok: true, cleared: n });
    }

    if (url === '/api/skill' && req.method === 'GET') {
      // GET /api/skill?fqn=xxx（url 已去掉查询串）
      const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const fqn = q.get('fqn');
      if (!fqn) return json(res, 400, { error: '缺少 fqn 参数' });
      const skills = loadSkills();
      const skill = skills.find(s => s.fqn === fqn);
      if (!skill) return json(res, 404, { error: '技能不存在' });
      // 读取第一个副本的完整 SKILL.md
      const absPath = skill.absPaths?.[0] || path.join(HOME, skill.skillDirs?.[0] || '', 'SKILL.md');
      const content = readSkillContent(absPath);
      const stat = stats().bySkill[fqn];
      return json(res, 200, { skill, content, stat });
    }

    if (url === '/api/skill/diff') {
      // 对比同一技能的多份副本，返回原始文件差异
      const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const fqn = q.get('fqn');
      if (!fqn) return json(res, 400, { error: '缺少 fqn 参数' });
      const skills = loadSkills();
      const skill = skills.find(s => s.fqn === fqn);
      if (!skill) return json(res, 404, { error: '技能不存在' });

      const copies = (skill.absPaths || []).map((abs, i) => {
        let raw = '';
        try { raw = fs.readFileSync(abs, 'utf8'); } catch { /* 读不到就留空 */ }
        return { path: skill.paths?.[i] || abs, absPath: abs, raw };
      });
      if (copies.length < 2) return json(res, 200, { fqn, copies: copies.map(c => ({ path: c.path })), diffs: [] });

      const base = copies[0];
      const diffs = copies.slice(1).map(c => {
        const rows = diffLines(base.raw, c.raw);
        const st = diffStat(rows);
        return { path: c.path, basePath: base.path, added: st.added, removed: st.removed, rows: compactDiff(rows) };
      });
      return json(res, 200, { fqn, copies: copies.map(c => ({ path: c.path })), diffs });
    }

    if (url === '/api/delete' && req.method === 'POST') {
      // 物理删除：把本机该技能的所有副本 SKILL.md 都删掉，并删空相关目录
      const b = await readBody(req);
      if (!b.fqn) return json(res, 400, { error: '缺少 fqn' });
      const skills = loadSkills();
      const skill = skills.find(s => s.fqn === b.fqn);
      if (!skill) return json(res, 404, { error: '技能不存在' });
      const removed = [];
      for (const p of skill.absPaths || []) {
        try {
          if (fs.existsSync(p)) { fs.rmSync(p); removed.push(p); }
          const dir = path.dirname(p);
          try { if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* 目录非空忽略 */ }
        } catch (e) { log('物理删除失败', p, e.message); }
      }
      // 删完重扫，清掉 scanCache
      scanCache = null;
      return json(res, 200, { removed, count: removed.length });
    }

    if (url === '/api/batch-delete' && req.method === 'POST') {
      // 批量物理删除：fqn 数组
      const b = await readBody(req);
      const fqns = Array.isArray(b.fqns) ? b.fqns.filter(Boolean) : [];
      if (!fqns.length) return json(res, 400, { error: '缺少 fqns' });
      const skills = loadSkills();
      const removed = [];
      const skipped = [];
      for (const fqn of fqns) {
        const skill = skills.find(s => s.fqn === fqn);
        if (!skill) { skipped.push(fqn); continue; }
        for (const p of skill.absPaths || []) {
          try {
            if (fs.existsSync(p)) { fs.rmSync(p); removed.push(p); }
            const dir = path.dirname(p);
            try { if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* 忽略 */ }
          } catch (e) { log('批量删除失败', p, e.message); }
        }
      }
      scanCache = null;
      return json(res, 200, { removed, count: removed.length, skipped });
    }

    if (url.startsWith('/api/')) return json(res, 404, { error: '未知接口' });
    return serveStatic(req, res);
  } catch (e) {
    log('请求出错：', String(e && e.message || e));
    return json(res, 500, { error: String(e && e.message || e) });
  }
});

const PORT = Number(process.env.POOOOMSKILL_PORT || 5273);
const URL_BASE = `http://127.0.0.1:${PORT}`;

/** 用 Edge/Chrome 的应用窗口模式打开：没有地址栏，看起来就是本地程序
 *  仅源码态使用；安装态的窗口与托盘由 PoooomSkill.exe 启动器负责 */
function openWindow() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find(p => fs.existsSync(p));
  const profile = path.join(DATA_DIR, 'browser-profile');
  if (candidates) {
    spawn(candidates, [`--app=${URL_BASE}`, '--window-size=1320,880', `--user-data-dir=${profile}`], { detached: true, stdio: 'ignore' }).unref();
  } else {
    exec(`start "" "${URL_BASE}"`, () => { /* 忽略 */ });
  }
}

const srv = server.listen(PORT, '127.0.0.1', () => {
  log(`${PRODUCT} v${VERSION} 已启动：${URL_BASE}（${RUNTIME.packaged ? '安装版' : '源码版'}）`);
  log(`数据目录：${DATA_DIR}${imported ? `｜已导入旧表备注 ${imported} 条` : ''}`);
  if (!PINYIN_READY) log('提示：未加载 pinyin-pro，中文短码与拼音搜索将退化为英文名首字母');
  try { fs.writeFileSync(PID_FILE, String(process.pid), 'utf8'); wrotePid = true; } catch { /* 忽略 */ }
});

/** 端口被占用 = 已有一个实例在跑 */
srv.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    if (RUNTIME.packaged) {
      // 安装态：单实例与界面由启动器（互斥量）保证，这里只安静退出
      log('已有实例在运行，本进程退出。');
      process.exit(0);
    }
    log('检测到已在运行，直接打开界面。');
    openWindow();
    setTimeout(() => process.exit(0), 800);
  } else {
    log('启动失败：', err.message);
    process.exit(1);
  }
});

// 源码态：--open 时自行打开界面窗口（安装态的窗口由启动器统一管理）
if (process.argv.includes('--open') && !RUNTIME.packaged) openWindow();