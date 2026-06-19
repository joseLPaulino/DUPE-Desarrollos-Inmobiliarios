import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import CollectionsPortal from './pages/CollectionsPortal'
import OverdueQueue from './pages/OverdueQueue'
import ReconciliationPage from './pages/ReconciliationPage'
import BudgetOverview from './pages/BudgetOverview'
import ProjectsPage from './pages/ProjectsPage'
import CashFlowPage from './pages/CashFlowPage'
import PredictionsPage from './pages/PredictionsPage'
import DataEntryPage from './pages/DataEntryPage'
import ExcelImportPage from './pages/ExcelImportPage'
import ContabilidadPage from './pages/ContabilidadPage'
import GoalsPage from './pages/GoalsPage'
import ComercialPage from './pages/ComercialPage'
import GestionPage from './pages/GestionPage'
import PostventaPage from './pages/PostventaPage'
import CalendarPage from './pages/CalendarPage'
import IntelligencePage from './pages/IntelligencePage'
import DataExplorerPage from './pages/DataExplorerPage'
import ViabilidadPage from './pages/ViabilidadPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="collections" element={<CollectionsPortal />} />
          <Route path="collections/overdue" element={<OverdueQueue />} />
          <Route path="overdue" element={<OverdueQueue />} />
          <Route path="finance/budget" element={<BudgetOverview />} />
          <Route path="finance/cashflow" element={<CashFlowPage />} />
          <Route path="finance/reconciliation" element={<ReconciliationPage />} />
          <Route path="finance/predictions" element={<PredictionsPage />} />
          <Route path="finance/contabilidad" element={<ContabilidadPage />} />
          <Route path="data-entry" element={<DataEntryPage />} />
          <Route path="finance/import" element={<ExcelImportPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="comercial" element={<ComercialPage />} />
          <Route path="gestion" element={<GestionPage />} />
          <Route path="postventa" element={<PostventaPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="intelligence" element={<IntelligencePage />} />
          <Route path="data-explorer" element={<DataExplorerPage />} />
          <Route path="finance/viabilidad" element={<ViabilidadPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
