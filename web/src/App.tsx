import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { CampanhasIndex } from './pages/campanhas/Index'
import { CampanhaForm } from './pages/campanhas/Form'
import { CampanhaDashboard } from './pages/campanhas/CampanhaDashboard'
import { CampanhaPreview } from './pages/campanhas/Preview'
import { CatalogoTelasIndex } from './pages/catalogo/Index'
import { IntegracaoPage } from './pages/Integracao'
import { ApresentacaoPage } from './pages/Apresentacao'
import { ToursIndex } from './pages/tours/Index'
import { TourForm } from './pages/tours/Form'
import { TourPreview } from './pages/tours/Preview'
import { TourDashboard } from './pages/tours/Dashboard'
import { TourGuide } from './pages/tours/Guide'

export default function App() {
  return (
    <Routes>
      <Route path="apresentacao" element={<ApresentacaoPage />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="campanhas" element={<CampanhasIndex />} />
        <Route path="campanhas/nova" element={<CampanhaForm />} />
        <Route path="campanhas/:id/editar" element={<CampanhaForm />} />
        <Route path="campanhas/:id/dashboard" element={<CampanhaDashboard />} />
        <Route path="campanhas/:id/preview" element={<CampanhaPreview />} />
        <Route path="tours" element={<ToursIndex />} />
        <Route path="tours/guia" element={<TourGuide />} />
        <Route path="tours/novo" element={<TourForm />} />
        <Route path="tours/:id/editar" element={<TourForm />} />
        <Route path="tours/:id/preview" element={<TourPreview />} />
        <Route path="tours/:id/dashboard" element={<TourDashboard />} />
        <Route path="catalogo-telas" element={<CatalogoTelasIndex />} />
        <Route path="integracao" element={<IntegracaoPage />} />
      </Route>
    </Routes>
  )
}
