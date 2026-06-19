import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, FileCheck, Calendar, Landmark, ChevronRight, CheckCircle, Clock, AlertCircle, Plus } from 'lucide-react'
import {
  getGestionCases, createGestionCase, updateGestionDocuments,
  generateContract, setGestionAppointment, advanceFiduciaria, getOfficerAvailability,
} from '../api'

interface DocStatus { cedula: string; carta_trabajo: string; movimientos_bancarios: string; certificacion_vivienda: string }
interface FiduciariaEntry { status: string; entered_at: string; exited_at: string | null; days_in_state: number | null; notes?: string }
interface GestionCase {
  id: string; project_id: string; client_id: string; unit_id: string
  assigned_officer: string; assigned_at: string
  doc_cedula: string; doc_carta_trabajo: string; doc_movimientos_bancarios: string; doc_certificacion_vivienda: string
  fiduciaria_status: string; fiduciaria_history: FiduciariaEntry[]
  contract_generated_at: string | null; appointment_date: string | null; appointment_time: string | null
  notes: string | null
}

const DOC_LABELS: Record<keyof DocStatus, string> = {
  cedula: 'Cédula', carta_trabajo: 'Carta de Trabajo',
  movimientos_bancarios: 'Movimientos Bancarios', certificacion_vivienda: 'Certificación de Vivienda',
}
const FID_LABELS: Record<string, string> = {
  recoleccion_firma: 'Recolección de Firma',
  enviado_fiduciaria: 'Enviado a Fiduciaria',
  cliente_vinculado: 'Cliente Vinculado',
}
const FID_FLOW: Record<string, string | null> = {
  recoleccion_firma: 'enviado_fiduciaria',
  enviado_fiduciaria: 'cliente_vinculado',
  cliente_vinculado: null,
}
const FID_COLOR: Record<string, string> = {
  recoleccion_firma: 'bg-yellow-100 text-yellow-700',
  enviado_fiduciaria: 'bg-blue-100 text-blue-700',
  cliente_vinculado: 'bg-green-100 text-green-700',
}
const DOC_COLOR = { recibido: 'bg-green-100 text-green-700', pendiente: 'bg-gray-100 text-gray-500' }

export default function GestionPage() {
  const [tab, setTab] = useState<'bandeja' | 'detalle'>('bandeja')
  const [selectedCase, setSelectedCase] = useState<GestionCase | null>(null)
  const [detailTab, setDetailTab] = useState<'docs' | 'contrato' | 'fiduciaria'>('docs')
  const [showCreate, setShowCreate] = useState(false)
  const [newCase, setNewCase] = useState({ client_id: '', project_id: '', notes: '' })
  const [fidNotes, setFidNotes] = useState('')
  const [apptDate, setApptDate] = useState('')
  const [apptTime, setApptTime] = useState('09:00')
  const qc = useQueryClient()

  const { data: casesData, isLoading } = useQuery({
    queryKey: ['gestion-cases'],
    queryFn: () => getGestionCases(),
  })
  const cases: GestionCase[] = casesData?.cases ?? []

  const { data: availability } = useQuery({
    queryKey: ['availability', selectedCase?.assigned_officer],
    queryFn: () => getOfficerAvailability(selectedCase!.assigned_officer),
    enabled: !!selectedCase && detailTab === 'contrato',
  })

  const createMutation = useMutation({
    mutationFn: () => createGestionCase(newCase),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gestion-cases'] }); setShowCreate(false); setNewCase({ client_id: '', project_id: '', notes: '' }) },
  })
  const docMutation = useMutation({
    mutationFn: (docs: Partial<DocStatus>) => updateGestionDocuments(selectedCase!.id, docs),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['gestion-cases'] }); setSelectedCase(data) },
  })
  const contractMutation = useMutation({
    mutationFn: () => generateContract(selectedCase!.id),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['gestion-cases'] }); setSelectedCase(data) },
  })
  const apptMutation = useMutation({
    mutationFn: () => setGestionAppointment(selectedCase!.id, apptDate, apptTime),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['gestion-cases'] }); setSelectedCase(data) },
  })
  const fidMutation = useMutation({
    mutationFn: (status: string) => advanceFiduciaria(selectedCase!.id, status, fidNotes || undefined),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['gestion-cases'] }); setSelectedCase(data); setFidNotes('') },
  })

  const openCase = (c: GestionCase) => { setSelectedCase(c); setTab('detalle'); setDetailTab('docs') }

  const docsComplete = (c: GestionCase) =>
    [c.doc_cedula, c.doc_carta_trabajo, c.doc_movimientos_bancarios, c.doc_certificacion_vivienda].every(d => d === 'recibido')

  const byStatus = (status: string) => cases.filter(c => c.fiduciaria_status === status).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow">
            <FolderOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Departamento de Gestión</h1>
            <p className="text-sm text-gray-500">Documentación · Contratos · Vinculación Fiduciaria</p>
          </div>
        </div>
        {tab === 'bandeja' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 shadow-sm">
            <Plus size={15} />Nuevo Caso
          </button>
        )}
        {tab === 'detalle' && (
          <button onClick={() => setTab('bandeja')} className="text-sm text-teal-600 hover:text-teal-800 font-medium">← Volver a bandeja</button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(FID_LABELS).map(([key, label]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${FID_COLOR[key]}`}>{byStatus(key)}</span>
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
        ))}
      </div>

      {/* ── BANDEJA ─────────────────────────────────────────────────────────────── */}
      {tab === 'bandeja' && (
        <div className="space-y-4">
          {showCreate && (
            <div className="bg-white rounded-xl border border-teal-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Nuevo Caso de Gestión</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ID del Cliente *</label>
                  <input value={newCase.client_id} onChange={e => setNewCase(p => ({ ...p, client_id: e.target.value }))}
                    placeholder="UUID del cliente" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ID del Proyecto *</label>
                  <input value={newCase.project_id} onChange={e => setNewCase(p => ({ ...p, project_id: e.target.value }))}
                    placeholder="UUID del proyecto" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                  <input value={newCase.notes} onChange={e => setNewCase(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => createMutation.mutate()} disabled={!newCase.client_id || !newCase.project_id || createMutation.isPending}
                  className="px-5 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50">
                  {createMutation.isPending ? 'Creando…' : 'Crear Caso'}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Caso','Oficial Asignado','Documentos','Estado Fiduciaria','Contrato','Acción'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : cases.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No hay casos</td></tr>
                ) : cases.map(c => {
                  const totalDocs = 4
                  const receivedDocs = [c.doc_cedula, c.doc_carta_trabajo, c.doc_movimientos_bancarios, c.doc_certificacion_vivienda].filter(d => d === 'recibido').length
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-gray-500">{c.id.slice(0, 8)}…</div>
                        <div className="text-xs text-gray-400">Cliente: {c.client_id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{c.assigned_officer}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(receivedDocs / totalDocs) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{receivedDocs}/{totalDocs}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${FID_COLOR[c.fiduciaria_status] || 'bg-gray-100 text-gray-500'}`}>
                          {FID_LABELS[c.fiduciaria_status] ?? c.fiduciaria_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.contract_generated_at ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />Generado</span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock size={12} />Pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openCase(c)}
                          className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs font-medium">
                          Gestionar <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETALLE ─────────────────────────────────────────────────────────────── */}
      {tab === 'detalle' && selectedCase && (
        <div className="space-y-4">
          {/* Case header */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-mono">Caso {selectedCase.id}</p>
              <p className="font-semibold text-gray-900">Oficial: {selectedCase.assigned_officer}</p>
              <p className="text-xs text-gray-500">Cliente: {selectedCase.client_id}</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${FID_COLOR[selectedCase.fiduciaria_status]}`}>
              {FID_LABELS[selectedCase.fiduciaria_status]}
            </span>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {([
              { key: 'docs', label: 'Documentos', icon: FileCheck },
              { key: 'contrato', label: 'Contrato & Cita', icon: Calendar },
              { key: 'fiduciaria', label: 'Fiduciaria', icon: Landmark },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setDetailTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${detailTab === key ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          {/* Documents tab */}
          {detailTab === 'docs' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 mb-4">Estado de Documentos</h3>
              {(Object.keys(DOC_LABELS) as Array<keyof DocStatus>).map(key => {
                const fieldKey = `doc_${key}` as keyof GestionCase
                const currentStatus = selectedCase[fieldKey] as string
                const isReceived = currentStatus === 'recibido'
                return (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      {isReceived ? <CheckCircle size={16} className="text-green-500" /> : <Clock size={16} className="text-gray-400" />}
                      <span className="text-sm font-medium text-gray-700">{DOC_LABELS[key]}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isReceived ? DOC_COLOR.recibido : DOC_COLOR.pendiente}`}>
                        {isReceived ? 'Recibido' : 'Pendiente'}
                      </span>
                      <button
                        onClick={() => docMutation.mutate({ [key]: isReceived ? 'pendiente' : 'recibido' })}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${isReceived ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-teal-50 text-teal-600 hover:bg-teal-100'}`}>
                        {isReceived ? 'Revertir' : 'Marcar Recibido'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {docsComplete(selectedCase) && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm text-green-700 font-medium">Todos los documentos recibidos. Puede proceder al contrato.</span>
                </div>
              )}
            </div>
          )}

          {/* Contrato & Cita tab */}
          {detailTab === 'contrato' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-gray-900">Generación de Contrato</h3>
                {selectedCase.contract_generated_at ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="text-sm text-green-700">Contrato generado el {new Date(selectedCase.contract_generated_at).toLocaleDateString('es-DO')}</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!docsComplete(selectedCase) && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <AlertCircle size={16} className="text-amber-600" />
                        <span className="text-sm text-amber-700">Faltan documentos por recibir antes de generar el contrato.</span>
                      </div>
                    )}
                    <button onClick={() => contractMutation.mutate()} disabled={!docsComplete(selectedCase) || contractMutation.isPending}
                      className="px-5 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-40">
                      {contractMutation.isPending ? 'Generando…' : 'Generar Contrato'}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                <h3 className="font-semibold text-gray-900">Programar Cita</h3>
                {selectedCase.appointment_date ? (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Calendar size={16} className="text-blue-600" />
                    <span className="text-sm text-blue-700">Cita: {selectedCase.appointment_date} a las {selectedCase.appointment_time}</span>
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                    <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Hora</label>
                    <select value={apptTime} onChange={e => setApptTime(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400">
                      {['09:00','11:00','14:00','16:00'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => apptMutation.mutate()} disabled={!apptDate || apptMutation.isPending}
                      className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-40">
                      {apptMutation.isPending ? 'Guardando…' : 'Programar'}
                    </button>
                  </div>
                </div>
                {availability?.slots && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2">Próximos slots disponibles para {selectedCase.assigned_officer}:</p>
                    <div className="flex gap-2 flex-wrap">
                      {availability.slots.map((slot: { date: string; time: string }) => (
                        <button key={`${slot.date}-${slot.time}`}
                          onClick={() => { setApptDate(slot.date); setApptTime(slot.time) }}
                          className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium hover:bg-teal-100 border border-teal-200">
                          {slot.date} {slot.time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fiduciaria tab */}
          {detailTab === 'fiduciaria' && (
            <div className="space-y-4">
              {/* State machine visual */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Estado Fiduciaria</h3>
                <div className="flex items-center gap-4">
                  {Object.entries(FID_LABELS).map(([key, label], idx, arr) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className={`flex flex-col items-center gap-1`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          key === selectedCase.fiduciaria_status ? FID_COLOR[key] :
                          Object.keys(FID_LABELS).indexOf(key) < Object.keys(FID_LABELS).indexOf(selectedCase.fiduciaria_status) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>{idx + 1}</div>
                        <span className="text-xs text-center text-gray-600 max-w-20 leading-tight">{label}</span>
                      </div>
                      {idx < arr.length - 1 && <ChevronRight size={16} className="text-gray-300 mt-[-12px]" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Advance button */}
              {FID_FLOW[selectedCase.fiduciaria_status] && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                  <h3 className="font-semibold text-gray-900">Avanzar Estado</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
                    <input value={fidNotes} onChange={e => setFidNotes(e.target.value)} placeholder="Observaciones del avance"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <button onClick={() => fidMutation.mutate(FID_FLOW[selectedCase.fiduciaria_status]!)}
                    disabled={fidMutation.isPending}
                    className="px-5 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-40">
                    {fidMutation.isPending ? 'Avanzando…' : `→ ${FID_LABELS[FID_FLOW[selectedCase.fiduciaria_status]!]}`}
                  </button>
                </div>
              )}

              {/* History timeline */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Historial</h3>
                <div className="space-y-3">
                  {(selectedCase.fiduciaria_history ?? []).map((entry, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${entry.exited_at ? 'bg-gray-300' : 'bg-teal-500'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{FID_LABELS[entry.status] ?? entry.status}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(entry.entered_at).toLocaleDateString('es-DO')}
                          {entry.exited_at && ` → ${new Date(entry.exited_at).toLocaleDateString('es-DO')}`}
                          {entry.days_in_state != null && ` (${entry.days_in_state}d)`}
                        </p>
                        {entry.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{entry.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
