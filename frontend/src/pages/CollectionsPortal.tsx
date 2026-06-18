import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, getPaymentPlans, approvePlan, dispatchNotifications } from '../api'
import { CheckCircle, Send, Clock } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

const statusStyle: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  ACTIVE:           'bg-green-100 text-green-700',
  COMPLETED:        'bg-blue-100 text-blue-700',
  CANCELLED:        'bg-gray-100 text-gray-500',
  DEFAULTED:        'bg-red-100 text-red-700',
}

export default function CollectionsPortal() {
  const qc = useQueryClient()
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const [selectedProject, setSelectedProject] = useState<string>('')
  const projectId = selectedProject || projects?.[0]?.id || ''

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans', projectId],
    queryFn: () => getPaymentPlans(projectId),
    enabled: !!projectId,
  })

  const approve = useMutation({
    mutationFn: (planId: string) => approvePlan(planId, 'jose.paulino@hcltech.com'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans', projectId] }),
  })

  const dispatch = useMutation({
    mutationFn: () => dispatchNotifications(),
    onSuccess: () => alert('Notificaciones despachadas (sintéticas). Ver logs del servidor.'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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
          onClick={() => dispatch.mutate()}
          disabled={dispatch.isPending}
          className="flex items-center gap-2 text-sm bg-brand-purple text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          <Send size={14} />
          {dispatch.isPending ? 'Despachando…' : 'Despachar Notificaciones'}
        </button>
      </div>

      <p className="text-xs text-amber-600">
        [A-WA] Mensajes enviados vía adaptador sintético — Meta Cloud API pendiente de verificación.
      </p>

      {isLoading && <div className="text-center py-12 text-gray-400">Cargando planes…</div>}

      {(plans ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Cliente', 'Unidad', 'Cuotas', 'Monto Total', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(plans ?? []).map((plan: any) => (
                <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{plan.client_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{plan.unit_id?.slice(0, 8)}…</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock size={13} className="text-gray-400" />
                      {plan.installment_count ?? '—'} cuotas
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    {plan.total_amount ? fmt(plan.total_amount) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusStyle[plan.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {plan.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {plan.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => approve.mutate(plan.id)}
                        disabled={approve.isPending}
                        className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
                      >
                        <CheckCircle size={13} />
                        Aprobar
                      </button>
                    )}
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
