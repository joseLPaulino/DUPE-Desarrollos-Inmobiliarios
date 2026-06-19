import { useLocation } from 'react-router-dom'
import { Bell, RefreshCw, FlaskConical } from 'lucide-react'

const titles: Record<string, { title: string; sub: string }> = {
  '/dashboard':              { title: 'Dashboard Ejecutivo',    sub: 'Visión general · Todos los proyectos' },
  '/projects':               { title: 'Proyectos',              sub: 'Portafolio activo DUPE Desarrollos' },
  '/collections':            { title: 'Portal de Cobros',       sub: 'Planes de pago · Estado de cuotas' },
  '/overdue':                { title: 'Cuotas Vencidas',        sub: 'Alertas activas · Escalamiento' },
  '/finance/budget':         { title: 'Presupuesto',            sub: 'Ejecución vs. presupuestado' },
  '/finance/cashflow':       { title: 'Flujo de Caja',         sub: 'Proyectado vs. real · 24–48 meses' },
  '/finance/reconciliation': { title: 'Conciliación Bancaria',  sub: 'Carga de extractos · Auto-conciliación' },
  '/finance/predictions':    { title: 'Predicciones IA',        sub: 'Proyecciones · Alertas tempranas' },
  '/finance/import':         { title: 'Importar Excel',         sub: 'Cargar modelo financiero DUPE' },
  '/data-entry':             { title: 'Entrada de Datos',       sub: 'Transacciones · Pagos · Ejecución' },
}

export default function Header() {
  const { pathname } = useLocation()
  const info = titles[pathname] ?? { title: 'DUPE Plataforma', sub: '' }
  return (
    <div>
      {/* ── DEMO banner — remove when going live with real data ── */}
      <div className="bg-amber-400 text-amber-950 px-6 py-1.5 flex items-center justify-center gap-2 text-[11px] font-semibold tracking-wide">
        <FlaskConical size={12} />
        DATOS SINTÉTICOS DE DEMOSTRACIÓN — Esta información es ficticia y fue generada para pruebas. No representa operaciones reales de DUPE.
        <FlaskConical size={12} />
      </div>

      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">{info.title}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{info.sub}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors relative">
            <Bell size={14} />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </header>
    </div>
  )
}
