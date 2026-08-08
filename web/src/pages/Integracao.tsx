import { useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'

const card = 'w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

function CodeBlock({ code, lang = 'javascript' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full max-w-4xl rounded-xl overflow-hidden border border-[#313244]">
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2 border-b border-[#313244]">
        <span className="text-[11px] text-[#6c7086] font-mono uppercase tracking-wider select-none">
          {lang}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[11px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied ? 'check_circle' : 'content_copy'}
          </span>
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

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-fixed text-primary text-label-md font-medium">
      {children}
    </span>
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

// ── Code snippets ──────────────────────────────────────────────────────────

const CODE_INSTALL_TEST = `<!-- Ambiente de testes -->
<script src="https://userpulse-866c.onrender.com/widget-loader.js" async></script>`

const CODE_INSTALL_PROD = `<!-- Produção -->
<script src="https://userpulse-prod.onrender.com/widget-loader.js" async></script>`

// publicKey vem do tenant logado (ver IntegracaoPage) — sempre um valor real,
// nunca um placeholder, pra reduzir o risco de alguém copiar o snippet e
// esquecer de trocar "up_pub_..." pela chave de verdade.
const codeInit = (publicKey: string) => `window.UserPulse.init({
  public_key: "${publicKey}",
  sistema: "NomeDoSistema",
  usuario_id: "123",
  usuario_nome: "Maria Silva",
  usuario_email: "maria@empresa.com",
  contexto: {
    cliente_id:    "456",
    cliente_nome:  "Clínica Exemplo",
    unidade_id:    "789",
    unidade_nome:  "Unidade Centro",
    perfil:        "ADMINISTRADOR",
    usuario_tipo:  "ADMINISTRADOR",
    estado:        "RN"
  }
});`

const CODE_UPDATE_CONTEXT = `window.UserPulse.updateContext({
  cliente_id:   "999",
  unidade_id:   "888",
  perfil:       "GESTOR",
  usuario_tipo: "GESTOR",
  estado:       "SP"
});`

const CODE_TRACK = `window.UserPulse.track("usou_nova_agenda");`

const codeFull = (publicKey: string) => `// 1. Na inicialização do sistema (ex: após login)
window.UserPulse.init({
  public_key:    "${publicKey}",
  sistema:       "MeuSistema",
  usuario_id:    usuario.id,
  usuario_nome:  usuario.nome,
  usuario_email: usuario.email,
  contexto: {
    cliente_id:   cliente.id,
    cliente_nome: cliente.nome,
    unidade_id:   unidade.id,
    unidade_nome: unidade.nome,
    perfil:       usuario.perfil,
    usuario_tipo: usuario.tipo,
    estado:       cliente.estado,
  }
});

// 2. Quando o usuário trocar de cliente ou unidade ativa
window.UserPulse.updateContext({
  cliente_id:   novoCliente.id,
  unidade_id:   novaUnidade.id,
  perfil:       usuario.perfil,
  usuario_tipo: usuario.tipo,
  estado:       novoCliente.estado,
});

// 3. Quando uma funcionalidade relevante for usada
window.UserPulse.track("usou_nova_agenda");`

// ── Segmentation fields ────────────────────────────────────────────────────

const SEG_FIELDS = [
  { campo: 'cliente_id',   descricao: 'ID do cliente/empresa ativa',            exemplo: '"456"' },
  { campo: 'unidade_id',   descricao: 'ID da unidade/filial ativa',             exemplo: '"789"' },
  { campo: 'perfil',       descricao: 'Perfil de acesso do usuário',            exemplo: '"ADMINISTRADOR"' },
  { campo: 'usuario_tipo', descricao: 'Tipo de conta do usuário',               exemplo: '"GESTOR"' },
  { campo: 'estado',       descricao: 'UF do cliente (sigla de 2 letras)',      exemplo: '"RN"' },
]

// ── Policies ───────────────────────────────────────────────────────────────

const POLICIES = [
  {
    icon: 'looks_one',
    label: 'Uma vez após visualização',
    desc: 'Campanha exibida uma única vez. Após o usuário visualizar, não aparece mais, independentemente de ter respondido.',
  },
  {
    icon: 'repeat',
    label: 'Até responder ou confirmar',
    desc: 'Campanha continua sendo exibida em cada acesso até o usuário responder o feedback ou confirmar a leitura.',
  },
  {
    icon: 'schedule',
    label: 'Reexibir após X dias',
    desc: 'Campanha reaparece automaticamente após o intervalo configurado, mesmo que o usuário já tenha interagido anteriormente.',
  },
  {
    icon: 'event_available',
    label: 'Encerrar após evento realizado',
    desc: 'Campanha nunca mais aparece após o usuário disparar um evento específico via UserPulse.track(). O bloqueio é permanente e retroativo — funciona mesmo em campanhas criadas depois do evento.',
  },
]

// ── Best practices ─────────────────────────────────────────────────────────

const BEST_PRACTICES = [
  {
    icon: 'label',
    text: 'Use nomes de evento estáveis e descritivos.',
    example: '"usou_nova_agenda", "concluiu_onboarding"',
  },
  {
    icon: 'warning',
    text: 'Não dispare track() globalmente para qualquer clique — use apenas para ações que representam uso real de funcionalidade.',
    example: null,
  },
  {
    icon: 'sync',
    text: 'Chame updateContext() sempre que o usuário trocar de cliente ou unidade ativa, para manter a segmentação correta.',
    example: null,
  },
  {
    icon: 'tag',
    text: 'Mantenha o campo sistema com um nome fixo e padronizado por produto.',
    example: '"QuarkClinic", "GestorPro"',
  },
  {
    icon: 'security',
    text: 'Não inclua dados sensíveis desnecessários no contexto — use apenas identificadores e classificações.',
    example: null,
  },
]

// ── Page ──────────────────────────────────────────────────────────────────

export function IntegracaoPage() {
  const { user } = useAuth()
  // Placeholder no formato real de public_key (UUID gerado pelo banco, ver
  // Tenant.public_key em schema.prisma) — só aparece se a sessão ainda não
  // carregou o tenant; na prática o valor real (user.tenant.public_key)
  // está quase sempre disponível aqui.
  const publicKey = user?.tenant.public_key || '00000000-0000-0000-0000-000000000000'

  return (
    <div className="relative">

      {/* ── Header ── */}
      <div className="px-4 lg:px-margin-desktop py-5">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Integração</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Guia de integração do UserPulse com sistemas externos
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[1400px] space-y-4">

        {/* A — Instalação */}
        <SectionCard
          icon="code"
          iconBg="bg-tertiary-fixed"
          iconColor="text-tertiary"
          title="Instalação do script"
          subtitle="Adicione uma tag <script> ao HTML do sistema integrado."
        >
          <p className="text-body-md text-on-surface-variant">Ambiente de testes:</p>
          <CodeBlock code={CODE_INSTALL_TEST} lang="html" />
          <p className="text-body-md text-on-surface-variant mt-2">Produção:</p>
          <CodeBlock code={CODE_INSTALL_PROD} lang="html" />
          <Tip>
            O script é carregado de forma assíncrona e não bloqueia a renderização da página.
          </Tip>
        </SectionCard>

        {/* B — Inicialização */}
        <SectionCard
          icon="login"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="Inicialização"
          subtitle="Chame UserPulse.init() logo após o login do usuário, passando os dados de identificação e contexto."
        >
          <CodeBlock code={codeInit(publicKey)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/50 space-y-1">
              <p className="text-label-md font-semibold text-on-surface">Campos obrigatórios</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <InfoChip>sistema</InfoChip>
                <InfoChip>usuario_id</InfoChip>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/50 space-y-1">
              <p className="text-label-md font-semibold text-on-surface">Campos opcionais</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <InfoChip>public_key</InfoChip>
                <InfoChip>usuario_nome</InfoChip>
                <InfoChip>usuario_email</InfoChip>
                <InfoChip>contexto</InfoChip>
              </div>
            </div>
          </div>
          <Tip>
            O campo <span className="font-mono">public_key</span> identifica sua conta — sem ele, o widget assume um tenant padrão temporário. Em breve será obrigatório para contas novas; use sempre o valor mostrado acima.
          </Tip>
          <Tip>
            O campo <span className="font-mono">sistema</span> deve ser um nome fixo que identifica o produto integrado — use sempre o mesmo valor em todas as chamadas.
          </Tip>
        </SectionCard>

        {/* C — updateContext */}
        <SectionCard
          icon="sync"
          iconBg="bg-secondary-fixed"
          iconColor="text-secondary"
          title="Atualização de contexto em SPA"
          subtitle="Em sistemas Single-Page Application, chame updateContext() sempre que o cliente ou unidade ativa mudar."
        >
          <p className="text-body-md text-on-surface-variant max-w-3xl">
            Sem isso, campanhas segmentadas por <span className="font-mono text-[12px]">cliente_id</span> ou <span className="font-mono text-[12px]">unidade_id</span> podem exibir conteúdo incorreto após a troca.
          </p>
          <CodeBlock code={CODE_UPDATE_CONTEXT} />
          <Tip>
            updateContext() aceita um subconjunto dos campos de contexto — apenas os campos informados serão atualizados.
          </Tip>
        </SectionCard>

        {/* D — track */}
        <SectionCard
          icon="bolt"
          iconBg="bg-[#fef3c7]"
          iconColor="text-[#b45309]"
          title="Eventos globais"
          subtitle="Registre ações relevantes do usuário para acionar campanhas baseadas em comportamento."
        >
          <CodeBlock code={CODE_TRACK} />
          <ul className="space-y-2 mt-1">
            {[
              'Dispara exibição de campanhas configuradas com gatilho "Após evento".',
              'Registra o evento no histórico global do usuário (tabela eventos_usuario).',
              'Usado na regra "Encerrar após evento realizado": quando disparado, bloqueia permanentemente campanhas vinculadas a esse evento — incluindo campanhas criadas depois do disparo.',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-body-md text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">check_circle</span>
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* E — Segmentação */}
        <SectionCard
          icon="filter_alt"
          iconBg="bg-primary-fixed"
          iconColor="text-primary"
          title="Segmentação"
          subtitle="Campanhas podem segmentar por qualquer combinação dos campos abaixo, definidos no contexto do usuário."
        >
          <div className="overflow-x-auto rounded-xl border border-outline-variant">
            <table className="w-full text-body-md">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="text-left px-4 py-2.5 text-label-md font-semibold text-on-surface-variant">Campo</th>
                  <th className="text-left px-4 py-2.5 text-label-md font-semibold text-on-surface-variant">Descrição</th>
                  <th className="text-left px-4 py-2.5 text-label-md font-semibold text-on-surface-variant hidden sm:table-cell">Exemplo</th>
                </tr>
              </thead>
              <tbody>
                {SEG_FIELDS.map((f, i) => (
                  <tr
                    key={f.campo}
                    className={`border-b border-outline-variant/40 last:border-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-lowest'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[12px] bg-primary-fixed text-primary px-2 py-0.5 rounded-md">
                        {f.campo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{f.descricao}</td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="font-mono text-[12px] text-outline">{f.exemplo}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Tip>
            Se uma campanha não tiver segmentação configurada para um campo, qualquer valor (inclusive vazio) será aceito.
          </Tip>
        </SectionCard>

        {/* F — Políticas de reexibição */}
        <SectionCard
          icon="policy"
          iconBg="bg-secondary-fixed"
          iconColor="text-secondary"
          title="Políticas de reexibição"
          subtitle="Cada campanha pode ter uma política diferente que define quando ela volta a aparecer."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {POLICIES.map(p => (
              <div
                key={p.label}
                className="flex gap-3 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/50"
              >
                <span className="material-symbols-outlined text-[22px] text-primary shrink-0 mt-0.5">{p.icon}</span>
                <div>
                  <p className="text-label-md font-semibold text-on-surface">{p.label}</p>
                  <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* G — Exemplo completo */}
        <SectionCard
          icon="integration_instructions"
          iconBg="bg-tertiary-fixed"
          iconColor="text-tertiary"
          title="Exemplo completo para SPA"
          subtitle="Padrão recomendado para sistemas Single-Page Application com troca de contexto."
        >
          <CodeBlock code={codeFull(publicKey)} />
        </SectionCard>

        {/* H — Boas práticas */}
        <SectionCard
          icon="tips_and_updates"
          iconBg="bg-[#fef3c7]"
          iconColor="text-[#b45309]"
          title="Boas práticas"
        >
          <ul className="space-y-3">
            {BEST_PRACTICES.map((bp, i) => (
              <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/50">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">{bp.icon}</span>
                <div>
                  <p className="text-body-md text-on-surface">{bp.text}</p>
                  {bp.example && (
                    <p className="font-mono text-[12px] text-outline mt-0.5">{bp.example}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

      </section>
    </div>
  )
}
