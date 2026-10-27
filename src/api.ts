/** 与本地服务通信的类型与函数 */
export interface Skill {
  fqn: string;
  name: string;
  realName: string;
  author: string;
  desc: string;
  path: string;
  paths: string[];
  absPaths: string[];
  skillDirs: string[];
  agents: string;
  agentCount: number;
  copies: number;
  multiVersion: boolean;
  alias: string;
  usage: string;
  group: string;
  code: string;
  codeManual: string;
  /** 中文备注名的拼音首字母（服务端算好，供搜索用） */
  py: string;
  favorite: boolean;
  pinned: boolean;
  /** 多对多标签 */
  tags: string[];
  conflictWith?: string;
  noteUpdatedAt: string;
}

export interface StatEntry { count: number; first: string; last: string; byAgent?: Record<string, number> }

export interface HookState {
  agent: string;
  label: string;
  installed: boolean;
  supported?: boolean;
  pretool?: boolean;
  userprompt?: boolean;
  file?: string;
  reason?: string;
}

export interface StateResponse {
  product: string;
  tagline: string;
  version: string;
  publisher: string;
  homepage: string;
  contact: string;
  copyright: string;
  runtime: string;
  logFile: string;
  skills: Skill[];
  groups: string[];
  conflicts: { alias: string; fqns: string[] }[];
  trigger: string;
  triggerEnd: string;
  hooks: HookState[];
  dataDir: string;
  /** 全部标签及使用次数 */
  tags: { tag: string; count: number }[];
  /** 本次技能清单的扫描时间（只在启动与手动重扫时更新） */
  scannedAt: string;
  stats: {
    total: number;
    since: string | null;
    byAgent: Record<string, number>;
    bySkill: Record<string, StatEntry>;
    daily: { d: string; n: number }[];
  };
}

export interface GenerateReport {
  aliased: number;
  conflicts?: number;
  written: string[];
  skipped: string[];
  outDir: string;
  tableFile?: string;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`${url} 失败：${r.status}`);
  return r.json() as Promise<T>;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} 失败：${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  state: () => fetch('/api/state').then(r => r.json() as Promise<StateResponse>),
  saveNote: (p: { fqn: string; name?: string; alias?: string; usage?: string; group?: string; code?: string }) =>
    post<{ ok: boolean }>('/api/note', p),
  clearNote: (fqn: string) => post<{ ok: boolean }>('/api/note/clear', { fqn }),
  toggleFavorite: (fqn: string) => post<{ favorite: boolean }>('/api/note/toggle-favorite', { fqn }),
  togglePinned: (fqn: string) => post<{ pinned: boolean }>('/api/note/toggle-pinned', { fqn }),
  renameGroup: (from: string, to: string) => post<{ ok: boolean }>('/api/group/rename', { from, to }),
  rescan: () => post<{ ok: boolean; count: number }>('/api/scan'),
  generate: (install = true) => post<GenerateReport>('/api/generate', { install }),
  setTrigger: (trigger: string, triggerEnd: string) =>
    post<GenerateReport & { trigger: string; triggerEnd: string }>('/api/trigger', { trigger, triggerEnd }),
  enableHook: (agent: string) => post<HookResult>('/api/hook/enable', { agent }),
  enableAllHooks: () => post<{ results: HookResult[] }>('/api/hook/enable', { agent: 'all' }),
  disableHook: (agent: string) => post<{ ok: boolean; removed?: number; file?: string }>('/api/hook/disable', { agent }),
  uninstall: () => post<{ removed: string[] }>('/api/uninstall'),
  clearStats: () => post<{ ok: boolean; cleared: number }>('/api/stats/clear'),
  skillDetail: (fqn: string) =>
    get<{ skill: Skill; content: { body: string; name: string; description: string; whenToUse: string; author: string }; stat?: StatEntry }>(`/api/skill?fqn=${encodeURIComponent(fqn)}`),
  skillDiff: (fqn: string) => get<DiffResult>(`/api/skill/diff?fqn=${encodeURIComponent(fqn)}`),
  setTags: (fqn: string, tags: string[]) => post<{ tags: string[] }>('/api/tag', { fqn, tags }),
  addTag: (fqn: string, tag: string) => post<{ tags: string[] }>('/api/tag/add', { fqn, tag }),
  removeTag: (fqn: string, tag: string) => post<{ tags: string[] }>('/api/tag/remove', { fqn, tag }),
  batchTag: (fqns: string[], tag: string) => post<{ tag: string; count: number }>('/api/tag/batch', { fqns, tag }),
  renameTag: (from: string, to: string) => post<{ ok: boolean; renamed?: number }>('/api/tag/rename', { from, to }),
  dropTag: (tag: string) => post<{ ok: boolean; removed?: number }>('/api/tag/drop', { tag }),
  deleteSkill: (fqn: string) => post<{ removed: string[]; count: number }>('/api/delete', { fqn }),
  batchDelete: (fqns: string[]) => post<{ removed: string[]; count: number; skipped: string[] }>('/api/batch-delete', { fqns }),
};

/** 版本差异：以第一份副本为基准，逐个对比其余副本 */
export interface DiffRow { type: 'eq' | 'add' | 'del' | 'gap'; text: string; a?: number; b?: number }
export interface DiffResult {
  fqn: string;
  copies: { path: string }[];
  diffs: { path: string; basePath: string; added: number; removed: number; rows: DiffRow[] }[];
}

export interface HookResult { ok: boolean; agent?: string; changed?: boolean; added?: string[]; file?: string; message?: string }
