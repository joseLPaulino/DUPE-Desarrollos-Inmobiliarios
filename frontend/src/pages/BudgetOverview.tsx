/**
 * BudgetOverview — executive budget execution view.
 *
 * API field names (verified from Python dataclasses):
 *   PartidaKPI: code, name, budgeted, executed, pct (0-100), traffic_light ("green"|"amber"|"red")
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, ReferenceLine,
} from 'recharts'
import { BarChart3, ChevronDown, AlertTriangle, CheckCircle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface PartidaKPI {
  code: string       // NOT partida_code
  name: string       // NOT partida_name
  budgeted: number   // NOT budget — Python Decimal, may come as string
  executed: number   // Python Decimal, may come as string
  pct: number        // NOT execution_pct — percentage 0-100, may come as string
  traffic_light: string  // lowercase: "green" | "amber" | "red"
}

interface DashboardData { partida_kpis: PartidaKPI[]; collections: any }
interface ProjectSummary { id: string; name: string; currency: string }

// ── Traffic light config (keys uppercase, API values are lowercase) ────────────
const tlu = (v?: string) => (v ?? 'green').toUpperCase()

const TL: Record<string, { cls: string; label: string; dot: string; bar: string }> = {
  GREEN: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'OK',      dot: 'bg-emerald-500', bar: '#10b981' },
  AMBER: { cls: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Alerta',  dot: 'bg-amber-400',   bar: '#f59e0b' },
  RED:   { cls: 'bg-red-50 text-red-700 border-red-200',             label: 'Crítico', dot: 'bg-red-500',     bar: '#ef4444' },
}
const tlFor = (v?: string) => TL[tlu(v)] ?? TL.GREEN

// ── Helpers ───────────────────────────────────────────────────────────────────
const n = (v: unknown): number => Number(v) || 0

const fmt = (v: unknown, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(n(v))

// ── Component ─────────────────────────────────────────────────────────────────
export default function BudgetOverview() {
  const [projectId, setProjectId] = useState('')

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const { getProjects } = await import('../api'); return getProjects() },
  })

  const activeId      = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)
  const currency      = activeProject?.currency ?? 'DOP'

  const { data: dash, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', activeId],
    queryFn: () => getDashboard(activeId!),
    enabled: !!activeId,
  })

  // Use correct field names from API
  const partidas   = dash?.partida_kpis ?? []
  const totalBudget = partidas.reduce((s, p) => s + n(p.budgeted), 0)
  const totalExec   = partidas.reduce((s, p) => s + n(p.executed), 0)
  const alertCount  = partidas.filter(p => p.traffic_light === 'amber').length
  const critCount   = partidas.filter(p => p.traffic_light === 'red').length
  const overallPct  = totalBudget > 0 ? (totalExec / totalBudget * 100) : 0

  const chartData = partidas.map(p => ({
    code:     p.code,
    name:     (p.name ?? '').length > 30 ? p.name.slice(0, 30) + '…' : p.name,
    budget:   parseFloat((n(p.budgeted) / 1_000_000).toFixed(2)),
    executed: parseFloat((n(p.executed) / 1_000_000).toFixed(2)),
    pct:      n(p.pct),
    tl:       p.traffic_light,
  }))

  return (
    <div className="space-y-5">
      {/* ── Header strip ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Total presupuestado', value: fmt(totalBudget, currency),    color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
            { label: 'Total ejecutado',     value: fmt(totalExec, currency),      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
            { label: 'Ejecución global',    value: `${overallPct.toFixed(1)}%`,   color: overallPct >= 100 ? 'text-red-700' : overallPct >= 90 ? 'text-amber-700' : 'text-emerald-700',
              bg: overallPct >= 100 ? 'bg-red-50 border-red-200' : overallPct >= 90 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200' },
            { label: 'Partidas en alerta',  value: `${alertCount} partidas`,      color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
            { label: 'Partidas críticas',   value: `${critCount} partidas`,       color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`text-center px-4 py-2 rounded-xl border ${bg}`}>
              <div className={`text-sm font-bold ${color}`}>{value}</div>
              <div className={`text-[10px] ${color} opacity-70`}>{label}</div>
            </div>
          ))}
        </div>

        {/* Project selector */}
        <div className="relative">
          <select
            value={activeId ?? ''}
            onChange={e => setProjectId(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-violet-200 w-56"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Budget vs Executed bar chart ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-gray-700">
            Presupuestado vs. Ejecutado (millones {currency})
          </h3>
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-200 inline-block" /> Presupuestado</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 inline-block" /> OK</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400 inline-block" /> Alerta</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500 inline-block" /> Crítico</span>
          </div>
        </div>

        {isLoading ? (
          <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-gray-300 gap-2">
            <BarChart3 size={32} />
            <p className="text-sm">Sin datos presupuestarios para este proyecto</p>
            <p className="text-xs text-gray-200">Importa el modelo financiero en "Importar Excel"</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={3} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                label={{ value: `MM ${currency}`, angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#9ca3af' } }}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb' }}
                formatter={(v: number, name: string, props: any) => [
                  `${v.toFixed(2)}M ${currency}`,
                  name === 'budget' ? 'Presupuestado' : `Ejecutado (${props.payload.pct.toFixed(1)}%)`,
                ]}
                labelFormatter={(_: any, pl: any[]) => pl?.[0]?.payload?.name ?? ''}
              />
              <Bar dataKey="budget" fill="#e9d5ff" radius={[3, 3, 0, 0]} name="budget" />
              <Bar dataKey="executed" radius={[3, 3, 0, 0]} name="executed">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={tlFor(d.tl).bar} />
                ))}
              </Bar>
              <ReferenceLine y={0} stroke="#e5e7eb" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Partida detail table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Detalle por Partida</h3>
          <span className="text-xs text-gray-400">{partidas.length} partidas</span>
        </div>

        {isLoading ? (
          <div className="p-8 animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-gray-50 rounded" />)}
          </div>
        ) : partidas.length === 0 ? (
          <div className="p-12 text-center text-gray-300 space-y-2">
            <BarChart3 size={32} className="mx-auto" />
            <p className="text-sm font-medium">Sin partidas para este proyecto</p>
            <p className="text-xs">Importa el modelo financiero para ver la ejecución presupuestaria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50 bg-gray-50/50">
                  {['Código', 'Partida', 'Presupuestado', 'Ejecutado', 'Ejecución %', 'Estado'].map(h => (
                    <th key={h} className="px-6 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {partidas.map(p => {
                  const tl  = tlFor(p.traffic_light)
                  const pct = n(p.pct)
                  return (
                    <tr key={p.code} className="hover:bg-gray-50 transition-colors">
                      {/* Code */}
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {p.code}
                        </span>
                      </td>
                      {/* Name */}
                      <td className="px-6 py-3.5 text-xs text-gray-700 max-w-[220px]">{p.name}</td>
                      {/* Budgeted */}
                      <td className="px-6 py-3.5 text-xs text-gray-600">{fmt(p.budgeted, currency)}</td>
                      {/* Executed */}
                      <td className="px-6 py-3.5 text-xs font-semibold text-gray-800">{fmt(p.executed, currency)}</td>
                      {/* Execution % with bar */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: tl.bar }}
                            />
                          </div>
                          <span className="text-xs font-bold" style={{ color: tl.bar }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      {/* Status badge */}
                      <td className="px-6 py-3.5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${tl.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tl.dot}`} />
                          {tl.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs">
                  <td className="px-6 py-3 text-gray-500 text-[11px] uppercase tracking-wide" colSpan={2}>
                    Total
                  </td>
                  <td className="px-6 py-3 text-gray-700">{fmt(totalBudget, currency)}</td>
                  <td className="px-6 py-3 text-gray-900">{fmt(totalExec, currency)}</td>
                  <td className="px-6 py-3" colSpan={2}>
                    <span className={`text-sm font-bold`} style={{ color: tlFor(overallPct >= 100 ? 'red' : overallPct >= 90 ? 'amber' : 'green').bar }}>
                      {overallPct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-gray-400 ml-1">global</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
