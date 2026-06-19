/**
 * DataExplorerPage — browse every database table, understand what data exists,
 * where it came from, and which feature it powers.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database, Table2, ChevronRight, ChevronDown, Info, ArrowLeft,
  RefreshCw, FileSpreadsheet, Cpu, User, Zap, AlertCircle,
  CheckCircle, ChevronLeft, Server,
} from 'lucide-react'
import api from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableMeta {
  name: string
  label: string
  module: string
  origin: string
  origin_detail: string
  feature: string
  row_count: number
  columns: string[]
}

interface TableRows {
  table: string
  label: string
  module: string
  origin: string
  origin_detail: string
  feature: string
  columns: string[]
  total: number
  offset: number
  limit: number
  rows: Record<string, any>[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODULE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Financiero':   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  'Cobranza':     { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  'Contabilidad': { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   dot: 'bg-teal-500' },
  'Comercial':    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  'IA Agéntica':  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  'Gestión':      { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  'Postventa':    { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  'Todos':        { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200',   dot: 'bg-gray-400' },
}

// "Origin" = how the rows were first inserted into Postgres, not where data lives
const ORIGIN_ICONS: Record<string, JSX.Element> = {
  'Seed — Excel':    <FileSpreadsheet size={13} className="text-emerald-600" />,
  'Seed — Excel+':   <FileSpreadsheet size={13} className="text-blue-500" />,
  'Seed — Demo':     <Cpu size={13} className="text-violet-500" />,
  'Vía UI / API':    <User size={13} className="text-orange-500" />,
  'Agente IA':       <Zap size={13} className="text-purple-500" />,
  'Sistema':         <Cpu size={13} className="text-gray-500" />,
}

const ORIGIN_BADGES: Record<string, string> = {
  'Seed — Excel':    'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Seed — Excel+':   'bg-blue-100 text-blue-800 border-blue-200',
  'Seed — Demo':     'bg-violet-100 text-violet-800 border-violet-200',
  'Vía UI / API':    'bg-orange-100 text-orange-800 border-orange-200',
  'Agente IA':       'bg-purple-100 text-purple-800 border-purple-200',
  'Sistema':         'bg-gray-100 text-gray-700 border-gray-200',
}

function fmtCell(val: any): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? '✓' : '✗'
  if (typeof val === 'string' && val.length > 80) return val.slice(0, 80) + '…'
  return String(val)
}

function getModules(tables: TableMeta[]) {
  const seen = new Set<string>()
  const order = ['Financiero', 'Cobranza', 'Contabilidad', 'Comercial', 'IA Agéntica', 'Gestión', 'Postventa', 'Todos']
  const modules: string[] = []
  for (const m of order) {
    if (tables.some(t => t.module === m)) modules.push(m)
  }
  for (const t of tables) {
    if (!seen.has(t.module) && !modules.includes(t.module)) {
      modules.push(t.module)
    }
    seen.add(t.module)
  }
  return modules
}

// ── Table list sidebar ────────────────────────────────────────────────────────

function TableListItem({ meta, selected, onClick }: {
  meta: TableMeta; selected: boolean; onClick: () => void
}) {
  const colors = MODULE_COLORS[meta.module] ?? MODULE_COLORS['Todos']
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors
        ${selected ? 'bg-violet-50 border border-violet-200' : 'hover:bg-gray-50 border border-transparent'}`}
    >
      <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${selected ? 'text-violet-800' : 'text-gray-700'}`}>
          {meta.label}
        </p>
        <p className="text-[10px] text-gray-400 font-mono">{meta.name}</p>
      </div>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0
        ${meta.row_count === 0
          ? 'bg-gray-100 text-gray-400'
          : 'bg-gray-100 text-gray-600'}`}>
        {meta.row_count}
      </span>
    </button>
  )
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ tables }: { tables: TableMeta[] }) {
  const total = tables.reduce((s, t) => s + t.row_count, 0)
  const withData = tables.filter(t => t.row_count > 0).length
  const seededFromExcel = tables.filter(t => t.origin.includes('Excel')).reduce((s, t) => s + t.row_count, 0)
  const liveRows = tables.filter(t => t.origin === 'Vía UI / API' || t.origin === 'Sistema' || t.origin === 'Agente IA').reduce((s, t) => s + t.row_count, 0)

  return (
    <>
      {/* Postgres banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-2xl text-xs">
        <Server size={16} className="text-slate-300 shrink-0" />
        <div>
          <span className="font-bold text-white">Todas las tablas son PostgreSQL.</span>
          {' '}<span className="text-slate-300">El Excel fue el punto de partida para cargar datos iniciales (seed). Todo lo que ves aquí vive en la base de datos — no en el archivo Excel.</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total de registros', value: total.toLocaleString(), sub: 'en las 21 tablas Postgres', color: 'bg-violet-600' },
          { label: 'Tablas con datos', value: `${withData} / ${tables.length}`, sub: 'tablas con al menos 1 fila', color: 'bg-blue-600' },
          { label: 'Seeded desde Excel', value: seededFromExcel.toLocaleString(), sub: 'valores iniciales del modelo DUPE', color: 'bg-emerald-600' },
          { label: 'Generados en vivo', value: liveRows.toLocaleString(), sub: 'creados por uso real del sistema', color: 'bg-orange-500' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center mb-2`}>
              <Database size={13} className="text-white" />
            </div>
            <div className="text-xl font-black text-gray-900">{value}</div>
            <div className="text-xs font-semibold text-gray-700">{label}</div>
            <div className="text-[10px] text-gray-400">{sub}</div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Table rows view ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50

function TableRowsView({ tableName }: { tableName: string }) {
  const [offset, setOffset] = useState(0)

  const { data, isLoading, error } = useQuery<TableRows>({
    queryKey: ['admin-table-rows', tableName, offset],
    queryFn: () => api.get(`/admin/tables/${tableName}?offset=${offset}&limit=${PAGE_SIZE}`).then(r => r.data),
  })

  if (isLoading) return (
    <div className="flex items-center gap-3 p-8 text-sm text-gray-400 animate-pulse">
      <RefreshCw size={16} className="animate-spin" />
      Cargando filas…
    </div>
  )

  if (error || !data) return (
    <div className="p-8 text-sm text-red-500 flex items-center gap-2">
      <AlertCircle size={16} /> Error cargando tabla
    </div>
  )

  const totalPages = Math.ceil(data.total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const colors = MODULE_COLORS[data.module] ?? MODULE_COLORS['Todos']

  return (
    <div className="space-y-4">
      {/* Table header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">{data.label}</h2>
            <span className="font-mono text-xs text-gray-400">{data.table}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
              {data.module}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ORIGIN_BADGES[data.origin] ?? ORIGIN_BADGES['Sistema']}`}>
              {ORIGIN_ICONS[data.origin]}
              {data.origin}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">{data.origin_detail}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            <span className="font-medium text-gray-600">Usado en:</span> {data.feature}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-black text-gray-800">{data.total.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400">filas totales</div>
        </div>
      </div>

      {/* Empty state */}
      {data.total === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
          <Table2 size={28} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm font-semibold text-gray-600">Tabla vacía</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">{data.origin_detail}</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {data.columns.map(col => (
                    <th key={col} className="px-4 py-2.5 text-left font-semibold text-[10px] text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-violet-50/30 transition-colors">
                    {data.columns.map(col => {
                      const val = row[col]
                      const isId = col === 'id' || col.endsWith('_id')
                      const isStatus = col === 'status' || col === 'fiduciaria_status'
                      const isBool = typeof val === 'boolean'
                      const isNum = typeof val === 'number' && !col.endsWith('_id')
                      return (
                        <td key={col} className={`px-4 py-2.5 ${isId ? 'font-mono text-gray-400' : 'text-gray-700'}`}>
                          {isBool ? (
                            val
                              ? <CheckCircle size={12} className="text-emerald-500" />
                              : <span className="text-gray-300">—</span>
                          ) : isStatus && val ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700">
                              {val}
                            </span>
                          ) : isId && val ? (
                            <span title={val}>{String(val).slice(0, 8)}…</span>
                          ) : (
                            <span className={isNum ? 'font-mono' : ''} title={val !== null ? String(val) : ''}>
                              {fmtCell(val)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} de {data.total.toLocaleString()} filas
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="px-3 py-1 rounded-lg bg-gray-100 font-medium">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= data.total}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DataExplorerPage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())

  const { data: tables = [], isLoading, refetch } = useQuery<TableMeta[]>({
    queryKey: ['admin-tables'],
    queryFn: () => api.get('/admin/tables').then(r => r.data),
    refetchOnWindowFocus: false,
  })

  const modules = getModules(tables)

  const toggleModule = (m: string) =>
    setCollapsedModules(prev => {
      const next = new Set(prev)
      next.has(m) ? next.delete(m) : next.add(m)
      return next
    })

  return (
    <div className="flex gap-5 h-[calc(100vh-120px)]">

      {/* ── Sidebar — table list ───────────────────────────────────────────── */}
      <div className="w-64 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto">
        <div className="px-4 pt-4 pb-2 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <Database size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-gray-800">Explorador BD</span>
          </div>
          <button onClick={() => refetch()} title="Actualizar conteos" className="text-gray-400 hover:text-gray-600">
            <RefreshCw size={13} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 text-xs text-gray-400 animate-pulse">Cargando tablas…</div>
        ) : (
          <div className="p-2 space-y-1">
            {modules.map(mod => {
              const modTables = tables.filter(t => t.module === mod)
              const isCollapsed = collapsedModules.has(mod)
              const colors = MODULE_COLORS[mod] ?? MODULE_COLORS['Todos']
              const totalRows = modTables.reduce((s, t) => s + t.row_count, 0)
              return (
                <div key={mod}>
                  <button
                    onClick={() => toggleModule(mod)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex-1">{mod}</span>
                    <span className="text-[9px] text-gray-400">{totalRows.toLocaleString()}</span>
                    {isCollapsed
                      ? <ChevronRight size={11} className="text-gray-300" />
                      : <ChevronDown size={11} className="text-gray-300" />}
                  </button>
                  {!isCollapsed && (
                    <div className="pl-2 space-y-0.5">
                      {modTables.map(meta => (
                        <TableListItem
                          key={meta.name}
                          meta={meta}
                          selected={selectedTable === meta.name}
                          onClick={() => setSelectedTable(meta.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedTable ? (
          <div className="space-y-5">
            {/* Summary */}
            {tables.length > 0 && <SummaryCards tables={tables} />}

            {/* Data origin legend */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <Info size={15} className="text-violet-500" />
                <h2 className="text-sm font-bold text-gray-800">¿Cómo se pobló cada tabla inicialmente?</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">El almacenamiento es siempre PostgreSQL. Las etiquetas de abajo indican de dónde vienen los valores que se insertaron al arrancar el sistema.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    icon: <FileSpreadsheet size={16} className="text-emerald-600" />,
                    label: 'Seed — Excel',
                    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    desc: 'Los valores (nombres, montos, fechas, avance físico) vienen directamente del Excel DUPE. El seed.py los leyó una vez y los insertó en Postgres. A partir de ahí, todo cambio va por API.',
                  },
                  {
                    icon: <FileSpreadsheet size={16} className="text-blue-500" />,
                    label: 'Seed — Excel+',
                    badge: 'bg-blue-100 text-blue-800 border-blue-200',
                    desc: 'Las cantidades y precios vienen del Excel (100/140/45 unidades, RD$3.46M/unidad), pero los registros individuales los generó el seed. En producción entran vía formularios de ventas.',
                  },
                  {
                    icon: <Cpu size={16} className="text-violet-500" />,
                    label: 'Seed — Demo',
                    badge: 'bg-violet-100 text-violet-800 border-violet-200',
                    desc: 'Datos creados para demo: clientes (cédulas DR reales), leads, casos de gestión/postventa, metas, eventos. El Excel no tenía estos — son funcionalidades nuevas de la plataforma.',
                  },
                  {
                    icon: <User size={16} className="text-orange-500" />,
                    label: 'Vía UI / API',
                    badge: 'bg-orange-100 text-orange-800 border-orange-200',
                    desc: 'Vacías al inicio. Se llenan cuando el usuario interactúa: subir un CSV bancario, hacer clic en WA/Email. Son las tablas que prueban que esto es un sistema de registro real.',
                  },
                  {
                    icon: <Zap size={16} className="text-purple-500" />,
                    label: 'Agente IA',
                    badge: 'bg-purple-100 text-purple-800 border-purple-200',
                    desc: 'Escritas exclusivamente por los agentes de IA cuando se ejecutan. El ProspectFinderAgent inserta en `prospects`; el sistema nunca escribe ahí manualmente.',
                  },
                  {
                    icon: <Cpu size={16} className="text-gray-500" />,
                    label: 'Sistema',
                    badge: 'bg-gray-100 text-gray-700 border-gray-200',
                    desc: 'Generadas automáticamente como efecto secundario de acciones del usuario: log de agentes, cartas prejudiciales (D+16), historial de plan (append-only). Nunca se editan.',
                  },
                ].map(({ icon, label, badge, desc }) => (
                  <div key={label} className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="shrink-0 mt-0.5">{icon}</div>
                    <div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border mb-1.5 ${badge}`}>
                        {label}
                      </span>
                      <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Table overview grid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-sm font-bold text-gray-800">Todas las tablas</h2>
                <p className="text-xs text-gray-400 mt-0.5">Haz clic en cualquier tabla para explorar sus filas</p>
              </div>
              <div className="grid grid-cols-3 gap-px bg-gray-100">
                {tables.map(meta => {
                  const colors = MODULE_COLORS[meta.module] ?? MODULE_COLORS['Todos']
                  return (
                    <button
                      key={meta.name}
                      onClick={() => setSelectedTable(meta.name)}
                      className="bg-white p-4 text-left hover:bg-violet-50/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${colors.dot}`} />
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border
                          ${ORIGIN_BADGES[meta.origin] ?? ORIGIN_BADGES['Sistema']}`}>
                          {meta.origin.replace(' (desde Excel)', '')}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-800 group-hover:text-violet-700 leading-snug">{meta.label}</p>
                      <p className="text-[10px] font-mono text-gray-400 mt-0.5">{meta.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {meta.module}
                        </span>
                        <span className={`text-sm font-black ${meta.row_count === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                          {meta.row_count.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Back button */}
            <button
              onClick={() => setSelectedTable(null)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 transition-colors"
            >
              <ArrowLeft size={13} />
              Volver a todas las tablas
            </button>

            <TableRowsView tableName={selectedTable} />
          </div>
        )}
      </div>
    </div>
  )
}
