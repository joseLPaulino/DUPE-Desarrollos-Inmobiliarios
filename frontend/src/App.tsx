import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import CollectionsPortal from './pages/CollectionsPortal'
import OverdueQueue from './pages/OverdueQueue'
import ReconciliationPage from './pages/ReconciliationPage'
import BudgetOverview from './pages/BudgetOverview'
import ProjectsPage from './pages/ProjectsPage'

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
          <Route path="finance/budget" element={<BudgetOverview />} />
          <Route path="finance/reconciliation" element={<ReconciliationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
