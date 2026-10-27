import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { TagPill } from './ui/tag-pill';
import { IconStar, IconPin } from './ui/icons';
import type { Skill, StatEntry } from '../api';

// 列布局要和 App.tsx 里的 listHead 完全对齐
const row = cva('grid grid-cols-[32px_minmax(150px,1fr)_minmax(200px,1.6fr)_110px_minmax(210px,1.3fr)_92px_64px_64px] items-start gap-2 border-b border-line px-3 py-2.5', {
  variants: { state: {
    named: 'bg-card hover:bg-brand-weak/40',
    blank: 'bg-surface/45 hover:bg-surface',
  } },
  defaultVariants: { state: 'blank' },
});

const cell = cva('min-w-0');
const mono = cva('break-all font-mono text-[11.5px] leading-4 text-ink/90');
const sub = cva('mt-1 flex flex-wrap items-center gap-1');

/** 简单复制 */
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

export interface SkillRowProps {
  skill: Skill;
  stat?: StatEntry;
  groups: string[];
  trigger?: string;
  triggerEnd?: string;
  checked?: boolean;
  onCheckChange?: (checked: boolean) => void;
  onPatch: (patch: Partial<Pick<Skill, 'alias' | 'usage' | 'group' | 'code'>>) => void;
  onClear: () => void;
  onOpenDetail?: () => void;
  onToggleFav?: () => void;
  onTogglePin?: () => void;
}

export function SkillRow({
  skill, stat, trigger = '【', triggerEnd = '】', checked, onCheckChange,
  onPatch, onClear, onOpenDetail, onToggleFav, onTogglePin,
}: SkillRowProps) {
  const named = Boolean(skill.alias.trim());

  return (
    <div className={cn(row({ state: named ? 'named' : 'blank' }))}>
      {/* checkbox 列 */}
      <div className={cn(cell, 'pt-1.5')}>
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={e => onCheckChange?.(e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* 中文备注名 + 暗号 + 斜杠命令（可点击复制） */}
      <div className={cn(cell)}>
        <Input
          value={skill.alias}
          placeholder={skill.name}
          tone={named ? 'filled' : 'empty'}
          onChange={e => onPatch({ alias: e.target.value })}
        />
        <div className={cn(sub, 'text-[11px] text-muted')}>
          {skill.conflictWith
            ? <Badge tone="warn">中文名重复，已让位给 {skill.conflictWith}</Badge>
            : skill.alias
              ? <>
                <button
                  onClick={() => { void copy(`${trigger}${skill.alias}${triggerEnd}`); }}
                  className="inline-block"
                  title={`点击复制：${trigger}${skill.alias}${triggerEnd}`}
                >
                  <Badge tone="brand">{trigger}{skill.alias}{triggerEnd}</Badge>
                </button>
                {skill.code && (
                  <button
                    onClick={() => { void copy(`/${skill.code}`); }}
                    className="inline-block"
                    title={`点击复制：/${skill.code}`}
                  >
                    <Badge tone="line" className="font-mono">/{skill.code}</Badge>
                  </button>
                )}
              </>
              : <span className="opacity-60">未命名</span>}
        </div>
      </div>

      {/* 一句话用法 */}
      <div className={cn(cell)}>
        <Input
          value={skill.usage}
          placeholder="一句话说明它干什么、什么时候用"
          tone={skill.usage ? 'filled' : 'empty'}
          onChange={e => onPatch({ usage: e.target.value })}
        />
      </div>

      {/* 分组 + 标签 */}
      <div className={cn(cell)}>
        <Input
          value={skill.group}
          placeholder="分组"
          list="skillock-groups"
          tone={skill.group ? 'filled' : 'empty'}
          onChange={e => onPatch({ group: e.target.value })}
        />
        {skill.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {skill.tags.slice(0, 3).map(t => (
              <TagPill key={t} tone="solid" size="sm">#{t}</TagPill>
            ))}
            {skill.tags.length > 3 && <span className="text-[10.5px] text-muted">+{skill.tags.length - 3}</span>}
          </div>
        )}
      </div>

      {/* 真实技能名与来源 */}
      <div className={cn(cell)}>
        <div className={cn(mono, 'font-bold text-ink')}>{skill.fqn}</div>
        {skill.desc && (
          <div className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-muted" title={skill.desc}>{skill.desc}</div>
        )}
        <div className={cn(sub)}>
          <Badge tone="line">{skill.agents}</Badge>
          {skill.copies > 1 && <Badge tone="flat">{skill.copies} 份副本</Badge>}
          {skill.multiVersion && <Badge tone="warn">各副本版本不一致</Badge>}
        </div>
      </div>

      {/* 调用次数 */}
      <div className={cn(cell, 'text-right pt-1')}>
        <div className={cn('font-mono text-sm', stat?.count ? 'font-bold text-brand' : 'text-muted/50')}>
          {stat?.count ?? 0}
        </div>
        {stat?.last && <div className="text-[10.5px] text-muted">{stat.last.slice(5, 10)}</div>}
      </div>

      {/* 收藏/置顶图标 */}
      <div className={cn(cell, 'flex items-center justify-center gap-0.5 pt-1.5')}>
        <button
          className={cn('inline-flex h-6 w-6 items-center justify-center rounded hover:bg-surface',
            skill.favorite ? 'text-brand' : 'text-muted/40 hover:text-brand')}
          onClick={() => onToggleFav?.()}
          title={skill.favorite ? '取消收藏' : '收藏'}
        >
          <IconStar active={skill.favorite} />
        </button>
        <button
          className={cn('inline-flex h-6 w-6 items-center justify-center rounded hover:bg-surface',
            skill.pinned ? 'text-brand' : 'text-muted/40 hover:text-brand')}
          onClick={() => onTogglePin?.()}
          title={skill.pinned ? '取消置顶' : '置顶'}
        >
          <IconPin active={skill.pinned} />
        </button>
      </div>

      {/* 详情/清除 */}
      <div className={cn(cell, 'flex items-center justify-center gap-1 pt-1')}>
        <Button variant="ghost" size="sm" onClick={onOpenDetail} title="查看详情">详情</Button>
        {(named || skill.usage || skill.group) && (
          <Button variant="ghost" size="sm" onClick={onClear} title="清除备注">✕</Button>
        )}
      </div>
    </div>
  );
}
