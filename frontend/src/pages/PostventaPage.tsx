import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wrench, BarChart2, Shield, ClipboardList, Plus, CheckCircle, Clock, AlertCircle, ChevronRight } from 'lucide-react'
import {
  getPostventaCases, createPostventaCase, submitInspection,
  advancePostventaStatus, deliverUnit, getPostventaIndicators, getWarranties,
} from '../api'

interface DefectItem { defect: string; notes?: string }
interface InspectionArea { area: string; defects: DefectItem[]; notes?: string }
interface StatusEntry { status: string; entered_at: string; exited_at?: string; days_in_state?: number }
interface PostventaCase {
  id: string; project_id: string; client_id: string; unit_id: string
  assigned_officer: string; status: string; status_history: StatusEntry[]
  inspection_items: InspectionArea[]
  inspection_submitted_at: string | null; constructor_notified_at: string | null
  appointment_date: string | null; delivery_date: string | null
  warranty_expiry_date: string | null; notes: string | null
}
interface Indicator { status: string; count: number; avg_days: number; max_days: number }
interface Warranty { case_id: string; client_id: string; unit_id: string; delivery_date: string; warranty_expiry_date: string; days_remaining: number }

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  preinspeccion:  { label: 'Pre-inspección',  color: 'bg-gray-100 text-gray-600' },
  en_revision:    { label: 'En Revisión',      color: 'bg-blue-100 text-blue-700' },
  listo:          { label: 'Listo',            color: 'bg-green-100 text-green-700' },
  correccion:     { label: 'En Corrección',    color: 'bg-amber-100 text-amber-700' },
  entregado:      { label: 'Entregado',        color: 'bg-purple-100 text-purple-700' },
}
const STATUS_FLOW: Record<string, string[]> = {
  preinspeccion: [],
  en_revision:   ['listo', 'correccion'],
  listo:         ['entregado'],
  correccion:    ['en_revision'],
  entregado:     [],
}
const INSPECTION_AREAS = ['Sala/Comedor', 'Cocina', 'Habitación Principal', 'Habitación 2', 'Baño Principal', 'Baño Social', 'Balcón', 'Eléctrico', 'Plomería', 'Pisos', 'Paredes', 'Puertas/Ventanas']

export default function PostventaPage() {
  const [tab, setTab] = useState<'casos' | 'indicadores' | 'garantias'>('casos')
  const [selectedCase, setSelectedCase] = useState<PostventaCase | null>(null)
  const [caseTab, setCaseTab] = useState<'info' | 'inspeccion' | 'avanzar' | 'entrega'>('info')
  const [showCreate, setShowCreate] = useState(false)
  const [newCase, setNewCase] = useState({ client_id: '', project_id: '', notes: '' })
  const [statusFilter, setStatusFilter] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [advanceStatus, setAdvanceStatus] = useState('')
  const [advanceNotes, setAdvanceNotes] = useState('')
  // Inspection form
  const [inspAreas, setInspAreas] = useState<InspectionArea[]>([])
  const [inspNotes, setInspNotes] = useState('')
  const [addingArea, setAddingArea] = useState(false)
  const [newArea, setNewArea] = useState(INSPECTION_AREAS[0])
  const [newDefect, setNewDefect] = useState('')
  const [newDefectNotes, setNewDefectNotes] = useState('')
  const qc = useQueryClient()

  const { data: casesData, isLoading } = useQuery({
    queryKey: ['postventa-cases', statusFilter],
    queryFn: () => getPostventaCases(statusFilter ? { status: statusFilter } : undefined),
  })
  const cases: PostventaCase[] = casesData?.cases ?? []

  const { data: indicators } = useQuery({
    queryKey: ['postventa-indicators'],
    queryFn: () => getPostventaIndicators(),
    enabled: tab === 'indicadores',
  })

  const { data: warranties } = useQuery({
    queryKey: ['warranties'],
    queryFn: () => getWarranties(),
    enabled: tab === 'garantias',
  })

  const createMutation = useMutation({
    mutationFn: () => createPostventaCase(newCase),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['postventa-cases'] }); setShowCreate(false); setNewCase({ client_id: '', project_id: '', notes: '' }) },
  })
  const inspectionMutation = useMutation({
    mutationFn: () => submitInspection(selectedCase!.id, { areas: inspAreas, general_notes: inspNotes }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['postventa-cases'] }); setSelectedCase(data); setCaseTab('info'); setInspAreas([]) },
  })
  const advanceMutation = useMutation({
    mutationFn: () => advancePostventaStatus(selectedCase!.id, advanceStatus, advanceNotes || undefined),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['postventa-cases'] }); setSelectedCase(data); setAdvanceStatus(''); setAdvanceNotes('') },
  })
  const deliverMutation = useMutation({
    mutationFn: () => deliverUnit(selectedCase!.id, deliveryDate),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['postventa-cases'] }); setSelectedCase(data) },
  })

  const addAreaDefect = () => {
    if (!newDefect.trim()) return
    setInspAreas(prev => {
      const existing = prev.find(a => a.area === newArea)
      const defect: DefectItem = { defect: newDefect, notes: newDefectNotes || undefined }
      if (existing) {
        return prev.map(a => a.area === newArea ? { ...a, defects: [...a.defects, defect] } : a)
      }
      return [...prev, { area: newArea, defects: [defect] }]
    })
    setNewDefect(''); setNewDefectNotes('')
  }

  const openCase = (c: PostventaCase) => { setSelectedCase(c); setTab('casos'); setCaseTab('info') }
  const nextStatuses = selectedCase ? STATUS_FLOW[selectedCase.status] ?? [] : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow">
            <Wrench size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Departamento Postventa</h1>
            <p className="text-sm text-gray-500">Inspección · Seguimiento · Garantías</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedCase && (
            <button onClick={() => { setSelectedCase(null) }} className="text-sm text-violet-600 hover:text-violet-800 font-medium">← Volver</button>
          )}
          {!selectedCase && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 shadow-sm">
              <Plus size={15} />Nuevo Caso
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'casos', label: 'Casos', icon: ClipboardList },
          { key: 'indicadores', label: 'Indicadores', icon: BarChart2 },
          { key: 'garantias', label: 'Garantías', icon: Shield },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setTab(key); setSelectedCase(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── CASOS ──────────────────────────────────────────────────────────────── */}
      {tab === 'casos' && !selectedCase && (
        <div className="space-y-4">
          {showCreate && (
            <div className="bg-white rounded-xl border border-violet-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Nuevo Caso Postventa</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ID Cliente *</label>
                  <input value={newCase.client_id} onChange={e => setNewCase(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ID Proyecto *</label>
                  <input value={newCase.project_id} onChange={e => setNewCase(p => ({ ...p, project_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                  <input value={newCase.notes} onChange={e => setNewCase(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => createMutation.mutate()} disabled={!newCase.client_id || !newCase.project_id || createMutation.isPending}
                  className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                  {createMutation.isPending ? 'Creando…' : 'Crear Caso'}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}

          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!statusFilter ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              Todos ({cases.length})
            </button>
            {Object.entries(STATUS_CFG).map(([s, cfg]) => (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${statusFilter === s ? 'ring-2 ring-violet-400' : 'border-transparent'} ${cfg.color}`}>
                {cfg.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Caso','Cliente / Unidad','Oficial','Estado','Inspección','Entrega','Acción'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : cases.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay casos</td></tr>
                ) : cases.map(c => {
                  const cfg = STATUS_CFG[c.status] ?? STATUS_CFG.preinspeccion
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-500">Cliente: {c.client_id.slice(0, 8)}…</div>
                        <div className="text-xs text-gray-400">Unidad: {c.unit_id?.slice(0, 8) ?? '—'}…</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{c.assigned_officer}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {c.inspection_submitted_at ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />Enviada</span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock size={12} />Pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {c.delivery_date ? new Date(c.delivery_date).toLocaleDateString('es-DO') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openCase(c)} className="flex items-center gap-1 text-violet-600 hover:text-violet-800 text-xs font-medium">
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

      {/* ── CASE DETAIL ────────────────────────────────────────────────────────── */}
      {tab === 'casos' && selectedCase && (
        <div className="space-y-4">
          {/* Case header */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-gray-400">Caso {selectedCase.id}</p>
              <p className="font-semibold text-gray-900">Oficial: {selectedCase.assigned_officer}</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${STATUS_CFG[selectedCase.status]?.color}`}>
              {STATUS_CFG[selectedCase.status]?.label}
            </span>
          </div>

          {/* Detail sub-tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {([
              { key: 'info', label: 'Resumen' },
              { key: 'inspeccion', label: 'Inspección' },
              { key: 'avanzar', label: 'Avanzar Estado' },
              { key: 'entrega', label: 'Entrega' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setCaseTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${caseTab === key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Info tab */}
          {caseTab === 'info' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-gray-900">Hitos</h3>
                {[
                  { label: 'Inspección Enviada', val: selectedCase.inspection_submitted_at },
                  { label: 'Constructor Notificado', val: selectedCase.constructor_notified_at },
                  { label: 'Fecha de Entrega', val: selectedCase.delivery_date },
                  { label: 'Vence Garantía', val: selectedCase.warranty_expiry_date },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className={`font-medium ${val ? 'text-gray-900' : 'text-gray-300'}`}>
                      {val ? new Date(val).toLocaleDateString('es-DO') : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-gray-900">Historial de Estado</h3>
                <div className="space-y-2">
                  {(selectedCase.status_history ?? []).map((entry, i) => (
                    <div key={i} className="flex gap-2 items-start text-xs">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!entry.exited_at ? 'bg-violet-500' : 'bg-gray-300'}`} />
                      <div>
                        <span className="font-medium text-gray-700">{STATUS_CFG[entry.status]?.label ?? entry.status}</span>
                        <span className="text-gray-400 ml-2">{new Date(entry.entered_at).toLocaleDateString('es-DO')}</span>
                        {entry.days_in_state != null && <span className="text-gray-400 ml-1">({entry.days_in_state}d)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedCase.inspection_items?.length > 0 && (
                <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">Defectos Registrados</h3>
                  <div className="space-y-2">
                    {selectedCase.inspection_items.map((area, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-gray-800 mb-1">{area.area}</p>
                        {area.defects.map((d, j) => (
                          <div key={j} className="ml-3 text-xs text-gray-600">• {d.defect}{d.notes ? ` — ${d.notes}` : ''}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inspección tab */}
          {caseTab === 'inspeccion' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
              {selectedCase.inspection_submitted_at ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm text-green-700">Inspección enviada el {new Date(selectedCase.inspection_submitted_at).toLocaleDateString('es-DO')}</span>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-900">Registrar Inspección</h3>
                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <select value={newArea} onChange={e => setNewArea(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400">
                        {INSPECTION_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <input value={newDefect} onChange={e => setNewDefect(e.target.value)} placeholder="Defecto *"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                      <input value={newDefectNotes} onChange={e => setNewDefectNotes(e.target.value)} placeholder="Notas"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                      <button onClick={addAreaDefect} disabled={!newDefect.trim()}
                        className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
                        <Plus size={15} />
                      </button>
                    </div>
                    {inspAreas.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {inspAreas.map((a, i) => (
                          <div key={i} className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-800">{a.area}</p>
                            {a.defects.map((d, j) => <div key={j} className="ml-3 text-xs text-gray-600">• {d.defect}{d.notes ? ` — ${d.notes}` : ''}</div>)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notas Generales</label>
                    <input value={inspNotes} onChange={e => setInspNotes(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                  </div>
                  <button onClick={() => inspectionMutation.mutate()} disabled={inspAreas.length === 0 || inspectionMutation.isPending}
                    className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-40">
                    {inspectionMutation.isPending ? 'Enviando…' : 'Enviar Inspección'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Avanzar Estado tab */}
          {caseTab === 'avanzar' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Avanzar Estado</h3>
              {nextStatuses.length === 0 ? (
                <p className="text-sm text-gray-400">No hay transiciones disponibles desde el estado actual.</p>
              ) : (
                <>
                  <div className="flex gap-3">
                    {nextStatuses.map(s => (
                      <button key={s} onClick={() => setAdvanceStatus(s)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${advanceStatus === s ? 'ring-2 ring-violet-400' : ''} ${STATUS_CFG[s]?.color} border-transparent`}>
                        → {STATUS_CFG[s]?.label}
                      </button>
                    ))}
                  </div>
                  {advanceStatus && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                        <input value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                      </div>
                      <button onClick={() => advanceMutation.mutate()} disabled={advanceMutation.isPending}
                        className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-40">
                        {advanceMutation.isPending ? 'Avanzando…' : `Confirmar → ${STATUS_CFG[advanceStatus]?.label}`}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Entrega tab */}
          {caseTab === 'entrega' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Entrega de Unidad</h3>
              {selectedCase.delivery_date ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <CheckCircle size={16} className="text-purple-600" />
                    <span className="text-sm text-purple-700">Unidad entregada el {new Date(selectedCase.delivery_date).toLocaleDateString('es-DO')}</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Shield size={16} className="text-blue-600" />
                    <span className="text-sm text-blue-700">Garantía vence: {selectedCase.warranty_expiry_date ? new Date(selectedCase.warranty_expiry_date).toLocaleDateString('es-DO') : '—'}</span>
                  </div>
                </div>
              ) : (
                <>
                  {selectedCase.status !== 'listo' && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <AlertCircle size={16} className="text-amber-600" />
                      <span className="text-sm text-amber-700">La unidad debe estar en estado "Listo" para entregar.</span>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de Entrega</label>
                      <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400" />
                    </div>
                    <button onClick={() => deliverMutation.mutate()}
                      disabled={!deliveryDate || selectedCase.status !== 'listo' || deliverMutation.isPending}
                      className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-40">
                      {deliverMutation.isPending ? 'Registrando…' : 'Registrar Entrega'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── INDICADORES ───────────────────────────────────────────────────────── */}
      {tab === 'indicadores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {(indicators?.by_status ?? []).map((ind: Indicator) => {
              const cfg = STATUS_CFG[ind.status] ?? { label: ind.status, color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={ind.status} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-2xl font-bold text-gray-900">{ind.count}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Prom. días</p>
                      <p className="font-semibold text-gray-800">{ind.avg_days?.toFixed(1) ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Máx. días</p>
                      <p className="font-semibold text-gray-800">{ind.max_days ?? '—'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {indicators?.total_cases != null && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-sm text-gray-600">
              Total de casos activos: <strong className="text-gray-900">{indicators.total_cases}</strong>
            </div>
          )}
        </div>
      )}

      {/* ── GARANTÍAS ─────────────────────────────────────────────────────────── */}
      {tab === 'garantias' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Caso','Unidad','Fecha Entrega','Vence Garantía','Días Restantes'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(warranties?.warranties ?? []).length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">No hay garantías activas</td></tr>
              ) : (warranties?.warranties ?? []).map((w: Warranty) => (
                <tr key={w.case_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{w.case_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{w.unit_id?.slice(0, 8) ?? '—'}…</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{new Date(w.delivery_date).toLocaleDateString('es-DO')}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{new Date(w.warranty_expiry_date).toLocaleDateString('es-DO')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${w.days_remaining <= 60 ? 'bg-red-100 text-red-700' : w.days_remaining <= 120 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {w.days_remaining}d
                    </span>
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
