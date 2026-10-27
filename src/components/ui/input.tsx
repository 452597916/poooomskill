import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { InputHTMLAttributes } from 'react';

const input = cva(
  'w-full rounded-md border border-transparent bg-transparent text-ink outline-none ' +
  'placeholder:text-muted/60 focus:border-brand focus:bg-card',
  {
    variants: {
      variant: {
        cell: 'h-7 px-1.5 text-[13px]',
        box: 'h-9 border-line bg-card px-3 text-sm',
      },
      tone: {
        filled: 'text-ink',
        empty: 'text-muted italic',
      },
    },
    defaultVariants: { variant: 'cell', tone: 'filled' },
  },
);

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof input> {}

export function Input({ className, variant, tone, ...props }: InputProps) {
  return <input className={cn(input({ variant, tone }), className)} {...props} />;
}
