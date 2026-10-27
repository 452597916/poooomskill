import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { ReactNode } from 'react';

/** 标签胶囊：列表与详情共用，避免各写一份圆角/配色 */
const pill = cva('inline-flex max-w-full items-center gap-1 rounded-full', {
  variants: {
    tone: {
      solid: 'border border-brand/40 bg-brand-weak text-brand',
      ghost: 'border border-line text-muted',
    },
    size: {
      sm: 'px-1.5 text-[10.5px] leading-4',
      md: 'px-2 py-0.5 text-[12px]',
    },
  },
  defaultVariants: { tone: 'solid', size: 'md' },
});

export interface TagPillProps extends VariantProps<typeof pill> {
  children: ReactNode;
  className?: string;
  onRemove?: () => void;
}

export function TagPill({ tone, size, className, onRemove, children }: TagPillProps) {
  return (
    <span className={cn(pill({ tone, size }), className)}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 opacity-60 hover:opacity-100" title="移除标签">
          ✕
        </button>
      )}
    </span>
  );
}
