import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { CampanhasIndex } from './pages/campanhas/Index'
import { CampanhaForm } from './pages/campanhas/Form'
import { CampanhaDashboard } from './pages/campanhas/CampanhaDashboard'
import { CampanhaPreview } from './pages/campanhas/Preview'
import { WidgetPreview } from './pages/WidgetPreview'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="campanhas" element={<CampanhasIndex />} />
        <Route path="campanhas/nova" element={<CampanhaForm />} />
        <Route path="campanhas/:id/editar" element={<CampanhaForm />} />
        <Route path="campanhas/:id/dashboard" element={<CampanhaDashboard />} />
        <Route path="campanhas/:id/preview" element={<CampanhaPreview />} />
        <Route path="widget" element={<WidgetPreview />} />
      </Route>
    </Routes>
  )
}
