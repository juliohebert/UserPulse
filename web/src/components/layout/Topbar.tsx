import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { AdminUser } from '../../types'

interface Props {
  collapsed: boolean
}

// Iniciais pro avatar (fallback "UP" se, por algum motivo, o nome vier vazio
// — nunca deveria acontecer, mas evita um avatar em branco).
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'UP'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// Aviso simples de estado da conta (ver contexto SaaS multi-tenant) — nada de
// tela de billing/checkout ainda, só sinalizar quando a conta não está 100%
// operacional. Baseado em situacao_comercial (calculada no backend, ver
// obterSituacaoComercialTenant em server/src/lib/tenantGuards.ts) em vez de
// só `status` — trial_ativo/licenca_ativa não mostram nada (estado normal,
// sem ruído visual); o aviso mais completo de "vence em X dias"/vencido fica
// a cargo do banner (ver AvisoComercial.tsx), este badge é só um resumo
// compacto sempre visível no topo.
function badgeStatusTenant(tenant: AdminUser['tenant']): { label: string; className: string } | null {
  switch (tenant.situacao_comercial) {
    case 'trial_ativo': {
      const dias = tenant.trial_fim ? Math.max(0, Math.ceil((new Date(tenant.trial_fim).getTime() - Date.now()) / 86400000)) : null
      return { label: dias != null ? `Teste grátis · ${dias}d` : 'Teste grátis', className: 'bg-warning text-ink-deep' }
    }
    case 'trial_vencido':
      return { label: 'Teste expirado', className: 'bg-error-container text-error' }
    case 'licenca_vencida':
      return { label: 'Licença vencida', className: 'bg-error-container text-error' }
    case 'suspenso':
      return { label: 'Conta suspensa', className: 'bg-error-container text-error' }
    case 'cancelado':
      return { label: 'Conta cancelada', className: 'bg-outline-variant/30 text-outline' }
    default:
      return null // licenca_ativa
  }
}

export function Topbar({ collapsed }: Props) {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const badge = user ? badgeStatusTenant(user.tenant) : null

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      navigate(`/campanhas?busca=${encodeURIComponent(search.trim())}`)
      setSearch('')
    }
  }

  return (
    <header
      className={`fixed top-0 right-0 left-16 ${collapsed ? 'md:left-16' : 'md:left-[248px]'} h-16 bg-surface border-b border-hairline-soft flex justify-between items-center px-4 lg:px-margin-desktop z-40 transition-[left] duration-200`}
    >
      <form onSubmit={handleSearch} className="flex items-center flex-1 max-w-lg">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-steel text-[20px]">
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-11 pr-4 bg-surface-container-low border-none rounded-full focus:ring-2 focus:ring-[#1876f2] text-body-sm outline-none transition-all"
            placeholder="Buscar campanhas..."
            type="text"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 sm:gap-4 ml-3 sm:ml-6">
        <button className="relative h-10 w-10 rounded-full bg-surface text-charcoal hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface" />
        </button>
        <button className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-surface text-charcoal hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined">help_outline</span>
        </button>

        {user && (
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-label-md font-bold text-charcoal">{user.tenant.nome}</span>
            {badge && (
              <span className={`px-2.5 py-1 rounded-full text-label-sm font-bold uppercase ${badge.className}`}>
                {badge.label}
              </span>
            )}
          </div>
        )}

        <div className="hidden sm:block h-8 w-px bg-hairline-soft mx-1" />

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-label-md font-bold text-ink">{user?.nome ?? 'Admin'}</p>
            <p className="text-label-sm text-steel uppercase tracking-wider truncate max-w-[160px]">{user?.email ?? 'UserPulse'}</p>
          </div>
          <div
            className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-ink-deep font-bold text-sm border-2 border-surface"
            title={user?.email}
          >
            {iniciais(user?.nome ?? 'UserPulse')}
          </div>
        </div>
      </div>
    </header>
  )
}
