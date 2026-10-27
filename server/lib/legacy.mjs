/** 首次启动时，把早期 CSV 版本（SkillDock 时代）已填的中文备注导入数据库。仅源码模式下可用 */
import fs from 'node:fs';
import path from 'node:path';
import { APP, RUNTIME } from './config.mjs';
import { getNotes, saveNote } from './store.mjs';

/** 旧 CSV 只可能出现在源码工作区里，安装版没有 */
const LEGACY = path.join(APP, '..', 'skill-alias', '中文名表.csv');

function splitCsvLine(line) {
  const out = []; let cell = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell);
  return out;
}

export function importLegacyCsv() {
  if (RUNTIME.packaged) return 0;
  if (Object.keys(getNotes()).length) return 0;
  if (!fs.existsSync(LEGACY)) return 0;

  const lines = fs.readFileSync(LEGACY, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 0;
  const head = splitCsvLine(lines[0]);
  const at = k => head.indexOf(k);

  let n = 0;
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const fqn = (c[at('全限定名')] || '').trim();
    const alias = (c[at('中文备注名')] || '').trim();
    const usage = (c[at('一句话用法')] || '').trim();
    const grp = (c[at('分组')] || '').trim();
    if (!fqn || (!alias && !usage && !grp)) continue;
    saveNote({ fqn, name: (c[at('技能真名')] || '').trim() || fqn, alias, usage, grp, code: '' });
    n += 1;
  }
  return n;
}
