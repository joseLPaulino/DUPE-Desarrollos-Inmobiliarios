/**
 * DataEntryPage — manual data entry for transactions, payments, budget execution
 * Supports Excel-inspired inline editing for professional feel
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getProjects, getDashboard, getPaymentPlans, getPlanInstallments } from '../api'
import {
  PlusCircle, CheckCircle, XCircle, Loader2, ChevronDown,
  Banknote, CreditCard, BarChart3, FileText, AlertCircle, Sheet,
} from 'lucide-react'
import ExcelBulkImport from '../components/ExcelBulkImport'

interface ProjectSummary { id: string; name: string; currency: string }
interface PartidaKPI {
  code: string        // NOT partida_code
  name: string        // NOT partida_name
  budgeted: number    // NOT budget
  executed: number
  pct: number         // NOT execution_pct — 0-100
  traffic_light: string  // lowercase: "green"|"amber"|"red"
}

const n = (v: unknown): number => Number(v) || 0
const tlu = (v?: string) => (v ?? 'green').toUpperCase()

type EntryType = 'transaction' | 'payment' | 'budget' | 'excel'

const fmtCurrency = (currency: string) =>
  currency === 'USD' ? { symbol: 'US$', locale: 'en-US' } : { symbol: 'RD$', locale: 'es-DO' }

function FormRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-3 border-b border-gray-50 last:border-0">
      <label className="text-xs font-medium text-gray-600 pt-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

const inputCls = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 bg-white"
const selectCls = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white appearance-none"

export default function DataEntryPage() {
  const [projectId, setProjectId] = useState('')
  const [entryType, setEntryType] = useState<EntryType>('transaction')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const qc = useQueryClient()

  const { data: projects = [], isLoading: loadingProjects } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: () => import('../api').then(m => m.getProjects()),
  })
  const activeId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)
  const currency = activeProject?.currency ?? 'DOP'
  const { symbol } = fmtCurrency(currency)

  const { data: dash } = useQuery<any>({
    queryKey: ['dashboard', activeId],
    queryFn: () => getDashboard(activeId!),
    enabled: !!activeId,
  })
  const partidas: PartidaKPI[] = dash?.partida_kpis ?? []

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const tabs: { key: EntryType; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'transaction', icon: Banknote,   label: 'Transacción Bancaria',   desc: 'Registrar ingreso/egreso manual sin conciliación' },
    { key: 'payment',     icon: CreditCard, label: 'Pago de Cuota',          desc: 'Registrar pago recibido en un plan de pago' },
    { key: 'budget',      icon: BarChart3,  label: 'Ejecución Presupuestal', desc: 'Actualizar ejecución de una partida del presupuesto' },
    { key: 'excel',       icon: Sheet,      label: 'Importar desde Excel',   desc: 'Carga masiva con validación antes de confirmar' },
  ]

  // Don't render forms until we have a project — avoids blank screen on load
  if (loadingProjects) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400 animate-pulse gap-2">
      <Loader2 size={16} className="animate-spin text-violet-400" /> Cargando proyectos…
    </div>
  )
  if (!activeId) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertCircle size={32} className="text-amber-400" />
      <p className="text-sm font-semibold text-gray-600">No hay proyectos disponibles</p>
      <p className="text-xs text-gray-400">Crea un proyecto antes de ingresar datos</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium transition-all ${
          toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-sm">
            <PlusCircle size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Entrada de Datos</h1>
            <p className="text-xs text-gray-400">Registro manual — transacciones, pagos, presupuesto</p>
          </div>
        </div>
        <div className="relative">
          <select
            value={activeId ?? ''}
            onChange={e => setProjectId(e.target.value)}
            className={selectCls + ' pr-8 w-56'}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Entry type tabs */}
      <div className="grid grid-cols-4 gap-3">
        {tabs.map(({ key, label, icon: Icon, desc }) => (
          <button
            key={key}
            onClick={() => setEntryType(key)}
            className={`text-left p-4 rounded-2xl border transition-all ${
              entryType === key
                ? 'border-violet-300 bg-violet-50 shadow-md shadow-violet-100'
                : 'border-gray-100 bg-white hover:border-violet-200 hover:shadow-sm'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${entryType === key ? 'bg-violet-600' : 'bg-gray-100'}`}>
              <Icon size={15} className={entryType === key ? 'text-white' : 'text-gray-400'} />
            </div>
            <div className={`text-xs font-semibold mb-1 ${entryType === key ? 'text-violet-700' : 'text-gray-700'}`}>{label}</div>
            <div className="text-[11px] text-gray-400 leading-snug">{desc}</div>
          </button>
        ))}
      </div>

      {/* Form / Import */}
      {entryType === 'excel' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
            <Sheet size={15} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-700">Importar desde Excel / CSV</h3>
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold ml-1">
              Migración · Con validación
            </span>
          </div>
          <div className="px-6 py-4">
            <ExcelBulkImport
              projectId={activeId!}
              currency={symbol}
              partidas={partidas}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
            <FileText size={15} className="text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              {tabs.find(t => t.key === entryType)?.label}
            </h3>
          </div>
          <div className="px-6 py-2">
            {entryType === 'transaction' && (
              <TransactionForm projectId={activeId!} currency={symbol} onSuccess={(msg) => {
                showToast(msg, true)
                qc.invalidateQueries({ queryKey: ['dashboard', activeId] })
              }} onError={(msg) => showToast(msg, false)} />
            )}
            {entryType === 'payment' && (
              <PaymentForm projectId={activeId!} currency={symbol} onSuccess={(msg) => {
                showToast(msg, true)
                qc.invalidateQueries({ queryKey: ['plans', activeId] })
              }} onError={(msg) => showToast(msg, false)} />
            )}
            {entryType === 'budget' && (
              <BudgetForm projectId={activeId!} currency={symbol} partidas={partidas} onSuccess={(msg) => {
                showToast(msg, true)
                qc.invalidateQueries({ queryKey: ['dashboard', activeId] })
              }} onError={(msg) => showToast(msg, false)} />
            )}
          </div>
        </div>
      )}

      {/* Quick reference: partida list */}
      {partidas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Referencia — Partidas del Proyecto</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                {['Código','Partida','Presupuestado','Ejecutado','%'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {partidas.map(p => (
                <tr key={p.code} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <span className="font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.code}</span>
                  </td>
                  <td className="px-5 py-2.5 text-gray-700">{p.name}</td>
                  <td className="px-5 py-2.5 text-gray-700">
                    {new Intl.NumberFormat('es-DO', { style: 'currency', currency: activeProject?.currency ?? 'DOP', maximumFractionDigits: 0, notation: 'compact' }).format(n(p.budgeted))}
                  </td>
                  <td className="px-5 py-2.5 font-semibold text-violet-700">
                    {new Intl.NumberFormat('es-DO', { style: 'currency', currency: activeProject?.currency ?? 'DOP', maximumFractionDigits: 0, notation: 'compact' }).format(n(p.executed))}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`font-bold ${
                      tlu(p.traffic_light) === 'RED' ? 'text-red-600' :
                      tlu(p.traffic_light) === 'AMBER' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>{n(p.pct).toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Transaction Form ───────────────────────────────────────────────────────────
function TransactionForm({ projectId, currency, onSuccess, onError }: {
  projectId: string; currency: string
  onSuccess: (msg: string) => void; onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0],
    partida_code: '', reference: '', type: 'expense',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description || !form.amount) { onError('Descripción y monto son obligatorios'); return }
    setSaving(true)
    try {
      const { createTransaction } = await import('../api')
      await createTransaction(projectId, {
        description: form.description,
        amount: form.type === 'income' ? Math.abs(parseFloat(form.amount)) : -Math.abs(parseFloat(form.amount)),
        transaction_date: form.transaction_date,
        partida_code: form.partida_code || undefined,
        reference: form.reference || undefined,
      })
      setForm({ description: '', amount: '', transaction_date: new Date().toISOString().split('T')[0], partida_code: '', reference: '', type: 'expense' })
      onSuccess('Transacción registrada exitosamente')
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al registrar transacción')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormRow label="Tipo" required>
        <div className="flex gap-3">
          {[['expense','Egreso 💸'],['income','Ingreso 💰']].map(([val, lbl]) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="type" value={val} checked={form.type === val} onChange={() => set('type', val)} className="accent-violet-600" />
              <span className="text-sm text-gray-700">{lbl}</span>
            </label>
          ))}
        </div>
      </FormRow>
      <FormRow label="Descripción" required>
        <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Ej: Pago proveedor — Fase 1 Bloque A" />
      </FormRow>
      <FormRow label={`Monto (${currency})`} required>
        <input className={inputCls} type="number" step="0.01" min="0" value={form.amount}
          onChange={e => set('amount', e.target.value)} placeholder="0.00" />
      </FormRow>
      <FormRow label="Fecha">
        <input className={inputCls} type="date" value={form.transaction_date} onChange={e => set('transaction_date', e.target.value)} />
      </FormRow>
      <FormRow label="Código partida">
        <input className={inputCls} value={form.partida_code} onChange={e => set('partida_code', e.target.value)}
          placeholder="Ej: GAS-002 (opcional)" />
      </FormRow>
      <FormRow label="Referencia">
        <input className={inputCls} value={form.reference} onChange={e => set('reference', e.target.value)}
          placeholder="No. cheque, transferencia, etc." />
      </FormRow>
      <div className="py-4 flex justify-end">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
          {saving ? 'Guardando…' : 'Registrar Transacción'}
        </button>
      </div>
    </form>
  )
}

// ── Payment Form ───────────────────────────────────────────────────────────────
function PaymentForm({ projectId, currency, onSuccess, onError }: {
  projectId: string; currency: string
  onSuccess: (msg: string) => void; onError: (msg: string) => void
}) {
  const [planId, setPlanId] = useState('')
  const [installmentId, setInstallmentId] = useState('')
  const [form, setForm] = useState({ paid_amount: '', paid_date: new Date().toISOString().split('T')[0], notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Load plans for this project
  const { data: plans = [], isLoading: loadingPlans } = useQuery<any[]>({
    queryKey: ['plans', projectId],
    queryFn: () => getPaymentPlans(projectId),
    enabled: !!projectId,
  })

  // Load installments for the selected plan
  const { data: planDetail, isLoading: loadingInstallments } = useQuery<any>({
    queryKey: ['plan-detail', planId],
    queryFn: () => getPlanInstallments(planId),
    enabled: !!planId,
  })
  const unpaidInstallments = (planDetail?.installments ?? []).filter((i: any) => i.status !== 'paid')
  const selectedInstallment = planDetail?.installments?.find((i: any) => i.id === installmentId)

  const handlePlanChange = (pid: string) => {
    setPlanId(pid)
    setInstallmentId('')
    setForm(f => ({ ...f, paid_amount: '' }))
  }

  const handleInstallmentChange = (iid: string) => {
    setInstallmentId(iid)
    const inst = planDetail?.installments?.find((i: any) => i.id === iid)
    if (inst) setForm(f => ({ ...f, paid_amount: inst.amount }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!installmentId || !form.paid_amount) { onError('Selecciona una cuota y monto'); return }
    setSaving(true)
    try {
      const { registerPayment } = await import('../api')
      await registerPayment(installmentId, {
        paid_amount: parseFloat(form.paid_amount),
        paid_date: form.paid_date,
        notes: form.notes || undefined,
      })
      setPlanId(''); setInstallmentId('')
      setForm({ paid_amount: '', paid_date: new Date().toISOString().split('T')[0], notes: '' })
      onSuccess(`Pago registrado — Cuota #${selectedInstallment?.number ?? ''} de ${planDetail?.client_name ?? ''}`)
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al registrar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Step 1 — pick a plan */}
      <FormRow label="Cliente / Plan" required>
        <div className="relative">
          <select
            className={selectCls + ' pr-8'}
            value={planId}
            onChange={e => handlePlanChange(e.target.value)}
            disabled={loadingPlans}
          >
            <option value="">
              {loadingPlans ? 'Cargando planes…' : plans.length === 0 ? 'No hay planes activos' : '— Seleccionar cliente —'}
            </option>
            {plans.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.client_name} · Unidad {p.unit_number}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </FormRow>

      {/* Step 2 — pick an installment */}
      <FormRow label="Cuota pendiente" required>
        <div className="relative">
          <select
            className={selectCls + ' pr-8'}
            value={installmentId}
            onChange={e => handleInstallmentChange(e.target.value)}
            disabled={!planId || loadingInstallments}
          >
            <option value="">
              {!planId ? 'Primero selecciona un cliente' :
               loadingInstallments ? 'Cargando cuotas…' :
               unpaidInstallments.length === 0 ? 'Todas las cuotas están pagadas' :
               '— Seleccionar cuota —'}
            </option>
            {unpaidInstallments.map((i: any) => (
              <option key={i.id} value={i.id}>
                Cuota #{i.number} — vence {i.due_date}
                {i.days_overdue > 0 ? ` (${i.days_overdue}d vencida)` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {selectedInstallment?.days_overdue > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <AlertCircle size={11} />
            Cuota vencida hace {selectedInstallment.days_overdue} días — monto pendiente pre-cargado
          </div>
        )}
      </FormRow>

      <FormRow label={`Monto Pagado (${currency})`} required>
        <input className={inputCls} type="number" step="0.01" min="0" value={form.paid_amount}
          onChange={e => set('paid_amount', e.target.value)} placeholder="0.00" />
      </FormRow>
      <FormRow label="Fecha de Pago">
        <input className={inputCls} type="date" value={form.paid_date} onChange={e => set('paid_date', e.target.value)} />
      </FormRow>
      <FormRow label="Notas">
        <input className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Cheque #, transferencia, observaciones…" />
      </FormRow>
      <div className="py-4 flex justify-end">
        <button type="submit" disabled={saving || !installmentId}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
          {saving ? 'Guardando…' : 'Registrar Pago'}
        </button>
      </div>
    </form>
  )
}

// ── Budget Execution Form ──────────────────────────────────────────────────────
function BudgetForm({ projectId, currency, partidas, onSuccess, onError }: {
  projectId: string; currency: string; partidas: PartidaKPI[]
  onSuccess: (msg: string) => void; onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    partida_code: '', amount: '', description: '', entered_by: 'gerencia@dupedesa.com',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const selectedPartida = partidas.find(p => p.code === form.partida_code)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.partida_code || !form.amount) { onError('Partida y monto son obligatorios'); return }
    setSaving(true)
    try {
      const { updateBudgetExecution } = await import('../api')
      await updateBudgetExecution({
        project_id: projectId,
        partida_code: form.partida_code,
        amount: parseFloat(form.amount),
        description: form.description,
        entered_by: form.entered_by,
      })
      setForm({ partida_code: '', amount: '', description: '', entered_by: 'gerencia@dupedesa.com' })
      onSuccess('Ejecución registrada exitosamente')
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al registrar ejecución')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormRow label="Partida" required>
        <select className={selectCls} value={form.partida_code} onChange={e => set('partida_code', e.target.value)}>
          <option value="">— Seleccionar partida —</option>
          {partidas.map(p => (
            <option key={p.code} value={p.code}>
              {p.code} — {(p.name ?? '').slice(0, 50)}
            </option>
          ))}
        </select>
        {selectedPartida && (
          <div className="mt-2 flex gap-4 text-[11px] text-gray-500">
            <span>Presupuestado: <strong>{currency} {n(selectedPartida.budgeted).toLocaleString('es-DO')}</strong></span>
            <span>Ejecutado: <strong>{n(selectedPartida.pct).toFixed(1)}%</strong></span>
            <span className={tlu(selectedPartida.traffic_light) === 'RED' ? 'text-red-600 font-semibold' : tlu(selectedPartida.traffic_light) === 'AMBER' ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>
              ● {tlu(selectedPartida.traffic_light) === 'RED' ? 'Crítico' : tlu(selectedPartida.traffic_light) === 'AMBER' ? 'Alerta' : 'OK'}
            </span>
          </div>
        )}
      </FormRow>
      <FormRow label={`Monto (${currency})`} required>
        <input className={inputCls} type="number" step="0.01" min="0" value={form.amount}
          onChange={e => set('amount', e.target.value)} placeholder="0.00" />
      </FormRow>
      <FormRow label="Descripción">
        <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Factura #, contrato, descripción del gasto…" />
      </FormRow>
      <FormRow label="Registrado por">
        <input className={inputCls} value={form.entered_by} onChange={e => set('entered_by', e.target.value)} />
      </FormRow>
      <div className="py-4 flex justify-end">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <BarChart3 size={15} />}
          {saving ? 'Guardando…' : 'Registrar Ejecución'}
        </button>
      </div>
    </form>
  )
}
