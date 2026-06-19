import api from './client'

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects = () => api.get('/projects/').then(r => r.data)
export const getProject = (id: string) => api.get(`/projects/${id}`).then(r => r.data)
export const getProjectUnits = (id: string) => api.get(`/projects/${id}/units`).then(r => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = (projectId: string) =>
  api.get(`/dashboard/${projectId}`).then(r => r.data)

// ── Collections ───────────────────────────────────────────────────────────────
export const getPaymentPlans = (projectId: string) =>
  api.get(`/payment-plans/project/${projectId}`).then(r => r.data)
export const getOverdueInstallments = () =>
  api.get('/payment-plans/overdue').then(r => r.data)
export const approvePlan = (planId: string, approvedBy: string) =>
  api.patch(`/payment-plans/${planId}/approve?approved_by=${approvedBy}`).then(r => r.data)
export const dispatchNotifications = (runDate?: string) =>
  api.post('/notifications/dispatch', null, { params: runDate ? { run_date: runDate } : {} }).then(r => r.data)

// ── Finance ───────────────────────────────────────────────────────────────────
export const uploadBankStatement = (projectId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/reconciliation/upload/${projectId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export const getCashFlow = (projectId: string) =>
  api.get(`/cash-flow/${projectId}`).then(r => r.data)

export const importCashFlowExcel = (projectId: string, file: File, projectType: string) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/cash-flow/import/${projectId}?project_type=${projectType}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Predictions ───────────────────────────────────────────────────────────────
export const getPredictions = (projectId: string) =>
  api.get(`/predictions/${projectId}`).then(r => r.data)

// ── Data Entry ────────────────────────────────────────────────────────────────
export const createTransaction = (projectId: string, data: {
  description: string; amount: number; transaction_date: string;
  partida_code?: string; reference?: string;
}) => api.post(`/reconciliation/transaction/${projectId}`, data).then(r => r.data)

export const getPlanInstallments = (planId: string) =>
  api.get(`/payment-plans/${planId}/installments`).then(r => r.data)

export const notifyInstallment = (installmentId: string, channel: 'whatsapp' | 'email') =>
  api.post(`/payment-plans/installment/${installmentId}/notify?channel=${channel}`).then(r => r.data)

export const registerPayment = (installmentId: string, data: {
  paid_amount: number; paid_date: string; notes?: string;
}) => api.patch(`/payment-plans/installment/${installmentId}/pay`, data).then(r => r.data)

export const updateBudgetExecution = (data: {
  project_id: string; partida_code: string; amount: number;
  description: string; entered_by: string;
}) => api.post(`/reconciliation/execution`, data).then(r => r.data)

// ── Accounting (Contabilidad) ─────────────────────────────────────────────────
export const getInvoices = (projectId: string, params?: {
  status?: string; from_date?: string; to_date?: string;
}) => api.get(`/accounting/invoices/${projectId}`, { params }).then(r => r.data)

export const createInvoice = (projectId: string, data: {
  invoice_date: string; proveedor: string; ncf?: string; tipo: string;
  partida_code?: string; description?: string; amount: number;
  status?: string; entered_by?: string;
}) => api.post(`/accounting/invoices/${projectId}`, data).then(r => r.data)

export const updateInvoiceStatus = (invoiceId: string, status: string) =>
  api.patch(`/accounting/invoices/${invoiceId}/status?status=${status}`).then(r => r.data)

export const getBalanceGeneral = (projectId: string, asOf?: string) =>
  api.get(`/accounting/balance-general/${projectId}`, { params: asOf ? { as_of: asOf } : {} }).then(r => r.data)

export const getEstadoResultados = (projectId: string, fromDate: string, toDate: string) =>
  api.get(`/accounting/estado-resultados/${projectId}`, {
    params: { from_date: fromDate, to_date: toDate }
  }).then(r => r.data)

// ── Goals ─────────────────────────────────────────────────────────────────────
export const getGoals = (params?: { department?: string; officer_name?: string; period?: string }) =>
  api.get('/goals', { params }).then(r => r.data)

export const createGoal = (data: {
  department: string; officer_name: string; metric_name: string;
  metric_unit?: string; target_value: number; period: string; notes?: string;
}) => api.post('/goals', data).then(r => r.data)

export const deleteGoal = (goalId: string) =>
  api.delete(`/goals/${goalId}`).then(r => r.data)

export const getGoalsPerformance = (period?: string) =>
  api.get('/goals/performance', { params: period ? { period } : {} }).then(r => r.data)

// ── Comercial ─────────────────────────────────────────────────────────────────
export const getLeads = (projectId: string, params?: { status?: string; seller?: string }) =>
  api.get(`/comercial/leads/${projectId}`, { params }).then(r => r.data)
export const createLead = (projectId: string, data: {
  first_name: string; last_name: string; phone?: string; email?: string;
  source?: string; notes?: string; qualification_score?: number;
}) => api.post(`/comercial/leads/${projectId}`, data).then(r => r.data)
export const updateLeadStatus = (leadId: string, status: string, notes?: string) =>
  api.patch(`/comercial/leads/${leadId}/status`, { status, notes }).then(r => r.data)
export const getInventory = (projectId: string, availableOnly = true) =>
  api.get(`/comercial/inventory/${projectId}`, { params: { available_only: availableOnly } }).then(r => r.data)
export const toggleUnitStatus = (unitId: string, status: 'VENDIDO' | 'DISPONIBLE') =>
  api.patch(`/comercial/inventory/${unitId}/status?status=${status}`).then(r => r.data)
export const reserveUnit = (projectId: string, data: {
  unit_id: string; client_id: string; sale_date: string;
  total_amount: number; num_installments?: number; notes?: string; entered_by?: string;
}) => api.post(`/comercial/reserve/${projectId}`, data).then(r => r.data)

// ── Gestión ────────────────────────────────────────────────────────────────────
export const getGestionCases = (params?: { project_id?: string; officer?: string; fiduciaria_status?: string }) =>
  api.get('/gestion/cases', { params }).then(r => r.data)
export const createGestionCase = (data: { client_id: string; project_id: string; unit_id?: string; notes?: string }) =>
  api.post('/gestion/cases', data).then(r => r.data)
export const getGestionCase = (caseId: string) =>
  api.get(`/gestion/cases/${caseId}`).then(r => r.data)
export const updateGestionDocuments = (caseId: string, docs: {
  cedula?: string; carta_trabajo?: string; movimientos_bancarios?: string; certificacion_vivienda?: string;
}) => api.patch(`/gestion/cases/${caseId}/documents`, docs).then(r => r.data)
export const generateContract = (caseId: string) =>
  api.patch(`/gestion/cases/${caseId}/contract`).then(r => r.data)
export const setGestionAppointment = (caseId: string, appointment_date: string, appointment_time: string) =>
  api.patch(`/gestion/cases/${caseId}/appointment`, { appointment_date, appointment_time }).then(r => r.data)
export const advanceFiduciaria = (caseId: string, status: string, notes?: string) =>
  api.patch(`/gestion/cases/${caseId}/fiduciaria`, { status, notes }).then(r => r.data)
export const getOfficerAvailability = (officer: string) =>
  api.get(`/gestion/availability/${encodeURIComponent(officer)}`).then(r => r.data)

// ── Postventa ──────────────────────────────────────────────────────────────────
export const getPostventaCases = (params?: { project_id?: string; status?: string }) =>
  api.get('/postventa/cases', { params }).then(r => r.data)
export const createPostventaCase = (data: {
  client_id: string; project_id: string; unit_id?: string; assigned_officer?: string; notes?: string;
}) => api.post('/postventa/cases', data).then(r => r.data)
export const submitInspection = (caseId: string, data: {
  areas: Array<{ area: string; defects: Array<{ defect: string; notes?: string }>; image_url?: string; notes?: string }>;
  general_notes?: string;
}) => api.post(`/postventa/cases/${caseId}/inspection`, data).then(r => r.data)
export const advancePostventaStatus = (caseId: string, status: string, notes?: string, appointment_date?: string) =>
  api.patch(`/postventa/cases/${caseId}/status`, { status, notes, appointment_date }).then(r => r.data)
export const deliverUnit = (caseId: string, delivery_date: string, notes?: string) =>
  api.patch(`/postventa/cases/${caseId}/deliver`, { delivery_date, notes }).then(r => r.data)
export const getPostventaIndicators = (projectId?: string) =>
  api.get('/postventa/indicators', { params: projectId ? { project_id: projectId } : {} }).then(r => r.data)
export const getWarranties = (projectId?: string) =>
  api.get('/postventa/warranties', { params: projectId ? { project_id: projectId } : {} }).then(r => r.data)

// ── Calendar ───────────────────────────────────────────────────────────────────
export const getCalendarEvents = (params?: {
  from_date?: string; to_date?: string; event_type?: string;
  officer?: string; project_id?: string; status?: string;
}) => api.get('/calendar', { params }).then(r => r.data)

export const createCalendarEvent = (data: {
  title: string; description?: string; event_type: string;
  project_id?: string; related_case_id?: string; related_client_id?: string;
  responsible_officer?: string; event_date: string; start_time?: string; end_time?: string;
  status?: string; location?: string; notes?: string;
}) => api.post('/calendar', data).then(r => r.data)

export const updateCalendarEventStatus = (eventId: string, status: string, notes?: string) =>
  api.patch(`/calendar/${eventId}/status`, { status, notes }).then(r => r.data)

export const updateCalendarEvent = (eventId: string, data: Record<string, unknown>) =>
  api.patch(`/calendar/${eventId}`, data).then(r => r.data)

export const deleteCalendarEvent = (eventId: string) =>
  api.delete(`/calendar/${eventId}`).then(r => r.data)

// ── Intelligence ───────────────────────────────────────────────────────────────
export const analyzeLead = (leadId: string) =>
  api.post(`/intelligence/leads/${leadId}/analyze`).then(r => r.data)

export const listScoredLeads = (params?: { project_id?: string; analyzed_only?: boolean }) =>
  api.get('/intelligence/leads', { params }).then(r => r.data)

export const findProspects = (projectId: string, count = 8) =>
  api.post(`/intelligence/prospects/${projectId}`, null, { params: { count } }).then(r => r.data)

export const listProspects = (projectId: string, params?: { status?: string }) =>
  api.get(`/intelligence/prospects/${projectId}`, { params }).then(r => r.data)

export const convertProspect = (prospectId: string) =>
  api.post(`/intelligence/prospects/${prospectId}/convert`).then(r => r.data)

export const rejectProspect = (prospectId: string) =>
  api.delete(`/intelligence/prospects/${prospectId}`).then(r => r.data)

export const getIntelligenceFunnel = (projectId: string) =>
  api.get(`/intelligence/funnel/${projectId}`).then(r => r.data)

export const getAgentLog = (params?: { limit?: number; agent_name?: string }) =>
  api.get('/intelligence/agent-log', { params }).then(r => r.data)

// ── Provenance ────────────────────────────────────────────────────────────────
export const getPlanActivity = (planId: string) =>
  api.get(`/collections/plan-activity/${planId}`).then(r => r.data)

export const getLegalLetters = (planId: string) =>
  api.get(`/collections/legal-letters/${planId}`).then(r => r.data)

export const updateLetterStatus = (letterId: string, body: {
  status: string; signed_by?: string; notes?: string
}) =>
  api.patch(`/collections/legal-letters/${letterId}/status`, body).then(r => r.data)
