import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { Skill, StatEntry } from '../api';

const AGENT_LABEL: Record<string, string> = { claude: 'Claude Code', trae: 'Trae CN', codex: 'Codex' };
const bar = cva('h-1.5 rounded-full bg-brand', {
  variants: { tone: { brand: 'bg-brand', muted: 'bg-line' } },
  defaultVariants: { tone: 'brand' },
});

const line = cva('grid grid-cols-[minmax(120px,1fr)_56px_46px_84px] items-center gap-3 py-2 border-b border-line last:border-0');
const num = cva('font-mono text-right text-[13px]');

export interface UsagePanelProps {
  skills: Skill[];
  bySkill: Record<string, StatEntry>;
  byAgent?: Record<string, number>;
  daily: { d: string; n: number }[];
  total: number;
  since: string | null;
  onPick: (fqn: string) => void;
  onClearStats: () => void;
}

export function UsagePanel({ skills, bySkill, byAgent = {}, daily, total, since, onPick, onClearStats }: UsagePanelProps) {
  const aliasOf = (fqn: string) => skills.find(s => s.fqn === fqn)?.alias || fqn.split(':').pop() || fqn;
  const rows = Object.entries(bySkill)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  const max = Math.max(1, ...rows.map(r => r[1].count));
  const dayMax = Math.max(1, ...daily.map(d => d.n));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="text-[13px] font-medium text-muted">
            调用排行（前 20 · 共 {total} 次记录{since ? `，始于 ${since.slice(0, 10)}` : ''}）
          </div>
          {total > 0 && (
            <Button size="sm" variant="ghost" onClick={onClearStats}>清空调用记录</Button>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">
            还没有调用记录。到「接入与同步」里点「生成并写入」，之后在 agent 里用中文别名或 /短命令 调用技能，就会开始计数。
          </div>
        ) : (
          rows.map(([fqn, s]) => (
            <div key={fqn} className={cn(line)}>
              <button className="truncate text-left text-[13px] hover:text-brand" title={fqn} onClick={() => onPick(fqn)}>
                {aliasOf(fqn)}
              </button>
              <div className={cn(num, 'font-bold text-brand')}>{s.count}</div>
              <div className={cn(num, 'text-muted')}>
                {Math.round((s.count / Math.max(1, total)) * 100)}%
              </div>
              <div className="text-right text-[11px] text-muted">{s.last.slice(5, 10)}</div>
              <div className="col-span-4 -mt-1 h-1.5 rounded-full bg-surface">
                <div className={cn(bar())} style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="mb-3 text-[13px] font-medium text-muted">近 30 天每日调用</div>
        {daily.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">暂无数据</div>
        ) : (
          <div className="flex h-40 items-end gap-1.5">
            {daily.slice(-30).map(d => (
              <div key={d.d} className="group relative flex flex-1 flex-col items-center justify-end">
                <div
                  className={cn('mx-auto w-full', bar())}
                  style={{ height: `${Math.max(6, (d.n / dayMax) * 132)}px`, maxWidth: 34 }}
                />
                <div className="mt-1 truncate text-[10px] text-muted">{d.d.slice(8)}</div>
                <div className={cn('pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white opacity-0 group-hover:opacity-100')}>
                  {d.d.slice(5)} · {d.n} 次
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-md bg-surface p-3 text-[11.5px] leading-5 text-muted">
          统计口径：只有<b className="text-ink">被真正调用</b>的技能才计数——来自本机钩子：
          你打出 <b className="text-ink">括号包住的中文备注名</b> 时记一次，模型真的去调技能工具时再记一次。
          不是安装量，也不是"出现在列表里"。
          {Object.keys(byAgent).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(byAgent).map(([a, n]) => <Badge key={a} tone="line">{AGENT_LABEL[a] || a} · {n}</Badge>)}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
