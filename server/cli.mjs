#!/usr/bin/env node
/** PoooomSkill CLI —— 不开界面也能查技能、拿暗号、拿斜杠命令
 *
 * 用法：
 *   node server/cli.mjs list [--tag 标签] [--group 分组] [--named] [--limit 30] [--json]
 *   node server/cli.mjs find <关键词>         按中文名 / 拼音首字母 / 真名 / 标签模糊找
 *   node server/cli.mjs code <关键词>         只输出 /ps-xxx（便于脚本调用）
 *   node server/cli.mjs trigger <关键词>      只输出 【中文名】
 *   node server/cli.mjs stats                 累计调用与热门技能
 *   node server/cli.mjs groups | tags         列出分组 / 标签
 */
import { loadLibrary } from './lib/library.mjs';
import { stats, allTags, getNotes } from './lib/store.mjs';
import { getMeta } from './lib/store.mjs';
import { PRODUCT, VERSION } from './lib/config.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const rest = argv.slice(1);

const flag = name => rest.includes(name);
const opt = name => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => useColor ? `\u001b[${code}m${s}\u001b[0m` : s;
const dim = s => c('2', s);
const bold = s => c('1', s);
const brand = s => c('38;5;99', s);

const trigger = () => getMeta('trigger') || '【';
const triggerEnd = () => getMeta('trigger_end') ?? '】';

const skills = loadLibrary();

/** 位置参数：跳过 --flag 与被 --tag/--group/--limit 吃掉的值 */
const VALUE_OPTS = new Set(['--tag', '--group', '--limit']);
let arg = '';
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (VALUE_OPTS.has(a)) { i += 1; continue; }
  if (a.startsWith('--')) continue;
  arg = a;
  break;
}

/** 与界面一致的模糊匹配：中文名 / 拼音首字母 / 真名 / 短命令 / 标签 */
function match(s, q) {
  if (!q) return true;
  const qq = q.toLowerCase();
  const compact = qq.replace(/[\s-]/g, '');
  const hay = [s.alias, s.name, s.fqn, s.usage, s.group, s.tags.join(' '), s.code, s.py]
    .join(' ').toLowerCase();
  return hay.includes(qq) || (compact.length >= 2 && hay.replace(/[\s-]/g, '').includes(compact));
}

const label = s => s.alias || s.name;

function printList(list, limit) {
  const rows = list.slice(0, limit);
  if (!rows.length) { console.log(dim('没有匹配的技能')); return; }
  const w = Math.min(24, Math.max(...rows.map(s => [...label(s)].length)) + 2);
  for (const s of rows) {
    const name = label(s).padEnd(w, ' ');
    const code = s.code ? brand(`/${s.code}`) : dim('（无短命令）');
    const tags = s.tags.length ? dim('#' + s.tags.join(' #')) : '';
    const star = s.pinned ? '📌' : s.favorite ? '⭐' : '  ';
    console.log(`${star} ${name} ${code}  ${dim(s.fqn)}  ${tags}`);
  }
  if (list.length > rows.length) console.log(dim(`… 共 ${list.length} 个，已显示前 ${rows.length} 个（--limit 调整）`));
}

const sorted = [...skills].sort((a, b) =>
  (b.pinned - a.pinned) || (b.favorite - a.favorite) || (a.alias || a.name).localeCompare(b.alias || b.name, 'zh'));

switch (cmd) {
  case 'list': {
    const tag = opt('--tag'), grp = opt('--group');
    let list = sorted.filter(s => match(s, arg));
    if (flag('--named')) list = list.filter(s => s.alias);
    if (tag) list = list.filter(s => s.tags.includes(tag.replace(/^#/, '')));
    if (grp) list = list.filter(s => s.group === grp);
    const limit = Number(opt('--limit') || 30);
    if (flag('--json')) {
      console.log(JSON.stringify(list.slice(0, limit).map(s => ({
        fqn: s.fqn, alias: s.alias, usage: s.usage, group: s.group, tags: s.tags,
        code: s.code, agents: s.agents, copies: s.copies, path: s.path,
      })), null, 2));
    } else {
      console.log(bold(`${PRODUCT} v${VERSION}`) + dim(`  共 ${skills.length} 个技能，当前显示 ${Math.min(list.length, limit)} 个`));
      printList(list, limit);
    }
    break;
  }

  case 'find': {
    if (!arg) { console.log('用法：node server/cli.mjs find <关键词>'); break; }
    printList(sorted.filter(s => match(s, arg)), Number(opt('--limit') || 10));
    break;
  }

  case 'code': {
    const hit = sorted.find(s => match(s, arg));
    if (!hit || !hit.code) { console.error(dim('没找到带短命令的技能，先给它填个中文备注名既可')); process.exit(1); }
    process.stdout.write('/' + hit.code + '\n');
    break;
  }

  case 'trigger': {
    const hit = sorted.find(s => match(s, arg));
    if (!hit || !hit.alias) { console.error(dim('没找到带中文备注名的技能')); process.exit(1); }
    process.stdout.write(trigger() + hit.alias + triggerEnd() + '\n');
    break;
  }

  case 'stats': {
    const st = stats();
    const top = Object.entries(st.bySkill).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    console.log(bold('累计调用 ') + brand(String(st.total)) + dim(`  始于 ${st.since ? st.since.slice(0, 10) : '接入钩子后'}`));
    if (Object.keys(st.byAgent).length) {
      console.log(dim('按 agent：') + Object.entries(st.byAgent).map(([a, n]) => `${a} ${n}`).join(dim(' · ')));
    }
    if (top.length) {
      console.log('');
      for (const [fqn, v] of top) {
        const s = skills.find(x => x.fqn === fqn);
        const byAgent = Object.entries(v.byAgent || {}).map(([a, n]) => `${a}×${n}`).join(dim(' '));
        console.log(`${brand(String(v.count).padStart(4))}  ${(s ? label(s) : fqn)}  ${dim(fqn)}  ${dim(byAgent)}`);
      }
    } else {
      console.log(dim('还没有调用记录：先在界面「接入与同步」里装好钩子。'));
    }
    break;
  }

  case 'groups': {
    const map = new Map();
    for (const s of skills) if (s.group) map.set(s.group, (map.get(s.group) || 0) + 1);
    if (!map.size) { console.log(dim('还没有分组')); break; }
    for (const [g, n] of [...map].sort((a, b) => b[1] - a[1])) console.log(`${bold(g.padEnd(12))} ${dim(n + ' 个')}`);
    break;
  }

  case 'tags': {
    const tags = allTags();
    if (!tags.length) { console.log(dim('还没有标签')); break; }
    console.log(tags.map(t => `${brand('#' + t.tag)}${dim('×' + t.count)}`).join('  '));
    break;
  }

  case 'open': {
    const { spawn } = await import('node:child_process');
    const url = `http://127.0.0.1:${process.env.POOOOMSKILL_PORT || 5273}`;
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    console.log(dim('已在浏览器打开 ' + url));
    break;
  }

  default: {
    const notes = Object.keys(getNotes()).length;
    console.log(bold(`${PRODUCT} v${VERSION}`) + dim(`  ${skills.length} 个技能 / ${notes} 条备注`));
    console.log('');
    console.log('  node server/cli.mjs list [--tag 标签] [--group 分组] [--named] [--limit 30] [--json]');
    console.log('  node server/cli.mjs find <关键词>');
    console.log('  node server/cli.mjs code <关键词>      只输出 /ps-xxx');
    console.log('  node server/cli.mjs trigger <关键词>   只输出 【中文名】');
    console.log('  node server/cli.mjs stats | groups | tags | open');
  }
}
