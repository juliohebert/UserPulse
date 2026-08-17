import type { ReactNode } from 'react'
import { AuthProductPreview } from './AuthProductPreview'
import type { CadastroConfig } from '../../types'

interface Beneficio {
  texto: string
}

interface DestaqueTrial {
  icon: string
  titulo: string
  descricao: string
}

function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

// null = sem limite (mesma convenção já usada em Cadastro.tsx) — nunca
// deveria acontecer pro plano de trial hoje, mas cobre o caso sem inventar
// "0" nem quebrar a frase.
function parteLimite(n: number | null, singular: string, plural: string, ilimitado: string): string {
  return n != null ? contagem(n, singular, plural) : ilimitado
}

// Os 3 destaques do trial na coluna institucional do login — só dados já
// resolvidos pelo backend (GET /auth/cadastro/config), nunca uma regra
// comercial recalculada aqui. "Evolua quando precisar" não depende da
// config (nunca menciona plano/preço específico, ver regra explícita da
// tarefa), por isso é o único que aparece mesmo se a busca falhar.
function destaquesTrial(config: CadastroConfig | null | undefined): DestaqueTrial[] {
  const destaques: DestaqueTrial[] = []
  if (config && config.dias > 0) {
    destaques.push({
      icon: 'auto_awesome',
      titulo: contagem(config.dias, 'dia grátis', 'dias grátis'),
      descricao: 'Comece agora, sem cartão de crédito.',
    })
    destaques.push({
      icon: 'explore',
      titulo: 'Explore na prática',
      descricao: `${parteLimite(config.limite_campanhas_ativas, 'campanha', 'campanhas', 'campanhas ilimitadas')}, ${
        parteLimite(config.limite_tours_ativos, 'tour', 'tours', 'tours ilimitados')} e ${
        parteLimite(config.limite_jornadas_ativas, 'jornada', 'jornadas', 'jornadas ilimitadas')}.`,
    })
  }
  destaques.push({
    icon: 'trending_up',
    titulo: 'Evolua quando precisar',
    descricao: 'Escolha o plano ideal depois do período grátis.',
  })
  return destaques
}

const BENEFICIOS_PADRAO: Beneficio[] = [
  { texto: 'Campanhas in-app' },
  { texto: 'Tours guiados' },
  { texto: 'Jornadas contextualizadas' },
]

const TEXTO_VALOR_PADRAO = 'Crie campanhas, tours guiados e jornadas dentro do seu produto, sem instalar nada além do widget.'

interface AuthLayoutProps {
  tituloForm: string
  subtituloForm?: string
  headlineBranding?: string
  textoBranding?: string
  beneficios?: Beneficio[]
  // Troca a lista estática de benefícios por uma mini demonstração
  // interativa (ver AuthProductPreview.tsx) — opt-in, default false.
  // Prioridade desta melhoria é /login (ver pages/Login.tsx); as outras
  // telas continuam com a lista simples até fazer sentido estender.
  mostrarPreview?: boolean
  // Config real do trial (dias + limites), pros 3 destaques no quadrante de
  // texto — sempre resolvida por quem chama (ver pages/Login.tsx, que busca
  // em GET /auth/cadastro/config, o mesmo endpoint público já usado por
  // Cadastro.tsx). Nunca recalculada/hardcoded aqui: null/undefined ou
  // falha na busca só reduz pra 1 destaque (o que não depende de config,
  // ver destaquesTrial acima), nunca quebra a tela nem inventa número.
  trialConfig?: CadastroConfig | null
  // true enquanto GET /auth/cadastro/config ainda não resolveu (ver
  // hooks/useCadastroConfig.ts) — distingue "carregando" de "resolvido sem
  // dados" (trialConfig null por erro real). Enquanto true, os trechos que
  // dependem da config (destaques do preview, headline/benefícios de
  // Cadastro.tsx) mostram um skeleton do MESMO tamanho do conteúdo final
  // em vez de um fallback provisório — é isso que elimina o flash/layout
  // shift quando a resposta chega. Default false (comportamento antigo,
  // sem skeleton) pras telas que não usam este hook.
  configCarregando?: boolean
  esconderInstitucionalMobile?: boolean
  children: ReactNode
}

// Casca visual compartilhada pelas 4 telas públicas de autenticação (login,
// cadastro, esqueci-senha, redefinir-senha) — só layout e branding são
// compartilhados aqui, cada página continua dona do próprio estado, lógica
// e validação, passados como children. Segue DESIGN.md: canvas branco,
// coluna institucional escura, botões pill e hierarquia tipográfica SF/Apple.
//
// Mobile e desktop são o MESMO componente/JSX, reordenados via CSS (flex
// `order` no mobile, que também funciona pra posicionamento em grid no
// desktop) — nunca dois layouts duplicados. Container é `flex flex-col` por
// padrão (mobile) e vira `lg:grid lg:grid-cols-2` a partir do breakpoint
// lg. Header compacto (só logo/wordmark) aparece primeiro no mobile,
// seguido do formulário (sempre na primeira viewport, sem precisar rolar
// por uma seção institucional inteira) e só depois a coluna institucional
// completa, resumida — no desktop essa mesma coluna vira a coluna esquerda
// de sempre, com o header compacto escondido (`lg:hidden`, já mostrado
// dentro da própria coluna institucional nesse tamanho).
export function AuthLayout({
  tituloForm, subtituloForm, headlineBranding, textoBranding, beneficios, mostrarPreview, trialConfig, configCarregando, esconderInstitucionalMobile, children,
}: AuthLayoutProps) {
  const beneficiosFinais = beneficios ?? BENEFICIOS_PADRAO
  const headline = headlineBranding ?? 'Comunique, oriente e engaje usuários dentro do seu produto.'
  const texto = textoBranding ?? TEXTO_VALOR_PADRAO
  const destaques = destaquesTrial(trialConfig)
  const usarDestaquesDetalhados = esconderInstitucionalMobile && !mostrarPreview

  return (
    <div className="min-h-[100dvh] lg:h-screen bg-background flex flex-col lg:grid lg:grid-cols-2">
      {/* Header compacto — só no mobile, sempre primeiro (sem order, fica
          antes do formulário e da coluna institucional na sequência do
          flex). Some inteiro no desktop, onde a coluna institucional já
          traz logo/wordmark em tamanho cheio. */}
      <div className="lg:hidden flex items-center gap-3 px-4 sm:px-6 py-4 bg-primary text-white">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined ms-fill text-[18px]">pulse_alert</span>
        </div>
        <span className="text-title-md font-semibold">UserPulse</span>
      </div>

      {/* Formulário — segundo no mobile (primeira viewport, logo após o
          header compacto), coluna direita no desktop. */}
      <div className="order-1 lg:order-2 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-5 sm:mb-6 lg:mb-7">
            <h2 className="text-title-lg sm:text-headline-md font-semibold text-on-background">{tituloForm}</h2>
            {subtituloForm && <p className="text-body-md text-outline mt-1.5">{subtituloForm}</p>}
          </div>
          {children}
        </div>
      </div>

      {/* Coluna institucional — terceiro/resumida no mobile (depois do
          formulário, nunca antes), coluna esquerda completa no desktop.
          justify-center saiu daqui (ver os dois ramos abaixo): a
          composição diagonal do preview não pode ficar centralizada como
          um bloco único, então cada ramo cuida do próprio alinhamento
          vertical no desktop. */}
      <div className={`order-2 lg:order-1 relative overflow-hidden bg-primary text-white px-4 py-6 sm:px-6 sm:py-8 ${mostrarPreview || esconderInstitucionalMobile ? 'hidden lg:flex lg:flex-col' : 'lg:flex lg:flex-col'} ${mostrarPreview ? 'lg:p-10 auth-inst-col' : 'lg:p-14'}`}>
        {/* Formas decorativas, só no desktop — no mobile a coluna já é
            compacta, não sobra altura pra elas respirarem direito. */}
        <div className="hidden lg:block pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="hidden lg:block pointer-events-none absolute -bottom-28 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />

        {mostrarPreview ? (
          // Matriz 2x2 diagonal — só quando o preview é mostrado (hoje só
          // /login). Linha 1/coluna 1: texto. Linha 2/coluna 2: preview.
          // As outras duas células ficam vazias de propósito (nunca
          // preenchidas com decoração ou conteúdo extra) — é isso que cria
          // o movimento diagonal. grid-rows auto/auto (não 1fr/1fr, e sem
          // h-full no container): cada linha ocupa só a altura do próprio
          // conteúdo, então o preview começa logo depois do bloco de texto
          // (mais gap-y), não empurrado pro fim de uma célula "esticada"
          // artificialmente. No mobile (sem `lg:`), este wrapper continua
          // um bloco comum: texto e preview empilhados na ordem do DOM,
          // exatamente como antes.
          <div className="relative max-w-md mx-auto lg:h-full lg:max-w-none lg:mx-0 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto] lg:gap-x-12 lg:gap-y-5 auth-inst-grid">
            <div className="lg:col-start-1 lg:row-start-1">
              {/* Logo/wordmark em tamanho cheio — só no desktop, o mobile
                  já mostrou a versão compacta no header acima. */}
              <div className="hidden lg:flex items-center gap-3 mb-6 auth-inst-logo">
                <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined ms-fill text-[22px]">pulse_alert</span>
                </div>
                <span className="text-title-lg font-bold">UserPulse</span>
              </div>
              <h1 className="text-title-md lg:text-headline-lg font-semibold mb-2 lg:mb-3 leading-tight">{headline}</h1>
              <p className="text-body-sm lg:text-body-lg text-white/85">{texto}</p>

              {/* 3 destaques do trial — dias/limites só aparecem quando a
                  config real veio de GET /auth/cadastro/config (ver
                  pages/Login.tsx); "Evolua quando precisar" nunca depende
                  disso (ver destaquesTrial acima), então continua
                  aparecendo mesmo se a busca falhar. Compacto de propósito
                  (padding/gap menores que o card único de antes) — 3 itens
                  precisam continuar formando um conjunto elegante, sem
                  reabrir o espaço vertical já corrigido. */}
              {/* Skeleton com os MESMOS 3 itens/classes do estado de sucesso
                  (nunca um fallback menor "provisório") — altura desta
                  célula da matriz diagonal fica estável entre carregando e
                  sucesso, então o preview (linha 2) não salta de posição
                  quando a resposta chega. Barras em `1em` dentro dos
                  próprios `<p>` com a classe de texto real (text-body-sm/
                  text-label-sm) pra garantir a mesma altura de linha do
                  conteúdo final, sem adivinhar px. Só o caminho de erro
                  (config resolve pra null) ainda reduz pra 1 card — mesmo
                  comportamento seguro de sempre, nunca escondido atrás de
                  skeleton infinito. */}
              <div className="mt-4 space-y-1.5 auth-inst-cards">
                {configCarregando ? (
                  [0, 1, 2].map(i => (
                    <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20" aria-hidden="true">
                      <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0 opacity-0">circle</span>
                      <div>
                        <p className="text-body-sm font-bold leading-tight">
                          <span className="inline-block h-[1em] w-24 rounded bg-white/20 animate-pulse align-middle" />
                        </p>
                        <p className="text-label-sm text-white/75 mt-0.5">
                          <span className="inline-block h-[1em] w-36 rounded bg-white/15 animate-pulse align-middle" />
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  destaques.map(d => (
                    <div key={d.titulo} className="flex items-start gap-2.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20">
                      <span className="material-symbols-outlined ms-fill text-[16px] mt-0.5 shrink-0">{d.icon}</span>
                      <div>
                        <p className="text-body-sm font-bold leading-tight">{d.titulo}</p>
                        <p className="text-label-sm text-white/75 mt-0.5">{d.descricao}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* -mt-32 (128px) só no desktop: sobe o preview dentro da própria
                célula do grid, aproveitando o espaço livre do quadrante
                vazio acima dela na matriz diagonal — sem mexer em gap-y-5
                (que também é usado pela compactação de altura curta acima)
                nem em posição horizontal/tamanho/matriz diagonal. Evita
                corte inferior em viewport útil menor mantendo o visual já
                aprovado. */}
            <div className="hidden sm:block sm:mt-5 lg:absolute lg:right-0 lg:bottom-0 lg:mt-0 lg:w-full lg:max-w-sm">
              <AuthProductPreview />
            </div>
          </div>
        ) : (
          <div className="relative max-w-md mx-auto lg:mx-0 lg:my-auto">
            {/* Logo/wordmark em tamanho cheio — só no desktop, o mobile já
                mostrou a versão compacta no header acima. */}
            <div className="hidden lg:flex items-center gap-3 mb-8">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined ms-fill text-[22px]">pulse_alert</span>
              </div>
              <span className="text-title-lg font-bold">UserPulse</span>
            </div>

            {/* Skeleton do headline (Cadastro.tsx troca o texto conforme a
                config chega — "Comece seu teste grátis" nunca deve aparecer
                como fallback provisório pra depois virar "Teste grátis por
                N dias"; ver configCarregando acima). Barra em `1em` dentro
                do próprio `<h1>` pra herdar exatamente a altura de linha do
                texto real, sem adivinhar px. */}
            <h1 className="text-title-md lg:text-headline-lg font-semibold mb-2 lg:mb-3 leading-tight">
              {configCarregando
                ? <span className="inline-block h-[1em] w-3/4 rounded bg-white/20 animate-pulse align-middle" aria-hidden="true" />
                : headline}
            </h1>
            <p className="text-body-sm lg:text-body-lg text-white/85 mb-4 lg:mb-8">{texto}</p>

            {/* Mesmo raciocínio da matriz diagonal acima: skeleton com 4
                itens (o total real depois que a config de Cadastro.tsx
                carrega — 3 dinâmicos + 1 estático) pra reservar a mesma
                altura da lista final e nunca mostrar a lista de 1 item só
                (o fallback de erro) como se fosse o estado normal. */}
            {configCarregando ? (
              <ul className={usarDestaquesDetalhados ? 'space-y-2.5 lg:space-y-3' : 'space-y-2 lg:space-y-3'} aria-hidden="true">
                {Array.from({ length: usarDestaquesDetalhados ? 3 : 4 }, (_, i) => (
                  <li key={i} className={usarDestaquesDetalhados
                    ? 'flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-body-sm lg:text-body-md'
                    : 'flex items-center gap-2 lg:gap-2.5 text-body-sm lg:text-body-md'}>
                    <span className="material-symbols-outlined text-[18px] lg:text-[20px] shrink-0 opacity-0">check_circle</span>
                    {usarDestaquesDetalhados ? (
                      <span>
                        <span className="block h-[1em] w-32 rounded bg-white/20 animate-pulse" />
                        <span className="mt-1.5 block h-[1em] w-48 rounded bg-white/15 animate-pulse" />
                      </span>
                    ) : (
                      <span className="inline-block h-[1em] w-40 rounded bg-white/20 animate-pulse align-middle" />
                    )}
                  </li>
                ))}
              </ul>
            ) : usarDestaquesDetalhados ? (
              <ul className="space-y-2.5 lg:space-y-3">
                {destaques.map(d => (
                  <li key={d.titulo} className="flex items-start gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-body-sm lg:text-body-md">
                    <span className="material-symbols-outlined ms-fill text-[18px] lg:text-[20px] shrink-0 mt-0.5">{d.icon}</span>
                    <span>
                      <span className="block font-bold leading-tight">{d.titulo}</span>
                      <span className="mt-1 block text-label-sm lg:text-body-sm leading-snug text-white/75">{d.descricao}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5 lg:space-y-3">
                {beneficiosFinais.map(b => (
                  <li key={b.texto} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-body-sm lg:text-body-md">
                    <span className="material-symbols-outlined ms-fill text-[18px] lg:text-[20px] shrink-0">check_circle</span>
                    <span className="font-semibold">{b.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
