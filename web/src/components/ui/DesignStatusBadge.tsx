export type DesignStatusBadgeVariant = 'success' | 'promo' | 'attention' | 'critical' | 'neutral'

const DOT_CLASS: Record<DesignStatusBadgeVariant, string> = {
  success: 'bg-tertiary',
  promo: 'bg-[#facc15]',
  attention: 'bg-secondary',
  critical: 'bg-error',
  // Neutro = cinza (outline), nunca vermelho — "Desativada"/"Encerrada" não
  // são estados de erro. Use `critical` quando quiser a bolinha vermelha.
  neutral: 'bg-outline',
}

interface DesignStatusBadgeProps {
  children: string
  variant?: DesignStatusBadgeVariant
  className?: string
  title?: string
}

// Segue o modelo de badge do DESIGN.md: pill, caption bold e padding 4px 10px.
// A variação "off" mantém fundo branco/borda e usa a bolinha para carregar o status.
export function DesignStatusBadge({ children, variant = 'neutral', className = '', title }: DesignStatusBadgeProps) {
  return (
    <span title={title} className={`inline-flex h-7 min-w-[88px] items-center justify-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 text-label-md font-bold uppercase leading-none tracking-[0.08em] text-on-surface ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[variant]}`} />
      {children}
    </span>
  )
}
