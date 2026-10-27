import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { ButtonHTMLAttributes } from 'react';

const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors select-none ' +
  'disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-brand text-white hover:bg-brand/88',
        outline: 'border-line bg-card text-ink hover:border-brand hover:text-brand',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-surface hover:text-ink',
        danger: 'border-transparent bg-card text-warn hover:bg-warn hover:text-white',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
