import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, CheckCircle,
  XCircle, Clock, MapPin, User, Filter, X,
} from 'lucide-react'
import { getCalendarEvents, createCalendarEvent, updateCalendarEventStatus, deleteCalendarEvent } from '../api'

interface CalEvent {
  id: string; title: string; description: string; event_type: string
  project_id: string | null; related_client_id: string | null
  responsible_officer: string; event_date: string; start_time: string; end_time: string | null
  status: string; location: string; notes: string
}

// ── Event type config ─────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { label: string; color: string; dot: string; icon: string }> = {
  gestion_appointment:  { label: 'Cita Gestión',       color: 'bg-teal-100 text-teal-800 border-teal-300',    dot: 'bg-teal-500',    icon: '📋' },
  postventa_inspection: { label: 'Inspección PV',      color: 'bg-blue-100 text-blue-800 border-blue-300',    dot: 'bg-blue-500',    icon: '🔍' },
  postventa_delivery:   { label: 'Entrega',            color: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500', icon: '🏠' },
  comercial_visit:      { label: 'Visita Comercial',   color: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500', icon: '🤝' },
  cobros_followup:      { label: 'Seguimiento Cobros', color: 'bg-red-100 text-red-800 border-red-300',        dot: 'bg-red-500',     icon: '💳' },
  internal_meeting:     { label: 'Reunión Interna',    color: 'bg-gray-100 text-gray-700 border-gray-300',     dot: 'bg-gray-500',    icon: '👥' },
  other:                { label: 'Otro',               color: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500', icon: '📌' },
}
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  scheduled:   { label: 'Programado',   color: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Completado',   color: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelado',    color: 'bg-red-100 text-red-600' },
  rescheduled: { label: 'Reprogramado', color: 'bg-amber-100 text-amber-700' },
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const grid: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(year, month, d))
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

const EMPTY_FORM = {
  title: '', description: '', event_type: 'gestion_appointment',
  event_date: isoDate(new Date()), start_time: '09:00', end_time: '',
  location: '', responsible_officer: '', notes: '',
}

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const qc = useQueryClient()

  // Date range for query
  const fromDate = isoDate(new Date(year, month, 1))
  const toDate = isoDate(new Date(year, month + 1, 0))

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', year, month, filterType, filterStatus],
    queryFn: () => getCalendarEvents({
      from_date: fromDate, to_date: toDate,
      ...(filterType ? { event_type: filterType } : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
    }),
  })
  const events: CalEvent[] = data?.events ?? []
  const byDate: Record<string, CalEvent[]> = data?.by_date ?? {}

  const createMut = useMutation({
    mutationFn: () => createCalendarEvent({
      ...form,
      end_time: form.end_time || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
    },
  })
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateCalendarEventStatus(id, status),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      setSelectedEvent(data)
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCalendarEvent(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); setSelectedEvent(null) },
  })

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const grid = useMemo(() => monthGrid(year, month), [year, month])

  // Week view: show 7 days from today (or selected date)
  const weekStart = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date(year, month, 1)
    const dow = base.getDay()
    const start = new Date(base)
    start.setDate(base.getDate() - dow)
    return start
  }, [selectedDate, year, month])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
  }, [weekStart])

  const upcomingEvents = events
    .filter(e => e.event_date >= isoDate(today) && e.status === 'scheduled')
    .slice(0, 8)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-700 flex items-center justify-center shadow">
            <CalendarDays size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Calendario de Negocio</h1>
            <p className="text-sm text-gray-500">Gestión · Postventa · Comercial · Cobros · Reuniones</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {v === 'month' ? 'Mes' : 'Semana'}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, event_date: isoDate(today) }) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm">
            <Plus size={15} />Nuevo Evento
          </button>
        </div>
      </div>

      {/* Event type legend */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(TYPE_CFG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFilterType(filterType === key ? '' : key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${filterType === key ? 'ring-2 ring-indigo-400 ring-offset-1' : ''} ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </button>
        ))}
        {(filterType || filterStatus) && (
          <button onClick={() => { setFilterType(''); setFilterStatus('') }}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200">
            <X size={10} />Limpiar filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-5">
        {/* ── Calendar grid / week view ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <h2 className="font-semibold text-gray-900 text-base">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          {view === 'month' ? (
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DAY_NAMES.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div className="grid grid-cols-7">
                {grid.map((cellDate, idx) => {
                  const iso = cellDate ? isoDate(cellDate) : ''
                  const cellEvents = iso ? (byDate[iso] ?? []) : []
                  const isToday = iso === isoDate(today)
                  const isSelected = iso === selectedDate
                  return (
                    <div key={idx}
                      onClick={() => cellDate && setSelectedDate(iso === selectedDate ? null : iso)}
                      className={`min-h-[80px] p-1.5 border-r border-b border-gray-100 cursor-pointer transition-all
                        ${!cellDate ? 'bg-gray-50/50 cursor-default' : 'hover:bg-indigo-50/40'}
                        ${isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : ''}`}>
                      {cellDate && (
                        <>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>
                            {cellDate.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {cellEvents.slice(0, 3).map(ev => {
                              const tcfg = TYPE_CFG[ev.event_type] ?? TYPE_CFG.other
                              return (
                                <div key={ev.id} onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                                  className={`text-xs px-1.5 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 font-medium ${tcfg.color} ${ev.status === 'completed' ? 'opacity-50 line-through' : ''} ${ev.status === 'cancelled' ? 'opacity-40 line-through' : ''}`}>
                                  {ev.start_time} {ev.title}
                                </div>
                              )
                            })}
                            {cellEvents.length > 3 && (
                              <div className="text-xs text-indigo-600 font-medium px-1">+{cellEvents.length - 3} más</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            // Week view
            <div>
              <div className="grid grid-cols-7 border-b border-gray-100">
                {weekDays.map(d => {
                  const iso = isoDate(d)
                  const isToday = iso === isoDate(today)
                  return (
                    <div key={iso} className={`py-3 text-center border-r border-gray-100 last:border-0 ${isToday ? 'bg-indigo-50' : ''}`}>
                      <p className="text-xs text-gray-400 uppercase font-medium">{DAY_NAMES[d.getDay()]}</p>
                      <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-indigo-600' : 'text-gray-800'}`}>{d.getDate()}</p>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-7 min-h-[400px]">
                {weekDays.map(d => {
                  const iso = isoDate(d)
                  const dayEvs = byDate[iso] ?? []
                  return (
                    <div key={iso} className="border-r border-gray-100 last:border-0 p-1.5 space-y-1">
                      {dayEvs.map(ev => {
                        const tcfg = TYPE_CFG[ev.event_type] ?? TYPE_CFG.other
                        return (
                          <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                            className={`text-xs px-2 py-1.5 rounded-lg border cursor-pointer hover:opacity-80 ${tcfg.color} ${ev.status === 'completed' ? 'opacity-50' : ''}`}>
                            <div className="font-semibold">{ev.start_time}</div>
                            <div className="truncate leading-tight">{ev.title}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Side panel ────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Event detail panel */}
          {selectedEvent ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TYPE_CFG[selectedEvent.event_type]?.icon ?? '📌'}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm leading-tight">{selectedEvent.title}</p>
                    <p className="text-xs text-gray-400">{TYPE_CFG[selectedEvent.event_type]?.label}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <CalendarDays size={13} className="text-gray-400" />
                  <span>{new Date(selectedEvent.event_date + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock size={13} className="text-gray-400" />
                  <span>{selectedEvent.start_time}{selectedEvent.end_time ? ` – ${selectedEvent.end_time}` : ''}</span>
                </div>
                {selectedEvent.location && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={13} className="text-gray-400" />
                    <span className="text-xs">{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.responsible_officer && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User size={13} className="text-gray-400" />
                    <span className="text-xs">{selectedEvent.responsible_officer}</span>
                  </div>
                )}
              </div>

              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CFG[selectedEvent.status]?.color}`}>
                {STATUS_CFG[selectedEvent.status]?.label}
              </span>

              {selectedEvent.description && (
                <p className="text-xs text-gray-500 border-t border-gray-100 pt-2 leading-relaxed">{selectedEvent.description}</p>
              )}
              {selectedEvent.notes && (
                <p className="text-xs text-gray-400 italic">{selectedEvent.notes}</p>
              )}

              {selectedEvent.status === 'scheduled' && (
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <button onClick={() => statusMut.mutate({ id: selectedEvent.id, status: 'completed' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 border border-green-200">
                    <CheckCircle size={13} />Completar
                  </button>
                  <button onClick={() => statusMut.mutate({ id: selectedEvent.id, status: 'cancelled' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 border border-red-200">
                    <XCircle size={13} />Cancelar
                  </button>
                </div>
              )}
              <button onClick={() => deleteMut.mutate(selectedEvent.id)}
                className="w-full text-xs text-gray-300 hover:text-red-500 text-center pt-1">
                Eliminar evento
              </button>
            </div>
          ) : selectedDate ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-semibold text-gray-800 text-sm mb-3">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {(byDate[selectedDate] ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No hay eventos. <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, event_date: selectedDate })) }} className="text-indigo-600 hover:underline">Crear uno</button></p>
              ) : (byDate[selectedDate] ?? []).map(ev => {
                const tcfg = TYPE_CFG[ev.event_type] ?? TYPE_CFG.other
                return (
                  <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                    className={`mb-2 p-2.5 rounded-lg border cursor-pointer hover:opacity-80 ${tcfg.color}`}>
                    <p className="font-medium text-xs">{ev.start_time} — {ev.title}</p>
                    <p className="text-xs opacity-70 mt-0.5">{ev.responsible_officer}</p>
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Upcoming events */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Próximos Eventos</h3>
            {isLoading ? <p className="text-xs text-gray-400">Cargando…</p>
              : upcomingEvents.length === 0 ? <p className="text-xs text-gray-400">Sin eventos programados</p>
              : upcomingEvents.map(ev => {
                const tcfg = TYPE_CFG[ev.event_type] ?? TYPE_CFG.other
                const evDate = new Date(ev.event_date + 'T00:00:00')
                const isToday2 = ev.event_date === isoDate(today)
                const isTomorrow = ev.event_date === isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
                const dayLabel = isToday2 ? 'Hoy' : isTomorrow ? 'Mañana' : evDate.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' })
                return (
                  <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                    className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${tcfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{ev.title}</p>
                      <p className="text-xs text-gray-400">{dayLabel} · {ev.start_time}</p>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* ── Create event modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Nuevo Evento</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo *</label>
                <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400">
                  {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha *</label>
                  <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Responsable</label>
                <input value={form.responsible_officer} onChange={e => setForm(f => ({ ...f, responsible_officer: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Lugar</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => createMut.mutate()} disabled={!form.title || !form.event_date || createMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
                {createMut.isPending ? 'Creando…' : 'Crear Evento'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
