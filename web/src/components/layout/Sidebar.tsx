import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConteudo, podeEscreverConfiguracao } from '../../utils/permissions'

// Itens que só levam a telas de escrita (ver RequireEscritaConteudo/
// Configuracao.tsx) ficam marcados à parte — escondidos de quem não tem
// permissão, pra não oferecer um link que só mostraria a mensagem de acesso
// restrito. O resto é sempre visível pra qualquer papel autenticado (leitura
// livre).
const navItemNovaCampanha = { icon: 'add_circle', label: 'Nova Campanha', to: '/campanhas/nova' }
const navItemsConfiguracao = [
  { icon: 'grid_view', label: 'Catálogo de Telas', to: '/catalogo-telas' },
  { icon: 'palette', label: 'Aparência do Widget', to: '/aparencia-widget' },
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
        `flex items-center justify-center ${!collapsed ? 'md:justify-start md:gap-3' : ''} px-3 py-2.5 rounded-full transition-colors text-body-sm font-bold ${
          isActive
            ? 'bg-primary text-on-primary'
            : 'text-charcoal hover:bg-surface-container-low'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className="material-symbols-outlined"
            style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {icon}
          </span>
          <span className={collapsed ? 'hidden' : 'hidden md:inline'}>{label}</span>
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
    ...(podeEscreverConteudo(user?.role) ? [navItemNovaCampanha] : []),
    { icon: 'map', label: 'Tours Guiados', to: '/tours' },
    { icon: 'route', label: 'Jornadas', to: '/jornadas' },
    ...(podeEscreverConfiguracao(user?.role) ? navItemsConfiguracao : []),
    { icon: 'integration_instructions', label: 'Integração', to: '/integracao' },
    ...(user?.role === 'SUPER_ADMIN' ? [{ icon: 'admin_panel_settings', label: 'Gestão SaaS', to: '/admin/tenants' }] : []),
  ]

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-16 ${collapsed ? 'md:w-16' : 'md:w-[248px]'} bg-surface border-r border-hairline-soft flex flex-col py-stack-md px-2 z-50 transition-[width] duration-200 overflow-hidden`}
    >
      {/* Logo + toggle — no mobile sempre em modo ícone (a sidebar não vira drawer nessa largura) */}
      <div className={`mb-6 flex items-center justify-center ${!collapsed ? 'md:justify-between md:px-1' : ''}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0">
            <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
          </div>
          <div className={`overflow-hidden ${collapsed ? 'hidden' : 'hidden md:block'}`}>
            <h1 className="text-title-lg font-semibold text-primary leading-tight whitespace-nowrap">UserPulse</h1>
            <p className="text-label-md text-steel whitespace-nowrap">Feedback Engine</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          title="Recolher sidebar"
          className={`h-10 w-10 rounded-full text-charcoal hover:bg-surface-container-low transition-colors shrink-0 ${collapsed ? 'hidden' : 'hidden md:flex items-center justify-center'}`}
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
      </div>

      <button
        onClick={onToggle}
        title="Expandir sidebar"
        className={`mb-4 mx-auto h-10 w-10 rounded-full text-charcoal hover:bg-surface-container-low transition-colors ${collapsed ? 'hidden md:flex items-center justify-center' : 'hidden'}`}
      >
        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
      </button>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
        {items.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mt-auto border-t border-hairline-soft pt-stack-md">
        {/* setUser(null) em logout() já faz RequireAuth redirecionar pra
            /login sozinho (re-render do contexto) — sem navigate() manual aqui. */}
        <button
          type="button"
          onClick={() => logout()}
          title="Sair"
          className={`w-full flex items-center justify-center ${!collapsed ? 'md:justify-start md:gap-3' : ''} px-3 py-2.5 rounded-full text-error hover:bg-error-container transition-colors`}
        >
          <span className="material-symbols-outlined">logout</span>
          <span className={`text-body-md whitespace-nowrap ${collapsed ? 'hidden' : 'hidden md:inline'}`}>Sair</span>
        </button>
      </div>
    </aside>
  )
}
