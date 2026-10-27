import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { HTMLAttributes } from 'react';

const stat = cva('rounded-lg border border-line bg-card px-4 py-3');

const valueCls = cva('font-mono text-2xl leading-8 font-bold', {
  variants: { tone: { brand: 'text-brand', warn: 'text-warn', ink: 'text-ink' } },
  defaultVariants: { tone: 'brand' },
});

const labelCls = cva('mt-0.5 text-xs text-muted');

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  value: string | number;
  label: string;
  hint?: string;
  tone?: 'brand' | 'warn' | 'ink';
}

export function Stat({ value, label, hint, tone, className, ...props }: StatProps) {
  return (
    <div className={cn(stat(), className)} {...props}>
      <div className={cn(valueCls({ tone }))}>{value}</div>
      <div className={cn(labelCls())}>{label}</div>
      {hint && <div className={cn(labelCls(), 'text-[11px] opacity-75')}>{hint}</div>}
    </div>
  );
}

const segmented = cva('inline-flex rounded-lg border border-line bg-surface p-0.5');

const item = cva('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', {
  variants: { active: { true: 'bg-card text-brand shadow-sm', false: 'text-muted hover:text-ink' } },
  defaultVariants: { active: false },
});

export interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn(segmented(), className)}>
      {options.map(o => (
        <button key={o.value} className={cn(item({ active: o.value === value }))} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
