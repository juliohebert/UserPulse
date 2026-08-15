import { useEffect } from 'react'
import { Button } from './Button'

export type ConfirmDialogVariant = 'danger' | 'warning' | 'default'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
  loading?: boolean
  // Falha ao confirmar (ex.: "plano vinculado a clientes") — mantém o
  // dialog aberto com o motivo visível, em vez de fechar silenciosamente
  // ou precisar de um banner separado na página por trás.
  erro?: string | null
  onConfirm: () => void
  onCancel: () => void
}

// Ícone + cores por variante — "warning" usa a paleta amber padrão do
// Tailwind, já que o design system do projeto (tailwind.config) só define
// tokens de primary/tertiary/error.
const VARIANT_CFG: Record<ConfirmDialogVariant, { icon: string; iconBg: string; iconColor: string }> = {
  danger: {
    icon: 'warning',
    iconBg: 'bg-error-container',
    iconColor: 'text-error',
  },
  warning: {
    icon: 'warning',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  default: {
    icon: 'help',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
}

// Modal padrão de confirmação/alerta do painel — substitui window.confirm
// (sem estilo próprio, bloqueia teste automatizado, inconsistente entre
// navegadores). Sempre renderizado condicionalmente pelo componente pai
// (mesmo padrão dos outros modais deste projeto, ver Tenants.tsx), nunca
// mantém estado próprio de "aberto/fechado".
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  erro,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cfg = VARIANT_CFG[variant]

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [loading, onCancel])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={e => { if (e.target === e.currentTarget && !loading) onCancel() }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${cfg.iconBg}`}>
              <span className={`material-symbols-outlined text-[22px] ${cfg.iconColor}`}>{cfg.icon}</span>
            </div>
            <div className="min-w-0 pt-1">
              <h3 id="confirm-dialog-title" className="text-title-md font-bold text-on-surface">{title}</h3>
              <p id="confirm-dialog-description" className="mt-1 text-body-md text-on-surface-variant">{description}</p>
            </div>
          </div>
          {erro && (
            <p className="mt-3 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">{erro}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button
            type="button"
            autoFocus
            disabled={loading}
            onClick={onCancel}
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            className={variant === 'warning' ? 'bg-[#e65100] text-white hover:opacity-90' : ''}
          >
            {loading ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
