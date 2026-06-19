/**
 * ExcelImportPage — drag-and-drop Excel upload for DUPE financial model
 * Parses the 4-sheet DUPE Excel format and previews before committing
 */
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getCashFlow, importCashFlowExcel } from '../api'
import {
  FileSpreadsheet, Upload, CheckCircle, XCircle, ChevronDown,
  Table2, TrendingUp, Eye, Loader2, Info,
} from 'lucide-react'

interface ProjectSummary { id: string; name: string; currency: string; project_type: string }

const compact = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
  }).format(n)

const fmtMonth = (m: string) => {
  if (!m) return m
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} ${y}`
}

export default function ExcelImportPage() {
  const [projectId, setProjectId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ imported: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: () => import('../api').then(m => m.getProjects()),
  })
  const activeId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeId)
  const currency = activeProject?.currency ?? 'DOP'
  const projectType = activeProject?.project_type === 'tourist' ? 'tourist' : 'social'

  // Preview current cash flow data
  const { data: preview = [], refetch: refetchPreview } = useQuery<any[]>({
    queryKey: ['cashflow', activeId],
    queryFn: () => import('../api').then(m => m.getCashFlow(activeId!)),
    enabled: !!activeId,
  })

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      setError('Solo se aceptan archivos .xlsx')
      return
    }
    setFile(f)
    setError(null)
    setResult(null)
  }

  const handleImport = async () => {
    if (!file || !activeId) return
    setUploading(true)
    setError(null)
    try {
      const data = await importCashFlowExcel(activeId, file, projectType)
      setResult(data)
      setFile(null)
      await refetchPreview()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al importar el archivo')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const actualMonths = preview.filter(r => r.is_actual).length
  const projectedMonths = preview.filter(r => !r.is_actual).length
  const totalIncome = preview.reduce((s, r) => s + r.income, 0)
  const totalExpenses = preview.reduce((s, r) => s + r.expenses, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-sm">
            <FileSpreadsheet size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Importar Excel</h1>
            <p className="text-xs text-gray-400">Modelo financiero DUPE — formato 4 hojas</p>
          </div>
        </div>
        <div className="relative">
          <select
            value={activeId ?? ''}
            onChange={e => setProjectId(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-violet-200 w-56"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Info about format */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 flex gap-3">
        <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 leading-relaxed">
          <p className="font-semibold mb-1">Formato soportado: Modelo DUPE estándar</p>
          <p>El archivo debe contener las hojas <code className="bg-blue-100 px-1 rounded">CASH FLOW INTERES SOCIAL</code> (proyectos sociales) o <code className="bg-blue-100 px-1 rounded">CASH FLOW - TURISTICOS</code> (proyectos turísticos) con la estructura mensual estándar (INGRESOS, GASTOS, FLUJO DE CAJA, ACUMULADO).</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Upload zone */}
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-emerald-400 bg-emerald-50'
                : file
                ? 'border-violet-300 bg-violet-50'
                : 'border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/20'
            }`}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            <div className="flex flex-col items-center gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${file ? 'bg-violet-100' : isDragging ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                {file
                  ? <FileSpreadsheet size={26} className="text-violet-600" />
                  : <Upload size={26} className={isDragging ? 'text-emerald-600' : 'text-gray-400'} />
                }
              </div>
              {file ? (
                <div>
                  <p className="text-sm font-semibold text-violet-700">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB — listo para importar</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {isDragging ? 'Suelte el archivo aquí' : 'Arrastre el Excel DUPE aquí'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">o haga clic · .xlsx</p>
                </div>
              )}
            </div>
          </div>

          {/* Project type indicator */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-xs text-gray-600">Tipo de proyecto detectado:</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              projectType === 'tourist'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-violet-50 text-violet-700 border-violet-200'
            }`}>
              {projectType === 'tourist' ? '✈ Turístico (USD)' : '🏠 Interés Social (RD$)'}
            </span>
          </div>

          {file && (
            <button
              onClick={handleImport}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Importando…' : 'Importar y Reemplazar Datos'}
            </button>
          )}

          {/* Result */}
          {result && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Importación exitosa</p>
                <p className="text-xs text-emerald-600">{result.imported} meses importados</p>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <XCircle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Current data preview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Eye size={14} className="text-violet-500" /> Vista previa actual
            </h3>
            <span className="text-xs text-gray-400">{preview.length} meses</span>
          </div>
          {preview.length === 0 ? (
            <div className="p-10 text-center text-xs text-gray-400">
              Sin datos cargados para este proyecto
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-px bg-gray-100">
                {[
                  { label: 'Meses reales', val: actualMonths, color: 'text-emerald-700' },
                  { label: 'Meses proyect.', val: projectedMonths, color: 'text-violet-700' },
                  { label: 'Ingresos totales', val: compact(totalIncome, currency), color: 'text-emerald-700' },
                  { label: 'Gastos totales', val: compact(totalExpenses, currency), color: 'text-violet-700' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-white px-4 py-3">
                    <div className={`text-sm font-bold ${color}`}>{val}</div>
                    <div className="text-[11px] text-gray-400">{label}</div>
                  </div>
                ))}
              </div>
              {/* Sample rows */}
              <div className="overflow-y-auto max-h-52">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-[11px] text-gray-400">
                      {['Mes','Tipo','Ingresos','Gastos'].map(h => (
                        <th key={h} className="px-4 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.slice(0, 20).map(r => (
                      <tr key={r.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{fmtMonth(r.month)}</td>
                        <td className="px-4 py-2">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            r.is_actual ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-600 border-violet-100'
                          }`}>{r.is_actual ? 'Real' : 'Proy.'}</span>
                        </td>
                        <td className="px-4 py-2 text-emerald-700">{r.income > 0 ? compact(r.income, currency) : '—'}</td>
                        <td className="px-4 py-2 text-violet-700">{r.expenses > 0 ? compact(r.expenses, currency) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* How-to guide */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">¿Cómo actualizar los datos desde Excel?</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { step: '01', title: 'Abra el Excel', desc: 'Abra el archivo "MODELOS FINANCIEROS DUPE" en su computadora y actualice los valores de VENTAS, GASTOS u otras celdas.' },
            { step: '02', title: 'Guarde el archivo', desc: 'Guarde el archivo como .xlsx con el mismo nombre o uno nuevo. Los valores calculados se incluyen automáticamente.' },
            { step: '03', title: 'Seleccione el proyecto', desc: 'Elija el proyecto (Social o Turístico) al que corresponde el archivo. El sistema detecta el tipo automáticamente.' },
            { step: '04', title: 'Arrastre e importe', desc: 'Arrastre el archivo a la zona de carga y presione "Importar". Los datos del flujo de caja se actualizarán al instante.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-xs font-black text-violet-700 flex-shrink-0">{step}</div>
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-0.5">{title}</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
