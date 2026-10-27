import { cva } from 'class-variance-authority';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

type Mode = 'system' | 'light' | 'dark';
const KEY = 'poooomskill.theme';

function applyMode(mode: Mode) {
  const dark = mode === 'dark'
    || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const btn = cva(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:border-brand hover:text-brand',
);

const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Mode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

/** 主题切换：跟随系统 → 浅色 → 深色 循环，选择记在 localStorage */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });

  useEffect(() => {
    applyMode(mode);
    if (mode === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (mode === 'system') applyMode('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  return (
    <button
      type="button"
      className={cn(btn(), className)}
      onClick={() => setMode(NEXT[mode])}
      title={`主题：${LABEL[mode]}（点击切换）`}
      aria-label={`主题：${LABEL[mode]}`}
    >
      {mode === 'system' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" strokeLinecap="round" />
        </svg>
      ) : mode === 'light' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
