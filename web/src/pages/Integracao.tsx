import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const painel = 'rounded-[32px] border border-[#dee3e9] bg-white p-6 sm:p-8'
const pill = 'inline-flex items-center rounded-[100px] border border-[#ced0d4] bg-white px-4 py-2 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#1c1e21]'

function CodeBlock({ code, lang = 'javascript' }: { code: string; lang?: string }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copiar = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopiado(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-[#dee3e9] bg-[#0a1317]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-white/55">{lang}</span>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-2 rounded-[100px] border border-white/15 px-3 py-1.5 text-[12px] font-bold text-white transition-colors active:bg-white/10"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">{copiado ? 'check_circle' : 'content_copy'}</span>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-5">
        <code className="whitespace-pre font-mono text-[13px] leading-relaxed text-white">{code}</code>
      </pre>
    </div>
  )
}

function Secao({
  icon,
  titulo,
  subtitulo,
  children,
}: {
  icon: string
  titulo: string
  subtitulo?: string
  children: React.ReactNode
}) {
  return (
    <section className={painel}>
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
          <span className="material-symbols-outlined text-[22px] leading-none">
          {icon}
          </span>
        </span>
        <div>
          <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">{titulo}</h3>
          {subtitulo && <p className="mt-1 max-w-3xl text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">{subtitulo}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Campo({ nome, descricao, exemplo }: { nome: string; descricao: string; exemplo: string }) {
  return (
    <tr className="border-b border-[#dee3e9] last:border-0">
      <td className="px-4 py-4 align-top">
        <code className="rounded-[100px] bg-[#f1f4f7] px-3 py-1 text-[12px] font-bold text-[#0a1317]">{nome}</code>
      </td>
      <td className="px-4 py-4 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">{descricao}</td>
      <td className="hidden px-4 py-4 align-top sm:table-cell">
        <code className="text-[12px] text-[#5d6c7b]">{exemplo}</code>
      </td>
    </tr>
  )
}

const CODE_INSTALL_PROD = `<script src="https://userpulse-prod.onrender.com/widget-loader.js" async></script>`

const codeInit = (publicKey: string) => `window.UserPulse.init({
  public_key: "${publicKey}",
  sistema: "NomeDoSistema",
  usuario_id: "123",
  usuario_nome: "Maria Silva",
  usuario_email: "maria@empresa.com",
  contexto: {
    cliente_id: "456",
    cliente_nome: "Clínica Exemplo",
    unidade_id: "789",
    unidade_nome: "Unidade Centro",
    perfil: "ADMINISTRADOR",
    usuario_tipo: "ADMINISTRADOR",
    estado: "RN"
  }
});`

const CODE_UPDATE_CONTEXT = `window.UserPulse.updateContext({
  cliente_id: "999",
  unidade_id: "888",
  perfil: "GESTOR",
  usuario_tipo: "GESTOR",
  estado: "SP"
});`

const CODE_TRACK = `window.UserPulse.track("usou_nova_agenda");`

const codeFull = (publicKey: string) => `// 1. Após o login do usuário
window.UserPulse.init({
  public_key: "${publicKey}",
  sistema: "MeuSistema",
  usuario_id: usuario.id,
  usuario_nome: usuario.nome,
  usuario_email: usuario.email,
  contexto: {
    cliente_id: cliente.id,
    cliente_nome: cliente.nome,
    unidade_id: unidade.id,
    unidade_nome: unidade.nome,
    perfil: usuario.perfil,
    usuario_tipo: usuario.tipo,
    estado: cliente.estado,
  }
});

// 2. Quando o usuário trocar de cliente ou unidade ativa
window.UserPulse.updateContext({
  cliente_id: novoCliente.id,
  unidade_id: novaUnidade.id,
  perfil: usuario.perfil,
  usuario_tipo: usuario.tipo,
  estado: novoCliente.estado,
});

// 3. Quando uma funcionalidade relevante for usada
window.UserPulse.track("usou_nova_agenda");`

const CAMPOS = [
  { nome: 'cliente_id', descricao: 'ID do cliente ou empresa ativa.', exemplo: '"456"' },
  { nome: 'unidade_id', descricao: 'ID da unidade ou filial ativa.', exemplo: '"789"' },
  { nome: 'perfil', descricao: 'Perfil de acesso do usuário.', exemplo: '"ADMINISTRADOR"' },
  { nome: 'usuario_tipo', descricao: 'Tipo de conta do usuário.', exemplo: '"GESTOR"' },
  { nome: 'estado', descricao: 'UF do cliente, sempre com 2 letras.', exemplo: '"RN"' },
]

const POLITICAS = [
  { icon: 'looks_one', label: 'Uma vez após visualização', desc: 'Exibe uma única vez e depois não aparece mais para o mesmo usuário.' },
  { icon: 'repeat', label: 'Até responder ou confirmar', desc: 'Continua aparecendo até o usuário interagir com a campanha.' },
  { icon: 'schedule', label: 'Reexibir após X dias', desc: 'Volta automaticamente depois do intervalo configurado.' },
  { icon: 'event_available', label: 'Encerrar após evento realizado', desc: 'Bloqueia a campanha quando o usuário dispara um evento específico.' },
]

const BOAS_PRATICAS = [
  'Use nomes de evento estáveis e descritivos, como "usou_nova_agenda".',
  'Não dispare track() para qualquer clique; registre apenas ações com valor de produto.',
  'Chame updateContext() sempre que o cliente ou a unidade ativa mudar.',
  'Mantenha sistema com um nome fixo por produto integrado.',
  'Não inclua dados sensíveis desnecessários no contexto.',
]

export function IntegracaoPage() {
  const { user } = useAuth()
  const publicKey = user?.tenant.public_key || '00000000-0000-0000-0000-000000000000'
  const [chaveCopiada, setChaveCopiada] = useState(false)
  const timerChave = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copiarChavePublica = () => {
    navigator.clipboard.writeText(publicKey).catch(() => {})
    setChaveCopiada(true)
    if (timerChave.current) clearTimeout(timerChave.current)
    timerChave.current = setTimeout(() => setChaveCopiada(false), 2000)
  }

  return (
    <div className="min-h-full bg-white text-[#1c1e21]">
      <section className="px-4 py-6 lg:px-margin-desktop lg:py-8">
        <div className="relative overflow-hidden rounded-[40px] bg-[#f1f4f7] px-6 py-10 sm:px-10 lg:px-16 lg:py-14">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#0064e0]/15 blur-3xl" />
          <div className="max-w-3xl">
            <span className="mb-5 inline-flex rounded-[100px] bg-[#0064e0] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-white">
              Integração em produção
            </span>
            <h2 className="text-[36px] font-semibold leading-[1.28] text-[#0a1317] sm:text-[48px] sm:leading-[1.17]">
              Conecte o UserPulse ao seu produto com um único script.
            </h2>
            <p className="mt-5 max-w-2xl text-[18px] leading-[1.44] text-[#444950]">
              Instale o widget, identifique o usuário logado e envie contexto suficiente para campanhas, tours e jornadas aparecerem no momento certo.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 px-4 pb-8 lg:px-margin-desktop xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Secao icon="code" titulo="Instalação do script" subtitulo="Adicione esta tag ao HTML do sistema integrado." >
            <div id="instalacao" />
            <CodeBlock code={CODE_INSTALL_PROD} lang="html" />
            <p className="text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">
              O script carrega de forma assíncrona e não bloqueia a renderização da página.
            </p>
          </Secao>

          <Secao icon="login" titulo="Inicialização" subtitulo="Chame UserPulse.init() logo após o login do usuário." >
            <CodeBlock code={codeInit(publicKey)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative overflow-hidden rounded-[24px] border-2 border-[#0064e0] bg-[#f4f9ff] p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#0064e0]/15" />
                <p className="text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Campos essenciais</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-[100px] bg-[#0064e0] px-4 py-2 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white">public_key</span>
                  <span className="inline-flex items-center rounded-[100px] bg-[#0064e0] px-4 py-2 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white">sistema</span>
                  <span className="inline-flex items-center rounded-[100px] bg-[#0064e0] px-4 py-2 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white">usuario_id</span>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#dee3e9] bg-white p-5">
                <p className="text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Campos recomendados</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={pill}>usuario_nome</span>
                  <span className={pill}>usuario_email</span>
                  <span className={pill}>contexto</span>
                </div>
              </div>
            </div>
          </Secao>

          <Secao icon="sync" titulo="Atualização de contexto em SPA" subtitulo="Atualize o contexto sempre que o cliente, unidade ou perfil ativo mudar." >
            <CodeBlock code={CODE_UPDATE_CONTEXT} />
            <p className="text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">
              Sem isso, campanhas segmentadas podem aparecer com dados da seleção anterior.
            </p>
          </Secao>

          <Secao icon="bolt" titulo="Eventos globais" subtitulo="Registre ações relevantes para acionar campanhas baseadas em comportamento." >
            <CodeBlock code={CODE_TRACK} />
            <div className="grid gap-3 sm:grid-cols-3">
              {['Aciona campanhas com gatilho por evento.', 'Registra histórico global do usuário.', 'Permite encerrar campanhas após uma ação.'].map(item => (
                <div key={item} className="rounded-[16px] border border-[#dee3e9] p-5 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">
                  {item}
                </div>
              ))}
            </div>
          </Secao>

          <Secao icon="filter_alt" titulo="Segmentação" subtitulo="Use o contexto para controlar quem vê cada campanha, tour ou jornada." >
            <div className="overflow-hidden rounded-[16px] border border-[#dee3e9]">
              <table className="w-full">
                <thead className="bg-[#f1f4f7]">
                  <tr>
                    <th className="px-4 py-3 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-[#5d6c7b]">Campo</th>
                    <th className="px-4 py-3 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-[#5d6c7b]">Descrição</th>
                    <th className="hidden px-4 py-3 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-[#5d6c7b] sm:table-cell">Exemplo</th>
                  </tr>
                </thead>
                <tbody>{CAMPOS.map(campo => <Campo key={campo.nome} {...campo} />)}</tbody>
              </table>
            </div>
          </Secao>

          <Secao icon="policy" titulo="Políticas de reexibição" subtitulo="Defina quando uma comunicação volta a aparecer para o usuário." >
            <div className="grid gap-3 sm:grid-cols-2">
              {POLITICAS.map(politica => (
                <div key={politica.label} className="rounded-[16px] border border-[#dee3e9] p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
                    <span className="material-symbols-outlined text-[22px] leading-none">{politica.icon}</span>
                  </span>
                  <p className="mt-3 text-[18px] font-bold leading-[1.44] text-[#0a1317]">{politica.label}</p>
                  <p className="mt-1 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">{politica.desc}</p>
                </div>
              ))}
            </div>
          </Secao>

          <Secao icon="integration_instructions" titulo="Exemplo completo para SPA" subtitulo="Padrão recomendado para produtos com troca de contexto durante a sessão." >
            <div id="exemplo-completo" />
            <CodeBlock code={codeFull(publicKey)} />
          </Secao>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[32px] bg-[#0064e0] p-8 text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/60">Sua chave pública</p>
              <button
                type="button"
                onClick={copiarChavePublica}
                className="inline-flex shrink-0 items-center gap-2 rounded-[100px] border border-white/25 px-3 py-2 text-[12px] font-bold text-white active:bg-white/10"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">{chaveCopiada ? 'check_circle' : 'content_copy'}</span>
                {chaveCopiada ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <code className="mt-4 block break-all rounded-[16px] bg-white/15 p-4 text-[13px] leading-relaxed text-white">{publicKey}</code>
            <p className="mt-4 text-[14px] leading-[1.43] tracking-[-0.14px] text-white/70">
              Esta chave identifica sua conta na integração. Ela não é segredo, mas deve ser copiada sem alteração.
            </p>
          </div>

          <div className={painel}>
            <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">Boas práticas</h3>
            <ul className="mt-5 space-y-4">
              {BOAS_PRATICAS.map(item => (
                <li key={item} className="flex gap-3 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#31a24c]">
                    <span className="material-symbols-outlined text-[16px] leading-none">check_circle</span>
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  )
}
