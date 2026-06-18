import { useQuery } from '@tanstack/react-query'
import { getProjects } from '../api'
import { Building2, Calendar, Hash } from 'lucide-react'

const statusLabel: Record<string, string> = {
  ACTIVE:     'Activo',
  COMPLETED:  'Completado',
  PAUSED:     'Pausado',
  PLANNING:   'Planificación',
}

const statusStyle: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  PAUSED:    'bg-amber-100 text-amber-700',
  PLANNING:  'bg-gray-100 text-gray-600',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

export default function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  if (isLoading) return <div className="text-center py-16 text-gray-400">Cargando proyectos…</div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-600">
        [A-APPROVAL] Proyectos sintéticos — reemplazar con datos reales en Día 1.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(projects ?? []).map((p: any) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-brand-purple" />
                <h2 className="font-semibold text-gray-800 text-sm">{p.name}</h2>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusStyle[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {statusLabel[p.status] ?? p.status}
              </span>
            </div>
            <div className="space-y-1.5 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Hash size={13} className="text-gray-400" />
                <span>{p.total_units} unidades · {p.project_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-gray-400" />
                <span>Inicio: {p.start_date ?? '—'} · Entrega: {p.expected_delivery_date ?? '—'}</span>
              </div>
              {p.total_budget_dop != null && (
                <div className="font-medium text-brand-purple mt-2">{fmt(p.total_budget_dop)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
