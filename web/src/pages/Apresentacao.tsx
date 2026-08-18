import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

// ── design tokens locais (DESIGN.md) ────────────────────────────────────────
// Mesma receita de classes do Button.tsx / Login.tsx / Integracao.tsx
// (pill rounded-full, cobalt primary, ink-deep #0a1317 pro par escuro),
// reescrita aqui em vez de importada porque o botão "primary" precisa virar
// <Link> em alguns lugares (CTA -> /cadastro e /integracao) e o Button.tsx
// atual só renderiza <button>. Evita alterar Button.tsx (fora do escopo desta
// página) só pra suportar `as`.
const focusRingLight = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const focusRingDark = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

const pillPrimary = `inline-flex items-center justify-center gap-2 rounded-full bg-primary px-[30px] py-3.5 text-label-md font-bold tracking-[-0.14px] text-on-primary transition-all hover:opacity-90 active:scale-[0.98] active:bg-[#0457cb] ${focusRingLight}`
const pillOutlineDark = `inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 bg-transparent px-7 py-3.5 text-label-md font-bold tracking-[-0.14px] text-white transition-colors hover:bg-white/10 active:scale-[0.98] ${focusRingDark}`
const pillPrimarySm = `inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-label-sm font-bold tracking-[-0.14px] text-on-primary transition-opacity hover:opacity-90 active:scale-[0.98] ${focusRingLight}`

const fill = { fontVariationSettings: "'FILL' 1" }

// ── helpers ───────────────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function CodeSnippet({ code }: { code: string }) {
  const [copiado, setCopiado] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiar = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopiado(true)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setCopiado(false), 2000)
  }
  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#0a1317]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <span className="text-[11px] text-white/50 font-mono uppercase tracking-wider">javascript</span>
        <button
          type="button"
          onClick={copiar}
          className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition-colors active:bg-white/10 ${focusRingDark}`}
        >
          <span className="material-symbols-outlined text-[14px]">{copiado ? 'check_circle' : 'content_copy'}</span>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="px-5 py-5 overflow-x-auto">
        <code className="text-[13px] text-white font-mono leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}

// ── copy / dados ─────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Demonstração', id: 'demonstracao' },
  { label: 'Como funciona', id: 'como-funciona' },
  { label: 'Casos de uso', id: 'casos-de-uso' },
  { label: 'Métricas', id: 'metricas' },
] as const

const DOR_SOLUCAO = [
  {
    dorIcon: 'visibility_off', dorTexto: 'A funcionalidade foi lançada e quase ninguém percebeu.',
    solIcon: 'frame_inspect', solTexto: 'Aparece dentro do produto, na tela certa, no momento certo.',
  },
  {
    dorIcon: 'mail_off', dorTexto: 'Comunicar melhorias vira e-mail que ninguém abre.',
    solIcon: 'campaign', solTexto: 'Anúncio in-app com vídeo, texto e botão de ação.',
  },
  {
    dorIcon: 'trending_down', dorTexto: 'Recursos novos ficam parados, sem adoção real.',
    solIcon: 'map', solTexto: 'Tours guiados e jornadas conduzem o usuário até o uso.',
  },
  {
    dorIcon: 'link_off', dorTexto: 'O feedback chega dias depois, fora do contexto de uso.',
    solIcon: 'my_location', solTexto: 'A pergunta aparece na hora exata em que a ação aconteceu.',
  },
  {
    dorIcon: 'help', dorTexto: 'Ninguém sabe ao certo o que o usuário achou da mudança.',
    solIcon: 'star_rate', solTexto: 'NPS e feedback de utilidade direto no fluxo de uso.',
  },
  {
    dorIcon: 'terminal', dorTexto: 'Cada aviso novo depende de uma tarefa pro time técnico.',
    solIcon: 'tune', solTexto: 'Crie e publique pelo painel, sem deploy e sem código novo.',
  },
  {
    dorIcon: 'query_stats', dorTexto: 'Zero visibilidade sobre visualizações, cliques e respostas.',
    solIcon: 'analytics', solTexto: 'Dashboard com métricas por campanha, pronto pra exportar.',
  },
]

const FLUXO = [
  { icon: 'web', label: 'Sistema integrado', desc: 'Script carregado no HTML do produto' },
  { icon: 'person_pin', label: 'Contexto do usuário', desc: 'ID, perfil, cliente, unidade, estado' },
  { icon: 'filter_alt', label: 'Campanha elegível', desc: 'Segmentação + regras de exibição' },
  { icon: 'open_in_full', label: 'Exibição in-app', desc: 'Na tela e no momento certos' },
  { icon: 'how_to_vote', label: 'Resposta ou clique', desc: 'Feedback, confirmação ou ação' },
  { icon: 'analytics', label: 'Dashboard e CSV', desc: 'Resultado pronto pra análise' },
]

const RECURSOS = [
  { icon: 'grid_view', label: 'Catálogo de telas' },
  { icon: 'manage_accounts', label: 'Segmentação por cliente, unidade e perfil' },
  { icon: 'rule', label: 'Gatilhos e regras de exibição' },
  { icon: 'schedule', label: 'Reexibição configurável' },
  { icon: 'event_available', label: 'Encerramento por evento' },
  { icon: 'hub', label: 'Eventos globais' },
  { icon: 'analytics', label: 'Dashboard analítico' },
  { icon: 'download', label: 'Exportação em CSV' },
  { icon: 'auto_awesome', label: 'Templates de tour' },
  { icon: 'visibility', label: 'Preview antes de publicar' },
  { icon: 'monitoring', label: 'Conclusão e abandono de tours' },
  { icon: 'sync_alt', label: 'Importação e exportação em JSON' },
  { icon: 'admin_panel_settings', label: 'Permissões por usuário' },
  { icon: 'integration_instructions', label: 'Integração via script' },
]

const CASOS = [
  { icon: 'map', titulo: 'Tours guiados', desc: 'Roteiros interativos que ensinam fluxos e apresentam funcionalidades passo a passo, dentro da própria tela.' },
  { icon: 'star_rate', titulo: 'NPS recorrente', desc: 'Colete NPS em intervalos configuráveis dos usuários mais ativos, direto na tela principal do sistema.' },
  { icon: 'new_releases', titulo: 'Nova funcionalidade', desc: 'Anuncie melhorias pra quem usa a tela afetada, sem gerar ruído pra quem nunca acessou.' },
  { icon: 'verified_user', titulo: 'Comunicado obrigatório', desc: 'Exija confirmação de leitura antes de liberar o acesso. A campanha fica ativa até o usuário confirmar.' },
  { icon: 'fact_check', titulo: 'Pesquisa por tela', desc: 'Valide uma funcionalidade específica com os usuários que realmente a utilizam.' },
  { icon: 'account_tree', titulo: 'Segmentação por contexto', desc: 'Direcione por cliente, unidade, perfil ou estado. Combine quantos filtros quiser.' },
  { icon: 'trending_up', titulo: 'Adoção de melhorias', desc: 'A campanha encerra automaticamente quando o usuário dispara o evento que confirma a adoção.' },
]

const PERMISSOES = [
  {
    papel: 'ADMIN', badge: 'bg-primary text-on-primary', icon: 'shield_person',
    capacidades: [
      'Cria, edita e publica campanhas, tours e jornadas',
      'Configura aparência do widget e catálogo de telas',
      'Gerencia usuários e permissões do time',
      'Exclui conteúdo quando necessário',
    ],
  },
  {
    papel: 'EDITOR', badge: 'bg-secondary text-on-secondary', icon: 'edit_square',
    capacidades: [
      'Cria e edita campanhas, tours e jornadas',
      'Publica e ajusta conteúdo no dia a dia',
      'Não configura aparência do widget',
      'Não exclui conteúdo nem importa tours',
    ],
  },
  {
    papel: 'VIEWER', badge: 'bg-surface-variant text-on-surface-variant', icon: 'visibility',
    capacidades: [
      'Acompanha campanhas, tours e jornadas ativos',
      'Visualiza dashboards e resultados',
      'Exporta relatórios em CSV',
      'Não cria nem edita nenhum conteúdo',
    ],
  },
]

const VALOR = [
  {
    icon: 'corporate_fare', area: 'CEO',
    items: ['Adoção de funcionalidades medida em dados reais', 'Satisfação segmentada por cliente e perfil', 'Decisões de produto embasadas, não inferidas'],
  },
  {
    icon: 'support_agent', area: 'CX',
    items: ['Feedback contextualizado por tela e momento de uso', 'Triagem por cliente, unidade e perfil de usuário', 'Respostas exportáveis em CSV pra análise imediata'],
  },
  {
    icon: 'science', area: 'Produto',
    items: ['Valide features com quem já usa, não com toda a base', 'Campanha encerra quando o evento de adoção ocorre', 'Pesquisa qualitativa in-product, sem formulário externo'],
  },
  {
    icon: 'handshake', area: 'Vendas',
    items: ['NPS por conta pra embasar upsell e renovação', 'Evidência de satisfação pra apresentar ao cliente', 'Identifique risco de churn antes da próxima renovação'],
  },
]

const CODE_INTEGRACAO = `// 1. Uma vez, após o login do usuário
window.UserPulse.init({
  sistema:       "MeuSistema",
  usuario_id:    usuario.id,
  usuario_nome:  usuario.nome,
  usuario_email: usuario.email,
  contexto: {
    cliente_id:   cliente.id,
    unidade_id:   unidade.id,
    perfil:       usuario.perfil,
    usuario_tipo: usuario.tipo,
    estado:       cliente.estado,
  }
});

// 2. Ao trocar de cliente ou unidade (SPA)
window.UserPulse.updateContext({
  cliente_id: novoCliente.id,
  unidade_id: novaUnidade.id,
  perfil:     usuario.perfil,
  estado:     novoCliente.estado,
});

// 3. Ao usar uma funcionalidade relevante
window.UserPulse.track("usou_nova_agenda");`

// ── dados mock (dashboard) ──────────────────────────────────────────────

const DIST = [
  { nota: '10', pct: 38, cor: 'bg-tertiary' },
  { nota: '9',  pct: 24, cor: 'bg-tertiary' },
  { nota: '8',  pct: 18, cor: 'bg-[#8595a4]' },
  { nota: '7',  pct: 10, cor: 'bg-[#8595a4]' },
  { nota: '6',  pct: 5,  cor: 'bg-error' },
  { nota: '5',  pct: 3,  cor: 'bg-error' },
  { nota: '≤4', pct: 2,  cor: 'bg-error' },
]

const COMENTARIOS = [
  { nota: 10, texto: 'A nova agenda ficou muito mais rápida. Uso todo dia agora.' },
  { nota: 9,  texto: 'Ótimo, mas gostaria de filtros por especialidade.' },
  { nota: 8,  texto: 'Melhorou bastante. A busca ainda poderia ser mais intuitiva.' },
]

const TOUR_PASSOS = [
  { titulo: 'Crie um novo agendamento', desc: 'Clique aqui pra iniciar o fluxo de agendamento.' },
  { titulo: 'Acompanhe pela agenda', desc: 'Veja todos os horários do dia em um só lugar.' },
  { titulo: 'Finalize com um clique', desc: 'Confirme o agendamento e pronto, o paciente é notificado.' },
]

const JORNADA_ETAPAS = [
  { titulo: 'Boas-vindas', desc: 'Conheça o painel e o menu principal.' },
  { titulo: 'Primeiro tour', desc: 'Complete o tour guiado da agenda.' },
  { titulo: 'Configuração concluída', desc: 'Personalize as preferências do seu perfil.' },
]

// ── blocos visuais compartilhados do mock ───────────────────────────────

function ScaleSelector({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-0.5 w-full">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 min-w-0 aspect-square rounded-md text-[10px] font-bold border transition-all ${focusRingLight} ${
            value === n
              ? 'bg-primary text-on-primary border-primary'
              : 'bg-white border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function ModalHeader() {
  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <span className="material-symbols-outlined ms-fill text-on-primary text-[13px]">pulse_alert</span>
        </div>
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">UserPulse</span>
      </div>
      <span className="material-symbols-outlined text-outline text-[18px] select-none">close</span>
    </div>
  )
}

function SuccessCard({ message }: { message: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-tertiary-fixed border border-tertiary/20 flex items-center justify-center mx-auto mb-3">
        <span className="material-symbols-outlined ms-fill text-tertiary text-[26px]">check_circle</span>
      </div>
      <h3 className="text-[16px] font-bold text-on-background mb-1">Obrigado!</h3>
      <p className="text-[13px] text-on-surface-variant">{message}</p>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────

type MockTab = 'nps' | 'novidade' | 'destaque' | 'tour' | 'jornada'

const DEMO_TABS: { key: MockTab; icon: string; short: string; label: string }[] = [
  { key: 'novidade', icon: 'new_releases', short: 'Novidade', label: 'Nova funcionalidade' },
  { key: 'destaque', icon: 'ads_click',    short: 'Destaque', label: 'Destaque de elemento' },
  { key: 'nps',      icon: 'star_rate',    short: 'NPS',      label: 'Pesquisa NPS' },
  { key: 'tour',     icon: 'map',          short: 'Tour',     label: 'Tour guiado' },
  { key: 'jornada',  icon: 'route',        short: 'Jornada',  label: 'Jornada' },
]

export function ApresentacaoPage() {
  const [mockTab, setMockTab] = useState<MockTab>('novidade')

  // NPS
  const [npsNota, setNpsNota] = useState<number | null>(null)
  const [npsPhase, setNpsPhase] = useState<'idle' | 'sending' | 'success'>('idle')

  // Novidade (campanha contextual + feedback de utilidade)
  const [novidadePhase, setNovidadePhase] = useState<'idle' | 'playing' | 'fb_sending' | 'fb_success' | 'postponed'>('idle')
  const [novidadeCtaDone, setNovidadeCtaDone] = useState(false)
  const [novidadeFbNota, setNovidadeFbNota] = useState<number | null>(null)
  const [novidadeFbObs, setNovidadeFbObs] = useState('')

  // Destaque de elemento (badge + tooltip + feedback de utilidade)
  const [destaqueResposta, setDestaqueResposta] = useState<'idle' | 'sim' | 'nao'>('idle')

  // Tour guiado
  const [tourPasso, setTourPasso] = useState(1)
  const [tourConcluido, setTourConcluido] = useState(false)

  // Jornada
  const [jornadaEtapa, setJornadaEtapa] = useState(0)

  function resetNps() { setNpsNota(null); setNpsPhase('idle') }
  function resetNovidade() { setNovidadePhase('idle'); setNovidadeCtaDone(false); setNovidadeFbNota(null); setNovidadeFbObs('') }
  function resetDestaque() { setDestaqueResposta('idle') }
  function resetTour() { setTourPasso(1); setTourConcluido(false) }
  function resetJornada() { setJornadaEtapa(0) }

  function sendNps() {
    if (!npsNota) return
    setNpsPhase('sending')
    setTimeout(() => setNpsPhase('success'), 1100)
  }

  function sendNovidadeFb() {
    if (!novidadeFbNota) return
    setNovidadePhase('fb_sending')
    setTimeout(() => setNovidadePhase('fb_success'), 1100)
  }

  function avancarTour() {
    if (tourPasso < TOUR_PASSOS.length) setTourPasso(p => p + 1)
    else setTourConcluido(true)
  }

  function avancarJornada() {
    setJornadaEtapa(e => Math.min(e + 1, JORNADA_ETAPAS.length))
  }

  const isTerminal =
    (mockTab === 'nps' && npsPhase === 'success') ||
    (mockTab === 'novidade' && (novidadePhase === 'fb_success' || novidadePhase === 'postponed')) ||
    (mockTab === 'destaque' && destaqueResposta !== 'idle') ||
    (mockTab === 'tour' && tourConcluido) ||
    (mockTab === 'jornada' && jornadaEtapa === JORNADA_ETAPAS.length)

  const semScrim = mockTab === 'tour' || mockTab === 'destaque'
  const alvoDestacado = mockTab === 'tour' || mockTab === 'destaque'

  useEffect(() => {
    const prev = document.title
    document.title = 'UserPulse: comunique, guie e meça adoção dentro do produto'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="min-h-screen bg-white font-sans text-on-background">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-b border-outline-variant">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined ms-fill text-[16px]">pulse_alert</span>
            </div>
            <span className="text-on-background font-bold text-[15px] tracking-tight">UserPulse</span>
          </div>
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollTo(link.id)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-semibold text-on-surface-variant hover:bg-surface-variant hover:text-on-background transition-colors ${focusRingLight}`}
              >
                {link.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/integracao" className={`hidden sm:block text-[13px] font-semibold text-on-surface-variant hover:text-on-background transition-colors rounded ${focusRingLight}`}>
              Documentação
            </Link>
            <Link to="/cadastro" className={pillPrimarySm}>
              Testar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className="relative pt-28 pb-20 sm:pt-36 sm:pb-28 px-4 sm:px-6 overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(0, 100, 224, 0.18), transparent 32%), ' +
            'linear-gradient(180deg, #08111f 0%, #0b1526 48%, #101a2f 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 bg-white/5 text-white/85 text-[12px] font-bold uppercase tracking-wider mb-7">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Campanhas · Tours guiados · Jornadas · NPS
          </div>
          <h1 className="text-[32px] sm:text-[44px] lg:text-[64px] font-semibold text-white leading-[1.2] lg:leading-[1.16] tracking-tight mb-6">
            Você lançou.<br />
            O usuário <span className="text-primary">não viu</span>.
          </h1>
          <p className="text-[16px] sm:text-[18px] leading-[1.5] text-white/75 max-w-2xl mx-auto mb-10">
            O UserPulse mostra a funcionalidade certa pro usuário certo, dentro do seu próprio produto.
            Comunique, pesquise e guie a adoção sem depender de e-mail, treinamento ou do time de desenvolvimento.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cadastro" className={pillPrimary}>
              Testar grátis
            </Link>
            <button type="button" onClick={() => scrollTo('demonstracao')} className={pillOutlineDark}>
              Ver demonstração
            </button>
          </div>
        </div>
      </section>

      {/* ── Dor → Solução ── */}
      <section id="dores" className="py-20 sm:py-24 px-4 sm:px-6 bg-white scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-error uppercase tracking-widest mb-3">O problema real</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">Boas atualizações, ninguém percebe</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">
              Você melhora o produto todo mês, mas a mensagem não chega no momento certo pra pessoa certa.
              O UserPulse fecha essa distância.
            </p>
          </div>

          <div className="rounded-3xl border border-outline-variant bg-surface-variant overflow-hidden">
            {DOR_SOLUCAO.map((item, i) => (
              <div
                key={item.dorTexto}
                className={`grid sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-5 items-center px-5 sm:px-8 py-5 ${i > 0 ? 'border-t border-outline-variant' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-error-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-error text-[18px]">{item.dorIcon}</span>
                  </span>
                  <p className="text-[14px] text-on-surface-variant leading-snug">{item.dorTexto}</p>
                </div>
                <span className="hidden sm:flex w-8 h-8 rounded-full bg-white border border-outline-variant items-center justify-center shrink-0 justify-self-center">
                  <span className="material-symbols-outlined text-outline text-[16px]">arrow_forward</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-[18px]">{item.solIcon}</span>
                  </span>
                  <p className="text-[14px] text-on-background font-semibold leading-snug">{item.solTexto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demonstração interativa ── */}
      <section id="demonstracao" className="py-20 sm:py-24 px-4 sm:px-6 bg-surface-variant scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Veja funcionando</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">A experiência que seu usuário vê</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">
              Um exemplo simulado, exatamente como apareceria dentro do seu sistema. Alterne entre os formatos abaixo.
            </p>
          </div>

          {/* seletor de cenário */}
          <div className="flex bg-white border border-outline-variant rounded-full p-1 gap-1 max-w-md sm:max-w-2xl mx-auto mb-8 overflow-x-auto">
            {DEMO_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMockTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${focusRingLight} ${
                  mockTab === tab.key ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* browser mock */}
          <div className="max-w-2xl mx-auto rounded-3xl overflow-hidden border border-outline-variant shadow-panel bg-white">
            <div className="bg-surface-variant border-b border-outline-variant px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-error/60" />
                <div className="w-3 h-3 rounded-full bg-[#f7b928]/60" />
                <div className="w-3 h-3 rounded-full bg-tertiary/60" />
              </div>
              <div className="flex-1 mx-4 bg-white rounded-lg px-3 py-1 text-[12px] text-outline border border-outline-variant">
                meusistema.com.br/agenda
              </div>
            </div>

            <div className={`relative bg-surface-variant transition-[min-height] ${mockTab === 'tour' || mockTab === 'destaque' ? 'min-h-[300px] sm:min-h-[360px]' : 'min-h-[440px] sm:min-h-[620px]'}`}>
              {/* chrome falso do app, comum a todas as abas */}
              <div className="absolute inset-0 flex">
                <div className="w-14 bg-on-background flex flex-col items-center pt-3 gap-3 shrink-0">
                  {['home', 'calendar_month', 'people', 'bar_chart', 'settings'].map(ic => (
                    <div key={ic} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white/60 text-[16px]">{ic}</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 p-4 overflow-hidden select-none">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`h-5 w-32 bg-white rounded-lg border border-outline-variant transition-opacity ${alvoDestacado ? 'opacity-40' : ''}`} />
                    <div className="relative">
                      <div className={`h-7 w-24 rounded-full flex items-center justify-center gap-1 transition-all ${
                        alvoDestacado ? 'bg-primary ring-4 ring-primary/25 widget-pulse' : 'bg-primary/20'
                      }`}>
                        {alvoDestacado && (
                          <>
                            <span className="material-symbols-outlined text-white text-[13px]">add</span>
                            <span className="text-white text-[10px] font-bold">Agendar</span>
                          </>
                        )}
                      </div>

                      {/* ── Tooltip do tour ── */}
                      {mockTab === 'tour' && (
                        <div className="absolute right-0 top-full mt-3 w-60 sm:w-64 bg-white rounded-2xl shadow-panel border border-outline-variant p-4 z-20 text-left">
                          <div className="absolute -top-[7px] right-6 w-3.5 h-3.5 bg-white border-t border-l border-outline-variant rotate-45" />
                          {tourConcluido ? (
                            <div className="text-center py-1">
                              <span className="material-symbols-outlined ms-fill text-tertiary text-[26px] mb-1 inline-block">check_circle</span>
                              <p className="text-[13px] font-bold text-on-background">Tour concluído</p>
                            </div>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Passo {tourPasso} de {TOUR_PASSOS.length}</p>
                              <p className="text-[14px] font-bold text-on-background mb-1 leading-snug">{TOUR_PASSOS[tourPasso - 1].titulo}</p>
                              <p className="text-[12px] text-on-surface-variant mb-3 leading-relaxed">{TOUR_PASSOS[tourPasso - 1].desc}</p>
                              <div className="flex items-center gap-1 mb-3">
                                {TOUR_PASSOS.map((_, d) => (
                                  <span key={d} className={`h-1.5 rounded-full transition-all ${d === tourPasso - 1 ? 'w-3.5 bg-primary' : 'w-1.5 bg-outline-variant'}`} />
                                ))}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-outline">Pular</span>
                                <button type="button" onClick={avancarTour} className={`px-3 py-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold ${focusRingLight}`}>
                                  {tourPasso === TOUR_PASSOS.length ? 'Concluir' : 'Próximo'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* ── Badge + tooltip do destaque de elemento ── */}
                      {mockTab === 'destaque' && (
                        <>
                          <span className="absolute bottom-full right-0 mb-3 inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                            Novo
                          </span>
                          <div className="absolute right-0 top-full mt-3 w-64 sm:w-72 bg-white rounded-2xl shadow-panel border border-outline-variant p-4 z-20 text-left">
                            <div className="absolute -top-[7px] right-6 w-3.5 h-3.5 bg-white border-t border-l border-outline-variant rotate-45" />
                            <p className="text-[14px] font-bold text-on-background mb-1 leading-snug">Nova busca por especialidade</p>
                            <p className="text-[12px] text-on-surface-variant mb-3 leading-relaxed">Agora você filtra agendamentos por especialidade médica direto por aqui.</p>
                            <div className="border-t border-outline-variant pt-3">
                              {destaqueResposta === 'idle' ? (
                                <>
                                  <p className="text-[11px] font-bold text-on-background mb-2">Isso foi útil?</p>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setDestaqueResposta('sim')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full border border-outline-variant text-[11px] font-bold text-on-surface-variant hover:border-tertiary hover:text-tertiary transition-colors ${focusRingLight}`}>
                                      <span className="material-symbols-outlined text-[14px]">thumb_up</span>
                                      Sim
                                    </button>
                                    <button type="button" onClick={() => setDestaqueResposta('nao')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full border border-outline-variant text-[11px] font-bold text-on-surface-variant hover:border-error hover:text-error transition-colors ${focusRingLight}`}>
                                      <span className="material-symbols-outlined text-[14px]">thumb_down</span>
                                      Não
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <p className="text-[12px] font-semibold text-tertiary flex items-center gap-1.5">
                                  <span className="material-symbols-outlined ms-fill text-[16px]">check_circle</span>
                                  Obrigado pelo retorno!
                                </p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`grid grid-cols-3 gap-2 mb-3 transition-opacity ${alvoDestacado ? 'opacity-40' : ''}`}>
                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-outline-variant" />)}
                  </div>
                  <div className={`space-y-2 transition-opacity ${alvoDestacado ? 'opacity-40' : ''}`}>
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-white rounded-xl border border-outline-variant" />)}
                  </div>
                </div>
              </div>

              {/* overlay com scrim — modais de campanha, NPS e jornada */}
              {!semScrim && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">

                  {/* ── NPS ── */}
                  {mockTab === 'nps' && (
                    <div className="bg-white rounded-3xl shadow-panel p-5 sm:p-6 w-full max-w-[300px] sm:max-w-xs border border-outline-variant">
                      <ModalHeader />
                      {npsPhase === 'success' ? (
                        <SuccessCard message="Sua avaliação foi registrada." />
                      ) : npsPhase === 'sending' ? (
                        <div className="text-center py-6">
                          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                          <p className="text-[13px] text-outline">Enviando...</p>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-[15px] font-bold text-on-background mt-3 mb-1">Como você avalia a nova agenda?</h3>
                          <p className="text-[12px] text-outline mb-4">Sua opinião nos ajuda a melhorar a experiência.</p>
                          <ScaleSelector value={npsNota} onChange={setNpsNota} />
                          <div className="flex justify-between text-[10px] text-outline mt-1 mb-4">
                            <span>Ruim</span><span>Excelente</span>
                          </div>
                          <button
                            type="button"
                            onClick={sendNps}
                            disabled={!npsNota}
                            className={`w-full py-2.5 rounded-full bg-primary text-on-primary text-[13px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 ${focusRingLight}`}
                          >
                            {npsNota ? 'Enviar avaliação' : 'Selecione uma nota'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Novidade ── */}
                  {mockTab === 'novidade' && (
                    <div className="bg-white rounded-3xl shadow-panel w-full max-w-sm border border-outline-variant overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-outline-variant bg-surface-variant/80">
                        <span className="material-symbols-outlined ms-fill text-primary text-[16px] shrink-0">campaign</span>
                        <span className="flex-1 text-[11px] text-on-background font-semibold leading-tight">
                          Conheça a Funcionalidade de Agendamentos
                        </span>
                        <span className="material-symbols-outlined text-outline text-[15px] select-none shrink-0">close</span>
                      </div>

                      {novidadePhase === 'fb_success' && (
                        <div className="p-5"><SuccessCard message="Novidade registrada. Feedback enviado!" /></div>
                      )}

                      {novidadePhase === 'fb_sending' && (
                        <div className="px-5 py-8 text-center">
                          <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2.5" />
                          <p className="text-[12px] text-outline">Enviando...</p>
                        </div>
                      )}

                      {novidadePhase === 'postponed' && (
                        <div className="px-5 py-7 text-center">
                          <div className="w-10 h-10 rounded-full bg-surface-variant border border-outline-variant flex items-center justify-center mx-auto mb-2">
                            <span className="material-symbols-outlined text-outline text-[20px]">schedule</span>
                          </div>
                          <p className="text-[13px] font-bold text-on-background mb-0.5">Campanha adiada</p>
                          <p className="text-[11px] text-outline">Será reexibida conforme a política configurada.</p>
                        </div>
                      )}

                      {(novidadePhase === 'idle' || novidadePhase === 'playing') && (
                        <div className="px-4 pt-3 pb-4 flex flex-col gap-2">
                          <p className="text-[12px] font-semibold text-primary leading-tight">
                            Confira o que chegou de novo pra você
                          </p>

                          <div
                            className="relative w-full rounded-xl overflow-hidden bg-on-background cursor-pointer h-[88px] sm:h-[112px]"
                            onClick={() => novidadePhase === 'idle' && setNovidadePhase('playing')}
                          >
                            <div className="absolute inset-0 opacity-20 select-none pointer-events-none">
                              <div className="absolute top-2 left-3 w-16 h-2 bg-white/40 rounded-full" />
                              <div className="absolute top-5 left-3 w-11 h-2 bg-white/25 rounded-full" />
                              <div className="absolute top-2 right-3 w-8 h-8 rounded-lg bg-white/10" />
                            </div>
                            {novidadePhase === 'playing' ? (
                              <>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-9 h-9 rounded-full bg-white/20 border border-white/40 backdrop-blur-sm flex items-center justify-center">
                                    <span className="material-symbols-outlined ms-fill text-white text-[18px]">pause</span>
                                  </div>
                                </div>
                                <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-black/50 rounded px-1.5 py-0.5">
                                  <span className="w-1 h-1 rounded-full bg-tertiary" />
                                  <span className="text-[9px] text-white/90 font-mono">Em reprodução</span>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                                  <div className="h-full bg-primary" style={{ width: '58%' }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-9 h-9 rounded-full bg-white/20 border border-white/40 backdrop-blur-sm flex items-center justify-center">
                                    <span className="material-symbols-outlined ms-fill text-white text-[20px]">play_arrow</span>
                                  </div>
                                </div>
                                <span className="absolute bottom-1.5 right-2 text-[9px] text-white/70 font-mono bg-black/50 px-1.5 py-0.5 rounded">0:42</span>
                              </>
                            )}
                          </div>

                          <p className="text-[11px] text-on-surface-variant leading-relaxed">
                            Temos uma novidade que vai facilitar o seu dia a dia. Acesse agora mesmo e explore.
                          </p>

                          <button
                            type="button"
                            onClick={() => setNovidadeCtaDone(true)}
                            className={`w-full py-2 rounded-full text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 ${focusRingLight} ${
                              novidadeCtaDone
                                ? 'bg-tertiary-fixed border border-tertiary/30 text-tertiary'
                                : 'bg-primary text-on-primary hover:opacity-90'
                            }`}
                          >
                            {novidadeCtaDone && <span className="material-symbols-outlined ms-fill text-[14px]">check_circle</span>}
                            {novidadeCtaDone ? 'Clique registrado' : 'Ver novidade'}
                          </button>

                          <div className="border-t border-outline-variant" />

                          <p className="text-[11px] font-bold text-on-background leading-tight">O que você achou dessa novidade?</p>
                          <ScaleSelector value={novidadeFbNota} onChange={setNovidadeFbNota} />
                          <div className="flex justify-between text-[9px] font-semibold text-outline tracking-wide -mt-1">
                            <span>RUIM</span><span>EXCELENTE</span>
                          </div>

                          <textarea
                            value={novidadeFbObs}
                            onChange={e => setNovidadeFbObs(e.target.value)}
                            placeholder="Observação (opcional)"
                            rows={2}
                            className={`w-full px-2.5 py-1.5 rounded-xl border border-outline-variant bg-white text-[11px] text-on-surface-variant placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none`}
                          />

                          <button
                            type="button"
                            onClick={sendNovidadeFb}
                            disabled={!novidadeFbNota}
                            className={`w-full py-2 rounded-full bg-primary text-on-primary text-[12px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 ${focusRingLight}`}
                          >
                            Enviar feedback
                          </button>

                          <p className="text-center -mt-0.5">
                            <button
                              type="button"
                              onClick={() => setNovidadePhase('postponed')}
                              className={`text-[10px] text-outline hover:text-on-surface-variant transition-colors rounded ${focusRingLight}`}
                            >
                              Lembrar depois
                            </button>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Jornada ── */}
                  {mockTab === 'jornada' && (
                    <div className="bg-white rounded-3xl shadow-panel w-full max-w-sm border border-outline-variant overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant bg-surface-variant/80">
                        <span className="material-symbols-outlined ms-fill text-primary text-[16px]">route</span>
                        <span className="flex-1 text-[11px] font-bold text-on-background uppercase tracking-wide">Jornada de ativação</span>
                        <span className="text-[11px] text-outline font-semibold">{Math.min(jornadaEtapa + 1, JORNADA_ETAPAS.length)}/{JORNADA_ETAPAS.length}</span>
                      </div>
                      <div className="p-5">
                        {jornadaEtapa === JORNADA_ETAPAS.length ? (
                          <SuccessCard message="O usuário concluiu todas as etapas da jornada." />
                        ) : (
                          <>
                            <div className="space-y-3 mb-5">
                              {JORNADA_ETAPAS.map((etapa, i) => {
                                const estado = i < jornadaEtapa ? 'feito' : i === jornadaEtapa ? 'atual' : 'pendente'
                                return (
                                  <div key={etapa.titulo} className="flex items-start gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                      estado === 'feito' ? 'bg-tertiary text-white'
                                        : estado === 'atual' ? 'bg-primary/15 text-primary border-2 border-primary'
                                          : 'bg-surface-variant text-outline border border-outline-variant'
                                    }`}>
                                      {estado === 'feito'
                                        ? <span className="material-symbols-outlined ms-fill text-[14px]">check</span>
                                        : <span className="text-[10px] font-bold">{i + 1}</span>}
                                    </div>
                                    <div>
                                      <p className={`text-[13px] leading-snug ${estado === 'pendente' ? 'text-outline' : 'text-on-background font-semibold'}`}>{etapa.titulo}</p>
                                      {estado === 'atual' && <p className="text-[11px] text-on-surface-variant mt-0.5">{etapa.desc}</p>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={avancarJornada}
                              className={`w-full py-2.5 rounded-full bg-primary text-on-primary text-[12px] font-bold hover:opacity-90 transition-opacity ${focusRingLight}`}
                            >
                              {jornadaEtapa === JORNADA_ETAPAS.length - 1 ? 'Concluir jornada' : 'Concluir etapa'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isTerminal && (
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={() => {
                  if (mockTab === 'nps') resetNps()
                  if (mockTab === 'novidade') resetNovidade()
                  if (mockTab === 'destaque') resetDestaque()
                  if (mockTab === 'tour') resetTour()
                  if (mockTab === 'jornada') resetJornada()
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline-variant text-[12px] font-semibold text-on-surface-variant hover:bg-white transition-colors ${focusRingLight}`}
              >
                <span className="material-symbols-outlined text-[15px]">replay</span>
                Reiniciar exemplo
              </button>
            </div>
          )}

          <p className="text-center text-[12px] text-outline mt-4">
            {mockTab === 'nps' && 'Campanha NPS. Selecione uma nota e simule o envio.'}
            {mockTab === 'novidade' && 'Campanha de melhoria. Clique no play, em "Ver novidade" ou em "Lembrar depois".'}
            {mockTab === 'destaque' && 'Destaque de elemento. Um badge chama atenção pro que mudou e mede se foi útil.'}
            {mockTab === 'tour' && 'Tour guiado. Avance pelos passos e veja o roteiro se completar.'}
            {mockTab === 'jornada' && 'Jornada em etapas. Conduz o usuário do primeiro acesso até o uso completo.'}
          </p>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="py-20 sm:py-24 px-4 sm:px-6 bg-on-background scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Como funciona</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-white mb-4 leading-tight">Do script ao dado, em poucos passos</h2>
            <p className="text-white/65 text-[16px] leading-relaxed max-w-xl mx-auto">Integre uma vez. A partir daí, tudo se configura pelo painel.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {FLUXO.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-primary text-[24px]">{step.icon}</span>
                </div>
                <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-[11px] font-bold mb-2">
                  {i + 1}
                </div>
                <p className="text-[13px] font-bold text-white leading-tight mb-1">{step.label}</p>
                <p className="text-[11px] text-white/55 leading-snug">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plataforma / recursos ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Plataforma completa</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">Tudo pra comunicar dentro do produto</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">
              Segmentação, gatilhos, reexibição, tours com preview, dashboard analítico e permissões por usuário. Tudo pronto pra SaaS B2B.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {RECURSOS.map(r => (
              <div key={r.label} className="flex items-center gap-3 p-4 rounded-2xl bg-surface-variant border border-outline-variant hover:border-primary/30 transition-colors">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">{r.icon}</span>
                <span className="text-[13px] font-semibold text-on-background leading-tight">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Casos de uso ── */}
      <section id="casos-de-uso" className="py-20 sm:py-24 px-4 sm:px-6 bg-surface-variant scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Casos de uso</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">Muito além do NPS</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">
              Do NPS ao comunicado obrigatório, do tour guiado à pesquisa por tela: campanhas e roteiros com segmentação e encerramento automático.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CASOS.map(c => (
              <div key={c.titulo} className="rounded-2xl p-5 border border-outline-variant hover:border-primary/30 transition-colors bg-white">
                <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">{c.icon}</span>
                </div>
                <h3 className="font-bold text-on-background mb-1.5">{c.titulo}</h3>
                <p className="text-[13px] text-on-surface-variant leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Métricas / dashboard ── */}
      <section id="metricas" className="py-20 sm:py-24 px-4 sm:px-6 bg-white scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Métricas e resultados</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">Dashboard de resultados</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">Visualizações, respostas, NPS e comentários, disponíveis em tempo real e exportáveis em CSV.</p>
          </div>

          <div className="bg-white rounded-3xl border border-outline-variant shadow-panel overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-outline-variant">
              {[
                { label: 'Visualizações', value: '1.248', icon: 'visibility' },
                { label: 'Respostas', value: '842', icon: 'how_to_vote' },
                { label: 'Taxa de resposta', value: '67,5%', icon: 'percent' },
                { label: 'NPS', value: '72', icon: 'star' },
              ].map(m => (
                <div key={m.label} className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-primary text-[16px]">{m.icon}</span>
                    <span className="text-[11px] text-outline font-medium">{m.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-on-background">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-outline-variant grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant">
              <div className="p-6">
                <p className="text-[13px] font-bold text-on-background mb-4">Distribuição de notas</p>
                <div className="space-y-2">
                  {DIST.map(d => (
                    <div key={d.nota} className="flex items-center gap-3">
                      <span className="text-[12px] font-mono text-outline w-5 text-right shrink-0">{d.nota}</span>
                      <div className="flex-1 bg-surface-variant rounded-full h-5 overflow-hidden">
                        <div className={`h-full ${d.cor} rounded-full flex items-center justify-end pr-2 transition-all`} style={{ width: `${d.pct}%` }}>
                          <span className="text-[10px] text-white font-bold">{d.pct}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] font-bold text-on-background">Comentários recentes</p>
                  <button type="button" className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-[12px] font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors ${focusRingLight}`}>
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    Exportar CSV
                  </button>
                </div>
                <div className="space-y-3">
                  {COMENTARIOS.map((c, i) => (
                    <div key={i} className="p-3 rounded-xl bg-surface-variant border border-outline-variant">
                      <div className="flex items-center gap-1 mb-1">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <span key={j} className="material-symbols-outlined text-[13px]" style={j < Math.round(c.nota / 2) ? { ...fill, color: '#f7b928' } : { color: '#dee3e9' }}>star</span>
                        ))}
                        <span className="text-[11px] text-outline ml-1">nota {c.nota}</span>
                      </div>
                      <p className="text-[13px] text-on-surface-variant italic">&quot;{c.texto}&quot;</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-[12px] text-outline mt-4">Dados fictícios para fins de demonstração</p>
        </div>
      </section>

      {/* ── Governança / permissões ── */}
      <section id="permissoes" className="py-20 sm:py-24 px-4 sm:px-6 bg-surface-variant scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Governança</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">Controle quem faz o quê</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">
              Permissões por usuário dentro do seu próprio time. Cada papel vê e edita só o que faz sentido.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {PERMISSOES.map(p => (
              <div key={p.papel} className="rounded-2xl p-6 bg-white border border-outline-variant">
                <div className="flex items-center gap-2.5 mb-5">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${p.badge}`}>
                    <span className="material-symbols-outlined text-[18px]">{p.icon}</span>
                  </span>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${p.badge}`}>{p.papel}</span>
                </div>
                <ul className="space-y-2.5">
                  {p.capacidades.map(c => (
                    <li key={c} className="flex items-start gap-2 text-[13px] text-on-surface-variant leading-snug">
                      <span className="material-symbols-outlined text-[14px] text-outline shrink-0 mt-0.5">
                        {c.startsWith('Não') ? 'remove' : 'check'}
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Valor por área ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Valor por área</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-on-background mb-4 leading-tight">O que cada área ganha</h2>
            <p className="text-on-surface-variant text-[16px] leading-relaxed max-w-xl mx-auto">O UserPulse entrega valor diferente pra cada perfil interno, a partir da mesma integração.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VALOR.map(v => (
              <div key={v.area} className="rounded-2xl p-6 bg-surface-variant border border-outline-variant">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-primary-fixed flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-[20px]">{v.icon}</span>
                  </div>
                  <span className="font-bold text-[16px] text-on-background">{v.area}</span>
                </div>
                <ul className="space-y-2">
                  {v.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-on-surface-variant leading-snug">
                      <span className="material-symbols-outlined text-[14px] text-primary shrink-0 mt-0.5">check</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integração ── */}
      <section id="integracao" className="py-20 sm:py-24 px-4 sm:px-6 bg-on-background scroll-mt-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-3">Integração simples</p>
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-white mb-4 leading-tight">Pronto em minutos, não em semanas</h2>
            <p className="text-white/65 text-[16px] leading-relaxed max-w-xl mx-auto">
              Uma tag <code className="text-primary font-mono text-[13px]">&lt;script&gt;</code> no HTML. Três funções JavaScript.
              Integre uma vez e depois configure cada experiência pelo painel, sem novo deploy.
            </p>
          </div>
          <CodeSnippet code={CODE_INTEGRACAO} />
          <div className="flex justify-center mt-8">
            <Link to="/integracao" className={pillPrimary}>
              <span className="material-symbols-outlined text-[18px]">integration_instructions</span>
              Ver documentação completa
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="relative py-24 px-4 sm:px-6 bg-on-background overflow-hidden">
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-4">Pronto para começar?</p>
          <h2 className="text-[28px] sm:text-[40px] font-semibold text-white mb-5 leading-tight">
            Transforme mudanças do produto em adoção
          </h2>
          <p className="text-white/70 max-w-xl mx-auto mb-10 text-[16px] leading-relaxed">
            Com uma única integração, o UserPulse permite comunicar, pesquisar, medir adoção e coletar feedback contextual.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cadastro" className={pillPrimary}>
              <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
              Testar grátis
            </Link>
            <Link to="/integracao" className={pillOutlineDark}>
              Ver documentação
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 bg-on-background border-t border-white/10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined ms-fill text-[16px]">pulse_alert</span>
            </div>
            <div>
              <p className="text-white font-bold text-[14px] leading-tight">UserPulse</p>
              <p className="text-white/45 text-[11px]">Feedback Engine</p>
            </div>
          </div>
          <p className="text-[12px] text-white/45">Campanhas in-product para sistemas SaaS</p>
          <Link to="/integracao" className={`text-[12px] font-semibold text-white/65 hover:text-white transition-colors rounded ${focusRingDark}`}>
            Documentação →
          </Link>
        </div>
      </footer>

    </div>
  )
}
