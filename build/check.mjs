/** PoooomSkill 全局自检
 *  用法：npm run check        （服务未启动时只做静态检查）
 *        npm run check -- --api   （服务在跑时，额外逐个实测 HTTP 接口）
 *
 *  检查项：
 *    1. 关键文件是否齐全
 *    2. 所有服务端/构建脚本的语法（node --check）
 *    3. 旧品牌名是否还有残留（区分「有意保留」的迁移代码）
 *    4. 产物生成逻辑能否无异常跑通（干跑，不写入 agent）
 *    5. HTTP 接口逐个体测（--api）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.POOOOMSKILL_PORT || 5273);
const BASE = `http://127.0.0.1:${PORT}`;
const withApi = process.argv.includes('--api');

let pass = 0, fail = 0, warn = 0;
const ok = m => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`); };
const bad = m => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const wrn = m => { warn++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const head = t => console.log(`\n\x1b[36m${t}\x1b[0m`);

/* ---------- 1. 关键文件 ---------- */
head('1. 关键文件');
const required = [
  'package.json',
  'index.html',
  'vite.config.ts',
  'LICENSE',
  '.gitignore',
  '.gitattributes',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  'docs/产品介绍.md',
  'server/index.mjs',
  'server/lib/config.mjs',
  'server/lib/scan.mjs',
  'server/lib/store.mjs',
  'server/lib/generate.mjs',
  'server/lib/pinyin.mjs',
  'server/lib/legacy.mjs',
  'src/main.tsx',
  'src/App.tsx',
  'src/api.ts',
  'src/components/ui/button.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/chip.tsx',
  'src/components/ui/stat.tsx',
  'src/components/ui/search-input.tsx',
  'src/components/ui/brand.tsx',
  'src/components/ui/footer.tsx',
  'src/components/SkillRow.tsx',
  'src/components/UsagePanel.tsx',
  'src/components/ConnectPanel.tsx',
  'brand/mark.svg',
  'build/launcher.cs',
  'build/launcher.manifest',
  'build/installer.iss',
  'build/make-icon.mjs',
  'build/prepare-runtime.mjs',
  'build/ChineseSimplified.isl',
  'build/LICENSE-node.txt',
];
for (const f of required) {
  fs.existsSync(path.join(ROOT, f)) ? ok(f) : bad(`缺少 ${f}`);
}

// 中文拼音是服务端唯一运行时依赖：打包漏掉它，安装态短码会退化成英文名首字母
fs.readFileSync(path.join(ROOT, 'build/prepare-runtime.mjs'), 'utf8').includes("'pinyin-pro'")
  ? ok('打包脚本会随包分发 pinyin-pro（中文拼音短码）')
  : bad('打包脚本缺少 pinyin-pro 分发，安装态短码将退化');

/* ---------- 2. 语法检查 ---------- */
head('2. 语法检查（node --check）');
const targets = [];
for (const dir of ['server', 'build']) {
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'staging') walk(p); }
      else if (/\.(mjs|cjs|js)$/.test(e.name)) targets.push(p);
    }
  };
  walk(path.join(ROOT, dir));
}
for (const f of targets) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', windowsHide: true });
  if (r.status === 0) ok(path.relative(ROOT, f));
  else bad(`${path.relative(ROOT, f)} → ${(r.stderr || '').split('\n').slice(0, 3).join(' ')}`);
}

/* ---------- 3. 品牌名残留 ---------- */
head('3. 旧品牌名残留检查');
const legacyAllowed = [/LEGACY/i, /migrate/i, /迁移/, /SkillDock/, /skilldock/, /skill-alias/, /skillock/];
const scanForOld = [];
const walkText = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'staging', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkText(p);
    else if (/\.(mjs|cjs|js|tsx|ts|json|html|iss|cs)$/.test(e.name) && !/package-lock/.test(e.name)) scanForOld.push(p);
  }
};
for (const d of ['server', 'src', 'build']) walkText(path.join(ROOT, d));
scanForOld.push(path.join(ROOT, 'index.html'));

let stale = 0;
for (const f of scanForOld) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/技能坞|SkillDock/.test(line)) return;
    if (legacyAllowed.some(re => re.test(line))) return;   // 迁移/清理逻辑里出现是正常的
    stale++;
    wrn(`${path.relative(ROOT, f)}:${i + 1} 仍含旧名 → ${line.trim().slice(0, 90)}`);
  });
}
if (!stale) ok('界面与生成模板里已无旧品牌名残留（迁移与清理代码除外）');

/* ---------- 4. 生成逻辑干跑 ---------- */
head('4. 产物生成逻辑干跑（不写入 agent）');
try {
  const { scanAll } = await import(new URL('../server/lib/scan.mjs', import.meta.url).href);
  const { generate } = await import(new URL('../server/lib/generate.mjs', import.meta.url).href);
  const { AGENTS } = await import(new URL('../server/lib/config.mjs', import.meta.url).href);

  const skills = scanAll();
  skills.length > 0 ? ok(`扫描到 ${skills.length} 个去重技能`) : bad('没扫描到任何技能，扫描逻辑可能有问题');

  const named = skills.map((s, i) => ({ ...s, alias: i < 10 ? `测试别名${i}` : '', usage: '', group: '', code: '', conflictWith: undefined }));
  const namedCount = named.filter(s => s.alias && !s.conflictWith).length;
  ok(`构造出 ${namedCount} 条可用别名用于干跑`);

  const report = generate(named, { install: false });
  report.aliased === namedCount ? ok(`generate() 正常返回，别名 ${report.aliased} 条`) : bad(`generate() 别名数不符：${report.aliased} ≠ ${namedCount}`);

  const out = report.outDir;
  const files = ['alias-index.json', 'hooks-snippet.json', '别名对照表.md',
    `../` + path.basename(out) + '/poooomskill-alias/SKILL.md'];
  fs.existsSync(path.join(out, 'alias-index.json')) ? ok('别名索引已生成') : bad('别名索引缺失');
  fs.existsSync(path.join(out, 'hook', 'pretool.mjs')) ? ok('兜底钩子脚本已生成') : bad('兜底钩子缺失');
  fs.existsSync(path.join(out, 'hook', 'userprompt.mjs')) ? ok('暗号钩子脚本已生成') : bad('暗号钩子缺失');
  fs.existsSync(path.join(out, 'poooomskill-alias', 'SKILL.md')) ? ok('中文解析技能已生成') : bad('解析技能缺失');
  fs.existsSync(path.join(out, 'commands')) ? ok('斜杠命令目录已生成') : bad('命令目录缺失');

  // 钩子脚本语法
  for (const h of ['pretool.mjs', 'userprompt.mjs', 'record.mjs']) {
    const r = spawnSync(process.execPath, ['--check', path.join(out, 'hook', h)], { encoding: 'utf8', windowsHide: true });
    r.status === 0 ? ok(`钩子语法正常：${h}`) : bad(`钩子语法错误 ${h}：${(r.stderr || '').slice(0, 200)}`);
  }

  // 钩子行为：暗号识别与静默
  const hook = path.join(out, 'hook', 'userprompt.mjs');
  const run = payload => spawnSync(process.execPath, [hook, 'selfcheck'], { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true }).stdout.trim();
  const hit = run({ hook_event_name: 'UserPromptSubmit', prompt: '【测试别名0】帮我看看' });
  hit.includes('alias-index') === false && hit.includes('additionalContext') ? ok('暗号命中并注入了真名指令') : bad(`暗号未命中：${hit.slice(0, 120)}`);
  run({ hook_event_name: 'UserPromptSubmit', prompt: '我要做首页、前端设计要好看' }) === '' ? ok('普通句子（含顿号）不误触发') : bad('误触发：普通句子被判成调用');
  run({ hook_event_name: 'UserPromptSubmit', prompt: '【不存在的名字】看看' }) === '' ? ok('括号里非技能名时不干预') : bad('括号内非技能名时错误干预');

  const pre = path.join(out, 'hook', 'pretool.mjs');
  const preOut = spawnSync(process.execPath, [pre, 'selfcheck'], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { name: '测试别名1' } }),
    encoding: 'utf8', windowsHide: true,
  }).stdout.trim();
  preOut.includes('updatedInput') ? ok('中文别名能被兜底改写为真名') : bad(`兜底改写失败：${preOut.slice(0, 120)}`);

  // 配置里引用的是哪套命令
  const snippet = JSON.parse(fs.readFileSync(path.join(out, 'hooks-snippet.json'), 'utf8'));
  const cmd = snippet.claude.hooks.PreToolUse[0].hooks[0].command;
  ok(`钩子命令（${process.execPath.toLowerCase().includes('node.exe') ? '源码态' : '安装态'}）：${cmd.slice(0, 100)}…`);
  Object.keys(snippet).length >= 3 ? ok(`三家 hook 模板齐备：${Object.keys(snippet).join('、')}`) : bad('hook 模板缺失');
} catch (e) {
  bad('生成逻辑干跑抛异常：' + e.message);
}

/* ---------- 5. HTTP 接口 ---------- */
head(withApi ? '5. HTTP 接口实测' : '5. HTTP 接口（加 --api 参数可实测）');
if (!withApi) {
  console.log('  已跳过（服务未启动时属正常）');
} else {
  const j = async (m, u, b) => {
    const r = await fetch(BASE + u, {
      method: m,
      headers: { 'content-type': 'application/json' },
      body: m === 'POST' ? JSON.stringify(b || {}) : undefined,
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  try {
    const state = await j('GET', '/api/state');
    state.status === 200 ? ok('/api/state 正常') : bad(`/api/state 返回 ${state.status}`);
    const s = state.data;
    ['product', 'version', 'publisher', 'homepage', 'contact', 'copyright', 'runtime', 'skills', 'stats', 'hooks', 'scannedAt']
      .forEach(k => (k in s ? ok(`状态含字段 ${k} = ${typeof s[k] === 'object' ? '…' : s[k]}`) : bad(`状态缺字段 ${k}`)));
    s.skills?.length > 0 ? ok(`技能清单 ${s.skills.length} 条`) : bad('技能清单为空');
    Array.isArray(s.hooks) && s.hooks.length >= 3 ? ok(`钩子状态 ${s.hooks.length} 条`) : bad('钩子状态异常');
    typeof s.skills[0].py === 'string' ? ok('技能条目含拼音首字母字段（供搜索）') : bad('技能条目缺 py 字段');

    // 扫描时机：重复读取不应重扫；手动扫描才刷新（用户反馈的"扫描太频繁"回归用例）
    const scan0 = (await j('GET', '/api/state')).data.scannedAt;
    await new Promise(r => setTimeout(r, 1200));
    const scan1 = (await j('GET', '/api/state')).data.scannedAt;
    scan0 === scan1 ? ok('重复读取不会重扫（scannedAt 保持不变）') : bad('每次读取都在重新扫描');
    await j('POST', '/api/scan');
    const scan2 = (await j('GET', '/api/state')).data.scannedAt;
    scan2 !== scan1 ? ok('手动「重新扫描」会刷新 scannedAt') : bad('手动扫描未刷新');

    const probe = s.skills.find(x => !x.alias) || s.skills[0];
    const saved = await j('POST', '/api/note', { fqn: probe.fqn, name: probe.name, alias: '自检临时名', usage: '自检用法', group: '自检组' });
    saved.status === 200 ? ok('/api/note 写入正常') : bad(`/api/note 返回 ${saved.status}`);
    const after = (await j('GET', '/api/state')).data.skills.find(x => x.fqn === probe.fqn);
    after?.alias === '自检临时名' ? ok('写入后能读回（含中文）') : bad('写入未生效');
    const cleared = await j('POST', '/api/note/clear', { fqn: probe.fqn });
    cleared.status === 200 ? ok('/api/note/clear 正常') : bad(`/api/note/clear 返回 ${cleared.status}`);
    const after2 = (await j('GET', '/api/state')).data.skills.find(x => x.fqn === probe.fqn);
    (after2?.alias || '') === '' ? ok('清除后恢复为空') : bad('清除未生效');

    const trg = await j('POST', '/api/trigger', { trigger: '【', triggerEnd: '】' });
    trg.status === 200 && trg.data.trigger === '【' ? ok('/api/trigger 正常（当前 【 】）') : bad(`/api/trigger 返回 ${trg.status}`);

    const hooks = await j('POST', '/api/hook/enable', { agent: 'all' });
    hooks.status === 200 && Array.isArray(hooks.data.results) ? ok(`/api/hook/enable all 正常（${hooks.data.results.map(r => r.agent + (r.ok ? '✓' : '✗')).join(' ')}）`) : bad('/api/hook/enable 异常');

    const scan = await j('POST', '/api/scan');
    scan.status === 200 ? ok(`/api/scan 正常，扫描 ${scan.data.count} 条`) : bad(`/api/scan 返回 ${scan.status}`);

    const gen = await j('POST', '/api/generate', { install: false });
    gen.status === 200 ? ok(`/api/generate 正常（别名 ${gen.data.aliased} 条）`) : bad(`/api/generate 返回 ${gen.status}`);

    const bad404 = await j('GET', '/api/不存在');
    bad404.status === 404 ? ok('未知接口返回 404') : bad(`未知接口返回 ${bad404.status}`);

    const page = await fetch(BASE + '/');
    const html = await page.text();
    page.status === 200 && html.includes('PoooomSkill') ? ok('首页可访问且含产品名') : bad('首页异常');

    const ico = await fetch(BASE + '/favicon.ico');
    ico.status === 200 && (await ico.arrayBuffer()).byteLength > 1000 ? ok('favicon.ico 可访问') : wrn('favicon.ico 不可访问（不影响功能）');
  } catch (e) {
    bad('接口实测失败（服务没在跑？）：' + e.message);
  }
}

/* ---------- 汇总 ---------- */
console.log(`\n\x1b[1m结果：通过 ${pass} 项，失败 ${fail} 项，提示 ${warn} 项\x1b[0m`);
if (fail) { console.log('\x1b[31m存在失败项，请先修复再打包。\x1b[0m'); process.exit(1); }
console.log('\x1b[32m静态检查全部通过。\x1b[0m');