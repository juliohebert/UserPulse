import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'gradient' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  fullWidthMobile?: boolean
}

const base = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full text-label-md font-bold tracking-[-0.14px] transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:bg-[#bcc0c4] disabled:text-white disabled:opacity-100'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary active:bg-[#0457cb]',
  gradient: 'bg-primary text-on-primary active:bg-[#0457cb]',
  secondary: 'border-2 border-[#0a1317] bg-transparent text-[#0a1317] active:bg-surface-container-low',
  ghost: 'border-2 border-[#0a1317]/12 bg-transparent text-[#0a1317] active:bg-surface-container-low',
  danger: 'bg-error text-on-error active:bg-[#f0284a]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-5 py-2.5',
  md: 'px-[30px] py-3.5',
  lg: 'px-8 py-4 text-body-md',
}

export function Button({
  variant = 'primary',
  size = 'sm',
  iconLeft,
  iconRight,
  fullWidthMobile = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidthMobile ? 'w-full sm:w-auto' : ''} ${className}`.trim()}
      {...props}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  )
}
