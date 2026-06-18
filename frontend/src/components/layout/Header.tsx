import { useLocation } from 'react-router-dom'

const titles: Record<string, string> = {
  '/dashboard':              'Dashboard Ejecutivo',
  '/projects':               'Proyectos',
  '/collections':            'Portal de Cobros',
  '/collections/overdue':    'Cola de Morosidad',
  '/finance/budget':         'Presupuesto',
  '/finance/reconciliation': 'Conciliación Bancaria',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = titles[pathname] ?? 'DUPE'
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
          DATOS SINTÉTICOS
        </span>
        <span className="text-xs text-gray-400">Jose Paulino · HCLTech</span>
      </div>
    </header>
  )
}
