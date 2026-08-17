import { NavLink } from 'react-router-dom'

// Rotas técnicas (/admin/tenants) preservadas — só o rótulo visível virou
// "Clientes" (ver pedido de nomenclatura da tarefa de UX).
const TABS = [
  { to: '/admin/tenants', label: 'Clientes' },
  { to: '/admin/planos', label: 'Planos' },
]

// Navegação entre as duas telas do painel Super Admin — cobre o pedido de
// "seção de Planos" sem precisar de um segundo item fixo na sidebar (ver
// Sidebar.tsx, que só leva a /admin/tenants).
export function AdminSaasTabs() {
  return (
    <div className="flex items-center gap-1 mb-6 border-b border-outline-variant">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `px-4 py-2.5 text-label-md font-bold border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
