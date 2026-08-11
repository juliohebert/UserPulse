import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConfiguracao } from '../../utils/permissions'

// Itens que só levam a telas de configuração (ver RequireEscritaConfiguracao.tsx)
// ficam marcados à parte — escondidos de quem não tem permissão, pra não
// oferecer um link que só mostraria a mensagem de acesso restrito. A criação de
// conteúdo fica no botão "Novo" do header (Topbar.tsx).
const navItemsConfiguracao = [
  { icon: 'grid_view', label: 'Catálogo de Telas', to: '/catalogo-telas' },
  { icon: 'palette', label: 'Aparência do Widget', to: '/aparencia-widget' },
  { icon: 'receipt_long', label: 'Minha Assinatura', to: '/minha-assinatura' },
]

interface Props {
  collapsed: boolean
  onToggle: () => void
}

function NavItem({ icon, label, to, collapsed }: { icon: string; label: string; to: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className={({ isActive }) =>
        `group flex items-center justify-start rounded-2xl transition-all text-body-md ${
          isActive
            ? 'bg-surface text-on-surface font-bold shadow-sm ring-1 ring-outline-variant/40'
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
          <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-0 opacity-0 ml-0 md:max-w-[170px] md:opacity-100 md:ml-2'}`}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const { user, logout } = useAuth()
  // "Gestão SaaS" só existe para quem gerencia tenants/planos/teste grátis
  // entre clientes (ver requireSuperAdmin.ts no backend, que também bloqueia
  // isso independente do que a sidebar mostra). Leva pra /admin/tenants —
  // rota técnica preservada mesmo com o rótulo visível virando "Clientes"
  // (ver AdminSaasTabs.tsx).
  // RBAC real (ver server/src/middleware/requireEscritaTenant.ts) — esconder
  // aqui é só UX, o backend já bloqueia 403 em qualquer chamada de escrita.
  const items = [
    { icon: 'dashboard', label: 'Dashboard', to: '/' },
    { icon: 'campaign', label: 'Campanhas', to: '/campanhas' },
    { icon: 'map', label: 'Tours Guiados', to: '/tours' },
    { icon: 'route', label: 'Jornadas', to: '/jornadas' },
    ...(podeEscreverConfiguracao(user?.role) ? navItemsConfiguracao : []),
    { icon: 'integration_instructions', label: 'Integração', to: '/integracao' },
    ...(user?.role === 'SUPER_ADMIN' ? [{ icon: 'admin_panel_settings', label: 'Gestão SaaS', to: '/admin/tenants' }] : []),
  ]

  return (
    <aside
      className={`fixed left-3 top-3 bottom-3 w-16 ${collapsed ? 'md:w-16' : 'md:w-[264px]'} bg-surface-container-lowest/95 border border-outline-variant/50 flex flex-col px-2.5 py-4 z-50 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-[width] duration-300 ease-out overflow-hidden rounded-[2rem] backdrop-blur`}
    >
      {/* Logo + toggle — no mobile sempre em modo ícone (a sidebar não vira drawer nessa largura) */}
      <div className={`mb-7 flex items-center justify-center transition-all duration-300 ease-out ${collapsed ? 'md:h-10' : 'md:justify-between md:px-1'}`}>
        <div className={`flex items-center gap-3 min-w-0 transition-all duration-200 ease-out ${collapsed ? 'md:pointer-events-none md:w-0 md:scale-95 md:opacity-0' : 'md:w-auto md:scale-100 md:opacity-100'}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary via-[#2d7df0] to-tertiary flex items-center justify-center text-on-primary shrink-0 shadow-sm">
            <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
          </div>
          <div className={`overflow-hidden transition-[max-width,opacity] duration-200 ease-out ${collapsed ? 'hidden max-w-0 opacity-0' : 'hidden max-w-[180px] opacity-100 md:block'}`}>
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

      <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-0.5">
        {items.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-4">
        <div className={`rounded-[1.5rem] border border-outline-variant/45 bg-surface p-3 shadow-sm ${collapsed ? 'hidden' : 'hidden md:flex md:items-center md:gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined ms-fill text-[18px]">auto_awesome</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-body-md font-bold text-on-surface">{user?.tenant.nome ?? 'UserPulse'}</p>
            <p className="truncate text-label-md text-outline">Central de engajamento</p>
          </div>
        </div>
        {/* setUser(null) em logout() já faz RequireAuth redirecionar pra
            /login sozinho (re-render do contexto) — sem navigate() manual aqui. */}
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
          <span className={`text-body-md overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-0 opacity-0 ml-0 md:max-w-[170px] md:opacity-100 md:ml-2'}`}>Sair</span>
        </button>
      </div>
    </aside>
  )
}
