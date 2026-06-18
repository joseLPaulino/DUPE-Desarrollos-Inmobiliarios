import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, uploadBankStatement } from '../api'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

const confidenceStyle: Record<string, string> = {
  HIGH:   'bg-green-100 text-green-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-red-100 text-red-700',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

export default function ReconciliationPage() {
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const [selectedProject, setSelectedProject] = useState<string>('')
  const projectId = selectedProject || projects?.[0]?.id || ''

  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !projectId) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await uploadBankStatement(projectId, file)
      setResult(data)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Error al procesar el archivo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Proyecto:</label>
          <select
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-purple"
            value={projectId}
            onChange={e => setSelectedProject(e.target.value)}
          >
            {(projects ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 text-sm bg-brand-purple text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          <Upload size={14} />
          {loading ? 'Procesando…' : 'Cargar Estado de Cuenta'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
      </div>

      <p className="text-xs text-amber-600">
        [A-BANK] Columnas CSV reales pendientes de muestra del banco (Banco Popular). El adaptador sintético
        genera transacciones de demo. Reemplazar <code>SyntheticBankStatementParser</code> con parser real en Día 1.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={15} className="text-green-600" />
              <span className="font-semibold text-sm text-gray-700">Resultado de Conciliación</span>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-800">{result.total_transactions ?? 0}</div>
                <div className="text-xs text-gray-500">Transacciones</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{result.matched ?? 0}</div>
                <div className="text-xs text-gray-500">Conciliadas</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">{result.unmatched ?? 0}</div>
                <div className="text-xs text-gray-500">Sin Conciliar</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-brand-purple">
                  {result.total_transactions
                    ? `${(((result.matched ?? 0) / result.total_transactions) * 100).toFixed(0)}%`
                    : '—'}
                </div>
                <div className="text-xs text-gray-500">Match Rate</div>
              </div>
            </div>
          </div>

          {/* Matches table */}
          {(result.matches ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Fecha', 'Descripción', 'Monto', 'Partida', 'Confianza', 'Score'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.matches.map((m: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{m.date ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{m.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                        {m.amount != null ? fmt(m.amount) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-purple">{m.partida_code ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${confidenceStyle[m.confidence_level] ?? 'bg-gray-100 text-gray-600'}`}>
                          {m.confidence_level ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {m.confidence_score != null ? (m.confidence_score * 100).toFixed(0) + '%' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
