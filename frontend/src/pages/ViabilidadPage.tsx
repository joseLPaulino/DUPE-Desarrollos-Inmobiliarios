/**
 * ViabilidadPage — Financial viability analysis.
 * Replaces the Excel EV (Estudio de Viabilidad) formulas with live calculations
 * computed from PostgreSQL data.
 *
 * Metrics: TIR, VAN, Punto de Equilibrio, Payback, Margen, Sensibilidades, Mora
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, DollarSign, BarChart2, Clock, Target,
  AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp,
  Percent, Calculator, RefreshCw, Users,
} from 'lucide-react'
import api from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; currency: string }

interface ViabilidadData {
  project_name: string; currency: string; total_units: number; discount_rate_used: number
  tir: { value: number | null; unit: string; label: string; description: string; interpretation: string }
  van: { value: number; unit: string; label: string; description: string; interpretation: string }
  punto_equilibrio: { units: number; pct_of_total: number; label: string; description: string; interpretation: string }
  payback: { months: number | null; label: string; description: string; interpretation: string }
  margen: { gross_profit: number; margin_pct: number; roi_pct: number; label: string; description: string }
  budget_summary: {
    total_income: number; total_cost: number; fixed_cost: number; variable_cost: number
    price_per_unit: number; variable_cost_per_unit: number; contribution_margin_per_unit: number
  }
  actuals: { income_to_date: number; expenses_to_date: number; net_to_date: number; months_with_actuals: number }
  cashflow_series: Array<{ month: string; month_number: number; is_actual: boolean; net: number; cumulative: number; income: number; expenses: number }>
}

interface SensibilidadData {
  project_name: string; currency: string; base_tir: number | null; base_van_millions: number
  price_deltas: string[]; cost_deltas: string[]
  tir_matrix: (number | null)[][]; van_matrix: number[][]
  axis_labels: { columns: string; rows: string }
}

interface PaymentPlan { id: string; client_name: string; project_name: string; status: string; total_amount: number }

interface MoraItem {
  installment_number: number; due_date: string; days_overdue: number
  months_overdue: number; principal: number; mora: number; total_due: number
}
interface MoraData {
  plan_id: string; monthly_rate_used: number; rate_label: string
  overdue_installments: number; total_principal: number; total_mora: number
  total_amount_due: number; items: MoraItem[]; note: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number, currency = 'DOP', compact = false) => {
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  }
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(v)
}

// Heatmap color: green (good) → yellow → red (bad) for TIR
function tirColor(val: number | null, base: number | null): string {
  if (val === null) return 'bg-gray-100 text-gray-400'
  if (base === null) return 'bg-gray-100 text-gray-500'
  const diff = val - base
  if (diff > 5)  return 'bg-emerald-100 text-emerald-800 font-bold'
  if (diff > 1)  return 'bg-emerald-50 text-emerald-700'
  if (diff > -1) return 'bg-yellow-50 text-yellow-700 font-semibold ring-1 ring-yellow-400'
  if (diff > -5) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

// For VAN matrix
function vanColor(val: number, base: number): string {
  if (val > base * 1.1)  return 'bg-emerald-100 text-emerald-800 font-bold'
  if (val > base * 1.0)  return 'bg-emerald-50 text-emerald-700'
  if (val > 0)           return 'bg-yellow-50 text-yellow-700 font-semibold ring-1 ring-yellow-400'
  return 'bg-red-100 text-red-700'
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, color, label, fullName, value, unit, whatItMeans, interpretation, ok }: {
  icon: any; color: string; label: string; fullName?: string; value: string; unit?: string
  whatItMeans?: string; interpretation?: string; ok?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
          <Icon size={17} className="text-white" />
        </div>
        {ok !== undefined && (
          ok
            ? <CheckCircle size={15} className="text-emerald-500" />
            : <AlertTriangle size={15} className="text-orange-400" />
        )}
      </div>

      {/* Full name spelled out */}
      {fullName && (
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{fullName}</div>
      )}

      {/* Value */}
      <div className="text-2xl font-black text-gray-900 leading-none">
        {value}
        {unit && <span className="text-sm font-medium text-gray-400 ml-1">{unit}</span>}
      </div>
      <div className="text-xs font-semibold text-gray-700">{label}</div>

      {/* What it means — always visible */}
      {whatItMeans && (
        <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 text-[11px] text-gray-600 leading-relaxed">
          {whatItMeans}
        </div>
      )}

      {/* Interpretation of this project's actual value */}
      {interpretation && (
        <div className="text-[11px] text-gray-500 italic">{interpretation}</div>
      )}
    </div>
  )
}

// ── Cashflow Chart ────────────────────────────────────────────────────────────

function CashflowMiniChart({ series, currency }: {
  series: ViabilidadData['cashflow_series']; currency: string
}) {
  const maxAbs = Math.max(...series.map(r => Math.abs(r.cumulative)), 1)
  const zero = series.findIndex(r => r.cumulative >= 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-800 mb-4">Flujo de Caja Acumulado</h3>
      <div className="flex items-end gap-0.5 h-28 overflow-hidden">
        {series.map((r, i) => {
          const pct = Math.abs(r.cumulative) / maxAbs * 100
          const isPos = r.cumulative >= 0
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center group relative" title={`${r.month}: ${fmtCurrency(r.cumulative, currency, true)}`}>
              <div
                className={`w-full rounded-t-sm ${isPos ? 'bg-emerald-400' : 'bg-red-300'} ${r.is_actual ? 'opacity-100' : 'opacity-60'} transition-all`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
        <span>Mes 1</span>
        {zero >= 0 && (
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <CheckCircle size={9} />
            Break-even: Mes {zero + 1}
          </span>
        )}
        <span>Mes {series.length}</span>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-300 inline-block" /> Déficit · Proyectado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> Superávit</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 opacity-60 inline-block" /> Proyectado</span>
      </div>
    </div>
  )
}

// ── Sensitivity Matrix ────────────────────────────────────────────────────────

function SensitividadMatrix({ data, mode }: { data: SensibilidadData; mode: 'tir' | 'van' }) {
  const matrix = mode === 'tir' ? data.tir_matrix : data.van_matrix
  const base = mode === 'tir' ? data.base_tir : data.base_van_millions
  const baseIdx = 3 // index of 0% delta

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="p-2 text-right text-[10px] font-semibold text-gray-400" colSpan={2}>
              ↓ Costos / Precio →
            </th>
            {data.price_deltas.map(d => (
              <th key={d} className={`p-2 text-center font-bold text-[10px] ${d === '±0%' || d === '+0%' ? 'bg-gray-100' : ''}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cost_deltas.map((costDelta, ri) => (
            <tr key={costDelta}>
              <td className={`p-2 font-bold text-[10px] text-center ${ri === baseIdx ? 'bg-gray-100' : ''}`}>
                {costDelta}
              </td>
              <td className="p-1" />
              {matrix[ri].map((val, ci) => {
                const isBase = ri === baseIdx && ci === baseIdx
                const cellColor = mode === 'tir'
                  ? tirColor(val as number | null, data.base_tir)
                  : vanColor(val as number, data.base_van_millions)
                return (
                  <td key={ci} className={`p-1.5 text-center text-[10px] rounded ${cellColor} ${isBase ? 'ring-2 ring-violet-400' : ''}`}>
                    {val === null ? '—' : mode === 'tir' ? `${val}%` : `${val}M`}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 mt-2">
        {mode === 'tir' ? 'TIR anual %' : `VAN en millones ${data.currency}`}.
        Celda base (violeta) = escenario actual sin variación.
        Verde = mejor que base · Rojo = peor que base.
      </p>
    </div>
  )
}

// ── Budget breakdown bar ──────────────────────────────────────────────────────

function BudgetBar({ label, budget, executed, currency }: { label: string; budget: number; executed: number; currency: string }) {
  const pct = Math.min((executed / budget) * 100, 120)
  const color = pct > 110 ? 'bg-red-500' : pct > 90 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
        <span className="font-medium">{label}</span>
        <span className={`font-bold ${pct > 110 ? 'text-red-600' : 'text-gray-700'}`}>
          {fmtCurrency(executed, currency, true)} / {fmtCurrency(budget, currency, true)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ViabilidadPage() {
  const [projectId, setProjectId] = useState('')
  const [discountRate, setDiscountRate] = useState(15) // %
  const [moraRate, setMoraRate] = useState(2) // % monthly
  const [moraPlanId, setMoraPlanId] = useState('')
  const [sensMode, setSensMode] = useState<'tir' | 'van'>('tir')
  const [sensStep, setSensStep] = useState(5) // step % for each column/row in sensitivity (range = step × 3)
  const [showSens, setShowSens] = useState(true)

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects/').then(r => r.data),
  })

  const activeId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)

  const { data: viab, isLoading: loadingViab, error: errViab } = useQuery<ViabilidadData>({
    queryKey: ['viabilidad', activeId, discountRate],
    queryFn: () => api.get(`/analytics/viabilidad/${activeId}?discount_rate=${discountRate / 100}`).then(r => r.data),
    enabled: !!activeId,
    staleTime: 30_000,
  })

  const { data: sens, isLoading: loadingSens } = useQuery<SensibilidadData>({
    queryKey: ['sensibilidad', activeId, discountRate, sensStep],
    queryFn: () => api.get(`/analytics/sensibilidad/${activeId}?discount_rate=${discountRate / 100}&max_delta=${(sensStep * 3) / 100}`).then(r => r.data),
    enabled: !!activeId && showSens,
    staleTime: 30_000,
  })

  const { data: plans = [] } = useQuery<PaymentPlan[]>({
    queryKey: ['plans-list-viab'],
    queryFn: () => api.get('/payment-plans/all').then(r => r.data),
  })

  const activeMoraPlan = moraPlanId || plans[0]?.id

  const { data: mora, isLoading: loadingMora } = useQuery<MoraData>({
    queryKey: ['mora', activeMoraPlan, moraRate],
    queryFn: () => api.get(`/analytics/mora/${activeMoraPlan}?monthly_rate=${moraRate / 100}`).then(r => r.data),
    enabled: !!activeMoraPlan,
    staleTime: 30_000,
  })

  const currency = activeProject?.currency ?? 'DOP'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-sm">
            <TrendingUp size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Análisis de Viabilidad</h1>
            <p className="text-xs text-gray-400">TIR · VAN · Punto de Equilibrio · Sensibilidades — calculado desde PostgreSQL</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Project selector */}
          <select
            value={activeId ?? ''}
            onChange={e => setProjectId(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 w-72"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Discount rate control */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <Percent size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500">Tasa descuento:</span>
            <input
              type="range" min={5} max={35} step={1} value={discountRate}
              onChange={e => setDiscountRate(Number(e.target.value))}
              className="w-20 accent-emerald-600"
            />
            <span className="text-xs font-bold text-emerald-700 w-8">{discountRate}%</span>
          </div>
        </div>
      </div>

      {loadingViab ? (
        <div className="flex items-center gap-3 p-12 text-sm text-gray-400 animate-pulse">
          <RefreshCw size={16} className="animate-spin" /> Calculando métricas…
        </div>
      ) : errViab ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
          Error cargando datos. Verificar que el DB esté poblado y el backend corriendo.
        </div>
      ) : viab ? (
        <>
          {/* ── KPI Cards ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={TrendingUp}
              color="bg-emerald-600"
              label="TIR — Tasa Interna de Retorno"
              fullName="Tasa Interna de Retorno"
              value={viab.tir.value !== null ? `${viab.tir.value}%` : 'N/A'}
              whatItMeans="El retorno anual que genera el proyecto sobre cada peso invertido. Si el TIR es 25%, el proyecto te devuelve 25% al año. Se compara contra el costo de financiamiento — si TIR > costo del préstamo, el proyecto conviene."
              interpretation={viab.tir.interpretation}
              ok={viab.tir.value !== null && viab.tir.value > 15}
            />
            <KpiCard
              icon={DollarSign}
              color={viab.van.value >= 0 ? 'bg-blue-600' : 'bg-red-500'}
              label={`VAN @ ${discountRate}% tasa de descuento`}
              fullName="Valor Actual Neto"
              value={fmtCurrency(viab.van.value, currency, true)}
              unit={currency}
              whatItMeans={`La ganancia total del proyecto expresada en pesos de hoy, descontando que el dinero futuro vale menos que el dinero de ahora. VAN positivo = el proyecto crea riqueza. VAN negativo = destruye valor. La tasa de descuento (${discountRate}%) es el costo de capital que usas como referencia.`}
              interpretation={viab.van.interpretation}
              ok={viab.van.value >= 0}
            />
            <KpiCard
              icon={Target}
              color="bg-violet-600"
              label="Punto de Equilibrio"
              fullName="Break-Even — Unidades mínimas a vender"
              value={`${viab.punto_equilibrio.units} unidades`}
              unit={`= ${viab.punto_equilibrio.pct_of_total}% del total`}
              whatItMeans="La cantidad mínima de unidades que debes vender para cubrir todos los costos del proyecto. Por debajo de este número el proyecto pierde dinero. Por encima, empieza a generar ganancia."
              interpretation={viab.punto_equilibrio.interpretation}
              ok={viab.punto_equilibrio.pct_of_total < 75}
            />
            <KpiCard
              icon={Clock}
              color="bg-orange-500"
              label="Período de Recuperación"
              fullName="Payback — ¿Cuándo recuperas lo invertido?"
              value={viab.payback.months !== null ? `Mes ${viab.payback.months}` : 'Sin recuperar'}
              whatItMeans="El mes del proyecto en que el flujo de caja acumulado se vuelve positivo — es decir, cuando el dinero que ha entrado supera el dinero que ha salido. Antes de ese mes el proyecto está en déficit."
              interpretation={viab.payback.interpretation}
              ok={viab.payback.months !== null && viab.payback.months < viab.cashflow_series.length * 0.7}
            />
          </div>

          {/* ── Margen + Budget ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Margen */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={15} className="text-violet-500" />
                <h3 className="text-sm font-bold text-gray-800">{viab.margen.label}</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Ingresos totales', value: fmtCurrency(viab.budget_summary.total_income, currency), color: 'text-emerald-700' },
                  { label: 'Costos totales', value: fmtCurrency(viab.budget_summary.total_cost, currency), color: 'text-red-600' },
                  { label: 'Utilidad bruta', value: fmtCurrency(viab.margen.gross_profit, currency), color: viab.margen.gross_profit >= 0 ? 'text-emerald-800 font-bold' : 'text-red-700 font-bold' },
                  { label: 'Margen bruto', value: `${viab.margen.margin_pct.toFixed(1)}%`, color: 'text-blue-700 font-bold' },
                  { label: 'ROI sobre inversión', value: `${viab.margen.roi_pct.toFixed(1)}%`, color: 'text-violet-700 font-bold' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-xs ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost structure */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calculator size={15} className="text-orange-500" />
                <h3 className="text-sm font-bold text-gray-800">Estructura de Costos</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Costos fijos', value: viab.budget_summary.fixed_cost, total: viab.budget_summary.total_cost },
                  { label: 'Costos variables (construcción)', value: viab.budget_summary.variable_cost, total: viab.budget_summary.total_cost },
                ].map(({ label, value, total }) => {
                  const pct = (value / total) * 100
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] text-gray-600 mb-1">
                        <span>{label}</span>
                        <span className="font-bold">{fmtCurrency(value, currency, true)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full">
                        <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  {[
                    { label: 'Precio por unidad', value: fmtCurrency(viab.budget_summary.price_per_unit, currency) },
                    { label: 'Costo variable/unidad', value: fmtCurrency(viab.budget_summary.variable_cost_per_unit, currency) },
                    { label: 'Margen contribución/unidad', value: fmtCurrency(viab.budget_summary.contribution_margin_per_unit, currency) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-[11px]">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-bold text-gray-700">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actuals */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle size={15} className="text-emerald-500" />
                <h3 className="text-sm font-bold text-gray-800">Ejecución Real vs Presupuesto</h3>
              </div>
              <div className="space-y-3 text-[11px]">
                <p className="text-gray-400">{viab.actuals.months_with_actuals} meses con datos reales</p>
                <BudgetBar label="Ingresos reales" budget={viab.budget_summary.total_income} executed={viab.actuals.income_to_date} currency={currency} />
                <BudgetBar label="Gastos reales" budget={viab.budget_summary.total_cost} executed={viab.actuals.expenses_to_date} currency={currency} />
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Flujo neto a la fecha</span>
                  <span className={`font-bold ${viab.actuals.net_to_date >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtCurrency(viab.actuals.net_to_date, currency, true)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Cashflow chart ────────────────────────────────────────────── */}
          <CashflowMiniChart series={viab.cashflow_series} currency={currency} />

          {/* ── Sensitivity matrix ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSens(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-violet-500" />
                <h3 className="text-sm font-bold text-gray-800">Análisis de Sensibilidad</h3>
                <span className="text-[10px] text-gray-400 ml-2">Equivalente a la tabla de sensibilidades del Excel EV</span>
              </div>
              {showSens ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            </button>

            {showSens && (
              <div className="px-5 pb-5">
                {/* Controls row */}
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    {(['tir', 'van'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setSensMode(m)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors
                          ${sensMode === m ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {m === 'tir' ? 'Ver TIR' : 'Ver VAN'}
                      </button>
                    ))}
                  </div>

                  {/* Step slider */}
                  <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-1.5">
                    <span className="text-[11px] text-violet-600 font-medium">Paso de análisis:</span>
                    <input
                      type="range" min={2} max={15} step={1} value={sensStep}
                      onChange={e => setSensStep(Number(e.target.value))}
                      className="w-24 accent-violet-600"
                    />
                    <span className="text-xs font-bold text-violet-700 w-20">cada {sensStep}%</span>
                  </div>

                  {sens && (
                    <span className="ml-auto text-[11px] text-gray-400 self-center">
                      Base: TIR {sens.base_tir !== null ? `${sens.base_tir}%` : 'N/A'} · VAN {sens.base_van_millions}M {sens.currency}
                    </span>
                  )}
                </div>

                {/* Plain-language explanation */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 space-y-3">
                  <p className="text-[11px] font-bold text-blue-900">¿Cómo leer esta tabla?</p>

                  {/* What each axis means */}
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <div className="font-bold text-gray-700 mb-1">↕ Filas (vertical)</div>
                      <div className="text-gray-600">Qué pasa si los <strong>costos de construcción</strong> suben o bajan.<br/>
                        Ejemplo: fila +5% = la construcción cuesta 5% más de lo presupuestado.</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <div className="font-bold text-gray-700 mb-1">↔ Columnas (horizontal)</div>
                      <div className="text-gray-600">Qué pasa si el <strong>precio de venta por unidad</strong> sube o baja.<br/>
                        Ejemplo: columna +5% = vendes cada apartamento 5% más caro.</div>
                    </div>
                  </div>

                  {/* How to read a cell */}
                  <div className="bg-white rounded-lg p-3 border border-blue-100 text-[11px] text-gray-700">
                    <span className="font-bold text-gray-800">Cómo leer cada celda: </span>
                    Busca la fila del cambio de costo y la columna del cambio de precio.
                    El número en esa celda es el {sensMode === 'tir' ? 'TIR (retorno anual %)' : 'VAN (ganancia neta en millones)'} del proyecto en ese escenario.<br />
                    <span className="text-violet-700 font-semibold">Celda violeta = hoy, sin cambios.</span>{' '}
                    <span className="text-emerald-700 font-semibold">Verde = mejor que hoy.</span>{' '}
                    <span className="text-red-600 font-semibold">Rojo = peor que hoy.</span>
                  </div>

                  {/* Concrete example */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900">
                    <span className="font-bold">Ejemplo concreto: </span>
                    Si los costos de construcción suben un 5% (fila +5%) <strong>y al mismo tiempo</strong> el
                    precio de venta baja un 5% (columna −5%), ¿cuánto retorna el proyecto?
                    Busca esa intersección en la tabla — ese es el {sensMode === 'tir' ? 'TIR' : 'VAN'} en ese escenario.
                  </div>

                  <p className="text-[10px] text-blue-700">
                    <strong>Paso de análisis:</strong> controla el salto entre columnas/filas.
                    "Cada 5%" muestra −15%, −10%, −5%, 0%, +5%, +10%, +15%.
                    "Cada 10%" amplía a −30%, −20%, −10%, 0%, +10%, +20%, +30%.
                  </p>
                </div>

                {loadingSens ? (
                  <div className="text-xs text-gray-400 animate-pulse py-4">Calculando sensibilidades…</div>
                ) : sens ? (
                  <SensitividadMatrix data={sens} mode={sensMode} />
                ) : null}
              </div>
            )}
          </div>

          {/* ── Mora calculator ───────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={15} className="text-orange-500" />
              <h3 className="text-sm font-bold text-gray-800">Calculadora de Mora</h3>
            </div>
            {/* What this section does */}
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-[11px] text-orange-900 leading-relaxed space-y-1">
              <p><strong>¿Qué es la mora?</strong> Es la penalidad que el cliente debe pagar por cada mes de atraso en su cuota. Se calcula como: <strong>Saldo vencido × tasa mensual × meses de atraso.</strong></p>
              <p><strong>Ejemplo:</strong> Cuota de RD$50,000 con 3 meses de atraso y tasa del 2% → mora = 50,000 × 2% × 3 = <strong>RD$3,000 adicionales.</strong></p>
              <p><strong>Tasa de mora mensual:</strong> El porcentaje que se cobra por cada mes que el cliente no paga. El estándar en RD para proyectos inmobiliarios es 2–3% mensual según el contrato de compraventa.</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-5">
              {/* Plan selector */}
              <div className="flex items-center gap-2">
                <Users size={13} className="text-gray-400" />
                <span className="text-xs text-gray-500">Cliente / Plan:</span>
                <select
                  value={activeMoraPlan ?? ''}
                  onChange={e => setMoraPlanId(e.target.value)}
                  className="text-xs border border-gray-200 rounded-xl bg-white pl-3 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 max-w-xs"
                >
                  {plans.length === 0 && <option value="">— Requiere Docker rebuild —</option>}
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.client_name} — {p.project_name} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Rate slider */}
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-1.5">
                <span className="text-[11px] text-orange-600 font-medium">Tasa de mora mensual:</span>
                <input
                  type="range" min={0.5} max={5} step={0.5} value={moraRate}
                  onChange={e => setMoraRate(Number(e.target.value))}
                  className="w-24 accent-orange-500"
                />
                <span className="text-xs font-bold text-orange-700 w-12">{moraRate}% / mes</span>
              </div>
            </div>

            {/* Results */}
            {loadingMora ? (
              <div className="text-xs text-gray-400 animate-pulse">Calculando mora…</div>
            ) : mora ? (
              mora.overdue_installments === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-xl p-3">
                  <CheckCircle size={14} /> Este plan no tiene cuotas vencidas.
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Cuotas vencidas', value: mora.overdue_installments, color: 'text-orange-700' },
                      { label: 'Capital vencido', value: fmtCurrency(mora.total_principal, currency), color: 'text-gray-800' },
                      { label: 'Total mora acumulada', value: fmtCurrency(mora.total_mora, currency), color: 'text-red-700 font-bold' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-orange-50 rounded-xl p-3">
                        <div className={`text-base font-black ${color}`}>{value}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Detail table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Cuota', 'Vencimiento', 'Días vencida', 'Capital', `Mora (${mora.rate_label})`, 'Total a cobrar'].map(h => (
                            <th key={h} className="text-left text-[10px] font-semibold text-gray-400 py-2 pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mora.items.map(item => (
                          <tr key={item.installment_number} className="border-b border-gray-50 hover:bg-orange-50/40">
                            <td className="py-2 pr-4 font-bold text-gray-700">#{item.installment_number}</td>
                            <td className="py-2 pr-4 text-gray-600">{item.due_date}</td>
                            <td className="py-2 pr-4">
                              <span className="bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-semibold">{item.days_overdue}d</span>
                            </td>
                            <td className="py-2 pr-4 text-gray-700">{fmtCurrency(item.principal, currency)}</td>
                            <td className="py-2 pr-4 text-red-600 font-semibold">{fmtCurrency(item.mora, currency)}</td>
                            <td className="py-2 font-bold text-gray-900">{fmtCurrency(item.total_due, currency)}</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="bg-orange-50 font-bold">
                          <td className="py-2 pr-4 text-gray-700" colSpan={3}>Total</td>
                          <td className="py-2 pr-4 text-gray-800">{fmtCurrency(mora.total_principal, currency)}</td>
                          <td className="py-2 pr-4 text-red-700">{fmtCurrency(mora.total_mora, currency)}</td>
                          <td className="py-2 text-gray-900">{fmtCurrency(mora.total_amount_due, currency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">{mora.note}</p>
                </>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
