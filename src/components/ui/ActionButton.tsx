import { type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'normal';

interface ActionButtonProps {
  /** 按钮模式 */
  variant: ButtonVariant;
  /** lucide 图标组件 */
  icon: ReactNode;
  /** 按钮文字 */
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  normal:
    'text-[#16181D] bg-white/50 border-[#E0E2E6FF] hover:bg-white/90 hover:border-[#B0B4B8FF]',
  primary:
    'text-white bg-[#3D7AF5FF] border-[#3D7AF5] hover:shadow-[0_0_8px_1px_rgba(61,122,245,0.5)] hover:border-[#3D7AF5]/50',
};

export function ActionButton({
  variant,
  icon,
  children,
  onClick,
  className = '',
}: ActionButtonProps) {
  return (
    <div
      onClick={onClick}
      className={`
        flex h-[36px] w-[82.78125px] items-center justify-center
        gap-2 rounded-[12px] border border-solid
        p-0 font-inter text-[14px] font-medium leading-[22px]
        cursor-pointer transition-all duration-200
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}
