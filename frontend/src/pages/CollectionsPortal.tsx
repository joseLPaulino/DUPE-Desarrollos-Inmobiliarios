/**
 * CollectionsPortal — payment plans with installment drill-down,
 * WhatsApp message draft preview, and email send via mailto.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, getPaymentPlans, getPlanInstallments, notifyInstallment, getPlanActivity, getLegalLetters, updateLetterStatus } from '../api'
import {
  CreditCard, CheckCircle, Clock, AlertTriangle, Search,
  ChevronDown, ChevronUp, MessageCircle, Mail, X, User,
  Copy, ExternalLink, Info, Scale, History, FileText,
  Send, Eye, Shield, DollarSign, Bell, CheckSquare,
} from 'lucide-react'

interface ProjectSummary { id: string; name: string; currency: string }
interface Plan {
  id: string; client_id: string; client_name: string
  unit_id: string; unit_number: string; project_id: string
  sale_date: string; total_amount: string; total_paid: string
  total_balance: string; is_active: boolean; status: string
  installment_count: number; overdue_count: number
  legal_flagged: boolean; legal_flagged_at: string | null
}
interface NotifChannel {
  last_sent_at: string | null
  count: number
  recently_sent: boolean
  hours_ago: number | null
}
interface Installment {
  id: string; number: number; due_date: string; amount: string
  status: string; paid_date: string | null; paid_amount: string | null
  days_overdue: number; escalation_level: string; notes: string
  notifications: { whatsapp: NotifChannel; email: NotifChannel }
}
interface PlanDetail {
  plan_id: string; client_name: string; client_email: string; client_phone: string
  total_amount: string; total_paid: string; total_balance: string
  installments: Installment[]
}
interface DraftResponse {
  channel: 'whatsapp' | 'email'
  client_name: string
  client_email: string
  client_phone: string
  recipient: string
  installment_number: number
  due_date: string
  amount: string
  draft_whatsapp_message: string
  draft_email_subject: string
  draft_email_body: string
  recently_sent: boolean
  last_sent_at: string | null
  hours_ago: number | null
  total_sent_count: number
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }: { msg: string; ok: boolean; onClose: () => void }) {
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium
      ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
      {msg}
      <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
    </div>
  )
}

// ── Message Draft Modal ───────────────────────────────────────────────────────
function MessageDraftModal({ draft, onClose }: { draft: DraftResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const isWhatsApp = draft.channel === 'whatsapp'

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openMailto = () => {
    const params = new URLSearchParams()
    // mailto doesn't use URLSearchParams directly — build manually
    const subject = encodeURIComponent(draft.draft_email_subject)
    const body = encodeURIComponent(draft.draft_email_body)
    window.location.href = `mailto:${draft.client_email}?subject=${subject}&body=${body}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between border-b
          ${isWhatsApp ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center
              ${isWhatsApp ? 'bg-emerald-500' : 'bg-blue-500'}`}>
              {isWhatsApp
                ? <MessageCircle size={18} className="text-white" />
                : <Mail size={18} className="text-white" />}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {isWhatsApp ? 'Borrador WhatsApp' : 'Borrador de Correo'}
              </h3>
              <p className="text-xs text-gray-500">
                Para: {draft.client_name} · {isWhatsApp ? draft.client_phone : draft.client_email}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Email subject line */}
        {!isWhatsApp && (
          <div className="px-6 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400 font-medium">Asunto: </span>
            <span className="text-xs text-gray-700">{draft.draft_email_subject}</span>
          </div>
        )}

        {/* Message body */}
        <div className="px-6 py-4">
          <div className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap font-sans
            ${isWhatsApp ? 'bg-[#DCF8C6] text-gray-800 border border-emerald-200' : 'bg-gray-50 text-gray-800 border border-gray-200'}`}
            style={{ fontFamily: isWhatsApp ? "'Segoe UI', sans-serif" : 'inherit' }}>
            {isWhatsApp ? draft.draft_whatsapp_message : draft.draft_email_body}
          </div>
        </div>

        {/* Dedup warning — shown when already sent within 24h */}
        {draft.recently_sent && (
          <div className="mx-6 mb-2 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700 leading-relaxed">
              <strong>Ya enviado hace {draft.hours_ago !== null && draft.hours_ago < 1
                ? 'menos de 1 hora'
                : `${draft.hours_ago} horas`}.</strong>{' '}
              Este {isWhatsApp ? 'mensaje' : 'correo'} ya fue enviado{' '}
              {draft.total_sent_count > 1 ? `${draft.total_sent_count} veces en total` : 'anteriormente'}.{' '}
              Asegúrese de que no reciba comunicaciones duplicadas antes de continuar.
            </p>
          </div>
        )}

        {/* Send count badge */}
        {draft.total_sent_count > 1 && (
          <div className="mx-6 mb-2 flex items-center gap-2 text-xs text-gray-500">
            <Clock size={11} />
            Total enviado: <strong>{draft.total_sent_count} veces</strong>
            {draft.last_sent_at && (
              <> · Último: <strong>{new Date(draft.last_sent_at).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></>
            )}
          </div>
        )}

        {/* WhatsApp integration notice */}
        {isWhatsApp && (
          <div className="mx-6 mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Info size={15} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>WhatsApp API pendiente.</strong> Este mensaje se enviará automáticamente a{' '}
              <strong>{draft.client_phone}</strong> una vez que la cuenta de WhatsApp Business de DUPE
              esté verificada con Meta. Por ahora, puede copiarlo y enviarlo manualmente.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center gap-2">
          {isWhatsApp ? (
            <>
              <button
                onClick={() => copyText(draft.draft_whatsapp_message)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border
                  border-emerald-300 bg-white text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors"
              >
                <Copy size={14} />
                {copied ? '¡Copiado!' : 'Copiar mensaje'}
              </button>
              <a
                href={`https://wa.me/${draft.client_phone.replace(/\D/g, '')}?text=${encodeURIComponent(draft.draft_whatsapp_message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                <ExternalLink size={14} />
                Abrir en WhatsApp
              </a>
            </>
          ) : (
            <>
              <button
                onClick={() => copyText(`Asunto: ${draft.draft_email_subject}\n\n${draft.draft_email_body}`)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Copy size={14} />
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={openMailto}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                <Mail size={14} />
                Abrir en cliente de correo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Escalation badge ──────────────────────────────────────────────────────────
const escBadge = (esc: string, days: number) => {
  if (esc === 'legal')      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">Legal D+{days}</span>
  if (esc === 'management') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">Gerencia D+{days}</span>
  if (esc === 'officer')    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">Oficial D+{days}</span>
  return null
}

const fmtAmt = (s: string, currency = 'DOP') =>
  new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-DO', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(parseFloat(s))

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Installment drill-down row ────────────────────────────────────────────────
function InstallmentPanel({ planId, currency, onDraft, onError }: {
  planId: string; currency: string
  onDraft: (draft: DraftResponse) => void
  onError: (msg: string) => void
}) {
  const { data, isLoading } = useQuery<PlanDetail>({
    queryKey: ['plan-detail', planId],
    queryFn: () => getPlanInstallments(planId),
  })

  const notify = useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: 'whatsapp' | 'email' }) =>
      notifyInstallment(id, channel),
    onSuccess: (res) => onDraft(res as DraftResponse),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Error preparando el mensaje'
      onError(detail)
    },
  })

  if (isLoading) return <div className="p-4 text-xs text-gray-400 animate-pulse">Cargando cuotas…</div>
  if (!data) return null

  return (
    <div className="border-t border-gray-100 bg-gray-50/50">
      {/* Client header */}
      <div className="px-6 py-3 flex items-center gap-4 border-b border-gray-100 bg-white">
        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
          <User size={14} className="text-violet-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{data.client_name}</p>
          <p className="text-xs text-gray-400">{data.client_email} · {data.client_phone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Cobrado</p>
          <p className="text-sm font-bold text-emerald-700">{fmtAmt(data.total_paid, currency)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Balance</p>
          <p className="text-sm font-bold text-violet-700">{fmtAmt(data.total_balance, currency)}</p>
        </div>
      </div>

      {/* Installment table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-gray-400 uppercase tracking-wide">
            {['#', 'Vencimiento', 'Monto', 'Estado', 'Pago', 'Escalación', 'Notificar'].map(h => (
              <th key={h} className="px-6 py-2 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.installments.map(inst => {
            const isPaid    = inst.status === 'paid'
            const isOverdue = inst.status === 'overdue'
            const isPending = inst.status === 'pending'
            const isBusy    = notify.isPending && (notify.variables as any)?.id === inst.id
            return (
              <tr key={inst.id} className={`${isOverdue ? 'bg-red-50/40' : 'bg-white'} hover:bg-gray-50`}>
                <td className="px-6 py-2.5 font-medium text-gray-600">#{inst.number}</td>
                <td className="px-6 py-2.5 text-gray-600">{fmtDate(inst.due_date)}</td>
                <td className="px-6 py-2.5 font-medium text-gray-800">{fmtAmt(inst.amount, currency)}</td>
                <td className="px-6 py-2.5">
                  {isPaid && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <CheckCircle size={9} /> Pagada
                    </span>
                  )}
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <AlertTriangle size={9} /> Vencida {inst.days_overdue}d
                    </span>
                  )}
                  {isPending && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <Clock size={9} /> Pendiente
                    </span>
                  )}
                </td>
                <td className="px-6 py-2.5 text-gray-600">
                  {isPaid && inst.paid_date
                    ? <span className="text-emerald-700">{fmtDate(inst.paid_date)}</span>
                    : '—'}
                </td>
                <td className="px-6 py-2.5">
                  {escBadge(inst.escalation_level, inst.days_overdue)}
                </td>
                {/* Notify actions */}
                <td className="px-4 py-2.5">
                  {!isPaid && (
                    <div className="flex flex-col gap-1">
                      {/* WhatsApp button + last-sent badge */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => notify.mutate({ id: inst.id, channel: 'whatsapp' })}
                          disabled={isBusy}
                          title="Preparar mensaje WhatsApp"
                          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors
                            ${inst.notifications?.whatsapp?.recently_sent
                              ? 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}
                            disabled:opacity-50`}
                        >
                          <MessageCircle size={10} />
                          WA
                        </button>
                        {inst.notifications?.whatsapp?.count > 0 && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            inst.notifications.whatsapp.recently_sent
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {inst.notifications.whatsapp.recently_sent
                              ? `hace ${inst.notifications.whatsapp.hours_ago! < 1 ? '<1h' : `${inst.notifications.whatsapp.hours_ago}h`}`
                              : `×${inst.notifications.whatsapp.count}`}
                          </span>
                        )}
                      </div>
                      {/* Email button + last-sent badge */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => notify.mutate({ id: inst.id, channel: 'email' })}
                          disabled={isBusy}
                          title="Preparar correo electrónico"
                          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors
                            ${inst.notifications?.email?.recently_sent
                              ? 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'}
                            disabled:opacity-50`}
                        >
                          <Mail size={10} />
                          Email
                        </button>
                        {inst.notifications?.email?.count > 0 && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            inst.notifications.email.recently_sent
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {inst.notifications.email.recently_sent
                              ? `hace ${inst.notifications.email.hours_ago! < 1 ? '<1h' : `${inst.notifications.email.hours_ago}h`}`
                              : `×${inst.notifications.email.count}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Provenance types ──────────────────────────────────────────────────────────
interface ActivityEntry {
  id: string; plan_id: string; action_type: string; channel: string
  actor: string; description: string; metadata: any; related_entity_id: string | null
  created_at: string | null
}
interface LegalLetter {
  id: string; plan_id: string; unit_number: string; status: string
  letter_text: string; overdue_installments: number; total_overdue_amount: string | null
  generated_at: string | null; sent_at: string | null; signed_by: string | null; notes: string | null
}

// ── Action type → icon + color ────────────────────────────────────────────────
function activityIcon(type: string) {
  const cls = "shrink-0 mt-0.5"
  if (type === 'notification_sent')  return <Bell size={13} className={`text-blue-500 ${cls}`} />
  if (type === 'payment_registered') return <DollarSign size={13} className={`text-emerald-500 ${cls}`} />
  if (type === 'plan_approved')      return <CheckSquare size={13} className={`text-violet-500 ${cls}`} />
  if (type === 'letter_generated')   return <FileText size={13} className={`text-orange-500 ${cls}`} />
  if (type === 'legal_flagged')      return <Scale size={13} className={`text-red-500 ${cls}`} />
  if (type === 'status_changed')     return <Eye size={13} className={`text-gray-500 ${cls}`} />
  return <Shield size={13} className={`text-gray-400 ${cls}`} />
}

function activityLabel(type: string) {
  const map: Record<string, string> = {
    notification_sent:  'Notificación',
    payment_registered: 'Pago',
    plan_approved:      'Aprobación',
    letter_generated:   'Carta generada',
    legal_flagged:      'Escalación legal',
    status_changed:     'Cambio de estado',
    note_added:         'Nota',
  }
  return map[type] ?? type
}

function fmtTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── LegalLetterCard ───────────────────────────────────────────────────────────
function LegalLetterCard({ letter, planId }: { letter: LegalLetter; planId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: (status: string) => updateLetterStatus(letter.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legal-letters', planId] }),
  })

  const statusColor: Record<string, string> = {
    generated: 'bg-orange-50 text-orange-700 border-orange-200',
    reviewed:  'bg-blue-50 text-blue-700 border-blue-200',
    signed:    'bg-violet-50 text-violet-700 border-violet-200',
    sent:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    delivered: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    voided:    'bg-gray-100 text-gray-500 border-gray-200',
  }

  const nextStatuses: Record<string, string[]> = {
    generated: ['reviewed'],
    reviewed:  ['signed', 'voided'],
    signed:    ['sent', 'voided'],
    sent:      ['delivered', 'voided'],
    delivered: [],
    voided:    [],
  }

  const nextLabels: Record<string, string> = {
    reviewed: 'Marcar revisada', signed: 'Marcar firmada',
    sent: 'Marcar enviada', delivered: 'Marcar entregada', voided: 'Anular',
  }

  return (
    <div className="border border-orange-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-orange-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-orange-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">
              Carta Prejudicial — Unidad {letter.unit_number}
            </p>
            <p className="text-[10px] text-gray-500">{fmtTs(letter.generated_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor[letter.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
            {letter.status}
          </span>
          {nextStatuses[letter.status]?.map(ns => (
            <button key={ns}
              onClick={() => updateStatus.mutate(ns)}
              disabled={updateStatus.isPending}
              className="text-[10px] px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {nextLabels[ns]}
            </button>
          ))}
          <button onClick={() => setExpanded(v => !v)}
            className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Eye size={10} />
            {expanded ? 'Ocultar' : 'Ver carta'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="bg-white border-t border-orange-100">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <p className="text-[10px] text-gray-400">
              {letter.overdue_installments} cuota{letter.overdue_installments !== 1 ? 's' : ''} vencida{letter.overdue_installments !== 1 ? 's' : ''}
              {letter.total_overdue_amount && ` · Total: ${letter.total_overdue_amount}`}
            </p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(letter.letter_text)
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Copy size={10} />
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre className="px-4 py-3 text-[10px] text-gray-700 font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto bg-gray-50">
            {letter.letter_text}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Plan Historial Panel ───────────────────────────────────────────────────────
function PlanHistorialPanel({ planId, isLegalFlagged }: { planId: string; isLegalFlagged: boolean }) {
  const [activeTab, setActiveTab] = useState<'activity' | 'letters'>('activity')

  const { data: activity = [], isLoading: loadingActivity } = useQuery<ActivityEntry[]>({
    queryKey: ['plan-activity', planId],
    queryFn: () => getPlanActivity(planId),
    refetchInterval: 10_000,
  })

  const { data: letters = [], isLoading: loadingLetters } = useQuery<LegalLetter[]>({
    queryKey: ['legal-letters', planId],
    queryFn: () => getLegalLetters(planId),
    enabled: isLegalFlagged,
  })

  return (
    <div className="border-t border-gray-100 bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium border-b-2 transition-colors
            ${activeTab === 'activity'
              ? 'border-violet-500 text-violet-700 bg-violet-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
        >
          <History size={12} />
          Historial de actividad
          {activity.length > 0 && (
            <span className="ml-1 bg-violet-100 text-violet-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {activity.length}
            </span>
          )}
        </button>
        {isLegalFlagged && (
          <button
            onClick={() => setActiveTab('letters')}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium border-b-2 transition-colors
              ${activeTab === 'letters'
                ? 'border-red-500 text-red-700 bg-red-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <FileText size={12} />
            Cartas legales
            {letters.length > 0 && (
              <span className="ml-1 bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {letters.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Activity timeline */}
      {activeTab === 'activity' && (
        <div className="px-6 py-4">
          {loadingActivity ? (
            <p className="text-xs text-gray-400 animate-pulse">Cargando historial…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin actividad registrada aún.</p>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[5px] top-0 bottom-0 w-px bg-gray-100" />
              <div className="space-y-3">
                {[...activity].reverse().map((entry, idx) => (
                  <div key={entry.id} className="flex gap-3 pl-1">
                    <div className="w-3 h-3 rounded-full border-2 border-white bg-gray-200 shrink-0 mt-1 relative z-10 shadow-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        {activityIcon(entry.action_type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                              {activityLabel(entry.action_type)}
                            </span>
                            <span className="text-[10px] text-gray-400">·</span>
                            <span className="text-[10px] text-gray-400">{fmtTs(entry.created_at)}</span>
                            {entry.actor && entry.actor !== 'system' && (
                              <>
                                <span className="text-[10px] text-gray-400">·</span>
                                <span className="text-[10px] text-gray-400">por {entry.actor}</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{entry.description}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legal letters */}
      {activeTab === 'letters' && (
        <div className="px-6 py-4 space-y-3">
          {loadingLetters ? (
            <p className="text-xs text-gray-400 animate-pulse">Cargando cartas…</p>
          ) : letters.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No hay cartas generadas para este plan.</p>
          ) : (
            letters.map(l => <LegalLetterCard key={l.id} letter={l} planId={planId} />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CollectionsPortal() {
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [planTab, setPlanTab] = useState<Record<string, 'cuotas' | 'historial'>>({})
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [activeDraft, setActiveDraft] = useState<DraftResponse | null>(null)

  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-list'],
    queryFn: () => import('../api').then(m => m.getProjects()),
  })

  const activeProjectId = projectId || projects[0]?.id
  const activeProject = projects.find(p => p.id === activeProjectId)
  const currency = activeProject?.currency ?? 'DOP'

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['plans', activeProjectId],
    queryFn: () => getPaymentPlans(activeProjectId),
    enabled: !!activeProjectId,
  })

  const filtered = plans.filter(p =>
    !search ||
    p.client_name.toLowerCase().includes(search.toLowerCase()) ||
    p.unit_number.includes(search) ||
    p.id.includes(search)
  )

  const totalCollected = plans.reduce((s, p) => s + parseFloat(p.total_paid), 0)
  const totalBalance   = plans.reduce((s, p) => s + parseFloat(p.total_balance), 0)
  const overdueCount   = plans.filter(p => p.overdue_count > 0).length

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4500)
  }

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      {activeDraft && (
        <MessageDraftModal draft={activeDraft} onClose={() => setActiveDraft(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-sm">
            <CreditCard size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Portal de Cobranza</h1>
            <p className="text-xs text-gray-400">Planes de pago · Cuotas · Recordatorios</p>
          </div>
        </div>
        <select
          value={activeProjectId ?? ''}
          onChange={e => { setProjectId(e.target.value); setExpandedPlan(null) }}
          className="text-sm border border-gray-200 rounded-xl bg-white pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200 w-64"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Planes activos', value: plans.length, icon: CreditCard, color: 'bg-violet-600' },
          { label: 'Total cobrado', value: fmtAmt(totalCollected.toString(), currency), icon: CheckCircle, color: 'bg-emerald-600' },
          { label: 'Saldo pendiente', value: fmtAmt(totalBalance.toString(), currency), icon: Clock, color: 'bg-blue-600' },
          { label: 'Cuotas vencidas', value: overdueCount, icon: AlertTriangle, color: overdueCount > 0 ? 'bg-red-500' : 'bg-emerald-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre de cliente, unidad o ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <span className="text-xs text-gray-400">{filtered.length} de {plans.length} planes</span>
      </div>

      {/* Plans table with drill-down */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Planes de Pago</h2>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <MessageCircle size={12} className="text-emerald-500" />
              WhatsApp — borrador + enlace directo
            </span>
            <span className="flex items-center gap-1.5">
              <Mail size={12} className="text-blue-500" />
              Email — abre tu cliente de correo listo para enviar
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Cargando planes…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No hay planes para este proyecto</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              <span>Cliente · Unidad</span>
              <span>Fecha venta</span>
              <span>Total plan</span>
              <span>Cobrado</span>
              <span>Balance</span>
              <span>Estado</span>
              <span className="w-6" />
            </div>

            {filtered.map(plan => {
              const paidPct = parseFloat(plan.total_paid) / parseFloat(plan.total_amount) * 100
              const isExpanded = expandedPlan === plan.id
              const hasOverdue = plan.overdue_count > 0

              return (
                <div key={plan.id} className="border-b border-gray-50 last:border-0">
                  <button
                    onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                    className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3.5 text-left hover:bg-gray-50 transition-colors items-center"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{plan.client_name}</p>
                      <p className="text-[11px] text-gray-400">Unidad {plan.unit_number} · {plan.installment_count} cuotas</p>
                    </div>
                    <span className="text-xs text-gray-600">{fmtDate(plan.sale_date)}</span>
                    <span className="text-xs font-medium text-gray-800">{fmtAmt(plan.total_amount, currency)}</span>
                    <div>
                      <span className="text-xs font-medium text-emerald-700">{fmtAmt(plan.total_paid, currency)}</span>
                      <div className="mt-1 h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(paidPct, 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-600">{fmtAmt(plan.total_balance, currency)}</span>
                    <div className="flex flex-col gap-1 items-start">
                      {plan.legal_flagged && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 rounded-full">
                          <Scale size={9} /> Legal
                        </span>
                      )}
                      {hasOverdue ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={9} /> {plan.overdue_count} vencida{plan.overdue_count > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle size={9} /> Al día
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 w-6 flex justify-center">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </button>

                  {isExpanded && (() => {
                    const tab = planTab[plan.id] ?? 'cuotas'
                    const setTab = (t: 'cuotas' | 'historial') =>
                      setPlanTab(prev => ({ ...prev, [plan.id]: t }))
                    return (
                      <div>
                        {/* Sub-tab bar */}
                        <div className="flex border-b border-gray-100 bg-white px-6 gap-1">
                          <button
                            onClick={() => setTab('cuotas')}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors
                              ${tab === 'cuotas'
                                ? 'border-violet-500 text-violet-700'
                                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                          >
                            <CreditCard size={11} /> Cuotas
                          </button>
                          <button
                            onClick={() => setTab('historial')}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors
                              ${tab === 'historial'
                                ? 'border-violet-500 text-violet-700'
                                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                          >
                            <History size={11} /> Historial
                            {plan.legal_flagged && (
                              <span className="ml-1 text-[9px] font-bold bg-red-100 text-red-600 px-1 rounded">Legal</span>
                            )}
                          </button>
                        </div>

                        {tab === 'cuotas' && (
                          <InstallmentPanel
                            planId={plan.id}
                            currency={currency}
                            onDraft={setActiveDraft}
                            onError={(msg) => showToast(msg, false)}
                          />
                        )}
                        {tab === 'historial' && (
                          <PlanHistorialPanel
                            planId={plan.id}
                            isLegalFlagged={plan.legal_flagged}
                          />
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
