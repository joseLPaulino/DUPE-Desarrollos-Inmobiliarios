import { useQuery } from '@tanstack/react-query'
import { getOverdueInstallments } from '../api'
import { AlertTriangle, Scale, User } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n)

const escalationConfig = {
  OFFICER: {
    label: 'Oficial D+1',
    icon: User,
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  MANAGEMENT: {
    label: 'Gerencia D+6',
    icon: AlertTriangle,
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
  },
  LEGAL: {
    label: 'Legal D+16',
    icon: Scale,
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
  },
  NONE: {
    label: 'Al día',
    icon: User,
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-600',
  },
}

type EscLevel = keyof typeof escalationConfig

export default function OverdueQueue() {
  const { data: installments, isLoading } = useQuery({
    queryKey: ['overdue'],
    queryFn: getOverdueInstallments,
  })

  const grouped = (installments ?? []).reduce((acc: Record<string, any[]>, inst: any) => {
    const lvl: EscLevel = inst.escalation_level ?? 'NONE'
    if (!acc[lvl]) acc[lvl] = []
    acc[lvl].push(inst)
    return acc
  }, {})

  const order: EscLevel[] = ['LEGAL', 'MANAGEMENT', 'OFFICER']

  if (isLoading) return <div className="text-center py-16 text-gray-400">Cargando morosidad…</div>

  const total = (installments ?? []).length
  if (total === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-green-500 text-3xl mb-2">✓</div>
        <p className="text-gray-500">Sin cuotas morosas — ¡excelente!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-amber-600">
        [A-WA] Escalaciones gestionadas vía adaptador sintético. D+1 → oficial, D+6 → gerencia, D+16 → legal.
      </p>

      {order.map(lvl => {
        const items = grouped[lvl]
        if (!items?.length) return null
        const cfg = escalationConfig[lvl]
        const Icon = cfg.icon
        return (
          <div key={lvl} className={`rounded-xl border ${cfg.bg} overflow-hidden`}>
            <div className={`px-5 py-3 flex items-center gap-2 border-b ${cfg.bg}`}>
              <Icon size={15} className={cfg.text} />
              <span className={`font-semibold text-sm ${cfg.text}`}>{cfg.label}</span>
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
                {items.length} cuota{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['# Cuota', 'Vencimiento', 'Monto', 'Días Mora', 'WhatsApp'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((inst: any) => (
                    <tr key={inst.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{inst.installment_number}</td>
                      <td className="px-4 py-2.5 text-gray-700">{inst.due_date}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                        {inst.amount_due ? fmt(inst.amount_due) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-bold ${cfg.text}`}>{inst.days_overdue ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {inst.whatsapp ?? '[A-WA] pendiente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
