/** 中文备注名 → ASCII 短码（方案 A）：取每个汉字拼音首字母，非汉字原样保留 */
let pinyinFn = null;
try {
  ({ pinyin: pinyinFn } = await import('pinyin-pro'));
} catch {
  pinyinFn = null; // 缺依赖时退化为“取英文技能名首字母”，功能不受阻
}

/** 拼音库是否可用：安装版若漏带 pinyin-pro，启动日志会给出提示 */
export const PINYIN_READY = Boolean(pinyinFn);

const SAFE = /^[a-z0-9]$/;

export function initialsOf(text) {
  let s = '';
  for (const ch of String(text || '')) {
    if (/[一-龥]/.test(ch)) {
      if (pinyinFn) {
        const r = pinyinFn(ch, { pattern: 'initial', toneType: 'none', type: 'string' }).trim();
        const c = (r || '?')[0].toLowerCase();
        if (SAFE.test(c)) s += c;
      }
    } else if (/[a-z0-9]/i.test(ch)) {
      s += ch.toLowerCase();
    }
  }
  return s.replace(/[^a-z0-9]/g, '').slice(0, 6);
}

/** 生成带前缀的稳定短命令；prefix 用于与内置命令、用户自有命令隔离 */
function makeCode(alias, fallbackName, prefix = 'ps') {
  const core = initialsOf(alias) || initialsOf(fallbackName) || 'sk';
  return `${prefix}-${core}`.slice(0, 20);
}

/** 备注名容错：外部若传进原始扫描结果（没有 alias 字段）也不会炸 */
const aliasOf = e => String(e?.alias ?? '').trim();

/** 同一个中文名下有多个技能时，保留“装得最全”的那个，其余标记冲突并让位 */
export function resolveAliasConflicts(entries) {
  const keeper = new Map();
  const ordered = [...entries].sort((a, b) =>
    (b.copies - a.copies) || (b.agentCount - a.agentCount) || a.fqn.localeCompare(b.fqn));
  for (const e of ordered) {
    const key = aliasOf(e);
    if (!key) continue;
    if (keeper.has(key)) e.conflictWith = keeper.get(key).fqn;
    else keeper.set(key, e);
  }
  return entries;
}

export const usableAliases = entries => entries.filter(e => aliasOf(e) && !e.conflictWith);

/** 解决短码撞车：重复时补序号；用户手填的短码原样使用 */
export function dedupeCodes(entries, prefix = 'ps') {
  const used = new Set();
  for (const e of entries) {
    if (!aliasOf(e)) { e.code = ''; continue; }
    const manual = (e.codeManual || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const base = manual || makeCode(e.alias, e.name, prefix);
    let code = base, i = 2;
    while (used.has(code)) code = `${base}-${i++}`;
    used.add(code);
    e.code = code;
  }
  return entries;
}
