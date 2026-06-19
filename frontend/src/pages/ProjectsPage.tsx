/**
 * ProjectsPage — Executive project control center.
 * Click any project card to drill into full detail:
 *   units inventory · budget execution · collections KPIs · cash flow · key dates
 *
 * API field names (verified from Python dataclasses):
 *   PartidaKPI:    code, name, budgeted, executed, pct, traffic_light
 *   CollectionsKPI: total_plans, active_plans, collection_rate_pct (0-100),
 *                   officer_queue_count, management_queue_count, legal_queue_count
 *   DashboardData:  total_budget, total_executed, budget_execution_pct (0-100)
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getProjects, getDashboard, getCashFlow } from '../api'
import {
  Building2, Home, TrendingUp, DollarSign, Layers,
  ChevronRight, AlertTriangle, CheckCircle, Clock,
  BarChart3, CreditCard, ArrowUpRight, Info,
} from 'lucide-react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts'

// ── Types (field names match Python dataclasses exactly) ──────────────────────
interface ProjectSummary {
  id: string; name: string; status: string; project_type: string
  total_units: number; currency: string
  total_budget: number          // from /projects/ endpoint
  physical_progress_pct: number
  start_date: string; expected_delivery_date: string
}

interface Unit {
  id: string; unit_number: string; floor: number
  area_sqm: string; list_price: string; is_sold: boolean
}

// Field names exactly as returned by the API (dataclass field names)
interface PartidaKPI {
  code: string          // NOT partida_code
  name: string          // NOT partida_name
  budgeted: number      // NOT budget
  executed: number
  pct: number           // NOT execution_pct — percentage 0-100
  traffic_light: string // "GREEN" | "AMBER" | "RED"
}

interface CollectionsKPI {
  total_plans: number
  active_plans: number
  collection_rate_pct: number     // NOT collection_rate — already 0-100
  officer_queue_count: number     // NOT overdue_officer
  management_queue_count: number  // NOT overdue_management
  legal_queue_count: number       // NOT overdue_legal
}

interface DashboardData {
  total_budget: number
  total_executed: number
  budget_execution_pct: number    // 0-100
  overall_traffic_light: string
  partida_kpis: PartidaKPI[]
  collections: CollectionsKPI | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// API may serialize Python Decimal as a string — always coerce to number
const n = (v: unknown): number => Number(v) || 0

const fmt = (v: unknown, currency = 'DOP') =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(n(v))

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })

// API returns lowercase values ("green", "amber", "red") — normalize with .toUpperCase()
const tlColor: Record<string, string> = { GREEN: '#16a34a', AMBER: '#f59e0b', RED: '#ef4444' }
const tlBg: Record<string, string> = {
  GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AMBER: 'bg-amber-50 text-amber-700 border-amber-200',
  RED:   'bg-red-50 text-red-700 border-red-200',
}
const tlLabel: Record<string, string> = { GREEN: 'OK', AMBER: 'Alerta', RED: 'Crítico' }
// Normalize a traffic-light value to uppercase key
const tlu = (v?: string) => (v ?? 'green').toUpperCase()

const statusMap: Record<string, { label: string; dot: string; badge: string }> = {
  construction: { label: 'Construcción',  dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  planning:     { label: 'Planificación', dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed:    { label: 'Completado',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const typeLabel: Record<string, string> = {
  social_interest: 'Interés Social (RD$)',
  tourist: 'Turístico (USD)',
}

// ── Reusable mini-components ──────────────────────────────────────────────────
function ProgressBar({ pct, color = '#7C3AED', h = 'h-2' }: { pct: number; color?: string; h?: string }) {
  return (
    <div className={`${h} bg-gray-100 rounded-full overflow-hidden`}>
      <div className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(n(pct), 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-bold ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Project selector pill (left rail) ─────────────────────────────────────────
function ProjectPill({ p, selected, onClick }: { p: ProjectSummary; selected: boolean; onClick: () => void }) {
  const st = statusMap[p.status] ?? { label: p.status, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600 border-gray-200' }
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all ${
        selected
          ? 'border-violet-300 bg-violet-50 shadow-md shadow-violet-100'
          : 'border-gray-100 bg-white hover:border-violet-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${selected ? 'bg-violet-600' : 'bg-gray-100'}`}>
          <Building2 size={14} className={selected ? 'text-white' : 'text-gray-400'} />
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.badge}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${st.dot} mr-1`} />{st.label}
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-800 leading-snug">{p.name}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">
        {p.total_units} unidades · {typeLabel[p.project_type] ?? p.project_type}
      </p>
      <div className="mt-2">
        <ProgressBar pct={p.physical_progress_pct} color={selected ? '#7C3AED' : '#9ca3af'} h="h-1" />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">Avance físico</span>
          <span className={`text-[10px] font-bold ${selected ? 'text-violet-700' : 'text-gray-500'}`}>
            {n(p.physical_progress_pct).toFixed(0)}%
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Cash flow sparkline ───────────────────────────────────────────────────────
function CfSparkline({ projectId, currency }: { projectId: string; currency: string }) {
  const { data: cf = [] } = useQuery<any[]>({
    queryKey: ['cashflow', projectId],
    queryFn: () => getCashFlow(projectId),
    enabled: !!projectId,
  })
  const recent = cf.slice(-12)
  if (recent.length === 0) return (
    <div className="h-16 flex items-center justify-center text-xs text-gray-300">Sin datos de flujo de caja</div>
  )
  return (
    <ResponsiveContainer width="100%" height={72}>
      <AreaChart data={recent} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="cfGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
          </linearGradient>
        </defs>
        <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
        <Area type="monotone" dataKey="cumulative_balance" stroke="#7C3AED" strokeWidth={1.5}
          fill="url(#cfGrad2)" dot={false} />
        <Tooltip
          formatter={(v: number) => [fmt(v, currency), 'Acumulado']}
          labelFormatter={(l: string) => l}
          contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Full project detail panel ─────────────────────────────────────────────────
function ProjectDetail({ p }: { p: ProjectSummary }) {
  const navigate = useNavigate()
  const currency = p.currency

  const { data: units = [], isLoading: loadingUnits } = useQuery<Unit[]>({
    queryKey: ['units', p.id],
    queryFn: () => import('../api').then(m => m.getProjectUnits(p.id)),
  })

  const { data: dash, isLoading: loadingDash } = useQuery<DashboardData>({
    queryKey: ['dashboard', p.id],
    queryFn: () => getDashboard(p.id),
  })

  // Units inventory
  const soldUnits      = units.filter(u => u.is_sold)
  const availableUnits = units.filter(u => !u.is_sold)
  const soldPct        = units.length > 0 ? Math.round((soldUnits.length / units.length) * 100) : 0
  const totalRevenue   = soldUnits.reduce((s, u) => s + n(u.list_price), 0)
  const totalInventory = availableUnits.reduce((s, u) => s + n(u.list_price), 0)

  // Dashboard KPIs
  const coll         = dash?.collections
  const totalOverdue = (coll?.officer_queue_count ?? 0) + (coll?.management_queue_count ?? 0) + (coll?.legal_queue_count ?? 0)
  const partidas     = dash?.partida_kpis ?? []

  // Status badge
  const st = statusMap[p.status] ?? { label: p.status, dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-600 border-gray-200' }

  // Days to delivery
  const delivery = new Date(p.expected_delivery_date + 'T00:00:00')
  const daysLeft = Math.round((delivery.getTime() - Date.now()) / 86400000)

  const budgetPct = n(dash?.budget_execution_pct)
  const overallTL = tlu(dash?.overall_traffic_light)

  return (
    <div className="space-y-5">
      {/* ── Project hero ── */}
      <div className="bg-gradient-to-r from-[#0F0A1E] to-[#1e1040] rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${st.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${st.dot} mr-1`} />{st.label}
              </span>
              <span className="text-[10px] text-purple-300">{typeLabel[p.project_type] ?? p.project_type}</span>
            </div>
            <h2 className="text-xl font-bold leading-tight">{p.name}</h2>
            <p className="text-sm text-purple-300 mt-1">
              {p.total_units} unidades · {fmt(p.total_budget, currency)} presupuestado
            </p>
          </div>
          {/* Budget traffic light */}
          {dash && (
            <div className={`flex flex-col items-center px-4 py-3 rounded-xl border ${tlBg[overallTL] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Presupuesto</span>
              <span className="text-xl font-bold">{budgetPct.toFixed(1)}%</span>
              <span className="text-[10px] font-bold">{tlLabel[overallTL] ?? overallTL}</span>
            </div>
          )}
        </div>

        {/* Physical progress */}
        <div className="mt-5">
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px] text-white/50">Avance físico de obra</span>
            <span className="text-[11px] font-bold text-purple-200">{n(p.physical_progress_pct).toFixed(0)}%</span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-400 to-violet-300 rounded-full"
              style={{ width: `${Math.min(n(p.physical_progress_pct), 100)}%` }} />
          </div>
        </div>

        {/* Key dates */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/10 text-center">
          <div>
            <p className="text-[10px] text-white/40">Inicio de obra</p>
            <p className="text-xs font-semibold text-purple-200">{fmtDate(p.start_date)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Entrega estimada</p>
            <p className="text-xs font-semibold text-purple-200">{fmtDate(p.expected_delivery_date)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Días restantes</p>
            <p className={`text-xs font-bold ${daysLeft < 90 ? 'text-red-300' : daysLeft < 180 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {daysLeft > 0 ? `${daysLeft} días` : 'ENTREGADO'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* LEFT: Budget execution table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-violet-500" />
              <h3 className="text-xs font-semibold text-gray-700">Ejecución Presupuestaria</h3>
            </div>
            {dash && (
              <span className="text-[11px] font-semibold text-gray-500">
                {fmt(dash.total_executed, currency)} / {fmt(dash.total_budget, currency)}
              </span>
            )}
          </div>

          {loadingDash ? (
            <div className="p-6 text-center text-xs text-gray-300 animate-pulse">Calculando partidas…</div>
          ) : partidas.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 space-y-2">
              <Info size={24} className="mx-auto text-gray-200" />
              <p className="font-medium">Sin datos presupuestarios</p>
              <p className="text-gray-300">Importa el modelo financiero en "Importar Excel"</p>
              <button onClick={() => navigate('/finance/import')}
                className="mt-2 text-[11px] font-semibold text-violet-600 hover:underline">
                Ir a Importar Excel →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {partidas.map(pk => {
                const pct = n(pk.pct)
                const tl  = tlu(pk.traffic_light)
                return (
                  <div key={pk.code} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                          {pk.code}
                        </span>
                        <span className="text-[11px] text-gray-600 truncate">{pk.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[11px] font-bold text-gray-700">{pct.toFixed(1)}%</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${tlBg[tl] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {tlLabel[tl] ?? tl}
                        </span>
                      </div>
                    </div>
                    <ProgressBar pct={pct} color={tlColor[tl] ?? '#9ca3af'} h="h-1.5" />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">Presup: {fmt(pk.budgeted, currency)}</span>
                      <span className="text-[10px] text-gray-500">Ejecutado: {fmt(pk.executed, currency)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-50">
            <button onClick={() => navigate('/finance/budget')}
              className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1">
              Ver presupuesto completo <ChevronRight size={11} />
            </button>
          </div>
        </div>

        {/* RIGHT column */}
        <div className="space-y-5">

          {/* Collections KPIs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <CreditCard size={14} className="text-violet-500" />
              <h3 className="text-xs font-semibold text-gray-700">Cobranza del Proyecto</h3>
            </div>
            {loadingDash ? (
              <div className="p-4 text-center text-xs text-gray-300 animate-pulse">Cargando…</div>
            ) : !coll ? (
              <div className="p-4 text-center text-xs text-gray-300">Sin planes de pago registrados</div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatCell label="Planes activos" value={String(coll.active_plans)} accent="text-violet-700" />
                  <StatCell
                    label="Tasa cobro"
                    value={`${n(coll.collection_rate_pct).toFixed(1)}%`}
                    accent={n(coll.collection_rate_pct) >= 90 ? 'text-emerald-600' : 'text-amber-600'}
                  />
                  <StatCell
                    label="Cuotas vencidas"
                    value={String(totalOverdue)}
                    accent={totalOverdue > 0 ? 'text-red-600' : 'text-emerald-600'}
                  />
                </div>

                {totalOverdue > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Oficial D+1',  count: coll.officer_queue_count,    cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { label: 'Gerencia D+6', count: coll.management_queue_count, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
                      { label: 'Legal D+16',   count: coll.legal_queue_count,      cls: 'bg-red-50 border-red-200 text-red-700' },
                    ].map(({ label, count, cls }) => (
                      <div key={label} className={`flex justify-between items-center border rounded-xl px-3 py-2 ${cls}`}>
                        <span className="text-[10px] font-semibold">{label}</span>
                        <span className="text-sm font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => navigate('/collections')}
                  className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1">
                  Ir a Portal de Cobros <ChevronRight size={11} />
                </button>
              </div>
            )}
          </div>

          {/* Units inventory */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <Home size={14} className="text-violet-500" />
              <h3 className="text-xs font-semibold text-gray-700">Inventario de Unidades</h3>
            </div>
            {loadingUnits ? (
              <div className="p-4 text-center text-xs text-gray-300 animate-pulse">Cargando unidades…</div>
            ) : units.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-300">Sin unidades registradas</div>
            ) : (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCell label="Vendidas" value={String(soldUnits.length)}
                    sub={`${fmt(totalRevenue, currency)} facturado`} accent="text-emerald-700" />
                  <StatCell label="Disponibles" value={String(availableUnits.length)}
                    sub={`${fmt(totalInventory, currency)} por vender`} accent="text-violet-700" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-gray-400">Unidades vendidas</span>
                    <span className="text-[11px] font-bold text-emerald-700">{soldPct}%</span>
                  </div>
                  <ProgressBar pct={soldPct} color="#10b981" />
                </div>
                {/* Unit list */}
                <div className="max-h-36 overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-wide">
                        {['Unidad', 'Piso', 'm²', 'Precio lista', 'Estado'].map(h => (
                          <th key={h} className="pb-1.5 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {units.map(u => (
                        <tr key={u.id} className={u.is_sold ? 'text-gray-400' : 'text-gray-700'}>
                          <td className="py-1 font-mono font-semibold">{u.unit_number}</td>
                          <td className="py-1">{u.floor}</td>
                          <td className="py-1">{n(u.area_sqm).toFixed(0)}</td>
                          <td className="py-1">{fmt(u.list_price, currency)}</td>
                          <td className="py-1">
                            {u.is_sold
                              ? <span className="text-emerald-600 font-semibold">● Vendida</span>
                              : <span className="text-blue-600 font-semibold">○ Disponible</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Cash flow mini-chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-violet-500" />
                <h3 className="text-xs font-semibold text-gray-700">Flujo de Caja — 12 meses</h3>
              </div>
              <button onClick={() => navigate('/finance/cashflow')}
                className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1">
                Ver detalle <ChevronRight size={11} />
              </button>
            </div>
            <div className="px-5 py-3">
              <CfSparkline projectId={p.id} currency={currency} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-3">Acciones rápidas</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Registrar pago',       path: '/data-entry',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { label: 'Portal de cobros',      path: '/collections',            color: 'bg-violet-50 text-violet-700 border-violet-200' },
            { label: 'Cuotas vencidas',       path: '/overdue',                color: 'bg-red-50 text-red-700 border-red-200' },
            { label: 'Flujo de caja',         path: '/finance/cashflow',       color: 'bg-purple-50 text-purple-700 border-purple-200' },
            { label: 'Predicciones IA',       path: '/finance/predictions',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { label: 'Conciliación bancaria', path: '/finance/reconciliation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'Importar Excel',        path: '/finance/import',         color: 'bg-teal-50 text-teal-700 border-teal-200' },
          ].map(({ label, path, color }) => (
            <button key={label} onClick={() => navigate(path)}
              className={`text-[11px] font-semibold px-3 py-2 rounded-xl border flex items-center gap-1.5 hover:opacity-80 transition-opacity ${color}`}>
              {label} <ArrowUpRight size={10} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: projects = [], isLoading } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: getProjects,
  })

  const activeId      = selectedId ?? projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)

  const totalUnits     = projects.reduce((s, p) => s + p.total_units, 0)
  const inConstruction = projects.filter(p => p.status === 'construction').length
  const totalBudget    = projects.reduce((s, p) => s + n(p.total_budget), 0)

  if (isLoading) return (
    <div className="grid grid-cols-[260px_1fr] gap-5 animate-pulse">
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="h-96 bg-gray-100 rounded-2xl" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Portfolio strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Proyectos en portafolio', value: String(projects.length),       icon: Building2,  color: 'bg-violet-600' },
          { label: 'Unidades totales',         value: String(totalUnits),           icon: Home,        color: 'bg-blue-600' },
          { label: 'En construcción activa',   value: String(inConstruction),       icon: Layers,      color: 'bg-emerald-600' },
          { label: 'Presupuesto total',         value: fmt(totalBudget, projects[0]?.currency ?? 'DOP'), icon: DollarSign, color: 'bg-purple-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon size={16} className="text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{value}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: selector + detail */}
      <div className="grid grid-cols-[260px_1fr] gap-5 items-start">
        {/* Left rail */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} · haz clic para ver detalle
          </p>
          {projects.map(p => (
            <ProjectPill key={p.id} p={p} selected={p.id === activeId}
              onClick={() => setSelectedId(p.id)} />
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {activeProject
            ? <ProjectDetail p={activeProject} />
            : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-300 gap-3">
                <Building2 size={40} />
                <p className="text-sm">Selecciona un proyecto para ver el detalle completo</p>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
