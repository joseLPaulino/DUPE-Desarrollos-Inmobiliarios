import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Brain, UserSearch, TrendingUp, Activity,
  RefreshCw, ChevronRight, CheckCircle, XCircle, Clock,
  Zap, AlertTriangle, Star, ArrowRight, Loader2,
  BarChart3, Users, Target,
} from 'lucide-react'
import {
  listScoredLeads, analyzeLead, findProspects, listProspects,
  convertProspect, rejectProspect, getIntelligenceFunnel, getAgentLog, getProjects,
} from '../api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number | null) {
  if (score === null) return 'bg-gray-700 text-gray-400'
  if (score >= 75) return 'bg-green-500/20 text-green-300 border border-green-500/30'
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 30) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-300 border border-red-500/30'
}

function scoreLabel(score: number | null) {
  if (score === null) return '—'
  if (score >= 75) return 'Alta'
  if (score >= 50) return 'Media'
  if (score >= 30) return 'Baja'
  return 'Fría'
}

function affinityColor(score: number) {
  if (score >= 75) return 'text-green-400'
  if (score >= 55) return 'text-yellow-400'
  return 'text-orange-400'
}

function sourceIcon(src: string) {
  if (src.includes('INVI') || src.includes('Waitlist')) return '🏛️'
  if (src.includes('Facebook') || src.includes('Instagram')) return '📱'
  if (src.includes('Expat') || src.includes('Diaspora') || src.includes('Miami')) return '✈️'
  if (src.includes('Airbnb')) return '🏖️'
  if (src.includes('Empleador') || src.includes('Nómina')) return '💼'
  if (src.includes('OLX') || src.includes('Corotos') || src.includes('Portal')) return '🔍'
  if (src.includes('WhatsApp')) return '💬'
  return '📌'
}

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', calificado: 'Calificado',
  reservado: 'Reservado', descartado: 'Descartado',
}
const STATUS_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-500/20 text-blue-300',
  contactado: 'bg-yellow-500/20 text-yellow-300',
  calificado: 'bg-purple-500/20 text-purple-300',
  reservado: 'bg-green-500/20 text-green-300',
  descartado: 'bg-gray-500/20 text-gray-400',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-[#1A1033] rounded-xl border border-white/10 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-white/50">{label}</div>
        {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'leads' | 'prospects' | 'funnel' | 'log'

export default function IntelligencePage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('leads')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [findingProspects, setFindingProspects] = useState(false)
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [prospectCount, setProspectCount] = useState(8)

  // Projects
  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const projects: any[] = projectsData?.projects ?? []

  useEffect(() => {
    if (projects.length && !selectedProject) setSelectedProject(projects[0]?.id ?? '')
  }, [projects])

  // Leads with AI scores
  const { data: leadsData, refetch: refetchLeads } = useQuery({
    queryKey: ['scored-leads', selectedProject],
    queryFn: () => listScoredLeads({ project_id: selectedProject }),
    enabled: !!selectedProject,
  })
  const leads: any[] = leadsData?.leads ?? []

  // Prospects
  const { data: prospectsData, refetch: refetchProspects } = useQuery({
    queryKey: ['prospects', selectedProject],
    queryFn: () => listProspects(selectedProject),
    enabled: !!selectedProject && tab === 'prospects',
  })
  const prospects: any[] = prospectsData?.prospects ?? []

  // Funnel
  const { data: funnelData } = useQuery({
    queryKey: ['funnel', selectedProject],
    queryFn: () => getIntelligenceFunnel(selectedProject),
    enabled: !!selectedProject && tab === 'funnel',
  })

  // Agent log
  const { data: logData } = useQuery({
    queryKey: ['agent-log'],
    queryFn: () => getAgentLog({ limit: 40 }),
    enabled: tab === 'log',
    refetchInterval: tab === 'log' ? 8000 : false,
  })
  const logs: any[] = logData?.logs ?? []

  // Mutations
  const analyzeLeadFn = useCallback(async (leadId: string) => {
    setAnalyzingId(leadId)
    try {
      await analyzeLead(leadId)
      await refetchLeads()
      qc.invalidateQueries({ queryKey: ['agent-log'] })
    } finally {
      setAnalyzingId(null)
    }
  }, [refetchLeads, qc])

  const analyzeAllFn = useCallback(async () => {
    const unanalyzed = leads.filter(l => l.ai_score === null)
    for (const l of unanalyzed) {
      await analyzeLeadFn(l.id)
    }
  }, [leads, analyzeLeadFn])

  const findProspectsFn = useCallback(async () => {
    if (!selectedProject) return
    setFindingProspects(true)
    try {
      await findProspects(selectedProject, prospectCount)
      await refetchProspects()
      qc.invalidateQueries({ queryKey: ['agent-log'] })
    } finally {
      setFindingProspects(false)
    }
  }, [selectedProject, prospectCount, refetchProspects, qc])

  const convertMut = useMutation({
    mutationFn: convertProspect,
    onSuccess: () => { refetchProspects(); qc.invalidateQueries({ queryKey: ['scored-leads', selectedProject] }) },
  })
  const rejectMut = useMutation({
    mutationFn: rejectProspect,
    onSuccess: () => refetchProspects(),
  })

  const scoredCount = leads.filter(l => l.ai_score !== null).length
  const avgScore = scoredCount
    ? Math.round(leads.filter(l => l.ai_score !== null).reduce((s, l) => s + l.ai_score, 0) / scoredCount)
    : 0
  const highPriorityCount = leads.filter(l => l.ai_score !== null && l.ai_score >= 75).length
  const pendingProspects = prospects.filter(p => p.status === 'pending').length

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'leads', label: 'Lead Scoring', icon: Brain },
    { id: 'prospects', label: 'Prospección IA', icon: UserSearch },
    { id: 'funnel', label: 'Embudo', icon: TrendingUp },
    { id: 'log', label: 'Actividad Agente', icon: Activity },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0C0720] text-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/10 bg-[#0F0A1E]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">Inteligencia Agéntica</h1>
              <p className="text-xs text-white/40">Lead scoring · Prospección · Análisis de fuentes</p>
            </div>
          </div>

          {/* Project selector */}
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="bg-[#1A1033] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80"
          >
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <KpiCard label="Leads analizados" value={`${scoredCount}/${leads.length}`}
            icon={Brain} color="bg-purple-500/20 text-purple-300" />
          <KpiCard label="Score promedio" value={avgScore || '—'}
            sub="0–100" icon={Target} color="bg-blue-500/20 text-blue-300" />
          <KpiCard label="Alta prioridad" value={highPriorityCount}
            sub="Score ≥ 75" icon={Zap} color="bg-yellow-500/20 text-yellow-300" />
          <KpiCard label="Prospectos pendientes" value={pendingProspects}
            icon={Users} color="bg-green-500/20 text-green-300" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 bg-[#0F0A1E] border-b border-white/10">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-all
                ${tab === t.id ? 'bg-[#0C0720] text-white border-t border-x border-white/10' : 'text-white/40 hover:text-white/70'}`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── LEADS TAB ─────────────────────────────────────────────────── */}
        {tab === 'leads' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">
                Selecciona un lead para ver el análisis IA completo, o analiza todos los pendientes de una vez.
              </p>
              <button
                onClick={analyzeAllFn}
                disabled={!!analyzingId}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-all"
              >
                {analyzingId ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Analizar todos
              </button>
            </div>

            {leads.length === 0 && (
              <div className="text-center py-16 text-white/30">
                <Brain size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay leads para este proyecto</p>
              </div>
            )}

            <div className="space-y-2">
              {leads.map((lead: any) => (
                <div key={lead.id} className="bg-[#1A1033] border border-white/10 rounded-xl overflow-hidden">
                  {/* Lead row */}
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/5 transition-all"
                    onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                  >
                    {/* Score badge */}
                    <div className={`w-14 text-center rounded-lg px-2 py-1 text-sm font-bold ${scoreColor(lead.ai_score)}`}>
                      {lead.ai_score !== null ? lead.ai_score : '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{lead.full_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                          {STATUS_LABELS[lead.status] ?? lead.status}
                        </span>
                        {lead.ai_score !== null && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${scoreColor(lead.ai_score)}`}>
                            {scoreLabel(lead.ai_score)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5 flex items-center gap-3">
                        <span>Fuente: {lead.source}</span>
                        {lead.ai_analyzed_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle size={10} className="text-green-400" />
                            Analizado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Signals preview */}
                    {lead.ai_signals && lead.ai_signals.length > 0 && (
                      <div className="hidden md:flex gap-1 flex-wrap max-w-xs">
                        {lead.ai_signals.slice(0, 3).map((sig: any, i: number) => (
                          <span key={i}
                            className={`text-[10px] px-2 py-0.5 rounded-full ${sig.positive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {sig.positive ? '+' : '−'} {sig.signal.split(' ').slice(0, 3).join(' ')}
                          </span>
                        ))}
                        {lead.ai_signals.length > 3 && (
                          <span className="text-[10px] text-white/30">+{lead.ai_signals.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Action */}
                    <div className="flex items-center gap-2">
                      {lead.ai_score === null ? (
                        <button
                          onClick={e => { e.stopPropagation(); analyzeLeadFn(lead.id) }}
                          disabled={analyzingId === lead.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-all"
                        >
                          {analyzingId === lead.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Sparkles size={12} />}
                          Analizar
                        </button>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); analyzeLeadFn(lead.id) }}
                          disabled={analyzingId === lead.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg text-xs text-white/50 transition-all"
                        >
                          {analyzingId === lead.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Re-analizar
                        </button>
                      )}
                      <ChevronRight size={14} className={`text-white/30 transition-transform ${expandedLead === lead.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {expandedLead === lead.id && lead.ai_score !== null && (
                    <div className="border-t border-white/10 px-5 py-4 bg-[#150D2A] space-y-4">
                      {/* Brief */}
                      {lead.ai_brief && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-400 mb-1">Briefing IA</p>
                          <p className="text-sm text-white/80 leading-relaxed">{lead.ai_brief}</p>
                        </div>
                      )}

                      {/* Recommended action */}
                      {lead.ai_recommended_action && (
                        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                          <Zap size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] font-semibold text-yellow-400 mb-0.5">ACCIÓN RECOMENDADA</p>
                            <p className="text-sm text-white/80">{lead.ai_recommended_action}</p>
                          </div>
                        </div>
                      )}

                      {/* Signals grid */}
                      {lead.ai_signals && lead.ai_signals.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">Señales detectadas</p>
                          <div className="flex flex-wrap gap-2">
                            {lead.ai_signals.map((sig: any, i: number) => (
                              <span key={i}
                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${sig.positive ? 'bg-green-500/15 text-green-300 border border-green-500/20' : 'bg-red-500/15 text-red-300 border border-red-500/20'}`}>
                                {sig.positive ? '▲' : '▼'} {sig.signal}
                                <span className="opacity-60 text-[10px]">({sig.weight > 0 ? '+' : ''}{sig.weight})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded — no analysis yet */}
                  {expandedLead === lead.id && lead.ai_score === null && (
                    <div className="border-t border-white/10 px-5 py-6 text-center text-white/30 text-sm bg-[#150D2A]">
                      <Brain size={28} className="mx-auto mb-2 opacity-30" />
                      <p>Este lead aún no ha sido analizado. Haz clic en "Analizar" para generar el briefing IA.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PROSPECTS TAB ──────────────────────────────────────────────── */}
        {tab === 'prospects' && (
          <div className="space-y-4">
            {/* Finder controls */}
            <div className="bg-gradient-to-r from-purple-900/40 to-violet-900/30 border border-purple-500/20 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-600/30 flex items-center justify-center shrink-0">
                  <UserSearch size={20} className="text-purple-300" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">Motor de Prospección IA</h3>
                  <p className="text-xs text-white/50 mb-3">
                    Descubre compradores potenciales simulando múltiples fuentes: listas de espera INVI, grupos de Facebook,
                    nóminas de empleadores públicos, portales OLX/Corotos, redes de la diáspora dominicana.
                    Con API key de Anthropic, los perfiles se enriquecen con IA.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white/50">Cantidad:</label>
                      <select
                        value={prospectCount}
                        onChange={e => setProspectCount(Number(e.target.value))}
                        className="bg-[#1A1033] border border-white/10 rounded-lg px-2 py-1 text-sm text-white"
                      >
                        {[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={findProspectsFn}
                      disabled={findingProspects}
                      className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-all"
                    >
                      {findingProspects
                        ? <><Loader2 size={14} className="animate-spin" />Buscando prospectos…</>
                        : <><UserSearch size={14} />Buscar Prospectos</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            {prospectsData && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1A1033] border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-white">{prospectsData.total}</div>
                  <div className="text-xs text-white/40">Total descubiertos</div>
                </div>
                <div className="bg-[#1A1033] border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{prospectsData.pending}</div>
                  <div className="text-xs text-white/40">Pendientes</div>
                </div>
                <div className="bg-[#1A1033] border border-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{prospectsData.converted}</div>
                  <div className="text-xs text-white/40">Convertidos a leads</div>
                </div>
              </div>
            )}

            {/* Prospect cards */}
            {prospects.length === 0 && (
              <div className="text-center py-16 text-white/30">
                <UserSearch size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay prospectos descubiertos aún.</p>
                <p className="text-xs mt-1">Haz clic en "Buscar Prospectos" para comenzar.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prospects.map((p: any) => (
                <div key={p.id}
                  className={`bg-[#1A1033] border rounded-xl p-4 transition-all
                    ${p.status === 'converted' ? 'border-green-500/30 opacity-60' : p.status === 'rejected' ? 'border-red-500/20 opacity-40' : 'border-white/10 hover:border-purple-500/30'}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{p.full_name}</span>
                        {p.status === 'converted' && <CheckCircle size={14} className="text-green-400" />}
                        {p.status === 'rejected' && <XCircle size={14} className="text-red-400" />}
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">{p.municipality}</div>
                    </div>
                    <div className={`text-lg font-bold ${affinityColor(p.affinity_score)}`}>
                      {p.affinity_score}
                      <span className="text-xs font-normal text-white/30">/100</span>
                    </div>
                  </div>

                  {/* Source */}
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-base">{sourceIcon(p.source_platform)}</span>
                    <div>
                      <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">{p.source_platform}</div>
                      <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{p.source_context}</div>
                    </div>
                  </div>

                  {/* Income bracket */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-white/30">Ingreso estimado:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.estimated_income_bracket === 'alto' ? 'bg-green-500/20 text-green-300' :
                      p.estimated_income_bracket === 'medio' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>{p.estimated_income_bracket}</span>
                  </div>

                  {/* Actions */}
                  {p.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => convertMut.mutate(p.id)}
                        disabled={convertMut.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-all"
                      >
                        <ArrowRight size={12} />
                        Convertir a Lead
                      </button>
                      <button
                        onClick={() => rejectMut.mutate(p.id)}
                        disabled={rejectMut.isPending}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-all"
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                  {p.status === 'converted' && (
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle size={12} /> Lead creado — disponible en Comercial
                    </div>
                  )}
                  {p.status === 'rejected' && (
                    <div className="text-xs text-red-400/60 flex items-center gap-1">
                      <XCircle size={12} /> Descartado
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FUNNEL TAB ─────────────────────────────────────────────────── */}
        {tab === 'funnel' && funnelData && (
          <div className="space-y-6">
            {/* Funnel visualization */}
            <div className="bg-[#1A1033] border border-white/10 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-purple-400" />
                Embudo de Conversión
              </h3>
              {(() => {
                const f = funnelData.funnel
                const steps = [
                  { label: 'Prospectos descubiertos', value: f.prospects_discovered, color: 'bg-blue-500', max: f.prospects_discovered || 1 },
                  { label: 'Convertidos a leads', value: f.leads_total, color: 'bg-indigo-500', max: f.prospects_discovered || 1 },
                  { label: 'Contactados', value: f.leads_contactado + f.leads_calificado + f.leads_reservado, color: 'bg-purple-500', max: f.prospects_discovered || 1 },
                  { label: 'Calificados', value: f.leads_calificado + f.leads_reservado, color: 'bg-violet-500', max: f.prospects_discovered || 1 },
                  { label: 'Reservados', value: f.leads_reservado, color: 'bg-green-500', max: f.prospects_discovered || 1 },
                ]
                return (
                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-white/60">{step.label}</span>
                          <span className="text-sm font-bold text-white">{step.value}</span>
                        </div>
                        <div className="h-6 bg-white/5 rounded-lg overflow-hidden">
                          <div
                            className={`h-full ${step.color} rounded-lg transition-all`}
                            style={{ width: `${Math.max(4, (step.value / step.max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
                      <Target size={14} className="text-green-400" />
                      <span className="text-sm text-green-300 font-medium">
                        Tasa de cierre: {funnelData.conversion_rate_pct}%
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Source performance */}
            {funnelData.lead_source_performance.length > 0 && (
              <div className="bg-[#1A1033] border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-purple-400" />
                  Rendimiento por Fuente (Leads)
                </h3>
                <div className="space-y-3">
                  {funnelData.lead_source_performance
                    .sort((a: any, b: any) => (b.avg_ai_score ?? 0) - (a.avg_ai_score ?? 0))
                    .map((src: any) => (
                      <div key={src.source} className="flex items-center gap-4">
                        <div className="w-24 text-xs text-white/60 truncate capitalize">{src.source}</div>
                        <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-violet-400 rounded-full"
                            style={{ width: `${src.avg_ai_score ?? 0}%` }}
                          />
                        </div>
                        <div className="text-xs font-medium text-white w-16 text-right">
                          {src.avg_ai_score !== null ? `${src.avg_ai_score} pts` : '—'} · {src.total_leads} leads
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Prospect sources */}
            {funnelData.prospect_source_breakdown.length > 0 && (
              <div className="bg-[#1A1033] border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <UserSearch size={16} className="text-purple-400" />
                  Fuentes de Prospección IA
                </h3>
                <div className="space-y-2">
                  {funnelData.prospect_source_breakdown
                    .sort((a: any, b: any) => b.count - a.count)
                    .map((s: any) => (
                      <div key={s.source} className="flex items-center gap-3">
                        <span className="text-base w-6">{sourceIcon(s.source)}</span>
                        <div className="flex-1 text-xs text-white/60 truncate">{s.source}</div>
                        <span className="text-sm font-medium text-purple-300">{s.count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AGENT LOG TAB ──────────────────────────────────────────────── */}
        {tab === 'log' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/50">
                Registro de todas las acciones realizadas por los agentes. Se actualiza cada 8 segundos.
              </p>
              {logData && (
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span className="flex items-center gap-1">
                    <CheckCircle size={12} className="text-green-400" />
                    {logData.success_count} exitosas
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle size={12} className="text-red-400" />
                    {logData.error_count} errores
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles size={12} className="text-purple-400" />
                    {logData.llm_used_count} con LLM
                  </span>
                </div>
              )}
            </div>

            {logs.length === 0 && (
              <div className="text-center py-16 text-white/30">
                <Activity size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay actividad agéntica aún.</p>
                <p className="text-xs mt-1">Analiza un lead o busca prospectos para ver la actividad aquí.</p>
              </div>
            )}

            <div className="space-y-2">
              {logs.map((log: any) => (
                <div key={log.id}
                  className="bg-[#1A1033] border border-white/10 rounded-xl px-4 py-3 flex items-start gap-4">
                  {/* Status icon */}
                  <div className="mt-0.5">
                    {log.status === 'success'
                      ? <CheckCircle size={16} className="text-green-400" />
                      : log.status === 'error'
                        ? <XCircle size={16} className="text-red-400" />
                        : <AlertTriangle size={16} className="text-yellow-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-purple-300">{log.agent_name}</span>
                      <span className="text-white/40">·</span>
                      <span className="text-xs text-white/70">{log.action}</span>
                      {log.entity_type && (
                        <>
                          <span className="text-white/40">·</span>
                          <span className="text-xs text-white/40">{log.entity_type}</span>
                        </>
                      )}
                      {log.llm_used && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                          <Sparkles size={9} /> LLM
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50 mt-1">{log.output_summary}</div>
                    {log.error_message && (
                      <div className="text-xs text-red-400 mt-1">{log.error_message}</div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {log.confidence_score > 0 && (
                      <div className="text-xs font-medium text-white/60">{log.confidence_score}%</div>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-white/30 mt-1">
                      <Clock size={10} />
                      {log.duration_ms}ms
                    </div>
                    {log.created_at && (
                      <div className="text-[10px] text-white/20 mt-0.5">
                        {new Date(log.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
