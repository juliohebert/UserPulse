import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#313244]">
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2 border-b border-[#313244]">
        <span className="text-[11px] text-[#6c7086] font-mono uppercase tracking-wider select-none">javascript</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[11px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">{copied ? 'check_circle' : 'content_copy'}</span>
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </button>
      </div>
      <pre className="bg-[#1e1e2e] px-4 py-4 overflow-x-auto">
        <code className="text-[13px] text-[#cdd6f4] font-mono leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}

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

const CODE_INICIAR_TOUR = `window.UserPulse.iniciarTour("slug-do-tour");`

const BOAS_PRATICAS = [
  { icon: 'timer', text: 'Crie tours curtos — poucos passos, direto ao ponto. Tours longos cansam e fazem o usuário abandonar no meio.' },
  { icon: 'code', text: 'Use data-cy sempre que possível. É o seletor mais estável — sobrevive a mudanças de estilo que quebrariam um seletor CSS.' },
  { icon: 'warning', text: 'Evite CSS frágil (classes geradas automaticamente, seletores muito específicos). Se mudar o layout, o passo para de encontrar o elemento.' },
  { icon: 'play_circle', text: 'Teste antes de ativar. Use o botão "Testar tour" para percorrer o fluxo real antes de publicar para os usuários.' },
  { icon: 'edit_note', text: 'Mantenha o tour inativo enquanto estiver configurando. Ele só é bloqueado de ativar se algum passo ainda não tiver seletor — mas vale manter como rascunho até estar pronto.' },
  { icon: 'monitoring', text: 'Revise o dashboard depois de publicar. "Elementos não encontrados" alto é sinal de seletor frágil ou tela que mudou.' },
]

const COMO_CRIAR = [
  { titulo: 'Escolha um template ou comece em branco', desc: 'Em "Novo Tour Guiado", um modelo já preenche título, descrição e passos base — ou comece do zero.' },
  { titulo: 'Preencha o destino', desc: 'Defina sistema e como o tour deve ser identificado: tela informada pelo sistema, data-cy ou caminho da URL.' },
  { titulo: 'Cadastre os passos', desc: 'Cada passo aponta para um elemento (seletor) com título e descrição do que destacar.' },
  { titulo: 'Teste', desc: 'Use "Testar tour" para percorrer o fluxo real e confirmar que cada passo encontra seu elemento.' },
  { titulo: 'Ative', desc: 'Só é possível ativar quando todos os passos têm seletor preenchido — é a garantia de que o tour não vai quebrar em produção.' },
]

const COMO_TESTAR = [
  { icon: 'play_circle', titulo: 'Botão "Testar tour"', desc: 'Disponível na listagem, no formulário e na tela de preview — abre o tour em modo teste, sem depender do sistema hospedeiro.' },
  { icon: 'science', titulo: 'test-embed.html', desc: 'Página de simulação do widget para desenvolvimento local. Aponte para o servidor local com ?local=1 na URL.' },
  { icon: 'terminal', titulo: 'Comando manual', desc: 'Chame window.UserPulse.iniciarTour("slug") no console do navegador — funciona mesmo com o tour inativo ou já concluído pelo usuário.' },
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
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <nav className="flex gap-2 text-label-md text-outline mb-0.5">
              <button onClick={() => navigate('/tours')} className="hover:text-primary transition-colors">
                Tours Guiados
              </button>
              <span>/</span>
              <span className="text-on-surface">Guia</span>
            </nav>
            <h2 className="text-title-lg font-bold text-on-surface leading-tight">Guia de Tours Guiados</h2>
          </div>
          <button
            onClick={() => navigate('/tours/novo')}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 shrink-0 w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Criar Tour Guiado
          </button>
        </div>
      </div>

      <section className="px-4 lg:px-margin-desktop py-5 max-w-4xl space-y-4">
        {/* A — O que é / quando usar */}
        <SectionCard
          icon="map"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="O que é e quando usar"
        >
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            Um tour guiado é uma sequência de passos que destaca elementos reais da tela, um de cada vez, com um tooltip
            explicando o que fazer. Diferente de uma campanha (modal isolado), ele guia o usuário{' '}
            <span className="font-semibold text-on-surface">dentro do próprio fluxo</span> do sistema.
          </p>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
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
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        {/* D — Como testar */}
        <SectionCard
          icon="play_circle"
          iconBg="bg-tertiary-fixed"
          iconColor="text-tertiary"
          title="Como testar"
          subtitle="Três formas de disparar um tour manualmente, do mais simples ao mais técnico."
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
          <CodeBlock code={CODE_INICIAR_TOUR} />
          <Tip>Troque "slug-do-tour" pelo slug do tour, visível na tela de preview de cada tour.</Tip>
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
