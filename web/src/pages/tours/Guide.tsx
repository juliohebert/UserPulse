import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'

const card = 'w-full bg-surface p-6 rounded-3xl border border-outline-variant'

function SectionCard({
  icon, iconBg, iconColor, title, subtitle, children,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className={card}>
      <div className="flex items-center gap-3 mb-4">
        <span className={`p-1.5 ${iconBg} rounded-lg ${iconColor} material-symbols-outlined text-[20px] shrink-0`}>
          {icon}
        </span>
        <div>
          <h3 className="text-title-lg font-bold text-on-surface leading-tight">{title}</h3>
          {subtitle && <p className="text-label-md text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px] text-outline shrink-0 mt-0.5">info</span>
      {children}
    </p>
  )
}

const BOAS_PRATICAS = [
  { icon: 'timer', text: 'Crie tours curtos — poucos passos, direto ao ponto. Tours longos cansam e fazem o usuário abandonar no meio.' },
  { icon: 'code', text: 'Use data-cy sempre que possível. É o seletor mais estável — sobrevive a mudanças de estilo que quebrariam um seletor CSS.' },
  { icon: 'warning', text: 'Evite CSS frágil (classes geradas automaticamente, seletores muito específicos). Se mudar o layout, o passo para de encontrar o elemento.' },
  { icon: 'play_circle', text: 'Teste antes de usar em uma jornada. Use o botão "Testar tour" para percorrer o fluxo real.' },
  { icon: 'route', text: 'O tour só aparece para o usuário final quando estiver em uma jornada. A jornada decide onde ele entra na experiência.' },
  { icon: 'monitoring', text: 'Revise o dashboard depois que a jornada estiver em uso. "Elementos não encontrados" alto é sinal de seletor frágil ou tela que mudou.' },
]

const COMO_CRIAR = [
  { titulo: 'Escolha um template ou comece em branco', desc: 'Em "Novo Tour Guiado", um modelo já preenche título, descrição e passos base — ou comece do zero.' },
  { titulo: 'Preencha o destino', desc: 'Defina sistema e como o tour deve ser identificado: tela informada pelo sistema, data-cy ou caminho da URL.' },
  { titulo: 'Cadastre os passos', desc: 'Cada passo aponta para um elemento (seletor) com título e descrição do que destacar.' },
  { titulo: 'Teste', desc: 'Use "Testar tour" para percorrer o fluxo real e confirmar que cada passo encontra seu elemento.' },
  { titulo: 'Adicione a uma jornada', desc: 'Depois de revisar, use este tour como uma etapa dentro de uma jornada. Tours não aparecem sozinhos no widget.' },
]

const GRAVADOR_PASSO_A_PASSO = [
  { titulo: 'Iniciar gravação', desc: 'Em "Gravador de fluxo", preencha título, descrição, sistema e a URL inicial e clique em "Iniciar gravação" — abre a página real numa nova aba, já em modo de gravação.' },
  { titulo: 'Navegar pelo sistema', desc: 'Use o sistema normalmente: clique em botões/links, preencha campos, selecione opções. Cada interação vira um passo automaticamente, sem nenhuma configuração manual.' },
  { titulo: 'Finalizar', desc: 'Clique em "Finalizar" na barra flutuante quando terminar o fluxo — a gravação continua ativa (nada é descartado), só abre o painel de revisão com todos os passos capturados.' },
  { titulo: 'Revisar passos', desc: 'Ajuste título, descrição, posição do tooltip, como avançar e ação ao clicar em Próximo de cada passo — tudo isso antes de gerar o JSON.' },
  { titulo: 'Analisar passos', desc: 'Clique em "Analisar passos" para ver sugestões automáticas por passo: seletor CSS frágil, título genérico, descrição vazia, passo duplicado ou modo de avanço inadequado pro tipo de elemento.' },
  { titulo: 'Trocar elemento, se necessário', desc: 'Se um seletor veio errado ou frágil, clique em "Trocar elemento" no passo e clique de novo no elemento certo na tela real — ou escolha entre os seletores candidatos sugeridos, sem precisar clicar em nada.' },
  { titulo: 'Gerar JSON', desc: 'Com os passos revisados, clique em "Gerar JSON" — o gravador monta o tour completo no formato userpulse.tour.v1 e encerra a gravação.' },
  { titulo: 'Copiar e abrir importação', desc: 'Use "Copiar e abrir importação" pra copiar o JSON e já abrir a tela de Tours Guiados com o modal de importação pronto — nada é enviado automaticamente.' },
  { titulo: 'Importar e revisar', desc: 'Cole o JSON (ou use "Colar JSON" no próprio modal) e clique em "Importar". Revise título, descrição e seletores antes de usar em uma jornada.' },
]

const GRAVADOR_BOAS_PRATICAS = [
  { icon: 'code', text: 'Prefira telas com data-cy. É o seletor mais estável — sobrevive a mudanças de estilo/layout que quebrariam um seletor CSS.' },
  { icon: 'edit_note', text: 'Revise títulos e descrições. O gravador extrai um rótulo automático do próprio elemento — nem sempre é a melhor explicação pro usuário final.' },
  { icon: 'content_copy', text: 'Evite passos duplicados. Cliques acidentais ou dois passos apontando pro mesmo elemento poluem o tour — "Analisar passos" sinaliza esses casos.' },
  { icon: 'text_fields', text: 'Use "Ao alterar valor" para campos e autocomplete. Passos em inputs/selects avançam melhor quando o usuário preenche, não quando clica.' },
  { icon: 'ads_click', text: 'Use "Ao clicar" para botões. É o comportamento natural pra ações — o tour avança assim que o usuário confirma a ação.' },
  { icon: 'warning', text: 'Confira seletores frágeis. "Analisar passos" e o próprio chip do seletor já sinalizam quando ele pode quebrar com uma mudança de layout.' },
  { icon: 'play_circle', text: 'Teste o tour antes de adicioná-lo a uma jornada. Depois de importar, use "Testar tour" pra confirmar que cada passo encontra seu elemento.' },
]

const COMO_TESTAR = [
  { icon: 'play_circle', titulo: 'Botão "Testar tour"', desc: 'Disponível na listagem, no formulário e na tela de preview — abre o tour em modo teste, sem depender do sistema hospedeiro.' },
  { icon: 'science', titulo: 'test-embed.html', desc: 'Página de simulação do widget para desenvolvimento local. Aponte para o servidor local com ?local=1 na URL.' },
  { icon: 'route', titulo: 'Preview pela jornada', desc: 'Para validar a experiência final, adicione o tour a uma jornada e use o preview real da criação de jornada.' },
]

const DASHBOARD_METRICAS = [
  { icon: 'play_circle', iconColor: 'text-primary', iconBg: 'bg-primary/10', label: 'Iniciados', desc: 'Quantas vezes o tour começou a ser exibido.' },
  { icon: 'check_circle', iconColor: 'text-tertiary', iconBg: 'bg-tertiary/10', label: 'Concluídos', desc: 'Usuários que chegaram até o fim do tour.' },
  { icon: 'skip_next', iconColor: 'text-secondary', iconBg: 'bg-secondary/10', label: 'Pulados', desc: 'Usuários que fecharam o tour antes de terminar.' },
  { icon: 'search_off', iconColor: 'text-error', iconBg: 'bg-error/10', label: 'Elementos não encontrados', desc: 'O widget não achou o seletor de algum passo na tela do usuário — revise o seletor ou a condição de exibição.' },
]

export function TourGuide() {
  const navigate = useNavigate()

  return (
    <div className="relative">
      {/* Header */}
      <div className="px-4 lg:px-margin-desktop py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">Guia de Tours Guiados</h2>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Aprenda quando usar tours guiados, como configurar passos e como validar a experiência.
            </p>
          </div>
          <Button
            onClick={() => navigate('/tours/novo')}
            className="shrink-0"
            fullWidthMobile
            iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
          >
            Criar Tour Guiado
          </Button>
        </div>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[1400px] space-y-4">
        {/* A — O que é / quando usar */}
        <SectionCard
          icon="map"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="O que é e quando usar"
        >
          <p className="text-body-md text-on-surface-variant leading-relaxed max-w-3xl">
            Um tour guiado é uma sequência de passos que destaca elementos reais da tela, um de cada vez, com um tooltip
            explicando o que fazer. Diferente de uma campanha (modal isolado), ele guia o usuário{' '}
            <span className="font-semibold text-on-surface">dentro do próprio fluxo</span> do sistema.
          </p>
          <p className="text-body-md text-on-surface-variant leading-relaxed max-w-3xl">
            Use quando o objetivo é ensinar um caminho — apresentar uma funcionalidade nova, orientar o primeiro acesso,
            explicar um fluxo operacional com várias etapas ou mostrar uma tela de configuração pela primeira vez.
          </p>
        </SectionCard>

        {/* B — Boas práticas */}
        <SectionCard
          icon="tips_and_updates"
          iconBg="bg-[#fef3c7]"
          iconColor="text-[#b45309]"
          title="Boas práticas"
        >
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BOAS_PRATICAS.map((bp, i) => (
              <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/50">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">{bp.icon}</span>
                <p className="text-body-md text-on-surface leading-snug">{bp.text}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* C — Como criar */}
        <SectionCard
          icon="checklist"
          iconBg="bg-secondary-fixed"
          iconColor="text-secondary"
          title="Como criar"
          subtitle="Cinco passos, do modelo até a publicação."
        >
          <ol className="space-y-3">
            {COMO_CRIAR.map((passo, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-body-md font-semibold text-on-surface">{passo.titulo}</p>
                  <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">{passo.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        {/* C2 — Gravador de Fluxo */}
        <SectionCard
          icon="radio_button_checked"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="Gravador de Fluxo"
          subtitle="Grave o fluxo navegando pelo sistema real e gere um rascunho de tour automaticamente."
        >
          <p className="text-body-md text-on-surface-variant leading-relaxed max-w-3xl">
            O Gravador de Fluxo é uma alternativa a criar os passos manualmente: em vez de preencher seletor por
            seletor, você navega pelo sistema real numa aba separada e cada clique/preenchimento vira um passo do tour
            sozinho. Use quando o fluxo tem muitas etapas, quando não quer levantar seletores um a um, ou pra ter um
            rascunho inicial rápido pra depois refinar.
          </p>
          <ol className="space-y-3">
            {GRAVADOR_PASSO_A_PASSO.map((passo, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-body-md font-semibold text-on-surface">{passo.titulo}</p>
                  <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">{passo.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <p className="text-label-md font-bold text-on-surface mb-2">Boas práticas do gravador</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {GRAVADOR_BOAS_PRATICAS.map((bp, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/50">
                  <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">{bp.icon}</span>
                  <p className="text-body-md text-on-surface leading-snug">{bp.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => navigate('/tours/gravador')}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">radio_button_checked</span>
            Abrir Gravador de Fluxo
          </button>
        </SectionCard>

        {/* D — Como testar */}
        <SectionCard
          icon="play_circle"
          iconBg="bg-tertiary-fixed"
          iconColor="text-tertiary"
          title="Como testar"
          subtitle="Valide o conteúdo do tour e depois confira a experiência final pela jornada."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {COMO_TESTAR.map((m, i) => (
              <div key={i} className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/50">
                <span className="material-symbols-outlined text-[22px] text-primary">{m.icon}</span>
                <p className="text-label-md font-semibold text-on-surface">{m.titulo}</p>
                <p className="text-[12px] text-on-surface-variant leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* E — Como interpretar o dashboard */}
        <SectionCard
          icon="monitoring"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="Como interpretar o dashboard"
          subtitle="Cada tour tem seu próprio dashboard, acessível pela listagem."
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DASHBOARD_METRICAS.map(m => (
              <div key={m.label} className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/50">
                <span className={`w-8 h-8 rounded-lg ${m.iconBg} flex items-center justify-center mb-2`}>
                  <span className={`material-symbols-outlined ${m.iconColor} text-[18px]`}>{m.icon}</span>
                </span>
                <p className="text-label-md font-semibold text-on-surface">{m.label}</p>
                <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
          <Tip>
            Taxa de conclusão baixa com "Elementos não encontrados" alto geralmente indica seletor frágil — revise o passo
            correspondente.
          </Tip>
        </SectionCard>
      </section>
    </div>
  )
}
