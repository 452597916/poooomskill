import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { useEffect, type ReactNode } from 'react';

const overlay = cva('fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 backdrop-blur-sm');
const panel = cva('my-10 w-full rounded-xl border border-line bg-card shadow-2xl', {
  variants: {
    size: { md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-5xl' },
  },
  defaultVariants: { size: 'lg' },
});

export interface ModalProps extends VariantProps<typeof panel> {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer, size }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={overlay()} onClick={onClose} role="dialog" aria-modal="true">
      <div className={cn(panel({ size }))} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="text-[15px] font-semibold text-ink">{title}</div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
              aria-label="关闭"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
