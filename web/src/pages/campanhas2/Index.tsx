import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { get, post } from '../../services/api'
import type { AparenciaWidget, Campanha, Sistema, TelaCatalogo } from '../../types'

interface FormState {
  titulo: string
  subtitulo: string
  descricao: string
  tipo: string
  sistema: string
  tela: string
  imagem_url: string
  video_url: string
  texto_botao: string
  url_botao: string
  feedback_habilitado: boolean
  modo_exibicao: string
  gatilho: string
  evento: string
  modo_identificacao: string
  data_cy: string
  url_contem: string
  atraso_ms: string
  mostrar_uma_vez: boolean
  prioridade: string
  ordem: string
  ativo: boolean
  data_inicio: string
  data_fim: string
  pergunta_feedback: string
  observacao_obrigatoria: boolean
  exige_confirmacao_leitura: boolean
  permitir_fechar_modal: boolean
  intervalo_reexibicao_dias: string
  politica_reexibicao: string
  reexibir_apos_dias: string
  encerrar_apos_evento: boolean
  evento_conclusao: string
  categoria: string
  cta_habilitado: boolean
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
}

type SecaoDock = 'destino' | 'exibicao' | 'feedback' | 'segmentacao'
type PosicaoMidia = 'topo' | 'antes_cta'

type AparenciaCard = Pick<AparenciaWidget, 'cor_principal' | 'logo_url'>

const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']
const TIPOS_CAMPANHA = ['comunicado', 'melhoria', 'pesquisa']
const ICONES_TIPO_CAMPANHA: Record<string, string> = {
  comunicado: 'campaign',
  melhoria: 'rocket_launch',
  pesquisa: 'quiz',
}

function iconeTipoCampanha(tipo: string): string {
  return ICONES_TIPO_CAMPANHA[tipo] ?? 'campaign'
}
const formInicial: FormState = {
  titulo: 'Novidade no produto',
  subtitulo: 'Atualização importante',
  descricao: 'Conte para o usuário o que mudou, por que isso importa e qual é o próximo passo.',
  tipo: 'comunicado',
  sistema: '',
  tela: '',
  imagem_url: '',
  video_url: '',
  texto_botao: 'Saiba mais',
  url_botao: '',
  feedback_habilitado: true,
  modo_exibicao: 'modal_automatica',
  gatilho: 'ao_abrir_tela',
  evento: '',
  modo_identificacao: 'sistema_tela',
  data_cy: '',
  url_contem: '',
  atraso_ms: '800',
  mostrar_uma_vez: false,
  prioridade: '0',
  ordem: '0',
  ativo: true,
  data_inicio: '',
  data_fim: '',
  pergunta_feedback: '',
  observacao_obrigatoria: false,
  exige_confirmacao_leitura: false,
  permitir_fechar_modal: true,
  intervalo_reexibicao_dias: '',
  politica_reexibicao: 'uma_vez_apos_visualizacao',
  reexibir_apos_dias: '',
  encerrar_apos_evento: false,
  evento_conclusao: '',
  categoria: 'Novidade',
  cta_habilitado: true,
  segmentar_cliente_ids: [],
  segmentar_unidade_ids: [],
  segmentar_perfis: [],
  segmentar_usuario_tipos: [],
  segmentar_estados: [],
}

function normalizarUrl(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).toString()
  } catch {
    return trimmed
  }
}

function normalizarUrlContem(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).pathname
  } catch {
    return trimmed
  }
}

function extrairYouTubeId(url: URL): string | null {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] ?? null
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/').filter(Boolean)[1] ?? null
    return url.searchParams.get('v')
  }
  return null
}

function converterVideoEmbed(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const youtubeId = extrairYouTubeId(url)
    if (youtubeId) return `https://www.youtube.com/embed/${youtubeId}`
    if (url.hostname.includes('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop()
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
    if (url.hostname.includes('loom.com') && url.pathname.includes('/share/')) {
      return url.toString().replace('/share/', '/embed/')
    }
    return url.toString()
  } catch {
    return trimmed
  }
}

function corSistemaValida(valor: string | null | undefined): string {
  const cor = valor?.trim()
  return cor && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#0064e0'
}

function corTextoSistemaLegivel(cor: string): string {
  const hex = cor.replace('#', '')
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
  const luminancia = (valores: number[]) => valores
    .map(valor => {
      const canal = valor / 255
      return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4
    })
    .reduce((total, valor, index) => total + valor * [0.2126, 0.7152, 0.0722][index], 0)
  const contrasteComBranco = (valores: number[]) => 1.05 / (luminancia(valores) + 0.05)
  let ajustada = rgb
  while (contrasteComBranco(ajustada) < 3 && ajustada.some(valor => valor > 0)) {
    ajustada = ajustada.map(valor => Math.max(0, Math.round(valor * 0.85)))
  }
  return `#${ajustada.map(valor => valor.toString(16).padStart(2, '0')).join('')}`
}

function pareceUrlVideo(valor: string): boolean {
  const trimmed = valor.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return Boolean(extrairYouTubeId(url)) || url.hostname.includes('vimeo.com') || url.hostname.includes('loom.com')
  } catch {
    return false
  }
}

function PillDropdown({ label, value, options, onChange, placeholder = 'Selecionar' }: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const opcoes = Array.from(new Set([value, ...options].map(opcao => opcao.trim()).filter(Boolean)))

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto(prev => !prev)}
        onBlur={() => window.setTimeout(() => setAberto(false), 120)}
        className="inline-flex items-center gap-2 rounded-full border border-[#ced0d4] bg-white px-4 py-2 text-[12px] font-semibold text-[#1c1e21] transition hover:border-[#0064e0] focus:border-[#0064e0] focus:outline-none focus:ring-1 focus:ring-[#0064e0]"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={label}
      >
        <span className="max-w-[120px] truncate">{value || placeholder}</span>
        <span className="material-symbols-outlined text-[18px] text-[#444950]">expand_more</span>
      </button>
      {aberto && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-full rounded-2xl border border-[#dee3e9] bg-white p-2 shadow-[0_1px_4px_rgba(20,22,26,0.18)]" role="listbox">
          {opcoes.length > 0 ? opcoes.map(opcao => (
            <button
              key={opcao}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => { onChange(opcao); setAberto(false) }}
              className={`block w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-[14px] font-semibold transition ${opcao === value ? 'bg-[#0064e0] text-white' : 'text-[#1c1e21] hover:bg-[#eff4ff] hover:text-[#0064e0]'}`}
              role="option"
              aria-selected={opcao === value}
            >
              {opcao}
            </button>
          )) : (
            <p className="whitespace-nowrap px-3 py-2 text-[12px] leading-4 text-[#5d6c7b]">Defina no dock lateral</p>
          )}
        </div>
      )}
    </div>
  )
}

function CampoDock({ label, hint, value, onChange, placeholder, type = 'text' }: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-[#444950]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
      />
      {hint && <span className="mt-2 block text-[12px] leading-4 text-[#8595a4]">{hint}</span>}
    </label>
  )
}

function CampoBooleanoDock({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#ced0d4] bg-white px-3 py-2 text-[14px] font-semibold text-[#1c1e21]">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[#0064e0]" />
      {label}
    </label>
  )
}

function CampoListaDock({ label, value, onChange, hint }: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  hint?: string
}) {
  return (
    <CampoDock
      label={label}
      hint={hint ?? 'Separe múltiplos valores por vírgula.'}
      value={value.join(', ')}
      onChange={valor => onChange(valor.split(',').map(item => item.trim()).filter(Boolean))}
    />
  )
}

function DockLateral({ secao, form, catalogoTelas, salvando, setCampo, setSecao, onSelecionarTela, onLimpar, onPreview, onLista }: {
  secao: SecaoDock
  form: FormState
  catalogoTelas: TelaCatalogo[]
  salvando: boolean
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  setSecao: (secao: SecaoDock) => void
  onSelecionarTela: (telaId: string) => void
  onLimpar: () => void
  onPreview: () => void
  onLista: () => void
}) {
  const secoes: Array<{ id: SecaoDock; label: string }> = [
    { id: 'destino', label: 'Destino' },
    { id: 'exibicao', label: 'Exibição' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'segmentacao', label: 'Segmentação' },
  ]

  const sistemaSelecionado = form.sistema.trim()
  const telasDoSistema = sistemaSelecionado
    ? catalogoTelas.filter(tela => tela.sistema === sistemaSelecionado)
    : []
  const telaSelecionada = telasDoSistema.find(tela =>
    tela.modo_identificacao === form.modo_identificacao &&
    (tela.tela ?? '') === form.tela &&
    (tela.url_contem ?? '') === form.url_contem &&
    (tela.data_cy ?? '') === form.data_cy
  )

  function alternarFeedback(valor: boolean) {
    setCampo('feedback_habilitado', valor)
    if (valor) {
      setCampo('exige_confirmacao_leitura', false)
      return
    }
    if (!form.exige_confirmacao_leitura && !form.permitir_fechar_modal) {
      setCampo('permitir_fechar_modal', true)
    }
  }

  function alternarConfirmacao(valor: boolean) {
    setCampo('exige_confirmacao_leitura', valor)
    if (valor) {
      setCampo('feedback_habilitado', false)
      setCampo('observacao_obrigatoria', false)
      return
    }
    if (!form.feedback_habilitado && !form.permitir_fechar_modal) {
      setCampo('permitir_fechar_modal', true)
    }
  }

  function alternarFechamento(valor: boolean) {
    setCampo('permitir_fechar_modal', valor)
    if (!valor) {
      if (!form.feedback_habilitado && !form.exige_confirmacao_leitura) {
        setCampo('exige_confirmacao_leitura', true)
        setCampo('observacao_obrigatoria', false)
      }
      if (form.politica_reexibicao === 'uma_vez_apos_visualizacao') {
        setCampo('politica_reexibicao', 'ate_responder_ou_confirmar')
      }
    }
  }

  return (
    <aside className="rounded-3xl border border-[#dee3e9] bg-white/95 p-6 shadow-[0_18px_50px_rgba(20,22,26,0.12)] backdrop-blur xl:mr-6">
      <div className="mb-6 border-b border-[#dee3e9] pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#0064e0]">
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </span>
          <div>
            <p className="text-[22px] font-semibold leading-tight text-[#0a1317]">Configurações</p>
            <p className="mt-1 text-[13px] leading-5 text-[#5d6c7b]">Ajuste o card, destino, exibição e público.</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-[#f8f9ff] p-2">
          <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5d6c7b]">Etapas</p>
          <div className="flex flex-wrap gap-2">
          {secoes.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSecao(item.id)}
              className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition ${secao === item.id ? 'border-[#0064e0] bg-[#0064e0] text-white' : 'border-[#ced0d4] bg-white text-[#1c1e21] hover:border-[#0064e0] hover:text-[#0064e0]'}`}
            >
              {item.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="min-h-[320px]">
      {secao === 'destino' && (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Tela cadastrada</span>
            {!sistemaSelecionado ? (
              <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
                Selecione um sistema no card para listar as telas cadastradas.
              </div>
            ) : telasDoSistema.length === 0 ? (
              <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
                Nenhuma tela cadastrada para <strong>{sistemaSelecionado}</strong>. Use os campos manuais abaixo.
              </div>
            ) : (
              <select
                value={telaSelecionada?.id ?? ''}
                onChange={event => onSelecionarTela(event.target.value)}
                className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
              >
                <option value="">Selecionar tela do catálogo</option>
                {telasDoSistema.map(tela => (
                  <option key={tela.id} value={tela.id}>{tela.nome} · {tela.categoria}</option>
                ))}
              </select>
            )}
          </div>
          <label className="block">
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Modo de identificação</span>
            <select value={form.modo_identificacao} onChange={e => setCampo('modo_identificacao', e.target.value)} className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]">
              <option value="sistema_tela">Sistema + tela</option>
              <option value="data_cy">Elemento data-cy</option>
              <option value="url_contem">URL contém</option>
            </select>
          </label>
          <CampoDock label="Tela" value={form.tela} onChange={valor => setCampo('tela', valor)} placeholder="Geral" />
          <CampoDock label="data-cy" value={form.data_cy} onChange={valor => setCampo('data_cy', valor)} />
          <CampoDock label="URL contém" value={form.url_contem} onChange={valor => setCampo('url_contem', normalizarUrlContem(valor))} placeholder="/financeiro" />
          <label className="block">
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Gatilho</span>
            <select value={form.gatilho} onChange={e => setCampo('gatilho', e.target.value)} className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]">
              <option value="ao_abrir_tela">Ao abrir tela</option>
              <option value="apos_evento">Após evento</option>
            </select>
          </label>
          <CampoDock label="Evento" value={form.evento} onChange={valor => setCampo('evento', valor)} />
        </div>
      )}

      {secao === 'exibicao' && (
        <div className="space-y-5">
          <CampoBooleanoDock label="Campanha ativa" checked={form.ativo} onChange={valor => setCampo('ativo', valor)} />
          <CampoDock label="Atraso (ms)" value={form.atraso_ms} onChange={valor => setCampo('atraso_ms', valor)} type="number" />
          <CampoDock label="Prioridade" value={form.prioridade} onChange={valor => setCampo('prioridade', valor)} type="number" />
          <CampoDock label="Ordem" value={form.ordem} onChange={valor => setCampo('ordem', valor)} type="number" />
          <label className="block">
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Política de reexibição</span>
            <select value={form.politica_reexibicao} onChange={e => setCampo('politica_reexibicao', e.target.value)} className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]">
              <option value="uma_vez_apos_visualizacao">Uma vez após visualização</option>
              <option value="ate_responder_ou_confirmar">Até responder/confirmar</option>
              <option value="reexibir_apos_dias">Reexibir após X dias</option>
            </select>
          </label>
          <CampoDock label="Reexibir após dias" value={form.reexibir_apos_dias} onChange={valor => setCampo('reexibir_apos_dias', valor)} type="number" />
          <CampoBooleanoDock label="Mostrar uma vez" checked={form.mostrar_uma_vez} onChange={valor => setCampo('mostrar_uma_vez', valor)} />
          <CampoBooleanoDock label="Encerrar após evento" checked={form.encerrar_apos_evento} onChange={valor => setCampo('encerrar_apos_evento', valor)} />
          <CampoDock label="Evento de conclusão" value={form.evento_conclusao} onChange={valor => setCampo('evento_conclusao', valor)} />
        </div>
      )}

      {secao === 'feedback' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
            Escolha uma ação principal: coletar feedback ou exigir confirmação de leitura. Quando uma é ativada, a outra é desativada para evitar uma experiência confusa para o usuário.
          </div>
          <CampoBooleanoDock label="Habilitar feedback" checked={form.feedback_habilitado} onChange={alternarFeedback} />
          {form.feedback_habilitado && (
            <>
              <CampoDock label="Pergunta de feedback" value={form.pergunta_feedback} onChange={valor => setCampo('pergunta_feedback', valor)} placeholder="Como podemos melhorar?" />
              <CampoBooleanoDock label="Observação obrigatória" checked={form.observacao_obrigatoria} onChange={valor => setCampo('observacao_obrigatoria', valor)} />
            </>
          )}
          <CampoBooleanoDock label="Exigir confirmação de leitura" checked={form.exige_confirmacao_leitura} onChange={alternarConfirmacao} />
          <CampoBooleanoDock label="Permitir fechar modal" checked={form.permitir_fechar_modal} onChange={alternarFechamento} />
          {!form.permitir_fechar_modal && (
            <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
              Fechamento desabilitado exige uma saída clara: feedback ou confirmação de leitura. Se nenhuma estiver ativa, a confirmação é ligada automaticamente.
            </div>
          )}
        </div>
      )}

      {secao === 'segmentacao' && (
        <div className="space-y-5">
          <CampoListaDock label="Clientes" value={form.segmentar_cliente_ids} onChange={valor => setCampo('segmentar_cliente_ids', valor)} />
          <CampoListaDock label="Unidades" value={form.segmentar_unidade_ids} onChange={valor => setCampo('segmentar_unidade_ids', valor)} />
          <CampoListaDock label="Perfis" value={form.segmentar_perfis} onChange={valor => setCampo('segmentar_perfis', valor)} />
          <CampoListaDock label="Tipos de usuário" value={form.segmentar_usuario_tipos} onChange={valor => setCampo('segmentar_usuario_tipos', valor)} />
          <CampoListaDock label="Estados" value={form.segmentar_estados} onChange={valor => setCampo('segmentar_estados', valor)} hint="Ex.: SP, RJ, MG." />
        </div>
      )}
      </div>

      <div className="mt-6 border-t border-[#dee3e9] pt-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <Button type="submit" size="md" fullWidthMobile disabled={salvando} className="sm:col-span-2">{salvando ? 'Salvando...' : 'Criar campanha'}</Button>
          <Button type="button" variant="ghost" fullWidthMobile onClick={onPreview} disabled={salvando}>Preview</Button>
          <Button type="button" variant="ghost" fullWidthMobile onClick={onLimpar} disabled={salvando}>Limpar</Button>
          <Button type="button" variant="ghost" fullWidthMobile onClick={onLista} className="sm:col-span-2">Ver campanhas atuais</Button>
        </div>
      </div>
    </aside>
  )
}

function CardEditavel({ form, sistemas, aparencia, embedUrl, mostrarMidia, mediaPosition, arrastandoMidia, setCampo, onDragStartMedia, onMostrarMidia, onRemoverMidia, onMoverMidia, onFecharPreview, modo = 'construtor' }: {
  form: FormState
  sistemas: string[]
  aparencia: AparenciaCard | null
  embedUrl: string
  mostrarMidia: boolean
  mediaPosition: PosicaoMidia
  arrastandoMidia: boolean
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  onDragStartMedia: () => void
  onMostrarMidia: (posicao?: PosicaoMidia) => void
  onRemoverMidia: () => void
  onMoverMidia: (posicao: PosicaoMidia) => void
  onFecharPreview?: () => void
  modo?: 'construtor' | 'preview'
}) {
  const preview = modo === 'preview'
  const temVideo = Boolean(embedUrl)
  const temImagem = Boolean(form.imagem_url.trim())
  const ctaHabilitado = form.cta_habilitado
  const textoCta = form.texto_botao.trim() || 'Saiba mais'
  const corAcao = corSistemaValida(aparencia?.cor_principal)
  const corSubtitulo = corTextoSistemaLegivel(corAcao)
  const iconeCampanha = iconeTipoCampanha(form.tipo)
  const midiaRef = useRef<HTMLDivElement>(null)
  const [editandoMidia, setEditandoMidia] = useState(false)
  const [linkMidiaInline, setLinkMidiaInline] = useState(form.video_url || form.imagem_url)
  const [notaFeedbackPreview, setNotaFeedbackPreview] = useState<number | null>(null)
  const [observacaoFeedbackPreview, setObservacaoFeedbackPreview] = useState('')
  const [confirmadoConstrutor, setConfirmadoConstrutor] = useState(false)
  const [mensagemSimulacao, setMensagemSimulacao] = useState<{ tipo: 'aviso' | 'erro' | 'sucesso'; texto: string } | null>(null)
  const [editandoLinkCta, setEditandoLinkCta] = useState(false)

  useEffect(() => {
    if (editandoMidia) return
    setLinkMidiaInline(form.video_url || form.imagem_url)
  }, [editandoMidia, form.video_url, form.imagem_url])

  function aplicarLinkMidia(valor: string) {
    const link = valor.trim()
    setLinkMidiaInline(valor)
    if (!link) {
      setCampo('video_url', '')
      setCampo('imagem_url', '')
      return
    }
    const deveSerVideo = pareceUrlVideo(link)
    if (deveSerVideo) {
      setCampo('video_url', link)
      setCampo('imagem_url', '')
    } else {
      setCampo('imagem_url', link)
      setCampo('video_url', '')
    }
  }

  function simularEnvioConstrutor() {
    if (form.feedback_habilitado && notaFeedbackPreview == null) { setMensagemSimulacao({ tipo: 'aviso', texto: 'Selecione uma nota para enviar.' }); return }
    if (form.observacao_obrigatoria && !observacaoFeedbackPreview.trim()) { setMensagemSimulacao({ tipo: 'erro', texto: 'Preencha a observação obrigatória para continuar.' }); return }
    if (form.exige_confirmacao_leitura && !confirmadoConstrutor) { setMensagemSimulacao({ tipo: 'aviso', texto: 'Confirme a leitura antes de continuar.' }); return }
    if (preview && !form.permitir_fechar_modal && onFecharPreview) { onFecharPreview(); return }
    setMensagemSimulacao({ tipo: 'sucesso', texto: 'Obrigado! Resposta registrada nesta prévia.' })
  }

  function simularCta() {
    if (form.observacao_obrigatoria && !observacaoFeedbackPreview.trim()) { setMensagemSimulacao({ tipo: 'erro', texto: 'Preencha a observação obrigatória antes de continuar.' }); return }
    if (form.exige_confirmacao_leitura && !confirmadoConstrutor) { setMensagemSimulacao({ tipo: 'aviso', texto: 'Confirme a leitura antes de continuar.' }); return }
    setMensagemSimulacao({ tipo: 'sucesso', texto: `Ação "${textoCta}" concluída.` })
  }

  function alternarCta() {
    setCampo('cta_habilitado', !ctaHabilitado)
  }

  function permitirSoltarMidia(event: DragEvent<HTMLElement>) {
    if (event.dataTransfer.types.includes('application/x-userpulse-midia')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function soltarMidia(event: DragEvent<HTMLElement>, posicao: PosicaoMidia) {
    const origem = event.dataTransfer.getData('application/x-userpulse-midia')
    if (!origem) return
    event.preventDefault()
    onMoverMidia(posicao)
  }

  const pontoMidia = (posicao: PosicaoMidia) => {
    if (preview) return null
    if (!mostrarMidia) {
      return (
        <button
          type="button"
          onClick={() => onMostrarMidia(posicao)}
          className="group flex w-full items-center gap-3 py-1 text-[#5d6c7b]"
        >
          <span className="h-px flex-1 bg-[#dee3e9] transition group-hover:bg-[#ced0d4]" />
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ced0d4] bg-white text-[18px] leading-none text-[#444950]">+</span>
          <span className="h-px flex-1 bg-[#dee3e9] transition group-hover:bg-[#ced0d4]" />
          <span className="absolute opacity-0 transition group-hover:relative group-hover:opacity-100 text-[12px] font-semibold">Adicionar mídia</span>
        </button>
      )
    }

    return (
      <div
        onDragOver={permitirSoltarMidia}
        onDrop={event => soltarMidia(event, posicao)}
        className={`transition-all ${arrastandoMidia ? 'h-8 rounded-full border border-dashed border-[#ced0d4] bg-[#f1f4f7]' : 'h-1'}`}
        aria-hidden="true"
      />
    )
  }

  const blocoMidia = mostrarMidia && (!preview || temVideo || temImagem) ? (
    <div ref={midiaRef} className="group relative rounded-3xl outline-none">
      {!preview && <button
        type="button"
        draggable
        title="Arraste para mover a mídia"
        aria-label="Arrastar bloco de mídia"
        onDragStart={event => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-userpulse-midia', 'midia')
          const ghost = document.createElement('div')
          ghost.textContent = 'Mídia'
          ghost.style.position = 'fixed'
          ghost.style.top = '-1000px'
          ghost.style.left = '-1000px'
          ghost.style.padding = '8px 14px'
          ghost.style.border = '1px solid #ced0d4'
          ghost.style.borderRadius = '9999px'
          ghost.style.background = '#ffffff'
          ghost.style.color = '#0a1317'
          ghost.style.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif'
          ghost.style.boxShadow = '0 1px 4px rgba(20,22,26,0.18)'
          document.body.appendChild(ghost)
          event.dataTransfer.setDragImage(ghost, 24, 18)
          window.setTimeout(() => ghost.remove(), 0)
          onDragStartMedia()
        }}
        className="absolute left-1/2 top-0 z-20 flex h-7 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-[#ced0d4] bg-white text-[#444950] opacity-0 transition hover:border-[#0064e0] hover:text-[#0064e0] active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </button>}
      {!preview && <button
        type="button"
        onClick={onRemoverMidia}
        aria-label="Remover bloco de mídia"
        title="Remover bloco de mídia"
        className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[#e41e3f] bg-[#e41e3f] text-white opacity-0 transition hover:bg-[#f0284a] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#f0284a] group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>}
      <div className="relative aspect-video overflow-visible rounded-3xl border border-dashed border-[#ced0d4] bg-[#f1f4f7] transition hover:border-[#0064e0] focus-within:border-[#0064e0]">
        <div className="h-full overflow-hidden rounded-3xl">
          {temVideo && !editandoMidia ? (
            <iframe src={embedUrl} title="Vídeo da campanha" className="pointer-events-none h-full w-full" allowFullScreen />
          ) : temImagem && !editandoMidia ? (
            <img src={form.imagem_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 py-6 text-center text-[#5d6c7b]">
              <div className="w-full max-w-[360px] rounded-2xl border border-[#dee3e9] bg-white p-4">
                <p className="text-[14px] font-semibold text-[#0a1317]">Cole o link da imagem ou vídeo</p>
                <p className="mt-1 text-[12px] leading-4 text-[#5d6c7b]">YouTube, Vimeo e Loom viram vídeo. Outros links são tratados como imagem.</p>
                <div className="mt-4 flex flex-col gap-3">
                  <input
                    value={linkMidiaInline}
                    onChange={event => aplicarLinkMidia(event.target.value)}
                    onPaste={event => {
                      const input = event.currentTarget
                      window.setTimeout(() => {
                        const valor = input.value
                        aplicarLinkMidia(valor)
                        if (valor.trim()) setEditandoMidia(false)
                      }, 0)
                    }}
                    onBlur={event => { if (event.currentTarget.value.trim()) setEditandoMidia(false) }}
                    placeholder="https://..."
                    className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
                  />

                </div>
              </div>
            </div>
          )}
        </div>

        {!preview && (temVideo || temImagem) && !editandoMidia && (
          <button
            type="button"
            onClick={() => { setLinkMidiaInline(form.video_url || form.imagem_url); setEditandoMidia(true) }}
            className="absolute left-3 top-3 z-10 rounded-full border border-[#ced0d4] bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-[#1c1e21] opacity-0 transition hover:border-[#0064e0] hover:text-[#0064e0] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Editar
          </button>
        )}

      </div>
    </div>
  ) : null

  const blocoDescricao = preview ? (
    <p className="m-0 whitespace-pre-wrap text-body-md leading-snug text-on-surface-variant">
      {form.descricao || 'Descrição da campanha.'}
    </p>
  ) : (
    <textarea
      value={form.descricao}
      onChange={e => setCampo('descricao', e.target.value)}
      required
      rows={2}
      aria-label="Descrição da campanha"
      placeholder="Escreva a mensagem da campanha..."
      className="min-h-[48px] w-full resize-none border-0 bg-transparent p-0 text-body-md leading-snug text-on-surface-variant outline-none placeholder:italic placeholder:text-on-surface-variant/40 focus:ring-0"
    />
  )

  const blocoFeedback = form.feedback_habilitado ? (
    <div className="border-t border-outline-variant/40 pt-3">
      {mensagemSimulacao && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-on-surface-variant">
          <span className="material-symbols-outlined mt-0.5 text-[16px]" style={{ color: mensagemSimulacao.tipo === 'erro' ? '#ba1a1a' : corAcao }}>
            {mensagemSimulacao.tipo === 'sucesso' ? 'check_circle' : mensagemSimulacao.tipo === 'erro' ? 'error' : 'info'}
          </span>
          <p className="m-0 text-[12px] font-semibold leading-4">{mensagemSimulacao.texto}</p>
        </div>
      )}
      <p className="mb-2 text-body-md font-semibold text-on-surface">
        {form.pergunta_feedback.trim() || 'Como podemos melhorar?'}
      </p>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, nota) => (
          <button
            key={nota}
            type="button"
            onClick={() => { setNotaFeedbackPreview(nota); if (mensagemSimulacao?.tipo !== 'sucesso') setMensagemSimulacao(null) }}
            className={`h-8 rounded-lg border text-[12px] font-bold transition ${notaFeedbackPreview === nota ? 'text-white' : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary'}`}
            style={notaFeedbackPreview === nota ? { backgroundColor: corAcao, borderColor: corAcao } : undefined}
          >
            {nota}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={observacaoFeedbackPreview}
        onChange={event => { setObservacaoFeedbackPreview(event.target.value); if (mensagemSimulacao?.tipo !== 'sucesso') setMensagemSimulacao(null) }}
        placeholder="Conte mais sobre sua resposta..."
        className="mt-2 w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md leading-5 text-on-surface outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        onClick={simularEnvioConstrutor}
        style={{ backgroundColor: corAcao }}
        className="mt-2 w-full rounded-lg py-2.5 text-label-md font-bold text-white transition-opacity hover:opacity-90"
      >
        Enviar Feedback
      </button>
    </div>
  ) : null

  const blocoCta = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {ctaHabilitado ? (preview ? (
          <button type="button" onClick={simularCta} style={{ backgroundColor: corAcao }} className="flex min-h-[42px] flex-1 items-center justify-center rounded-lg px-4 py-2 text-label-md font-bold text-white transition hover:opacity-90">
            {textoCta}
          </button>
        ) : (
          <div style={{ backgroundColor: corAcao }} className="flex min-h-[42px] flex-1 items-center rounded-lg px-4 py-2 text-white transition hover:opacity-90">
            <input
              value={form.texto_botao}
              onChange={e => setCampo('texto_botao', e.target.value)}
              onBlur={() => { if (!form.texto_botao.trim()) setCampo('texto_botao', 'Saiba mais') }}
              aria-label="Texto do CTA"
              placeholder={textoCta}
              className="w-full border-0 bg-transparent p-0 text-center text-label-md font-bold text-inherit outline-none placeholder:text-current placeholder:opacity-80 focus:ring-0"
            />
          </div>
        )) : !preview ? (
          <div className="flex min-h-[42px] flex-1 items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-outline">
            CTA desabilitado
          </div>
        ) : null}
        {!preview && ctaHabilitado && (
          <button
            type="button"
            onClick={() => setEditandoLinkCta(prev => !prev)}
            aria-label="Editar link do CTA"
            title="Editar link do CTA"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition ${form.url_botao.trim() ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-lowest text-outline hover:border-primary hover:text-primary'}`}
          >
            <span className="material-symbols-outlined text-[20px]">link</span>
          </button>
        )}
        {!preview && (
          <button
            type="button"
            onClick={alternarCta}
            aria-label={ctaHabilitado ? 'Desabilitar CTA' : 'Habilitar CTA'}
            title={ctaHabilitado ? 'Desabilitar CTA' : 'Habilitar CTA'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-outline transition hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">{ctaHabilitado ? 'visibility_off' : 'add_link'}</span>
          </button>
        )}
      </div>
      {!preview && !form.permitir_fechar_modal && !form.exige_confirmacao_leitura && (
        <div className="flex items-start gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-on-surface-variant">
          <span className="material-symbols-outlined mt-0.5 text-[16px]" style={{ color: corAcao }}>lock</span>
          <p className="m-0 text-[12px] font-semibold leading-4">O usuário não verá botão de fechar nesta simulação.</p>
        </div>
      )}
      {!preview && ctaHabilitado && (editandoLinkCta ? (
        <input
          value={form.url_botao}
          onChange={e => setCampo('url_botao', e.target.value)}
          autoFocus
          aria-label="Link do CTA"
          placeholder="https://..."
          className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
        />
      ) : null)}
    </div>
  )

  return (
    <article className={`mx-auto w-full text-on-surface ${preview ? 'max-w-[520px]' : 'max-w-[500px] rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-sm'}`}>
      {!preview && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-error" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <span className="text-label-md font-bold uppercase tracking-widest text-on-surface-variant">Construtor</span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <PillDropdown label="Tipo da campanha" value={form.tipo} options={TIPOS_CAMPANHA} onChange={valor => setCampo('tipo', valor)} />
            <PillDropdown label="Categoria do badge" value={form.categoria} options={CATEGORIAS} onChange={valor => setCampo('categoria', valor)} />
            <PillDropdown label="Sistema do design" value={form.sistema} options={sistemas} onChange={valor => setCampo('sistema', valor)} placeholder="Sistema" />
          </div>
        </>
      )}

      <div className="overflow-hidden rounded-xl border border-outline-variant shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/40 bg-surface-container-low px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: corAcao }}>
              <span className="material-symbols-outlined text-[18px] leading-none">{iconeCampanha}</span>
            </div>
            {preview ? (
              <p className="m-0 min-w-0 flex-1 truncate text-label-md font-bold text-on-surface">{form.titulo || 'Título da campanha'}</p>
            ) : (
              <input
                value={form.titulo}
                onChange={e => setCampo('titulo', e.target.value)}
                required
                aria-label="Título da campanha"
                placeholder="Título da campanha"
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-label-md font-bold text-on-surface outline-none placeholder:text-outline focus:ring-0"
              />
            )}
          </div>
          {form.permitir_fechar_modal && (
            onFecharPreview ? (
              <button type="button" onClick={onFecharPreview} aria-label="Fechar preview" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-outline transition hover:bg-surface-container hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            ) : (
              <span className="material-symbols-outlined shrink-0 text-[18px] text-outline" title="Fechar">close</span>
            )
          )}
        </div>

        <div className="space-y-3 bg-surface-container-lowest p-4">
          {preview ? (
            form.subtitulo && <p className="m-0 whitespace-pre-wrap text-label-md font-bold" style={{ color: corSubtitulo }}>{form.subtitulo}</p>
          ) : (
            <textarea
              value={form.subtitulo}
              onChange={e => setCampo('subtitulo', e.target.value)}
              aria-label="Subtítulo da campanha"
              placeholder="Subtítulo opcional"
              rows={1}
              style={{ color: corSubtitulo }}
              className="min-h-[20px] w-full resize-none whitespace-pre-wrap border-0 bg-transparent p-0 text-label-md font-bold outline-none placeholder:text-outline focus:ring-0"
            />
          )}
          {mostrarMidia ? (mediaPosition === 'topo' ? blocoMidia : pontoMidia('topo')) : (mediaPosition === 'topo' ? pontoMidia('topo') : null)}
          {blocoDescricao}
          {mostrarMidia ? (mediaPosition === 'antes_cta' ? blocoMidia : pontoMidia('antes_cta')) : (mediaPosition === 'antes_cta' ? pontoMidia('antes_cta') : null)}
          {blocoCta}
          {form.exige_confirmacao_leitura ? (
            <div className="border-t border-outline-variant/40 pt-3">
              {mensagemSimulacao && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-on-surface-variant">
                  <span className="material-symbols-outlined mt-0.5 text-[16px]" style={{ color: mensagemSimulacao.tipo === 'erro' ? '#ba1a1a' : corAcao }}>
                    {mensagemSimulacao.tipo === 'sucesso' ? 'check_circle' : mensagemSimulacao.tipo === 'erro' ? 'error' : 'info'}
                  </span>
                  <p className="m-0 text-[12px] font-semibold leading-4">{mensagemSimulacao.texto}</p>
                </div>
              )}
              {!preview && !form.permitir_fechar_modal && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-on-surface-variant">
                  <span className="material-symbols-outlined mt-0.5 text-[16px]" style={{ color: corAcao }}>lock</span>
                  <p className="m-0 text-[12px] font-semibold leading-4">O usuário não verá botão de fechar. Ele precisa confirmar a leitura para concluir.</p>
                </div>
              )}
              <label className="mb-3 flex items-center gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-body-md font-semibold text-on-surface-variant">
                <input type="checkbox" checked={confirmadoConstrutor} onChange={event => { setConfirmadoConstrutor(event.target.checked); if (mensagemSimulacao?.tipo !== 'sucesso') setMensagemSimulacao(null) }} className="h-4 w-4" />
                Confirmo que li esta comunicação
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!confirmadoConstrutor) { setMensagemSimulacao({ tipo: 'aviso', texto: 'Confirme a leitura para continuar.' }); return }
                  if (preview && onFecharPreview) { onFecharPreview(); return }
                  setMensagemSimulacao({ tipo: 'sucesso', texto: 'Leitura confirmada.' })
                }}
                style={{ backgroundColor: corAcao }}
                className="w-full rounded-lg py-2.5 text-label-md font-bold text-white transition hover:opacity-90"
              >
                Li e entendi
              </button>
            </div>
          ) : blocoFeedback}
        </div>
      </div>
    </article>
  )
}

function PreviewCampanhaModal({ form, sistemas, aparencia, embedUrl, mostrarMidia, mediaPosition, setCampo, onMostrarMidia, onRemoverMidia, onMoverMidia, onClose }: {
  form: FormState
  sistemas: string[]
  aparencia: AparenciaCard | null
  embedUrl: string
  mostrarMidia: boolean
  mediaPosition: PosicaoMidia
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  onMostrarMidia: (posicao?: PosicaoMidia) => void
  onRemoverMidia: () => void
  onMoverMidia: (posicao: PosicaoMidia) => void
  onClose: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Preview da campanha">
      <div className="max-h-[calc(100vh-32px)] w-full max-w-[620px] overflow-y-auto rounded-[28px]">
        <CardEditavel
          form={form}
          sistemas={sistemas}
          aparencia={aparencia}
          embedUrl={embedUrl}
          mostrarMidia={mostrarMidia}
          mediaPosition={mediaPosition}
          arrastandoMidia={false}
          setCampo={setCampo}
          onDragStartMedia={() => {}}
          onMostrarMidia={onMostrarMidia}
          onRemoverMidia={onRemoverMidia}
          onMoverMidia={onMoverMidia}
          onFecharPreview={onClose}
          modo="preview"
        />
      </div>
    </div>,
    document.body
  )
}

export function Campanhas2Index() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(formInicial)
  const [sistemas, setSistemas] = useState<string[]>([])
  const [aparencias, setAparencias] = useState<Record<string, AparenciaCard>>({})
  const [aparenciaDefault, setAparenciaDefault] = useState<AparenciaCard | null>(null)
  const [catalogoTelas, setCatalogoTelas] = useState<TelaCatalogo[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arrastandoMidia, setArrastandoMidia] = useState(false)
  const [mostrarMidia, setMostrarMidia] = useState(true)
  const [mediaPosition, setMediaPosition] = useState<PosicaoMidia>('topo')
  const [previewAberto, setPreviewAberto] = useState(false)
  const [secaoDock, setSecaoDock] = useState<SecaoDock>('destino')

  const embedUrl = useMemo(() => converterVideoEmbed(form.video_url), [form.video_url])
  const aparenciaAtual = useMemo(() => {
    const chave = form.sistema.trim()
    return (chave ? aparencias[chave] : null) ?? aparenciaDefault
  }, [aparenciaDefault, aparencias, form.sistema])

  useEffect(() => {
    let cancelado = false

    async function carregarSistemasEAparencias() {
      const [campanhas, sistemasConfig, aparenciaPadrao] = await Promise.all([
        get<Campanha[]>('/campanhas').catch(() => []),
        get<Sistema[]>('/sistemas?ativo=true').catch(() => []),
        get<AparenciaWidget>('/aparencia-widget/default').catch(() => null),
      ])
      if (cancelado) return

      const identificadores = [
        ...campanhas.map(c => c.sistema).filter(Boolean),
        ...sistemasConfig.map(s => s.identificador).filter(Boolean),
      ]
      const unicos = [...new Set(identificadores)]
      setSistemas(unicos)
      setAparenciaDefault(aparenciaPadrao ? { cor_principal: aparenciaPadrao.cor_principal, logo_url: aparenciaPadrao.logo_url } : null)

      const entries = await Promise.all(unicos.map(sistema =>
        get<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(sistema)}`)
          .then(aparencia => [sistema, { cor_principal: aparencia.cor_principal, logo_url: aparencia.logo_url }] as const)
          .catch(() => [sistema, { cor_principal: null, logo_url: null }] as const)
      ))
      if (!cancelado) setAparencias(Object.fromEntries(entries))
    }

    carregarSistemasEAparencias().catch(() => {})
    get<TelaCatalogo[]>('/catalogo-telas?ativo=true').then(telas => { if (!cancelado) setCatalogoTelas(telas) }).catch(() => {})
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    const sistema = form.sistema.trim()
    if (!sistema || aparencias[sistema]) return
    let cancelado = false

    get<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(sistema)}`)
      .then(aparencia => {
        if (!cancelado) {
          setAparencias(prev => ({ ...prev, [sistema]: { cor_principal: aparencia.cor_principal, logo_url: aparencia.logo_url } }))
        }
      })
      .catch(() => {
        if (!cancelado) setAparencias(prev => ({ ...prev, [sistema]: { cor_principal: null, logo_url: null } }))
      })

    return () => { cancelado = true }
  }, [aparencias, form.sistema])

  function setCampo<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  function selecionarTelaCatalogo(telaId: string) {
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

  useEffect(() => {
    const sistema = form.sistema.trim()
    if (!sistema) return
    const telaAtual = catalogoTelas.find(tela =>
      tela.modo_identificacao === form.modo_identificacao &&
      (tela.tela ?? '') === form.tela &&
      (tela.url_contem ?? '') === form.url_contem &&
      (tela.data_cy ?? '') === form.data_cy
    )
    if (telaAtual && telaAtual.sistema !== sistema) {
      setForm(prev => ({ ...prev, tela: '', url_contem: '', data_cy: '' }))
    }
  }, [catalogoTelas, form.data_cy, form.modo_identificacao, form.sistema, form.tela, form.url_contem])

  function removerMidia() {
    setCampo('video_url', '')
    setCampo('imagem_url', '')
    setMostrarMidia(false)
    setArrastandoMidia(false)
  }

  function moverMidia(posicao: PosicaoMidia) {
    setMediaPosition(posicao)
    setMostrarMidia(true)
    setArrastandoMidia(false)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      const exigeConfirmacao = Boolean(form.exige_confirmacao_leitura)
      const feedbackHabilitado = exigeConfirmacao ? false : form.feedback_habilitado
      const exigeSaidaObrigatoria = !form.permitir_fechar_modal && !exigeConfirmacao && !feedbackHabilitado
      const payload = {
        ...form,
        permitir_fechar_modal: exigeSaidaObrigatoria ? true : form.permitir_fechar_modal,
        feedback_habilitado: feedbackHabilitado,
        observacao_obrigatoria: exigeConfirmacao ? false : form.observacao_obrigatoria,
        subtitulo: form.subtitulo || null,
        imagem_url: normalizarUrl(form.imagem_url) || null,
        video_url: embedUrl || null,
        texto_botao: form.cta_habilitado ? (form.texto_botao.trim() || null) : null,
        url_botao: form.cta_habilitado ? (normalizarUrl(form.url_botao) || null) : null,
        evento: form.evento || null,
        tela: form.modo_identificacao === 'sistema_tela' ? (form.tela || 'Geral') : '',
        data_cy: form.data_cy || null,
        url_contem: normalizarUrlContem(form.url_contem) || null,
        atraso_ms: Number(form.atraso_ms || 800),
        prioridade: Number(form.prioridade || 0),
        ordem: Number(form.ordem || 0),
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        pergunta_feedback: form.pergunta_feedback || null,
        intervalo_reexibicao_dias: form.intervalo_reexibicao_dias !== '' ? Number(form.intervalo_reexibicao_dias) : null,
        reexibir_apos_dias: form.reexibir_apos_dias !== '' ? Number(form.reexibir_apos_dias) : null,
        evento_conclusao: form.evento_conclusao.trim() || null,
        categoria: form.categoria || null,
      }
      const criada = await post<Campanha>('/campanhas', payload)
      navigate(`/campanhas/${criada.id}/preview`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar campanha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5 xl:pr-3">
      <div className="rounded-3xl border border-[#dee3e9] bg-white px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-[24px] font-semibold leading-tight text-[#0a1317]">Crie a campanha construindo seu card</h1>
        </div>
      </div>

      <form onSubmit={salvar} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="mx-auto w-full max-w-[860px] min-w-0 rounded-[32px] border border-[#dee3e9] bg-white p-5 sm:p-6 lg:p-7">
          {erro && <div className="mb-5 rounded-lg border border-[#f0284a] bg-white px-4 py-3 text-[14px] font-semibold text-[#e41e3f]">{erro}</div>}

          <div className="flex justify-center" onDragEnd={() => setArrastandoMidia(false)}>
            <CardEditavel
              form={form}
              sistemas={sistemas}
              aparencia={aparenciaAtual}
              embedUrl={embedUrl}
              mostrarMidia={mostrarMidia}
              mediaPosition={mediaPosition}
              arrastandoMidia={arrastandoMidia}
              setCampo={setCampo}
              onDragStartMedia={() => setArrastandoMidia(true)}
              onMostrarMidia={(posicao = 'topo') => { setMostrarMidia(true); setMediaPosition(posicao) }}
              onRemoverMidia={removerMidia}
              onMoverMidia={moverMidia}
            />
          </div>

        </section>

        <DockLateral
          secao={secaoDock}
          form={form}
          catalogoTelas={catalogoTelas}
          salvando={salvando}
          setCampo={setCampo}
          setSecao={setSecaoDock}
          onSelecionarTela={selecionarTelaCatalogo}
          onLimpar={() => { setForm(formInicial); setMostrarMidia(true); setMediaPosition('topo') }}
          onPreview={() => setPreviewAberto(true)}
          onLista={() => navigate('/campanhas')}
        />
      </form>

      {previewAberto && (
        <PreviewCampanhaModal
          form={form}
          sistemas={sistemas}
          aparencia={aparenciaAtual}
          embedUrl={embedUrl}
          mostrarMidia={mostrarMidia}
          mediaPosition={mediaPosition}
          setCampo={setCampo}
          onMostrarMidia={(posicao = 'topo') => { setMostrarMidia(true); setMediaPosition(posicao) }}
          onRemoverMidia={removerMidia}
          onMoverMidia={moverMidia}
          onClose={() => setPreviewAberto(false)}
        />
      )}
    </div>
  )
}
