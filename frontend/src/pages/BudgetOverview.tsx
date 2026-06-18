import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getDashboard } from '../api'
import { RadialBarChart, RadialBar, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts'
import { AlertTriangle } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

const tlColor = (tl: string) =>
  ({ GREEN: '#16a34a', AMBER: '#d97706', RED: '#dc2626' }[tl] ?? '#6b7280')

const tlBg = (tl: string) =>
  ({ GREEN: 'bg-green-50 text-green-700',
     AMBER: 'bg-amber-50 text-amber-700',
     RED:   'bg-red-50 text-red-700' }[tl] ?? 'bg-gray-50 text-gray-600')

export default function BudgetOverview() {
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const [selectedProject, setSelectedProject] = useState<string>('')
  const projectId = selectedProject || projects?.[0]?.id || ''

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => getDashboard(projectId),
    enabled: !!projectId,
  })

  const kpis = dashboard?.partida_kpis ?? []
  const redItems = kpis.filter((k: any) => k.traffic_light === 'RED')
  const amberItems = kpis.filter((k: any) => k.traffic_light === 'AMBER')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Proyecto:</label>
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-purple"
          value={projectId}
          onChange={e => setSelectedProject(e.target.value)}
        >
          {(projects ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-amber-600">
        [A-COA] Plan de cuentas provisional. Aprobar con gerencia en Semana 1.
        [A-FX] Solo RD$ por ahora — proyectos en USD requieren tasa manual.
      </p>

      {isLoading && <div className="text-center py-12 text-gray-400">Cargando presupuesto…</div>}

      {kpis.length > 0 && (
        <>
          {/* Alerts */}
          {(redItems.length > 0 || amberItems.length > 0) && (
            <div className="space-y-2">
              {redItems.map((k: any) => (
                <div key={k.partida_code} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm">
                  <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
                  <span className="font-medium text-red-700">
                    CRÍTICO — {k.partida_name}: {k.execution_pct.toFixed(1)}% ejecutado
                    {k.execution_pct > 110 && ' — BLOQUEO PRESUPUESTARIO activo (>110%)'}
                  </span>
                </div>
              ))}
              {amberItems.map((k: any) => (
                <div key={k.partida_code} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm">
                  <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
                  <span className="text-amber-700">{k.partida_name}: {k.execution_pct.toFixed(1)}% — en zona de alerta</span>
                </div>
              ))}
            </div>
          )}

          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Presupuesto vs. Ejecutado</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={kpis} margin={{ left: 20, right: 20, bottom: 50, top: 4 }}>
                <XAxis
                  dataKey="partida_code"
                  tick={{ fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any, name: string) => [fmt(v), name === 'budget' ? 'Presupuesto' : 'Ejecutado']}
                />
                <Bar dataKey="budget" fill="#e5e7eb" name="budget" radius={[4, 4, 0, 0]} />
                <Bar dataKey="executed" name="executed" radius={[4, 4, 0, 0]}>
                  {kpis.map((k: any, i: number) => (
                    <Cell key={i} fill={tlColor(k.traffic_light)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Presupuestado', value: fmt(kpis.reduce((s: number, k: any) => s + k.budget, 0)), cls: 'text-gray-800' },
              { label: 'Total Ejecutado', value: fmt(kpis.reduce((s: number, k: any) => s + k.executed, 0)), cls: 'text-brand-purple' },
              { label: 'Partidas en Alerta', value: amberItems.length, cls: 'text-amber-600' },
              { label: 'Partidas Críticas', value: redItems.length, cls: 'text-red-600' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <div className={`text-xl font-bold ${card.cls}`}>{card.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
