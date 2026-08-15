import type { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon = 'inbox', title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-3xl bg-surface-container flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-[32px] text-outline">{icon}</span>
      </div>
      <h3 className="text-title-lg font-semibold text-on-surface mb-2">{title}</h3>
      {description && <p className="text-body-md text-on-surface-variant mb-8 max-w-sm">{description}</p>}
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
          <Button
            onClick={onRetry}
            size="md"
          >
            Tentar novamente
          </Button>
        ) : undefined
      }
    />
  )
}
