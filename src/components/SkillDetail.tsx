import { useEffect, useState } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Modal } from './ui/modal';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Chip } from './ui/chip';
import { Input } from './ui/input';
import { TagPill } from './ui/tag-pill';
import { IconStar, IconPin } from './ui/icons';
import { api, type Skill, type StatEntry, type DiffResult } from '../api';

const metaRow = cva('flex items-center gap-2 py-1 text-[12px]');
const fieldLabel = cva('mb-1 text-[11px] text-muted');
const hint = cva('text-[11px] text-muted');
const diffPath = cva('break-all font-mono text-[11px]');
const codeBlock = cva('whitespace-pre-wrap break-words rounded-md border border-line bg-surface/60 p-3 font-mono text-[12.5px] leading-relaxed text-ink');
const diffLine = cva('whitespace-pre-wrap break-words px-2 py-0.5 font-mono text-[11.5px] leading-5', {
  variants: {
    kind: {
      add: 'bg-emerald-500/10 text-emerald-700',
      del: 'bg-rose-500/10 text-rose-700',
      eq: 'text-muted',
      gap: 'text-muted/60 italic',
    },
  },
  defaultVariants: { kind: 'eq' },
});

interface Props {
  fqn: string | null;
  onClose: () => void;
  groups: string[];
  /** 全库已有标签（带使用次数），用于点选 */
  tags?: { tag: string; count: number }[];
  trigger?: string;
  triggerEnd?: string;
  onChanged: (skill: Skill) => void;
  onDeleted: (fqn: string) => void;
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

const CopyBtn = ({ text, label, children }: { text: string; label: string; children: React.ReactNode }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { void copy(text).then(o => { if (o) { setDone(true); window.setTimeout(() => setDone(false), 1500); } }); }}
      title={`点击复制：${label}`}
      className="inline-flex items-center gap-1 hover:opacity-80 active:opacity-60"
    >
      {children}
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {done && <span className="ml-1 text-[11px] text-green-600">已复制</span>}
    </button>
  );
};

export function SkillDetail({ fqn, onClose, groups, tags: allTags = [], trigger = '【', triggerEnd = '】', onChanged, onDeleted }: Props) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [content, setContent] = useState<{ body: string; name: string; description: string; author: string } | null>(null);
  const [stat, setStat] = useState<StatEntry | undefined>();
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (!fqn) return;
    let alive = true;
    setLoading(true);
    setConfirmDelete(false);
    setTagInput('');
    setDiff(null);
    setShowDiff(false);
    api.skillDetail(fqn).then(r => {
      if (!alive) return;
      setSkill(r.skill); setContent(r.content); setStat(r.stat);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fqn]);

  /** 打开差异对比时才现算，避免每次开详情都读多份文件 */
  const openDiff = async () => {
    if (!skill) return;
    if (showDiff) { setShowDiff(false); return; }
    setShowDiff(true);
    if (diff) return;
    setDiffLoading(true);
    try { setDiff(await api.skillDiff(skill.fqn)); }
    finally { setDiffLoading(false); }
  };

  const patch = async (p: Partial<Skill>) => {
    if (!skill) return;
    const next = { ...skill, ...p };
    setSkill(next);
    await api.saveNote({ fqn: skill.fqn, alias: next.alias, usage: next.usage, group: next.group });
    onChanged(next);
  };
  const toggleFav = async () => {
    if (!skill) return;
    const r = await api.toggleFavorite(skill.fqn);
    const next = { ...skill, favorite: r.favorite };
    setSkill(next); onChanged(next);
  };
  const togglePin = async () => {
    if (!skill) return;
    const r = await api.togglePinned(skill.fqn);
    const next = { ...skill, pinned: r.pinned };
    setSkill(next); onChanged(next);
  };
  const onDelete = async () => {
    if (!skill) return;
    await api.deleteSkill(skill.fqn);
    onDeleted(skill.fqn);
    onClose();
  };

  /* ---- 标签 ---- */
  const addTagToSkill = async (raw: string) => {
    const t = raw.trim().replace(/^#+/, '');
    if (!skill || !t) return;
    const r = await api.addTag(skill.fqn, t);
    const next = { ...skill, tags: r.tags };
    setSkill(next); onChanged(next);
    setTagInput('');
  };
  const removeTagFromSkill = async (t: string) => {
    if (!skill) return;
    const r = await api.removeTag(skill.fqn, t);
    const next = { ...skill, tags: r.tags };
    setSkill(next); onChanged(next);
  };

  if (!fqn) return null;
  return (
    <Modal
      open={Boolean(fqn)}
      onClose={onClose}
      title={loading ? '加载中…' : (skill?.alias || skill?.fqn || '技能详情')}
      size="xl"
      footer={
        <>
          {!confirmDelete ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>🗑 彻底清理本地副本</Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-warn">确认物理删除 {skill?.absPaths?.length || 0} 个副本？不可恢复</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>取消</Button>
              <Button variant="danger" size="sm" onClick={onDelete}>确认删除</Button>
            </div>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </>
      }
    >
      {loading && <div className="py-10 text-center text-muted">正在读取技能详情…</div>}
      {!loading && !skill && <div className="py-10 text-center text-muted">未找到该技能（可能已被清理）</div>}

      {skill && content && (
        <div className="space-y-5">
          {/* 顶部：暗号 + 斜杠命令 + 收藏/置顶 */}
          <div className="flex flex-wrap items-center gap-2">
            {skill.alias ? (
              <>
                <CopyBtn
                  text={`${trigger}${skill.alias}${triggerEnd}`}
                  label={`${trigger}${skill.alias}${triggerEnd}`}
                >
                  <span className="rounded border border-brand/40 bg-brand-weak px-2 py-1 text-[12px] font-medium text-brand">{trigger}{skill.alias}{triggerEnd}</span>
                </CopyBtn>
                {skill.code && (
                  <CopyBtn text={`/${skill.code}`} label={`/${skill.code}`}>
                    <span className="rounded border border-line bg-card px-2 py-1 font-mono text-[12px] text-muted hover:border-brand hover:text-brand">/{skill.code}</span>
                  </CopyBtn>
                )}
              </>
            ) : <span className="text-[12px] text-muted italic">未填中文备注名</span>}

            <span className="ml-auto flex items-center gap-1.5">
              <button
                className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md border', skill.favorite ? 'border-brand bg-brand-weak text-brand' : 'border-line bg-card text-muted hover:text-brand')}
                onClick={toggleFav} title={skill.favorite ? '取消收藏' : '收藏'}
              >
                <IconStar active={skill.favorite} />
              </button>
              <button
                className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md border', skill.pinned ? 'border-brand bg-brand-weak text-brand' : 'border-line bg-card text-muted hover:text-brand')}
                onClick={togglePin} title={skill.pinned ? '取消置顶' : '置顶'}
              >
                <IconPin active={skill.pinned} />
              </button>
            </span>
          </div>

          {/* 真名 + 作者 + 来源 */}
          <div className={metaRow()}>
            <span className="font-bold text-ink">{skill.fqn}</span>
            {skill.realName && skill.realName !== skill.name && <Badge tone="flat">本名 {skill.realName}</Badge>}
          </div>
          {content.author && <div className={metaRow()}><span className="text-muted">作者</span><span>{content.author}</span></div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="line">{skill.agents}</Badge>
            {skill.copies > 1 && <Badge tone="flat">{skill.copies} 份副本</Badge>}
            {skill.multiVersion && <Badge tone="warn">各副本版本不一致</Badge>}
          </div>

          {/* 备注编辑区 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className={cn(fieldLabel())}>中文备注名</div>
              <Input variant="box" value={skill.alias} placeholder={skill.name} onChange={e => patch({ alias: e.target.value })} />
            </div>
            <div>
              <div className={cn(fieldLabel())}>分组</div>
              <Input variant="box" value={skill.group} list="skillock-groups" placeholder="（留空=未分组）" onChange={e => patch({ group: e.target.value })} />
              {groups.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {groups.map(g => (
                    <Chip key={g} active={skill.group === g} onClick={() => patch({ group: skill.group === g ? '' : g })}>{g}</Chip>
                  ))}
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <div className={cn(fieldLabel())}>一句话用法</div>
              <Input variant="box" value={skill.usage} placeholder="如：把页面重做一版" onChange={e => patch({ usage: e.target.value })} />
            </div>
          </div>

          {/* 标签（多对多，和分组互补） */}
          <div>
            <div className={cn(fieldLabel())}>标签（可挂多个，补充分组做不到的横切分类）</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {skill.tags.map(t => (
                <TagPill key={t} onRemove={() => { void removeTagFromSkill(t); }}>#{t}</TagPill>
              ))}
              <form onSubmit={e => { e.preventDefault(); void addTagToSkill(tagInput); }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  list="skillock-tags"
                  placeholder="+ 新标签"
                  className="h-6 w-24 rounded-full border border-dashed border-line bg-transparent px-2 text-[12px] text-ink outline-none placeholder:text-muted/60 focus:border-brand"
                />
              </form>
            </div>
            {allTags.filter(x => !skill.tags.includes(x.tag)).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {allTags.filter(x => !skill.tags.includes(x.tag)).slice(0, 10).map(x => (
                  <button key={x.tag} onClick={() => { void addTagToSkill(x.tag); }} className="hover:opacity-75" title={`加上 #${x.tag}`}>
                    <TagPill tone="ghost">+ {x.tag}<span className="opacity-50">{x.count}</span></TagPill>
                  </button>
                ))}
              </div>
            )}
            <datalist id="skillock-tags">
              {allTags.map(x => <option key={x.tag} value={x.tag} />)}
            </datalist>
          </div>

          {/* 调用统计 */}
          <div className="rounded-md border border-line bg-surface/40 p-3">
            <div className="mb-2 text-[12px] font-medium text-muted">调用统计</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-center">
                <div className="font-mono text-2xl font-bold text-brand">{stat?.count ?? 0}</div>
                <div className={cn(hint())}>累计次数</div>
              </div>
              {stat?.first && <div className={cn(hint())}>首次 {stat.first.slice(0, 10)}</div>}
              {stat?.last && <div className={cn(hint())}>最近 {stat.last.slice(0, 10)}</div>}
            </div>
            {stat?.byAgent && Object.keys(stat.byAgent).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(stat.byAgent).map(([a, n]) => (
                  <Badge key={a} tone="line">{a} · {n}次</Badge>
                ))}
              </div>
            )}
          </div>

          {/* 副本路径 */}
          {skill.paths.length > 0 && (
            <div>
              <div className={cn(fieldLabel())}>本机副本（{skill.paths.length}）</div>
              <div className="space-y-0.5">
                {skill.paths.map((p, i) => (
                  <div key={i} className={cn(metaRow(), 'py-0 font-mono text-[11.5px]')}>
                    <span className="break-all">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 版本差异（多副本时才出现） */}
          {skill.copies > 1 && (
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={cn(hint())}>版本差异</span>
                <Button variant="ghost" size="sm" onClick={() => { void openDiff(); }}>{showDiff ? '收起对比' : '展开对比'}</Button>
                {skill.multiVersion && <Badge tone="warn">各副本内容不一致</Badge>}
              </div>
              {showDiff && (
                diffLoading ? <div className="py-4 text-center text-[12px] text-muted">正在比对…</div>
                  : diff && diff.diffs.length > 0 ? (
                    <div className="space-y-3">
                      {diff.diffs.map(d => (
                        <div key={d.path} className="overflow-hidden rounded-md border border-line">
                          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-1 text-[11px]">
                            <span className="text-muted">基准</span>
                            <span className={cn(diffPath())}>{d.basePath}</span>
                            <span className="text-muted">↔</span>
                            <span className={cn(diffPath())}>{d.path}</span>
                            <span className="ml-auto shrink-0 font-mono text-emerald-600">+{d.added}</span>
                            <span className="shrink-0 font-mono text-rose-600">-{d.removed}</span>
                          </div>
                          <div className="max-h-64 overflow-auto py-1">
                            {d.rows.map((r, i) => (
                              <div key={i} className={cn(diffLine({ kind: r.type }))}>
                                {r.type === 'add' ? '+ ' : r.type === 'del' ? '- ' : r.type === 'gap' ? '' : '  '}{r.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-line bg-surface/40 px-3 py-2 text-[12px] text-muted">
                      {diff && diff.diffs.length === 0 ? '各副本内容完全一致，无需对比。' : '暂时读不到副本内容。'}
                    </div>
                  )
              )}
            </div>
          )}

          {/* SKILL.md 全文 */}
          <div>
            <div className={cn(fieldLabel())}>SKILL.md 全文</div>
            <pre className={codeBlock()}>{content.body}</pre>
          </div>
        </div>
      )}
    </Modal>
  );
}
