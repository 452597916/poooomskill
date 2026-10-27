/** 技能库装配：把「磁盘扫描结果 + 备注 + 标签」合并成一份可直接用的清单
 *  服务端 / CLI / MCP 三处共用，避免各写一份合并逻辑。 */
import { scanAll } from './scan.mjs';
import { getNotes, getTags } from './store.mjs';
import { initialsOf, resolveAliasConflicts, dedupeCodes } from './pinyin.mjs';

/** 把原始扫描结果与用户备注合并；同时完成中文名冲突消解与短命令去重 */
export function mergeSkills(raw, notes = getNotes(), tagMap = getTags()) {
  const merged = raw.map(s => {
    const n = notes[s.fqn];
    return {
      fqn: s.fqn, name: s.name, realName: s.realName, author: s.author,
      desc: s.desc, path: s.path, paths: s.paths || [], absPaths: s.absPaths || [],
      skillDirs: s.skillDirs || [],
      agents: s.agents, agentCount: s.agentCount, copies: s.copies, multiVersion: s.multiVersion,
      alias: n?.alias || '', usage: n?.usage || '', group: n?.grp || '', codeManual: n?.code || '', code: '',
      favorite: Boolean(n?.favorite), pinned: Boolean(n?.pinned),
      tags: tagMap[s.fqn] || [],
      py: initialsOf(n?.alias || ''),
      noteUpdatedAt: n?.updated_at || '',
    };
  });
  resolveAliasConflicts(merged);
  dedupeCodes(merged.filter(s => !s.conflictWith));
  return merged;
}

/** 现扫一遍磁盘再合并（CLI / MCP 用；服务端有自己的扫描缓存） */
export function loadLibrary() {
  return mergeSkills(scanAll());
}
