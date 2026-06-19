import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getDashboard, getCashFlow } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie, Legend, Sector,
  AreaChart, Area, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, AlertTriangle, CheckCircle, Clock, Building2,
  DollarSign, Users, Zap, ChevronRight, ArrowUpRight, TrendingDown, Search,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface ProjectSummary {
  id: string
  name: string
  status: string
  project_type: string
  total_units: number
  currency: string
  total_budget: number          // field from /projects/ endpoint
  total_budget_dop?: number     // field from /dashboard/ list endpoint (optional)
  physical_progress_pct: number
  start_date: string
  expected_delivery_date: string
}

// Field names match Python dataclasses exactly — DO NOT rename
interface PartidaKPI {
  code: string           // NOT partida_code
  name: string           // NOT partida_name
  budgeted: number       // NOT budget
  executed: number
  pct: number            // NOT execution_pct — already a percentage 0-100
  traffic_light: 'GREEN' | 'AMBER' | 'RED'
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
  project_id: string
  partida_kpis: PartidaKPI[]
  collections: CollectionsKPI
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// API returns lowercase traffic light values — normalize before lookup
const tlu = (v?: string) => (v ?? 'green').toUpperCase()

const tlColor = (tl: string) =>
  ({ GREEN: '#16a34a', AMBER: '#f59e0b', RED: '#ef4444' }[tlu(tl)] ?? '#6b7280')

const tlBadge = (tl: string) => {
  const map: Record<string, string> = {
    GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    AMBER: 'bg-amber-50 text-amber-700 border-amber-200',
    RED:   'bg-red-50 text-red-700 border-red-200',
  }
  const labels: Record<string, string> = { GREEN: 'OK', AMBER: 'Alerta', RED: 'Crítico' }
  const key = tlu(tl)
  return { cls: map[key] ?? 'bg-gray-50 text-gray-600 border-gray-200', label: labels[key] ?? tl }
}

const fmtDOP = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0, notation: 'compact' }).format(n)

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, notation: 'compact' }).format(n)

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent, trend, onClick,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  accent: string; trend?: { value: string; up: boolean }; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-violet-200 transition-all group' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl ${accent} flex items-center justify-center ${onClick ? 'group-hover:scale-110 transition-transform' : ''}`}>
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
          <ArrowUpRight size={12} className={trend.up ? '' : 'rotate-90'} />
          {trend.value}
        </div>
      )}
    </div>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = '#7C3AED' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ p, isSelected, onClick }: { p: ProjectSummary; isSelected: boolean; onClick: () => void }) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    construction: { label: 'Construcción',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    planning:     { label: 'Planificación', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    completed:    { label: 'Completado',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }
  const st = statusMap[p.status] ?? { label: p.status, cls: 'bg-gray-50 text-gray-600 border-gray-200' }
  const budgetAmt = Number(p.total_budget ?? p.total_budget_dop ?? 0)
  const budget = p.currency === 'USD' ? fmtUSD(budgetAmt) : fmtDOP(budgetAmt)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all ${
        isSelected
          ? 'border-violet-300 bg-violet-50 shadow-md shadow-violet-100'
          : 'border-gray-100 bg-white hover:border-violet-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm flex-shrink-0">
          <Building2 size={16} className="text-white" />
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
      </div>
      <p className="text-xs font-semibold text-gray-800 leading-snug mb-1">{p.name}</p>
      <p className="text-[11px] text-gray-400 mb-3">{p.total_units} unidades · {p.currency} {budget}</p>
      <ProgressBar pct={p.physical_progress_pct} />
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-gray-400">Avance físico</span>
        <span className="text-[10px] font-semibold text-violet-700">{p.physical_progress_pct}%</span>
      </div>
    </button>
  )
}

// ── Portfolio Donut ───────────────────────────────────────────────────────────
function PortfolioDonut({ projects }: { projects: ProjectSummary[] }) {
  const social = projects.filter(p => p.project_type === 'social_interest').reduce((s, p) => s + p.total_units, 0)
  const tourist = projects.filter(p => p.project_type === 'tourist').reduce((s, p) => s + p.total_units, 0)
  const data = [
    { name: 'Interés Social', value: social, fill: '#7C3AED' },
    { name: 'Turístico', value: tourist, fill: '#10b981' },
  ].filter(d => d.value > 0)
  const total = social + tourist
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Portafolio por Tipo</h3>
      <div className="flex items-center gap-3">
        <ResponsiveContainer width={90} height={90}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2 flex-1">
          {data.map(d => (
            <div key={d.name}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.fill }} />
                  <span className="text-gray-600">{d.name}</span>
                </span>
                <span className="font-semibold text-gray-700">{d.value} u.</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(d.value/total)*100}%`, backgroundColor: d.fill }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Cash Flow Sparkline ────────────────────────────────────────────────────────
function CashFlowSparkline({ projectId, currency }: { projectId: string; currency: string }) {
  const { data: cf = [] } = useQuery<any[]>({
    queryKey: ['cashflow', projectId],
    queryFn: () => getCashFlow(projectId),
    enabled: !!projectId,
  })
  const last18 = cf.slice(-18)
  const compact = (n: number) => new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(n)

  if (last18.length === 0) return null
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Flujo de Caja — Últimos 18 Meses</h3>
      <p className="text-[11px] text-gray-400 mb-3">Acumulado: <span className="font-semibold text-violet-700">{compact((last18.length > 0 ? last18[last18.length - 1] : null)?.cumulative_balance ?? 0)}</span></p>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={last18} margin={{ left: 0, right: 0 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReferenceLine y={0} stroke="#e5e7eb" />
          <Area type="monotone" dataKey="cumulative_balance" stroke="#7C3AED" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
          <Tooltip
            formatter={(v: number) => [compact(v), 'Acumulado']}
            contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}
            labelFormatter={(l: string) => l}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectSearch, setProjectSearch] = useState('')
  const navigate = useNavigate()

  const { data: projects = [], isLoading: loadingProjects } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: getProjects,
  })

  const activeProjectId = selectedProjectId ?? projects[0]?.id
  const activeProject = projects.find(p => p.id === activeProjectId)

  const { data: dash, isLoading: loadingDash } = useQuery<DashboardData>({
    queryKey: ['dashboard', activeProjectId],
    queryFn: () => getDashboard(activeProjectId!),
    enabled: !!activeProjectId,
  })

  if (loadingProjects) return <LoadingSkeleton />

  const coll = dash?.collections
  const totalOverdue = (coll?.officer_queue_count ?? 0) + (coll?.management_queue_count ?? 0) + (coll?.legal_queue_count ?? 0)
  const budgetData = (dash?.partida_kpis ?? [])
    .filter(k => Number(k.pct) > 0)
    .slice(0, 8)
    .map(k => ({
      name: k.code,
      fullName: (k.name ?? '').length > 28 ? k.name.slice(0, 28) + '…' : k.name,
      pct: parseFloat(Number(k.pct).toFixed(1)),
      tl: k.traffic_light,
    }))

  return (
    <div className="space-y-6">
      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Proyectos Activos"
          value={String(projects.length)}
          sub={`${projects.filter(p => p.status === 'construction').length} en construcción`}
          icon={Building2}
          accent="bg-violet-600"
          trend={{ value: 'Ver proyectos →', up: true }}
          onClick={() => navigate('/projects')}
        />
        <KpiCard
          label="Unidades Totales"
          value={String(projects.reduce((s, p) => s + p.total_units, 0))}
          sub="En portafolio activo"
          icon={Users}
          accent="bg-blue-600"
          trend={{ value: 'Ver por proyecto →', up: true }}
          onClick={() => navigate('/projects')}
        />
        <KpiCard
          label="Cuotas Vencidas"
          value={String(totalOverdue)}
          sub={`${coll?.legal_queue_count ?? 0} en gestión legal`}
          icon={AlertTriangle}
          accent={totalOverdue > 0 ? 'bg-red-500' : 'bg-emerald-500'}
          trend={{ value: 'Ver cola de vencidos →', up: totalOverdue === 0 }}
          onClick={() => navigate('/overdue')}
        />
        <KpiCard
          label="Tasa de Cobro"
          value={coll ? `${Number(coll.collection_rate_pct).toFixed(1)}%` : '—'}
          sub="Planes activos"
          icon={TrendingUp}
          accent="bg-emerald-600"
          trend={{ value: 'Ver cobranza →', up: Number(coll?.collection_rate_pct ?? 0) >= 90 }}
          onClick={() => navigate('/collections')}
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Project Selector ── */}
        <div className="col-span-1 space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seleccionar Proyecto</h2>
          {/* Searchable input — scales to 100+ projects */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar proyecto…"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 placeholder:text-gray-400"
            />
          </div>
          {/* Scrollable list — capped height so 100+ projects don't blow the layout */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
            {projects
              .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
              .map(p => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  isSelected={p.id === activeProjectId}
                  onClick={() => { setSelectedProjectId(p.id); setProjectSearch('') }}
                />
              ))}
            {projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Sin resultados para "{projectSearch}"</p>
            )}
          </div>
          <PortfolioDonut projects={projects} />
        </div>

        {/* ── Right panel ── */}
        <div className="col-span-2 space-y-4">
          {/* Project header */}
          {activeProject && (
            <div className="bg-gradient-to-r from-[#0F0A1E] to-[#1e1040] rounded-2xl p-5 text-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[11px] text-purple-300 uppercase tracking-widest mb-1">Proyecto seleccionado</p>
                  <h2 className="text-base font-bold leading-snug">{activeProject.name}</h2>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-white/40">Presupuesto total</p>
                  <p className="text-lg font-bold text-purple-200">
                    {activeProject.currency === 'USD'
                      ? fmtUSD(Number(activeProject.total_budget ?? (activeProject as any).total_budget_dop ?? 0))
                      : fmtDOP(Number(activeProject.total_budget ?? (activeProject as any).total_budget_dop ?? 0))}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-400 to-violet-300 rounded-full transition-all"
                  style={{ width: `${activeProject.physical_progress_pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[11px] text-white/40">Avance físico</span>
                <span className="text-[11px] font-bold text-purple-200">{activeProject.physical_progress_pct}%</span>
              </div>
            </div>
          )}

          {/* Collections summary */}
          {coll && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Estado de Cobranza</h3>
              <div className="grid grid-cols-3 gap-4">
                <StatBox value={coll.active_plans} label="Planes activos" color="text-violet-700" />
                <StatBox
                  value={`${Number(coll.collection_rate_pct).toFixed(1)}%`}
                  label="Tasa de cobro"
                  color={Number(coll.collection_rate_pct) >= 90 ? 'text-emerald-600' : 'text-amber-600'}
                />
                <StatBox
                  value={totalOverdue}
                  label="Cuotas vencidas"
                  color={totalOverdue > 0 ? 'text-red-600' : 'text-emerald-600'}
                />
              </div>
              {totalOverdue > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <EscBadge level="Oficial" count={coll.officer_queue_count} color="bg-amber-50 border-amber-200 text-amber-700" />
                  <EscBadge level="Gerencia" count={coll.management_queue_count} color="bg-orange-50 border-orange-200 text-orange-700" />
                  <EscBadge level="Legal" count={coll.legal_queue_count} color="bg-red-50 border-red-200 text-red-700" />
                </div>
              )}
            </div>
          )}

          {/* Budget execution chart */}
          {budgetData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ejecución Presupuestaria</h3>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />OK</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Alerta</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Crítico</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={budgetData} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis unit="%" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} domain={[0, 130]} />
                  <Tooltip
                    formatter={(v: number, _: string, props: any) => [
                      `${v}%`, props.payload.fullName
                    ]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {budgetData.map((d, i) => (
                      <Cell key={i} fill={tlColor(d.tl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cash flow sparkline */}
          {activeProjectId && activeProject && (
            <CashFlowSparkline projectId={activeProjectId} currency={activeProject.currency} />
          )}

          {/* Quick action links */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ver Flujo de Caja', path: '/finance/cashflow', color: 'bg-violet-50 text-violet-700 border-violet-200' },
              { label: 'IA Predicciones', path: '/finance/predictions', color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'Registrar Pago', path: '/data-entry', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: 'Importar Excel', path: '/finance/import', color: 'bg-amber-50 text-amber-700 border-amber-200' },
            ].map(({ label, path, color }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`text-xs font-semibold px-3 py-2.5 rounded-xl border transition-all hover:opacity-80 text-left flex items-center justify-between ${color}`}
              >
                {label}
                <ChevronRight size={11} />
              </button>
            ))}
          </div>

          {loadingDash && (
            <div className="h-48 bg-white rounded-2xl border border-gray-100 flex items-center justify-center">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Zap size={16} className="animate-pulse text-violet-400" />
                Cargando datos del proyecto…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatBox({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="text-center bg-gray-50 rounded-xl p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function EscBadge({ level, count, color }: { level: string; count: number; color: string }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-[11px] font-medium">{level}</span>
      <span className="text-sm font-bold">{count}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl" />)}
        </div>
        <div className="col-span-2 space-y-4">
          <div className="h-28 bg-gray-100 rounded-2xl" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
