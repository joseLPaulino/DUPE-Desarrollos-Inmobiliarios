import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, CreditCard, AlertTriangle, DollarSign, FileSearch } from 'lucide-react'

const nav = [
  { to: '/dashboard',               icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects',                icon: Building2,       label: 'Proyectos' },
  { to: '/collections',             icon: CreditCard,      label: 'Cobros' },
  { to: '/collections/overdue',     icon: AlertTriangle,   label: 'Morosidad' },
  { to: '/finance/budget',          icon: DollarSign,      label: 'Presupuesto' },
  { to: '/finance/reconciliation',  icon: FileSearch,      label: 'Conciliación' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-200">
        <span className="text-lg font-bold text-brand-purple">DUPE</span>
        <span className="text-xs text-gray-400 block leading-tight">Plataforma Agéntica</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ` +
              (isActive
                ? 'bg-brand-light text-brand-purple'
                : 'text-gray-600 hover:bg-gray-100')
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-400">
        HCLTech AI Labs · v0.1
      </div>
    </aside>
  )
}
