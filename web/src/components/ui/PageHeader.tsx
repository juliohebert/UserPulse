import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-headline-lg font-bold text-on-surface leading-tight break-words">{title}</h2>
        {description && (
          <p className="text-body-lg text-on-surface-variant mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
