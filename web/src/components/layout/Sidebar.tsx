import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConfiguracao, podeVisualizarModulo } from '../../utils/permissions'

type LinkItem = { icon: string; label: string; to: string }
type ActionItem = { icon: string; label: string; action: 'configuracoes' }
type Item = LinkItem | ActionItem

// "Configurações" (submenu) e "Minha Assinatura" NÃO são mais o mesmo item
// agrupado (Fase 4) — o primeiro segue VISUALIZAR no módulo CONFIGURACOES
// (personalizável), o segundo continua na regra antiga de billing
// (podeEscreverConfiguracao, ADMIN/SUPER_ADMIN, nunca personalizado — ver
// utils/permissions.ts). Cada um é adicionado a itemsPrincipais
// separadamente, com seu próprio guard.
const ITEM_CONFIGURACOES: ActionItem = { icon: 'settings', label: 'Configurações', action: 'configuracoes' }
const ITEM_MINHA_ASSINATURA: LinkItem = { icon: 'receipt_long', label: 'Minha Assinatura', to: '/minha-assinatura' }

const navItemsSubmoduloConfiguracao: LinkItem[] = [
  { icon: 'palette', label: 'Aparência', to: '/configuracoes/aparencia' },
  { icon: 'grid_view', label: 'Catálogo de Telas', to: '/configuracoes/telas' },
  { icon: 'integration_instructions', label: 'Integração', to: '/configuracoes/integracao' },
  { icon: 'dns', label: 'Sistemas', to: '/configuracoes/sistemas' },
]

interface Props {
  collapsed: boolean
  onToggle: () => void
  onSubmoduloChange?: (aberto: boolean) => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

function itemAtivo(pathname: string, item: LinkItem): boolean {
  if (item.to === '/') return pathname === '/'
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavItem({ icon, label, to, collapsed, onClick }: LinkItem & { collapsed: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center justify-start rounded-2xl transition-all text-body-md ${
          isActive
            ? 'bg-primary text-white font-bold'
            : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
            <span
              className="material-symbols-outlined text-[21px]"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {icon}
            </span>
          </span>
          <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out ${collapsed ? 'max-w-[170px] opacity-100 ml-2 md:max-w-0 md:opacity-0 md:ml-0' : 'max-w-[170px] opacity-100 ml-2'}`}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function NavAction({ icon, label, collapsed, active, onClick }: { icon: string; label: string; collapsed: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`group flex w-full items-center justify-start rounded-2xl text-body-md transition-all ${active ? 'bg-primary text-white font-bold' : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
        <span className="material-symbols-outlined text-[21px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
      </span>
      <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out ${collapsed ? 'max-w-[170px] opacity-100 ml-2 md:max-w-0 md:opacity-0 md:ml-0' : 'max-w-[170px] opacity-100 ml-2'}`}>
        {label}
      </span>
    </button>
  )
}

function RailLink({ item, active, onClick }: { item: LinkItem; active: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${active ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'}`}
    >
      <span className="material-symbols-outlined text-[21px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
    </NavLink>
  )
}

function RailAction({ item, active, onClick }: { item: ActionItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${active ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'}`}
    >
      <span className="material-symbols-outlined text-[21px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
    </button>
  )
}

export function Sidebar({ collapsed, onToggle, onSubmoduloChange, mobileOpen = false, onCloseMobile }: Props) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const rotaConfiguracoes = location.pathname === '/configuracoes' || location.pathname.startsWith('/configuracoes/')
  const [submoduloAberto, setSubmoduloAberto] = useState<'configuracoes' | null>(rotaConfiguracoes ? 'configuracoes' : null)
  const [expandiuParaSubmodulo, setExpandiuParaSubmodulo] = useState(false)
  const emConfiguracoes = submoduloAberto === 'configuracoes'

  useEffect(() => {
    onSubmoduloChange?.(emConfiguracoes)
  }, [emConfiguracoes, onSubmoduloChange])

  useEffect(() => {
    if (rotaConfiguracoes) {
      setSubmoduloAberto('configuracoes')
    }
  }, [rotaConfiguracoes])

  function fecharSubmodulo() {
    setSubmoduloAberto(null)
    if (expandiuParaSubmodulo && !collapsed) onToggle()
    setExpandiuParaSubmodulo(false)
  }

  function navegarMobile() {
    onCloseMobile?.()
  }

  function abrirSubmoduloConfiguracoes() {
    if (collapsed) {
      onToggle()
      setExpandiuParaSubmodulo(true)
    } else {
      setExpandiuParaSubmodulo(false)
    }
    setSubmoduloAberto('configuracoes')
  }

  // Fase 4 de permissões personalizadas — cada módulo aparece no menu só com
  // VISUALIZAR (ou mais) efetivo; NENHUM esconde o item por completo (ver
  // utils/permissions.ts, podeVisualizarModulo). Sem personalização, o
  // resultado é idêntico ao padrão da role de antes (nenhuma role hoje tem
  // NENHUM por padrão em nenhum módulo, ver lib/permissoesModulo.ts).
  const itemsPrincipais: Item[] = [
    { icon: 'dashboard', label: 'Dashboard', to: '/' },
    ...(podeVisualizarModulo(user, 'CAMPANHAS') ? [{ icon: 'campaign', label: 'Campanhas', to: '/campanhas' }] : []),
    ...(podeVisualizarModulo(user, 'TOURS') ? [{ icon: 'map', label: 'Tours Guiados', to: '/tours' }] : []),
    ...(podeVisualizarModulo(user, 'JORNADAS') ? [{ icon: 'route', label: 'Jornadas', to: '/jornadas' }] : []),
    ...(podeVisualizarModulo(user, 'CONFIGURACOES') ? [ITEM_CONFIGURACOES] : []),
    // Minha Assinatura fica de propósito fora do módulo CONFIGURACOES (regra
    // fechada da Fase 4) — continua na regra antiga de billing, não
    // personalizável.
    ...(podeEscreverConfiguracao(user?.role) ? [ITEM_MINHA_ASSINATURA] : []),
    ...(user?.role === 'SUPER_ADMIN' ? [{ icon: 'admin_panel_settings', label: 'Gestão SaaS', to: '/admin/tenants' }] : []),
  ]

  if (emConfiguracoes) {
    return (
      <aside className={`fixed left-4 top-3 bottom-3 z-50 flex overflow-hidden rounded-3xl border border-outline-variant bg-white shadow-panel transition-[transform,width] duration-200 ${collapsed ? 'md:w-16' : 'md:w-[264px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)] md:translate-x-0'}`}>
        <div className="flex w-16 flex-col items-center px-2.5 py-4">
          <div className="mb-7 flex h-10 items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shrink-0">
              <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
            </div>
          </div>
          <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden">
            {itemsPrincipais.map(item => (
              'to' in item
                ? <RailLink key={item.to} item={item} active={!emConfiguracoes && itemAtivo(location.pathname, item)} onClick={() => { fecharSubmodulo(); navegarMobile() }} />
                : <RailAction key={item.action} item={item} active onClick={abrirSubmoduloConfiguracoes} />
            ))}
          </nav>
          <button
            type="button"
            onClick={() => logout()}
            title="Sair"
            aria-label="Sair"
            className="mt-4 flex h-10 w-10 items-center justify-center rounded-2xl text-on-surface-variant transition-colors hover:bg-surface hover:text-error"
          >
            <span className="material-symbols-outlined text-[21px]">logout</span>
          </button>
          {collapsed && (
            <button
              type="button"
              onClick={onToggle}
              title="Expandir sidebar"
              aria-label="Expandir sidebar"
              className="mt-2 hidden h-10 w-10 items-center justify-center rounded-2xl text-on-surface-variant transition-colors hover:bg-surface hover:text-on-surface md:flex"
            >
              <span className="material-symbols-outlined text-[21px]">left_panel_open</span>
            </button>
          )}
        </div>

        <div className={`${collapsed ? 'hidden md:hidden' : 'flex'} w-[200px] flex-col border-l border-outline-variant bg-surface px-3 py-4`}>
          <div className="mb-4 flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-title-md font-bold text-on-surface">Configurações</p>
              <p className="truncate text-[11px] text-outline">Módulo do tenant</p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              title="Recolher sidebar"
              aria-label="Recolher sidebar"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface md:flex"
            >
              <span className="material-symbols-outlined text-[20px]">left_panel_close</span>
            </button>
          </div>

          <nav className="space-y-1.5">
            {navItemsSubmoduloConfiguracao.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                onClick={navegarMobile}
                style={{ animationDelay: `${index * 28}ms` }}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-3 py-2.5 text-body-md transition-all animate-[submenuItem_160ms_ease-out_both] ${isActive ? 'bg-primary text-white font-bold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="material-symbols-outlined text-[18px]" style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-outline-variant bg-surface p-3">
            <p className="truncate text-body-md font-bold text-on-surface">{user?.tenant.nome ?? 'UserPulse'}</p>
            <p className="truncate text-label-md text-outline">Configurações do workspace</p>
          </div>
        </div>
        <style>{`
          @keyframes submenuItem {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </aside>
    )
  }

  return (
    <aside
      className={`fixed left-4 top-3 bottom-3 w-[264px] ${collapsed ? 'md:w-16' : 'md:w-[264px]'} bg-white border border-outline-variant flex flex-col px-2.5 py-4 z-50 shadow-panel overflow-hidden rounded-3xl transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)] md:translate-x-0'}`}
    >
      <div className={`mb-7 flex h-10 items-center ${collapsed ? 'justify-center' : 'justify-center md:justify-between md:px-1'}`}>
        <div className={`flex h-10 items-center gap-3 min-w-0 ${collapsed ? 'md:pointer-events-none md:w-0 md:opacity-0' : 'md:w-auto md:opacity-100'}`}>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shrink-0">
            <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
          </div>
          <div className={`overflow-hidden ${collapsed ? 'block max-w-[180px] opacity-100 md:hidden md:max-w-0 md:opacity-0' : 'block max-w-[180px] opacity-100'}`}>
            <h1 className="text-title-md font-bold text-on-surface leading-tight whitespace-nowrap">UserPulse</h1>
            <p className="text-label-md font-medium text-outline whitespace-nowrap truncate max-w-[170px]" title={user?.tenant.nome}>{user?.tenant.nome ?? 'UserPulse'}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          title="Expandir sidebar"
          aria-label="Expandir sidebar"
          className={`p-2 rounded-full text-on-surface-variant hover:bg-surface transition-all duration-200 ease-out ${collapsed ? 'hidden md:flex' : 'hidden'}`}
        >
          <span className="material-symbols-outlined text-[21px]">left_panel_open</span>
        </button>
        <button
          onClick={onToggle}
          title="Recolher sidebar"
          aria-label="Recolher sidebar"
          className={`p-2 rounded-full text-on-surface-variant hover:bg-surface transition-colors shrink-0 ${collapsed ? 'hidden' : 'hidden md:flex'}`}
        >
          <span className="material-symbols-outlined text-[20px]">left_panel_close</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
        <div className="space-y-2 animate-[mainMenuIn_140ms_ease-out_both]">
          {itemsPrincipais.map((item, index) => (
            <div key={'to' in item ? item.to : item.action} style={{ animationDelay: `${index * 16}ms` }} className="animate-[mainMenuItem_140ms_ease-out_both]">
              {'to' in item
                ? <NavItem {...item} collapsed={collapsed} onClick={navegarMobile} />
                : <NavAction icon={item.icon} label={item.label} collapsed={collapsed} onClick={abrirSubmoduloConfiguracoes} />}
            </div>
          ))}
        </div>
      </nav>

      <style>{`
        @keyframes mainMenuIn {
          from { opacity: 0.92; }
          to { opacity: 1; }
        }
        @keyframes mainMenuItem {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="mt-auto space-y-2 pt-4">
        <div className={`rounded-[1.5rem] border border-outline-variant/45 bg-surface p-3 shadow-sm ${collapsed ? 'flex items-center gap-3 md:hidden' : 'flex items-center gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined ms-fill text-[18px]">auto_awesome</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-body-md font-bold text-on-surface">{user?.tenant.nome ?? 'UserPulse'}</p>
            <p className="truncate text-label-md text-outline">Central de engajamento</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          title="Sair"
          aria-label="Sair"
          className="w-full flex items-center justify-start rounded-2xl text-on-surface-variant hover:bg-surface hover:text-error transition-colors"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
            <span className="material-symbols-outlined text-[21px]">logout</span>
          </span>
          <span className={`text-body-md overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out ${collapsed ? 'max-w-[170px] opacity-100 ml-2 md:max-w-0 md:opacity-0 md:ml-0' : 'max-w-[170px] opacity-100 ml-2'}`}>Sair</span>
        </button>
      </div>
    </aside>
  )
}
