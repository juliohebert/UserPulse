import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  fullWidthMobile?: boolean
}

const base = 'inline-flex items-center justify-center gap-2 rounded-full text-label-md font-bold transition-all active:scale-95 disabled:opacity-60 disabled:pointer-events-none'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:opacity-90',
  secondary: 'border-2 border-on-surface text-on-surface hover:bg-surface-container-low',
  ghost: 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low',
  danger: 'bg-error text-on-error hover:opacity-90',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-4 py-2',
  md: 'px-5 py-2.5',
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
