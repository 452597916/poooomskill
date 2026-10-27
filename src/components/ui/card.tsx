import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { HTMLAttributes } from 'react';

const card = cva('rounded-lg border border-line bg-card', {
  variants: { pad: { none: '', sm: 'p-3', md: 'p-5' } },
  defaultVariants: { pad: 'md' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export function Card({ className, pad, ...props }: CardProps) {
  return <div className={cn(card({ pad }), className)} {...props} />;
}

const head = cva('mb-1 text-[13px] font-medium text-muted');

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(head(), className)} {...props} />;
}
