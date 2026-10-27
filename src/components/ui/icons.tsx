import { cn } from '../../lib/cn';

/** 线性图标集（stroke 风格，跟随 currentColor）
 *  收藏星 / 置顶钉 两处复用：列表行 + 详情页，禁止各画一份。 */

interface IconProps {
  /** 激活时填充当前色（星/钉实心），否则只画描边 */
  active?: boolean;
  className?: string;
}

export function IconStar({ active, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-4 w-4', className)}
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2.6 15.1 8.6 21.7 9.5 16.9 14.2 18.1 20.8 12 17.6 5.9 20.8 7.1 14.2 2.3 9.5 8.9 8.6" />
    </svg>
  );
}

export function IconPin({ active, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-4 w-4', className)}
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16h14v-.8a2 2 0 0 0-1.1-1.7l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}
