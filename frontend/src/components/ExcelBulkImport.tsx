/**
 * ExcelBulkImport — guarded migration import for transactions, budget executions, and payments.
 *
 * Flow: Upload Excel → Parse → Validate per-row → Preview with status badges → Confirm → Import
 *
 * Guarded checks per type:
 *   Transacciones : descripcion, monto (>0), tipo (ingreso|egreso), fecha valid
 *   Ejecuciones   : codigo_partida exists in project, monto (>0), won't exceed 110% budget
 *   Pagos         : unit_number matches active plan, numero_cuota matches unpaid installment
 */
import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  Loader2, FileSpreadsheet, ChevronRight, RotateCcw, Info,
} from 'lucide-react'
import { getPaymentPlans, getPlanInstallments } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportMode = 'transactions' | 'executions' | 'payments'
type RowStatus  = 'ready' | 'warning' | 'error' | 'imported' | 'failed'

interface PartidaKPI { code: string; name: string; budgeted: number; executed: number; pct: number }

interface ParsedRow {
  _rowNum: number
  status: RowStatus
  errors: string[]
  warnings: string[]
  data: Record<string, string | number>
}

interface ImportProps {
  projectId: string
  currency: string
  partidas: PartidaKPI[]
}

// ── Column specs & templates ──────────────────────────────────────────────────

const COLS = {
  transactions: [
    { key: 'descripcion',     label: 'descripcion',     required: true,  hint: 'Descripción del movimiento' },
    { key: 'monto',           label: 'monto',           required: true,  hint: 'Número positivo' },
    { key: 'tipo',            label: 'tipo',            required: true,  hint: '"ingreso" o "egreso"' },
    { key: 'fecha',           label: 'fecha',           required: true,  hint: 'YYYY-MM-DD' },
    { key: 'codigo_partida',  label: 'codigo_partida',  required: false, hint: 'Ej: GAS-001 (opcional)' },
    { key: 'referencia',      label: 'referencia',      required: false, hint: 'No. cheque / transferencia (opcional)' },
  ],
  executions: [
    { key: 'codigo_partida',  label: 'codigo_partida',  required: true,  hint: 'Código de partida exacto (ej: CONST-001)' },
    { key: 'monto',           label: 'monto',           required: true,  hint: 'Número positivo' },
    { key: 'descripcion',     label: 'descripcion',     required: false, hint: 'Factura #, descripción…' },
    { key: 'fecha',           label: 'fecha',           required: false, hint: 'YYYY-MM-DD (vacío = hoy)' },
    { key: 'registrado_por',  label: 'registrado_por',  required: false, hint: 'Nombre o email (vacío = importacion@dupe)' },
  ],
  payments: [
    { key: 'unidad',          label: 'unidad',          required: true,  hint: 'Número de unidad exacto (ej: A-101)' },
    { key: 'numero_cuota',    label: 'numero_cuota',    required: true,  hint: 'Número de cuota (entero)' },
    { key: 'monto_pagado',    label: 'monto_pagado',    required: true,  hint: 'Número positivo' },
    { key: 'fecha_pago',      label: 'fecha_pago',      required: false, hint: 'YYYY-MM-DD (vacío = hoy)' },
    { key: 'notas',           label: 'notas',           required: false, hint: 'Observaciones opcionales' },
  ],
} as const

const SAMPLE_ROWS: Record<ImportMode, Record<string, string>[]> = {
  transactions: [
    { descripcion: 'Pago proveedor bloque A', monto: '350000', tipo: 'egreso', fecha: '2026-06-01', codigo_partida: 'CONST-001', referencia: 'CHQ-0042' },
    { descripcion: 'Cobro separación Unidad B-201', monto: '80000', tipo: 'ingreso', fecha: '2026-06-03', codigo_partida: '', referencia: 'TRF-00193' },
  ],
  executions: [
    { codigo_partida: 'CONST-001', monto: '500000', descripcion: 'Factura #F-2026-0041', fecha: '2026-06-05', registrado_por: 'jose.paulino@hcltech.com' },
    { codigo_partida: 'GAS-002', monto: '25000', descripcion: 'Honorarios notariales', fecha: '2026-06-10', registrado_por: '' },
  ],
  payments: [
    { unidad: 'A-101', numero_cuota: '3', monto_pagado: '35000', fecha_pago: '2026-06-01', notas: 'Transferencia BHD' },
    { unidad: 'B-205', numero_cuota: '1', monto_pagado: '45000', fecha_pago: '2026-05-28', notas: '' },
  ],
}

// ── Utility ───────────────────────────────────────────────────────────────────

function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Excel serial number
  const num = Number(s)
  if (!isNaN(num) && num > 1000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000))
    return d.toISOString().split('T')[0]
  }
  // Try Date parse
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

function downloadTemplate(mode: ImportMode) {
  const cols = COLS[mode]
  const header = cols.map(c => c.key)
  const hints  = cols.map(c => c.hint)
  const sample = SAMPLE_ROWS[mode]

  // Build CSV
  const lines = [
    '# Plantilla de importación DUPE — ' + MODE_META[mode].label,
    '# Elimina esta línea y la siguiente antes de subir el archivo.',
    '# ' + hints.join(' | '),
    header.join(','),
    ...sample.map(r => header.map(h => r[h] ?? '').join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `plantilla_${mode}_dupe.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateTransaction(row: Record<string, unknown>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = []
  if (!row.descripcion) errors.push('Descripción vacía')
  const monto = Number(row.monto)
  if (isNaN(monto) || monto <= 0) errors.push('Monto inválido — debe ser número positivo')
  const tipo = String(row.tipo ?? '').toLowerCase().trim()
  if (!['ingreso', 'egreso'].includes(tipo)) errors.push(`Tipo "${row.tipo}" inválido — usa "ingreso" o "egreso"`)
  if (!parseDate(row.fecha)) errors.push('Fecha inválida — usa formato YYYY-MM-DD')
  return { errors, warnings }
}

function validateExecution(row: Record<string, unknown>, partidas: PartidaKPI[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = []
  const code   = String(row.codigo_partida ?? '').trim().toUpperCase()
  const partida = partidas.find(p => p.code.toUpperCase() === code)
  if (!code) { errors.push('Código de partida vacío'); return { errors, warnings } }
  if (!partida) errors.push(`Partida "${row.codigo_partida}" no existe en este proyecto`)
  const monto = Number(row.monto)
  if (isNaN(monto) || monto <= 0) errors.push('Monto inválido — debe ser número positivo')
  if (partida && monto > 0) {
    const newPct = ((Number(partida.executed) + monto) / Number(partida.budgeted)) * 100
    if (newPct > 110) errors.push(`Excede el 110% del presupuesto — quedaría en ${newPct.toFixed(1)}% (requiere aprobación gerencial)`)
    else if (newPct > 90) warnings.push(`Alcanzaría ${newPct.toFixed(1)}% de ejecución — partida en zona de alerta`)
  }
  if (row.fecha && !parseDate(row.fecha)) warnings.push('Fecha inválida — se usará la fecha de hoy')
  return { errors, warnings }
}

function validatePayment(
  row: Record<string, unknown>,
  plans: Array<{ id: string; unit_number: string; client_name: string }>,
  installmentMap: Map<string, Array<{ id: string; number: number; status: string; amount: number }>>,
): { errors: string[]; warnings: string[]; planId?: string; installmentId?: string } {
  const errors: string[] = [], warnings: string[] = []
  const unit  = String(row.unidad ?? '').trim()
  const cuota = parseInt(String(row.numero_cuota ?? ''))
  const monto = Number(row.monto_pagado)

  if (!unit) { errors.push('Número de unidad vacío'); return { errors, warnings } }
  const plan = plans.find(p => p.unit_number.trim().toUpperCase() === unit.toUpperCase())
  if (!plan) { errors.push(`Unidad "${unit}" no tiene plan de pago activo en este proyecto`); return { errors, warnings } }

  if (isNaN(cuota) || cuota <= 0) { errors.push('Número de cuota inválido'); return { errors, warnings } }
  const installments = installmentMap.get(plan.id) ?? []
  const inst = installments.find(i => i.number === cuota)
  if (!inst) { errors.push(`Cuota #${cuota} no encontrada en el plan de unidad ${unit}`); return { errors, warnings } }
  if (inst.status === 'paid') errors.push(`Cuota #${cuota} ya está registrada como pagada`)

  if (isNaN(monto) || monto <= 0) errors.push('Monto pagado inválido')
  else if (Math.abs(monto - inst.amount) > 1) warnings.push(`Monto ${monto} difiere del plan (${inst.amount}) — se registrará como pago parcial`)
  if (row.fecha_pago && !parseDate(row.fecha_pago)) warnings.push('Fecha inválida — se usará la fecha de hoy')

  return { errors, warnings, planId: plan.id, installmentId: inst.id }
}

// ── Mode metadata ─────────────────────────────────────────────────────────────

const MODE_META: Record<ImportMode, { label: string; icon: string; desc: string; colCount: number }> = {
  transactions: { label: 'Transacciones Bancarias', icon: '💳', desc: 'Ingresos y egresos del estado de cuenta', colCount: 6 },
  executions:   { label: 'Ejecuciones Presupuestales', icon: '📊', desc: 'Gastos registrados contra partidas del presupuesto', colCount: 5 },
  payments:     { label: 'Pagos de Cuotas', icon: '🏠', desc: 'Pagos recibidos de clientes con planes de pago', colCount: 5 },
}

const STATUS_BADGE: Record<RowStatus, { cls: string; icon: React.ReactNode; label: string }> = {
  ready:    { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} />, label: 'Listo' },
  warning:  { cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertTriangle size={11} />, label: 'Advertencia' },
  error:    { cls: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle size={11} />,      label: 'Error' },
  imported: { cls: 'bg-blue-50 text-blue-700 border-blue-200',          icon: <CheckCircle2 size={11} />, label: 'Importado' },
  failed:   { cls: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle size={11} />,      label: 'Falló' },
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExcelBulkImport({ projectId, currency, partidas }: ImportProps) {
  const [mode, setMode] = useState<ImportMode>('transactions')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ ok: number; failed: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load plans for payment validation
  const { data: plans = [] } = useQuery<any[]>({
    queryKey: ['plans', projectId],
    queryFn: () => getPaymentPlans(projectId),
    enabled: !!projectId,
  })

  // ── Parse uploaded file ────────────────────────────────────────────────────

  /** Load SheetJS from CDN on first use (avoids npm install requirement). */
  const loadXLSX = (): Promise<any> => {
    if ((window as any).XLSX) return Promise.resolve((window as any).XLSX)
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = () => resolve((window as any).XLSX)
      s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel'))
      document.head.appendChild(s)
    })
  }

  const processFile = useCallback(async (file: File) => {
    setRows([]); setResults(null); setProgress(0)

    const XLSX = await loadXLSX()
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

    // For payment validation: fetch installments for each plan
    const installmentMap = new Map<string, any[]>()
    if (mode === 'payments') {
      await Promise.all(plans.map(async (p: any) => {
        try {
          const detail = await getPlanInstallments(p.id)
          installmentMap.set(p.id, detail?.installments ?? [])
        } catch { /* skip */ }
      }))
    }

    const parsed: ParsedRow[] = raw
      // Skip comment lines (rows where first cell starts with #)
      .filter(r => !String(Object.values(r)[0] ?? '').startsWith('#'))
      .map((r, i) => {
        // Normalize keys: lowercase, trim
        const row: Record<string, unknown> = {}
        Object.keys(r).forEach(k => { row[k.toLowerCase().trim()] = r[k] })

        let errors: string[] = [], warnings: string[] = []
        let extra: Record<string, string> = {}

        if (mode === 'transactions') {
          ;({ errors, warnings } = validateTransaction(row))
        } else if (mode === 'executions') {
          ;({ errors, warnings } = validateExecution(row, partidas))
        } else {
          const { errors: e, warnings: w, planId, installmentId } = validatePayment(row, plans, installmentMap)
          errors = e; warnings = w
          if (planId) extra._planId = planId
          if (installmentId) extra._installmentId = installmentId
        }

        const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ready'
        return { _rowNum: i + 2, status, errors, warnings, data: { ...row, ...extra } as Record<string, string | number> }
      })

    setRows(parsed)
  }, [mode, plans, partidas])

  const handleFile = (file: File) => { processFile(file) }

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const importable = rows.filter(r => r.status === 'ready' || r.status === 'warning')
    if (!importable.length) return

    setImporting(true)
    let ok = 0, failed = 0
    const updated = [...rows]

    for (let i = 0; i < importable.length; i++) {
      const row = importable[i]
      const idx = rows.indexOf(row)
      setProgress(Math.round(((i + 1) / importable.length) * 100))

      try {
        const api = await import('../api')
        const today = new Date().toISOString().split('T')[0]

        if (mode === 'transactions') {
          const tipo  = String(row.data.tipo ?? '').toLowerCase().trim()
          const monto = Number(row.data.monto)
          await api.createTransaction(projectId, {
            description:      String(row.data.descripcion),
            amount:           tipo === 'ingreso' ? Math.abs(monto) : -Math.abs(monto),
            transaction_date: parseDate(row.data.fecha) ?? today,
            partida_code:     String(row.data.codigo_partida || '') || undefined,
            reference:        String(row.data.referencia || '') || undefined,
          })
        } else if (mode === 'executions') {
          await api.updateBudgetExecution({
            project_id:   projectId,
            partida_code: String(row.data.codigo_partida).trim().toUpperCase(),
            amount:       Number(row.data.monto),
            description:  String(row.data.descripcion || ''),
            entered_by:   String(row.data.registrado_por || 'importacion@dupedesa.com'),
          })
        } else {
          const installmentId = String(row.data._installmentId)
          await api.registerPayment(installmentId, {
            paid_amount: Number(row.data.monto_pagado),
            paid_date:   parseDate(row.data.fecha_pago) ?? today,
            notes:       String(row.data.notas || '') || undefined,
          })
        }

        updated[idx] = { ...row, status: 'imported' }
        ok++
      } catch (err: any) {
        const msg = err?.response?.data?.detail ?? 'Error desconocido'
        updated[idx] = { ...row, status: 'failed', errors: [msg] }
        failed++
      }

      setRows([...updated])
    }

    setImporting(false)
    setResults({ ok, failed })
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const counts = rows.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc },
    {} as Record<RowStatus, number>,
  )
  const importable = (counts.ready ?? 0) + (counts.warning ?? 0)
  const cols = COLS[mode]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pt-2">

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(MODE_META) as ImportMode[]).map(m => {
          const { label, icon, desc } = MODE_META[m]
          const active = mode === m
          return (
            <button key={m} onClick={() => { setMode(m); setRows([]); setResults(null) }}
              className={`text-left p-4 rounded-2xl border transition-all ${
                active ? 'border-violet-300 bg-violet-50 shadow-md shadow-violet-100' : 'border-gray-100 bg-white hover:border-violet-200'
              }`}>
              <div className="text-xl mb-2">{icon}</div>
              <div className={`text-xs font-semibold mb-1 ${active ? 'text-violet-700' : 'text-gray-700'}`}>{label}</div>
              <div className="text-[11px] text-gray-400 leading-snug">{desc}</div>
            </button>
          )
        })}
      </div>

      {/* Column spec + template download */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-800 mb-1.5">Columnas requeridas para {MODE_META[mode].label}</p>
          <div className="flex flex-wrap gap-1.5">
            {cols.map(c => (
              <span key={c.key} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                c.required ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-blue-200 text-blue-500'
              }`}>
                {c.key}{c.required ? ' *' : ''}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-blue-500 mt-1.5">* obligatorio · Los nombres de columna deben coincidir exactamente (minúsculas)</p>
        </div>
        <button onClick={() => downloadTemplate(mode)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-xl px-3 py-2 hover:bg-blue-50 transition-all whitespace-nowrap shrink-0">
          <Download size={13} />
          Descargar plantilla CSV
        </button>
      </div>

      {/* Upload zone */}
      {rows.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
            dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40'
          }`}
        >
          <FileSpreadsheet size={36} className={`mx-auto mb-3 ${dragOver ? 'text-violet-500' : 'text-gray-300'}`} />
          <p className="text-sm font-semibold text-gray-600 mb-1">Arrastra tu archivo aquí o haz clic para seleccionar</p>
          <p className="text-xs text-gray-400">Acepta .xlsx, .xls, .csv — la primera hoja será procesada</p>
          <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'ready' as RowStatus,    label: 'Listos',        color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { key: 'warning' as RowStatus,  label: 'Advertencias',  color: 'text-amber-700 bg-amber-50 border-amber-200' },
                { key: 'error' as RowStatus,    label: 'Errores',       color: 'text-red-700 bg-red-50 border-red-200' },
                { key: 'imported' as RowStatus, label: 'Importados',    color: 'text-blue-700 bg-blue-50 border-blue-200' },
                { key: 'failed' as RowStatus,   label: 'Fallidos',      color: 'text-red-700 bg-red-50 border-red-200' },
              ].filter(s => (counts[s.key] ?? 0) > 0).map(s => (
                <span key={s.key} className={`text-xs font-semibold px-3 py-1 rounded-full border ${s.color}`}>
                  {counts[s.key]} {s.label}
                </span>
              ))}
              <span className="text-xs text-gray-400">{rows.length} filas totales</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setRows([]); setResults(null); if (fileRef.current) fileRef.current.value = '' }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 py-2 transition-all">
                <RotateCcw size={12} /> Subir otro archivo
              </button>
              {importable > 0 && !results && (
                <button onClick={handleImport} disabled={importing}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50">
                  {importing
                    ? <><Loader2 size={14} className="animate-spin" />Importando… {progress}%</>
                    : <><ChevronRight size={14} />Importar {importable} fila{importable !== 1 ? 's' : ''}</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Results banner */}
          {results && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-medium ${
              results.failed === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {results.failed === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {results.ok} fila{results.ok !== 1 ? 's' : ''} importada{results.ok !== 1 ? 's' : ''} correctamente
              {results.failed > 0 && ` · ${results.failed} fallida${results.failed !== 1 ? 's' : ''} (ver detalles en tabla)`}
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50 bg-gray-50/50">
                    <th className="px-4 py-3 text-left font-medium w-12">Fila</th>
                    <th className="px-4 py-3 text-left font-medium w-28">Estado</th>
                    {cols.map(c => (
                      <th key={c.key} className="px-4 py-3 text-left font-medium whitespace-nowrap">{c.key}</th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(row => {
                    const badge = STATUS_BADGE[row.status]
                    const issues = [...row.errors, ...row.warnings]
                    return (
                      <tr key={row._rowNum} className={`transition-colors ${
                        row.status === 'error' || row.status === 'failed' ? 'bg-red-50/30' :
                        row.status === 'warning' ? 'bg-amber-50/30' :
                        row.status === 'imported' ? 'bg-blue-50/20' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-4 py-2.5 text-gray-400 font-mono">{row._rowNum}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.icon}{badge.label}
                          </span>
                        </td>
                        {cols.map(c => (
                          <td key={c.key} className="px-4 py-2.5 text-gray-700 max-w-[160px] truncate">
                            {String(row.data[c.key] ?? '')}
                          </td>
                        ))}
                        <td className="px-4 py-2.5">
                          <div className="space-y-0.5">
                            {row.errors.map((e, i) => (
                              <div key={i} className="flex items-start gap-1 text-[11px] text-red-600">
                                <XCircle size={10} className="mt-0.5 shrink-0" />{e}
                              </div>
                            ))}
                            {row.warnings.map((w, i) => (
                              <div key={i} className="flex items-start gap-1 text-[11px] text-amber-600">
                                <AlertTriangle size={10} className="mt-0.5 shrink-0" />{w}
                              </div>
                            ))}
                            {issues.length === 0 && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
