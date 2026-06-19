import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOverdueInstallments, dispatchNotifications, getLegalLetters, updateLetterStatus } from '../api'
import {
  AlertOctagon, AlertTriangle, Scale, Send, Clock,
  RefreshCw, X, MessageCircle, Mail, FileText, ChevronDown, ChevronUp,
  CheckCircle, Shield, Eye, Copy, History,
} from 'lucide-react'
import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverdueItem {
  id: string; plan_id: string; installment_number: number
  due_date: string; days_overdue: number; amount_due: string
  balance_due: string; escalation_level: string
  client_name: string; client_phone: string; client_email: string
  legal_flagged: boolean; legal_flagged_at: string | null
}

interface DispatchResult {
  run_date: string
  total_actions: number
  summary: string
  officer:    { processed: number; skipped_dedup: number; clients: string[] }
  management: { processed: number; skipped_dedup: number; clients: string[]; internal_alerts: number }
  legal: {
    processed: number; already_flagged: number; newly_flagged: number
    clients: string[]
    letters: Array<{
      client_name: string; client_email: string; plan_id: string
      unit_number: string; project_name: string
      days_overdue: number; overdue_installments: number
      letter_text: string
    }>
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const ESC_CONFIG = {
  OFFICER:    { label: 'Gestión Oficial',  icon: AlertTriangle, color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200', daysLabel: 'D+1 a D+5',  description: 'WhatsApp + email recordatorio' },
  MANAGEMENT: { label: 'Alerta Gerencia',  icon: AlertOctagon,  color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', daysLabel: 'D+6 a D+15', description: 'Comunicación urgente + alerta interna' },
  LEGAL:      { label: 'Gestión Legal',    icon: Scale,         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    daysLabel: 'D+16+',       description: 'Carta de cobro prejudicial' },
}

const fmtDate = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtDOP = (s: string) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(parseFloat(s))

// ── Legal Letter Modal ────────────────────────────────────────────────────────

function LegalLetterModal({ letter, onClose }: {
  letter: DispatchResult['legal']['letters'][0]; onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(letter.letter_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openMailto = () => {
    const subject = encodeURIComponent(`Carta de Cobro Prejudicial — ${letter.project_name} Unidad ${letter.unit_number}`)
    const body = encodeURIComponent(letter.letter_text)
    window.location.href = `mailto:${letter.client_email}?subject=${subject}&body=${body}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-red-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-red-100 bg-red-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-red-900">Carta de Cobro Prejudicial</h3>
              <p className="text-xs text-red-600">{letter.client_name} · {letter.project_name} · Unidad {letter.unit_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 rounded-lg p-1 hover:bg-red-100">
            <X size={18} />
          </button>
        </div>

        {/* Warning */}
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2.5 shrink-0">
          <Shield size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Esta carta tiene carácter legal. Debe ser firmada por el responsable autorizado de DUPE
            antes de su envío oficial. Puede copiarla o enviarla por correo para revisión y firma.
          </p>
        </div>

        {/* Letter body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 border border-gray-200 rounded-xl p-5">
            {letter.letter_text}
          </pre>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 shrink-0">
          <button
            onClick={copy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <FileText size={14} />
            {copied ? '¡Copiada!' : 'Copiar carta'}
          </button>
          <button
            onClick={openMailto}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            <Mail size={14} />
            Enviar por correo para firma
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dispatch Results Panel ────────────────────────────────────────────────────

function DispatchResultPanel({ result, onViewLetter }: {
  result: DispatchResult
  onViewLetter: (letter: DispatchResult['legal']['letters'][0]) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
        <CheckCircle size={18} className="text-emerald-500" />
        <div>
          <h3 className="text-sm font-bold text-gray-800">Despacho completado — {result.run_date}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{result.summary}</p>
        </div>
        <div className="ml-auto text-2xl font-black text-emerald-600">{result.total_actions}</div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100">
        {/* Officer */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Gestión Oficial</span>
          </div>
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><MessageCircle size={11} className="text-emerald-500" /> WhatsApp + Email</span>
              <span className="font-bold text-gray-800">{result.officer.processed}</span>
            </div>
            {result.officer.skipped_dedup > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Omitidos (enviados hoy)</span>
                <span>{result.officer.skipped_dedup}</span>
              </div>
            )}
            {result.officer.clients.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                {result.officer.clients.slice(0, 3).map(c => (
                  <div key={c} className="text-[10px] text-gray-500 truncate">{c}</div>
                ))}
                {result.officer.clients.length > 3 && (
                  <div className="text-[10px] text-gray-400">+{result.officer.clients.length - 3} más</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Management */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon size={14} className="text-orange-600" />
            <span className="text-xs font-semibold text-orange-700">Alerta Gerencia</span>
          </div>
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><MessageCircle size={11} className="text-orange-500" /> Urgentes</span>
              <span className="font-bold text-gray-800">{result.management.processed}</span>
            </div>
            {result.management.internal_alerts > 0 && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1"><Mail size={11} className="text-orange-400" /> Alerta interna</span>
                <span className="font-bold text-orange-600">✓</span>
              </div>
            )}
            {result.management.skipped_dedup > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Omitidos</span>
                <span>{result.management.skipped_dedup}</span>
              </div>
            )}
            {result.management.clients.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                {result.management.clients.slice(0, 3).map(c => (
                  <div key={c} className="text-[10px] text-gray-500 truncate">{c}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Legal */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Scale size={14} className="text-red-600" />
            <span className="text-xs font-semibold text-red-700">Gestión Legal</span>
          </div>
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><FileText size={11} className="text-red-500" /> Cartas generadas</span>
              <span className="font-bold text-red-600">{result.legal.newly_flagged}</span>
            </div>
            {result.legal.already_flagged > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Ya activos</span>
                <span>{result.legal.already_flagged}</span>
              </div>
            )}
          </div>
          {/* Letter buttons */}
          {result.legal.letters.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 space-y-1.5">
              {result.legal.letters.map(l => (
                <button
                  key={l.plan_id}
                  onClick={() => onViewLetter(l)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-medium transition-colors border border-red-200"
                >
                  <span className="truncate">{l.client_name}</span>
                  <FileText size={11} className="shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DB Letter Panel — loads persisted letters for a flagged plan ──────────────

interface DbLetter {
  id: string; plan_id: string; unit_number: string; status: string
  letter_text: string; overdue_installments: number; total_overdue_amount: string | null
  generated_at: string | null; sent_at: string | null; signed_by: string | null; notes: string | null
}

const STATUS_COLORS: Record<string, string> = {
  generated: 'bg-orange-50 text-orange-700 border-orange-200',
  reviewed:  'bg-blue-50 text-blue-700 border-blue-200',
  signed:    'bg-violet-50 text-violet-700 border-violet-200',
  sent:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  delivered: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  voided:    'bg-gray-100 text-gray-500 border-gray-200',
}

const NEXT_STATUSES: Record<string, string[]> = {
  generated: ['reviewed'],
  reviewed:  ['signed', 'voided'],
  signed:    ['sent', 'voided'],
  sent:      ['delivered'],
  delivered: [], voided: [],
}

const NEXT_LABELS: Record<string, string> = {
  reviewed: 'Revisada', signed: 'Firmada',
  sent: 'Enviada', delivered: 'Entregada', voided: 'Anular',
}

function fmtTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DbLetterPanel({ planId, clientName }: { planId: string; clientName: string }) {
  const [expanded, setExpanded] = useState(false)
  const [openLetterId, setOpenLetterId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: letters = [], isLoading } = useQuery<DbLetter[]>({
    queryKey: ['legal-letters', planId],
    queryFn: () => getLegalLetters(planId),
  })

  const updateStatus = useMutation({
    mutationFn: ({ letterId, status }: { letterId: string; status: string }) =>
      updateLetterStatus(letterId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legal-letters', planId] }),
  })

  return (
    <tr className="bg-red-50/30 border-t border-red-100">
      <td colSpan={8} className="px-5 py-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 hover:text-red-900"
        >
          <FileText size={11} />
          Ver cartas legales en base de datos
          {letters.length > 0 && (
            <span className="ml-1 bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-red-200">
              {letters.length}
            </span>
          )}
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {expanded && (
          <div className="mt-2 mb-1 space-y-2">
            {isLoading && <p className="text-[10px] text-gray-400 animate-pulse">Cargando cartas…</p>}
            {!isLoading && letters.length === 0 && (
              <p className="text-[10px] text-gray-400 italic">
                Sin cartas generadas aún. Ejecuta "Despachar Notificaciones" para generar.
              </p>
            )}
            {letters.map(l => (
              <div key={l.id} className="border border-orange-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-orange-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={12} className="text-orange-600 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold text-gray-800">
                        {clientName} · Unidad {l.unit_number} · {l.overdue_installments} cuota{l.overdue_installments !== 1 ? 's' : ''} vencida{l.overdue_installments !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[10px] text-gray-500">{fmtTs(l.generated_at)}{l.sent_at ? ` · Enviada: ${fmtTs(l.sent_at)}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[l.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {l.status}
                    </span>
                    {NEXT_STATUSES[l.status]?.map(ns => (
                      <button key={ns}
                        onClick={() => updateStatus.mutate({ letterId: l.id, status: ns })}
                        disabled={updateStatus.isPending}
                        className="text-[10px] px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {NEXT_LABELS[ns]}
                      </button>
                    ))}
                    <button
                      onClick={() => setOpenLetterId(openLetterId === l.id ? null : l.id)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <Eye size={9} />
                      {openLetterId === l.id ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>
                {openLetterId === l.id && (
                  <div className="bg-white border-t border-orange-100">
                    <div className="flex justify-end px-4 py-1.5 border-b border-gray-100">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(l.letter_text)
                          setCopied(l.id); setTimeout(() => setCopied(null), 2000)
                        }}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        <Copy size={9} />
                        {copied === l.id ? '¡Copiada!' : 'Copiar'}
                      </button>
                    </div>
                    <pre className="px-4 py-3 text-[10px] text-gray-700 font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto bg-gray-50">
                      {l.letter_text}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OverdueQueue() {
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null)
  const [activeLetter, setActiveLetter] = useState<DispatchResult['legal']['letters'][0] | null>(null)
  const [expandedLegal, setExpandedLegal] = useState(true)

  const { data: items = [], isLoading, refetch } = useQuery<OverdueItem[]>({
    queryKey: ['overdue'],
    queryFn: getOverdueInstallments,
    refetchInterval: 30_000,
  })

  const byLevel = {
    OFFICER:    items.filter(i => i.escalation_level === 'OFFICER'),
    MANAGEMENT: items.filter(i => i.escalation_level === 'MANAGEMENT'),
    LEGAL:      items.filter(i => i.escalation_level === 'LEGAL'),
  }

  const handleDispatch = async () => {
    setDispatching(true)
    setDispatchResult(null)
    try {
      const result = await dispatchNotifications()
      setDispatchResult(result)
      refetch()
    } catch (e: any) {
      console.error('Dispatch error:', e)
    } finally {
      setDispatching(false)
    }
  }

  if (isLoading) return (
    <div className="space-y-4 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl" />)}
    </div>
  )

  return (
    <div className="space-y-5">
      {activeLetter && (
        <LegalLetterModal letter={activeLetter} onClose={() => setActiveLetter(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {Object.entries(byLevel).map(([key, list]) => {
            const cfg = ESC_CONFIG[key as keyof typeof ESC_CONFIG]
            return (
              <div key={key} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                <cfg.icon size={14} className={cfg.color} />
                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                <span className={`text-sm font-bold ml-1 ${cfg.color}`}>{list.length}</span>
              </div>
            )
          })}
        </div>
        <button
          onClick={handleDispatch}
          disabled={dispatching || items.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {dispatching ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
          {dispatching ? 'Despachando…' : 'Despachar Notificaciones'}
        </button>
      </div>

      {/* Dispatch result */}
      {dispatchResult && (
        <DispatchResultPanel result={dispatchResult} onViewLetter={setActiveLetter} />
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={24} className="text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700">Sin mora activa</h3>
          <p className="text-xs text-gray-400 mt-1">Todos los planes están al día</p>
        </div>
      ) : (
        Object.entries(byLevel).map(([key, list]) => {
          if (list.length === 0) return null
          const cfg = ESC_CONFIG[key as keyof typeof ESC_CONFIG]
          const isLegal = key === 'LEGAL'
          const isExpanded = !isLegal || expandedLegal

          return (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => isLegal && setExpandedLegal(!expandedLegal)}
                className={`w-full flex items-center justify-between px-6 py-4 border-b border-l-4 text-left
                  ${cfg.bg} ${cfg.border} ${isLegal ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-3">
                  <cfg.icon size={18} className={cfg.color} />
                  <div>
                    <h3 className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</h3>
                    <p className={`text-[11px] ${cfg.color} opacity-70`}>
                      {cfg.daysLabel} · {list.length} cuota{list.length !== 1 ? 's' : ''} · {cfg.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isLegal && list.filter(i => i.legal_flagged).length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">
                      <Shield size={9} /> {list.filter(i => i.legal_flagged).length} flagged
                    </span>
                  )}
                  <div className={`text-2xl font-black ${cfg.color}`}>{list.length}</div>
                  {isLegal && (isExpanded ? <ChevronUp size={16} className={cfg.color} /> : <ChevronDown size={16} className={cfg.color} />)}
                </div>
              </button>

              {isExpanded && (
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      {['Cliente', 'Contacto', '# Cuota', 'Vencimiento', 'Días', 'Monto', 'Saldo', isLegal ? 'Estado Legal' : ''].filter(Boolean).map(h => (
                        <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.map(item => (<>
                      <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.legal_flagged ? 'bg-red-50/30' : ''}`}>
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-semibold text-gray-800">{item.client_name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{item.id.slice(0,8)}…</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            {item.client_phone && (
                              <a href={`https://wa.me/${item.client_phone.replace(/\D/g, '')}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] text-emerald-700 hover:underline">
                                <MessageCircle size={9} /> {item.client_phone}
                              </a>
                            )}
                            {item.client_email && (
                              <a href={`mailto:${item.client_email}`}
                                className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                                <Mail size={9} /> {item.client_email}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-gray-700">#{item.installment_number}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-600">{fmtDate(item.due_date)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                            D+{item.days_overdue}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-medium text-gray-800">{fmtDOP(item.amount_due)}</td>
                        <td className="px-5 py-3.5 text-xs text-gray-600">{fmtDOP(item.balance_due)}</td>
                        {isLegal && (
                          <td className="px-5 py-3.5">
                            {item.legal_flagged ? (
                              <div>
                                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">
                                  <Scale size={9} /> En proceso legal
                                </span>
                                {item.legal_flagged_at && (
                                  <div className="text-[9px] text-gray-400 mt-0.5">
                                    {fmtDate(item.legal_flagged_at)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">Pendiente</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {isLegal && item.legal_flagged && (
                        <DbLetterPanel key={`letters-${item.id}`} planId={item.plan_id} clientName={item.client_name} />
                      )}
                    </>))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
