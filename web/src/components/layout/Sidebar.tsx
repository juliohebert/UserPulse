import { NavLink } from 'react-router-dom'

const navItems = [
  { icon: 'dashboard', label: 'Dashboard', to: '/' },
  { icon: 'campaign', label: 'Campanhas', to: '/campanhas' },
  { icon: 'add_circle', label: 'Nova Campanha', to: '/campanhas/nova' },
  { icon: 'map', label: 'Tours Guiados', to: '/tours' },
  { icon: 'route', label: 'Jornadas', to: '/jornadas' },
  { icon: 'grid_view', label: 'Catálogo de Telas', to: '/catalogo-telas' },
  { icon: 'integration_instructions', label: 'Integração', to: '/integracao' },
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
        `flex items-center justify-center ${!collapsed ? 'md:justify-start md:gap-3' : ''} px-3 py-2.5 rounded-xl transition-colors text-body-md ${
          isActive
            ? 'bg-surface-container-high text-primary font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
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
  return (
    <aside
      className={`fixed left-0 top-0 h-full w-16 ${collapsed ? 'md:w-16' : 'md:w-[248px]'} bg-surface border-r border-outline-variant flex flex-col py-stack-md px-2 z-50 shadow-sm transition-[width] duration-200 overflow-hidden`}
    >
      {/* Logo + toggle — no mobile sempre em modo ícone (a sidebar não vira drawer nessa largura) */}
      <div className={`mb-6 flex items-center justify-center ${!collapsed ? 'md:justify-between md:px-1' : ''}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary shrink-0">
            <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
          </div>
          <div className={`overflow-hidden ${collapsed ? 'hidden' : 'hidden md:block'}`}>
            <h1 className="text-headline-md font-bold text-primary leading-tight whitespace-nowrap">UserPulse</h1>
            <p className="text-label-md text-outline whitespace-nowrap">Feedback Engine</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          title="Recolher sidebar"
          className={`p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0 ${collapsed ? 'hidden' : 'hidden md:flex'}`}
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
      </div>

      <button
        onClick={onToggle}
        title="Expandir sidebar"
        className={`mb-4 mx-auto p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors ${collapsed ? 'hidden md:block' : 'hidden'}`}
      >
        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
      </button>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="mt-auto border-t border-outline-variant pt-stack-md">
        <a
          href="#"
          title="Sair"
          className={`flex items-center justify-center ${!collapsed ? 'md:justify-start md:gap-3' : ''} px-3 py-2.5 rounded-xl text-error hover:bg-error-container transition-colors`}
        >
          <span className="material-symbols-outlined">logout</span>
          <span className={`text-body-md whitespace-nowrap ${collapsed ? 'hidden' : 'hidden md:inline'}`}>Sair</span>
        </a>
      </div>
    </aside>
  )
}
