import { useState } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { api, type GenerateReport, type StateResponse } from '../api';

const step = cva('flex gap-3 border-b border-line py-3 last:border-0');
const badgeIdx = cva('mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand-weak text-center font-mono text-[11px] leading-5 text-brand');
const title = cva('text-[13.5px] font-medium text-ink');
const body = cva('mt-1 text-[12px] leading-5 text-muted');

const PAIRS = [
  { open: '【', close: '】', note: '中文态 [ ] 各一键，行文里不会误用（推荐）' },
  { open: '《', close: '》', note: '中文态 < > 各一键，书名号语义清楚' },
  { open: '「', close: '」', note: '中文态 [ ] 在部分输入法出「」' },
  { open: '：', close: '', note: '单符号：中文态 Shift+; 一键，但日常句子里也可能出现冒号' },
];

/** 各家生效条件（用于矩阵下方的一句话提示） */
const CAVEAT = [
  '为什么不用顿号「、」或中间点「·」：顿号是中文里的列举符号，写「我要做首页、前端设计要好看」会被误判成调用；中间点要长按或翻候选页，打字太费劲。成对括号两头都要敲，日常句子里几乎不会误撞。',
  'Trae CN：改完要重启一次，才读得到新技能与钩子。',
  'Codex：第一次跑到钩子时会弹确认，要在 /hooks 里选允许/信任；若不生效，B 路线仍可用。',
  '钩子脚本本身已用三家的 stdin 格式实测通过；宿主内的执行仍需你做上面两步后确认一次。',
  '想让 Trae 也认 .agents 目录：设置 → 技能与命令 → 导入设置 → 打开「启用 .agents 技能目录」。',
];

const rowGrid = cva('grid grid-cols-[110px_120px_100px_1fr] gap-2 items-baseline border-b border-line pb-1.5 last:border-0');

function Row({ name, a, b, c, note }: { name: string; a: string; b: string; c: string; note: string }) {
  return (
    <div className={cn(rowGrid())}>
      <b className="text-[12px]">{name}</b>
      <span className="text-muted">{a}</span>
      <span className="text-muted">{b}</span>
      <span className="text-muted">{c}　·　{note}</span>
    </div>
  );
}

export interface ConnectPanelProps {
  state: StateResponse;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onReload: () => void;
  notify: (msg: string) => void;
}

export function ConnectPanel({ state, busy, onBusy, onReload, notify }: ConnectPanelProps) {
  const [report, setReport] = useState<GenerateReport | null>(null);
  const [custom, setCustom] = useState({ open: '', close: '' });
  const named = state.skills.filter(s => s.alias.trim() && !s.conflictWith);
  const trigger = state.trigger || '【';
  const triggerEnd = state.triggerEnd ?? '】';
  const ex = named[0];
  const example = ex?.alias || '前端设计';
  const exampleCode = ex?.code || 'ps-qdsj';

  async function run<T>(fn: () => Promise<T>, done: (r: T) => void) {
    onBusy(true);
    try { done(await fn()); } catch (e) { notify('操作失败：' + String((e as Error).message)); }
    finally { onBusy(false); }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className={cn(title())}>调用暗号：{trigger}中文备注名{triggerEnd}</div>
        <div className={cn(body())}>
          符号本身不会被任何 agent 解析——真正让它生效的是下面 C 里的钩子：消息进入会话时认出{' '}
          <code>{trigger}{example}{triggerEnd}</code>，把对应的真实技能名直接交给模型，同时记一次调用。
          <b className="text-ink">推荐用成对符号</b>：只有被完整包住、且里面确实是你的技能名时才触发，
          所以正常说话写「我要做首页、前端设计要好看」不会被误认成调用技能。换符号会自动重新生成并写入。
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PAIRS.map(o => (
            <Button
              key={o.open + o.close} size="sm" title={o.note} disabled={busy}
              variant={o.open === trigger && o.close === triggerEnd ? 'solid' : 'outline'}
              onClick={() => run(() => api.setTrigger(o.open, o.close), r => { notify(`调用暗号已改为 ${r.trigger}…${r.triggerEnd || '（单符号）'}`); onReload(); })}
            >
              {o.open}名字{o.close || '（单符号）'}
            </Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            variant="box" className="w-20 text-center" maxLength={2} value={custom.open} aria-label="起始符号"
            onChange={e => setCustom(c => ({ ...c, open: e.target.value }))} placeholder="起始"
          />
          <span className="text-[12px] text-muted">名字</span>
          <Input
            variant="box" className="w-20 text-center" maxLength={2} value={custom.close} aria-label="结束符号"
            onChange={e => setCustom(c => ({ ...c, close: e.target.value }))} placeholder="结束（可留空）"
          />
          <Button size="md" disabled={busy || !custom.open.trim()}
            onClick={() => run(() => api.setTrigger(custom.open.trim(), custom.close.trim()), r => { notify('已套用自定义暗号'); onReload(); })}>
            用这个
          </Button>
        </div>
      </Card>

      <Card>
        <div className={cn(step())}>
          <div className={cn(badgeIdx())}>A</div>
          <div className="flex-1">
            <div className={cn(title())}>硬调用入口 · <code>/ps-短码</code></div>
            <div className={cn(body())}>
              每个填了中文备注名的技能，自动按拼音首字母生成斜杠命令（如「{example}」→ <code>/{exampleCode}</code>）。
              这是<b className="text-ink">唯一被程序解析</b>的调用方式，不经过模型判断，确定性最高。
              <span className="text-muted">仅 Claude Code 有命令目录；Trae CN / Codex 请用上面那个「{trigger}中文备注名{triggerEnd}」。</span>
            </div>
          </div>
        </div>

        <div className={cn(step())}>
          <div className={cn(badgeIdx())}>B</div>
          <div className="flex-1">
            <div className={cn(title())}>中文自然语言 · 本地解析技能 <code>poooomskill-alias</code></div>
            <div className={cn(body())}>
              生成一个纯本地技能，把别名表写进它的描述与正文，让智能体自己完成「中文 → 真名」。
              体验最自然，但命中率取决于模型。全程不联网、不需要 API key。
            </div>
          </div>
        </div>

        <div className={cn(step(), 'border-0')}>
          <div className={cn(badgeIdx())}>C</div>
          <div className="flex-1">
            <div className={cn(title())}>本地钩子 · 暗号入口 + 兜底改写 + 真实调用计数</div>
            <div className={cn(body())}>
              <code>UserPromptSubmit</code> 认出「{trigger}中文备注名{triggerEnd}」并把真名注入会话；<code>PreToolUse</code>
              兜底把中文别名改写成真名。两条通道都会记一次<b className="text-ink">真实调用</b>。
              写入前自动备份，只新增 PoooomSkill 自己的条目，不动你原有的其他钩子。
            </div>
            <div className="mt-3 grid gap-2">
              {state.hooks.map(h => (
                <div key={h.agent} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface/60 px-3 py-2">
                  <b className="w-24 shrink-0 text-[12.5px]">{h.label}</b>
                  {h.supported === false
                    ? <Badge tone="flat">只放别名技能</Badge>
                    : h.installed
                      ? <Badge tone="brand">符号 + 兜底 已接入</Badge>
                      : h.pretool || h.userprompt
                        ? <Badge tone="warn">部分接入（{h.pretool ? '兜底' : '符号'}）</Badge>
                        : <Badge tone="line">未接入{h.reason ? ` · ${h.reason}` : ''}</Badge>}
                  <code className="flex-1 truncate text-[11px] text-muted" title={h.file}>{h.file || ''}</code>
                  {h.supported === false ? (
                    <span className="text-[11px] text-muted">无需接入</span>
                  ) : (
                    <>
                      <Button size="sm" variant={h.installed ? 'ghost' : 'outline'} disabled={busy || h.installed}
                        onClick={() => run(() => api.enableHook(h.agent), r => { notify(r.message || '完成'); onReload(); })}>接入</Button>
                      <Button size="sm" variant="ghost" disabled={busy || (!h.pretool && !h.userprompt)}
                        onClick={() => run(() => api.disableHook(h.agent), r => { notify(`已移除 ${r.removed ?? 0} 条`); onReload(); })}>撤销</Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className={cn(title())}>各家能用哪几招（按官方文档写入，钩子脚本已按三家格式实测）</div>
        <div className={cn(body())}>
          <div className="mt-2 grid gap-1.5 text-[12px]">
            <Row name="Claude Code" a="✔ 斜杠硬命令" b="✔ 解析技能" c="✔ 暗号 + 改写 + 计数" note="改完即用，会话内热加载" />
            <Row name="Trae CN" a="—" b="✔ 解析技能" c="✔ 暗号 + 改写 + 计数" note="需重启 Trae 一次才会读到新技能与钩子" />
            <Row name="Codex" a="—" b="✔ 解析技能" c="✔ 暗号 + 改写 + 计数" note="首次跑到钩子要在 /hooks 里点信任；若不生效 B 仍可用" />
            <Row name="共享目录 .agents" a="—" b="✔ 别名技能已放入" c="—" note="Trae 需在「设置 → 技能与命令 → 导入设置」开启 .agents 目录开关" />
          </div>
          <ul className="mt-3 space-y-1 text-[11.5px] leading-5 text-muted">
            {CAVEAT.map(t => <li key={t}>· {t}</li>)}
          </ul>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="solid" disabled={busy || named.length === 0} onClick={() =>
            run(() => api.generate(true), r => { setReport(r); onReload(); notify(`已生成并写入：${r.written.join('、') || '无（未检测到 agent 目录）'}`); })
          }>生成并写入 agent</Button>
          <Button disabled={busy} onClick={() =>
            run(() => api.generate(false), r => { setReport(r); notify('已只生成到本地目录，未写入 agent'); })
          }>只生成预览</Button>
          <Button disabled={busy} onClick={() =>
            run(() => api.enableAllHooks(), r => { notify(r.results.map(x => x.message).join('；')); onReload(); })
          }>三家全部接入钩子</Button>
          <Button variant="danger" disabled={busy} onClick={() =>
            run(() => api.uninstall(), r => { notify(`已移除写入的 ${r.removed.length} 个文件与全部钩子条目`); onReload(); })
          }>一键撤销全部</Button>
        </div>

        {named.length === 0 && (
          <div className="mt-3 rounded-md bg-surface p-3 text-[12px] text-muted">
            还没有可用的中文备注名。先到「技能库」给常用的几个技能起名字，再来这一页写入。
          </div>
        )}

        {report && (
          <div className={cn(body(), 'mt-3 space-y-1')}>
            <div>可用别名：<b className="text-ink">{report.aliased}</b>　触发符号：<b className="text-ink">{trigger}</b>　冲突让位：<b className="text-ink">{report.conflicts ?? 0}</b></div>
            <div>写入到：<b className="text-ink">{report.written.join(' / ') || '（无）'}</b></div>
            {report.skipped.length > 0 && <div>跳过：{report.skipped.join(' / ')}</div>}
            <div>产物目录：<code className="break-all">{report.outDir}</code></div>
            {report.tableFile && <div>对照表：<code className="break-all">{report.tableFile}</code></div>}
          </div>
        )}
      </Card>

      <Card>
        <div className={cn(title())}>关于 · 数据都在本机</div>
        <div className={cn(body())}>
          备注、分组、调用记录存在 <code className="break-all">{state.dataDir}</code>；
          生成的文件只新增、不修改任何已有技能；点「撤销写入」即可全部删除。
        </div>
        <div className="mt-3 grid gap-1 text-[12px] text-muted">
          <div>软件：<b className="text-ink">{state.product}</b> v{state.version}（{state.runtime}）· {state.tagline}</div>
          <div>出品：<b className="text-ink">{state.publisher}</b> · <a className="text-brand hover:underline" href={state.homepage} target="_blank" rel="noreferrer">{state.homepage}</a></div>
          <div>联系：<a className="text-brand hover:underline" href={`mailto:${state.contact}`}>{state.contact}</a></div>
          <div>运行日志：<code className="break-all">{state.logFile}</code></div>
          <div className="pt-1">{state.copyright}</div>
        </div>
      </Card>
    </div>
  );
}
