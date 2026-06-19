/**
 * CashFlowPage — 60-month projected vs actual cash flow
 * Real data from DUPE Excel financial model
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getCashFlow } from '../api'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  ChevronDown, Eye, EyeOff,
} from 'lucide-react'

interface ProjectSummary { id: string; name: string; currency: string }

interface CFMonth {
  month: string
  month_number: number
  is_actual: boolean
  income: number
  expenses: number
  net_cash_flow: number
  cumulative_balance: number
  breakdown: {
    income: { separaciones: number; entregas: number; financiamiento: number }
    expenses: {
      construccion: number; suelo: number; tecnicos: number
      juridico: number; financiero: number; gestion: number; comercializacion: number
    }
  }
}

type ViewMode = 'overview' | 'breakdown' | 'cumulative'
type RangeMode = '24m' | '36m' | 'all'

const compact = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(n)

const full = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n)

const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`
}

// Custom dot that renders differently for actual vs projected
const CustomDot = ({ cx, cy, payload }: any) => {
  if (!payload?.is_actual) return null
  return <circle cx={cx} cy={cy} r={3} fill="#7C3AED" stroke="white" strokeWidth={1.5} />
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{fmtMonth(label)}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between items-center gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            <span className="text-gray-500">{p.name}</span>
          </span>
          <span className="font-semibold" style={{ color: p.color }}>
            {full(Math.abs(p.value), currency)}
          </span>
        </div>
      ))}
      {payload[0]?.payload?.is_actual !== undefined && (
        <div className={`mt-2 pt-2 border-t border-gray-100 text-[10px] font-medium ${
          payload[0].payload.is_actual ? 'text-emerald-600' : 'text-violet-500'
        }`}>
          {payload[0].payload.is_actual ? '● Dato real' : '◌ Proyectado'}
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, sub, icon: Icon, color, positive }: {
  label: string; value: string; sub?: string; icon: React.ElementType
  color: string; positive?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center`}>
          <Icon size={14} className="text-white" />
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub && <div className={`text-xs mt-1 font-medium ${positive === undefined ? 'text-gray-400' : positive ? 'text-emerald-600' : 'text-red-500'}`}>{sub}</div>}
    </div>
  )
}

export default function CashFlowPage() {
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState<ViewMode>('overview')
  const [range, setRange] = useState<RangeMode>('all')
  const [showProjected, setShowProjected] = useState(true)

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: () => import('../api').then(m => m.getProjects()),
  })

  const activeId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)
  const currency = activeProject?.currency ?? 'DOP'

  const { data: cfData = [], isLoading } = useQuery<CFMonth[]>({
    queryKey: ['cashflow', activeId],
    queryFn: () => getCashFlow(activeId!),
    enabled: !!activeId,
  })

  // Recharts cannot resolve nested dot-notation keys (e.g. "breakdown.expenses.construccion")
  // so we flatten the breakdown fields onto each row before passing to charts.
  const flatCfData = useMemo(() => cfData.map(r => ({
    ...r,
    b_separaciones:   r.breakdown.income.separaciones,
    b_entregas:       r.breakdown.income.entregas,
    b_financiamiento: r.breakdown.income.financiamiento,
    b_construccion:   r.breakdown.expenses.construccion,
    b_suelo:          r.breakdown.expenses.suelo,
    b_tecnicos:       r.breakdown.expenses.tecnicos,
    b_juridico:       r.breakdown.expenses.juridico,
    b_financiero:     r.breakdown.expenses.financiero,
    b_gestion:        r.breakdown.expenses.gestion,
    b_comercializacion: r.breakdown.expenses.comercializacion,
  })), [cfData])

  const filtered = useMemo(() => {
    let rows = showProjected ? flatCfData : flatCfData.filter(r => r.is_actual)
    if (range === '24m') rows = rows.slice(0, 24)
    else if (range === '36m') rows = rows.slice(0, 36)
    return rows
  }, [flatCfData, range, showProjected])

  // KPIs
  const actualRows = cfData.filter(r => r.is_actual)
  const projectedRows = cfData.filter(r => !r.is_actual)
  const totalIncome = actualRows.reduce((s, r) => s + r.income, 0)
  const totalExpenses = actualRows.reduce((s, r) => s + r.expenses, 0)
  const lastBalance = (actualRows.length > 0 ? actualRows[actualRows.length - 1] : null)?.cumulative_balance ?? 0
  const finalProjectedBalance = (projectedRows.length > 0 ? projectedRows[projectedRows.length - 1] : null)?.cumulative_balance ?? 0
  const peakDeficit = Math.min(...cfData.map(r => r.cumulative_balance))
  const breakEvenMonth = cfData.find(r => r.cumulative_balance >= 0 && !r.is_actual)

  // Expense breakdown for actual months — sum by component (using flattened keys)
  const actualFlat = flatCfData.filter(r => r.is_actual)
  const expBreakdown = actualFlat.reduce((acc, r) => {
    acc.construccion    += r.b_construccion
    acc.suelo           += r.b_suelo
    acc.tecnicos        += r.b_tecnicos
    acc.juridico        += r.b_juridico
    acc.financiero      += r.b_financiero
    acc.gestion         += r.b_gestion
    acc.comercializacion += r.b_comercializacion
    return acc
  }, { construccion: 0, suelo: 0, tecnicos: 0, juridico: 0, financiero: 0, gestion: 0, comercializacion: 0 })

  const expBreakdownData = [
    { name: 'Construcción', value: expBreakdown.construccion, color: '#7C3AED' },
    { name: 'Suelo', value: expBreakdown.suelo, color: '#6D28D9' },
    { name: 'Técnicos', value: expBreakdown.tecnicos, color: '#8B5CF6' },
    { name: 'Jurídico', value: expBreakdown.juridico, color: '#A78BFA' },
    { name: 'Financiero', value: expBreakdown.financiero, color: '#C4B5FD' },
    { name: 'Gestión', value: expBreakdown.gestion, color: '#DDD6FE' },
    { name: 'Comercial.', value: expBreakdown.comercializacion, color: '#EDE9FE' },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Project selector */}
          <div className="relative">
            <select
              value={activeId ?? ''}
              onChange={e => setProjectId(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* Range */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['24m','36m','all'] as RangeMode[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${range === r ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {r === 'all' ? 'Todo' : r}
              </button>
            ))}
          </div>
          {/* Toggle projected */}
          <button
            onClick={() => setShowProjected(s => !s)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium transition-all ${
              showProjected ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            {showProjected ? <Eye size={13} /> : <EyeOff size={13} />}
            Proyectado
          </button>
        </div>
        {/* View tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {[
            { key: 'overview', label: 'Ingresos / Gastos' },
            { key: 'breakdown', label: 'Desglose gastos' },
            { key: 'cumulative', label: 'Flujo acumulado' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setView(key as ViewMode)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${view === key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard label="Ingresos reales" value={compact(totalIncome, currency)} sub={`${actualRows.length} meses reales`} icon={TrendingUp} color="bg-emerald-600" positive />
        <KPICard label="Gastos reales" value={compact(totalExpenses, currency)} sub="Acumulado a la fecha" icon={TrendingDown} color="bg-violet-600" />
        <KPICard label="Balance actual" value={compact(lastBalance, currency)} sub={lastBalance >= 0 ? 'Posición positiva' : 'Déficit de financiamiento'} icon={DollarSign} color={lastBalance >= 0 ? 'bg-emerald-600' : 'bg-red-500'} positive={lastBalance >= 0} />
        <KPICard
          label="Balance proyectado final"
          value={compact(finalProjectedBalance, currency)}
          sub={breakEvenMonth ? `Punto de equilibrio: ${fmtMonth(breakEvenMonth.month)}` : 'Sin equilibrio en horizonte'}
          icon={Activity}
          color={finalProjectedBalance >= 0 ? 'bg-blue-600' : 'bg-amber-500'}
          positive={finalProjectedBalance >= 0}
        />
      </div>

      {/* Main chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {isLoading ? (
          <div className="h-72 bg-gray-50 rounded-xl animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
            Sin datos de flujo de caja para este proyecto
          </div>
        ) : view === 'overview' ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-700">Ingresos vs Gastos Mensuales</h3>
              <div className="flex gap-4 text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-400 inline-block" />Ingresos</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-violet-500 inline-block" />Gastos</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t-2 border-dashed border-gray-300 inline-block" />Proyectado</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={filtered} margin={{ left: 10, right: 10 }}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={Math.floor(filtered.length / 10)} />
                <YAxis tickFormatter={v => compact(v, currency)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                {/* Actual/projected divider */}
                {cfData.find(r => !r.is_actual) && (
                  <ReferenceLine
                    x={cfData.find(r => !r.is_actual)?.month}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                    label={{ value: 'Hoy', position: 'top', fontSize: 10, fill: '#9ca3af' }}
                  />
                )}
                <Area
                  type="monotone" dataKey="income" name="Ingresos"
                  stroke="#10b981" strokeWidth={2} fill="url(#incGrad)"
                  dot={false} activeDot={{ r: 4, fill: '#10b981' }}
                />
                <Area
                  type="monotone" dataKey="expenses" name="Gastos"
                  stroke="#7C3AED" strokeWidth={2} fill="url(#expGrad)"
                  dot={false} activeDot={{ r: 4, fill: '#7C3AED' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : view === 'cumulative' ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-700">Flujo de Caja Acumulado</h3>
              <div className="flex gap-4 text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-600 inline-block" />Real</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-200 inline-block" />Proyectado</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={filtered} margin={{ left: 10, right: 10 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={Math.floor(filtered.length / 10)} />
                <YAxis tickFormatter={v => compact(v, currency)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} label={{ value: 'Equilibrio', position: 'right', fontSize: 10, fill: '#9ca3af' }} />
                {cfData.find(r => !r.is_actual) && (
                  <ReferenceLine x={cfData.find(r => !r.is_actual)?.month} stroke="#e5e7eb" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone" dataKey="cumulative_balance" name="Flujo acumulado"
                  stroke="#7C3AED" strokeWidth={2.5} fill="url(#cumGrad)"
                  dot={<CustomDot />}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          /* Breakdown view */
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Gastos Mensuales por Componente</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={filtered.slice(0, 24)} barSize={10} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={5} />
                  <YAxis tickFormatter={v => compact(v, currency)} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Bar dataKey="b_construccion" name="Construcción" stackId="a" fill="#7C3AED" />
                  <Bar dataKey="b_suelo" name="Suelo" stackId="a" fill="#6D28D9" />
                  <Bar dataKey="b_tecnicos" name="Técnicos" stackId="a" fill="#A78BFA" />
                  <Bar dataKey="b_juridico" name="Jurídico" stackId="a" fill="#C4B5FD" />
                  <Bar dataKey="b_financiero" name="Financiero" stackId="a" fill="#DDD6FE" />
                  <Bar dataKey="b_gestion" name="Gestión" stackId="a" fill="#EDE9FE" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Cumulative breakdown donut-like bar */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución Gastos Acumulados</h3>
              <div className="space-y-3 mt-2">
                {expBreakdownData.map(({ name, value, color }) => {
                  const pct = totalExpenses > 0 ? (value / totalExpenses) * 100 : 0
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{name}</span>
                        <span className="text-gray-800 font-semibold">{compact(value, currency)} <span className="text-gray-400 font-normal">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
                {expBreakdownData.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Sin datos de desglose para meses reales</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Monthly table (scrollable) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Tabla Mensual</h3>
          <span className="text-xs text-gray-400">{filtered.length} meses</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                {['Mes', 'Tipo', 'Ingresos', 'Gastos', 'Flujo Neto', 'Acumulado'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => {
                const netPos = r.net_cash_flow >= 0
                const cumPos = r.cumulative_balance >= 0
                return (
                  <tr key={r.month} className={`hover:bg-gray-50 transition-colors ${!r.is_actual ? 'opacity-70' : ''}`}>
                    <td className="px-5 py-2.5 font-medium text-gray-700 whitespace-nowrap">{fmtMonth(r.month)}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        r.is_actual
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-violet-50 text-violet-600 border-violet-200'
                      }`}>
                        {r.is_actual ? 'Real' : 'Proyect.'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-emerald-700 font-medium">{r.income > 0 ? compact(r.income, currency) : '—'}</td>
                    <td className="px-5 py-2.5 text-violet-700 font-medium">{r.expenses > 0 ? compact(r.expenses, currency) : '—'}</td>
                    <td className={`px-5 py-2.5 font-semibold ${netPos ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.net_cash_flow !== 0 ? `${netPos ? '+' : ''}${compact(r.net_cash_flow, currency)}` : '—'}
                    </td>
                    <td className={`px-5 py-2.5 font-bold ${cumPos ? 'text-gray-800' : 'text-red-600'}`}>
                      {compact(r.cumulative_balance, currency)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
