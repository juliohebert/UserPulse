import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourGuiado, TourGuiadoListaPaginada, RegraSegmentacaoTour, CampoSegmentacaoTour, Sistema, TelaCatalogo, GatilhoTour, FrequenciaTour, TourDependenciaJornada } from '../../types'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { CardHeader } from '../../components/ui/CardHeader'
import { Button } from '../../components/ui/Button'
import { SeletorTelaCatalogo } from '../../components/catalogo/SeletorTelaCatalogo'
import { TelaCatalogoModal, TELA_CATALOGO_EMPTY_FORM, normalizarPathUrl, pathUrlValido } from '../../components/catalogo/TelaCatalogoModal'
import { buildGravadorUrl, buildPreviewUrl, comandoTestarSeletor, type GravadorUrlResultado, type PreviewUrlResultado } from '../../utils/tour'
import { useAuth } from '../../hooks/useAuth'
import { podeGerenciarModulo } from '../../utils/permissions'
import { limiteTrial, LIMITE_TRIAL_NAO_ATINGIDO, type LimiteTrialInfo } from '../../utils/limiteTrial'

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
  permite_autonomo: boolean
  permite_jornada: boolean
  publico_geral: boolean
  gatilhos: GatilhoTour[]
  frequencia: FrequenciaTour
  frequencia_intervalo_dias: string
}

// Um tour novo começa com a exibição autônoma inativa — precisa ser testado
// antes de ser ativado. ativo NÃO controla se o tour existe ou pode ser
// usado: mesmo inativo, ele já pode ser adicionado como etapa de uma
// Jornada normalmente (ver aviso no topo do formulário de criação).
const EMPTY: FormState = {
  titulo: '', descricao: '', sistema: '', modo_identificacao: 'sistema_tela',
  tela: '', data_cy: '', url_contem: '', prioridade: '0', ativo: false,
  permite_autonomo: false, permite_jornada: true, publico_geral: true, gatilhos: [],
  frequencia: 'uma_vez_por_usuario', frequencia_intervalo_dias: '',
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

type ModoSegmentacaoTour = 'todos' | 'cliente' | 'perfil' | 'combinada'
const CAMPOS_SEGMENTACAO_CLIENTE: CampoSegmentacaoTour[] = ['cliente_id', 'unidade_id']
const CAMPOS_SEGMENTACAO_PERFIL: CampoSegmentacaoTour[] = ['perfil', 'usuario_tipo', 'estado']
const CAMPOS_SEGMENTACAO_CAMPANHAS: CampoSegmentacaoTour[] = [...CAMPOS_SEGMENTACAO_CLIENTE, ...CAMPOS_SEGMENTACAO_PERFIL, 'dominio']

function valoresSegmentacao(regras: RegraSegmentacaoTour[], campo: CampoSegmentacaoTour): string[] {
  return regras
    .filter(regra => regra.campo === campo)
    .flatMap(regra => regra.operador === 'em_lista' ? regra.valor.split(',') : [regra.valor])
    .map(valor => valor.trim())
    .filter(Boolean)
}

function resolverModoSegmentacaoTour(regras: RegraSegmentacaoTour[]): ModoSegmentacaoTour {
  const temCliente = regras.some(regra => CAMPOS_SEGMENTACAO_CLIENTE.includes(regra.campo as CampoSegmentacaoTour) && regra.valor.trim())
  const temPerfil = regras.some(regra => CAMPOS_SEGMENTACAO_PERFIL.includes(regra.campo as CampoSegmentacaoTour) && regra.valor.trim())
  if (temCliente && temPerfil) return 'combinada'
  if (temCliente) return 'cliente'
  if (temPerfil) return 'perfil'
  return 'todos'
}

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

const field = 'w-full h-11 rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none transition-colors focus:border-2 focus:border-primary'
const card = 'w-full bg-surface p-6 rounded-3xl border border-outline-variant'

type SecaoConfiguracaoTour = 'geral' | 'exibicao' | 'segmentacao'

const SECOES_CONFIGURACAO: Array<{ id: SecaoConfiguracaoTour; label: string; description: string; icon: string }> = [
  { id: 'geral', label: 'Geral', description: 'Contexto e destino do tour', icon: 'info' },
  { id: 'exibicao', label: 'Exibição e distribuição', description: 'Origens, frequência e gatilhos', icon: 'tune' },
  { id: 'segmentacao', label: 'Segmentação', description: 'Contextos elegíveis', icon: 'target' },
]

// Seleção múltipla a partir de Sistema.dominios (catálogo do sistema deste
// tour) pro campo "dominio" da regra de segmentação — mesmo tratamento de
// CampanhaForm.tsx (CampoDominiosDock): nunca texto livre, e valores já
// salvos fora do catálogo atual (drift histórico) permanecem
// selecionados/visíveis até uma ação explícita do usuário desmarcá-los.
function CampoDominiosRegra({ catalogo, value, onChange }: {
  catalogo: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const foraDoCatalogo = value.filter(v => !catalogo.includes(v))
  const opcoes = [...catalogo, ...foraDoCatalogo]

  function alternar(dominio: string) {
    onChange(value.includes(dominio) ? value.filter(v => v !== dominio) : [...value, dominio])
  }

  if (opcoes.length === 0) {
    return (
      <p className="flex-1 text-[12px] leading-4 text-on-surface-variant">
        Este sistema ainda não tem domínios cadastrados em Configurações → Sistemas.
      </p>
    )
  }

  return (
    <div className="flex flex-1 flex-wrap gap-1.5">
      {opcoes.map(dominio => (
        <label
          key={dominio}
          className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4 ${value.includes(dominio) ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-white text-on-surface'}`}
        >
          <input type="checkbox" checked={value.includes(dominio)} onChange={() => alternar(dominio)} className="h-3 w-3 accent-primary" />
          {dominio}
          {!catalogo.includes(dominio) && <span className="text-[10px] font-normal text-on-surface-variant">(fora do catálogo)</span>}
        </label>
      ))}
    </div>
  )
}

function CampoListaSegmentacao({ label, value, onChange, hint = 'Separe múltiplos valores por vírgula.' }: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label-md font-bold text-on-surface-variant">{label}</span>
      <input
        value={value.join(', ')}
        onChange={event => onChange(event.target.value.split(',').map(item => item.trim()).filter(Boolean))}
        placeholder="Digite valores separados por vírgula"
        className={field}
      />
      <span className="mt-1 block text-[11px] text-on-surface-variant">{hint}</span>
    </label>
  )
}

// ─── Checklist de qualidade ─────────────────────────────────────────────────
// Só orienta — não bloqueia nada além das validações que já existem em
// handleSubmit (título de passo sempre obrigatório). "critico" aqui sinaliza
// o que de fato impede salvar;
// "aviso" é recomendação; "neutro" é só informativo.

type ChecklistStatus = 'ok' | 'aviso' | 'critico' | 'neutro'

interface ChecklistItem {
  label: string
  status: ChecklistStatus
  detalhe?: string
}

function destinoConfigurado(form: FormState): boolean {
  if (!form.permite_autonomo) return true
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
    { label: 'Título preenchido', status: form.titulo.trim() ? 'ok' : 'critico', detalhe: form.titulo.trim() ? undefined : 'Informe um título para salvar o tour.' },
    {
      label: 'Descrição preenchida',
      status: form.descricao.trim() ? 'ok' : 'aviso',
      detalhe: form.descricao.trim()
        ? undefined
        : 'Tour sem descrição — ela aparece na introdução do tour pra explicar o que será apresentado; sem ela, mostramos uma mensagem genérica.',
    },
    {
      label: 'Destino configurado',
      status: destinoConfigurado(form) ? 'ok' : 'critico',
      detalhe: destinoConfigurado(form) ? (!form.permite_autonomo ? 'Tour exclusivo de Jornada: o destino autônomo será configurado quando a execução independente for habilitada.' : undefined) : 'Informe o sistema e a tela, data-cy ou URL, conforme o modo escolhido.',
    },
    {
      label: `${total} passo${total === 1 ? '' : 's'} cadastrado${total === 1 ? '' : 's'}`,
      status: total > 0 ? 'ok' : 'critico',
      detalhe: total > 0 ? undefined : 'Adicione pelo menos um passo para o tour funcionar.',
    },
    {
      label: 'Origem de execução configurada',
      status: form.permite_autonomo || form.permite_jornada ? 'ok' : 'critico',
      detalhe: form.permite_autonomo || form.permite_jornada ? undefined : 'Habilite execução independente ou uso como etapa de Jornada.',
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
      // Seletor vazio só bloqueia de verdade quando a exibição autônoma está
      // ativa (handleSubmit) — com ela inativa, é só um aviso: o tour ainda
      // pode ser salvo e usado como etapa de Jornada enquanto for revisado.
      status: semSeletor === 0 ? 'ok' : (form.ativo ? 'critico' : 'aviso'),
      detalhe: semSeletor > 0 ? 'Necessário para o widget localizar o elemento na tela do usuário.' : undefined,
    },
    {
      label: `Exibição autônoma: ${form.ativo ? 'Ativa' : 'Inativa'}`,
      status: form.ativo ? 'ok' : 'neutro',
    },
    {
      label: 'Gatilhos autônomos',
      status: form.ativo && form.permite_autonomo ? (form.gatilhos.length > 0 ? 'ok' : 'critico') : 'neutro',
      detalhe: form.ativo && form.permite_autonomo && form.gatilhos.length === 0 ? 'Uma exibição autônoma ativa precisa de pelo menos um gatilho.' : undefined,
    },
    {
      label: 'Frequência de exibição',
      status: form.permite_autonomo && form.frequencia === 'intervalo_dias' && (!form.frequencia_intervalo_dias || Number(form.frequencia_intervalo_dias) <= 0) ? 'critico' : 'ok',
      detalhe: form.permite_autonomo && form.frequencia === 'intervalo_dias' && (!form.frequencia_intervalo_dias || Number(form.frequencia_intervalo_dias) <= 0) ? 'Informe um intervalo inteiro positivo em dias.' : undefined,
    },
  ]

  if (form.ativo && algumIncompleto) {
    items.push({
      label: 'Exibição autônoma ativa com passo incompleto',
      status: 'critico',
      detalhe: 'Existe passo sem título ou sem seletor. Complete os passos pendentes ou desative a exibição autônoma. O tour continua podendo ser usado em uma jornada enquanto isso.',
    })
  } else if (!form.ativo) {
    items.push({ label: 'Exibição autônoma inativa. O tour pode ser usado em uma jornada normalmente', status: 'neutro' })
  } else {
    items.push({ label: 'Exibição autônoma ativa e pronta', status: 'ok' })
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

function ChecklistCard({ form, passos }: { form: FormState; passos: PassoState[] }) {
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
        icon="fact_check"
        iconBg="bg-primary-fixed"
        iconColor="text-primary"
        title="Revisão do tour"
        description="Confira os dados e pendências antes de criar ou salvar."
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

function InformacoesTour({ form, passos, segmentado }: { form: FormState; passos: PassoState[]; segmentado: boolean }) {
  const destino = !form.permite_autonomo
    ? 'Somente dentro de Jornadas'
    : form.modo_identificacao === 'sistema_tela'
    ? form.tela || 'Tela não informada'
    : form.modo_identificacao === 'data_cy'
      ? `data-cy: ${form.data_cy || 'não informado'}`
      : `URL: ${form.url_contem || 'não informada'}`
  const distribuicao = form.permite_autonomo && form.permite_jornada
    ? 'Autônomo e Jornada'
    : form.permite_autonomo
      ? 'Autônomo'
      : form.permite_jornada
        ? 'Jornada'
        : 'Nenhuma origem'

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-outline-variant bg-surface-container-low/40 p-4 sm:grid-cols-2">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-outline">Tour</p><p className="mt-1 text-body-md font-bold text-on-surface">{form.titulo || 'Sem título'}</p><p className="text-[12px] text-on-surface-variant">{form.descricao || 'Sem descrição'}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-outline">Destino</p><p className="mt-1 text-body-md font-bold text-on-surface">{form.sistema || 'Sistema não informado'}</p><p className="text-[12px] text-on-surface-variant">{destino}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-outline">Distribuição</p><p className="mt-1 text-body-md font-bold text-on-surface">{distribuicao}</p><p className="text-[12px] text-on-surface-variant">Exibição autônoma {form.ativo ? 'ativa' : 'inativa'} · {segmentado ? 'segmentado' : 'todos os contextos'}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-outline">Passos</p><p className="mt-1 text-body-md font-bold text-on-surface">{passos.length} passo{passos.length === 1 ? '' : 's'}</p><p className="text-[12px] text-on-surface-variant">{passos.filter(p => p.seletor.trim()).length} com seletor configurado</p></div>
    </div>
  )
}

// ─── Alertas de configuração por passo ─────────────────────────────────────
// Heurística por nome do seletor (o admin não tem acesso ao DOM real da tela
// integrada — só ao texto do seletor cadastrado). Só orienta, nunca bloqueia
// o salvamento; isso orienta a revisão antes de usar o tour em uma jornada.
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

function PassosEditor({
  passos, selecionado, onSelecionar, onAdicionar, onSetPasso, onMover, onDuplicar, onRemover, onReordenar,
  passoRefs, passoDestacado, copiadoPasso, onCopiarSeletor, onCopiarComando,
}: {
  passos: PassoState[]
  selecionado: number
  onSelecionar: (index: number) => void
  onAdicionar: () => void
  onSetPasso: (index: number, key: keyof PassoState, value: string) => void
  onMover: (index: number, dir: -1 | 1) => void
  onDuplicar: (index: number) => void
  onRemover: (index: number) => void
  onReordenar: (origem: number, destino: number) => void
  passoRefs: { current: Array<HTMLDivElement | null> }
  passoDestacado: number | null
  copiadoPasso: { index: number; tipo: 'seletor' | 'comando' } | null
  onCopiarSeletor: (index: number) => void
  onCopiarComando: (index: number) => void
}) {
  const [arrastado, setArrastado] = useState<number | null>(null)
  const indice = passos[selecionado] ? selecionado : 0
  const passo = passos[indice] ?? PASSO_VAZIO
  const definir = (key: keyof PassoState) => (value: string) => onSetPasso(indice, key, value)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,40fr)_minmax(0,60fr)]">
      <section className="rounded-2xl border border-outline-variant bg-surface-bright p-4 xl:sticky xl:top-4 xl:self-start" aria-label="Lista de passos">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-title-md font-bold text-on-surface">
              <span className="material-symbols-outlined text-[20px] text-primary">format_list_numbered</span>
              Passos <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{passos.length}</span>
            </h3>
            <p className="mt-1 text-[11px] text-on-surface-variant">Selecione um passo para editar.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {passos.map((item, i) => {
            const incompleto = !item.titulo.trim() || !item.seletor.trim()
            return (
              <div
                key={item.id ?? `passo-${i}`}
                ref={el => { passoRefs.current[i] = el }}
                draggable
                onDragStart={() => setArrastado(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (arrastado != null) onReordenar(arrastado, i); setArrastado(null) }}
                className={`rounded-xl border transition-all ${passoDestacado === i ? 'border-primary ring-2 ring-primary/30' : ''} ${i === indice ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-low/40'}`}
              >
                <button type="button" onClick={() => onSelecionar(i)} className="flex min-h-[60px] w-full items-center gap-2 px-2.5 py-2 text-left" aria-current={i === indice ? 'step' : undefined}>
                  <span className="material-symbols-outlined hidden cursor-grab text-[17px] text-outline sm:inline" aria-hidden="true">drag_indicator</span>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i === indice ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12px] font-bold ${i === indice ? 'text-primary' : 'text-on-surface'}`}>{item.titulo.trim() || 'Sem título'}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">{item.seletor.trim() || 'Seletor pendente'}</span>
                  </span>
                  <span className={`material-symbols-outlined text-[17px] ${incompleto ? 'text-[#e65100]' : 'text-tertiary'}`} title={incompleto ? 'Passo pendente' : 'Passo configurado'}>{incompleto ? 'warning' : 'check_circle'}</span>
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={onAdicionar} className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 text-label-md font-bold text-primary transition-colors hover:bg-primary/5">
          <span className="material-symbols-outlined text-[18px]">add</span> Adicionar passo
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-outline">Arraste para reordenar ou use os controles acessíveis no editor.</p>
      </section>

      <section className="min-w-0 rounded-2xl border border-outline-variant bg-surface-bright" aria-label={`Editor do passo ${indice + 1}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 px-4 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Passo {indice + 1} de {passos.length}</p>
            <h3 className="mt-1 text-title-md font-bold text-on-surface">Editar passo</h3>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">Conteúdo, seletor e comportamento deste passo.</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onMover(indice, -1)} disabled={indice === 0} aria-label="Mover passo para cima" className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"><span className="material-symbols-outlined text-[18px]">arrow_upward</span></button>
            <button type="button" onClick={() => onMover(indice, 1)} disabled={indice === passos.length - 1} aria-label="Mover passo para baixo" className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"><span className="material-symbols-outlined text-[18px]">arrow_downward</span></button>
            <button type="button" onClick={() => onDuplicar(indice)} aria-label="Duplicar passo" className="flex h-11 w-11 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container-high"><span className="material-symbols-outlined text-[18px]">content_copy</span></button>
            <button type="button" onClick={() => onRemover(indice)} disabled={passos.length === 1} aria-label="Excluir passo" className="flex h-11 w-11 items-center justify-center rounded-xl text-error hover:bg-error-container disabled:opacity-30"><span className="material-symbols-outlined text-[18px]">delete</span></button>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="tour-passo-titulo" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Título do passo <span className="text-error">*</span></label>
            <input id="tour-passo-titulo" value={passo.titulo} maxLength={100} onChange={e => definir('titulo')(e.target.value)} placeholder="Ex: Crie um novo agendamento" className={field} />
            <p className="mt-1 text-right text-[10px] text-outline">{passo.titulo.length}/100</p>
          </div>
          <div>
            <label htmlFor="tour-passo-descricao" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Descrição</label>
            <textarea id="tour-passo-descricao" value={passo.descricao} maxLength={200} onChange={e => definir('descricao')(e.target.value)} placeholder="Instrução exibida ao usuário neste passo" rows={3} className={`${field} resize-none`} />
            <p className="mt-1 text-right text-[10px] text-outline">{passo.descricao.length}/200</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tour-passo-tipo" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Tipo de seletor <span className="text-error">*</span></label>
              <Select id="tour-passo-tipo" value={passo.seletor_tipo} onChange={definir('seletor_tipo')} options={SELETOR_TIPOS} size="sm" />
              <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">{legendaTipoSeletor(passo.seletor_tipo)}</p>
            </div>
            <div>
              <label htmlFor="tour-passo-seletor" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Seletor <span className="text-error">*</span></label>
              <input id="tour-passo-seletor" value={passo.seletor} onChange={e => definir('seletor')(normalizarSeletorInput(passo.seletor_tipo, e.target.value))} placeholder={passo.seletor_tipo === 'css' ? '#botao-novo-agendamento' : passo.seletor_tipo === 'id' ? 'novo-agendamento-btn' : passo.seletor_tipo === 'area' ? '.filtros-agenda' : 'novo-agendamento-btn'} className={`${field} font-mono text-[13px]`} />
              <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">{passo.seletor_tipo === 'data_cy' ? 'Somente o valor do data-cy.' : passo.seletor_tipo === 'id' ? 'Somente o valor do id.' : passo.seletor_tipo === 'area' ? 'Seletor CSS do container que representa o grupo.' : 'Seletor CSS completo.'}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <button type="button" onClick={() => onCopiarSeletor(indice)} disabled={!passo.seletor.trim()} className="min-h-10 rounded-lg px-2 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"><span className="material-symbols-outlined mr-1 text-[13px]">{copiadoPasso?.index === indice && copiadoPasso.tipo === 'seletor' ? 'check' : 'content_copy'}</span>{copiadoPasso?.index === indice && copiadoPasso.tipo === 'seletor' ? 'Copiado!' : 'Copiar seletor'}</button>
                <button type="button" onClick={() => onCopiarComando(indice)} disabled={!passo.seletor.trim()} title="Copia um comando para diagnosticar o seletor na tela real." className="min-h-10 rounded-lg px-2 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"><span className="material-symbols-outlined mr-1 text-[13px]">{copiadoPasso?.index === indice && copiadoPasso.tipo === 'comando' ? 'check' : 'terminal'}</span>{copiadoPasso?.index === indice && copiadoPasso.tipo === 'comando' ? 'Copiado!' : 'Testar seletor'}</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label htmlFor="tour-passo-posicao" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Posição do tooltip</label><Select id="tour-passo-posicao" value={passo.tooltip_posicao} onChange={definir('tooltip_posicao')} options={TOOLTIP_POSICOES} size="sm" /></div>
            <div><label htmlFor="tour-passo-acao" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Ação ao clicar em Próximo</label><Select id="tour-passo-acao" value={passo.acao_ao_avancar} onChange={definir('acao_ao_avancar')} options={ACOES_AO_AVANCAR} size="sm" /><p className="mt-1 text-[11px] text-on-surface-variant">Apenas avança ou também clica no elemento destacado.</p></div>
          </div>
          <div>
            <label htmlFor="tour-passo-modo" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Como avançar este passo?</label>
            <Select id="tour-passo-modo" value={passo.modo_avanco_interacao} onChange={definir('modo_avanco_interacao')} options={MODOS_AVANCO_INTERACAO} size="sm" />
            <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">No modo manual, o usuário usa Próximo. Nos demais, o widget aguarda a interação configurada.</p>
          </div>
          {MODOS_AVANCO_COM_CONFIRMACAO.includes(passo.modo_avanco_interacao) && <div><label htmlFor="tour-passo-confirmacao" className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Seletor de confirmação <span className="text-error">*</span></label><input id="tour-passo-confirmacao" value={passo.seletor_confirmacao} onChange={e => definir('seletor_confirmacao')(e.target.value)} placeholder='[data-cy="overlay-aberto"] ou .dropdown-aberto' className={`${field} font-mono text-[13px]`} /><p className="mt-1 text-[11px] text-on-surface-variant">Elemento que deve aparecer ou sumir antes de avançar.</p></div>}
          <AlertasConfiguracaoPasso passo={passo} />
        </div>
      </section>
    </div>
  )
}

export function TourForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const podeGerenciarConfiguracoes = podeGerenciarModulo(user, 'CONFIGURACOES')

  const [form, setForm] = useState<FormState>(EMPTY)
  const [passos, setPassos] = useState<PassoState[]>([{ ...PASSO_VAZIO }])
  // [] = sem segmentação (todos os contextos elegíveis). O modo visual fica
  // separado para que "Por cliente" e "Por perfil" apareçam antes de haver
  // valores preenchidos nos campos.
  const [regrasSegmentacao, setRegrasSegmentacao] = useState<RegraSegmentacaoTour[]>([])
  const [modoSegmentacao, setModoSegmentacao] = useState<ModoSegmentacaoTour>('todos')
  const [confirmarImpactoJornada, setConfirmarImpactoJornada] = useState(false)
  const [loadingTour, setLoadingTour] = useState(isEdit)
  // Fase 6E — só relevante na criação (isEdit=false): busca resumo.total
  // (mesmo endpoint paginado já usado em tours/Index.tsx, ver
  // server/src/controllers/tours.ts listar()) pra saber se o trial já
  // bateu no limite antes de liberar o formulário — sem endpoint novo,
  // pageSize=1 só pra não trazer os tours inteiros à toa.
  const [carregandoLimite, setCarregandoLimite] = useState(!isEdit)
  const [limiteTours, setLimiteTours] = useState<LimiteTrialInfo>(LIMITE_TRIAL_NAO_ATINGIDO)
  // Separado de `error` (usado só para validação/erro de salvar) de
  // propósito — sem essa separação, uma falha no GET /tours/:id ainda
  // renderizava o formulário normalmente, caindo no PASSO_VAZIO default (só
  // 1 passo em branco) e parecendo "os passos não carregaram" mesmo que o
  // tour real tivesse vários — e "Salvar" nesse estado substituiria os
  // passos existentes pelo que estivesse preenchido ali. Ver render mais
  // abaixo: com loadError, o formulário nem chega a aparecer.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [revisaoAberta, setRevisaoAberta] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copiadoPasso, setCopiadoPasso] = useState<{ index: number; tipo: 'seletor' | 'comando' } | null>(null)
  const [passoSelecionado, setPassoSelecionado] = useState(0)
  // Assim como no construtor de Campanhas, a criação já começa nas opções de
  // distribuição. O nome fica fixo no topo do dock e não depende da aba ativa.
  const [secaoConfiguracao, setSecaoConfiguracao] = useState<SecaoConfiguracaoTour>('exibicao')

  // ─── Veio do Dashboard (Funil por passo → "Editar passo", ?passo=N) ────
  // Só rola/destaca a lista de passos uma vez, na carga inicial — nunca de
  // novo por causa de edição normal (adicionar/mover/remover passo), que
  // também muda `passos`. Ver efeito logo abaixo de carregarTour.
  const passoRefs = useRef<Array<HTMLDivElement | null>>([])
  const [passoDestacado, setPassoDestacado] = useState<number | null>(null)
  const scrollParaPassoFeitoRef = useRef(false)

  // ─── Editar fluxo no sistema (gravador, só na edição) ──────────────────
  const [urlInicialGravador, setUrlInicialGravador] = useState('')
  const [erroGravador, setErroGravador] = useState<string | null>(null)
  const [urlGravadorGerada, setUrlGravadorGerada] = useState<string | null>(null)
  const [jsonColadoTexto, setJsonColadoTexto] = useState('')
  const [erroColar, setErroColar] = useState<string | null>(null)
  const [avisoColar, setAvisoColar] = useState<string | null>(null)
  const [substituidoOk, setSubstituidoOk] = useState(false)
  // "Atualizar Tour existente" (atualizarTourComPassosColados) — estado
  // separado de erroColar/substituidoOk (que são só do "Substituir passos"
  // local) porque esta ação chama o backend de verdade.
  const [atualizandoTour, setAtualizandoTour] = useState(false)
  const [erroAtualizarTour, setErroAtualizarTour] = useState<string | null>(null)
  const [tourAtualizadoOk, setTourAtualizadoOk] = useState(false)
  // "Testar estes passos" (testarPassosColados) — preview sem persistência,
  // não mexe em erroColar/erroAtualizarTour (ações independentes).
  const [erroTestarPassos, setErroTestarPassos] = useState<string | null>(null)
  const [urlPreviewGerada, setUrlPreviewGerada] = useState<string | null>(null)
  // null = ainda não tentou abrir o gravador nesta visita à página.
  const [statusGravador, setStatusGravador] = useState<GravadorUrlResultado['status'] | null>(null)
  // Guarda a URL calculada quando status é 'excedeu_limite' — não é aberta
  // automaticamente (abriria o gravador vazio sem aviso), mas fica pronta
  // pro botão "Abrir mesmo assim" caso o usuário prefira gravar um fluxo novo
  // em vez de editar os passos existentes diretamente na lista abaixo.
  const [urlGravadorPendente, setUrlGravadorPendente] = useState<string | null>(null)
  const [copiadoPassosGravador, setCopiadoPassosGravador] = useState(false)

  // Alimenta os seletores de sistema/tela e o catálogo de domínios da regra de
  // segmentação campo "dominio" (ver CampoDominiosRegra abaixo).
  const [sistemasConfig, setSistemasConfig] = useState<Sistema[]>([])
  const [catalogoTelas, setCatalogoTelas] = useState<TelaCatalogo[]>([])
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null)
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [modalNovaTelaAberto, setModalNovaTelaAberto] = useState(false)
  const [formNovaTela, setFormNovaTela] = useState(TELA_CATALOGO_EMPTY_FORM)
  const [salvandoNovaTela, setSalvandoNovaTela] = useState(false)
  const [erroNovaTela, setErroNovaTela] = useState<string | null>(null)
  const carregarCatalogo = useCallback((sinal: { cancelado: boolean } = { cancelado: false }) => {
    setCarregandoCatalogo(true)
    setErroCatalogo(null)
    Promise.all([
      get<Sistema[]>('/sistemas?ativo=true'),
      get<TelaCatalogo[]>('/catalogo-telas?ativo=true'),
    ]).then(([sistemas, telas]) => {
      if (sinal.cancelado) return
      setSistemasConfig(sistemas)
      setCatalogoTelas(telas)
      if (!isEdit) {
        const sistemaPadrao = sistemas.find(sistema => sistema.padrao && sistema.ativo) ?? sistemas[0]
        if (sistemaPadrao) setForm(prev => prev.sistema.trim() ? prev : { ...prev, sistema: sistemaPadrao.identificador })
      }
    }).catch(error => {
      if (!sinal.cancelado) setErroCatalogo(error instanceof Error ? error.message : 'Não foi possível carregar sistemas e telas.')
    }).finally(() => {
      if (!sinal.cancelado) setCarregandoCatalogo(false)
    })
  }, [isEdit])

  useEffect(() => {
    const sinal = { cancelado: false }
    carregarCatalogo(sinal)
    return () => { sinal.cancelado = true }
  }, [carregarCatalogo])

  // Fase 6E — ver comentário de carregandoLimite/limiteTours acima.
  useEffect(() => {
    if (isEdit) return
    get<TourGuiadoListaPaginada>('/tours?page=1&pageSize=1')
      .then(data => {
        setLimiteTours(limiteTrial(user?.tenant.plano, user?.tenant.plano?.limite_tours_ativos, data.resumo.total, 'tour'))
      })
      .catch(() => {})
      .finally(() => setCarregandoLimite(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

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
          ativo: t.ativo && (t.permite_autonomo ?? t.ativo),
          permite_autonomo: t.permite_autonomo ?? t.ativo,
          permite_jornada: t.permite_jornada ?? true,
          publico_geral: !(t.segmentacao_regras?.length),
          gatilhos: t.gatilhos ?? [],
          frequencia: t.frequencia ?? 'uma_vez_por_usuario',
          frequencia_intervalo_dias: t.frequencia_intervalo_dias != null ? String(t.frequencia_intervalo_dias) : '',
        })
        // Preserva a ordem já retornada pela API (buscarPorId ordena por
        // `ordem` — ver include em tours.ts) e o id de cada passo existente
        // (usado só pra exibir/copiar; o PUT sempre substitui a lista
        // inteira, não casa por id — ver handleSubmit).
        //
        // Cada passo é transformado isoladamente (try/catch por item, não um
        // único .map() para a lista inteira) — um passo com formato
        // inesperado (dado legado, campo em formato diferente) não pode
        // descartar TODOS os outros só porque um deles falhou.
        const passosRecebidos = t.passos ?? []
        const passosTransformados = passosRecebidos
          .map((p): PassoState | null => {
            try {
              return {
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
              }
            } catch (erroPasso) {
              const motivo = erroPasso instanceof Error ? erroPasso.message : String(erroPasso)
              // eslint-disable-next-line no-console
              console.error('[tours/Form] passo descartado por formato inesperado', { tourId, passo: p, motivo })
              return null
            }
          })
          .filter((p): p is PassoState => p !== null)
        // Só cai no fallback de "nenhum passo preenchido ainda" quando a API
        // de fato não devolveu nenhum passo — se ela devolveu passos mas
        // TODOS falharam a transformação (formato inesperado em massa), isso
        // é sinalizado como erro de carregamento em vez de simular um tour
        // vazio (que o usuário poderia salvar por cima, apagando os
        // originais de verdade).
        if (passosRecebidos.length > 0 && passosTransformados.length === 0) {
          setLoadError('Os passos deste tour vieram em um formato inesperado e não puderam ser carregados. Nenhuma alteração foi salva — contate o suporte antes de tentar editar este tour.')
          return
        }
        const caiuEmPassoVazio = passosTransformados.length === 0
        setPassos(caiuEmPassoVazio ? [{ ...PASSO_VAZIO }] : passosTransformados)
        setPassoSelecionado(0)
        const regrasRecebidas = t.segmentacao_regras ?? []
        setRegrasSegmentacao(regrasRecebidas)
        setModoSegmentacao(resolverModoSegmentacaoTour(regrasRecebidas))
      })
      .catch(e => {
        if (sinal.cancelado) return
        const mensagem = e instanceof Error ? e.message : 'Não foi possível carregar o tour guiado.'
        // Mensagem real do erro (ver services/api.ts) em vez de um texto fixo
        // de "não encontrado" — um erro de rede/servidor não é a mesma coisa
        // que o tour genuinamente não existir.
        setLoadError(mensagem)
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

  // Rola até o passo (?passo=N, vindo de "Editar passo" no Funil por passo do
  // Dashboard) e destaca por alguns segundos — só depois que o tour real
  // carregou (loadingTour=false, sem loadError), nunca em criação de Tour
  // novo, e só uma vez (scrollParaPassoFeitoRef) pra não disparar de novo
  // quando `passos` muda por edição comum. passo inexistente/inválido (fora
  // do intervalo, não numérico, ausente) é ignorado silenciosamente.
  useEffect(() => {
    if (!isEdit || loadingTour || loadError || scrollParaPassoFeitoRef.current) return
    scrollParaPassoFeitoRef.current = true
    const passoParam = new URLSearchParams(location.search).get('passo')
    // !passoParam cobre ausente (null) e vazio ('') — Number('') seria 0
    // (primeiro passo) por acaso, o que não é a intenção de um valor vazio.
    if (!passoParam) return
    const indice = Number(passoParam)
    if (!Number.isInteger(indice) || indice < 0 || indice >= passos.length) return
    setPassoSelecionado(indice)
    const raf = window.requestAnimationFrame(() => {
      passoRefs.current[indice]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setPassoDestacado(indice)
      window.setTimeout(() => {
        setPassoDestacado(prev => (prev === indice ? null : prev))
      }, 2500)
    })
    return () => window.cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, loadingTour, loadError])

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const sistemaSelecionado = form.sistema.trim()
  const telasDoSistema = catalogoTelas.filter(tela => tela.sistema === sistemaSelecionado)
  const telaSelecionada = telasDoSistema.find(tela =>
    tela.modo_identificacao === form.modo_identificacao &&
    (tela.tela ?? '') === form.tela &&
    (tela.url_contem ?? '') === form.url_contem &&
    (tela.data_cy ?? '') === form.data_cy
  )

  const selecionarTelaCatalogo = (telaId: string) => {
    const tela = catalogoTelas.find(item => item.id === telaId)
    if (!tela) return
    setForm(prev => ({
      ...prev,
      sistema: tela.sistema,
      modo_identificacao: tela.modo_identificacao,
      tela: tela.tela ?? '',
      url_contem: tela.url_contem ?? '',
      data_cy: tela.data_cy ?? '',
    }))
  }

  const abrirModalNovaTela = (busca?: string) => {
    const sistemaConfig = sistemasConfig.find(sistema => sistema.identificador === sistemaSelecionado)
    const nomeInicial = busca?.trim() ?? form.tela.trim()
    setErroNovaTela(null)
    setFormNovaTela({
      ...TELA_CATALOGO_EMPTY_FORM,
      nome: nomeInicial,
      sistema_id: sistemaConfig?.id ?? '',
      sistema: sistemaSelecionado,
      modo_identificacao: 'sistema_tela',
      tela: nomeInicial,
    })
    setModalNovaTelaAberto(true)
  }

  const usarTelaCriada = (tela: TelaCatalogo) => {
    setCatalogoTelas(prev => [tela, ...prev.filter(item => item.id !== tela.id)])
    setForm(prev => ({
      ...prev,
      sistema: tela.sistema,
      modo_identificacao: tela.modo_identificacao,
      tela: tela.tela ?? '',
      url_contem: tela.url_contem ?? '',
      data_cy: tela.data_cy ?? '',
    }))
    setModalNovaTelaAberto(false)
  }

  const salvarNovaTela = async (event: React.FormEvent) => {
    event.preventDefault()
    setErroNovaTela(null)
    setSalvandoNovaTela(true)
    try {
      const urlConterNormalizada = normalizarPathUrl(formNovaTela.url_contem)
      if (formNovaTela.modo_identificacao === 'url_contem' && !pathUrlValido(urlConterNormalizada)) {
        setErroNovaTela('Informe apenas um caminho relativo, como /app/faturamento.')
        return
      }
      const criada = await post<TelaCatalogo>('/catalogo-telas', {
        ...formNovaTela,
        sistema: sistemasConfig.find(sistema => sistema.id === formNovaTela.sistema_id)?.identificador ?? formNovaTela.sistema,
        tela: formNovaTela.tela.trim() || null,
        url_contem: urlConterNormalizada || null,
        data_cy: formNovaTela.data_cy.trim() || null,
      })
      usarTelaCriada(criada)
    } catch (err) {
      setErroNovaTela(err instanceof Error ? err.message : 'Erro ao criar tela.')
    } finally {
      setSalvandoNovaTela(false)
    }
  }

  // ─── Segmentação por contexto ──────────────────────────────────────────
  const segmentado = regrasSegmentacao.length > 0
  const regrasSegmentacaoAvancadas = regrasSegmentacao.filter(regra => !CAMPOS_SEGMENTACAO_CAMPANHAS.includes(regra.campo as CampoSegmentacaoTour))

  const atualizarCampoSegmentacao = (campo: CampoSegmentacaoTour, valores: string[]) => {
    setRegrasSegmentacao(prev => [
      ...prev.filter(regra => regra.campo !== campo),
      ...(valores.length > 0 ? [{ campo, operador: 'em_lista' as const, valor: valores.join(',') }] : []),
    ])
  }

  const selecionarModoSegmentacao = (modo: ModoSegmentacaoTour) => {
    setModoSegmentacao(modo)
    setRegrasSegmentacao(prev => {
      const camposParaLimpar = modo === 'todos'
        ? [...CAMPOS_SEGMENTACAO_CLIENTE, ...CAMPOS_SEGMENTACAO_PERFIL, 'dominio']
        : modo === 'cliente'
          ? CAMPOS_SEGMENTACAO_PERFIL
          : modo === 'perfil'
            ? CAMPOS_SEGMENTACAO_CLIENTE
            : []
      return prev.filter(regra => !camposParaLimpar.includes(regra.campo as CampoSegmentacaoTour))
    })
  }

  useEffect(() => {
    setForm(prev => ({ ...prev, publico_geral: regrasSegmentacao.length === 0 }))
  }, [regrasSegmentacao.length])

  const setPasso = (index: number, key: keyof PassoState, value: string) =>
    setPassos(prev => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)))

  const addPasso = () => {
    setPassoSelecionado(passos.length)
    setPassos(prev => [...prev, { ...PASSO_VAZIO }])
  }

  // Cópia sem o id do original — é um passo novo, ainda não salvo. A ordem é
  // recalculada automaticamente no submit (payload envia os passos na ordem do
  // array, e o backend atribui `ordem` pela posição recebida).
  const duplicarPasso = (index: number) => {
    setPassoSelecionado(index + 1)
    setPassos(prev => {
      const original = prev[index]
      if (!original) return prev
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
  }

  const removePasso = (index: number) => {
    if (passos.length === 1) return
    setPassoSelecionado(prev => prev === index ? Math.min(index, passos.length - 2) : prev > index ? prev - 1 : prev)
    setPassos(prev => prev.filter((_, i) => i !== index))
  }

  const movePasso = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= passos.length) return
    setPassoSelecionado(prev => prev === index ? target : prev === target ? index : prev)
    setPassos(prev => {
      const next = [...prev]
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const reordenarPasso = (origem: number, destino: number) => {
    if (origem === destino || origem < 0 || destino < 0 || origem >= passos.length || destino >= passos.length) return
    setPassos(prev => {
      const next = [...prev]
      const [movido] = next.splice(origem, 1)
      next.splice(destino, 0, movido)
      return next
    })
    setPassoSelecionado(prev => prev === origem ? destino : prev > origem && prev <= destino ? prev - 1 : prev < origem && prev >= destino ? prev + 1 : prev)
  }

  // Mesmo formato usado tanto pra montar up_rec_passos (buildGravadorUrl)
  // quanto pro botão "Copiar passos atuais (JSON)" abaixo — um só lugar pra
  // não desalinhar os dois.
  const passosParaGravadorPayload = (lista: PassoState[] = passos) =>
    lista
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
      }))

  // Abre o gravador de fluxo (mesma URL/mecanismo de TourGravador.tsx) numa
  // nova aba, levando titulo/descricao/sistema/prioridade + os passos atuais
  // do tour (up_rec_passos) — o gravador (widget.js/recorderLerPassosIniciais)
  // pré-carrega a lista lateral com eles em vez de iniciar vazio.
  //
  // Quando o payload dos passos existentes é grande demais pra caber na URL
  // (status 'excedeu_limite'), NÃO abrimos a aba automaticamente — abriria o
  // gravador vazio sem nenhum aviso, dando a impressão de que os passos
  // salvos sumiram. Em vez disso guardamos a URL em urlGravadorPendente e
  // mostramos um aviso explicando a situação, com duas saídas: editar os
  // passos existentes direto na lista "Passos do tour" abaixo (não precisa do
  // gravador pra isso), ou abrir o gravador vazio mesmo assim pra gravar um
  // fluxo novo (botão "Abrir mesmo assim" no aviso).
  const abrirGravador = () => {
    setErroGravador(null)
    setUrlGravadorGerada(null)
    setUrlGravadorPendente(null)
    setStatusGravador(null)
    if (!urlInicialGravador.trim()) {
      setErroGravador('Informe a URL inicial — a página real do sistema onde o fluxo deste tour começa.')
      return
    }
    let resultado: GravadorUrlResultado
    try {
      resultado = buildGravadorUrl({
        urlInicial: urlInicialGravador.trim(),
        titulo: form.titulo,
        descricao: form.descricao,
        sistema: form.sistema,
        prioridade: Number(form.prioridade || 0),
        passos: passosParaGravadorPayload(),
        // abrirGravador só existe dentro da seção "Editar fluxo no sistema",
        // que só aparece quando isEdit — ou seja, sempre a partir de um Tour
        // já existente. Não confundir com "tinha passos": um Tour existente
        // recém-criado, ainda sem nenhum passo salvo, também é edição de Tour
        // existente (o painel final do gravador deve orientar "atualizar",
        // não "criar novo", mesmo nesse caso).
        tourExistente: true,
      })
    } catch {
      setErroGravador('URL inicial inválida — use uma URL completa, ex: https://meusistema.com/app/agenda')
      return
    }
    setStatusGravador(resultado.status)
    if (resultado.status === 'excedeu_limite') {
      setUrlGravadorPendente(resultado.url)
      return
    }
    setUrlGravadorGerada(resultado.url)
    window.open(resultado.url, '_blank', 'noopener')
  }

  // Só usado a partir do aviso de "excedeu o limite" — o usuário decidiu
  // conscientemente abrir mesmo sabendo que o gravador começa vazio.
  const abrirGravadorMesmoAssim = () => {
    if (!urlGravadorPendente) return
    setUrlGravadorGerada(urlGravadorPendente)
    window.open(urlGravadorPendente, '_blank', 'noopener')
  }

  // Alternativa segura ao gravador quando os passos não couberam na URL: os
  // passos atuais nunca são alterados por essa ação, só copiados — mesmo
  // envelope "userpulse.tour.v1" aceito por "Colar passos gravados" abaixo,
  // pra poder reimportar (aqui ou em outro tour) sem reescrever nada à mão.
  const copiarPassosAtuaisGravador = () => {
    const payload = { formato: 'userpulse.tour.v1', tour: { passos: passosParaGravadorPayload() } }
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {})
    setCopiadoPassosGravador(true)
    window.setTimeout(() => setCopiadoPassosGravador(false), 2000)
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

  // "Atualizar Tour existente" — MVP pra fechar o ciclo do gravador sem
  // depender de "Substituir passos" (que só mexe no estado local) + "Salvar"
  // (lá em cima) como dois passos manuais separados. Faz as duas coisas de
  // uma vez a partir do MESMO JSON colado: valida (extrairPassosDoJson, igual
  // a substituirPassosDoJson acima), pede confirmação simples (window.confirm
  // — o usuário já viu o JSON no textarea antes disso, então a confirmação é
  // só a última checagem, não a única exposição ao conteúdo) e envia direto
  // pro PUT autenticado que o admin já usa (mesmo endpoint/token de sempre —
  // nada de nova rota nem de o gravador falar com o backend). título,
  // sistema, tela, prioridade e segmentação vêm do estado atual do
  // formulário (montarPayloadTour) — só a lista de passos é trocada. Se o PUT
  // falhar, não mexe em `passos` nem em `jsonColadoTexto`: nada capturado é
  // perdido, o usuário pode tentar de novo.
  //
  // Deliberadamente NÃO usa postMessage/window.opener a partir do gravador:
  // ver comentário em "Copiar e abrir importação" no widget.js — mensagens
  // cross-origin vindas da página do sistema cliente exigiriam confiar que
  // aquela página não está comprometida, e essa confiança não existe hoje em
  // nenhum outro ponto do fluxo. O JSON sempre passa primeiro pela área de
  // transferência e pelo textarea, sob o controle da própria aba do admin.
  const atualizarTourComPassosColados = async () => {
    setErroAtualizarTour(null)
    setTourAtualizadoOk(false)
    const resultado = extrairPassosDoJson(jsonColadoTexto)
    if ('erro' in resultado) {
      setErroAtualizarTour(resultado.erro)
      return
    }
    const confirmado = window.confirm(
      `Atualizar este tour com os ${resultado.passos.length} passo(s) colados? ` +
      'Isso substitui a lista de passos atual. Título, sistema, prioridade e demais configurações continuam como estão.'
    )
    if (!confirmado) return
    setAtualizandoTour(true)
    try {
      await put<TourGuiado>(`/tours/${id}`, montarPayloadTour(resultado.passos))
      setPassos(resultado.passos)
      setJsonColadoTexto('')
      setTourAtualizadoOk(true)
      window.setTimeout(() => setTourAtualizadoOk(false), 4000)
    } catch (e) {
      setErroAtualizarTour(e instanceof Error ? e.message : 'Não foi possível atualizar o tour. Tente novamente.')
    } finally {
      setAtualizandoTour(false)
    }
  }

  // "Testar estes passos" — preview real do JSON colado, sem salvar nada em
  // lugar nenhum (nem aqui no admin, nem no banco). Mesmo mecanismo de
  // URL/compactação de abrirGravador (buildPreviewUrl reaproveita
  // encodePassosBase64Url), só que com parâmetros próprios
  // (userpulse_preview/up_preview_passos) que widget.js reconhece como "só
  // rode este tour temporário em memória" — nunca ativa o gravador, nunca
  // persiste em sessionStorage, nunca gera evento (tourState.preview=true
  // suprime isso sozinho, ver iniciarPreviewSeNecessario em widget.js). Não
  // chama setPassos em nenhum momento — o estado atual do formulário nunca
  // muda só por testar.
  const testarPassosColados = () => {
    setErroTestarPassos(null)
    setUrlPreviewGerada(null)
    const resultado = extrairPassosDoJson(jsonColadoTexto)
    if ('erro' in resultado) {
      setErroTestarPassos(resultado.erro)
      return
    }
    if (!urlInicialGravador.trim()) {
      setErroTestarPassos('Informe a URL inicial — a página real do sistema onde este tour começa — antes de testar.')
      return
    }
    let previewResultado: PreviewUrlResultado
    try {
      previewResultado = buildPreviewUrl({
        urlInicial: urlInicialGravador.trim(),
        titulo: form.titulo,
        passos: passosParaGravadorPayload(resultado.passos),
      })
    } catch {
      setErroTestarPassos('URL inicial inválida — use uma URL completa, ex: https://meusistema.com/app/agenda')
      return
    }
    if (previewResultado.status === 'excedeu_limite') {
      setErroTestarPassos(
        `Os ${resultado.passos.length} passo(s) colados são grandes demais para testar pela URL. ` +
        'Use "Editar fluxo no sistema" acima e "Pré-visualizar tour" dentro do gravador para testar um fluxo grande.'
      )
      return
    }
    setUrlPreviewGerada(previewResultado.url)
    window.open(previewResultado.url, '_blank', 'noopener')
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

  // Mesmo payload usado pelo "Salvar" normal (handleSubmit) e pela ação
  // rápida "Atualizar Tour existente" (atualizarTourComPassosColados, na
  // seção "Editar fluxo no sistema") — só os passos mudam entre os dois;
  // título, sistema, tela, prioridade, ativo (exibição autônoma) e
  // segmentação sempre vêm do estado atual do formulário
  // (form/regrasSegmentacao), nunca do gravador. `...form` já inclui
  // `ativo` com o valor real escolhido no formulário — nunca hardcoded.
  const montarPayloadTour = (passosParaEnviar: PassoState[]) => ({
    ...form,
    descricao: form.descricao || null,
    tela: form.modo_identificacao === 'sistema_tela' ? form.tela : '',
    data_cy: form.modo_identificacao === 'data_cy' ? form.data_cy : null,
    url_contem: form.modo_identificacao === 'url_contem' ? form.url_contem : null,
    prioridade: Number(form.prioridade || 0),
    permite_autonomo: form.permite_autonomo,
    permite_jornada: form.permite_jornada,
    publico_geral: !segmentado,
    gatilhos: form.gatilhos,
    frequencia: form.frequencia,
    frequencia_intervalo_dias: form.frequencia === 'intervalo_dias' ? Number(form.frequencia_intervalo_dias) : null,
    segmentacao_regras: segmentado
      ? regrasSegmentacao.map(r => ({ campo: r.campo, operador: r.operador, valor: r.valor.trim() }))
      : null,
    ...(confirmarImpactoJornada && { confirmar_impacto: true }),
    passos: passosParaEnviar.map(p => ({
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
  })

  const alterarPermissaoJornada = async (permitir: boolean) => {
    if (permitir || !id) {
      setConfirmarImpactoJornada(false)
      set('permite_jornada', permitir)
      return
    }
    try {
      const dependencias = await get<TourDependenciaJornada[]>(`/tours/${id}/dependencias`)
      if (dependencias.length > 0 && !window.confirm(`Este Tour é usado em ${dependencias.length} etapa(s):\n\n${dependencias.map(item => `${item.jornada_titulo} · ${item.bloco_titulo} · ${item.etapa_titulo}`).join('\n')}\n\nDeseja remover a permissão de Jornada?`)) return
      setConfirmarImpactoJornada(dependencias.length > 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o impacto nas Jornadas.')
      return
    }
    set('permite_jornada', false)
  }

  const focarEditorPassos = () => {
    document.getElementById('tour-passos-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const confirmarSalvar = async () => {
    setRevisaoAberta(false)
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const payload = montarPayloadTour(passos)
      const saved = isEdit
        ? await put<TourGuiado>(`/tours/${id}`, payload)
        : await post<TourGuiado>('/tours', payload)

      if (isEdit) {
        setSuccess(true)
        setConfirmarImpactoJornada(false)
      } else {
        navigate(`/tours/${saved.id}/editar`, { state: { justSaved: true } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o tour guiado. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.titulo.trim()) {
      setSecaoConfiguracao('geral')
      setError('Informe o título do tour.')
      return
    }
    if (!form.sistema.trim()) {
      setSecaoConfiguracao('geral')
      setError('Informe o sistema onde o tour será executado.')
      return
    }
    const destinoVazio = form.modo_identificacao === 'data_cy' ? !form.data_cy.trim()
      : form.modo_identificacao === 'url_contem' ? !form.url_contem.trim() : !form.tela.trim()
    if (form.permite_autonomo && destinoVazio) {
      setSecaoConfiguracao('geral')
      setError('Informe o destino do tour para o modo de identificação escolhido.')
      return
    }
    if (passos.length === 0 || passos.some(p => !p.titulo.trim())) {
      focarEditorPassos()
      setError('Todo passo precisa de título preenchido.')
      return
    }
    if (!form.permite_autonomo && !form.permite_jornada) {
      setSecaoConfiguracao('exibicao')
      setError('Habilite ao menos uma origem: execução independente ou etapa de Jornada.')
      return
    }
    if (form.ativo && !form.permite_autonomo) {
      setSecaoConfiguracao('exibicao')
      setError('A exibição autônoma só pode ficar ativa quando a execução independente está habilitada.')
      return
    }
    // Seletor só é exigido para ativar a exibição autônoma — com ela
    // inativa, o tour pode ficar com seletores vazios enquanto os passos são
    // revisados e ainda assim ser salvo e usado numa Jornada.
    if (form.ativo && passos.some(p => !p.seletor.trim())) {
      focarEditorPassos()
      setError('Para ativar a exibição autônoma deste tour, todos os passos precisam ter um seletor/data-cy informado.')
      return
    }
    if (form.ativo && passos.some(p => MODOS_AVANCO_COM_CONFIRMACAO.includes(p.modo_avanco_interacao) && !p.seletor_confirmacao.trim())) {
      focarEditorPassos()
      setError('Para ativar a exibição autônoma, os passos com avanço "quando outro elemento aparecer/sumir" precisam do seletor de confirmação.')
      return
    }
    if (segmentado && regrasSegmentacao.some(r => !r.campo || !r.valor.trim())) {
      setSecaoConfiguracao('segmentacao')
      setError('Toda regra de segmentação precisa de campo e valor preenchidos.')
      return
    }
    setError(null)
    setRevisaoAberta(true)
  }

  if (loadingTour || carregandoLimite || carregandoCatalogo) return <div className="px-4 lg:px-margin-desktop py-stack-md"><LoadingSpinner /></div>

  // Fase 6E — trial no limite: bloqueia acesso direto à rota /tours/novo
  // (nunca a edição — isEdit já exclui esse caso). Mesma mensagem usada pelo
  // backend (que continua validando de verdade no POST) e pelo botão "Novo
  // Tour Guiado" da listagem (ver tours/Index.tsx).
  if (!isEdit && limiteTours.atingido) {
    return (
      <div className="px-4 lg:px-margin-desktop py-10">
        <EmptyState
          icon="lock"
          title="Limite do teste grátis atingido"
          description={limiteTours.mensagem!}
          action={<Button onClick={() => navigate('/tours')}>Voltar para Tours</Button>}
        />
      </div>
    )
  }

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

  if (erroCatalogo) {
    return (
      <div className="px-4 lg:px-margin-desktop py-stack-md">
        <ErrorState message={erroCatalogo} onRetry={() => carregarCatalogo()} />
      </div>
    )
  }

  const itensRevisao = montarChecklist(form, passos)
  const temPendenciaCritica = itensRevisao.some(item => item.status === 'critico')
  const temAvisoRevisao = itensRevisao.some(item => item.status === 'aviso')
  const classeBotaoRevisao = temPendenciaCritica
    ? '!bg-error !text-on-error'
    : temAvisoRevisao
      ? '!bg-[#e65100] !text-white'
      : '!bg-tertiary !text-on-tertiary'

  return (
    <div className="relative space-y-5 pt-6 pb-8 xl:pr-3">
      {/* Page action bar */}
      <div className="mx-auto w-full max-w-[1600px] rounded-3xl border border-outline-variant bg-surface-bright px-6 py-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">
              {isEdit ? 'Editar Tour Guiado' : 'Novo Tour Guiado'}
            </h2>
            <p className="text-body-md text-on-surface-variant mt-0.5">
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
            <Button
              type="button"
              onClick={() => navigate('/tours')}
              variant="ghost"
            >
              Cancelar
            </Button>
             {isEdit && (
              <Button
                type="button"
                onClick={() => navigate(`/tours/${id}/preview`)}
                variant="ghost"
              >
                Testar tour
              </Button>
            )}
            {!revisaoAberta && (
              <Button
                form="tour-form"
                type="submit"
                disabled={submitting}
                size="md"
                className={classeBotaoRevisao}
                iconLeft={<span className="material-symbols-outlined text-[18px]">fact_check</span>}
              >
                {submitting ? 'Salvando…' : isEdit ? 'Revisar e salvar' : 'Revisar e criar'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="w-full px-4 pt-0 pb-5">
         <div className="mx-auto w-full max-w-[1600px]">
        {!isEdit && !form.ativo && (
          <div className="mb-5 p-3 bg-[#fff8e1] border border-[#ffe082] text-[#e65100] rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">info</span>
            Este tour começa com a exibição autônoma inativa. Teste antes de ativar; ele já pode ser usado como etapa de uma jornada normalmente.
          </div>
         )}
        {revisaoAberta && !success && (
          <div className="mb-5 rounded-3xl border border-primary/30 bg-primary/5 p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-title-md font-bold text-on-surface">
                  <span className="material-symbols-outlined text-primary">fact_check</span>
                  Revise antes de {isEdit ? 'salvar' : 'criar'}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">Confira as informações abaixo e resolva as pendências críticas antes de confirmar.</p>
              </div>
              <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${temPendenciaCritica ? 'bg-error-container text-on-error-container' : temAvisoRevisao ? 'bg-[#fff8e1] text-[#e65100]' : 'bg-tertiary/10 text-tertiary'}`}>
                {temPendenciaCritica ? 'Pendências críticas' : temAvisoRevisao ? 'Ajustes recomendados' : 'Tudo certo'}
              </span>
            </div>
            <div className="space-y-4">
              <InformacoesTour form={form} passos={passos} segmentado={segmentado} />
              <ChecklistCard form={form} passos={passos} />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-primary/20 pt-4">
              <Button type="button" variant="ghost" onClick={() => setRevisaoAberta(false)}>Continuar editando</Button>
              <Button type="button" onClick={confirmarSalvar} disabled={submitting} className={classeBotaoRevisao} iconLeft={<span className="material-symbols-outlined text-[18px]">check</span>}>
                {submitting ? 'Salvando…' : isEdit ? 'Confirmar salvamento' : 'Criar tour'}
              </Button>
            </div>
          </div>
        )}
        {success && (
          <div className="mb-5 p-4 bg-tertiary/10 rounded-xl">
            <p className="text-body-md text-tertiary font-semibold flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Tour salvo com sucesso.
            </p>
            <InformacoesTour form={form} passos={passos} segmentado={segmentado} />
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

        </div>

        {!revisaoAberta && (
        <form id="tour-form" onSubmit={handleSubmit} className="mx-auto grid min-w-0 max-w-[1600px] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
          <div className="min-w-0 space-y-4 xl:col-start-1">
             {/* Editar fluxo no sistema — só na edição */}
              {isEdit && (
              <div className={`${card} min-w-0`}>
                <CardHeader
                  icon="videocam"
                  iconBg="bg-secondary-fixed"
                  iconColor="text-secondary"
                  title="Editar fluxo no sistema"
                  description="Abra o sistema integrado para ajustar os passos deste tour visualmente."
                />
                <div className="max-w-2xl space-y-4">
                  <div>
                    <label className="mb-1.5 block text-label-md text-on-surface-variant">URL inicial</label>
                    <input
                      value={urlInicialGravador}
                      onChange={e => setUrlInicialGravador(e.target.value)}
                      placeholder="https://meusistema.com/app/agenda"
                      className={`${field} font-mono text-[13px]`}
                    />
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      A página real onde o fluxo começa (precisa já ter o widget UserPulse instalado).
                    </p>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl bg-surface-container-low p-3 text-[11px] text-on-surface-variant">
                    <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px]">info</span>
                    <span>
                      Ao clicar em &quot;Editar fluxo no sistema&quot;, os {passos.length} passo{passos.length === 1 ? '' : 's'}{' '}
                      já cadastrado{passos.length === 1 ? '' : 's'} deste tour são enviados junto — o gravador abre já
                      com eles na lista lateral, prontos para editar, remover ou completar com novos passos. Ao
                      finalizar, clique em &quot;Copiar JSON&quot; na aba do gravador e cole abaixo em &quot;Colar passos gravados&quot;
                      para trazer o resultado de volta. Os passos atuais deste formulário só mudam quando você colar e
                      clicar em &quot;Substituir passos&quot;.
                    </span>
                  </div>

                  {statusGravador === 'excedeu_limite' && (
                    <div className="flex items-start gap-2 rounded-xl border border-[#ffe082] bg-[#fff8e1] p-3 text-body-sm text-[#e65100]">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px]">warning</span>
                      <div className="space-y-2">
                        <p>
                          Este tour tem {passos.length} passo{passos.length === 1 ? '' : 's'} salvo{passos.length === 1 ? '' : 's'}, mas
                          eles excederam o limite seguro de tamanho da URL do gravador. Abrir o gravador agora faria ele
                          começar <strong>vazio</strong> — os passos salvos não seriam perdidos (continuam intactos
                          abaixo, em &quot;Passos do tour&quot;), só não apareceriam pré-carregados na lista lateral do gravador.
                        </p>
                        <p>
                          Você pode editar os passos existentes diretamente na lista &quot;Passos do tour&quot; logo abaixo (não
                          precisa do gravador pra isso), copiá-los agora como JSON antes de gravar um fluxo novo, ou
                          abrir o gravador mesmo assim sabendo que ele vai começar vazio.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={copiarPassosAtuaisGravador}
                            className="flex items-center gap-1 rounded-lg border border-[#ffe082] bg-surface-bright px-3 py-1.5 text-label-sm font-bold text-[#e65100] transition-colors hover:bg-[#fff3d6]"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {copiadoPassosGravador ? 'check' : 'content_copy'}
                            </span>
                            {copiadoPassosGravador ? 'Copiado!' : 'Copiar passos atuais (JSON)'}
                          </button>
                          <button
                            type="button"
                            onClick={abrirGravadorMesmoAssim}
                            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-label-sm font-bold text-[#e65100] transition-colors hover:bg-[#fff3d6]"
                          >
                            <span className="material-symbols-outlined text-[15px]">videocam</span>
                            Abrir gravador mesmo assim (vazio)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {erroGravador && (
                    <div className="flex items-center gap-2 rounded-xl bg-error-container p-3 text-body-md text-on-error-container">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      {erroGravador}
                    </div>
                  )}

                  {urlGravadorGerada && (
                    <div className="flex items-start gap-2 rounded-xl bg-tertiary/10 p-3 text-body-md text-tertiary">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px]">check_circle</span>
                      <span>
                        Gravação iniciada numa nova aba. Se o navegador bloqueou o pop-up, abra manualmente:{' '}
                        <a href={urlGravadorGerada} target="_blank" rel="noreferrer" className="break-all underline">{urlGravadorGerada}</a>
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={abrirGravador}
                    className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-label-md font-bold text-on-secondary shadow-md transition-all hover:opacity-90 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px]">videocam</span>
                    Editar fluxo no sistema
                  </button>

                  <div className="border-t border-outline-variant/40 pt-3">
                    <label className="mb-1.5 block text-label-md text-on-surface-variant">
                      Colar passos gravados (substitui a lista de passos abaixo)
                    </label>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={colarJsonGravador}
                        className="flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-bright px-3 py-1.5 text-label-sm font-bold text-on-surface transition-colors hover:bg-surface-container-low"
                      >
                        <span className="material-symbols-outlined text-[15px]">content_paste_go</span>
                        Colar da área de transferência
                      </button>
                      {substituidoOk && (
                        <span className="flex items-center gap-1 text-label-sm font-semibold text-tertiary">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>
                          Passos substituídos abaixo.
                        </span>
                      )}
                    </div>
                    {avisoColar && <p className="mb-2 text-[11px] text-on-surface-variant">{avisoColar}</p>}
                    <textarea
                      value={jsonColadoTexto}
                      onChange={e => setJsonColadoTexto(e.target.value)}
                      rows={6}
                      placeholder='{"formato":"userpulse.tour.v1","tour":{"passos":[...]}}'
                      className={`${field} resize-none font-mono text-[12px]`}
                    />
                    {erroColar && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        {erroColar}
                      </div>
                    )}
                    {erroAtualizarTour && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        {erroAtualizarTour}
                      </div>
                    )}
                    {tourAtualizadoOk && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-tertiary/10 p-3 text-body-sm text-tertiary">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        Tour atualizado com sucesso.
                      </div>
                    )}
                    {erroTestarPassos && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-error-container p-3 text-body-sm text-on-error-container">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        {erroTestarPassos}
                      </div>
                    )}
                    {urlPreviewGerada && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-tertiary/10 p-3 text-body-sm text-tertiary">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">check_circle</span>
                        <span>
                          Teste iniciado numa nova aba — nada foi salvo. Se o navegador bloqueou o pop-up, abra
                          manualmente:{' '}
                          <a href={urlPreviewGerada} target="_blank" rel="noreferrer" className="break-all underline">{urlPreviewGerada}</a>
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={testarPassosColados}
                        disabled={!jsonColadoTexto.trim()}
                        title="Roda os passos colados como um tour temporário na URL informada acima, direto no sistema real — sem salvar nada aqui nem no banco."
                        className="flex items-center gap-1.5 rounded-xl border border-outline-variant px-4 py-2 text-label-md font-bold text-on-surface transition-all hover:bg-surface-container-low disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_circle</span>
                        Testar estes passos
                      </button>
                      <button
                        type="button"
                        onClick={atualizarTourComPassosColados}
                        disabled={!jsonColadoTexto.trim() || atualizandoTour}
                        title="Salva os passos colados direto neste tour, sem precisar clicar em Salvar lá em cima. Título, sistema, prioridade e demais configurações não mudam."
                        className="flex items-center gap-1.5 rounded-xl border border-outline-variant px-4 py-2 text-label-md font-bold text-on-surface transition-all hover:bg-surface-container-low disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                        {atualizandoTour ? 'Atualizando…' : 'Atualizar Tour existente'}
                      </button>
                      <button
                        type="button"
                        onClick={substituirPassosDoJson}
                        disabled={!jsonColadoTexto.trim()}
                        className="rounded-xl bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-md transition-all hover:opacity-90 disabled:opacity-50"
                      >
                        Substituir passos
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Editor de passos: lista e editor ficam juntos na coluna principal. */}
            <div id="tour-passos-editor" className="scroll-mt-4">
              <PassosEditor
                passos={passos}
                selecionado={passoSelecionado}
                onSelecionar={setPassoSelecionado}
                onAdicionar={addPasso}
                onSetPasso={setPasso}
                onMover={movePasso}
                onDuplicar={duplicarPasso}
                onRemover={removePasso}
                onReordenar={reordenarPasso}
                passoRefs={passoRefs}
                passoDestacado={passoDestacado}
                copiadoPasso={copiadoPasso}
                onCopiarSeletor={copiarSeletor}
                onCopiarComando={copiarComandoTeste}
              />
            </div>
          </div>

          <div className="min-w-0 xl:col-start-2">
            <aside className="w-full self-start rounded-3xl border border-outline-variant bg-surface-bright p-5 shadow-[0_18px_50px_rgba(20,22,26,0.12)] backdrop-blur">
              <div className="mb-5 border-b border-outline-variant pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
                    <span className="material-symbols-outlined text-[19px]">tune</span>
                  </span>
                  <div>
                    <p className="text-[22px] font-semibold leading-tight text-on-surface">Configurações</p>
                  </div>
                </div>
                <nav className="mt-4 rounded-2xl bg-surface-container-low p-2" aria-label="Seções de configuração">
                   <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">Configuração</p>
                  <div className="flex flex-wrap gap-2">
                    {SECOES_CONFIGURACAO.map(secao => {
                      const ativa = secaoConfiguracao === secao.id
                      return (
                        <button
                          key={secao.id}
                          type="button"
                          onClick={() => setSecaoConfiguracao(secao.id)}
                          aria-current={ativa ? 'page' : undefined}
                          title={secao.description}
                          className={`rounded-full border px-4 py-1.5 text-[14px] font-semibold transition ${ativa ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-bright text-on-surface hover:border-primary hover:text-primary'}`}
                        >
                          {secao.label}
                        </button>
                      )
                    })}
                  </div>
                </nav>
              </div>
            <div className="min-w-0 space-y-4">
            {secaoConfiguracao === 'geral' && <div className={`${card} min-w-0`}>
            <CardHeader
              icon="info"
              iconBg="bg-primary-fixed"
              iconColor="text-primary"
             title="Geral do tour"
             description="Defina o contexto e onde este tour será executado."
            />
            <div className="grid grid-cols-1 gap-4 max-w-4xl">
               <div>
                 <label htmlFor="tour-titulo" className="block text-label-md text-on-surface-variant mb-1.5">Nome do Tour <span className="text-error">*</span></label>
                 <input id="tour-titulo" required value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Conheça a nova agenda" className={field} />
                 <p className="mt-1 text-[11px] text-outline">Usado para identificar o tour e apresentado na introdução para o usuário.</p>
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
              <div className="mt-6 border-t border-outline-variant/50 pt-6">
            <CardHeader
              icon="map"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Destino do tour"
              description="Escolha o sistema e como identificar a tela de início."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
               <div className="md:col-span-2">
                 <label className="block text-label-md text-on-surface-variant mb-1.5">
                   Sistema <span className="text-error">*</span>
                 </label>
                 {sistemasConfig.length > 0 ? (
                   <Select
                     value={form.sistema}
                     options={Array.from(new Map([
                       ...sistemasConfig.map(sistema => [sistema.identificador, sistema.nome] as const),
                       ...(form.sistema.trim() && !sistemasConfig.some(sistema => sistema.identificador === form.sistema.trim())
                         ? [[form.sistema.trim(), `${form.sistema.trim()} (atual)`] as const]
                         : []),
                     ]).entries()).map(([value, label]) => ({ value, label }))}
                     onChange={value => set('sistema', value)}
                     placeholder="Selecione um sistema"
                   />
                 ) : (
                   <input
                     value={form.sistema}
                     onChange={e => set('sistema', e.target.value)}
                     placeholder="Ex: portal, crm, mobile"
                     className={field}
                   />
                 )}
                 <p className="mt-1.5 text-[11px] leading-relaxed text-on-surface-variant">
                   {sistemasConfig.length > 0
                     ? 'Selecione o sistema cadastrado onde o tour será executado.'
                     : 'Cadastre um sistema em Configurações ou informe o identificador usado pelo widget.'}
                 </p>
               </div>

              <div className="md:col-span-2">
                <label className="block text-label-md text-on-surface-variant mb-2">
                  Onde o tour deve iniciar? <span className="text-error">*</span>
                </label>
                 <div className="grid grid-cols-1 gap-2">
                  {MODOS.map(opt => {
                    const active = form.modo_identificacao === opt.value
                    return (
                       <label key={opt.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-all ${active ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-container-low hover:border-primary/50'}`}>
                        <input
                          type="radio"
                          name="modo_identificacao"
                          value={opt.value}
                          checked={active}
                          onChange={e => set('modo_identificacao', e.target.value)}
                          className="mt-0.5 text-primary focus:ring-primary shrink-0"
                        />
                         <div className="min-w-0">
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
                     Tela cadastrada <span className="text-error">*</span>
                   </label>
                   {!sistemaSelecionado ? (
                     <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-3 py-2.5 text-[12px] text-on-surface-variant">
                       Selecione um sistema para listar as telas cadastradas.
                     </p>
                    ) : (
                      <>
                        <SeletorTelaCatalogo
                          telas={telasDoSistema}
                          selecionada={telaSelecionada}
                          onSelecionar={selecionarTelaCatalogo}
                          onCriar={podeGerenciarConfiguracoes ? abrirModalNovaTela : undefined}
                        />
                      </>
                    )}
                   <p className="mt-1.5 text-[11px] leading-relaxed text-on-surface-variant">
                     Escolha uma tela do catálogo para preencher o identificador usado pelo widget.
                   </p>
                 </div>
               )}

              {form.modo_identificacao === 'data_cy' && (
                <div className="md:col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Data-cy da tela <span className="text-error">*</span>
                  </label>
                  <input
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
                    value={form.url_contem}
                    onChange={e => set('url_contem', e.target.value)}
                    placeholder="/app/atendimento/agendamentos"
                    className={field}
                  />
                </div>
              )}
              </div>
              </div>
            </div>
            }

           {secaoConfiguracao === 'exibicao' && (
             <div className={`${card} min-w-0`}>
               <CardHeader
                 icon="tune"
                 iconBg="bg-tertiary-fixed"
                 iconColor="text-tertiary"
                 title="Exibição e distribuição"
                 description="Defina quando o tour aparece e como ele pode ser usado."
               />

               <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                 <div>
                   <label className="mb-1.5 block text-label-md text-on-surface-variant">Prioridade</label>
                   <input
                     type="number"
                     min={0}
                     step={1}
                     value={form.prioridade}
                     onChange={e => set('prioridade', e.target.value)}
                     className={field}
                   />
                   <p className="mt-1.5 text-[12px] leading-relaxed text-on-surface-variant">Tours com maior prioridade aparecem primeiro quando mais de um está elegível.</p>
                 </div>

                 <div>
                   <label className="mb-1.5 block text-label-md text-on-surface-variant">Exibição autônoma</label>
                   <label className="relative inline-flex cursor-pointer items-center">
                     <input
                       type="checkbox"
                       checked={form.ativo}
                       disabled={!form.permite_autonomo}
                       onChange={e => set('ativo', e.target.checked)}
                       className="sr-only peer"
                     />
                     <div className="relative h-6 w-11 rounded-full bg-outline-variant after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-disabled:opacity-50" />
                     <span className="ml-3 text-body-md text-on-surface">{form.ativo ? 'Ativa' : 'Inativa'}</span>
                   </label>
                   <p className="mt-1.5 text-[12px] leading-relaxed text-on-surface-variant">
                     {!form.permite_autonomo ? 'Ative a execução independente abaixo para liberar esta opção.' : 'Pode ser exibido automaticamente ou iniciado pela integração.'}
                   </p>
                 </div>
               </div>

               <div className="mt-5 border-t border-outline-variant/50 pt-5">
                 <div className="mb-3">
                   <h3 className="text-label-md font-bold text-on-surface">Como este tour pode ser usado</h3>
                   <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">Escolha uma ou ambas as formas de distribuição.</p>
                 </div>

                 <div className="grid gap-2 md:grid-cols-2">
                   <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${form.permite_autonomo ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-bright hover:border-primary/50'}`}>
                     <input type="checkbox" checked={form.permite_autonomo} onChange={e => setForm(prev => ({ ...prev, permite_autonomo: e.target.checked, ativo: e.target.checked ? prev.ativo : false }))} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
                     <span>
                       <span className="block text-body-md font-semibold text-on-surface">Execução independente</span>
                       <span className="mt-0.5 block text-[12px] leading-relaxed text-on-surface-variant">Pode aparecer por gatilhos ou ser iniciado pela integração.</span>
                     </span>
                   </label>
                   <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${form.permite_jornada ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-bright hover:border-primary/50'}`}>
                     <input type="checkbox" checked={form.permite_jornada} onChange={e => alterarPermissaoJornada(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
                     <span>
                       <span className="block text-body-md font-semibold text-on-surface">Etapa de Jornada</span>
                       <span className="mt-0.5 block text-[12px] leading-relaxed text-on-surface-variant">Pode ser reutilizado dentro de uma Jornada.</span>
                     </span>
                   </label>
                 </div>

                 {form.permite_autonomo && <div className="mt-3 space-y-3 rounded-xl bg-surface-container-low p-3">
                   <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                     <label className="text-label-md text-on-surface-variant">Frequência
                       <select value={form.frequencia} onChange={e => set('frequencia', e.target.value)} className={`${field} mt-1`}>
                         <option value="sempre">Sempre</option><option value="uma_vez_por_usuario">Uma vez por usuário</option><option value="uma_vez_por_sessao">Uma vez por sessão</option><option value="ate_concluir">Até concluir</option><option value="intervalo_dias">Intervalo em dias</option>
                       </select>
                     </label>
                     {form.frequencia === 'intervalo_dias' && <label className="text-label-md text-on-surface-variant">Intervalo em dias
                       <input type="number" min={1} step={1} value={form.frequencia_intervalo_dias} onChange={e => set('frequencia_intervalo_dias', e.target.value)} className={`${field} mt-1`} />
                     </label>}
                   </div>
                   <div className="space-y-2">
                     <div className="flex items-center justify-between gap-3"><p className="text-label-md font-bold text-on-surface">Gatilhos autônomos</p><button type="button" onClick={() => setForm(prev => ({ ...prev, gatilhos: [...prev.gatilhos, { tipo: 'manual' }] }))} className="min-h-11 px-2 text-label-md font-bold text-primary">+ Adicionar</button></div>
                     {form.gatilhos.length === 0 && <p className="text-[12px] text-error">Adicione ao menos um gatilho para publicar a execução autônoma.</p>}
                     {form.gatilhos.map((gatilho, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-outline-variant bg-surface-bright p-2 md:grid-cols-[180px_1fr_auto]">
                       <Select size="sm" value={gatilho.tipo} options={[{ value: 'entrada_tela', label: 'Entrada na tela' }, { value: 'url', label: 'URL' }, { value: 'elemento', label: 'Elemento' }, { value: 'botao_ajuda', label: 'Botão de ajuda' }, { value: 'manual', label: 'Manual' }, { value: 'evento', label: 'Evento' }]} onChange={valor => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.map((item, i) => i === index ? { tipo: valor as GatilhoTour['tipo'] } : item) }))} />
                       {(gatilho.tipo === 'entrada_tela') && <input value={gatilho.tela ?? ''} onChange={e => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.map((item, i) => i === index ? { ...item, tela: e.target.value } : item) }))} placeholder="Nome da tela" className={field} />}
                       {(gatilho.tipo === 'url') && <input value={gatilho.url_contem ?? ''} onChange={e => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.map((item, i) => i === index ? { ...item, url_contem: e.target.value } : item) }))} placeholder="Parte da URL" className={field} />}
                       {(gatilho.tipo === 'elemento') && <input value={gatilho.seletor ?? ''} onChange={e => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.map((item, i) => i === index ? { ...item, seletor_tipo: 'css', seletor: e.target.value } : item) }))} placeholder="Seletor CSS" className={field} />}
                       {(gatilho.tipo === 'evento') && <input value={gatilho.evento ?? ''} onChange={e => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.map((item, i) => i === index ? { ...item, evento: e.target.value } : item) }))} placeholder="Nome do evento track()" className={field} />}
                       <button type="button" onClick={() => setForm(prev => ({ ...prev, gatilhos: prev.gatilhos.filter((_, i) => i !== index) }))} className="min-h-11 px-2 text-left text-label-md font-bold text-error md:text-center">Remover</button>
                     </div>)}
                   </div>
                 </div>}
               </div>
             </div>
           )}

            {secaoConfiguracao === 'segmentacao' && <div className={`${card} min-w-0`}>
              <CardHeader
                icon="target"
                iconBg="bg-secondary-fixed"
                iconColor="text-secondary"
                title="Segmentação"
                description="Defina para quais clientes, perfis e contextos este tour será elegível."
              />
              <div className="space-y-5">
                <div>
                  <span className="mb-2 block text-label-md font-semibold text-on-surface-variant">Para quem este tour deve aparecer?</span>
                  <div className="grid gap-2">
                    {[
                      { id: 'todos' as const, icon: 'groups', titulo: 'Todos', desc: 'Sem filtros. Aparece para qualquer contexto elegível.' },
                      { id: 'cliente' as const, icon: 'domain', titulo: 'Por cliente', desc: 'Filtra por IDs de clientes e unidades.' },
                      { id: 'perfil' as const, icon: 'person_search', titulo: 'Por perfil', desc: 'Filtra por perfis, tipos de usuário e estados.' },
                    ].map(opcao => (
                      <button
                        key={opcao.id}
                        type="button"
                        onClick={() => selecionarModoSegmentacao(opcao.id)}
                        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${modoSegmentacao === opcao.id ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant bg-surface-bright text-on-surface hover:border-primary'}`}
                      >
                        <span className={`material-symbols-outlined mt-0.5 text-[20px] ${modoSegmentacao === opcao.id ? 'text-primary' : 'text-outline'}`}>{opcao.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-body-md font-bold leading-5">{opcao.titulo}</span>
                          <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-on-surface-variant">{opcao.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {modoSegmentacao !== 'todos' && (
                  <label className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-3 text-body-md font-semibold text-on-surface">
                    <input
                      type="checkbox"
                      checked={modoSegmentacao === 'combinada'}
                      onChange={event => event.target.checked
                        ? selecionarModoSegmentacao('combinada')
                        : selecionarModoSegmentacao(valoresSegmentacao(regrasSegmentacao, 'cliente_id').length > 0 || valoresSegmentacao(regrasSegmentacao, 'unidade_id').length > 0 ? 'cliente' : 'perfil')}
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-bold">Combinar filtros</span>
                      <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-on-surface-variant">Use cliente, unidade, perfil, tipo de usuário e estado na mesma segmentação.</span>
                    </span>
                  </label>
                )}

                {(modoSegmentacao === 'cliente' || modoSegmentacao === 'combinada') && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CampoListaSegmentacao label="IDs de clientes" value={valoresSegmentacao(regrasSegmentacao, 'cliente_id')} onChange={valores => atualizarCampoSegmentacao('cliente_id', valores)} />
                    <CampoListaSegmentacao label="IDs de unidades" value={valoresSegmentacao(regrasSegmentacao, 'unidade_id')} onChange={valores => atualizarCampoSegmentacao('unidade_id', valores)} />
                  </div>
                )}

                {(modoSegmentacao === 'perfil' || modoSegmentacao === 'combinada') && (
                  <div className="space-y-4">
                    <CampoListaSegmentacao label="Perfis permitidos" value={valoresSegmentacao(regrasSegmentacao, 'perfil')} onChange={valores => atualizarCampoSegmentacao('perfil', valores)} />
                    <CampoListaSegmentacao label="Tipos permitidos" value={valoresSegmentacao(regrasSegmentacao, 'usuario_tipo')} onChange={valores => atualizarCampoSegmentacao('usuario_tipo', valores)} />
                    <CampoListaSegmentacao label="Estados permitidos" value={valoresSegmentacao(regrasSegmentacao, 'estado')} onChange={valores => atualizarCampoSegmentacao('estado', valores)} hint="Ex.: SP, RJ, MG." />
                  </div>
                )}

                <CampoDominiosRegra
                  catalogo={sistemasConfig.find(s => s.identificador === sistemaSelecionado)?.dominios ?? []}
                  value={valoresSegmentacao(regrasSegmentacao, 'dominio')}
                  onChange={valores => atualizarCampoSegmentacao('dominio', valores)}
                />

                {regrasSegmentacaoAvancadas.length > 0 && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    <span className="material-symbols-outlined mt-0.5 text-[14px]">info</span>
                    Este tour possui regras avançadas de segmentação que continuam preservadas. Elas não são alteradas por esta configuração simplificada.
                  </p>
                )}
              </div>
            </div>}

              </div>
             </aside>
           </div>
          </form>
        )}
        {modalNovaTelaAberto && (
          <TelaCatalogoModal
            form={formNovaTela}
            sistemas={sistemasConfig}
            saving={salvandoNovaTela}
            error={erroNovaTela}
            titulo="Nova Tela"
            submitLabel="Criar e usar"
            onClose={() => setModalNovaTelaAberto(false)}
            onSubmit={salvarNovaTela}
            setForm={setFormNovaTela}
          />
        )}
      </section>
    </div>
  )
}
