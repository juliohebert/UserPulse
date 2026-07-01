import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourGuiado } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { TOUR_TEMPLATES, type TourTemplate } from '../../data/tourTemplates'

interface PassoState {
  id?: string
  titulo: string
  descricao: string
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
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
  titulo: '', descricao: '', seletor_tipo: 'data_cy', seletor: '', tooltip_posicao: 'auto',
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

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

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
                Tours guiados
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
              Guia de uso
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

      <section className="px-4 lg:px-margin-desktop py-5 max-w-4xl">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    </div>
                    <div className="md:col-span-2 max-w-xs">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Posição do tooltip</label>
                      <Select
                        value={passo.tooltip_posicao}
                        onChange={v => setPasso(i, 'tooltip_posicao', v)}
                        options={TOOLTIP_POSICOES}
                        size="sm"
                      />
                    </div>
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
