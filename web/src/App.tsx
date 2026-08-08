import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireSuperAdmin } from './components/auth/RequireSuperAdmin'
import { RequireSenhaAtualizada } from './components/auth/RequireSenhaAtualizada'
import { RequireEscritaConteudo } from './components/auth/RequireEscritaConteudo'
import { RequireEscritaConfiguracao } from './components/auth/RequireEscritaConfiguracao'
import { LoginPage } from './pages/Login'
import { TrocarSenhaPage } from './pages/TrocarSenha'
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
import { TourGravador } from './pages/tours/Gravador'
import { JornadasIndex } from './pages/jornadas/Index'
import { JornadaForm } from './pages/jornadas/Form'
import { AparenciaWidgetPage } from './pages/AparenciaWidget'
import { MinhaAssinatura } from './pages/MinhaAssinatura'
import { AdminTenantsIndex } from './pages/admin/Tenants'
import { AdminPlanosIndex } from './pages/admin/Planos'

export default function App() {
  return (
    <Routes>
      <Route path="apresentacao" element={<ApresentacaoPage />} />
      <Route path="login" element={<LoginPage />} />
      {/* Todo o painel exige sessão — RequireAuth redireciona pra /login sem
          usuário logado (ver web/src/components/auth/RequireAuth.tsx). */}
      <Route element={<RequireAuth />}>
        {/* /trocar-senha fica FORA de RequireSenhaAtualizada de propósito —
            é o próprio destino do redirect obrigatório, entraria em loop se
            estivesse dentro do guard (ver RequireSenhaAtualizada.tsx). */}
        <Route path="trocar-senha" element={<TrocarSenhaPage />} />
        {/* Usuário com senha temporária não navega pro painel antes de
            trocar a própria senha (ver RequireSenhaAtualizada.tsx). */}
        <Route element={<RequireSenhaAtualizada />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="campanhas" element={<CampanhasIndex />} />
            <Route path="campanhas/:id/dashboard" element={<CampanhaDashboard />} />
            <Route path="campanhas/:id/preview" element={<CampanhaPreview />} />
            <Route path="tours" element={<ToursIndex />} />
            <Route path="tours/:id/preview" element={<TourPreview />} />
            <Route path="tours/:id/dashboard" element={<TourDashboard />} />
            <Route path="jornadas" element={<JornadasIndex />} />
            <Route path="integracao" element={<IntegracaoPage />} />
            {/* Criação/edição de campanhas, tours e jornadas (inclui o
                Gravador de fluxo) — RBAC real: VIEWER nunca acessa, o
                backend (requireEscritaConteudo) bloqueia com 403 mesmo se
                alguém pular este guard (ver RequireEscritaConteudo.tsx).
                tours/guia fica FORA (é só documentação de como criar tours,
                sem ação de escrita — ok pra qualquer papel ler). */}
            <Route element={<RequireEscritaConteudo />}>
              <Route path="campanhas/nova" element={<CampanhaForm />} />
              <Route path="campanhas/:id/editar" element={<CampanhaForm />} />
              <Route path="tours/gravador" element={<TourGravador />} />
              <Route path="tours/novo" element={<TourForm />} />
              <Route path="tours/:id/editar" element={<TourForm />} />
              <Route path="jornadas/novo" element={<JornadaForm />} />
              <Route path="jornadas/:id/editar" element={<JornadaForm />} />
            </Route>
            <Route path="tours/guia" element={<TourGuide />} />
            {/* Configuração do tenant (aparência do widget, catálogo de
                telas) — RBAC real: só ADMIN/SUPER_ADMIN, EDITOR e VIEWER
                nunca acessam (ver RequireEscritaConfiguracao.tsx). Backend
                (requireEscritaConfiguracao) bloqueia a escrita com 403 mesmo
                se alguém pular este guard. */}
            <Route element={<RequireEscritaConfiguracao />}>
              <Route path="catalogo-telas" element={<CatalogoTelasIndex />} />
              <Route path="aparencia-widget" element={<AparenciaWidgetPage />} />
              {/* Fase 5 — "Minha assinatura" (billing self-service). Mesmo
                  guard de aparência/catálogo (ADMIN-only dentro do próprio
                  tenant) porque billing é sensível o bastante pra restringir
                  até a leitura, não só a escrita — mesma regra já aplicada
                  no backend (requireEscritaConfiguracao em routes/billing.ts). */}
              <Route path="minha-assinatura" element={<MinhaAssinatura />} />
            </Route>
            {/* Painel Super Admin — RequireSuperAdmin manda ADMIN comum de
                volta pro dashboard; o backend (requireSuperAdmin.ts) também
                bloqueia com 403, então nenhuma chamada de API teria sucesso
                mesmo pulando este guard. */}
            <Route element={<RequireSuperAdmin />}>
              <Route path="admin/tenants" element={<AdminTenantsIndex />} />
              <Route path="admin/planos" element={<AdminPlanosIndex />} />
            </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
