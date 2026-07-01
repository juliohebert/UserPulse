import { useState, useRef, useEffect } from 'react'

// ── helpers ───────────────────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function CodeSnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-2xl overflow-hidden border border-[#313244]">
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2 border-b border-[#313244]">
        <span className="text-[11px] text-[#6c7086] font-mono uppercase tracking-wider">javascript</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors">
          <span className="material-symbols-outlined text-[14px]">{copied ? 'check_circle' : 'content_copy'}</span>
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="bg-[#1e1e2e] px-5 py-5 overflow-x-auto">
        <code className="text-[13px] text-[#cdd6f4] font-mono leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}

// ── data ──────────────────────────────────────────────────────────────────────

const PROBLEMAS = [
  {
    icon: 'mail_off', color: 'text-rose-500', bg: 'bg-rose-50',
    titulo: 'Emails e pesquisas ignorados',
    desc: 'Taxa de resposta abaixo de 20% quando o canal é externo ao produto. O usuário já saiu do contexto em que o problema ocorreu.',
  },
  {
    icon: 'memory_alt', color: 'text-orange-500', bg: 'bg-orange-50',
    titulo: 'Contexto perdido',
    desc: 'O usuário precisa lembrar o que aconteceu para responder dias depois. Feedbacks valem menos sem o contexto da tela e da ação.',
  },
  {
    icon: 'group_off', color: 'text-amber-600', bg: 'bg-amber-50',
    titulo: 'Sem precisão de público',
    desc: 'Comunicados disparados para toda a base — incluindo quem nunca usou a funcionalidade — geram ruído e baixa acuidade nos dados.',
  },
]

const SOLUCOES = [
  {
    icon: 'frame_inspect', color: 'text-primary', bg: 'bg-primary-fixed',
    titulo: 'In-app, na tela certa',
    desc: 'A campanha aparece dentro do sistema, na tela exata onde o usuário está — não em email enviado dias depois.',
  },
  {
    icon: 'manage_accounts', color: 'text-secondary', bg: 'bg-secondary-fixed',
    titulo: 'Segmentação sem esforço',
    desc: 'Por cliente, unidade, perfil, tipo de usuário e estado — combine quantos filtros precisar, sem lista manual.',
  },
  {
    icon: 'event_available', color: 'text-tertiary', bg: 'bg-tertiary-fixed',
    titulo: 'Encerramento por evento',
    desc: 'Defina um evento de adoção e a campanha se encerra automaticamente quando o usuário o dispara.',
  },
]

const FLUXO = [
  { icon: 'web', label: 'Sistema integrado', desc: 'Script carregado no HTML do produto' },
  { icon: 'person_pin', label: 'Contexto do usuário', desc: 'ID, perfil, cliente, unidade, estado' },
  { icon: 'filter_alt', label: 'Campanha elegível', desc: 'Segmentação + regras de exibição' },
  { icon: 'open_in_full', label: 'Exibição in-app', desc: 'Modal no momento e tela certos' },
  { icon: 'how_to_vote', label: 'Resposta / Clique', desc: 'Feedback, confirmação ou CTA' },
  { icon: 'analytics', label: 'Dashboard + CSV', desc: 'Resultados prontos para análise' },
]

const CASOS = [
  { icon: 'map', titulo: 'Tours Guiados', desc: 'Crie roteiros interativos para ensinar fluxos, apresentar funcionalidades e orientar usuários passo a passo dentro da aplicação.' },
  { icon: 'star_rate', titulo: 'NPS recorrente', desc: 'Colete NPS em intervalos configuráveis dos usuários mais ativos, direto na tela principal do sistema.' },
  { icon: 'new_releases', titulo: 'Nova funcionalidade', desc: 'Anuncie melhorias para quem usa a tela afetada — sem ruído para quem nunca acessou.' },
  { icon: 'verified_user', titulo: 'Comunicado obrigatório', desc: 'Exija confirmação de leitura antes de liberar o acesso. A campanha fica ativa até o usuário confirmar.' },
  { icon: 'fact_check', titulo: 'Pesquisa por tela', desc: 'Valide uma funcionalidade específica com os usuários que realmente a utilizam.' },
  { icon: 'account_tree', titulo: 'Segmentação por contexto', desc: 'Direcione por cliente, unidade, perfil ou estado. Combine quantos filtros quiser.' },
  { icon: 'trending_up', titulo: 'Adoção de melhorias', desc: 'A campanha encerra automaticamente quando o usuário disparar o evento que confirma a adoção.' },
]

const RECURSOS = [
  { icon: 'grid_view', label: 'Catálogo de telas' },
  { icon: 'manage_accounts', label: 'Segmentação avançada' },
  { icon: 'labs', label: 'Teste de elegibilidade' },
  { icon: 'low_priority', label: 'Prioridade entre campanhas' },
  { icon: 'schedule', label: 'Reexibição configurável' },
  { icon: 'event_available', label: 'Encerramento por evento' },
  { icon: 'bolt', label: 'Eventos globais' },
  { icon: 'analytics', label: 'Dashboard analítico' },
  { icon: 'download', label: 'Exportação CSV' },
  { icon: 'sync', label: 'updateContext para SPA' },
  { icon: 'auto_awesome', label: 'Templates de tour' },
  { icon: 'play_circle', label: 'Preview antes de publicar' },
  { icon: 'monitoring', label: 'Conclusão e abandono de tours' },
  { icon: 'sync_alt', label: 'Importação/exportação JSON' },
]

const VALOR = [
  {
    icon: 'corporate_fare', area: 'CEO',
    cor: 'from-slate-700 to-slate-900',
    items: ['Adoção de funcionalidades medida em dados reais', 'Satisfação segmentada por cliente e perfil', 'Decisões de produto embasadas, não inferidas'],
  },
  {
    icon: 'support_agent', area: 'CX',
    cor: 'from-blue-600 to-blue-800',
    items: ['Feedback contextualizado por tela e momento de uso', 'Triagem por cliente, unidade e perfil de usuário', 'Respostas exportáveis em CSV para análise imediata'],
  },
  {
    icon: 'science', area: 'Produto',
    cor: 'from-violet-600 to-violet-900',
    items: ['Valide features com quem já usa, não com toda a base', 'Campanha encerra quando o evento de adoção ocorre', 'Pesquisa qualitativa in-product, sem formulário externo'],
  },
  {
    icon: 'handshake', area: 'Vendas',
    cor: 'from-emerald-600 to-emerald-800',
    items: ['NPS por conta para embasar upsell e renovação', 'Evidência de satisfação para apresentar ao cliente', 'Identifique risco de churn antes da próxima renovação'],
  },
]

const CODE_INTEGRACAO = `// 1. Após o login do usuário
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

// ── mock data ──────────────────────────────────────────────────────────────────

const DIST = [
  { nota: 10, pct: 38, cor: 'bg-emerald-500' },
  { nota: 9,  pct: 24, cor: 'bg-emerald-400' },
  { nota: 8,  pct: 18, cor: 'bg-yellow-400' },
  { nota: 7,  pct: 10, cor: 'bg-orange-400' },
  { nota: 6,  pct: 5,  cor: 'bg-orange-500' },
  { nota: 5,  pct: 3,  cor: 'bg-rose-400' },
  { nota: '≤4', pct: 2, cor: 'bg-rose-600' },
]

const COMENTARIOS = [
  { nota: 10, texto: 'A nova agenda ficou muito mais rápida. Uso todo dia agora.' },
  { nota: 9,  texto: 'Ótimo, mas gostaria de filtros por especialidade.' },
  { nota: 8,  texto: 'Melhorou bastante. A busca ainda poderia ser mais intuitiva.' },
]

// ── Mock helpers ──────────────────────────────────────────────────────────────

function ScaleSelector({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-0.5 w-full">
      {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 min-w-0 aspect-square rounded-md text-[10px] font-bold border transition-all ${
            value === n
              ? 'bg-primary text-on-primary border-primary shadow-sm'
              : 'bg-white border-slate-200 text-slate-500 hover:border-primary hover:text-primary'
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
          <span className="material-symbols-outlined text-on-primary text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>pulse_alert</span>
        </div>
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">UserPulse</span>
      </div>
      <span className="material-symbols-outlined text-slate-300 text-[18px] select-none">close</span>
    </div>
  )
}

function SuccessCard({ message }: { message: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
        <span className="material-symbols-outlined text-emerald-500 text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      </div>
      <h3 className="text-[16px] font-bold text-slate-800 mb-1">Obrigado!</h3>
      <p className="text-[13px] text-slate-500">{message}</p>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export function ApresentacaoPage() {
  type MockTab = 'nps' | 'melhoria' | 'feedback' | 'tour'
  const [mockTab, setMockTab] = useState<MockTab>('nps')

  // NPS state
  const [npsNota, setNpsNota]   = useState<number | null>(null)
  const [npsPhase, setNpsPhase] = useState<'idle' | 'sending' | 'success'>('idle')

  // Melhoria state
  const [melhoriaPhase, setMelhoriaPhase] = useState<'idle' | 'playing' | 'fb_sending' | 'fb_success' | 'postponed'>('idle')
  const [melhoriaCtaDone, setMelhoriaCtaDone] = useState(false)
  const [melhoriaFbNota, setMelhoriaFbNota] = useState<number | null>(null)
  const [melhoriaFbObs,  setMelhoriaFbObs]  = useState('')

  // Feedback detalhado state
  const [fbNota, setFbNota]   = useState<number | null>(null)
  const [fbObs,  setFbObs]    = useState('')
  const [fbPhase, setFbPhase] = useState<'idle' | 'sending' | 'success'>('idle')

  function resetNps()      { setNpsNota(null);    setNpsPhase('idle') }
  function resetMelhoria() { setMelhoriaPhase('idle'); setMelhoriaCtaDone(false); setMelhoriaFbNota(null); setMelhoriaFbObs('') }
  function resetFeedback() { setFbNota(null); setFbObs(''); setFbPhase('idle') }

  function sendNps() {
    if (!npsNota) return
    setNpsPhase('sending')
    setTimeout(() => setNpsPhase('success'), 1100)
  }

  function sendFeedback() {
    if (!fbNota) return
    setFbPhase('sending')
    setTimeout(() => setFbPhase('success'), 1100)
  }

  function sendMelhoriaFb() {
    if (!melhoriaFbNota) return
    setMelhoriaPhase('fb_sending')
    setTimeout(() => setMelhoriaPhase('fb_success'), 1100)
  }

  const isTerminal =
    (mockTab === 'nps'      && npsPhase === 'success') ||
    (mockTab === 'melhoria' && (melhoriaPhase === 'fb_success' || melhoriaPhase === 'postponed')) ||
    (mockTab === 'feedback' && fbPhase === 'success')

  useEffect(() => {
    const prev = document.title
    document.title = 'UserPulse — Campanhas in-product para o usuário certo'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="min-h-screen bg-white font-[Inter,sans-serif]">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0f172a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>pulse_alert</span>
            </div>
            <span className="text-white font-bold text-[15px] tracking-tight">UserPulse</span>
          </div>
          <div className="hidden lg:flex items-center gap-1">
            {([
              { label: 'Campanhas em ação', id: 'casos-de-uso' },
              { label: 'Possibilidades',    id: 'por-que-usar' },
              { label: 'Benefícios',        id: 'valor-por-area' },
              { label: 'Como funciona',     id: 'como-funciona' },
            ] as const).map(link => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="px-3 py-1.5 rounded-lg text-[13px] text-slate-300 hover:text-white hover:bg-white/8 transition-all"
              >
                {link.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a href="/integracao" className="hidden sm:block text-[13px] text-slate-300 hover:text-white transition-colors">
              Documentação
            </a>
            <button
              onClick={() => scrollTo('integracao')}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Ver integração
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] pt-32 pb-24 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[12px] font-semibold mb-6">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Campanhas In-app · Tours Guiados · NPS · Comunicados · Eventos
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6">
            Campanhas no momento{' '}
            <span className="text-primary">certo</span>{' '}
            para o usuário{' '}
            <span className="text-primary">certo</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            NPS, comunicados obrigatórios, anúncios de funcionalidade, pesquisas qualitativas e tours guiados —
            tudo in-app, na tela certa, segmentado por cliente, perfil e unidade.
            O UserPulse não só coleta feedback: comunica, pesquisa e guia o usuário dentro do próprio produto,
            acelerando a adoção de novas funcionalidades sem treinamento manual.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => scrollTo('casos-de-uso')}
              className="px-7 py-3.5 rounded-xl bg-primary text-on-primary font-bold text-[15px] hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/30"
            >
              Ver campanhas em ação
            </button>
            <button
              onClick={() => scrollTo('como-funciona')}
              className="px-7 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-[15px] hover:bg-white/20 active:scale-95 transition-all"
            >
              Como funciona
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            {([
              { label: 'Ver campanhas em ação', id: 'casos-de-uso' },
              { label: 'Possibilidades',         id: 'por-que-usar' },
              { label: 'Benefícios',             id: 'valor-por-area' },
              { label: 'Como funciona',          id: 'como-funciona' },
              { label: 'Integração',             id: 'integracao' },
            ] as const).map(link => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="px-3 py-1 rounded-full text-[12px] font-medium text-slate-400 border border-white/10 hover:border-white/30 hover:text-white transition-all"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problema ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-rose-500 uppercase tracking-widest mb-2">O problema</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Por que feedbacks fora do produto falham?</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Quando a coleta de feedback é separada da experiência real, você perde contexto, precisão e taxa de resposta.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {PROBLEMAS.map(p => (
              <div key={p.titulo} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className={`w-11 h-11 rounded-xl ${p.bg} flex items-center justify-center mb-4`}>
                  <span className={`material-symbols-outlined ${p.color} text-[22px]`}>{p.icon}</span>
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{p.titulo}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Antes e Depois ── */}
      <section className="py-14 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-2">Transformação</p>
            <h2 className="text-2xl font-extrabold text-slate-900">Antes e depois do UserPulse</h2>
          </div>
          <div className="grid sm:grid-cols-2 rounded-2xl overflow-hidden border border-slate-200 shadow-md">
            <div className="bg-rose-50 p-7 sm:p-8">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-rose-500 text-[18px]">close</span>
                </div>
                <h3 className="text-[16px] font-extrabold text-rose-700">Antes</h3>
              </div>
              <ul className="space-y-3">
                {['E-mails e formulários externos', 'Baixa taxa de resposta', 'Feedback fora do contexto de uso', 'Pouca visão por cliente e perfil'].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[14px] text-rose-900/80">
                    <span className="material-symbols-outlined text-rose-400 text-[16px] shrink-0 mt-0.5">cancel</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-emerald-50 p-7 sm:p-8 border-t sm:border-t-0 sm:border-l border-slate-200">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <h3 className="text-[16px] font-extrabold text-emerald-700">Com UserPulse</h3>
              </div>
              <ul className="space-y-3">
                {['Campanhas dentro do produto', 'Tours interativos dentro do produto', 'Adoção guiada de novas funcionalidades', 'Segmentação por cliente, unidade e perfil', 'Feedback no momento de uso', 'Dashboard e CSV para decisão'].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[14px] text-emerald-900/80">
                    <span className="material-symbols-outlined text-emerald-500 text-[16px] shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Solução ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">A solução</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">A camada de comunicação do seu produto</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Pesquisa, comunicado, anúncio ou aviso obrigatório — dentro do produto, no momento certo, para o perfil certo.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {SOLUCOES.map(s => (
              <div key={s.titulo} className="rounded-2xl p-6 border border-outline-variant bg-surface-container-lowest shadow-sm">
                <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center mb-4`}>
                  <span className={`material-symbols-outlined ${s.color} text-[22px]`}>{s.icon}</span>
                </div>
                <h3 className="font-bold text-on-surface mb-2">{s.titulo}</h3>
                <p className="text-[14px] text-on-surface-variant leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="py-20 px-4 sm:px-6 bg-[#0f172a] scroll-mt-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Fluxo</p>
            <h2 className="text-3xl font-extrabold text-white mb-4">Como o UserPulse funciona</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Do script no HTML ao dado disponível no dashboard — em menos de 5 minutos de integração.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {FLUXO.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center text-center relative">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-primary text-[24px]">{step.icon}</span>
                </div>
                <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-[11px] font-bold mb-2">
                  {i + 1}
                </div>
                <p className="text-[13px] font-bold text-white leading-tight mb-1">{step.label}</p>
                <p className="text-[11px] text-slate-400 leading-snug">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Casos de uso ── */}
      <section id="casos-de-uso" className="py-20 px-4 sm:px-6 bg-white scroll-mt-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Casos de uso</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Muito além do NPS</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Do NPS ao comunicado obrigatório, do tour guiado à pesquisa por tela: configure campanhas e roteiros com segmentação, reexibição e encerramento automático por evento.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CASOS.map(c => (
              <div key={c.titulo} className="group rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-primary/30 hover:shadow-md transition-all bg-white">
                <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">{c.icon}</span>
                </div>
                <h3 className="font-bold text-slate-800 mb-1.5">{c.titulo}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Recursos ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Plataforma</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Uma plataforma completa</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Segmentação, reexibição, eventos, tours guiados com templates e preview, dashboard analítico e importação/exportação — tudo pronto para SaaS B2B.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {RECURSOS.map(r => (
              <div key={r.label} className="flex flex-col items-center text-center gap-2 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-primary/20 hover:shadow transition-all">
                <span className="material-symbols-outlined text-primary text-[24px]">{r.icon}</span>
                <span className="text-[13px] font-semibold text-slate-700 leading-tight">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mock Campanha ── */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Experiência</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Como aparece para o usuário</h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              A campanha aparece como um modal elegante e o tour guiado destaca o elemento certo — sempre no contexto,
              sem redirecionar o usuário para fora do sistema.
            </p>
          </div>

          {/* 4-tab selector */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1 max-w-sm sm:max-w-lg mx-auto mb-8">
            {([
              { key: 'nps',      icon: 'star_rate',    short: 'NPS',      label: 'Pesquisa NPS' },
              { key: 'melhoria', icon: 'new_releases', short: 'Melhoria', label: 'Nova funcionalidade' },
              { key: 'feedback', icon: 'rate_review',  short: 'Feedback', label: 'Feedback detalhado' },
              { key: 'tour',     icon: 'map',           short: 'Tour',     label: 'Tour Guiado' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setMockTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                  mockTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Browser mock */}
          <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden border border-slate-200 shadow-xl">
            {/* Browser bar */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 mx-4 bg-white rounded-lg px-3 py-1 text-[12px] text-slate-400 border border-slate-200">
                meusistema.com.br/agenda
              </div>
            </div>

            {/* App content — mock do tour é mais baixo: sem modal centralizado,
                não precisa da mesma altura das abas de campanha. */}
            <div className={`relative bg-slate-50 transition-[min-height] ${mockTab === 'tour' ? 'min-h-[300px] sm:min-h-[360px]' : 'min-h-[420px] sm:min-h-[620px]'}`}>
              {/* Fake app chrome — mesmo cenário para todas as abas. No tour, o
                  botão do topo vira o elemento destacado (spotlight) e o resto
                  do conteúdo escurece, em vez do modal com fundo preto. */}
              <div className="absolute inset-0 flex">
                <div className="w-14 bg-slate-800 flex flex-col items-center pt-3 gap-3 shrink-0">
                  {['home', 'calendar_month', 'people', 'bar_chart', 'settings'].map(ic => (
                    <div key={ic} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white/60 text-[16px]">{ic}</span>
                    </div>
                  ))}
                </div>
                <div className="flex-1 p-4 overflow-hidden select-none">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`h-5 w-32 bg-slate-200 rounded-lg transition-opacity ${mockTab === 'tour' ? 'opacity-40' : ''}`} />
                    <div className="relative">
                      <div
                        className={`h-7 w-24 rounded-lg flex items-center justify-center gap-1 transition-all ${
                          mockTab === 'tour' ? 'bg-primary shadow-lg ring-4 ring-primary/30' : 'bg-primary/20'
                        }`}
                      >
                        {mockTab === 'tour' && (
                          <>
                            <span className="material-symbols-outlined text-white text-[13px]">add</span>
                            <span className="text-white text-[10px] font-bold">Agendar</span>
                          </>
                        )}
                      </div>

                      {/* ── Tooltip do tour ── */}
                      {mockTab === 'tour' && (
                        <div className="absolute right-0 top-full mt-3 w-60 sm:w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-20 text-left">
                          {/* Seta apontando para o botão "Agendar" destacado */}
                          <div className="absolute -top-[7px] right-6 w-3.5 h-3.5 bg-white border-t border-l border-slate-200 rotate-45" />
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Passo 1 de 3</p>
                          <p className="text-[14px] font-bold text-slate-800 mb-1 leading-snug">Crie um novo agendamento</p>
                          <p className="text-[12px] text-slate-500 mb-3 leading-relaxed">Clique aqui para iniciar o fluxo de agendamento.</p>
                          <div className="flex items-center gap-1 mb-3">
                            {[0, 1, 2].map(d => (
                              <span key={d} className={`h-1.5 rounded-full ${d === 0 ? 'w-3.5 bg-primary' : 'w-1.5 bg-slate-200'}`} />
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-400">Pular</span>
                            <span className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold">Próximo</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`grid grid-cols-3 gap-2 mb-3 transition-opacity ${mockTab === 'tour' ? 'opacity-40' : ''}`}>
                    {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-slate-100" />)}
                  </div>
                  <div className={`space-y-2 transition-opacity ${mockTab === 'tour' ? 'opacity-40' : ''}`}>
                    {[1,2,3,4].map(i => <div key={i} className="h-10 bg-white rounded-xl border border-slate-100" />)}
                  </div>
                </div>
              </div>

              {/* Overlay — modais de campanha. O tour não usa fundo preto: o
                  destaque é o spotlight no elemento, não uma modal centralizada. */}
              {mockTab !== 'tour' && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">

                {/* ── NPS modal ── */}
                {mockTab === 'nps' && (
                  <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 w-full max-w-[300px] sm:max-w-xs border border-slate-100">
                    <ModalHeader />
                    {npsPhase === 'success' ? (
                      <SuccessCard message="Sua avaliação foi registrada." />
                    ) : npsPhase === 'sending' ? (
                      <div className="text-center py-6">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                        <p className="text-[13px] text-slate-400">Enviando...</p>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-[15px] font-bold text-slate-800 mt-3 mb-1">Como você avalia a nova agenda?</h3>
                        <p className="text-[12px] text-slate-400 mb-4">Sua opinião nos ajuda a melhorar a experiência.</p>
                        <ScaleSelector value={npsNota} onChange={setNpsNota} />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 mb-4">
                          <span>Ruim</span><span>Excelente</span>
                        </div>
                        <button
                          onClick={sendNps}
                          disabled={!npsNota}
                          className="w-full py-2.5 rounded-xl bg-primary text-on-primary text-[13px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        >
                          {npsNota ? 'Enviar avaliação' : 'Selecione uma nota'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ── Melhoria modal ── */}
                {mockTab === 'melhoria' && (
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">

                    {/* Header — título da campanha + X */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50/80">
                      <span className="material-symbols-outlined text-primary text-[16px] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                      <span className="flex-1 text-[11px] text-slate-700 font-semibold leading-tight">
                        Conheça a Funcionalidade de Agendamentos do QuarkClinic
                      </span>
                      <span className="material-symbols-outlined text-slate-300 text-[15px] select-none shrink-0">close</span>
                    </div>

                    {/* Fases terminais */}
                    {melhoriaPhase === 'fb_success' && (
                      <div className="p-5">
                        <SuccessCard message="Novidade registrada. Feedback enviado!" />
                      </div>
                    )}

                    {melhoriaPhase === 'fb_sending' && (
                      <div className="px-5 py-8 text-center">
                        <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2.5" />
                        <p className="text-[12px] text-slate-400">Enviando...</p>
                      </div>
                    )}

                    {melhoriaPhase === 'postponed' && (
                      <div className="px-5 py-7 text-center">
                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-2">
                          <span className="material-symbols-outlined text-slate-400 text-[20px]">schedule</span>
                        </div>
                        <p className="text-[13px] font-bold text-slate-800 mb-0.5">Campanha adiada</p>
                        <p className="text-[11px] text-slate-400">Será reexibida conforme a política configurada.</p>
                      </div>
                    )}

                    {/* Conteúdo principal — idle ou playing */}
                    {(melhoriaPhase === 'idle' || melhoriaPhase === 'playing') && (
                      <div className="px-4 pt-3 pb-4 flex flex-col gap-2">

                        {/* Subtítulo azul */}
                        <p className="text-[12px] font-semibold text-blue-600 leading-tight">
                          Confira o que chegou de novo para você
                        </p>

                        {/* Vídeo */}
                        <div
                          className="relative w-full rounded-xl overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 cursor-pointer h-[88px] sm:h-[112px]"
                          onClick={() => melhoriaPhase === 'idle' && setMelhoriaPhase('playing')}
                        >
                          <div className="absolute inset-0 opacity-20 select-none pointer-events-none">
                            <div className="absolute top-2 left-3 w-16 h-2 bg-white/40 rounded-full" />
                            <div className="absolute top-5 left-3 w-11 h-2 bg-white/25 rounded-full" />
                            <div className="absolute top-2 right-3 w-8 h-8 rounded-lg bg-white/10" />
                          </div>
                          {melhoriaPhase === 'playing' ? (
                            <>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-white/20 border border-white/40 backdrop-blur-sm flex items-center justify-center">
                                  <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause</span>
                                </div>
                              </div>
                              <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-black/50 rounded px-1.5 py-0.5">
                                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                <span className="text-[9px] text-white/90 font-mono">Em reprodução</span>
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                                <div className="h-full bg-primary" style={{ width: '58%' }} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-white/20 border border-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                                  <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                                </div>
                              </div>
                              <span className="absolute bottom-1.5 right-2 text-[9px] text-white/70 font-mono bg-black/50 px-1.5 py-0.5 rounded">0:42</span>
                            </>
                          )}
                        </div>

                        {/* Texto explicativo */}
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Temos uma novidade que vai facilitar o seu dia a dia! Acesse agora mesmo e explore todas as possibilidades do QuarkClinic.
                        </p>

                        {/* CTA */}
                        <button
                          onClick={() => setMelhoriaCtaDone(true)}
                          className={`w-full py-2 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                            melhoriaCtaDone
                              ? 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                              : 'bg-primary text-on-primary hover:opacity-90'
                          }`}
                        >
                          {melhoriaCtaDone && (
                            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          )}
                          {melhoriaCtaDone ? 'Clique registrado' : 'Ver novidade'}
                        </button>

                        {/* Separador */}
                        <div className="border-t border-slate-100" />

                        {/* Feedback section */}
                        <p className="text-[11px] font-bold text-slate-800 leading-tight">
                          O que você achou dessa novidade?
                        </p>

                        <ScaleSelector value={melhoriaFbNota} onChange={setMelhoriaFbNota} />

                        <div className="flex justify-between text-[9px] font-semibold text-slate-400 tracking-wide -mt-1">
                          <span>RUIM</span><span>EXCELENTE</span>
                        </div>

                        <textarea
                          value={melhoriaFbObs}
                          onChange={e => setMelhoriaFbObs(e.target.value)}
                          placeholder="Observação (opcional)"
                          rows={2}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                        />

                        <button
                          onClick={sendMelhoriaFb}
                          disabled={!melhoriaFbNota}
                          className="w-full py-2 rounded-xl bg-primary text-on-primary text-[12px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        >
                          Enviar Feedback
                        </button>

                        <p className="text-center -mt-0.5">
                          <button
                            onClick={() => setMelhoriaPhase('postponed')}
                            className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            Lembrar depois
                          </button>
                        </p>

                      </div>
                    )}

                  </div>
                )}

                {/* ── Feedback detalhado modal ── */}
                {mockTab === 'feedback' && (
                  <div className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 w-full max-w-[320px] sm:max-w-sm md:max-w-md border border-slate-100">
                    <ModalHeader />
                    {fbPhase === 'success' ? (
                      <SuccessCard message="Seu feedback foi registrado." />
                    ) : fbPhase === 'sending' ? (
                      <div className="text-center py-6">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                        <p className="text-[13px] text-slate-400">Enviando...</p>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-[15px] font-bold text-slate-800 mt-3 mb-0.5">Como foi sua experiência com a nova agenda?</h3>
                        <p className="text-[12px] text-slate-400 mb-4">Sua opinião ajuda a melhorar a funcionalidade.</p>
                        <ScaleSelector value={fbNota} onChange={setFbNota} />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 mb-3">
                          <span>Ruim</span><span>Excelente</span>
                        </div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Observação <span className="font-normal text-slate-400">(opcional)</span></label>
                        <textarea
                          value={fbObs}
                          onChange={e => setFbObs(e.target.value)}
                          placeholder="Conte pra gente o motivo da sua nota..."
                          rows={3}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none mb-3 min-h-[72px]"
                        />
                        <button
                          onClick={sendFeedback}
                          disabled={!fbNota}
                          className="w-full py-2.5 rounded-xl bg-primary text-on-primary text-[13px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        >
                          {fbNota ? 'Enviar feedback' : 'Selecione uma nota'}
                        </button>
                      </>
                    )}
                  </div>
                )}

              </div>
              )}
            </div>
          </div>

          {/* Reset button — visible only in terminal states */}
          {isTerminal && (
            <div className="flex justify-center mt-5">
              <button
                onClick={() => {
                  if (mockTab === 'nps')      resetNps()
                  if (mockTab === 'melhoria') resetMelhoria()
                  if (mockTab === 'feedback') resetFeedback()
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">replay</span>
                Reiniciar exemplo
              </button>
            </div>
          )}

          {/* Caption */}
          <p className="text-center text-[12px] text-slate-400 mt-4">
            {mockTab === 'nps'      && 'Campanha NPS — selecione uma nota e simule o envio'}
            {mockTab === 'melhoria' && 'Campanha de melhoria — clique no play, "Ver novidade" ou "Depois"'}
            {mockTab === 'feedback' && 'Feedback detalhado — nota + observação opcional, simule o envio'}
            {mockTab === 'tour'     && 'Use tours para ensinar fluxos, reduzir dúvidas e acelerar adoção sem tirar o usuário da tela.'}
          </p>
          <div className="mt-6 mx-auto max-w-2xl p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Além de pesquisas, o UserPulse também ajuda a{' '}
              <strong className="text-slate-700">comunicar melhorias e guiar o usuário passo a passo</strong>{' '}
              dentro do próprio sistema — reduzindo treinamento manual e acelerando a adoção de novas funcionalidades,
              no fluxo real de uso.
            </p>
          </div>
        </div>
      </section>

      {/* ── Mock Dashboard ── */}
      <section className="py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Análise</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Dashboard de resultados</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Visualizações, respostas, NPS e comentários — disponíveis em tempo real e exportáveis em CSV.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-lg overflow-hidden">
            {/* Metrics row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
              {[
                { label: 'Visualizações', value: '1.248', icon: 'visibility', color: 'text-slate-500' },
                { label: 'Respostas', value: '842', icon: 'how_to_vote', color: 'text-primary' },
                { label: 'Taxa de resposta', value: '67,5%', icon: 'percent', color: 'text-emerald-600' },
                { label: 'NPS', value: '72', icon: 'star', color: 'text-amber-500' },
              ].map(m => (
                <div key={m.label} className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`material-symbols-outlined text-[16px] ${m.color}`}>{m.icon}</span>
                    <span className="text-[11px] text-slate-400 font-medium">{m.label}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-800">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
              {/* Distribution */}
              <div className="p-6">
                <p className="text-[13px] font-bold text-slate-700 mb-4">Distribuição de notas</p>
                <div className="space-y-2">
                  {DIST.map(d => (
                    <div key={d.nota} className="flex items-center gap-3">
                      <span className="text-[12px] font-mono text-slate-400 w-5 text-right shrink-0">{d.nota}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-full ${d.cor} rounded-full flex items-center justify-end pr-2 transition-all`}
                          style={{ width: `${d.pct}%` }}
                        >
                          <span className="text-[10px] text-white font-bold">{d.pct}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comments */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] font-bold text-slate-700">Comentários recentes</p>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition-colors">
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    Exportar CSV
                  </button>
                </div>
                <div className="space-y-3">
                  {COMENTARIOS.map((c, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-1 mb-1">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <span key={j} className={`material-symbols-outlined text-[13px] ${j < Math.round(c.nota / 2) ? 'text-amber-400' : 'text-slate-200'}`} style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        ))}
                        <span className="text-[11px] text-slate-400 ml-1">nota {c.nota}</span>
                      </div>
                      <p className="text-[13px] text-slate-600 italic">"{c.texto}"</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-[12px] text-slate-400 mt-4">Dados fictícios para fins de demonstração</p>
        </div>
      </section>

      {/* ── Por que usar ── */}
      <section id="por-que-usar" className="py-20 px-4 sm:px-6 bg-white scroll-mt-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Por que usar</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Por que usar o UserPulse?</h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Mais do que pesquisas: uma camada de comunicação, feedback e adoção dentro do produto.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="rounded-2xl p-7 bg-slate-50 border border-slate-200 hover:border-primary/30 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-[26px]">dashboard_customize</span>
              </div>
              <h3 className="text-[17px] font-extrabold text-slate-900 mb-2">Possibilidades</h3>
              <p className="text-[14px] text-slate-600 leading-relaxed">
                NPS, comunicados obrigatórios, anúncios de melhoria, tours guiados, pesquisas por tela e campanhas de adoção — tudo no mesmo painel.
              </p>
            </div>
            <div className="rounded-2xl p-7 bg-slate-50 border border-slate-200 hover:border-primary/30 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-[26px]">bolt</span>
              </div>
              <h3 className="text-[17px] font-extrabold text-slate-900 mb-2">Facilidade de uso</h3>
              <p className="text-[14px] text-slate-600 leading-relaxed">
                Integre uma vez via script. A partir daí, crie, publique e ajuste campanhas pelo painel — sem deploy, sem código adicional, sem envolver o time técnico.
              </p>
            </div>
            <div className="rounded-2xl p-7 bg-slate-50 border border-slate-200 hover:border-primary/30 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-[26px]">insights</span>
              </div>
              <h3 className="text-[17px] font-extrabold text-slate-900 mb-2">Benefício mensurável</h3>
              <p className="text-[14px] text-slate-600 leading-relaxed">
                Visualizações, respostas, cliques, NPS e comentários segmentados por cliente, unidade e perfil. Exporte em CSV para análise e apresentação.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Valor por área ── */}
      <section id="valor-por-area" className="py-20 px-4 sm:px-6 bg-slate-50 scroll-mt-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Valor</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">O que cada área ganha</h2>
            <p className="text-slate-500 max-w-xl mx-auto">O UserPulse entrega valor diferente para cada perfil interno — tudo a partir da mesma integração.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VALOR.map(v => (
              <div key={v.area} className={`rounded-2xl bg-gradient-to-br ${v.cor} p-5 text-white`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[20px]">{v.icon}</span>
                  </div>
                  <span className="font-extrabold text-[16px]">{v.area}</span>
                </div>
                <ul className="space-y-2">
                  {v.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-white/90">
                      <span className="material-symbols-outlined text-[14px] text-white/60 shrink-0 mt-0.5">check</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-4">Pronto para começar?</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5 leading-tight">
            Pronto para transformar comunicação em produto?
          </h2>
          <p className="text-slate-300 max-w-xl mx-auto mb-10 text-[16px] leading-relaxed">
            Com uma única integração, o UserPulse permite comunicar, pesquisar, medir adoção e coletar feedback contextual.
          </p>
          <div className="flex justify-center">
            <button
              onClick={() => scrollTo('integracao')}
              className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-on-primary font-bold text-[15px] hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/30"
            >
              <span className="material-symbols-outlined text-[18px]">integration_instructions</span>
              Ver integração
            </button>
          </div>
        </div>
      </section>

      {/* ── Integração ── */}
      <section id="integracao" className="py-20 px-4 sm:px-6 bg-[#0f172a] scroll-mt-14">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest mb-2">Integração</p>
            <h2 className="text-3xl font-extrabold text-white mb-4">Pronto em minutos, não em semanas</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Uma tag{' '}
              <code className="text-primary font-mono text-[13px]">&lt;script&gt;</code>{' '}
              no HTML. Três funções JavaScript. Sem backend adicional, sem banco de dados, sem build pipeline.
            </p>
          </div>
          <CodeSnippet code={CODE_INTEGRACAO} />
          <div className="flex justify-center mt-8">
            <a
              href="/integracao"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-[14px] hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">integration_instructions</span>
              Ver documentação completa
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 sm:px-6 bg-[#0a0f1a] border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>pulse_alert</span>
            </div>
            <div>
              <p className="text-white font-bold text-[14px] leading-tight">UserPulse</p>
              <p className="text-slate-500 text-[11px]">Feedback Engine</p>
            </div>
          </div>
          <p className="text-[12px] text-slate-500">Campanhas in-product para sistemas SaaS</p>
          <a href="/integracao" className="text-[12px] text-slate-400 hover:text-white transition-colors">
            Documentação →
          </a>
        </div>
      </footer>

    </div>
  )
}
