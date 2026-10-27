import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { InputHTMLAttributes } from 'react';

/** 搜索框：放大镜 + 一键清空 + 走 cva 统一尺寸变体，页面里不再写长串 className */
const wrap = cva('relative w-full');

const field = cva(
  'w-full rounded-md border border-line bg-card text-ink outline-none placeholder:text-muted/60 focus:border-brand',
  {
    variants: {
      size: {
        md: 'h-9 pl-8 pr-8 text-sm',
        sm: 'h-7 pl-7 pr-7 text-[13px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

const glyph = cva('pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted', {
  variants: {
    size: { md: 'left-2.5', sm: 'left-2' },
  },
  defaultVariants: { size: 'md' },
});

const clearBtn = cva(
  'absolute top-1/2 grid -translate-y-1/2 place-items-center rounded text-muted hover:bg-surface hover:text-ink',
  {
    variants: {
      size: { md: 'right-1.5 h-6 w-6 text-[12px]', sm: 'right-1 h-5 w-5 text-[11px]' },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof field> {
  onClear?: () => void;
}

export function SearchInput({ className, value, onClear, size, ...props }: SearchInputProps) {
  const text = String(value ?? '');
  return (
    <div className={cn(wrap(), className)}>
      <svg
        className={cn(glyph({ size }))}
        width={size === 'sm' ? 12 : 14}
        height={size === 'sm' ? 12 : 14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20.5 20.5l-4-4" strokeLinecap="round" />
      </svg>
      <input type="text" className={cn(field({ size }))} value={value} {...props} />
      {text !== '' && (
        <button type="button" className={cn(clearBtn({ size }))} title="清空搜索" onClick={() => onClear?.()}>
          ✕
        </button>
      )}
    </div>
  );
}