import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Plus, FileText, BarChart3, TrendingUp,
  CheckCircle, Clock, XCircle, ChevronDown, RefreshCw,
} from 'lucide-react'
import {
  getProjects, getInvoices, createInvoice, updateInvoiceStatus,
  getBalanceGeneral, getEstadoResultados,
} from '../api'

// ── Types ────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; currency: string }
interface Invoice {
  id: string; invoice_date: string; proveedor: string; ncf: string
  tipo: string; partida_code: string; description: string
  amount: number; status: string; entered_by: string
}
interface BalanceGeneral {
  as_of: string
  activos: { efectivo_y_equivalentes: number; cuentas_por_cobrar: number; total_activos: number }
  pasivos: { cuentas_por_pagar: number; total_pasivos: number }
  patrimonio: { capital: number; utilidad_acumulada: number; total_patrimonio: number }
  check_balanced: boolean
}
interface EstadoResultados {
  from_date: string; to_date: string
  ingresos: { cobros_recibidos: number; total_ingresos: number }
  gastos: {
    por_partida: Array<{ code: string; name: string; amount: number }>
    facturas_proveedores: number; total_gastos: number
  }
  utilidad_neta: number; margen_pct: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtMoney = (n: number, currency = 'DOP') =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

const today = new Date().toISOString().slice(0, 10)
const firstOfMonth = today.slice(0, 8) + '01'
const firstOfYear  = today.slice(0, 5) + '01-01'

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
  pagada:    { label: 'Pagada',    color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  anulada:   { label: 'Anulada',   color: 'text-gray-500 bg-gray-50 border-gray-200',   icon: XCircle },
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ContabilidadPage() {
  const [tab, setTab] = useState<'facturas' | 'balance' | 'resultados'>('facturas')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [erFrom, setErFrom] = useState(firstOfYear)
  const [erTo, setErTo] = useState(today)
  const [bgDate, setBgDate] = useState(today)

  const qc = useQueryClient()

  // Form state
  const [form, setForm] = useState({
    invoice_date: today, proveedor: '', ncf: '', tipo: 'factura',
    partida_code: '', description: '', amount: '', status: 'pendiente',
    entered_by: 'Jose Paulino',
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: getProjects,
  })
  const activeId = projectId || projects[0]?.id || ''
  const activeProject = projects.find(p => p.id === activeId)
  const currency = activeProject?.currency === 'USD' ? 'USD' : 'DOP'

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ['invoices', activeId, statusFilter],
    queryFn: () => getInvoices(activeId, statusFilter ? { status: statusFilter } : undefined),
    enabled: !!activeId,
  })

  const { data: balanceGeneral, isLoading: loadingBG } = useQuery<BalanceGeneral>({
    queryKey: ['balance-general', activeId, bgDate],
    queryFn: () => getBalanceGeneral(activeId, bgDate),
    enabled: !!activeId && tab === 'balance',
  })

  const { data: estadoResultados, isLoading: loadingER } = useQuery<EstadoResultados>({
    queryKey: ['estado-resultados', activeId, erFrom, erTo],
    queryFn: () => getEstadoResultados(activeId, erFrom, erTo),
    enabled: !!activeId && tab === 'resultados',
  })

  const createMutation = useMutation({
    mutationFn: () => createInvoice(activeId, {
      ...form, amount: parseFloat(form.amount) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', activeId] })
      setShowForm(false)
      setForm({ invoice_date: today, proveedor: '', ncf: '', tipo: 'factura', partida_code: '', description: '', amount: '', status: 'pendiente', entered_by: 'Jose Paulino' })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateInvoiceStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices', activeId] }),
  })

  // Summary totals
  const totals = useMemo(() => {
    const pendiente = invoices.filter(i => i.status === 'pendiente').reduce((s, i) => s + i.amount, 0)
    const pagada    = invoices.filter(i => i.status === 'pagada').reduce((s, i) => s + i.amount, 0)
    return { pendiente, pagada, count: invoices.length }
  }, [invoices])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
            <p className="text-sm text-gray-500">Facturas · Balance General · Estado de Resultados</p>
          </div>
        </div>
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-purple-500"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'facturas',   label: 'Facturas',            icon: FileText },
          { key: 'balance',    label: 'Balance General',     icon: BarChart3 },
          { key: 'resultados', label: 'Estado de Resultados', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Facturas ────────────────────────────────────────────────────── */}
      {tab === 'facturas' && (
        <div className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Facturas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.count}</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
              <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Por Pagar</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{fmtMoney(totals.pendiente, currency)}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Pagado</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{fmtMoney(totals.pagada, currency)}</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {['', 'pendiente', 'pagada', 'anulada'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    statusFilter === s
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {s === '' ? 'Todas' : STATUS_META[s]?.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Plus size={15} />
              Nueva Factura
            </button>
          </div>

          {/* New Invoice Form */}
          {showForm && (
            <div className="bg-white rounded-xl border border-purple-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Registrar Factura / Recibo</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={form.invoice_date}
                    onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                    <option value="factura">Factura</option>
                    <option value="recibo">Recibo</option>
                    <option value="nota_debito">Nota de Débito</option>
                    <option value="nota_credito">Nota de Crédito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">NCF</label>
                  <input type="text" value={form.ncf} placeholder="B0100000001"
                    onChange={e => setForm(f => ({ ...f, ncf: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor *</label>
                  <input type="text" value={form.proveedor} placeholder="Nombre del proveedor"
                    onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Partida</label>
                  <input type="text" value={form.partida_code} placeholder="GAS-002"
                    onChange={e => setForm(f => ({ ...f, partida_code: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                  <input type="text" value={form.description} placeholder="Descripción del concepto"
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Monto ({currency}) *</label>
                  <input type="number" value={form.amount} placeholder="0.00"
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                    <option value="pendiente">Pendiente</option>
                    <option value="pagada">Pagada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Registrado por</label>
                  <input type="text" value={form.entered_by}
                    onChange={e => setForm(f => ({ ...f, entered_by: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!form.proveedor || !form.amount || createMutation.isPending}
                  className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Guardando…' : 'Registrar Factura'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Invoice table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proveedor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NCF / Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Partida</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingInvoices ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay facturas</td></tr>
                ) : invoices.map(inv => {
                  const sm = STATUS_META[inv.status] || STATUS_META.pendiente
                  const SmIcon = sm.icon
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inv.invoice_date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{inv.proveedor}</div>
                        {inv.description && <div className="text-xs text-gray-400 truncate max-w-xs">{inv.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <div>{inv.ncf || '—'}</div>
                        <div className="text-xs capitalize">{inv.tipo}</div>
                      </td>
                      <td className="px-4 py-3">
                        {inv.partida_code
                          ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-mono">{inv.partida_code}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmtMoney(inv.amount, currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${sm.color}`}>
                          <SmIcon size={11} />
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.status === 'pendiente' && (
                          <button
                            onClick={() => statusMutation.mutate({ id: inv.id, status: 'pagada' })}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            Marcar pagada
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Balance General ──────────────────────────────────────────────── */}
      {tab === 'balance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-600">Fecha del balance:</label>
            <input type="date" value={bgDate} onChange={e => setBgDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={() => qc.invalidateQueries({ queryKey: ['balance-general', activeId, bgDate] })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-600 hover:text-purple-800">
              <RefreshCw size={14} />
              Actualizar
            </button>
          </div>

          {loadingBG ? (
            <div className="text-center py-16 text-gray-400">Calculando balance…</div>
          ) : balanceGeneral ? (
            <div className="grid grid-cols-3 gap-6">
              {/* Activos */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-blue-600 px-5 py-3">
                  <h3 className="font-bold text-white text-sm tracking-wide uppercase">Activos</h3>
                </div>
                <div className="p-5 space-y-3">
                  <Row label="Efectivo y equivalentes" value={fmtMoney(balanceGeneral.activos.efectivo_y_equivalentes, currency)} />
                  <Row label="Cuentas por cobrar" value={fmtMoney(balanceGeneral.activos.cuentas_por_cobrar, currency)} />
                  <div className="border-t border-gray-200 pt-3">
                    <Row label="Total Activos" value={fmtMoney(balanceGeneral.activos.total_activos, currency)} bold />
                  </div>
                </div>
              </div>

              {/* Pasivos */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-red-600 px-5 py-3">
                  <h3 className="font-bold text-white text-sm tracking-wide uppercase">Pasivos</h3>
                </div>
                <div className="p-5 space-y-3">
                  <Row label="Cuentas por pagar" value={fmtMoney(balanceGeneral.pasivos.cuentas_por_pagar, currency)} />
                  <div className="border-t border-gray-200 pt-3">
                    <Row label="Total Pasivos" value={fmtMoney(balanceGeneral.pasivos.total_pasivos, currency)} bold />
                  </div>
                </div>
              </div>

              {/* Patrimonio */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-purple-700 px-5 py-3">
                  <h3 className="font-bold text-white text-sm tracking-wide uppercase">Patrimonio</h3>
                </div>
                <div className="p-5 space-y-3">
                  <Row label="Capital (presupuesto)" value={fmtMoney(balanceGeneral.patrimonio.capital, currency)} />
                  <Row
                    label="Utilidad acumulada"
                    value={fmtMoney(balanceGeneral.patrimonio.utilidad_acumulada, currency)}
                    negative={balanceGeneral.patrimonio.utilidad_acumulada < 0}
                  />
                  <div className="border-t border-gray-200 pt-3">
                    <Row label="Total Patrimonio" value={fmtMoney(balanceGeneral.patrimonio.total_patrimonio, currency)} bold />
                  </div>
                </div>
              </div>

              {/* Balance check */}
              <div className={`col-span-3 flex items-center gap-3 px-5 py-3 rounded-xl border text-sm font-medium ${
                balanceGeneral.check_balanced
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {balanceGeneral.check_balanced
                  ? <><CheckCircle size={16} /> Balance cuadrado: Activos = Pasivos + Patrimonio ✓</>
                  : <><XCircle size={16} /> ⚠️ Balance no cuadrado — revisar datos</>}
                <span className="ml-auto text-xs opacity-60">al {balanceGeneral.as_of}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Tab: Estado de Resultados ─────────────────────────────────────────── */}
      {tab === 'resultados' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-gray-600">Período:</label>
            <div className="flex items-center gap-2">
              <input type="date" value={erFrom} onChange={e => setErFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-gray-400">→</span>
              <input type="date" value={erTo} onChange={e => setErTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button onClick={() => qc.invalidateQueries({ queryKey: ['estado-resultados', activeId, erFrom, erTo] })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-600 hover:text-purple-800">
              <RefreshCw size={14} />
              Calcular
            </button>
          </div>

          {loadingER ? (
            <div className="text-center py-16 text-gray-400">Calculando estado de resultados…</div>
          ) : estadoResultados ? (
            <div className="grid grid-cols-2 gap-6">
              {/* Ingresos */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-green-700 px-5 py-3">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">Ingresos</h3>
                </div>
                <div className="p-5 space-y-3">
                  <Row label="Cobros recibidos" value={fmtMoney(estadoResultados.ingresos.cobros_recibidos, currency)} />
                  <div className="border-t border-gray-200 pt-3">
                    <Row label="Total Ingresos" value={fmtMoney(estadoResultados.ingresos.total_ingresos, currency)} bold />
                  </div>
                </div>
              </div>

              {/* Gastos */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-red-700 px-5 py-3">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">Gastos</h3>
                </div>
                <div className="p-5 space-y-3">
                  {estadoResultados.gastos.por_partida.map(p => (
                    <Row key={p.code} label={`${p.code} — ${p.name}`} value={fmtMoney(p.amount, currency)} small />
                  ))}
                  {estadoResultados.gastos.facturas_proveedores > 0 && (
                    <Row label="Facturas proveedores" value={fmtMoney(estadoResultados.gastos.facturas_proveedores, currency)} small />
                  )}
                  <div className="border-t border-gray-200 pt-3">
                    <Row label="Total Gastos" value={fmtMoney(estadoResultados.gastos.total_gastos, currency)} bold />
                  </div>
                </div>
              </div>

              {/* Utilidad */}
              <div className={`col-span-2 rounded-xl border p-5 ${
                estadoResultados.utilidad_neta >= 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {estadoResultados.utilidad_neta >= 0 ? 'Utilidad Neta' : 'Pérdida Neta'}
                    </p>
                    <p className={`text-3xl font-black mt-1 ${
                      estadoResultados.utilidad_neta >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {fmtMoney(estadoResultados.utilidad_neta, currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Margen</p>
                    <p className={`text-4xl font-black ${
                      estadoResultados.margen_pct >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {estadoResultados.margen_pct}%
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Período: {estadoResultados.from_date} → {estadoResultados.to_date}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-component ────────────────────────────────────────────────────
function Row({
  label, value, bold = false, small = false, negative = false,
}: {
  label: string; value: string; bold?: boolean; small?: boolean; negative?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className={`${small ? 'text-xs' : 'text-sm'} text-gray-600 truncate`}>{label}</span>
      <span className={`${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${small ? 'text-xs' : 'text-sm'} whitespace-nowrap ${negative ? 'text-red-600' : ''}`}>
        {value}
      </span>
    </div>
  )
}
