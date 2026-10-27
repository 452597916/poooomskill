/** 极简行级 diff（LCS），零依赖；用于对比同一技能多份副本的差异 */

/** @returns {{type:'eq'|'add'|'del', text:string, a?:number, b?:number}[]} */
export function diffLines(aText, bText, { maxLines = 1500 } = {}) {
  const a = String(aText ?? '').split('\n');
  const b = String(bText ?? '').split('\n');
  // 超大文件不做 LCS，退化为整段替换，避免内存爆炸
  if (a.length > maxLines || b.length > maxLines) {
    return [
      ...a.map((t, i) => ({ type: 'del', text: t, a: i + 1 })),
      ...b.map((t, i) => ({ type: 'add', text: t, b: i + 1 })),
    ];
  }

  const n = a.length, m = b.length;
  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'eq', text: a[i], a: i + 1, b: j + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i], a: i + 1 }); i++; }
    else { out.push({ type: 'add', text: b[j], b: j + 1 }); j++; }
  }
  while (i < n) { out.push({ type: 'del', text: a[i], a: i + 1 }); i++; }
  while (j < m) { out.push({ type: 'add', text: b[j], b: j + 1 }); j++; }
  return out;
}

/** 只保留差异点附近的行（上下文折叠），便于界面直接渲染 */
export function compactDiff(rows, context = 3) {
  const keep = new Set();
  rows.forEach((r, idx) => {
    if (r.type === 'eq') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep.add(k);
  });
  const out = [];
  let gap = 0;
  rows.forEach((r, idx) => {
    if (keep.has(idx)) {
      if (gap) { out.push({ type: 'gap', text: `… 省略 ${gap} 行相同内容 …` }); gap = 0; }
      out.push(r);
    } else gap += 1;
  });
  if (gap) out.push({ type: 'gap', text: `… 省略 ${gap} 行相同内容 …` });
  return out;
}

/** 统计新增/删除行数 */
export function diffStat(rows) {
  return rows.reduce((s, r) => {
    if (r.type === 'add') s.added += 1;
    else if (r.type === 'del') s.removed += 1;
    return s;
  }, { added: 0, removed: 0 });
}
