import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getDashboard } from '../api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface PartidaKPI {
  partida_code: string
  partida_name: string
  budget: number
  executed: number
  execution_pct: number
  traffic_light: 'GREEN' | 'AMBER' | 'RED'
}

interface CollectionsKPI {
  total_plans: number
  active_plans: number
  collection_rate: number
  overdue_officer: number
  overdue_management: number
  overdue_legal: number
}

interface DashboardData {
  project_id: string
  partida_kpis: PartidaKPI[]
  collections: CollectionsKPI
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const tlColor = (tl: string) =>
  ({ GREEN: '#16a34a', AMBER: '#d97706', RED: '#dc2626' }[tl] ?? '#6b7280')

const tlBg = (tl: string) =>
  ({ GREEN: 'bg-green-50 border-green-200 text-green-700',
     AMBER: 'bg-amber-50 border-amber-200 text-amber-700',
     RED:   'bg-red-50 border-red-200 text-red-700' }[tl] ?? 'bg-gray-50')

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

// ── Sub-components ─────────────────────────────────────────────────────────────
function TrafficBadge({ tl }: { tl: string }) {
  const labels: Record<string, string> = { GREEN: 'OK', AMBER: 'ALERTA', RED: 'CRÍTICO' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${tlBg(tl)}`}>
      {labels[tl] ?? tl}
    </span>
  )
}

function CollectionsStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color ?? 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const [selectedProject, setSelectedProject] = useState<string>('')

  // pick first project as default
  const projectId = selectedProject || projects?.[0]?.id || ''

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', projectId],
    queryFn: () => getDashboard(projectId),
    enabled: !!projectId,
  })

  const kpis = dashboard?.partida_kpis ?? []
  const col = dashboard?.collections

  return (
    <div className="space-y-6">
      {/* Project selector */}
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
        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
          [A-APPROVAL] datos sintéticos
        </span>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Cargando dashboard…</div>
      )}

      {dashboard && (
        <>
          {/* Collections strip */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-brand-purple" />
              <h2 className="text-sm font-semibold text-gray-700">Cobros — Resumen General</h2>
            </div>
            <div className="grid grid-cols-6 gap-4 divide-x divide-gray-100">
              <CollectionsStat label="Planes Activos" value={col?.active_plans ?? 0} />
              <CollectionsStat
                label="Tasa Cobro"
                value={`${((col?.collection_rate ?? 0) * 100).toFixed(1)}%`}
                color="text-brand-purple"
              />
              <CollectionsStat label="Mora D+1" value={col?.overdue_officer ?? 0} color="text-amber-600" />
              <CollectionsStat label="Mora D+6" value={col?.overdue_management ?? 0} color="text-orange-600" />
              <CollectionsStat label="Mora D+16" value={col?.overdue_legal ?? 0} color="text-red-600" />
              <div className="text-center pl-4">
                {(col?.overdue_legal ?? 0) > 0
                  ? <AlertTriangle size={24} className="text-red-500 mx-auto" />
                  : <CheckCircle size={24} className="text-green-500 mx-auto" />}
                <div className="text-xs text-gray-500 mt-0.5">Estado Legal</div>
              </div>
            </div>
          </div>

          {/* Budget execution chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-brand-purple" />
              <h2 className="text-sm font-semibold text-gray-700">Ejecución Presupuestaria por Partida</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={kpis} layout="vertical" margin={{ left: 120, right: 60, top: 4, bottom: 4 }}>
                <XAxis type="number" domain={[0, 120]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="partida_name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip
                  formatter={(v: any, _n: any, props: any) => [
                    `${v.toFixed(1)}%  |  ${fmt(props.payload.executed)} / ${fmt(props.payload.budget)}`,
                    'Ejecución',
                  ]}
                />
                {/* 100% reference line area via Cell */}
                <Bar dataKey="execution_pct" radius={[0, 4, 4, 0]}>
                  {kpis.map((k, i) => (
                    <Cell key={i} fill={tlColor(k.traffic_light)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Partida detail table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Código', 'Partida', 'Presupuesto', 'Ejecutado', '% Ejec.', 'Estado'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kpis.map(k => (
                  <tr key={k.partida_code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{k.partida_code}</td>
                    <td className="px-4 py-2.5 text-gray-700">{k.partida_name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(k.budget)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-medium">{fmt(k.executed)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold" style={{ color: tlColor(k.traffic_light) }}>
                      {k.execution_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5">
                      <TrafficBadge tl={k.traffic_light} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
