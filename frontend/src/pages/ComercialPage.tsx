import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, Users, Building2, Plus, Star, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react'
import { getProjects, getLeads, createLead, updateLeadStatus, getInventory, toggleUnitStatus } from '../api'

interface Project { id: string; name: string; currency: string }
interface Lead {
  id: string; full_name: string; phone: string; email: string
  source: string; status: string; qualification_score: number
  assigned_seller: string; notes: string; created_at: string
}
interface Unit {
  id: string; unit_number: string; floor: number; area_sqm: number
  list_price: number; status: string; is_sold: boolean; client_id: string | null
}

const fmtMoney = (n: number, currency = 'DOP') =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const STATUS_CFG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  nuevo:       { label: 'Nuevo',       color: 'bg-gray-100 text-gray-600',    icon: Clock },
  contactado:  { label: 'Contactado',  color: 'bg-blue-100 text-blue-700',    icon: Clock },
  calificado:  { label: 'Calificado',  color: 'bg-purple-100 text-purple-700', icon: Star },
  reservado:   { label: 'Reservado',   color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  descartado:  { label: 'Descartado',  color: 'bg-red-100 text-red-600',      icon: XCircle },
}
const SOURCES = ['facebook', 'instagram', 'referido', 'portal', 'evento', 'otro']
const today = new Date().toISOString().slice(0, 10)

export default function ComercialPage() {
  const [tab, setTab] = useState<'leads' | 'inventario'>('leads')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    source: 'facebook', notes: '', qualification_score: 0,
  })
  const qc = useQueryClient()

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects-list'], queryFn: () => import('../api').then(m => m.getProjects()) })
  const activeId = projectId || projects[0]?.id || ''
  const currency = projects.find(p => p.id === activeId)?.currency === 'USD' ? 'USD' : 'DOP'

  const { data: leadsData, isLoading: loadingLeads } = useQuery({
    queryKey: ['leads', activeId, statusFilter],
    queryFn: () => getLeads(activeId, statusFilter ? { status: statusFilter } : undefined),
    enabled: !!activeId,
  })
  const leads: Lead[] = leadsData?.leads ?? []
  const byStatus: Record<string, number> = leadsData?.by_status ?? {}

  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: ['inventory', activeId, showAll],
    queryFn: () => getInventory(activeId, !showAll),
    enabled: !!activeId && tab === 'inventario',
  })
  const units: Unit[] = inventoryData?.units ?? []

  const createMutation = useMutation({
    mutationFn: () => createLead(activeId, { ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads', activeId] }); setShowForm(false); setForm({ first_name: '', last_name: '', phone: '', email: '', source: 'facebook', notes: '', qualification_score: 0 }) },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLeadStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', activeId] }),
  })
  const unitMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'VENDIDO' | 'DISPONIBLE' }) => toggleUnitStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', activeId] }),
  })

  const STATUS_FLOW: Record<string, string | null> = {
    nuevo: 'contactado', contactado: 'calificado', calificado: 'reservado', reservado: null, descartado: null,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shadow">
            <ShoppingBag size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Departamento Comercial</h1>
            <p className="text-sm text-gray-500">Leads · Inventario · Reservas</p>
          </div>
        </div>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:ring-2 focus:ring-orange-400">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([{ key: 'leads', label: 'Leads', icon: Users }, { key: 'inventario', label: 'Inventario', icon: Building2 }] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── LEADS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'leads' && (
        <div className="space-y-4">
          {/* KPI chips */}
          <div className="flex gap-3 flex-wrap">
            {Object.entries(STATUS_CFG).map(([s, cfg]) => (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${statusFilter === s ? 'ring-2 ring-offset-1 ring-orange-400' : ''} ${cfg.color} border-transparent`}>
                <cfg.icon size={13} />
                {cfg.label}
                <span className="font-bold">{byStatus[s] ?? 0}</span>
              </button>
            ))}
            <button onClick={() => setStatusFilter('')}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${statusFilter === '' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200'}`}>
              Todos · {leadsData?.total ?? 0}
            </button>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 shadow-sm">
              <Plus size={15} />Nuevo Lead
            </button>
          </div>

          {showForm && (
            <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">Registrar Lead</h3>
              <div className="grid grid-cols-3 gap-4">
                {[['first_name','Nombre *','text'],['last_name','Apellido *','text'],['phone','Teléfono','tel'],['email','Email','email']].map(([f,l,t]) => (
                  <div key={f}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{l}</label>
                    <input type={t} value={(form as any)[f]} onChange={e => setForm(prev => ({ ...prev, [f]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fuente</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400">
                    {SOURCES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Calificación (0-5)</label>
                  <input type="number" min={0} max={5} value={form.qualification_score}
                    onChange={e => setForm(f => ({ ...f, qualification_score: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => createMutation.mutate()} disabled={!form.first_name || !form.last_name || createMutation.isPending}
                  className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                  {createMutation.isPending ? 'Guardando…' : 'Crear Lead'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Lead','Contacto','Fuente','Vendedor','Calificación','Estado','Acción'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingLeads ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay leads</td></tr>
                ) : leads.map(lead => {
                  const cfg = STATUS_CFG[lead.status] || STATUS_CFG.nuevo
                  const next = STATUS_FLOW[lead.status]
                  const nextCfg = next ? STATUS_CFG[next] : null
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{lead.full_name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        <div className="text-xs">{lead.phone}</div>
                        <div className="text-xs">{lead.email}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600">{lead.source}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{lead.assigned_seller}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} size={12} className={n <= lead.qualification_score ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {next && nextCfg && (
                          <button onClick={() => statusMutation.mutate({ id: lead.id, status: next })}
                            className={`text-xs px-2 py-1 rounded font-medium ${nextCfg.color} border border-transparent hover:ring-1 hover:ring-gray-300`}>
                            → {nextCfg.label}
                          </button>
                        )}
                        {lead.status === 'calificado' && (
                          <button onClick={() => statusMutation.mutate({ id: lead.id, status: 'descartado' })}
                            className="ml-1 text-xs text-red-400 hover:text-red-600">Descartar</button>
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

      {/* ── INVENTARIO TAB ─────────────────────────────────────────────────────── */}
      {tab === 'inventario' && (
        <div className="space-y-4">
          {inventoryData && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Unidades', value: inventoryData.total_units, color: 'text-gray-900' },
                { label: 'Disponibles',    value: inventoryData.available,   color: 'text-green-700' },
                { label: 'Vendidas',       value: inventoryData.sold,        color: 'text-red-600' },
                { label: 'Absorción',      value: `${inventoryData.absorption_pct}%`, color: 'text-purple-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
              Mostrar todas (incl. vendidas)
            </label>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Unidad','Piso','Área m²','Precio','Estado','Acción'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h === 'Precio' || h === 'Área m²' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingInventory ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Cargando…</td></tr>
                ) : units.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No hay unidades</td></tr>
                ) : units.map(unit => (
                  <tr key={unit.id} className={`hover:bg-gray-50 ${unit.is_sold ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{unit.unit_number}</td>
                    <td className="px-4 py-3 text-gray-600">{unit.floor}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{unit.area_sqm.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(unit.list_price, currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${unit.is_sold ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => unitMutation.mutate({ id: unit.id, status: unit.is_sold ? 'DISPONIBLE' : 'VENDIDO' })}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                        → {unit.is_sold ? 'DISPONIBLE' : 'VENDIDO'}
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
