import { Navigate, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireSuperAdmin } from './components/auth/RequireSuperAdmin'
import { RequireSenhaAtualizada } from './components/auth/RequireSenhaAtualizada'
import { RequireAcessoModulo } from './components/auth/RequireAcessoModulo'
import { RequireEscritaConfiguracao } from './components/auth/RequireEscritaConfiguracao'
import { LoginPage } from './pages/Login'
import { CadastroPage } from './pages/Cadastro'
import { EsqueciSenhaPage } from './pages/EsqueciSenha'
import { RedefinirSenhaPage } from './pages/RedefinirSenha'
import { TrocarSenhaPage } from './pages/TrocarSenha'
import { MinhaContaPage } from './pages/MinhaConta'
import { Dashboard } from './pages/Dashboard'
import { CampanhasIndex } from './pages/campanhas/Index'
import { CampanhaFormIndex } from './pages/campanhas/CampanhaForm'
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
import { SistemasPage } from './pages/Sistemas'
import { MinhaAssinatura } from './pages/MinhaAssinatura'
import { AdminTenantsIndex } from './pages/admin/Tenants'
import { AdminPlanosIndex } from './pages/admin/Planos'

export default function App() {
  return (
    <Routes>
      <Route path="apresentacao" element={<ApresentacaoPage />} />
      <Route path="login" element={<LoginPage />} />
      {/* Fase 6B — cadastro público self-service. Pública pelo mesmo motivo
          de /login: é o próprio ato de criar a conta, sem sessão ainda (ver
          server/src/routes/auth.ts). */}
      <Route path="cadastro" element={<CadastroPage />} />
      {/* "Esqueci minha senha" — mesmo motivo, sem sessão ainda. */}
      <Route path="esqueci-senha" element={<EsqueciSenhaPage />} />
      <Route path="redefinir-senha" element={<RedefinirSenhaPage />} />
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
            {/* Minha conta — sem guard de escrita/configuração: qualquer
                papel autenticado só edita a própria senha aqui, nunca dados
                de outra pessoa nem nada administrativo (ver MinhaConta.tsx,
                reaproveita POST /auth/trocar-senha). */}
            <Route path="minha-conta" element={<MinhaContaPage />} />

            {/* Fase 4 de permissões personalizadas — cada módulo (Campanhas/
                Tours/Jornadas/Configurações) tem seu próprio guard de
                VISUALIZAR (leitura, inclusive a rota em si) e de GERENCIAR
                (criar/editar/gravador), em vez do antigo grupo único
                "conteúdo" que tratava os 3 como uma coisa só (ver
                RequireAcessoModulo.tsx). NENHUM no módulo bloqueia a rota
                inteira, mesmo o acesso direto por URL — o backend
                (requireAcessoModulo/requireEscritaConteudo, ver
                server/src/middleware/) já bloqueia com 403 mesmo que
                alguém contorne esta tela. */}
            <Route element={<RequireAcessoModulo modulo="CAMPANHAS" nivel="VISUALIZAR" />}>
              <Route path="campanhas" element={<CampanhasIndex />} />
              <Route path="campanhas/:id/dashboard" element={<CampanhaDashboard />} />
              <Route path="campanhas/:id/preview" element={<CampanhaPreview />} />
            </Route>
            <Route element={<RequireAcessoModulo modulo="CAMPANHAS" nivel="GERENCIAR" />}>
              <Route path="campanhas-2" element={<Navigate to="/campanhas/nova" replace />} />
              <Route path="campanhas/nova" element={<CampanhaFormIndex />} />
              <Route path="campanhas/:id/editar" element={<CampanhaFormIndex />} />
              <Route path="campanhas2/:id/editar" element={<CampanhaFormIndex />} />
            </Route>

            {/* tours/guia fica dentro do VISUALIZAR (é só documentação de
                como criar tours, sem ação de escrita, mas ainda é conteúdo
                do módulo TOURS — sem VISUALIZAR em TOURS, nem a documentação
                aparece). */}
            <Route element={<RequireAcessoModulo modulo="TOURS" nivel="VISUALIZAR" />}>
              <Route path="tours" element={<ToursIndex />} />
              <Route path="tours/:id/preview" element={<TourPreview />} />
              <Route path="tours/:id/dashboard" element={<TourDashboard />} />
              <Route path="tours/guia" element={<TourGuide />} />
            </Route>
            <Route element={<RequireAcessoModulo modulo="TOURS" nivel="GERENCIAR" />}>
              <Route path="tours/gravador" element={<TourGravador />} />
              <Route path="tours/novo" element={<TourForm />} />
              <Route path="tours/:id/editar" element={<TourForm />} />
            </Route>

            <Route element={<RequireAcessoModulo modulo="JORNADAS" nivel="VISUALIZAR" />}>
              <Route path="jornadas" element={<JornadasIndex />} />
            </Route>
            <Route element={<RequireAcessoModulo modulo="JORNADAS" nivel="GERENCIAR" />}>
              <Route path="jornadas/novo" element={<JornadaForm />} />
              <Route path="jornadas/:id/editar" element={<JornadaForm />} />
            </Route>

            {/* Configuração do tenant (aparência do widget, catálogo de
                telas, sistemas, integração) — desde a Fase 4, VISUALIZAR já
                dá acesso de leitura à rota (antes era ADMIN/SUPER_ADMIN-only
                mesmo pra ler, um mismatch com o backend que sempre deixou o
                GET aberto, ver relatório da Fase 1); GERENCIAR (criar/
                editar/excluir) é checado botão a botão dentro de cada
                página (ver SistemasPage.tsx/catalogo/Index.tsx/
                AparenciaWidget.tsx), não a rota inteira. */}
            <Route element={<RequireAcessoModulo modulo="CONFIGURACOES" nivel="VISUALIZAR" />}>
              <Route path="configuracoes" element={<Navigate to="/configuracoes/sistemas" replace />} />
              <Route path="configuracoes/sistemas" element={<SistemasPage />} />
              <Route path="configuracoes/telas" element={<CatalogoTelasIndex />} />
              <Route path="configuracoes/aparencia" element={<AparenciaWidgetPage />} />
              <Route path="configuracoes/integracao" element={<IntegracaoPage />} />
              <Route path="sistemas" element={<Navigate to="/configuracoes/sistemas" replace />} />
              <Route path="catalogo-telas" element={<Navigate to="/configuracoes/telas" replace />} />
              <Route path="aparencia-widget" element={<Navigate to="/configuracoes/aparencia" replace />} />
              <Route path="integracao" element={<Navigate to="/configuracoes/integracao" replace />} />
            </Route>

            {/* Fase 5 — "Minha assinatura" (billing self-service). Fica DE
                PROPÓSITO fora do módulo CONFIGURACOES/da personalização (ver
                RequireEscritaConfiguracao.tsx) — regra fechada da Fase 4:
                Billing mantém exatamente o comportamento anterior
                (ADMIN/SUPER_ADMIN, sem personalização), a mesma regra já
                aplicada no backend (requireEscritaConfiguracao em
                routes/billing.ts, nunca tocado pela Fase 1/2/4). */}
            <Route element={<RequireEscritaConfiguracao />}>
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
