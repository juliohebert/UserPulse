import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourGuiado } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { TOUR_TEMPLATES, type TourTemplate } from '../../data/tourTemplates'
import { comandoTestarSeletor } from '../../utils/tour'

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
  modo_avanco_interacao: 'manual', seletor_confirmacao: '',
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
  { value: 'data_cy', label: 'data-cy' },
  { value: 'css', label: 'CSS' },
]

const ACOES_AO_AVANCAR = [
  { value: 'apenas_avancar', label: 'Apenas avançar' },
  { value: 'clicar_elemento', label: 'Clicar no elemento destacado e avançar' },
]

const MODOS_AVANCO_INTERACAO = [
  { value: 'manual', label: 'Manual (só pelo botão Próximo)' },
  { value: 'ao_clicar', label: 'Ao clicar no elemento destacado' },
  { value: 'ao_alterar_valor', label: 'Ao preencher/alterar o valor' },
  { value: 'ao_aparecer_elemento', label: 'Quando outro elemento aparecer' },
  { value: 'ao_sumir_elemento', label: 'Quando outro elemento sumir' },
]

const MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento']

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
  const temPasso = passos.length > 0
  const todosComTitulo = passos.every(p => p.titulo.trim())
  const todosComDescricao = passos.every(p => p.descricao.trim())
  const todosComSeletor = passos.every(p => p.seletor.trim())
  const faltamSeletores = passos.some(p => !p.seletor.trim())
  const algumComCss = passos.some(p => p.seletor_tipo === 'css')

  const items: ChecklistItem[] = [
    { label: 'Título preenchido', status: form.titulo.trim() ? 'ok' : 'aviso' },
    {
      label: 'Destino configurado',
      status: destinoConfigurado(form) ? 'ok' : 'aviso',
      detalhe: destinoConfigurado(form) ? undefined : 'Informe o sistema e a tela, data-cy ou URL, conforme o modo escolhido.',
    },
    { label: 'Pelo menos 1 passo cadastrado', status: temPasso ? 'ok' : 'critico' },
    { label: 'Todos os passos têm título', status: todosComTitulo ? 'ok' : 'critico' },
    {
      label: 'Todos os passos têm descrição',
      status: todosComDescricao ? 'ok' : 'aviso',
      detalhe: todosComDescricao ? undefined : 'Opcional, mas ajuda o usuário a entender o que fazer em cada passo.',
    },
    {
      label: 'Todos os passos têm seletor/data-cy',
      status: todosComSeletor ? 'ok' : (form.ativo ? 'critico' : 'aviso'),
      detalhe: todosComSeletor ? undefined : 'Necessário para o widget localizar o elemento na tela do usuário.',
    },
  ]

  if (algumComCss) {
    items.push({
      label: 'Seletor CSS em uso',
      status: 'aviso',
      detalhe: 'Prefira data-cy quando possível — seletores CSS quebram com mais facilidade quando o layout muda.',
    })
  }

  items.push({
    label: form.ativo ? 'Tour ativo exige seletores preenchidos' : 'Tour em rascunho',
    status: form.ativo ? (faltamSeletores ? 'critico' : 'ok') : 'neutro',
    detalhe: form.ativo
      ? (faltamSeletores ? 'Preencha os seletores pendentes para poder ativar o tour.' : undefined)
      : 'Seletores podem ficar em branco por enquanto — só são exigidos para ativar.',
  })

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
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="p-1.5 bg-primary-fixed rounded-lg text-primary material-symbols-outlined text-[20px]">fact_check</span>
          <div>
            <h3 className="text-title-lg font-bold text-on-surface">Checklist do tour</h3>
            <p className="text-label-md text-on-surface-variant">Orienta antes de testar ou ativar — não bloqueia o salvamento.</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0 ${resumo.className}`}>
          {resumo.texto}
        </span>
      </div>
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

  if (passo.seletor_tipo === 'css' && seletor && !seletor.includes('data-cy')) {
    alertas.push('Seletores CSS podem ser frágeis. Sempre que possível, prefira data-cy.')
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

  const elemento = (
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
  const [loadingTour, setLoadingTour] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [templateAplicadoId, setTemplateAplicadoId] = useState<string | null>(null)
  const [copiadoPasso, setCopiadoPasso] = useState<{ index: number; tipo: 'seletor' | 'comando' } | null>(null)

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

  useEffect(() => {
    if (!id) return
    get<TourGuiado>(`/tours/${id}`)
      .then(t => {
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
              }))
            : [{ ...PASSO_VAZIO }]
        )
      })
      .catch(() => setError('Tour guiado não encontrado.'))
      .finally(() => setLoadingTour(false))
  }, [id])

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

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
        passos: passos.map(p => ({
          titulo: p.titulo.trim(),
          descricao: p.descricao.trim() || null,
          seletor_tipo: p.seletor_tipo,
          seletor: p.seletor.trim(),
          tooltip_posicao: p.tooltip_posicao,
          acao_ao_avancar: p.acao_ao_avancar,
          modo_avanco_interacao: p.modo_avanco_interacao,
          seletor_confirmacao: p.seletor_confirmacao.trim() || null,
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
            <h2 className="text-title-lg font-bold text-on-surface leading-tight">
              {isEdit ? 'Editar Tour Guiado' : 'Novo Tour Guiado'}
            </h2>
            <button
              type="button"
              onClick={() => navigate('/tours/guia')}
              className="flex items-center gap-1 text-label-sm text-outline hover:text-primary transition-colors mt-0.5"
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
              <div className="flex items-center gap-3 mb-4">
                <span className="p-1.5 bg-tertiary/10 rounded-lg text-tertiary material-symbols-outlined text-[20px]">auto_awesome</span>
                <div>
                  <h3 className="text-title-lg font-bold text-on-surface">Começar com um modelo</h3>
                  <p className="text-label-md text-on-surface-variant">Escolha um ponto de partida — título, descrição e passos base. Você edita tudo livremente depois.</p>
                </div>
              </div>
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

          {/* Parâmetros gerais */}
          <div className={card}>
            <div className="flex items-center gap-3 mb-4">
              <span className="p-1.5 bg-primary-fixed rounded-lg text-primary material-symbols-outlined text-[20px]">map</span>
              <h3 className="text-title-lg font-bold text-on-surface">Parâmetros Gerais</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
              <div className="md:col-span-2">
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

              <div className="md:col-span-2">
                <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
                <textarea
                  rows={2}
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Para que serve este tour?"
                  className={`${field} resize-none`}
                />
              </div>

              <div>
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

              <div className="md:col-span-2">
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

          {/* Passos do tour */}
          <div className={card}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <span className="p-1.5 bg-secondary-fixed rounded-lg text-secondary material-symbols-outlined text-[20px]">checklist</span>
                <div>
                  <h3 className="text-title-lg font-bold text-on-surface">Passos do tour</h3>
                  <p className="text-label-md text-on-surface-variant">Defina a sequência de elementos destacados.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={addPasso}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-bold hover:opacity-90 transition-all active:scale-95 shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Adicionar passo
              </button>
            </div>

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
                      </div>
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Seletor <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={passo.seletor}
                          onChange={e => setPasso(i, 'seletor', e.target.value)}
                          placeholder={passo.seletor_tipo === 'css' ? '#botao-novo-agendamento' : 'novo-agendamento-btn'}
                          className={`${field} text-[13px] py-2 font-mono`}
                        />
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
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {copiadoPasso?.index === i && copiadoPasso.tipo === 'comando' ? 'check' : 'terminal'}
                            </span>
                            {copiadoPasso?.index === i && copiadoPasso.tipo === 'comando' ? 'Copiado!' : 'Copiar comando'}
                          </button>
                        </div>
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
                        Define se o passo pode avançar automaticamente após uma interação do usuário, como clicar, preencher ou aguardar um elemento aparecer/sumir.
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
          </div>

          {/* Checklist de qualidade — orienta, não bloqueia */}
          <ChecklistCard form={form} passos={passos} />
        </form>
      </section>
    </div>
  )
}
