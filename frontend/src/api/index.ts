import api from './client'

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects = () => api.get('/api/v1/projects/').then(r => r.data)
export const getProject = (id: string) => api.get(`/api/v1/projects/${id}`).then(r => r.data)
export const getProjectUnits = (id: string) => api.get(`/api/v1/projects/${id}/units`).then(r => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = (projectId: string) =>
  api.get(`/api/v1/dashboard/${projectId}`).then(r => r.data)

// ── Collections ───────────────────────────────────────────────────────────────
export const getPaymentPlans = (projectId: string) =>
  api.get(`/api/v1/payment-plans/project/${projectId}`).then(r => r.data)
export const getOverdueInstallments = () =>
  api.get('/api/v1/payment-plans/overdue').then(r => r.data)
export const approvePlan = (planId: string, approvedBy: string) =>
  api.patch(`/api/v1/payment-plans/${planId}/approve?approved_by=${approvedBy}`).then(r => r.data)
export const dispatchNotifications = (runDate?: string) =>
  api.post('/api/v1/notifications/dispatch', null, { params: runDate ? { run_date: runDate } : {} }).then(r => r.data)

// ── Finance ───────────────────────────────────────────────────────────────────
export const uploadBankStatement = (projectId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/api/v1/reconciliation/upload/${projectId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
