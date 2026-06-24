import type { ReactNode } from 'react'

interface Props {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon = 'inbox', title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-[32px] text-outline">{icon}</span>
      </div>
      <h3 className="text-title-lg font-bold text-on-surface mb-2">{title}</h3>
      {description && <p className="text-body-md text-on-surface-variant mb-6 max-w-sm">{description}</p>}
      {action}
    </div>
  )
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-surface-container-high border-t-primary animate-spin" />
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="error_outline"
      title="Algo deu errado"
      description={message}
      action={
        onRetry ? (
          <button
            onClick={onRetry}
            className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md"
          >
            Tentar novamente
          </button>
        ) : undefined
      }
    />
  )
}
