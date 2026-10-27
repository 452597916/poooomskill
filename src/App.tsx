import { useCallback, useEffect, useMemo, useState } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './lib/cn';
import { api, type Skill, type StateResponse } from './api';
import { Button } from './components/ui/button';
import { Chip } from './components/ui/chip';
import { SearchInput } from './components/ui/search-input';
import { Input } from './components/ui/input';
import { Stat } from './components/ui/stat';
import { BrandMark } from './components/ui/brand';
import { Footer } from './components/ui/footer';
import { ThemeToggle } from './components/ui/theme-toggle';
import { SkillRow } from './components/SkillRow';
import { UsagePanel } from './components/UsagePanel';
import { ConnectPanel } from './components/ConnectPanel';
import { SkillDetail } from './components/SkillDetail';

const shell = cva('mx-auto w-full max-w-[1240px] px-5');
const panel = cva('grid gap-4');
const listWrap = cva('overflow-x-auto rounded-lg border border-line bg-card');
// 新增 checkbox 列 + 收藏/置顶列：col1=checkbox 32px, col2=备注, col3=用法, col4=分组, col5=真名与来源, col6=调用次数, col7=fav/pin, col8=详情
const listHead = cva('grid grid-cols-[32px_minmax(150px,1fr)_minmax(200px,1.6fr)_110px_minmax(210px,1.3fr)_92px_64px_64px] gap-2 border-b border-ink/15 bg-surface px-3 py-2 text-[11.5px] font-medium text-muted');
const toast = cva('fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-[13px] text-white shadow-lg');

type Tab = 'library' | 'usage' | 'connect';
type Filter = 'all' | 'named' | 'blank' | 'multi' | 'conflict' | 'favorite' | 'pinned';
type Sort = 'pinned' | 'copies' | 'used' | 'name';
type TagFilter = string;   // '' = 不限标签

/** ISO 时间 → 本地 HH:MM，用于「上次扫描」提示 */
const hhmm = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 聚焦搜索框（Ctrl+K 与搜索框快捷键提示共用） */
const focusSearch = () => {
  const el = document.getElementById('ps-search') as HTMLInputElement | null;
  el?.focus();
  el?.select();
};

export default function App() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [tab, setTab] = useState<Tab>('library');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('pinned');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [selectedFqn, setSelectedFqn] = useState<string | null>(null);
  const [selectedFqns, setSelectedFqns] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<TagFilter>('');
  const [batchTagInput, setBatchTagInput] = useState('');

  const reload = useCallback(async () => {
    setData(await api.state());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /* 全局快捷键：Ctrl/⌘+K 聚焦搜索框（与 C# 启动器的全局热键对应） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (tab !== 'library') { setTab('library'); window.setTimeout(() => focusSearch(), 60); }
        else focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3200); };

  const doRescan = () => {
    setBusy(true);
    api.rescan().then(reload).finally(() => setBusy(false));
  };

  const doGenerate = () => {
    setBusy(true);
    api.generate(true)
      .then(r => { flash('已写入：' + (r.written.join('、') || '无 agent 目录')); return reload(); })
      .finally(() => setBusy(false));
  };

  const patch = useCallback((fqn: string, p: Partial<Skill>) => {
    setData(d => d && ({ ...d, skills: d.skills.map(s => s.fqn === fqn ? { ...s, ...p } : s) }));
    const s = data?.skills.find(x => x.fqn === fqn);
    void api.saveNote({ fqn, name: s?.name, ...p }).then(reload).catch(() => flash('保存失败，请检查服务是否在运行'));
  }, [data, reload]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const qCompact = q.replace(/[\s-]/g, '');
    const list = data.skills.filter(s => {
      if (group === '__none__') { if (!(s.alias && !s.group)) return false; }
      else if (group && s.group !== group) return false;
      if (tagFilter && !s.tags.includes(tagFilter)) return false;
      if (filter === 'named' && !s.alias) return false;
      if (filter === 'blank' && s.alias) return false;
      if (filter === 'multi' && !(s.copies > 1)) return false;
      if (filter === 'conflict' && !s.conflictWith) return false;
      if (filter === 'favorite' && !s.favorite) return false;
      if (filter === 'pinned' && !s.pinned) return false;
      if (!q) return true;
      const hay = [s.alias, s.name, s.fqn, s.usage, s.group, s.desc, s.agents, s.code, s.py, s.tags.join(' ')].join(' ').toLowerCase();
      if (hay.includes(q)) return true;
      return qCompact.length >= 2 && hay.replace(/[\s-]/g, '').includes(qCompact);
    });
    const count = (fqn: string) => data.stats.bySkill[fqn]?.count ?? 0;
    return list.sort((a, b) => {
      // 置顶永远排最前
      if (sort === 'pinned') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.copies - a.copies || (a.alias || a.name).localeCompare(b.alias || b.name, 'zh');
      }
      if (sort === 'used') return count(b.fqn) - count(a.fqn);
      if (sort === 'name') return (a.alias || a.name).localeCompare(b.alias || b.name, 'zh');
      return b.copies - a.copies || a.name.localeCompare(b.name);
    });
  }, [data, query, group, tagFilter, filter, sort]);

  const named = data?.skills.filter(s => s.alias.trim()).length ?? 0;
  const dupFiles = data?.skills.reduce((n, s) => n + s.copies, 0) ?? 0;

  return (
    <div className="pb-16">
      <header className="sticky top-0 z-40 border-b border-line bg-page/92 backdrop-blur">
        <div className={cn(shell(), 'flex flex-wrap items-center gap-3 py-3')}>
          <div className="mr-2 flex items-center gap-2.5">
            <BrandMark size="lg" />
            <div>
              <div className="text-[15px] leading-5 font-bold">
                {data?.product ?? 'PoooomSkill'}
                <span className="ml-1 font-mono text-[11px] font-normal text-muted">v{data?.version ?? '1.2.1'}</span>
              </div>
              <div className="text-[11px] text-muted">{(data?.tagline ?? '本地 AI 技能管理台')} · 中文备注 · 暗号调用</div>
            </div>
          </div>
          <Button variant={tab === 'library' ? 'solid' : 'ghost'} size="sm" onClick={() => setTab('library')}>技能库</Button>
          <Button variant={tab === 'usage' ? 'solid' : 'ghost'} size="sm" onClick={() => setTab('usage')}>使用统计</Button>
          <Button variant={tab === 'connect' ? 'solid' : 'ghost'} size="sm" onClick={() => setTab('connect')}>接入与同步</Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[11px] text-muted lg:inline" title="技能清单只在启动与手动重扫时更新">
              上次扫描 {hhmm(data?.scannedAt)}
            </span>
            <ThemeToggle />
            <Button size="sm" disabled={busy} onClick={doRescan}>重新扫描</Button>
            <Button size="sm" variant="solid" disabled={busy || named === 0} onClick={doGenerate}>生成并写入</Button>
          </div>
        </div>
      </header>

      <main className={cn(shell(), 'pt-5')}>
        {!data ? (
          <div className="py-20 text-center text-muted">正在扫描本机技能目录…</div>
        ) : tab === 'library' ? (
          <div className={cn(panel())}>
            {data.conflicts.length > 0 && (
              <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[12.5px] text-ink">
                <b>有 {data.conflicts.length} 个中文名对应了多个技能</b>
                <span className="text-muted">（已自动选装得最全的那个，其余标记为让位；建议改成不同叫法以免歧义）</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {data.conflicts.map(c => (
                    <button key={c.alias} className="rounded border border-warn/40 bg-card px-2 py-0.5 font-mono text-[11.5px] text-warn"
                      onClick={() => { setFilter('conflict'); setQuery(c.alias); }}>
                      {c.alias} × {c.fqns.length}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat value={data.skills.length} label="去重后的技能数" hint={`物理文件 ${dupFiles} 份`} />
              <Stat value={named} label="已填中文备注名" tone="ink" hint={`还有 ${data.skills.length - named} 个待填`} />
              <Stat value={data.skills.filter(s => s.copies > 1).length} label="存在多份副本" tone="warn" hint="同一技能散落在不同 agent" />
              <Stat value={data.stats.total} label="累计调用记录" hint={data.stats.since ? `始于 ${data.stats.since.slice(0, 10)}` : '接入钩子后开始计数'} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                className="max-w-[340px]"
                id="ps-search"
                placeholder="搜索：中文名 / 拼音首字母 / 短命令 / 真名 / 分组 / 标签…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClear={() => setQuery('')}
              />
              <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-muted sm:inline">Ctrl+K</kbd>
              {query.trim() !== '' && (
                <span className="text-[12px] text-muted">匹配 {visible.length} 个</span>
              )}
              <Chip active={filter === 'all'} count={data.skills.length} onClick={() => setFilter('all')}>全部</Chip>
              <Chip active={filter === 'named'} count={named} onClick={() => setFilter('named')}>已备注</Chip>
              <Chip active={filter === 'blank'} count={data.skills.length - named} onClick={() => setFilter('blank')}>待备注</Chip>
              <Chip active={filter === 'favorite'} count={data.skills.filter(s => s.favorite).length} onClick={() => setFilter('favorite')}>⭐ 收藏</Chip>
              <Chip active={filter === 'pinned'} count={data.skills.filter(s => s.pinned).length} onClick={() => setFilter('pinned')}>📌 置顶</Chip>
              <Chip active={filter === 'multi'} count={data.skills.filter(s => s.copies > 1).length} onClick={() => setFilter('multi')}>多副本</Chip>
              <Chip active={filter === 'conflict'} count={data.skills.filter(s => s.conflictWith).length} onClick={() => setFilter('conflict')}>中文名冲突</Chip>
              <span className="mx-1 h-4 w-px bg-line" />
              <Chip active={sort === 'pinned'} onClick={() => setSort('pinned')}>置顶优先</Chip>
              <Chip active={sort === 'used'} onClick={() => setSort('used')}>按调用</Chip>
              <Chip active={sort === 'copies'} onClick={() => setSort('copies')}>按副本</Chip>
              <Chip active={sort === 'name'} onClick={() => setSort('name')}>按名称</Chip>
            </div>

            {/* 批量操作栏 */}
            {selectedFqns.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12.5px]">
                <span className="text-warn font-medium">已选中 {selectedFqns.size} 个</span>
                <Button size="sm" variant="ghost" onClick={() => setSelectedFqns(new Set())}>取消选择</Button>
                <span className="flex-1" />
                <Input
                  value={batchTagInput}
                  onChange={e => setBatchTagInput(e.target.value)}
                  list="skillock-tags"
                  placeholder="批量打标签…"
                  variant="box"
                  className="h-7 w-32 px-2 text-[12px]"
                />
                <Button size="sm" variant="outline" disabled={!batchTagInput.trim()} onClick={async () => {
                  const r = await api.batchTag([...selectedFqns], batchTagInput);
                  setBatchTagInput('');
                  await reload();
                  flash(`已给 ${r.count} 个技能加上 #${r.tag}`);
                }}>打标签</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(`确认从本机物理删除选中的 ${selectedFqns.size} 个技能？此操作不可恢复！`)) return;
                  await api.batchDelete([...selectedFqns]);
                  setSelectedFqns(new Set());
                  await reload();
                  flash('批量删除完成');
                }}>🗑 批量彻底清理</Button>
              </div>
            )}

            {/* 标签筛选：和分组互补的横切分类 */}
            {data.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">按标签筛选：</span>
                <Chip active={tagFilter === ''} onClick={() => setTagFilter('')}>全部标签</Chip>
                {data.tags.slice(0, 24).map(t => (
                  <Chip key={t.tag} active={tagFilter === t.tag} count={t.count} onClick={() => setTagFilter(tagFilter === t.tag ? '' : t.tag)}>
                    #{t.tag}
                  </Chip>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">按分组筛选：</span>
              <Chip active={group === ''} onClick={() => setGroup('')}>全部分组</Chip>
              {data.groups.map(g => (
                <Chip key={g} active={group === g} count={data.skills.filter(s => s.group === g).length} onClick={() => setGroup(group === g ? '' : g)}>{g}</Chip>
              ))}
              {data.skills.some(s => s.alias && !s.group) && (
                <Chip active={group === '__none__'} onClick={() => setGroup(group === '__none__' ? '' : '__none__')}>
                  已备注但未分组
                </Chip>
              )}
            </div>
            <div className={cn(listWrap())}>
              <div className={cn(listHead())}>
                <div><input type="checkbox" aria-label="全选" checked={visible.length > 0 && visible.every(s => selectedFqns.has(s.fqn))} onChange={e => {
                  if (e.target.checked) {
                    const next = new Set(selectedFqns); visible.forEach(s => next.add(s.fqn)); setSelectedFqns(next);
                  } else {
                    const next = new Set(selectedFqns); visible.forEach(s => next.delete(s.fqn)); setSelectedFqns(next);
                  }
                }} /></div>
                <div>中文备注名 / 短命令</div>
                <div>一句话用法</div>
                <div>分组</div>
                <div>真实技能名与来源</div>
                <div className="text-right">调用次数</div>
                <div className="text-center">⭐📌</div>
                <div className="text-center">详情</div>
              </div>
              {visible.map(s => (
                <SkillRow
                  key={s.fqn}
                  skill={s}
                  stat={data.stats.bySkill[s.fqn]}
                  groups={data.groups}
                  trigger={data.trigger}
                  triggerEnd={data.triggerEnd}
                  checked={selectedFqns.has(s.fqn)}
                  onCheckChange={v => {
                    const next = new Set(selectedFqns);
                    if (v) next.add(s.fqn); else next.delete(s.fqn);
                    setSelectedFqns(next);
                  }}
                  onPatch={p => patch(s.fqn, p)}
                  onClear={() => { void api.clearNote(s.fqn).then(reload); }}
                  onOpenDetail={() => setSelectedFqn(s.fqn)}
                  onToggleFav={async () => { const r = await api.toggleFavorite(s.fqn); patch(s.fqn, { favorite: r.favorite } as Partial<Skill>); }}
                  onTogglePin={async () => { const r = await api.togglePinned(s.fqn); patch(s.fqn, { pinned: r.pinned } as Partial<Skill>); }}
                />
              ))}
              {visible.length === 0 && <div className="py-12 text-center text-[13px] text-muted">没有匹配的技能</div>}
            </div>

            <datalist id="skillock-groups">
              {data.groups.map(g => <option key={g} value={g} />)}
            </datalist>
            <datalist id="skillock-tags">
              {data.tags.map(t => <option key={t.tag} value={t.tag} />)}
            </datalist>
          </div>
        ) : tab === 'usage' ? (
          <UsagePanel
            skills={data.skills}
            bySkill={data.stats.bySkill}
            byAgent={data.stats.byAgent}
            daily={data.stats.daily}
            total={data.stats.total}
            since={data.stats.since}
            onPick={() => setTab('library')}
            onClearStats={() => { void api.clearStats().then(reload); }}
          />
        ) : (
          <ConnectPanel state={data} busy={busy} onBusy={setBusy} onReload={reload} notify={flash} />
        )}
      </main>

      {data && <Footer state={data} />}

      {/* 详情模态 */}
      <SkillDetail
        fqn={selectedFqn}
        onClose={() => setSelectedFqn(null)}
        groups={data?.groups ?? []}
        tags={data?.tags ?? []}
        trigger={data?.trigger}
        triggerEnd={data?.triggerEnd}
        onChanged={() => { void reload(); }}
        onDeleted={() => { setSelectedFqns(s => { const n = new Set(s); if (selectedFqn) n.delete(selectedFqn); return n; }); void reload(); }}
      />

      {msg && <div className={cn(toast())}>{msg}</div>}
    </div>
  );
}
