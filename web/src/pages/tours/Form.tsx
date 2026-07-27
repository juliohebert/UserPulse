import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourGuiado, RegraSegmentacaoTour, CampoSegmentacaoTour, OperadorSegmentacaoTour } from '../../types'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { CardHeader } from '../../components/ui/CardHeader'
import { TOUR_TEMPLATES, type TourTemplate } from '../../data/tourTemplates'
import { buildGravadorUrl, comandoTestarSeletor } from '../../utils/tour'

interface PassoState {
  id?: string
  titulo: string
  descricao: string
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
  acao_ao_avancar: string
  modo_avanco_interacao: string
  seletor_confirmacao: string
  // Agrupamento visual opcional do gravador de fluxo (widget.js) — o admin
  // não edita isso diretamente, só preserva o valor ao colar/salvar/reabrir.
  secao: string
}

interface FormState {
  titulo: string
  descricao: string
  sistema: string
  modo_identificacao: string
  tela: string
  data_cy: string
  url_contem: string
  prioridade: string
  ativo: boolean
}

// Um tour novo começa como rascunho (inativo) — precisa ser testado antes de
// ser ativado para os usuários. Ver aviso no topo do formulário de criação.
const EMPTY: FormState = {
  titulo: '', descricao: '', sistema: '', modo_identificacao: 'sistema_tela',
  tela: '', data_cy: '', url_contem: '', prioridade: '0', ativo: false,
}

const PASSO_VAZIO: PassoState = {
  titulo: '', descricao: '', seletor_tipo: 'data_cy', seletor: '', tooltip_posicao: 'auto', acao_ao_avancar: 'apenas_avancar',
  modo_avanco_interacao: 'manual', seletor_confirmacao: '', secao: '',
}

const MODOS = [
  { value: 'sistema_tela', label: 'Tela informada pelo sistema', desc: 'Use quando o sistema hospedeiro envia o nome da tela.' },
  { value: 'data_cy', label: 'Elemento da tela', desc: 'Use quando a tela possui um data-cy estável.' },
  { value: 'url_contem', label: 'Caminho da URL', desc: 'Use quando a página possui uma rota ou caminho conhecido.' },
]

const TOOLTIP_POSICOES = [
  { value: 'auto', label: 'Automática' },
  { value: 'top', label: 'Acima' },
  { value: 'bottom', label: 'Abaixo' },
  { value: 'left', label: 'Esquerda' },
  { value: 'right', label: 'Direita' },
]

const SELETOR_TIPOS = [
  { value: 'data_cy', label: 'data-cy — elemento único' },
  { value: 'id', label: 'ID — elemento único' },
  { value: 'css', label: 'CSS — elemento único' },
  { value: 'area', label: 'Área — grupo de elementos' },
]

// Legenda curta abaixo do Select de tipo, reforçando a diferença entre
// destacar UM elemento (a maioria dos passos) e destacar um GRUPO/container
// inteiro (passo "Área") — complementa, não substitui, o texto de ajuda por
// tipo já exibido junto ao campo Seletor logo abaixo.
function legendaTipoSeletor(tipo: string): string {
  return tipo === 'area'
    ? 'Modo Área: o tour destaca um GRUPO de elementos dentro de um container — use quando o passo é sobre vários campos juntos, não um só.'
    : 'Modo Elemento único: o tour destaca um único elemento na tela.'
}

// Corrige o erro mais comum ao colar um seletor: colar o seletor de atributo
// completo (ex.: copiado do DevTools) num campo que já espera só o valor cru.
// Nunca mexe em tipo=css (lá o seletor completo é o esperado).
function normalizarSeletorInput(tipo: string, valor: string): string {
  const bruto = valor.trim()
  if (tipo === 'data_cy') {
    const m = /^\[data-cy=(["'])(.*)\1\]$/.exec(bruto)
    if (m) return m[2]
  }
  if (tipo === 'id' && bruto.startsWith('#')) {
    return bruto.slice(1)
  }
  return valor
}

const ACOES_AO_AVANCAR = [
  { value: 'apenas_avancar', label: 'Apenas avançar' },
  { value: 'clicar_elemento', label: 'Clicar no elemento destacado e avançar' },
]

const MODOS_AVANCO_INTERACAO = [
  { value: 'manual', label: 'Avançar pelo botão Próximo' },
  { value: 'ao_clicar', label: 'Avançar ao clicar no elemento destacado' },
  { value: 'ao_alterar_valor', label: 'Avançar ao preencher/alterar o valor' },
  { value: 'ao_aparecer_elemento', label: 'Avançar quando outro elemento aparecer' },
  { value: 'ao_sumir_elemento', label: 'Avançar quando outro elemento sumir' },
]

const MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento']

// ─── Segmentação por contexto (MVP) ────────────────────────────────────────
// Lista fixa validada também no backend (ver CAMPOS_SEGMENTACAO em
// server/src/controllers/tours.ts) — os valores vêm do contexto que o widget
// já recebe via init()/updateContext() ou de campos próprios da chamada
// (usuario_id, usuario_email, sistema, tela).
const CAMPOS_SEGMENTACAO: { value: CampoSegmentacaoTour; label: string }[] = [
  { value: 'cliente_id', label: 'Cliente ID' },
  { value: 'unidade_id', label: 'Unidade ID' },
  { value: 'organizacao_id', label: 'Organização ID' },
  { value: 'clinica_id', label: 'Clínica ID' },
  { value: 'usuario_tipo', label: 'Tipo de usuário' },
  { value: 'perfil', label: 'Perfil' },
  { value: 'estado', label: 'Estado' },
  { value: 'usuario_id', label: 'Usuário ID' },
  { value: 'usuario_email', label: 'E-mail do usuário' },
  { value: 'tela', label: 'Tela' },
  { value: 'sistema', label: 'Sistema' },
]

const OPERADORES_SEGMENTACAO: { value: OperadorSegmentacaoTour; label: string; placeholder: string }[] = [
  { value: 'igual', label: 'é igual a', placeholder: 'Valor exato' },
  { value: 'diferente', label: 'é diferente de', placeholder: 'Valor exato' },
  { value: 'contem', label: 'contém', placeholder: 'Trecho do valor' },
  { value: 'em_lista', label: 'está em lista', placeholder: 'valor1, valor2, valor3' },
]

const REGRA_SEGMENTACAO_VAZIA: RegraSegmentacaoTour = { campo: '', operador: 'igual', valor: '' }

// ─── Colar passos do Gravador de Fluxo ─────────────────────────────────────
// Lê o mesmo JSON "userpulse.tour.v1" que o widget.js gera ao finalizar uma
// gravação (botão "Copiar JSON"/"Copiar e abrir importação") e extrai só os
// passos — nunca troca titulo/descricao/destino já preenchidos aqui no
// formulário. Mesma tolerância de formato do ImportarTourModal (aceita tanto
// o envelope { tour: {...} } quanto o objeto do tour direto).
function extrairPassosDoJson(texto: string): { passos: PassoState[] } | { erro: string } {
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    return { erro: 'JSON malformado. Confira se colou o conteúdo completo.' }
  }
  if (!json || typeof json !== 'object') return { erro: 'JSON inválido.' }
  const obj = json as Record<string, unknown>
  const tourObj = (obj.tour && typeof obj.tour === 'object') ? (obj.tour as Record<string, unknown>) : obj
  const passosBrutos = tourObj.passos
  if (!Array.isArray(passosBrutos) || passosBrutos.length === 0) {
    return { erro: 'O JSON precisa ter ao menos um passo em "passos".' }
  }
  const passos: PassoState[] = passosBrutos.map((p): PassoState => {
    const passo = (p && typeof p === 'object') ? (p as Record<string, unknown>) : {}
    return {
      titulo: typeof passo.titulo === 'string' ? passo.titulo : '',
      descricao: typeof passo.descricao === 'string' ? passo.descricao : '',
      seletor_tipo: (passo.seletor_tipo === 'css' || passo.seletor_tipo === 'id' || passo.seletor_tipo === 'area') ? passo.seletor_tipo : 'data_cy',
      seletor: typeof passo.seletor === 'string' ? passo.seletor : '',
      tooltip_posicao: typeof passo.tooltip_posicao === 'string' ? passo.tooltip_posicao : 'auto',
      acao_ao_avancar: typeof passo.acao_ao_avancar === 'string' ? passo.acao_ao_avancar : 'apenas_avancar',
      modo_avanco_interacao: typeof passo.modo_avanco_interacao === 'string' ? passo.modo_avanco_interacao : 'manual',
      seletor_confirmacao: typeof passo.seletor_confirmacao === 'string' ? passo.seletor_confirmacao : '',
      secao: typeof passo.secao === 'string' ? passo.secao : '',
    }
  })
  if (passos.some(p => !p.titulo.trim())) {
    return { erro: 'Existe passo sem título no JSON colado — revise na aba do gravador antes de colar aqui.' }
  }
  return { passos }
}

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

// ─── Checklist de qualidade ─────────────────────────────────────────────────
// Só orienta — não bloqueia nada além das validações que já existem em
// handleSubmit (título de passo sempre obrigatório; seletor só obrigatório
// para ativar). "critico" aqui sinaliza o que de fato impede salvar/ativar;
// "aviso" é recomendação; "neutro" é só informativo.

type ChecklistStatus = 'ok' | 'aviso' | 'critico' | 'neutro'

interface ChecklistItem {
  label: string
  status: ChecklistStatus
  detalhe?: string
}

function destinoConfigurado(form: FormState): boolean {
  if (!form.sistema.trim()) return false
  if (form.modo_identificacao === 'data_cy') return Boolean(form.data_cy.trim())
  if (form.modo_identificacao === 'url_contem') return Boolean(form.url_contem.trim())
  return Boolean(form.tela.trim())
}

function montarChecklist(form: FormState, passos: PassoState[]): ChecklistItem[] {
  const total = passos.length
  const semTitulo = passos.filter(p => !p.titulo.trim()).length
  const comSeletor = passos.filter(p => p.seletor.trim()).length
  const semSeletor = total - comSeletor
  const algumIncompleto = passos.some(p => !p.titulo.trim() || !p.seletor.trim())
  const algumComCss = passos.some(p => p.seletor_tipo === 'css')

  const items: ChecklistItem[] = [
    { label: 'Título preenchido', status: form.titulo.trim() ? 'ok' : 'aviso' },
    {
      label: 'Descrição preenchida',
      status: form.descricao.trim() ? 'ok' : 'aviso',
      detalhe: form.descricao.trim()
        ? undefined
        : 'Tour sem descrição — ela aparece na introdução do tour pra explicar o que será apresentado; sem ela, mostramos uma mensagem genérica.',
    },
    {
      label: 'Destino configurado',
      status: destinoConfigurado(form) ? 'ok' : 'aviso',
      detalhe: destinoConfigurado(form) ? undefined : 'Informe o sistema e a tela, data-cy ou URL, conforme o modo escolhido.',
    },
    {
      label: `${total} passo${total === 1 ? '' : 's'} cadastrado${total === 1 ? '' : 's'}`,
      status: total > 0 ? 'ok' : 'critico',
      detalhe: total > 0 ? undefined : 'Adicione pelo menos um passo para o tour funcionar.',
    },
    {
      label: semTitulo === 0 ? 'Todos os passos têm título' : `${semTitulo} passo${semTitulo === 1 ? '' : 's'} sem título`,
      status: semTitulo === 0 ? 'ok' : 'critico',
      detalhe: semTitulo === 0 ? undefined : 'Título do passo é obrigatório para salvar o tour.',
    },
    {
      label: `${comSeletor} de ${total} passo${total === 1 ? '' : 's'} com seletor definido`,
      status: total === 0 ? 'neutro' : semSeletor === 0 ? 'ok' : 'aviso',
    },
    {
      label: semSeletor === 0 ? 'Nenhum passo sem seletor' : `${semSeletor} passo${semSeletor === 1 ? '' : 's'} sem seletor`,
      status: semSeletor === 0 ? 'ok' : (form.ativo ? 'critico' : 'aviso'),
      detalhe: semSeletor > 0 ? 'Necessário para o widget localizar o elemento na tela do usuário.' : undefined,
    },
    {
      label: `Status: ${form.ativo ? 'Ativo' : 'Inativo (rascunho)'}`,
      status: form.ativo ? 'ok' : 'neutro',
    },
  ]

  if (form.ativo && algumIncompleto) {
    items.push({
      label: 'Tour ativo com passo incompleto',
      status: 'critico',
      detalhe: 'Existe passo sem título ou sem seletor — complete os passos pendentes ou desative o tour antes de publicar.',
    })
  } else if (!form.ativo) {
    items.push({ label: 'Tour em rascunho — não visível para usuários', status: 'neutro' })
  } else {
    items.push({ label: 'Tour ativo e pronto para publicação', status: 'ok' })
  }

  if (algumComCss) {
    items.push({
      label: 'Seletor CSS em uso',
      status: 'aviso',
      detalhe: 'Prefira data-cy quando possível — seletores CSS quebram com mais facilidade quando o layout muda.',
    })
  }

  return items
}

const CHECKLIST_STATUS: Record<ChecklistStatus, { icon: string; className: string }> = {
  ok: { icon: 'check_circle', className: 'text-tertiary' },
  aviso: { icon: 'warning', className: 'text-[#e65100]' },
  critico: { icon: 'error', className: 'text-error' },
  neutro: { icon: 'info', className: 'text-outline' },
}

function ChecklistCard({ form, passos, numero }: { form: FormState; passos: PassoState[]; numero?: number }) {
  const items = montarChecklist(form, passos)
  const temCritico = items.some(i => i.status === 'critico')
  const temAviso = items.some(i => i.status === 'aviso')

  const resumo = temCritico
    ? { texto: 'Pendências críticas', className: 'bg-error-container text-on-error-container' }
    : temAviso
    ? { texto: 'Pequenos ajustes recomendados', className: 'bg-[#fff8e1] text-[#e65100]' }
    : { texto: 'Tudo certo', className: 'bg-tertiary/10 text-tertiary' }

  return (
    <div className={card}>
      <CardHeader
        number={numero}
        icon="fact_check"
        iconBg="bg-primary-fixed"
        iconColor="text-primary"
        title="Resumo do tour"
        description="Orienta antes de testar ou ativar — não bloqueia o salvamento."
        action={
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase whitespace-nowrap ${resumo.className}`}>
            {resumo.texto}
          </span>
        }
      />
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => {
          const cfg = CHECKLIST_STATUS[item.status]
          return (
            <li key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-container-low border border-outline-variant/50">
              <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${cfg.className}`}>{cfg.icon}</span>
              <div>
                <p className="text-body-md text-on-surface leading-snug">{item.label}</p>
                {item.detalhe && <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">{item.detalhe}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Alertas de configuração por passo ─────────────────────────────────────
// Heurística por nome do seletor (o admin não tem acesso ao DOM real da tela
// integrada — só ao texto do seletor cadastrado). Só orienta, nunca bloqueia
// o salvamento; a única validação que bloqueia continua sendo a de seletor
// vazio em tour ativo (handleSubmit), que essas heurísticas não substituem.
const REGEX_CAMPO_PREENCHIVEL = /input|select|autocomplete|combobox|busca|search|campo|filtro|dropdown|typeahead/i
const REGEX_BOTAO_OU_ACAO = /bot[aã]o|button|\bbtn\b|a[cç][aã]o|link|clique|click|salvar|confirmar|enviar|cancelar|fechar|remover|excluir/i
// Classes geradas por framework (Angular, ng-zorro/Ant Design, CSS-in-JS) ou
// dependência de posição entre elementos — mesmo critério usado pelo gravador
// (RECORDER_CLASSES_FRAGEIS em widget.js) pra nunca preferir esse tipo de
// seletor quando há alternativa melhor.
const REGEX_SELETOR_FRAGIL = /\bng-|ant-|css-\w{4,}|\bsc-\w{4,}|nth-child|nth-of-type/i

function alertasPasso(passo: PassoState): string[] {
  const alertas: string[] = []
  const seletor = passo.seletor.trim()

  if (passo.modo_avanco_interacao === 'ao_clicar' && seletor && REGEX_CAMPO_PREENCHIVEL.test(seletor)) {
    alertas.push(
      "Este modo pode avançar no primeiro clique. Para campos de busca, selects ou autocompletes, prefira 'Ao alterar valor' ou 'Ao sumir elemento'."
    )
  }

  if (passo.modo_avanco_interacao === 'ao_alterar_valor' && seletor && REGEX_BOTAO_OU_ACAO.test(seletor)) {
    alertas.push("Este modo é indicado para campos preenchíveis. Para botões, prefira 'Ao clicar'.")
  }

  if (MODOS_AVANCO_COM_CONFIRMACAO.includes(passo.modo_avanco_interacao) && !passo.seletor_confirmacao.trim()) {
    alertas.push('Informe o seletor de confirmação para este modo funcionar corretamente.')
  }

  if (passo.acao_ao_avancar === 'clicar_elemento' && passo.modo_avanco_interacao === 'ao_clicar') {
    alertas.push(
      'Este passo possui clique automático no botão Próximo e avanço automático por clique. Confirme se os dois comportamentos são necessários.'
    )
  }

  if (passo.seletor_tipo === 'css' && seletor && REGEX_SELETOR_FRAGIL.test(seletor)) {
    alertas.push(
      'Este seletor parece depender de classes geradas por framework (ng-*, ant-*, css-in-js) ou de posição entre elementos (nth-child) — tende a quebrar com pequenas mudanças de layout. Prefira data-cy, ID ou name se possível.'
    )
  } else if (passo.seletor_tipo === 'css' && seletor && !seletor.includes('data-cy')) {
    alertas.push('Seletores CSS podem ser frágeis. Sempre que possível, prefira data-cy.')
  }

  if (passo.seletor_tipo === 'area' && seletor && REGEX_SELETOR_FRAGIL.test(seletor)) {
    alertas.push(
      'Este seletor de área parece depender de classes geradas por framework ou de posição entre elementos — mesmo risco de um seletor CSS frágil. Prefira um container com data-cy ou id próprio.'
    )
  }

  if (passo.seletor_tipo === 'area' && passo.acao_ao_avancar === 'clicar_elemento') {
    alertas.push(
      "Este passo destaca uma Área (grupo), mas está configurado para clicar automaticamente no elemento ao avançar. Clicar num container geralmente não faz nada — considere usar 'Apenas avançar'."
    )
  }

  if (passo.seletor_tipo === 'area' && passo.modo_avanco_interacao === 'ao_alterar_valor') {
    alertas.push(
      "Este modo espera que o próprio elemento destacado tenha um valor preenchível. Para uma Área (grupo), o avanço dispara quando QUALQUER campo dentro do container for alterado — confirme se é isso que você quer."
    )
  }

  return alertas
}

function AlertasConfiguracaoPasso({ passo }: { passo: PassoState }) {
  const alertas = alertasPasso(passo)
  if (alertas.length === 0) return null

  return (
    <div className="md:col-span-2 mt-1">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#e65100] mb-1.5">
        <span className="material-symbols-outlined text-[14px]">warning</span>
        Alertas de configuração
      </p>
      <ul className="space-y-1.5">
        {alertas.map((texto, idx) => (
          <li
            key={idx}
            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#e65100] bg-[#fff8e1] border border-[#ffe082] rounded-lg px-2.5 py-1.5"
          >
            <span className="material-symbols-outlined text-[13px] shrink-0 mt-0.5">info</span>
            <span>{texto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Preview do passo ───────────────────────────────────────────────────────
// Ilustração estática do tooltip do widget, só para ajudar a visualizar o
// cadastro — não executa o widget real nem valida nada no DOM (o elemento de
// verdade só existe na aplicação integrada). Posição do "elemento" mockado
// segue a mesma relação usada pelo widget: o tooltip fica do lado oposto à
// posição escolhida (ex.: "Acima" → tooltip acima do elemento).
function PassoPreview({ passo, indice, total }: { passo: PassoState; indice: number; total: number }) {
  const [aberto, setAberto] = useState(false)
  const semTitulo = !passo.titulo.trim()
  const semDescricao = !passo.descricao.trim()
  const titulo = passo.titulo.trim() || 'Título do passo'
  const descricao = passo.descricao.trim() || 'Descrição do passo (opcional)'
  const ultimo = indice === total - 1

  // Modo "Área" destaca um GRUPO de campos, não um elemento único — o mock
  // fica mais largo e mostra alguns "campos" internos (ex.: clínica, convênio,
  // especialidade) pra deixar claro que o spotlight cobre o container inteiro,
  // não um item isolado.
  const ehArea = passo.seletor_tipo === 'area'
  const elemento = ehArea ? (
    <div
      key="elemento"
      className="w-56 h-14 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-1 shrink-0 px-2"
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-primary/50">área / grupo</span>
      <div className="flex items-center gap-1 w-full">
        <span className="h-3 flex-1 rounded bg-primary/15 border border-primary/30" />
        <span className="h-3 flex-1 rounded bg-primary/15 border border-primary/30" />
        <span className="h-3 flex-1 rounded bg-primary/15 border border-primary/30" />
      </div>
      {passo.seletor.trim() && (
        <span className="text-[8px] font-mono text-primary/60 truncate max-w-full" title={passo.seletor}>
          {passo.seletor}
        </span>
      )}
    </div>
  ) : (
    <div
      key="elemento"
      className="w-20 h-12 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center shrink-0"
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-primary/50">elemento</span>
    </div>
  )

  const tooltip = (
    <div key="tooltip" className="w-full max-w-[260px] bg-surface-bright border border-outline-variant rounded-xl shadow-md p-3.5 shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
        Passo {indice + 1} de {total}
      </p>
      <p className={`text-[13px] font-bold leading-snug mb-1 ${semTitulo ? 'text-outline italic' : 'text-on-surface'}`}>
        {titulo}
      </p>
      <p className={`text-[12px] leading-snug mb-3 ${semDescricao ? 'text-outline italic' : 'text-on-surface-variant'}`}>
        {descricao}
      </p>
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: total }, (_, d) => (
          <span key={d} className={`h-1.5 rounded-full ${d === indice ? 'w-3.5 bg-primary' : 'w-1.5 bg-outline-variant'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-outline">Pular</span>
        <div className="flex gap-1.5">
          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${indice === 0 ? 'bg-outline-variant/20 text-outline/50' : 'bg-primary-fixed text-primary'}`}>
            Voltar
          </span>
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary text-on-primary">
            {ultimo ? 'Concluir' : 'Próximo'}
          </span>
        </div>
      </div>
      {!ultimo && passo.acao_ao_avancar === 'clicar_elemento' && (
        <p className="text-[10px] text-primary font-semibold mt-2 flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">ads_click</span>
          "Próximo" também clica no elemento destacado antes de avançar
        </p>
      )}
    </div>
  )

  // "auto"/"bottom" → tooltip abaixo do elemento; "top" → acima; "left"/"right"
  // → tooltip do lado oposto ao escolhido, na horizontal.
  const horizontal = passo.tooltip_posicao === 'left' || passo.tooltip_posicao === 'right'
  const ordem =
    passo.tooltip_posicao === 'top' ? [tooltip, elemento] :
    passo.tooltip_posicao === 'left' ? [tooltip, elemento] :
    passo.tooltip_posicao === 'right' ? [elemento, tooltip] :
    [elemento, tooltip] // bottom | auto

  return (
    <div className="md:col-span-2 mt-1 pt-3 border-t border-outline-variant/40">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex flex-wrap items-center gap-1.5 text-label-sm font-semibold text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">visibility</span>
        Preview do passo
        <span className="text-[11px] font-bold text-primary">{aberto ? 'Ocultar preview' : 'Ver preview'}</span>
        <span className={`material-symbols-outlined text-[16px] transition-transform ${aberto ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {aberto && (
        <div className="mt-2">
          <p className="text-[10px] text-outline mb-2">Apenas ilustrativo — não executa o widget nem valida o DOM real.</p>
          <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low/50 p-4 overflow-x-auto">
            <div className={`flex ${horizontal ? 'flex-row items-center' : 'flex-col items-start'} gap-3 w-max max-w-full`}>
              {ordem}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TourForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [passos, setPassos] = useState<PassoState[]>([{ ...PASSO_VAZIO }])
  // [] = sem segmentação (todos os contextos elegíveis) — o "modo" (Todos vs
  // Apenas quando...) é derivado disso, não um campo separado (ver
  // segmentado abaixo, mesmo padrão de isSegmented em campanhas/Form.tsx).
  const [regrasSegmentacao, setRegrasSegmentacao] = useState<RegraSegmentacaoTour[]>([])
  const [loadingTour, setLoadingTour] = useState(isEdit)
  // Separado de `error` (usado só para validação/erro de salvar) de
  // propósito — sem essa separação, uma falha no GET /tours/:id ainda
  // renderizava o formulário normalmente, caindo no PASSO_VAZIO default (só
  // 1 passo em branco) e parecendo "os passos não carregaram" mesmo que o
  // tour real tivesse vários — e "Salvar" nesse estado substituiria os
  // passos existentes pelo que estivesse preenchido ali. Ver render mais
  // abaixo: com loadError, o formulário nem chega a aparecer.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [templateAplicadoId, setTemplateAplicadoId] = useState<string | null>(null)
  const [copiadoPasso, setCopiadoPasso] = useState<{ index: number; tipo: 'seletor' | 'comando' } | null>(null)

  // ─── Editar fluxo no sistema (gravador, só na edição) ──────────────────
  const [urlInicialGravador, setUrlInicialGravador] = useState('')
  const [erroGravador, setErroGravador] = useState<string | null>(null)
  const [urlGravadorGerada, setUrlGravadorGerada] = useState<string | null>(null)
  const [jsonColadoTexto, setJsonColadoTexto] = useState('')
  const [erroColar, setErroColar] = useState<string | null>(null)
  const [avisoColar, setAvisoColar] = useState<string | null>(null)
  const [substituidoOk, setSubstituidoOk] = useState(false)
  // null = ainda não tentou abrir o gravador nesta visita à página.
  const [passosIncluidosGravador, setPassosIncluidosGravador] = useState<boolean | null>(null)

  // Feedback de "salvo com sucesso" sobrevive ao redirecionamento pós-criação
  // (de /tours/novo para /tours/:id/editar) via router state, em vez de um
  // timer artificial. Consome e limpa o state para não reaparecer em
  // navegações futuras (voltar, atualizar a página).
  useEffect(() => {
    if (isEdit && (location.state as { justSaved?: boolean } | null)?.justSaved) {
      setSuccess(true)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, location.state])

  // Extraída (não só um corpo de useEffect) pra poder ser chamada de novo
  // pelo botão "Tentar novamente" do ErrorState, sem duplicar a lógica.
  const carregarTour = useCallback((tourId: string, sinal: { cancelado: boolean }) => {
    setLoadingTour(true)
    setLoadError(null)
    get<TourGuiado>(`/tours/${tourId}`)
      .then(t => {
        // Guarda contra resposta desatualizada: se o id mudou (ex.: usuário
        // navegou de uma edição pra outra sem a página recarregar — mesmo
        // componente reaproveitado pelo React Router) ou o componente já
        // desmontou antes desta resposta chegar, uma requisição antiga nunca
        // deve sobrescrever o formulário com dados de outro tour, nem apagar
        // visualmente os passos já preenchidos por uma resposta mais nova
        // que chegou primeiro.
        if (sinal.cancelado) return
        setForm({
          titulo: t.titulo,
          descricao: t.descricao ?? '',
          sistema: t.sistema,
          modo_identificacao: t.modo_identificacao,
          tela: t.tela ?? '',
          data_cy: t.data_cy ?? '',
          url_contem: t.url_contem ?? '',
          prioridade: String(t.prioridade ?? 0),
          ativo: t.ativo,
        })
        // Preserva a ordem já retornada pela API (buscarPorId ordena por
        // `ordem` — ver include em tours.ts) e o id de cada passo existente
        // (usado só pra exibir/copiar; o PUT sempre substitui a lista
        // inteira, não casa por id — ver handleSubmit).
        setPassos(
          (t.passos ?? []).length > 0
            ? t.passos!.map(p => ({
                id: p.id,
                titulo: p.titulo,
                descricao: p.descricao ?? '',
                seletor_tipo: p.seletor_tipo,
                seletor: p.seletor,
                tooltip_posicao: p.tooltip_posicao,
                acao_ao_avancar: p.acao_ao_avancar || 'apenas_avancar',
                modo_avanco_interacao: p.modo_avanco_interacao || 'manual',
                seletor_confirmacao: p.seletor_confirmacao ?? '',
                secao: p.secao ?? '',
              }))
            : [{ ...PASSO_VAZIO }]
        )
        setRegrasSegmentacao(t.segmentacao_regras ?? [])
      })
      .catch(e => {
        if (sinal.cancelado) return
        // Mensagem real do erro (ver services/api.ts) em vez de um texto fixo
        // de "não encontrado" — um erro de rede/servidor não é a mesma coisa
        // que o tour genuinamente não existir.
        setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar o tour guiado.')
      })
      .finally(() => {
        if (!sinal.cancelado) setLoadingTour(false)
      })
  }, [])

  useEffect(() => {
    if (!id) return
    const sinal = { cancelado: false }
    carregarTour(id, sinal)
    return () => { sinal.cancelado = true }
  }, [id, carregarTour])

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ─── Segmentação por contexto ──────────────────────────────────────────
  const segmentado = regrasSegmentacao.length > 0

  const ativarSegmentacao = () => setRegrasSegmentacao([{ ...REGRA_SEGMENTACAO_VAZIA }])
  const desativarSegmentacao = () => setRegrasSegmentacao([])

  const adicionarRegraSegmentacao = () =>
    setRegrasSegmentacao(prev => [...prev, { ...REGRA_SEGMENTACAO_VAZIA }])

  const atualizarRegraSegmentacao = (index: number, patch: Partial<RegraSegmentacaoTour>) =>
    setRegrasSegmentacao(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const removerRegraSegmentacao = (index: number) =>
    setRegrasSegmentacao(prev => {
      const proxima = prev.filter((_, i) => i !== index)
      // Sem regra nenhuma sobrando, volta pro modo "Todos os usuários" em vez
      // de deixar o modo "restrito" selecionado com uma lista vazia (que já
      // vale como "sem segmentação" pro backend, mas confundiria a UI).
      return proxima
    })

  // Só disponível na criação (isEdit é sempre false aqui, ver render abaixo).
  // Preenche apenas título, descrição e passos base — sistema, modo de
  // identificação etc. não são tocados, e seletor/tipo de seletor ficam em
  // branco (dependem da tela real do sistema hospedeiro). Tudo continua
  // editável normalmente depois de aplicado. ativo é forçado para false: como
  // os seletores vêm vazios, o tour não pode ser ativado até serem
  // preenchidos (ver validação em handleSubmit).
  const aplicarTemplate = (tpl: TourTemplate) => {
    setForm(prev => ({ ...prev, titulo: tpl.titulo_sugerido, descricao: tpl.descricao_sugerida, ativo: false }))
    setPassos(tpl.passos.map(p => ({
      titulo: p.titulo,
      descricao: p.descricao,
      seletor_tipo: 'data_cy',
      seletor: '',
      tooltip_posicao: p.tooltip_posicao,
      acao_ao_avancar: 'apenas_avancar',
      modo_avanco_interacao: 'manual',
      seletor_confirmacao: '',
      secao: '',
    })))
    setTemplateAplicadoId(tpl.id)
  }

  const limparTemplate = () => {
    setForm(prev => ({ ...prev, titulo: '', descricao: '' }))
    setPassos([{ ...PASSO_VAZIO }])
    setTemplateAplicadoId(null)
  }

  const setPasso = (index: number, key: keyof PassoState, value: string) =>
    setPassos(prev => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)))

  const addPasso = () => setPassos(prev => [...prev, { ...PASSO_VAZIO }])

  // Cópia sem o id do original — é um passo novo, ainda não salvo. A ordem é
  // recalculada automaticamente no submit (payload envia os passos na ordem do
  // array, e o backend atribui `ordem` pela posição recebida).
  const duplicarPasso = (index: number) =>
    setPassos(prev => {
      const original = prev[index]
      const copia: PassoState = {
        titulo: original.titulo,
        descricao: original.descricao,
        seletor_tipo: original.seletor_tipo,
        seletor: original.seletor,
        tooltip_posicao: original.tooltip_posicao,
        acao_ao_avancar: original.acao_ao_avancar,
        modo_avanco_interacao: original.modo_avanco_interacao,
        seletor_confirmacao: original.seletor_confirmacao,
        secao: original.secao,
      }
      const next = [...prev]
      next.splice(index + 1, 0, copia)
      return next
    })

  const removePasso = (index: number) =>
    setPassos(prev => prev.filter((_, i) => i !== index))

  const movePasso = (index: number, dir: -1 | 1) => {
    setPassos(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // Abre o gravador de fluxo (mesma URL/mecanismo de TourGravador.tsx) numa
  // nova aba, levando titulo/descricao/sistema/prioridade + os passos atuais
  // do tour (up_rec_passos) — o gravador (widget.js/recorderLerPassosIniciais)
  // pré-carrega a lista lateral com eles em vez de iniciar vazio. Se o
  // payload for grande demais, buildGravadorUrl avisa via console.warn e abre
  // vazio mesmo assim; refletimos isso na UI (passosIncluidosGravador) e o
  // fallback "Colar passos gravados" abaixo continua disponível de qualquer
  // forma.
  const abrirGravador = () => {
    setErroGravador(null)
    setUrlGravadorGerada(null)
    setPassosIncluidosGravador(null)
    if (!urlInicialGravador.trim()) {
      setErroGravador('Informe a URL inicial — a página real do sistema onde o fluxo deste tour começa.')
      return
    }
    let resultado: ReturnType<typeof buildGravadorUrl>
    try {
      resultado = buildGravadorUrl({
        urlInicial: urlInicialGravador.trim(),
        titulo: form.titulo,
        descricao: form.descricao,
        sistema: form.sistema,
        prioridade: Number(form.prioridade || 0),
        passos: passos
          .filter(p => p.titulo.trim())
          .map(p => ({
            titulo: p.titulo,
            descricao: p.descricao || null,
            seletor_tipo: p.seletor_tipo,
            seletor: p.seletor,
            tooltip_posicao: p.tooltip_posicao,
            acao_ao_avancar: p.acao_ao_avancar,
            modo_avanco_interacao: p.modo_avanco_interacao,
            seletor_confirmacao: p.seletor_confirmacao || null,
            secao: p.secao || null,
          })),
      })
    } catch {
      setErroGravador('URL inicial inválida — use uma URL completa, ex: https://meusistema.com/app/agenda')
      return
    }
    setUrlGravadorGerada(resultado.url)
    setPassosIncluidosGravador(resultado.passosIncluidos)
    window.open(resultado.url, '_blank', 'noopener')
  }

  // "Colar da área de transferência": só lê o clipboard e preenche o
  // textarea — nunca substitui os passos sozinho. Mesmo padrão do "Colar
  // JSON" em ImportarTourModal (web/src/pages/tours/Index.tsx).
  const colarJsonGravador = async () => {
    setErroColar(null)
    setAvisoColar(null)
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setAvisoColar('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente no campo abaixo.')
      return
    }
    try {
      const conteudo = await navigator.clipboard.readText()
      if (!conteudo.trim()) {
        setAvisoColar('A área de transferência está vazia.')
        return
      }
      setJsonColadoTexto(conteudo)
    } catch {
      setAvisoColar('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente no campo abaixo.')
    }
  }

  // Substitui só a lista local de passos (setPassos) — nunca chama o
  // backend. O usuário revisa normalmente na seção "Passos do tour" abaixo e
  // só persiste ao clicar em "Salvar" no topo da página.
  const substituirPassosDoJson = () => {
    setErroColar(null)
    setSubstituidoOk(false)
    const resultado = extrairPassosDoJson(jsonColadoTexto)
    if ('erro' in resultado) {
      setErroColar(resultado.erro)
      return
    }
    setPassos(resultado.passos)
    setJsonColadoTexto('')
    setSubstituidoOk(true)
    window.setTimeout(() => setSubstituidoOk(false), 3000)
  }

  // Ações discretas por passo — só copiam para a área de transferência, não
  // validam nada. O elemento real só existe na aplicação integrada.
  const copiarSeletor = (index: number) => {
    const passo = passos[index]
    if (!passo.seletor.trim()) return
    navigator.clipboard.writeText(passo.seletor).catch(() => {})
    setCopiadoPasso({ index, tipo: 'seletor' })
    window.setTimeout(() => {
      setCopiadoPasso(prev => (prev?.index === index && prev.tipo === 'seletor' ? null : prev))
    }, 2000)
  }

  const copiarComandoTeste = (index: number) => {
    const passo = passos[index]
    if (!passo.seletor.trim()) return
    navigator.clipboard.writeText(comandoTestarSeletor(passo.seletor_tipo, passo.seletor)).catch(() => {})
    setCopiadoPasso({ index, tipo: 'comando' })
    window.setTimeout(() => {
      setCopiadoPasso(prev => (prev?.index === index && prev.tipo === 'comando' ? null : prev))
    }, 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passos.length === 0 || passos.some(p => !p.titulo.trim())) {
      setError('Todo passo precisa de título preenchido.')
      return
    }
    // Seletor só é exigido para ativar — um rascunho pode ficar com
    // seletores vazios (ex.: logo depois de aplicar um template).
    if (form.ativo && passos.some(p => !p.seletor.trim())) {
      setError('Para ativar o tour, todos os passos precisam ter um seletor/data-cy informado.')
      return
    }
    if (form.ativo && passos.some(p => MODOS_AVANCO_COM_CONFIRMACAO.includes(p.modo_avanco_interacao) && !p.seletor_confirmacao.trim())) {
      setError('Para ativar o tour, os passos com avanço "quando outro elemento aparecer/sumir" precisam do seletor de confirmação.')
      return
    }
    if (segmentado && regrasSegmentacao.some(r => !r.campo || !r.valor.trim())) {
      setError('Toda regra de segmentação precisa de campo e valor preenchidos.')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const payload = {
        ...form,
        descricao: form.descricao || null,
        tela: form.modo_identificacao === 'sistema_tela' ? form.tela : '',
        data_cy: form.modo_identificacao === 'data_cy' ? form.data_cy : null,
        url_contem: form.modo_identificacao === 'url_contem' ? form.url_contem : null,
        prioridade: Number(form.prioridade || 0),
        segmentacao_regras: segmentado
          ? regrasSegmentacao.map(r => ({ campo: r.campo, operador: r.operador, valor: r.valor.trim() }))
          : null,
        passos: passos.map(p => ({
          titulo: p.titulo.trim(),
          descricao: p.descricao.trim() || null,
          seletor_tipo: p.seletor_tipo,
          seletor: p.seletor.trim(),
          tooltip_posicao: p.tooltip_posicao,
          acao_ao_avancar: p.acao_ao_avancar,
          modo_avanco_interacao: p.modo_avanco_interacao,
          seletor_confirmacao: p.seletor_confirmacao.trim() || null,
          secao: p.secao.trim() || null,
        })),
      }
      const saved = isEdit
        ? await put<TourGuiado>(`/tours/${id}`, payload)
        : await post<TourGuiado>('/tours', payload)

      if (isEdit) {
        // Já estamos na rota final (/tours/:id/editar) — mostra as ações direto.
        setSuccess(true)
      } else {
        // Troca /tours/novo por /tours/:id/editar (necessário para que um novo
        // "Salvar" vire PUT em vez de criar outro tour) e leva o aviso de
        // sucesso via router state, para não perdê-lo no redirecionamento.
        navigate(`/tours/${saved.id}/editar`, { state: { justSaved: true } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o tour guiado. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingTour) return <div className="px-4 lg:px-margin-desktop py-stack-md"><LoadingSpinner /></div>

  // Nunca renderiza o formulário (nem o fallback de "nenhum passo
  // preenchido ainda") se o GET por id falhou — sem essa checagem, um erro
  // de carregamento e um tour genuinamente sem passos pareciam a MESMA
  // tela, e "Salvar" nesse estado substituiria os passos reais (ainda
  // salvos no banco, só não exibidos) pelo que estivesse preenchido ali.
  if (isEdit && loadError) {
    return (
      <div className="px-4 lg:px-margin-desktop py-stack-md">
        <ErrorState message={loadError} onRetry={() => id && carregarTour(id, { cancelado: false })} />
      </div>
    )
  }

  // Numeração das seções — dinâmica porque o card de modelo só existe na
  // criação (some na edição), sem furar a sequência.
  let stepCounter = 0
  const nextStep = () => ++stepCounter

  const primeiroPassoVazio = passos.length === 1 && !passos[0].titulo.trim() && !passos[0].seletor.trim()

  return (
    <div className="relative">
      {/* Page action bar */}
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <nav className="flex gap-2 text-label-md text-outline mb-0.5">
              <button onClick={() => navigate('/tours')} className="hover:text-primary transition-colors">
                Tours Guiados
              </button>
              <span>/</span>
              <span className="text-on-surface">{isEdit ? 'Editar' : 'Criar Novo'}</span>
            </nav>
            <h2 className="text-headline-md font-bold text-on-surface leading-tight">
              {isEdit ? 'Editar Tour Guiado' : 'Novo Tour Guiado'}
            </h2>
            <p className="text-body-md text-on-surface-variant mt-0.5 hidden sm:block">
              {isEdit
                ? 'Ajuste os passos e o destino deste tour guiado.'
                : 'Monte um passo a passo para guiar usuários dentro do produto.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/tours/guia')}
              className="flex items-center gap-1 text-label-sm text-outline hover:text-primary transition-colors mt-1"
            >
              <span className="material-symbols-outlined text-[13px]">menu_book</span>
              Guia de Uso
            </button>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/tours')}
              className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              Cancelar
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => navigate(`/tours/${id}/preview`)}
                className="px-4 py-2 border border-primary text-primary rounded-xl text-label-md font-bold hover:bg-primary-fixed transition-all"
              >
                Testar tour
              </button>
            )}
            <button
              form="tour-form"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1400px]">
        {!isEdit && !form.ativo && (
          <div className="mb-5 p-3 bg-[#fff8e1] border border-[#ffe082] text-[#e65100] rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">info</span>
            Este tour começa como rascunho. Teste antes de ativar para os usuários.
          </div>
        )}
        {success && (
          <div className="mb-5 p-4 bg-tertiary/10 rounded-xl">
            <p className="text-body-md text-tertiary font-semibold flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Tour salvo com sucesso.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(`/tours/${id}/preview`)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-bright border border-outline-variant rounded-lg text-label-md font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                Testar tour
              </button>
              <button
                type="button"
                onClick={() => navigate(`/tours/${id}/dashboard`)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-bright border border-outline-variant rounded-lg text-label-md font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">monitoring</span>
                Ver dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate('/tours')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-bright border border-outline-variant rounded-lg text-label-md font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Voltar para listagem
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mb-5 p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        <form id="tour-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Templates — só na criação, nunca aplicado automaticamente na edição */}
          {!isEdit && (
            <div className={card}>
              <CardHeader
                number={nextStep()}
                icon="auto_awesome"
                iconBg="bg-tertiary/10"
                iconColor="text-tertiary"
                title="Começar com um modelo"
                description="Escolha um ponto de partida — título, descrição e passos base. Você edita tudo livremente depois."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {TOUR_TEMPLATES.map(tpl => {
                  const ativo = templateAplicadoId === tpl.id
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => aplicarTemplate(tpl)}
                      className={`text-left p-3.5 rounded-xl border transition-all ${
                        ativo ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-container-low hover:border-primary/50'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[20px] mb-1.5 block ${ativo ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {tpl.icon}
                      </span>
                      <p className={`text-body-md font-semibold ${ativo ? 'text-primary' : 'text-on-surface'}`}>{tpl.nome}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">{tpl.descricao}</p>
                    </button>
                  )
                })}
              </div>
              {templateAplicadoId && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-tertiary/10 rounded-xl">
                  <p className="text-label-md text-tertiary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Modelo aplicado — título, descrição e passos preenchidos abaixo. Seletores ficam em branco para você informar.
                  </p>
                  <button type="button" onClick={limparTemplate} className="text-label-md text-tertiary font-bold hover:underline shrink-0">
                    Começar em branco
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Informações gerais */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="info"
              iconBg="bg-primary-fixed"
              iconColor="text-primary"
              title="Informações gerais"
              description="Nome e descrição deste tour guiado."
            />
            <div className="grid grid-cols-1 gap-4 max-w-4xl">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  Título do Tour <span className="text-error">*</span>
                </label>
                <input
                  required
                  value={form.titulo}
                  onChange={e => set('titulo', e.target.value)}
                  placeholder="Ex: Conheça a nova agenda"
                  className={field}
                />
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
                <textarea
                  rows={2}
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Para que serve este tour?"
                  className={`${field} resize-none`}
                />
                <p className="mt-1 text-[11px] text-outline">Essa descrição será exibida na introdução do tour para explicar o que será apresentado.</p>
              </div>
            </div>
          </div>

          {/* Destino do tour */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="map"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Destino do tour"
              description="Defina o sistema e a tela onde o tour deve ser executado."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
              <div className="md:col-span-2">
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  Sistema <span className="text-error">*</span>
                </label>
                <input
                  required
                  value={form.sistema}
                  onChange={e => set('sistema', e.target.value)}
                  placeholder="Ex: portal, crm, mobile"
                  className={field}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-label-md text-on-surface-variant mb-2">
                  Onde o tour deve iniciar? <span className="text-error">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MODOS.map(opt => {
                    const active = form.modo_identificacao === opt.value
                    return (
                      <label key={opt.value} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-container-low hover:border-primary/50'}`}>
                        <input
                          type="radio"
                          name="modo_identificacao"
                          value={opt.value}
                          checked={active}
                          onChange={e => set('modo_identificacao', e.target.value)}
                          className="mt-0.5 text-primary focus:ring-primary shrink-0"
                        />
                        <div>
                          <p className={`text-body-md font-semibold ${active ? 'text-primary' : 'text-on-surface'}`}>{opt.label}</p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {form.modo_identificacao === 'sistema_tela' && (
                <div className="md:col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Nome da tela <span className="text-error">*</span>
                  </label>
                  <input
                    required
                    value={form.tela}
                    onChange={e => set('tela', e.target.value)}
                    placeholder="Ex: home, checkout, dashboard"
                    className={field}
                  />
                </div>
              )}

              {form.modo_identificacao === 'data_cy' && (
                <div className="md:col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Data-cy da tela <span className="text-error">*</span>
                  </label>
                  <input
                    required
                    value={form.data_cy}
                    onChange={e => set('data_cy', e.target.value)}
                    placeholder="Ex: agenda-page"
                    className={field}
                  />
                </div>
              )}

              {form.modo_identificacao === 'url_contem' && (
                <div className="md:col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Caminho da URL <span className="text-error">*</span>
                  </label>
                  <input
                    required
                    value={form.url_contem}
                    onChange={e => set('url_contem', e.target.value)}
                    placeholder="/app/atendimento/agendamentos"
                    className={field}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Editar fluxo no sistema — só na edição */}
          {isEdit && (
            <div className={card}>
              <CardHeader
                number={nextStep()}
                icon="videocam"
                iconBg="bg-secondary-fixed"
                iconColor="text-secondary"
                title="Editar fluxo no sistema"
                description="Abra o sistema integrado para ajustar os passos deste tour visualmente."
              />
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">URL inicial</label>
                  <input
                    value={urlInicialGravador}
                    onChange={e => setUrlInicialGravador(e.target.value)}
                    placeholder="https://meusistema.com/app/agenda"
                    className={`${field} font-mono text-[13px]`}
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    A página real onde o fluxo começa (precisa já ter o widget UserPulse instalado).
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 bg-surface-container-low rounded-xl text-[11px] text-on-surface-variant">
                  <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5">info</span>
                  {passosIncluidosGravador === false ? (
                    <span>
                      Os {passos.length} passo{passos.length === 1 ? '' : 's'} atuais são grandes demais para enviar
                      pela URL — o gravador abriu vazio desta vez (detalhes no console do navegador). Grave o fluxo,
                      clique em "Copiar JSON" ao finalizar e cole abaixo em "Colar passos gravados".
                    </span>
                  ) : (
                    <span>
                      Ao clicar em "Editar fluxo no sistema", os {passos.length} passo{passos.length === 1 ? '' : 's'}{' '}
                      já cadastrado{passos.length === 1 ? '' : 's'} deste tour são enviados junto — o gravador abre já
                      com eles na lista lateral, prontos para editar, remover ou completar com novos passos. Ao
                      finalizar, clique em "Copiar JSON" na aba do gravador e cole abaixo em "Colar passos gravados"
                      para trazer o resultado de volta. Os passos atuais deste formulário só mudam quando você colar e
                      clicar em "Substituir passos".
                    </span>
                  )}
                </div>

                {erroGravador && (
                  <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    {erroGravador}
                  </div>
                )}

                {urlGravadorGerada && (
                  <div className="p-3 bg-tertiary/10 rounded-xl text-body-md text-tertiary flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">check_circle</span>
                    <span>
                      Gravação iniciada numa nova aba. Se o navegador bloqueou o pop-up, abra manualmente:{' '}
                      <a href={urlGravadorGerada} target="_blank" rel="noreferrer" className="underline break-all">{urlGravadorGerada}</a>
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={abrirGravador}
                  className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">videocam</span>
                  Editar fluxo no sistema
                </button>

                <div className="pt-3 border-t border-outline-variant/40">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Colar passos gravados (substitui a lista de passos abaixo)
                  </label>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={colarJsonGravador}
                      className="flex items-center gap-1 px-3 py-1.5 bg-surface-bright border border-outline-variant rounded-lg text-label-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_paste_go</span>
                      Colar da área de transferência
                    </button>
                    {substituidoOk && (
                      <span className="text-label-sm text-tertiary font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        Passos substituídos abaixo.
                      </span>
                    )}
                  </div>
                  {avisoColar && <p className="text-[11px] text-on-surface-variant mb-2">{avisoColar}</p>}
                  <textarea
                    value={jsonColadoTexto}
                    onChange={e => setJsonColadoTexto(e.target.value)}
                    rows={6}
                    placeholder='{"formato":"userpulse.tour.v1","tour":{"passos":[...]}}'
                    className={`${field} font-mono text-[12px] resize-none`}
                  />
                  {erroColar && (
                    <div className="mt-2 p-3 bg-error-container text-on-error-container rounded-xl text-body-sm flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">error</span>
                      {erroColar}
                    </div>
                  )}
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={substituirPassosDoJson}
                      disabled={!jsonColadoTexto.trim()}
                      className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      Substituir passos
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Passos do tour */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="checklist"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Passos do tour"
              description="Defina a sequência de elementos destacados."
              action={
                <button
                  type="button"
                  onClick={addPasso}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-bold hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar passo
                </button>
              }
            />

            {primeiroPassoVazio && (
              <div className="mb-3 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-outline-variant bg-surface-container-low/60 text-label-md text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-outline shrink-0">info</span>
                {isEdit
                  ? 'Nenhum passo preenchido ainda — comece pelo primeiro abaixo.'
                  : 'Nenhum passo preenchido ainda — comece pelo primeiro abaixo ou escolha um modelo acima.'}
              </div>
            )}

            <div className="space-y-3">
              {passos.map((passo, i) => (
                <div key={i} className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-label-md font-bold text-on-surface flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[12px] font-bold">{i + 1}</span>
                      Passo {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => movePasso(i, -1)}
                        disabled={i === 0}
                        title="Mover para cima"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => movePasso(i, 1)}
                        disabled={i === passos.length - 1}
                        title="Mover para baixo"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicarPasso(i)}
                        title="Duplicar passo"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removePasso(i)}
                        disabled={passos.length === 1}
                        title="Remover passo"
                        className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
                    <div className="md:col-span-2">
                      <label className="block text-label-sm text-on-surface-variant mb-1">
                        Título do passo <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        value={passo.titulo}
                        onChange={e => setPasso(i, 'titulo', e.target.value)}
                        placeholder="Ex: Crie um novo agendamento"
                        className={`${field} text-[13px] py-2`}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Descrição</label>
                      <textarea
                        rows={2}
                        value={passo.descricao}
                        onChange={e => setPasso(i, 'descricao', e.target.value)}
                        placeholder="Instrução exibida ao usuário neste passo"
                        className={`${field} text-[13px] py-2 resize-none`}
                      />
                    </div>
                    {/* Tipo de seletor + Seletor em grid próprio: em xl (sidebar aberta
                        conta como espaço a menos), os dois campos ficam lado a lado;
                        abaixo disso, empilham — evita espremer o input e as ações. */}
                    <div className="md:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Tipo de seletor</label>
                        <Select
                          value={passo.seletor_tipo}
                          onChange={v => setPasso(i, 'seletor_tipo', v)}
                          options={SELETOR_TIPOS}
                          size="sm"
                        />
                        <p className="text-[11px] text-on-surface-variant mt-1">{legendaTipoSeletor(passo.seletor_tipo)}</p>
                      </div>
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Seletor <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={passo.seletor}
                          onChange={e => setPasso(i, 'seletor', normalizarSeletorInput(passo.seletor_tipo, e.target.value))}
                          placeholder={
                            passo.seletor_tipo === 'css' ? '#botao-novo-agendamento'
                              : passo.seletor_tipo === 'id' ? 'novo-agendamento-btn'
                                : passo.seletor_tipo === 'area' ? '.filtros-agenda'
                                  : 'novo-agendamento-btn'
                          }
                          className={`${field} text-[13px] py-2 font-mono`}
                        />
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          {passo.seletor_tipo === 'data_cy' && 'Informe apenas o valor do data-cy — ex.: layout-sider-menu-item-link-1 (não cole [data-cy="..."], é normalizado automaticamente).'}
                          {passo.seletor_tipo === 'id' && 'Informe apenas o valor do id — ex.: novo-agendamento-btn (com ou sem # na frente).'}
                          {passo.seletor_tipo === 'css' && 'Seletor CSS completo — ex.: #novo-agendamento-btn, button[name="salvar"], .menu-item[href="/app/agenda"].'}
                          {passo.seletor_tipo === 'area' && 'Use para destacar um GRUPO de campos juntos (ex.: os filtros de clínica, convênio e especialidade da agenda) em vez de um elemento único. Seletor CSS completo do container que envolve o grupo — ex.: .filtros-agenda, [data-cy="filtros-agenda"], .card-resumo.'}
                        </p>
                        {/* Ações discretas abaixo do input — nunca disputam espaço com
                            ele. Empilham à esquerda no mobile, uma linha à direita a
                            partir de sm. */}
                        <div className="flex flex-col items-start gap-1 mt-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                          <button
                            type="button"
                            onClick={() => copiarSeletor(i)}
                            disabled={!passo.seletor.trim()}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {copiadoPasso?.index === i && copiadoPasso.tipo === 'seletor' ? 'check' : 'content_copy'}
                            </span>
                            {copiadoPasso?.index === i && copiadoPasso.tipo === 'seletor' ? 'Copiado!' : 'Copiar seletor'}
                          </button>
                          <button
                            type="button"
                            onClick={() => copiarComandoTeste(i)}
                            disabled={!passo.seletor.trim()}
                            title="Copia um comando de diagnóstico para colar no console da tela real: mostra se o elemento foi encontrado, se há mais de um resultado, se está visível e o tamanho aproximado, além de destacar o alvo por alguns segundos."
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {copiadoPasso?.index === i && copiadoPasso.tipo === 'comando' ? 'check' : 'terminal'}
                            </span>
                            {copiadoPasso?.index === i && copiadoPasso.tipo === 'comando' ? 'Copiado!' : 'Testar seletor'}
                          </button>
                        </div>
                        {passo.seletor.trim() && (
                          <p className="text-[10px] text-on-surface-variant mt-1 text-right">
                            "Testar seletor" copia um comando para o console da tela real — informa encontrado/não
                            encontrado/múltiplos resultados, visibilidade e tamanho aproximado, e destaca o alvo.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="max-w-xs">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Posição do tooltip</label>
                      <Select
                        value={passo.tooltip_posicao}
                        onChange={v => setPasso(i, 'tooltip_posicao', v)}
                        options={TOOLTIP_POSICOES}
                        size="sm"
                      />
                    </div>
                    <div className="max-w-xs">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Ação ao clicar em Próximo</label>
                      <Select
                        value={passo.acao_ao_avancar}
                        onChange={v => setPasso(i, 'acao_ao_avancar', v)}
                        options={ACOES_AO_AVANCAR}
                        size="sm"
                      />
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        Define se o botão Próximo apenas avança o tour ou também executa um clique no elemento destacado.
                      </p>
                    </div>
                    <div className="max-w-xs">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Como avançar este passo?</label>
                      <Select
                        value={passo.modo_avanco_interacao}
                        onChange={v => setPasso(i, 'modo_avanco_interacao', v)}
                        options={MODOS_AVANCO_INTERACAO}
                        size="sm"
                      />
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        <strong className="text-on-surface-variant">Avançar pelo botão Próximo</strong>: só o clique em "Próximo" avança o tour.{' '}
                        <strong className="text-on-surface-variant">Avançar ao interagir com o elemento destacado</strong> (demais opções): o usuário precisa clicar, preencher ou concluir a interação escolhida com o elemento em destaque para o tour continuar sozinho — o widget mostra esse aviso no tooltip do passo.
                      </p>
                    </div>
                    {MODOS_AVANCO_COM_CONFIRMACAO.includes(passo.modo_avanco_interacao) && (
                      <div className="md:col-span-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Seletor de confirmação <span className="text-error">*</span>
                        </label>
                        <input
                          value={passo.seletor_confirmacao}
                          onChange={e => setPasso(i, 'seletor_confirmacao', e.target.value)}
                          placeholder='Seletor CSS completo — ex: [data-cy="overlay-autocomplete"] ou .dropdown-aberto'
                          className={`${field} text-[13px] py-2 font-mono`}
                        />
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          Use para aguardar um modal, lista ou elemento aparecer/sumir antes de avançar.
                        </p>
                      </div>
                    )}
                    <AlertasConfiguracaoPasso passo={passo} />
                    <PassoPreview passo={passo} indice={i} total={passos.length} />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPasso}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-outline-variant rounded-xl text-label-md font-bold text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Adicionar passo
            </button>
          </div>

          {/* Configurações de exibição */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="tune"
              iconBg="bg-tertiary-fixed"
              iconColor="text-tertiary"
              title="Configurações de exibição"
              description="Prioridade entre tours elegíveis e status de publicação."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Prioridade</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.prioridade}
                  onChange={e => set('prioridade', e.target.value)}
                  className={field}
                />
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Status</label>
                <label className="relative inline-flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={e => set('ativo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative" />
                  <span className="ml-3 text-body-md text-on-surface">{form.ativo ? 'Ativo' : 'Inativo'}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Segmentação por contexto */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="target"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Segmentação"
              description="Opcional — restrinja este tour a contextos específicos enviados pelo widget (init/updateContext)."
            />
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${!segmentado ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-bright hover:border-primary/50'}`}>
                  <input type="radio" name="modo_segmentacao" checked={!segmentado} onChange={desativarSegmentacao} className="mt-0.5 text-primary focus:ring-primary shrink-0" />
                  <div>
                    <p className={`text-body-md font-semibold ${!segmentado ? 'text-primary' : 'text-on-surface'}`}>Todos os usuários/contextos</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">Comportamento atual — elegível pra qualquer contexto.</p>
                  </div>
                </label>
                <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${segmentado ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-bright hover:border-primary/50'}`}>
                  <input type="radio" name="modo_segmentacao" checked={segmentado} onChange={ativarSegmentacao} className="mt-0.5 text-primary focus:ring-primary shrink-0" />
                  <div>
                    <p className={`text-body-md font-semibold ${segmentado ? 'text-primary' : 'text-on-surface'}`}>Apenas quando o contexto atender às regras</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">O tour só é elegível se TODAS as regras abaixo baterem.</p>
                  </div>
                </label>
              </div>

              {segmentado && (
                <div className="space-y-2 pt-1">
                  {regrasSegmentacao.map((regra, index) => (
                    <div key={index} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-surface-bright border border-outline-variant rounded-lg p-2.5">
                      <div className="sm:w-48 shrink-0">
                        <Select
                          size="sm"
                          value={regra.campo}
                          options={CAMPOS_SEGMENTACAO}
                          onChange={v => atualizarRegraSegmentacao(index, { campo: v as CampoSegmentacaoTour })}
                          placeholder="Campo…"
                        />
                      </div>
                      <div className="sm:w-52 shrink-0">
                        <Select
                          size="sm"
                          value={regra.operador}
                          options={OPERADORES_SEGMENTACAO}
                          onChange={v => atualizarRegraSegmentacao(index, { operador: v as OperadorSegmentacaoTour })}
                        />
                      </div>
                      <input
                        value={regra.valor}
                        onChange={e => atualizarRegraSegmentacao(index, { valor: e.target.value })}
                        placeholder={OPERADORES_SEGMENTACAO.find(o => o.value === regra.operador)?.placeholder}
                        className={`${field} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => removerRegraSegmentacao(index)}
                        className="shrink-0 p-2 text-outline hover:text-error transition-colors self-end sm:self-center"
                        title="Remover regra"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={adicionarRegraSegmentacao}
                    className="inline-flex items-center gap-1.5 text-label-md text-primary hover:text-primary/80 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Adicionar regra
                  </button>
                  <p className="text-[11px] text-amber-700 flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
                    <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
                    Para "está em lista", separe os valores por vírgula (ex.: RN, SP, MG).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Resumo do tour — orienta, não bloqueia */}
          <ChecklistCard form={form} passos={passos} numero={nextStep()} />
        </form>
      </section>
    </div>
  )
}
