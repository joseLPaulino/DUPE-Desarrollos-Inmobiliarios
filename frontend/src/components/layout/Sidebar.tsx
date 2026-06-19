import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Building2, CreditCard, AlertOctagon,
  BarChart3, FileSearch, ChevronRight, TrendingUp, BrainCircuit,
  FileSpreadsheet, PlusCircle, BookOpen, Target,
  ShoppingBag, FolderOpen, Wrench, CalendarDays, Sparkles, Database, Calculator,
} from 'lucide-react'

const nav = [
  { to: '/dashboard',                icon: LayoutDashboard,  label: 'Dashboard',         group: 'Principal' },
  { to: '/projects',                 icon: Building2,        label: 'Proyectos',          group: 'Principal' },
  { to: '/goals',                    icon: Target,           label: 'Metas y Objetivos',  group: 'Principal' },
  { to: '/calendar',                 icon: CalendarDays,     label: 'Calendario',         group: 'Principal' },
  { to: '/collections',              icon: CreditCard,       label: 'Cobros',             group: 'Cobranza' },
  { to: '/collections/overdue',      icon: AlertOctagon,     label: 'Cuotas Vencidas',    group: 'Cobranza' },
  { to: '/finance/budget',           icon: BarChart3,        label: 'Presupuesto',        group: 'Finanzas' },
  { to: '/finance/cashflow',         icon: TrendingUp,       label: 'Flujo de Caja',      group: 'Finanzas' },
  { to: '/finance/reconciliation',   icon: FileSearch,       label: 'Conciliación',       group: 'Finanzas' },
  { to: '/finance/contabilidad',     icon: BookOpen,         label: 'Contabilidad',       group: 'Finanzas' },
  { to: '/finance/viabilidad',       icon: Calculator,       label: 'Análisis Viabilidad', group: 'Finanzas' },
  { to: '/finance/predictions',      icon: BrainCircuit,     label: 'IA Predicciones',    group: 'Inteligencia' },
  { to: '/data-entry',               icon: PlusCircle,       label: 'Entrada de Datos',   group: 'Inteligencia' },
  { to: '/finance/import',           icon: FileSpreadsheet,  label: 'Importar Excel',     group: 'Inteligencia' },
  { to: '/comercial',                icon: ShoppingBag,      label: 'Comercial',          group: 'Operaciones' },
  { to: '/gestion',                  icon: FolderOpen,       label: 'Gestión',            group: 'Operaciones' },
  { to: '/postventa',                icon: Wrench,           label: 'Postventa',          group: 'Operaciones' },
  { to: '/intelligence',             icon: Sparkles,         label: 'IA Agéntica',        group: 'Inteligencia' },
  { to: '/data-explorer',            icon: Database,         label: 'Explorador BD',      group: 'Sistema' },
]
const groups = ['Principal', 'Cobranza', 'Finanzas', 'Operaciones', 'Inteligencia', 'Sistema']

export default function Sidebar() {
  return (
    <aside className="w-60 flex flex-col bg-[#0F0A1E] text-white">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#5F1EBE] flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">D</span>
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-wide">DUPE</div>
            <div className="text-[10px] text-purple-300 leading-tight">Plataforma Agéntica</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
        {groups.map(group => {
          const items = nav.filter(n => n.group === group)
          return (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-1.5">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      'group flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ' +
                      (isActive
                        ? 'bg-purple-600/30 text-white border border-purple-500/30'
                        : 'text-white/50 hover:text-white hover:bg-white/5')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="flex items-center gap-3">
                          <Icon size={16} className={isActive ? 'text-purple-300' : 'text-white/40 group-hover:text-white/70'} />
                          {label}
                        </span>
                        {isActive && <ChevronRight size={12} className="text-purple-400" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">JP</div>
          <div>
            <div className="text-xs font-medium text-white/80">Jose Paulino</div>
            <div className="text-[10px] text-white/30">HCLTech AI Labs</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
