import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Plus, Trash2, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { getGoals, createGoal, deleteGoal, getGoalsPerformance } from '../api'

// ── Types ────────────────────────────────────────────────────────────────────
interface Goal {
  id: string; department: string; officer_name: string; metric_name: string
  metric_unit: string; target_value: number; period: string; notes: string
}
interface PerformanceRow {
  id: string; department: string; officer_name: string; metric_name: string
  metric_unit: string; period: string; target_value: number; actual_value: number
  progress_pct: number; status: 'verde' | 'ambar' | 'rojo'; notes: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtVal = (v: number, unit: string) => {
  if (unit === 'RD$' || unit === 'USD') {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: unit === 'USD' ? 'USD' : 'DOP',
      maximumFractionDigits: 0,
    }).format(v)
  }
  return `${v.toLocaleString('es-DO')} ${unit}`
}

const DEPT_LABELS: Record<string, string> = {
  cobros: 'Cobros', finanzas: 'Finanzas', comercial: 'Comercial',
  gestion: 'Gestión', postventa: 'Postventa',
}
const DEPT_COLORS: Record<string, string> = {
  cobros: 'bg-blue-100 text-blue-700', finanzas: 'bg-purple-100 text-purple-700',
  comercial: 'bg-orange-100 text-orange-700', gestion: 'bg-teal-100 text-teal-700',
  postventa: 'bg-pink-100 text-pink-700',
}
const STATUS_CFG = {
  verde: { label: 'En meta',  color: 'bg-green-100 text-green-700 border-green-200', bar: 'bg-green-500', icon: CheckCircle },
  ambar: { label: 'En riesgo', color: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400', icon: AlertTriangle },
  rojo:  { label: 'Bajo meta', color: 'bg-red-100 text-red-700 border-red-200',    bar: 'bg-red-500',   icon: AlertTriangle },
}

// current period default
const now = new Date()
const thisPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

// ── Component ────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const [tab, setTab] = useState<'performance' | 'metas'>('performance')
  const [period, setPeriod] = useState(thisPeriod)
  const [deptFilter, setDeptFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    department: 'cobros', officer_name: '', metric_name: '',
    metric_unit: 'RD$', target_value: '', period: thisPeriod, notes: '',
  })

  const qc = useQueryClient()

  const { data: performance = [], isLoading: loadingPerf } = useQuery<PerformanceRow[]>({
    queryKey: ['goals-performance', period],
    queryFn: () => getGoalsPerformance(period),
  })

  const { data: goals = [], isLoading: loadingGoals } = useQuery<Goal[]>({
    queryKey: ['goals', deptFilter, period],
    queryFn: () => getGoals({ department: deptFilter || undefined, period }),
    enabled: tab === 'metas',
  })

  const createMutation = useMutation({
    mutationFn: () => createGoal({ ...form, target_value: parseFloat(form.target_value) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['goals-performance'] })
      setShowForm(false)
      setForm({ department: 'cobros', officer_name: '', metric_name: '', metric_unit: 'RD$', target_value: '', period: thisPeriod, notes: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['goals-performance'] })
    },
  })

  // Aggregate stats
  const verdePct = performance.length > 0
    ? Math.round(performance.filter(r => r.status === 'verde').length / performance.length * 100) : 0
  const avgProgress = performance.length > 0
    ? Math.round(performance.reduce((s, r) => s + r.progress_pct, 0) / performance.length) : 0

  const filtered = deptFilter ? performance.filter(r => r.department === deptFilter) : performance

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow">
            <Target size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Metas y Objetivos</h1>
            <p className="text-sm text-gray-500">Desempeño de oficiales por departamento</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500">Período:</label>
          <input
            type="month" value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Oficiales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{performance.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
          <p className="text-xs text-green-600 uppercase tracking-wide font-medium">En Meta</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{verdePct}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Avance Promedio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgProgress}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Bajo Meta</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {performance.filter(r => r.status === 'rojo').length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'performance', label: 'Desempeño', icon: TrendingUp },
          { key: 'metas',       label: 'Gestionar Metas', icon: Target },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Department filter */}
      <div className="flex gap-2">
        {['', 'cobros', 'finanzas', 'comercial', 'gestion', 'postventa'].map(d => (
          <button key={d} onClick={() => setDeptFilter(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              deptFilter === d
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
            }`}>
            {d === '' ? 'Todos' : DEPT_LABELS[d]}
          </button>
        ))}
      </div>

      {/* ── Tab: Performance ─────────────────────────────────────────────────── */}
      {tab === 'performance' && (
        <div className="space-y-3">
          {loadingPerf ? (
            <div className="text-center py-16 text-gray-400">Cargando desempeño…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              No hay metas configuradas para este período.<br />
              <span className="text-sm">Usa "Gestionar Metas" para crear objetivos.</span>
            </div>
          ) : filtered.map(row => {
            const cfg = STATUS_CFG[row.status] || STATUS_CFG.rojo
            const Icon = cfg.icon
            const pct = Math.min(row.progress_pct, 100)
            return (
              <div key={row.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{row.officer_name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${DEPT_COLORS[row.department] || 'bg-gray-100 text-gray-600'}`}>
                          {DEPT_LABELS[row.department] || row.department}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{row.metric_name}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                    <Icon size={11} />{cfg.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${cfg.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Real: <strong className="text-gray-900">{fmtVal(row.actual_value, row.metric_unit)}</strong>
                  </span>
                  <span className="text-gray-500">
                    Meta: <strong className="text-gray-900">{fmtVal(row.target_value, row.metric_unit)}</strong>
                  </span>
                  <span className={`font-bold ${row.progress_pct >= 90 ? 'text-green-600' : row.progress_pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {row.progress_pct}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Período: {row.period}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Gestionar Metas ──────────────────────────────────────────────── */}
      {tab === 'metas' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 shadow-sm transition-colors">
              <Plus size={15} />
              Nueva Meta
            </button>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Asignar Objetivo</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Departamento</label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                    {Object.entries(DEPT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Oficial *</label>
                  <input type="text" value={form.officer_name} placeholder="Nombre del oficial"
                    onChange={e => setForm(f => ({ ...f, officer_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Período</label>
                  <input type="month" value={form.period}
                    onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Métrica *</label>
                  <input type="text" value={form.metric_name} placeholder="Ej: Monto cobrado, Contratos firmados…"
                    onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unidad</label>
                  <select value={form.metric_unit} onChange={e => setForm(f => ({ ...f, metric_unit: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                    <option value="RD$">RD$</option>
                    <option value="USD">USD</option>
                    <option value="unidades">Unidades</option>
                    <option value="%">%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valor Objetivo *</label>
                  <input type="number" value={form.target_value} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                  <input type="text" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!form.officer_name || !form.metric_name || !form.target_value || createMutation.isPending}
                  className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Guardando…' : 'Crear Meta'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Goals list */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Oficial</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Dpto.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Métrica</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Objetivo</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Período</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingGoals ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : goals.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No hay metas configuradas</td></tr>
                ) : goals.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.officer_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${DEPT_COLORS[g.department] || 'bg-gray-100 text-gray-600'}`}>
                        {DEPT_LABELS[g.department] || g.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.metric_name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmtVal(g.target_value, g.metric_unit)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 font-mono text-xs">{g.period}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm('¿Eliminar esta meta?')) deleteMutation.mutate(g.id) }}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
