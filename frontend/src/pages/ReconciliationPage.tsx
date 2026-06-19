import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, uploadBankStatement } from '../api'
import { FileSearch, Upload, CheckCircle, XCircle, Clock, AlertTriangle, FileText, ChevronDown } from 'lucide-react'

interface ProjectSummary { id: string; name: string; currency: string }

interface ReconciliationResult {
  total_transactions: number
  matched: number
  unmatched: number
  summary: Array<{
    transaction_id: string
    amount: number
    description: string
    status: 'matched' | 'unmatched' | 'pending'
    matched_partida?: string
    confidence?: number
  }>
}

const fmtDOP = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

export default function ReconciliationPage() {
  const [projectId, setProjectId] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ReconciliationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const { getProjects } = await import('../api'); return getProjects() },
  })

  const activeId = projectId || projects[0]?.id

  const handleFile = async (file: File) => {
    if (!activeId) return
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const data = await uploadBankStatement(activeId, file)
      setResult(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al procesar el extracto')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-5">
      {/* Project selector */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={activeId}
            onChange={e => setProjectId(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-violet-200"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <p className="text-xs text-gray-400">
          Cargue el extracto bancario descargado desde el portal de netbanking (CSV/TXT)
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-violet-400 bg-violet-50'
            : 'border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
              <FileSearch size={24} className="text-violet-500 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-700">Procesando extracto…</p>
              <p className="text-xs text-gray-400 mt-1">El agente está conciliando transacciones</p>
            </div>
            <div className="w-48 h-1.5 bg-violet-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDragging ? 'bg-violet-200' : 'bg-gray-100'}`}>
              <Upload size={24} className={isDragging ? 'text-violet-600' : 'text-gray-400'} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {isDragging ? 'Suelte el archivo aquí' : 'Arrastre el extracto bancario aquí'}
              </p>
              <p className="text-xs text-gray-400 mt-1">o haga clic para seleccionar · CSV / TXT del banco</p>
            </div>
            <div className="flex gap-2 mt-1">
              {['BHD León', 'Banco Popular', 'Banreservas', 'Scotiabank'].map(b => (
                <span key={b} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{b}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <ResultCard icon={FileText}    label="Total transacciones"  value={result.total_transactions}  color="bg-blue-600" />
            <ResultCard icon={CheckCircle} label="Conciliadas"          value={result.matched}             color="bg-emerald-600" />
            <ResultCard icon={AlertTriangle} label="Sin conciliar"      value={result.unmatched}           color={result.unmatched > 0 ? 'bg-amber-500' : 'bg-emerald-600'} />
          </div>

          {/* Match rate */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">Tasa de conciliación</span>
              <span className="text-lg font-bold text-violet-700">
                {result.total_transactions > 0
                  ? Math.round(result.matched / result.total_transactions * 100)
                  : 0}%
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full transition-all"
                style={{
                  width: `${result.total_transactions > 0 ? Math.round(result.matched / result.total_transactions * 100) : 0}%`
                }}
              />
            </div>
          </div>

          {/* Transaction table */}
          {result.summary && result.summary.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Detalle de Transacciones</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                    {['ID','Descripción','Monto','Partida','Confianza','Estado'].map(h => (
                      <th key={h} className="px-6 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.summary.map(t => (
                    <tr key={t.transaction_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="text-xs font-mono text-gray-500">{t.transaction_id.slice(0,8)}…</span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-700 max-w-[200px] truncate">{t.description}</td>
                      <td className="px-6 py-3.5 text-xs font-medium text-gray-800">{fmtDOP(t.amount)}</td>
                      <td className="px-6 py-3.5 text-xs text-violet-600">{t.matched_partida ?? '—'}</td>
                      <td className="px-6 py-3.5">
                        {t.confidence != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${t.confidence * 100}%`,
                                  backgroundColor: t.confidence > 0.8 ? '#10b981' : t.confidence > 0.5 ? '#f59e0b' : '#ef4444'
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{Math.round(t.confidence * 100)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info box when no result */}
      {!result && !uploading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">¿Cómo funciona la conciliación?</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { step: '01', title: 'Descargue el extracto', desc: 'Descargue el CSV/TXT desde el portal de su banco (BHD, Popular, Banreservas).' },
              { step: '02', title: 'Cargue el archivo',     desc: 'Arrastre o seleccione el archivo. El agente procesa automáticamente.' },
              { step: '03', title: 'Revise y apruebe',      desc: 'El agente propone la partida. Usted confirma o reasigna con un clic.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-black text-violet-700 flex-shrink-0">{step}</div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">{title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: React.ElementType }> = {
    matched:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Conciliada',    icon: CheckCircle },
    unmatched: { cls: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Sin conciliar', icon: AlertTriangle },
    pending:   { cls: 'bg-gray-50 text-gray-600 border-gray-200',          label: 'Pendiente',     icon: Clock },
  }
  const cfg = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      <cfg.icon size={10} />
      {cfg.label}
    </span>
  )
}
