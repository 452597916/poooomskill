import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { HTMLAttributes } from 'react';

const badge = cva('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap', {
  variants: {
    tone: {
      brand: 'bg-brand-weak text-brand',
      warn: 'bg-warn/10 text-warn',
      line: 'border border-line text-muted',
      flat: 'bg-surface text-muted',
    },
  },
  defaultVariants: { tone: 'flat' },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
