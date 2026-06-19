/**
 * PredictionsPage — AI-powered forecasts: cash flow, budget overrun, delinquency risk
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getPredictions } from '../api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts'
import {
  BrainCircuit, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, ChevronDown, Zap, Target, CalendarClock,
} from 'lucide-react'

interface ProjectSummary { id: string; name: string; currency: string }

const compact = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(Math.abs(n))

const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`
}

const riskColor: Record<string, string> = {
  HIGH: 'text-red-700',
  MEDIUM: 'text-amber-700',
  LOW: 'text-emerald-700',
}
const riskBg: Record<string, string> = {
  HIGH: 'bg-red-50 border-red-200',
  MEDIUM: 'bg-amber-50 border-amber-200',
  LOW: 'bg-emerald-50 border-emerald-200',
}
const riskBar: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
}

function InsightBadge({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 mt-3">
      <BrainCircuit size={14} className="text-violet-600 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-violet-700 leading-relaxed">{text}</p>
    </div>
  )
}

export default function PredictionsPage() {
  const [projectId, setProjectId] = useState('')

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: () => import('../api').then(m => m.getProjects()),
  })

  const activeId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)
  const currency = activeProject?.currency ?? 'DOP'

  const { data: pred, isLoading } = useQuery<any>({
    queryKey: ['predictions', activeId],
    queryFn: () => getPredictions(activeId!),
    enabled: !!activeId,
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-sm">
            <BrainCircuit size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">IA Predicciones</h1>
            <p className="text-xs text-gray-400">Modelos de pronóstico — {pred?.as_of_date ?? '—'}</p>
          </div>
        </div>
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
      </div>

      {isLoading && (
        <div className="h-48 bg-white rounded-2xl border border-gray-100 flex items-center justify-center gap-2 text-gray-400 text-sm">
          <Zap size={16} className="animate-pulse text-violet-400" />
          Calculando predicciones con IA…
        </div>
      )}

      {pred && (
        <>
          {/* ── Section 1: Completion prediction ─── */}
          <div className="grid grid-cols-3 gap-4">
            <CompletionCard pred={pred.completion_prediction} />
            {pred.budget_risk && <BudgetRiskCard risk={pred.budget_risk} currency={currency} />}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarClock size={15} className="text-violet-500" />
                <h3 className="text-sm font-semibold text-gray-700">Pronóstico Próx. 6 Meses</h3>
              </div>
              <div className="space-y-3">
                {pred.cash_flow_forecast.expense_trend.map((t: any, i: number) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{fmtMonth(t.month)}</span>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-violet-700">{compact(t.predicted, currency)}</span>
                      <span className="ml-1 text-[10px] text-gray-400">({Math.round(t.confidence * 100)}%)</span>
                    </div>
                  </div>
                ))}
                {pred.cash_flow_forecast.expense_trend.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Sin datos suficientes</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 2: Cash flow forecast chart ─── */}
          {(pred.cash_flow_forecast.expense_trend.length > 0 || pred.cash_flow_forecast.income_trend.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-gray-700">Pronóstico Flujo — Próximos 6 Meses</h3>
                <div className="flex gap-4 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Gastos</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Ingresos</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-0.5 border-t border-dashed border-gray-400 inline-block" />Modelo Excel</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={pred.cash_flow_forecast.expense_trend.map((e: any, i: number) => ({
                    month: e.month,
                    predicted_exp: e.predicted,
                    model_exp: e.model,
                    predicted_inc: pred.cash_flow_forecast.income_trend[i]?.predicted ?? 0,
                    model_inc: pred.cash_flow_forecast.income_trend[i]?.model ?? 0,
                    confidence: e.confidence,
                  }))}
                  barGap={4} barSize={22}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => compact(v, currency)} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    formatter={(v: number, name: string) => [compact(v, currency), name]}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb' }}
                    labelFormatter={fmtMonth}
                  />
                  <Bar dataKey="model_exp" name="Gastos (modelo)" fill="#DDD6FE" radius={[3,3,0,0]} />
                  <Bar dataKey="predicted_exp" name="Gastos (IA)" fill="#7C3AED" radius={[3,3,0,0]} />
                  <Bar dataKey="model_inc" name="Ingresos (modelo)" fill="#a7f3d0" radius={[3,3,0,0]} />
                  <Bar dataKey="predicted_inc" name="Ingresos (IA)" fill="#10b981" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Section 3: Delinquency risk table ─── */}
          {pred.delinquency_risks.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Riesgo de Morosidad por Plan</h3>
                <span className="text-xs text-gray-400">{pred.delinquency_risks.length} planes activos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      {['Plan','Score','Riesgo','Tasa Pago','Días venc.','Cuotas','Análisis IA'].map(h => (
                        <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pred.delinquency_risks.map((r: any) => (
                      <tr key={r.plan_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded text-[11px]">
                            {r.plan_id.slice(0, 8)}…
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${r.risk_score}%`, backgroundColor: riskBar[r.risk_level] }} />
                            </div>
                            <span className="font-bold text-gray-700">{r.risk_score}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${riskBg[r.risk_level]} ${riskColor[r.risk_level]}`}>
                            {r.risk_level === 'HIGH' ? 'Alto' : r.risk_level === 'MEDIUM' ? 'Moderado' : 'Bajo'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-gray-700">{r.payment_rate}%</td>
                        <td className="px-5 py-3 font-semibold" style={{ color: r.max_overdue_days > 0 ? riskBar[r.risk_level] : '#10b981' }}>
                          {r.max_overdue_days > 0 ? `+${r.max_overdue_days}d` : '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          <span className="text-emerald-600 font-medium">{r.paid_count}✓</span>
                          {r.overdue_count > 0 && <span className="text-red-500 font-medium ml-1.5">{r.overdue_count}✗</span>}
                          {r.pending_count > 0 && <span className="text-gray-400 ml-1.5">{r.pending_count}⏳</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500 max-w-[220px] leading-snug">{r.ai_insight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CompletionCard({ pred }: { pred: any }) {
  if (!pred) return null
  const onSchedule = pred.on_schedule
  const variance = pred.schedule_variance_months
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={15} className={onSchedule ? 'text-emerald-500' : 'text-amber-500'} />
        <h3 className="text-sm font-semibold text-gray-700">Fecha de Entrega</h3>
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{fmtMonth(pred.predicted_date)}</div>
      <div className="text-xs text-gray-400 mb-3">Previsto: {fmtMonth(pred.expected_date)}</div>
      <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
        onSchedule ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}>
        {onSchedule ? <CheckCircle size={12} /> : <Clock size={12} />}
        {onSchedule ? 'A tiempo' : `${Math.abs(variance).toFixed(1)} mes(es) de retraso`}
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>Avance</span>
          <span className="font-semibold text-gray-700">{pred.current_progress_pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full"
            style={{ width: `${pred.current_progress_pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function BudgetRiskCard({ risk, currency }: { risk: any; currency: string }) {
  const riskLvl: Record<string, { cls: string; label: string }> = {
    HIGH: { cls: 'bg-red-50 border-red-200 text-red-700', label: 'Alto riesgo' },
    MEDIUM: { cls: 'bg-amber-50 border-amber-200 text-amber-700', label: 'Riesgo moderado' },
    LOW: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: 'En control' },
  }
  const cfg = riskLvl[risk.risk_level] ?? riskLvl.LOW
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={15} className="text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-700">Riesgo Presupuestal</h3>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Presupuesto</span>
          <span className="font-semibold">{compact(risk.total_budget, currency)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Ejecutado</span>
          <span className="font-semibold text-violet-700">{compact(risk.total_executed, currency)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Proyectado final</span>
          <span className={`font-bold ${risk.projected_final_cost > risk.total_budget ? 'text-red-600' : 'text-gray-800'}`}>
            {compact(risk.projected_final_cost, currency)}
          </span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(risk.execution_pct, 100)}%`, backgroundColor: riskBar[risk.risk_level] }} />
      </div>
      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
        {cfg.label} · {risk.overrun_pct > 0 ? '+' : ''}{risk.overrun_pct.toFixed(1)}%
      </span>
      <InsightBadge text={risk.ai_insight} />
    </div>
  )
}
