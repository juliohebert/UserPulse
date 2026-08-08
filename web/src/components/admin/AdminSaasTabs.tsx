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
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `rounded-full border px-4 py-2 text-label-md font-bold transition-colors ${
              isActive
                ? 'border-ink-deep bg-ink-deep text-white'
                : 'border-hairline bg-surface text-ink hover:bg-surface-container-low'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
