import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ResumoConfiguracao } from './ResumoConfiguracao'
import { del, get, post, put } from '../../services/api'
import type { AparenciaWidget, Campanha, Sistema, TelaCatalogo } from '../../types'
import { TelaCatalogoModal, TELA_CATALOGO_EMPTY_FORM, normalizarPathUrl, pathUrlValido } from '../../components/catalogo/TelaCatalogoModal'
import { useAuth } from '../../hooks/useAuth'
import { podeGerenciarModulo } from '../../utils/permissions'
import { DestaqueElementoSimulacao, SeletorDestaqueSimulacao } from '../../components/campanhas/DestaqueElementoSimulacao'
import { criarResolvedorIdDestaque, urlHttpValida } from '../../components/campanhas/DestaqueElementoSimulacao.logic'
import { ReordenarPrioridade } from './ReordenarPrioridade'
import { chaveGrupoConcorrente } from './grupoConcorrente'
import type { ConteudoFormItem, DestaqueFormItem, FormState, FormatoExibicao, ModoNavegacaoConteudo, ModoSegmentacao, TipoDestino } from './campanhaForm.utils'
import {
  FORMATO_DESTAQUE_ELEMENTO,
  TIPOS_CAMPANHA,
  formInicial,
  converterVideoEmbed,
  pareceUrlVideo,
  resolverTipoDestino,
  resolverModoSegmentacao,
  hidratarFormState,
  montarPayloadCampanha,
  resolverConteudosPreview,
  getStatus,
  combinarDataHoraISO,
} from './campanhaForm.utils'

type SecaoDock = 'agendamento' | 'destino' | 'exibicao' | 'feedback' | 'segmentacao'

// Validação client-side da vigência — a validação final é do backend
// (parseDataVigencia / validarPeriodoVigencia em campanhas.ts). Só impede
// submeter combinações obviamente incompletas/inválidas, com mensagem clara.
// Início e fim são independentes: nenhum obriga o outro. Quando o usuário
// escolhe "Em uma data e horário", data E hora são obrigatórias — nunca se
// assume 00:00 aqui (o submit não deve chegar em combinarDataHoraISO com
// hora vazia nesses modos).
function validarVigenciaForm(form: Pick<FormState,
  'modo_inicio' | 'modo_fim' | 'data_inicio_data' | 'data_inicio_hora' | 'data_fim_data' | 'data_fim_hora'
>): string | null {
  if (form.modo_inicio === 'agendado') {
    if (!form.data_inicio_data.trim()) return 'Escolha a data de início da campanha ou selecione "Ao publicar".'
    if (!form.data_inicio_hora.trim()) return 'Informe a hora de início da campanha.'
  }
  if (form.modo_fim === 'em_data') {
    if (!form.data_fim_data.trim()) return 'Escolha a data de término da campanha ou selecione "Sem data final".'
    if (!form.data_fim_hora.trim()) return 'Informe a hora de término da campanha.'
  }
  // Chega aqui só com data+hora preenchidas nos dois lados.
  if (form.modo_inicio === 'agendado' && form.modo_fim === 'em_data') {
    const inicio = new Date(combinarDataHoraISO(form.data_inicio_data, form.data_inicio_hora)).getTime()
    const fim = new Date(combinarDataHoraISO(form.data_fim_data, form.data_fim_hora)).getTime()
    if (Number.isFinite(inicio) && Number.isFinite(fim) && inicio >= fim) {
      return 'A data de início deve ser anterior à data de término.'
    }
  }
  return null
}
type PosicaoMidia = 'topo' | 'antes_cta'
type FrequenciaExibicao = 'uma_vez' | 'ate_responder' | 'reexibir_depois'
type AcaoFinalCampanha = 'feedback' | 'confirmacao' | 'visualizacao'

// Copy contextual de "Reexibir periodicamente" (politica_reexibicao=
// 'reexibir_apos_dias', nome interno inalterado) — só texto/UX, nunca a
// regra: o intervalo sempre conta a partir da AÇÃO final da campanha
// (resposta/confirmação), nunca da mera visualização, quando ela existe
// (ver fonteReferenciaReexibicao em server/src/controllers/widget.ts). Os
// 3 mapas abaixo deixam essa prioridade explícita na interface.
const DESCRICAO_REEXIBIR_PERIODICAMENTE: Record<AcaoFinalCampanha, string> = {
  feedback: 'Após o usuário responder, esta campanha poderá aparecer novamente depois do intervalo definido.',
  confirmacao: 'Após o usuário confirmar, esta campanha poderá aparecer novamente depois do intervalo definido.',
  visualizacao: 'Após a visualização, esta campanha poderá aparecer novamente depois do intervalo definido.',
}
const LABEL_INTERVALO_REEXIBICAO: Record<AcaoFinalCampanha, string> = {
  feedback: 'Intervalo entre respostas (dias)',
  confirmacao: 'Intervalo entre confirmações (dias)',
  visualizacao: 'Intervalo entre exibições (dias)',
}
const VERBO_REEXIBICAO: Record<AcaoFinalCampanha, { acao: string; substantivo: string }> = {
  feedback: { acao: 'responder', substantivo: 'resposta' },
  confirmacao: { acao: 'confirmar', substantivo: 'confirmação' },
  visualizacao: { acao: 'visualizar', substantivo: 'visualização' },
}

type AparenciaCard = Pick<AparenciaWidget, 'cor_principal' | 'logo_url'>

const ICONES_TIPO_CAMPANHA: Record<string, string> = {
  comunicado: 'campaign',
  melhoria: 'rocket_launch',
  pesquisa: 'quiz',
}

function iconeTipoCampanha(tipo: string): string {
  return ICONES_TIPO_CAMPANHA[tipo] ?? 'campaign'
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

function PillDropdown({ label, value, options, onChange, placeholder = 'Selecionar', highlightValue, emptyMessage = 'Defina no dock lateral', manageLabel, onManage }: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  highlightValue?: string
  emptyMessage?: string
  manageLabel?: string
  onManage?: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const opcoes = Array.from(new Set([value, ...options].map(opcao => opcao.trim()).filter(Boolean)))

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto(prev => !prev)}
        onBlur={() => window.setTimeout(() => setAberto(false), 120)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#ced0d4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1c1e21] transition hover:border-[#0064e0] focus:border-[#0064e0] focus:outline-none focus:ring-1 focus:ring-[#0064e0]"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={label}
      >
        <span className="flex max-w-[115px] items-center gap-1 truncate">
          {value && value === highlightValue && <span className="material-symbols-outlined text-[14px] leading-none text-[#0064e0]">star</span>}
          <span className="truncate">{value || placeholder}</span>
        </span>
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
              <span className="inline-flex items-center gap-1.5">
                {opcao === highlightValue && <span className="material-symbols-outlined text-[14px] leading-none">star</span>}
                {opcao}
              </span>
            </button>
          )) : (
            <p className="whitespace-nowrap px-3 py-2 text-[12px] leading-4 text-[#5d6c7b]">{emptyMessage}</p>
          )}
          {onManage && manageLabel && (
            <div className="mt-1 border-t border-[#dee3e9] pt-2">
              <button
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { onManage(); setAberto(false) }}
                className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[14px] font-bold text-[#0064e0] transition hover:bg-[#eff4ff]"
              >
                <span className="material-symbols-outlined text-[18px]">settings</span>
                {manageLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CampoDock({ label, hint, tooltip, value, onChange, placeholder, type = 'text', error }: {
  label: string
  hint?: string
  tooltip?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  error?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#444950]">
        {label}
        {tooltip && (
          <span className="group relative inline-flex">
            <span className="material-symbols-outlined cursor-help text-[16px] text-[#8595a4]">help</span>
            <span className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-xl border border-[#dee3e9] bg-[#0a1317] px-3 py-2 text-[12px] font-semibold leading-4 text-white opacity-0 shadow-[0_12px_30px_rgba(20,22,26,0.22)] transition group-hover:opacity-100 group-focus-within:opacity-100">
              {tooltip}
            </span>
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-[16px] text-[#1c1e21] outline-none transition focus:ring-1 ${error ? 'border-[#e41e3f] focus:border-[#e41e3f] focus:ring-[#e41e3f]' : 'border-[#ced0d4] focus:border-[#0064e0] focus:ring-[#0064e0]'}`}
      />
      {error && <span className="mt-2 flex items-center gap-1 text-[12px] font-semibold leading-4 text-[#c21837]" role="alert"><span className="material-symbols-outlined text-[16px]">error</span>{error}</span>}
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

// Segmentação por domínio (multi-URL do mesmo sistema, ex.: QuarkClinic) —
// seleção múltipla a partir de Sistema.dominios (catálogo do sistema
// selecionado nesta campanha), nunca texto livre: evita erro de digitação
// que silenciosamente nunca bateria no runtime do widget. Valores já salvos
// que não estão mais no catálogo atual (drift histórico, ou Sistema editado
// depois) permanecem selecionados/visíveis — nunca removidos automaticamente
// ao carregar o form; só uma ação explícita do usuário (desmarcar) os tira.
function CampoDominiosDock({ catalogo, value, onChange, onGerenciarSistemas }: {
  catalogo: string[]
  value: string[]
  onChange: (value: string[]) => void
  onGerenciarSistemas?: () => void
}) {
  const foraDoCatalogo = value.filter(v => !catalogo.includes(v))
  // Dedupe defensivo — Sistema.dominios (catálogo, editado como texto livre
  // separado por vírgula em Sistemas.tsx) pode ter uma entrada duplicada por
  // engano. `value`/segmentação continuam intocados — isto só evita repetir a
  // MESMA opção na lista exibida.
  const opcoes = Array.from(new Set([...catalogo, ...foraDoCatalogo]))

  function alternar(dominio: string) {
    onChange(value.includes(dominio) ? value.filter(v => v !== dominio) : [...value, dominio])
  }

  if (opcoes.length === 0) {
    return (
      <CampoWrapperDock label="Domínios permitidos">
        <p className="rounded-lg border border-dashed border-[#ced0d4] bg-white px-3 py-2.5 text-[13px] leading-5 text-[#5d6c7b]">
          Este sistema ainda não tem domínios cadastrados.{' '}
          {onGerenciarSistemas ? (
            <button type="button" onClick={onGerenciarSistemas} className="font-bold text-[#0064e0] underline">
              Cadastre em Configurações → Sistemas
            </button>
          ) : (
            'Peça a um administrador para cadastrá-los em Configurações → Sistemas.'
          )}
          {' '}pra poder restringir esta campanha a um ou mais deles.
        </p>
      </CampoWrapperDock>
    )
  }

  return (
    <CampoWrapperDock label="Domínios permitidos" hint="Nenhum selecionado = todos os domínios cadastrados no sistema.">
      <div className="flex flex-wrap gap-2">
        {opcoes.map(dominio => {
          const selecionado = value.includes(dominio)
          return (
            <button
              key={dominio}
              type="button"
              aria-pressed={selecionado}
              onClick={() => alternar(dominio)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold leading-4 transition-colors ${selecionado ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be] hover:bg-[#e2ecff]' : 'border-[#ced0d4] bg-white text-[#1c1e21] hover:bg-[#f2f3f5]'}`}
            >
              {selecionado && <IconeCheck />}
              {dominio}
              {!catalogo.includes(dominio) && <span className="text-[11px] font-normal text-[#8595a4]">(fora do catálogo atual)</span>}
            </button>
          )
        })}
      </div>
    </CampoWrapperDock>
  )
}

function CampoWrapperDock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[13px] font-bold leading-4 text-[#1c1e21]">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-[12px] leading-4 text-[#8595a4]">{hint}</span>}
    </div>
  )
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path d="M3 8.5l3 3 7-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function alvoTelaCatalogo(tela: TelaCatalogo): string {
  return tela.tela ?? tela.url_contem ?? tela.data_cy ?? 'Sem alvo definido'
}

function SeletorTelaCatalogo({ telas, selecionada, disabled, onSelecionar, onCriar }: {
  telas: TelaCatalogo[]
  selecionada: TelaCatalogo | undefined
  disabled?: boolean
  onSelecionar: (telaId: string) => void
  // Opcional (Fase 5) — undefined quando o usuário não tem
  // CONFIGURACOES.GERENCIAR, esconde o botão "+" e a sugestão "Criar tela".
  // Selecionar uma tela já existente continua sempre disponível.
  onCriar?: (busca?: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setAberto(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [aberto])

  const termo = busca.trim().toLowerCase()
  const filtradas = termo
    ? telas.filter(tela => [tela.nome, alvoTelaCatalogo(tela)].some(valor => valor.toLowerCase().includes(termo)))
    : telas
  const temIgual = termo
    ? telas.some(tela => [tela.nome, alvoTelaCatalogo(tela)].some(valor => valor.trim().toLowerCase() === termo))
    : false
  const mostrarCriar = !disabled && Boolean(termo) && !temIgual && Boolean(onCriar)

  return (
    <div className="relative" ref={ref}>
      <div className={`flex min-h-11 w-full items-stretch overflow-hidden border border-[#ced0d4] bg-white text-[16px] text-[#1c1e21] transition focus-within:border-[#0064e0] focus-within:ring-1 focus-within:ring-[#0064e0] hover:border-[#0064e0] ${aberto ? 'rounded-t-2xl rounded-b-none border-[#0064e0]' : 'rounded-2xl'}`}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-[20px] text-[#8595a4]">search</span>
          <input
            disabled={disabled}
            value={aberto ? busca : (busca || selecionada?.nome || '')}
            onFocus={() => setAberto(true)}
            onClick={() => setAberto(true)}
            onChange={event => { setBusca(event.target.value); setAberto(true) }}
            placeholder="Buscar ou selecionar tela..."
            className="h-full min-h-11 w-full border-0 bg-transparent py-2 pl-10 pr-10 text-[16px] font-semibold text-[#1c1e21] outline-none placeholder:text-[#8595a4] disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#8595a4]"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAberto(prev => !prev)}
            aria-label={aberto ? 'Fechar lista de telas' : 'Abrir lista de telas'}
            className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#8595a4] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:text-[#8595a4]"
          >
            <span className={`material-symbols-outlined text-[18px] transition-transform ${aberto ? 'rotate-180' : ''}`}>expand_more</span>
          </button>
        </div>
        {onCriar && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setAberto(false); setBusca(''); onCriar() }}
            aria-label="Criar nova tela"
            title="Criar nova tela"
            className="flex w-9 shrink-0 items-center justify-center border-l border-[#dee3e9] text-[#0064e0] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#8595a4]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        )}
      </div>

      {aberto && !disabled && (
        <div className="absolute left-0 top-full z-40 w-full overflow-hidden rounded-b-2xl border border-t-0 border-[#0064e0] bg-white shadow-[0_16px_36px_rgba(20,22,26,0.12)]">
          <div className="max-h-[168px] overflow-y-auto p-2">
            {filtradas.length > 0 ? filtradas.map(tela => (
              <button
                key={tela.id}
                type="button"
                onClick={() => { onSelecionar(tela.id); setAberto(false); setBusca('') }}
                className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${selecionada?.id === tela.id ? 'bg-[#eff4ff] text-[#0064e0]' : 'text-[#1c1e21] hover:bg-[#f8f9ff]'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold leading-5">{tela.nome}</span>
                  <span className="mt-0.5 block truncate text-[12px] font-semibold leading-4 text-[#5d6c7b]">{alvoTelaCatalogo(tela)}</span>
                </span>
                {selecionada?.id === tela.id && <span className="material-symbols-outlined mt-0.5 text-[16px]">check</span>}
              </button>
            )) : (
              <p className="px-3 py-4 text-center text-[12px] font-semibold leading-4 text-[#5d6c7b]">Nenhuma tela encontrada.</p>
            )}
          </div>

          {mostrarCriar && (
            <div className="border-t border-[#dee3e9] p-2">
              <button
                type="button"
                onClick={() => { onCriar?.(busca.trim() || undefined); setAberto(false); setBusca('') }}
                className="flex w-full items-center gap-2 rounded-xl bg-[#0064e0] px-3 py-2.5 text-left text-[14px] font-bold text-white transition hover:bg-[#0457cb]"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Criar tela "{busca.trim()}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DockLateral({
  secao, form, catalogoTelas, sistemasConfig, temSistemas, salvando, editando, temGrupoConcorrente, campanhaEncerrada, setCampo, setSecao,
  onSelecionarTela, onAdicionarTela, onGerenciarSistemas, onLimpar, onPreview, onDefinirPrioridade,
  conteudoAtivo, onSelecionarConteudo, conteudosMax, adicionarConteudo, removerConteudo, moverConteudo, selecionarModoNavegacao, camposConteudo, resolverIdConteudo,
}: {
  secao: SecaoDock
  form: FormState
  catalogoTelas: TelaCatalogo[]
  sistemasConfig: Sistema[]
  temSistemas: boolean
  salvando: boolean
  editando: boolean
  // true só quando editando uma campanha cuja leitura de período já é
  // "Encerrada" (getStatus) — a aba de vigência vira somente-leitura pro fim
  // (regra: só existe Encerrar, nunca Reabrir por edição de data_fim).
  campanhaEncerrada: boolean
  // Só true quando a campanha já salva tem 1+ concorrente (mesmo grupo, ver
  // chaveGrupoConcorrente em grupoConcorrente.ts) — controla se o botão
  // "Definir prioridade de exibição" aparece abaixo.
  temGrupoConcorrente: boolean
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  setSecao: (secao: SecaoDock) => void
  onSelecionarTela: (telaId: string) => void
  // Ambos opcionais (Fase 5) — undefined quando o usuário não tem
  // CONFIGURACOES.GERENCIAR, escondendo os atalhos de criação inline (ver
  // CampanhaFormIndex). Selecionar uma tela/sistema já existente continua
  // sempre disponível, independente disso.
  onAdicionarTela?: (busca?: string) => void
  onGerenciarSistemas?: () => void
  onLimpar: () => void
  onPreview: () => void
  onDefinirPrioridade: () => void
  // Etapa 9 — estado/handlers de `conteudos` levantados pra CampanhaFormIndex
  // (antes viviam só aqui): CardEditavel (o Preview editável) também precisa
  // do MESMO índice ativo e das mesmas mutações, pra Preview e dock nunca
  // divergirem sobre "qual conteúdo está selecionado" nem duplicarem estado
  // (ver comentário em CampanhaFormIndex).
  conteudoAtivo: number | null
  onSelecionarConteudo: (indice: number | null) => void
  conteudosMax: number
  adicionarConteudo: () => void
  removerConteudo: (indice: number) => void
  moverConteudo: (indice: number, direcao: -1 | 1) => void
  selecionarModoNavegacao: (modo: ModoNavegacaoConteudo) => void
  camposConteudo: (indice: number) => ReactNode
  resolverIdConteudo: (item: ConteudoFormItem) => string
}) {
  // Inicializado a partir do form já hidratado (DockLateral só monta depois
  // que carregandoCampanha vira false — ver early return em Index) em vez
  // de hardcoded 'todos', senão o seletor mostrava "Todos" mesmo quando a
  // campanha salva era "Por cliente"/"Por perfil"/combinada.
  const [modoSegmentacao, setModoSegmentacao] = useState<ModoSegmentacao>(() => resolverModoSegmentacao(form))
  // Índice do destaque com os campos abertos pra edição — só 1 por vez
  // (mesmo padrão de "editar" expansível usado em outras listas do dock).
  const [destaqueExpandido, setDestaqueExpandido] = useState<number | null>(0)
  const resolverIdDestaque = useRef(criarResolvedorIdDestaque()).current
  const formatoExibicao: FormatoExibicao = form.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO
    ? FORMATO_DESTAQUE_ELEMENTO
    : 'modal_automatica'

  function adicionarDestaque() {
    const novoIndice = form.destaques.length
    setCampo('destaques', [...form.destaques, {
      data_cy: '', texto_badge: '', titulo: '', descricao: '', cta_habilitado: false, texto_botao: '', url_botao: '',
    }])
    setDestaqueExpandido(novoIndice)
  }

  function removerDestaque(indice: number) {
    if (form.destaques.length <= 1) return // sempre precisa de pelo menos 1
    setCampo('destaques', form.destaques.filter((_, i) => i !== indice))
    setDestaqueExpandido(prev => (prev === indice ? null : prev !== null && prev > indice ? prev - 1 : prev))
  }

  function moverDestaque(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= form.destaques.length) return
    const lista = form.destaques.slice()
    const temp = lista[indice]
    lista[indice] = lista[alvo]
    lista[alvo] = temp
    setCampo('destaques', lista)
    setDestaqueExpandido(prev => (prev === indice ? alvo : prev === alvo ? indice : prev))
  }

  function atualizarDestaque<K extends keyof DestaqueFormItem>(indice: number, campo: K, valor: DestaqueFormItem[K]) {
    setCampo('destaques', form.destaques.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)))
  }

  // Destaque em elemento não tem feedback/confirmação nesta fase (fora de
  // escopo — ver comentário em selecionarFormatoExibicao) — a aba some em
  // vez de mostrar opções que não fazem sentido pro formato.
  // Ordem das abas (fluxo natural: o que mostrar -> onde mostrar -> pra quem
  // mostrar -> que resposta coletar) — só a ORDEM de exibição/navegação, sem
  // mudar conteúdo, validação, estado ou payload de nenhuma etapa.
  const secoes: Array<{ id: SecaoDock; label: string }> = [
    { id: 'exibicao', label: 'Exibição' },
    { id: 'agendamento', label: 'Agendamento e vigência' },
    { id: 'destino', label: 'Destino' },
    { id: 'segmentacao', label: 'Segmentação' },
    ...(formatoExibicao === FORMATO_DESTAQUE_ELEMENTO ? [] : [{ id: 'feedback' as const, label: 'Feedback' }]),
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
  const frequenciaExibicao: FrequenciaExibicao = form.politica_reexibicao === 'reexibir_apos_dias'
    ? 'reexibir_depois'
    : form.politica_reexibicao === 'ate_responder_ou_confirmar'
      ? 'ate_responder'
      : 'uma_vez'
  const acaoFinal: AcaoFinalCampanha = form.feedback_habilitado
    ? 'feedback'
    : form.exige_confirmacao_leitura
      ? 'confirmacao'
      : 'visualizacao'

  function resetarFrequenciaAteResponder() {
    if (form.politica_reexibicao === 'ate_responder_ou_confirmar') {
      setCampo('mostrar_uma_vez', true)
      setCampo('politica_reexibicao', 'uma_vez_apos_visualizacao')
      setCampo('reexibir_apos_dias', '')
    }
  }

  function selecionarAcaoFinal(acao: AcaoFinalCampanha) {
    if (acao === 'feedback') {
      setCampo('feedback_habilitado', true)
      setCampo('exige_confirmacao_leitura', false)
      setCampo('permitir_fechar_modal', true)
      return
    }

    setCampo('feedback_habilitado', false)
    setCampo('observacao_obrigatoria', false)
    resetarFrequenciaAteResponder()

    if (acao === 'confirmacao') {
      setCampo('exige_confirmacao_leitura', true)
      setCampo('permitir_fechar_modal', true)
      return
    }

    setCampo('exige_confirmacao_leitura', false)
    setCampo('permitir_fechar_modal', true)
  }

  function selecionarFrequenciaExibicao(frequencia: FrequenciaExibicao) {
    if (frequencia === 'ate_responder' && !form.feedback_habilitado && !form.exige_confirmacao_leitura) return

    if (frequencia === 'uma_vez') {
      setCampo('mostrar_uma_vez', true)
      setCampo('politica_reexibicao', 'uma_vez_apos_visualizacao')
      setCampo('reexibir_apos_dias', '')
      return
    }

    if (frequencia === 'reexibir_depois') {
      setCampo('mostrar_uma_vez', false)
      setCampo('politica_reexibicao', 'reexibir_apos_dias')
      if (!form.reexibir_apos_dias.trim()) setCampo('reexibir_apos_dias', '7')
      return
    }

    setCampo('mostrar_uma_vez', false)
    setCampo('politica_reexibicao', 'ate_responder_ou_confirmar')
    setCampo('reexibir_apos_dias', '')
  }
  const tipoDestino = resolverTipoDestino(form)

  function selecionarTipoDestino(tipo: TipoDestino) {
    if (tipo === 'tela') {
      setCampo('gatilho', 'ao_abrir_tela')
      setCampo('modo_identificacao', 'sistema_tela')
      setCampo('evento', '')
      setCampo('data_cy', '')
      setCampo('url_contem', '')
      return
    }

    if (tipo === 'data_cy') {
      setCampo('gatilho', 'ao_abrir_tela')
      setCampo('modo_identificacao', 'data_cy')
      setCampo('evento', '')
      setCampo('tela', '')
      setCampo('url_contem', '')
      return
    }

    if (tipo === 'url') {
      setCampo('gatilho', 'ao_abrir_tela')
      setCampo('modo_identificacao', 'url_contem')
      setCampo('evento', '')
      setCampo('tela', '')
      setCampo('data_cy', '')
      return
    }

    setCampo('gatilho', 'apos_evento')
    setCampo('modo_identificacao', 'sistema_tela')
    setCampo('data_cy', '')
    setCampo('url_contem', '')
  }

  function selecionarFormatoExibicao(formato: FormatoExibicao) {
    if (formato === FORMATO_DESTAQUE_ELEMENTO) {
      setCampo('modo_exibicao', FORMATO_DESTAQUE_ELEMENTO)
      // Destaque em elemento só existe ancorado a um elemento — mesma
      // seleção que "Ao encontrar um elemento" no destino (força
      // modo_identificacao=data_cy; o backend também força isso, nunca
      // confia só no que o front manda).
      setCampo('gatilho', 'ao_abrir_tela')
      setCampo('modo_identificacao', 'data_cy')
      setCampo('evento', '')
      setCampo('tela', '')
      setCampo('url_contem', '')
      // Sem feedback/confirmação/CSAT nesta fase (fora de escopo) — e sempre
      // dispensável, já que não faz sentido um badge/tooltip bloquear a tela.
      setCampo('feedback_habilitado', false)
      setCampo('exige_confirmacao_leitura', false)
      setCampo('observacao_obrigatoria', false)
      setCampo('permitir_fechar_modal', true)
      if (form.politica_reexibicao === 'ate_responder_ou_confirmar') {
        setCampo('politica_reexibicao', 'uma_vez_apos_visualizacao')
      }
      // Ao criar, inicia com 1 item — semeado a partir dos campos únicos que
      // já estavam preenchidos (ex.: admin digitou título/descrição antes de
      // trocar o formato), pra não perder o que já tinha sido digitado. Uma
      // campanha carregada do backend (edição) já chega com `destaques`
      // populado pelo useEffect de carregamento — nunca reseta aqui.
      if (form.destaques.length === 0) {
        setCampo('destaques', [{
          data_cy: form.data_cy,
          texto_badge: form.subtitulo,
          titulo: form.titulo,
          descricao: form.descricao,
          cta_habilitado: form.cta_habilitado,
          texto_botao: form.texto_botao,
          url_botao: form.url_botao,
        }])
      }
      if (secao === 'feedback') setSecao('exibicao')
      return
    }

    setCampo('modo_exibicao', 'modal_automatica')
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

  function selecionarModoSegmentacao(modo: ModoSegmentacao) {
    setModoSegmentacao(modo)

    if (modo === 'todos') {
      setCampo('segmentar_cliente_ids', [])
      setCampo('segmentar_unidade_ids', [])
      setCampo('segmentar_perfis', [])
      setCampo('segmentar_usuario_tipos', [])
      setCampo('segmentar_estados', [])
      return
    }

    if (modo === 'cliente') {
      setCampo('segmentar_perfis', [])
      setCampo('segmentar_usuario_tipos', [])
      setCampo('segmentar_estados', [])
      return
    }

    if (modo === 'perfil') {
      setCampo('segmentar_cliente_ids', [])
      setCampo('segmentar_unidade_ids', [])
    }
  }

  return (
    <aside className="w-full self-start rounded-3xl border border-[#dee3e9] bg-white/95 p-5 shadow-[0_18px_50px_rgba(20,22,26,0.12)] backdrop-blur">
      <div className="mb-5 border-b border-[#dee3e9] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#0064e0]">
            <span className="material-symbols-outlined text-[19px]">tune</span>
          </span>
          <div>
            <p className="text-[22px] font-semibold leading-tight text-[#0a1317]">Configurações</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-[#f8f9ff] p-2">
          <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5d6c7b]">Etapas</p>
          <div className="flex flex-wrap gap-2">
          {secoes.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSecao(item.id)}
              className={`rounded-full border px-4 py-1.5 text-[14px] font-semibold transition ${secao === item.id ? 'border-[#0064e0] bg-[#0064e0] text-white' : 'border-[#ced0d4] bg-white text-[#1c1e21] hover:border-[#0064e0] hover:text-[#0064e0]'}`}
            >
              {item.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div>
      <div className="mb-5 rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] p-4">
        <CampoDock label="Nome da campanha" hint="Usado apenas para identificar e buscar esta campanha na gestão." value={form.nome_interno} onChange={valor => setCampo('nome_interno', valor)} placeholder="Ex.: Onboarding - novo dashboard" />
      </div>
      {secao === 'destino' && (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Quando esta campanha aparece?</span>
            <div className="grid gap-2">
              {[
                { id: 'tela' as const, icon: 'web_asset', titulo: 'Ao abrir uma tela', desc: 'Use uma tela cadastrada ou adicione uma nova ao catálogo.' },
                { id: 'data_cy' as const, icon: 'ads_click', titulo: 'Ao encontrar um elemento', desc: 'Mostra quando um elemento específico estiver disponível na página.' },
                { id: 'acao' as const, icon: 'bolt', titulo: 'Depois de uma ação', desc: 'Mostra somente quando o sistema disparar um evento pelo widget.' },
              ].map(opcao => {
                // Destaque em elemento só existe ancorado por data-cy — as
                // outras duas formas de destino não fazem sentido pra ele.
                const desabilitado = formatoExibicao === FORMATO_DESTAQUE_ELEMENTO && opcao.id !== 'data_cy'
                return (
                  <button
                    key={opcao.id}
                    type="button"
                    onClick={() => selecionarTipoDestino(opcao.id)}
                    disabled={desabilitado}
                    title={desabilitado ? 'O formato "Destaque em elemento" exige localizar o elemento por data-cy.' : undefined}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${desabilitado ? 'cursor-not-allowed border-[#dee3e9] bg-[#f1f3f5] text-[#9aa3ad]' : tipoDestino === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                  >
                    <span className={`material-symbols-outlined mt-0.5 text-[20px] ${desabilitado ? 'text-[#a8b0b8]' : tipoDestino === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                      <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {tipoDestino === 'tela' && (
            <>
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Tela cadastrada</span>
                {!sistemaSelecionado ? (
                  <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
                    {temSistemas ? 'Selecione um sistema no card para listar as telas cadastradas.' : 'Este cliente ainda não tem sistemas cadastrados. Crie um sistema antes de escolher telas para a campanha.'}
                    {!temSistemas && onGerenciarSistemas && (
                      <a
                        onClick={onGerenciarSistemas}
                        className="mt-3 inline-flex items-center gap-1.5 text-[#0064e0] hover:text-[#0457cb] hover:underline text-[12px] font-bold transition"
                      >
                        Criar sistema
                      </a>
                    )}
                  </div>
                ) : (
                  <SeletorTelaCatalogo
                    telas={telasDoSistema}
                    selecionada={telaSelecionada}
                    onSelecionar={onSelecionarTela}
                    onCriar={onAdicionarTela}
                  />
                )}
              </div>
            </>
          )}

          {tipoDestino === 'data_cy' && (
            formatoExibicao === FORMATO_DESTAQUE_ELEMENTO ? (
              // Destaque em elemento tem N destaques independentes, cada um
              // com seu próprio data-cy — não faz mais sentido um campo
              // único aqui. Configuração real fica na aba Exibição.
              <p className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
                Este formato tem vários destaques independentes, cada um com seu próprio data-cy. Configure-os na aba <strong>Exibição</strong>.
              </p>
            ) : (
              <CampoDock
                label="data-cy"
                value={form.data_cy}
                onChange={valor => setCampo('data_cy', valor)}
                placeholder="botao-finalizar-compra"
                tooltip="Informe o valor do atributo data-cy do elemento. O widget usa esse identificador técnico para saber quando esse elemento existe na tela."
                hint="Exemplo: botao-finalizar-compra."
              />
            )
          )}

          {tipoDestino === 'url' && (
            <CampoDock
              label="Caminho da URL"
              value={form.url_contem}
              onChange={valor => setCampo('url_contem', valor)}
              placeholder="/app/faturamento"
              tooltip="Informe um caminho relativo da URL (sem domínio). O widget mostra a campanha quando o caminho atual contiver esse valor."
              hint="Exemplo: /app/faturamento."
            />
          )}

          {tipoDestino === 'acao' && (
            <CampoDock
              label="Evento da ação"
              value={form.evento}
              onChange={valor => setCampo('evento', valor)}
              placeholder="checkout_concluido"
              hint="Esse nome precisa ser o mesmo enviado pelo sistema quando a ação acontecer."
            />
          )}
        </div>
      )}

      {secao === 'exibicao' && (
        <div className="space-y-5">
          {/* Fase 2 dos 3 status — sem checkbox de "ativa" aqui: toda campanha
              nova nasce RASCUNHO (decidido só pelo backend) e salvar
              alterações preserva o status atual. Publicar/desativar/reativar
              são ações explícitas em Preview.tsx e na listagem, nunca um
              campo deste formulário. */}
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Formato de exibição</span>
            <div className="grid gap-2">
              {[
                { id: 'modal_automatica' as const, icon: 'chat_bubble', titulo: 'Modal automática', desc: 'Card completo, com mídia e feedback opcional.' },
                { id: FORMATO_DESTAQUE_ELEMENTO, icon: 'new_releases', titulo: 'Destaque em elemento', desc: 'Badge "Novo" ancorado num elemento da tela, com tooltip ao clicar.' },
              ].map(opcao => (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => selecionarFormatoExibicao(opcao.id)}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${formatoExibicao === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                >
                  <span className={`material-symbols-outlined mt-0.5 text-[20px] ${formatoExibicao === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {formatoExibicao === FORMATO_DESTAQUE_ELEMENTO ? (
            <div className="space-y-3 rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-bold text-[#0a1317]">Destaques da campanha</span>
                <button
                  type="button"
                  onClick={adicionarDestaque}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#0064e0] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#0457cb]"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar destaque
                </button>
              </div>

              {form.destaques.map((item, indice) => {
                const expandido = destaqueExpandido === indice
                return (
                  <div key={item.id ?? resolverIdDestaque(item)} className="rounded-xl border border-[#dee3e9] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setDestaqueExpandido(expandido ? null : indice)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-[13px] font-bold text-[#1c1e21]">{item.titulo.trim() || `Destaque ${indice + 1}`}</p>
                        <p className="truncate text-[11px] font-semibold text-[#8595a4]">
                          {item.data_cy.trim() ? `[data-cy="${item.data_cy.trim()}"]` : 'Sem data-cy configurado'}
                          {item.texto_badge.trim() ? ` · ${item.texto_badge.trim()}` : ''}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => moverDestaque(indice, -1)} disabled={indice === 0} title="Subir" aria-label="Subir destaque" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                        </button>
                        <button type="button" onClick={() => moverDestaque(indice, 1)} disabled={indice === form.destaques.length - 1} title="Descer" aria-label="Descer destaque" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                        </button>
                        <button type="button" onClick={() => setDestaqueExpandido(expandido ? null : indice)} title="Editar" aria-label="Editar destaque" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7]">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button type="button" onClick={() => removerDestaque(indice)} disabled={form.destaques.length <= 1} title="Remover" aria-label="Remover destaque" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#e41e3f] transition hover:bg-[#fdecef] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {expandido && (
                      <div className="mt-3 space-y-3 border-t border-[#eef1f5] pt-3">
                        <CampoDock
                          label="data-cy"
                          value={item.data_cy}
                          onChange={valor => atualizarDestaque(indice, 'data_cy', valor)}
                          placeholder="filtro-status"
                          tooltip="Informe o valor do atributo data-cy do elemento alvo deste destaque. O widget usa esse identificador técnico para saber quando o elemento existe na tela."
                          hint="Exemplo: filtro-status."
                        />
                        <CampoDock
                          label="Texto do badge"
                          value={item.texto_badge}
                          onChange={valor => atualizarDestaque(indice, 'texto_badge', valor)}
                          placeholder="Novo"
                          hint='Selo mostrado ao lado do elemento. Em branco, mostramos "Novo".'
                        />
                        <CampoDock label="Título" value={item.titulo} onChange={valor => atualizarDestaque(indice, 'titulo', valor)} placeholder="Título da novidade" />
                        <label className="block">
                          <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Descrição</span>
                          <textarea
                            value={item.descricao}
                            onChange={event => atualizarDestaque(indice, 'descricao', event.target.value)}
                            rows={3}
                            placeholder="Explique brevemente a novidade para o usuário."
                            className="w-full rounded-lg border border-[#ced0d4] bg-white px-3 py-2 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
                          />
                        </label>
                        <CampoBooleanoDock label="Mostrar botão de ação (CTA)" checked={item.cta_habilitado} onChange={valor => atualizarDestaque(indice, 'cta_habilitado', valor)} />
                        {item.cta_habilitado && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <CampoDock label="Texto do botão" value={item.texto_botao} onChange={valor => atualizarDestaque(indice, 'texto_botao', valor)} placeholder="Saiba mais" />
                            <CampoDock
                              label="Link do botão"
                              value={item.url_botao}
                              onChange={valor => atualizarDestaque(indice, 'url_botao', valor)}
                              placeholder="https://"
                              error={!urlHttpValida(item.url_botao) ? 'Informe uma URL válida iniciando com http:// ou https://.' : undefined}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <p className="text-[11px] font-semibold leading-4 text-[#8595a4]">O usuário sempre pode dispensar cada destaque — não é possível torná-lo obrigatório.</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3">
              <div>
                <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Modo de navegação</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: 'SCROLL' as ModoNavegacaoConteudo, icon: 'view_agenda', titulo: 'Sequência (SCROLL)', desc: 'Os conteúdos aparecem em sequência vertical, um abaixo do outro.' },
                    { id: 'SLIDES' as ModoNavegacaoConteudo, icon: 'view_carousel', titulo: 'Slides', desc: 'O usuário navega com anterior/próximo (e arrastando no celular).' },
                  ].map(opcao => (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => selecionarModoNavegacao(opcao.id)}
                      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${form.modo_navegacao === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                    >
                      <span className={`material-symbols-outlined mt-0.5 text-[20px] ${form.modo_navegacao === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                        <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[#eef1f5] pt-3">
                <span className="text-[14px] font-bold text-[#0a1317]">Conteúdos da campanha</span>
                <button
                  type="button"
                  onClick={adicionarConteudo}
                  disabled={form.conteudos.length >= conteudosMax}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#0064e0] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#0457cb] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar conteúdo
                </button>
              </div>

              {form.conteudos.map((item, indice) => {
                const expandido = conteudoAtivo === indice
                return (
                  <div key={item.id ?? resolverIdConteudo(item)} className="rounded-xl border border-[#dee3e9] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelecionarConteudo(expandido ? null : indice)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-[13px] font-bold text-[#1c1e21]">{item.titulo.trim() || `Conteúdo ${indice + 1}`}</p>
                        <p className="truncate text-[11px] font-semibold text-[#8595a4]">Conteúdo {indice + 1} de {form.conteudos.length}</p>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => moverConteudo(indice, -1)} disabled={indice === 0} title="Subir" aria-label="Subir conteúdo" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                        </button>
                        <button type="button" onClick={() => moverConteudo(indice, 1)} disabled={indice === form.conteudos.length - 1} title="Descer" aria-label="Descer conteúdo" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                        </button>
                        <button type="button" onClick={() => onSelecionarConteudo(expandido ? null : indice)} title="Editar" aria-label="Editar conteúdo" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5d6c7b] transition hover:bg-[#f1f4f7]">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button type="button" onClick={() => removerConteudo(indice)} disabled={form.conteudos.length <= 1} title="Remover" aria-label="Remover conteúdo" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#e41e3f] transition hover:bg-[#fdecef] disabled:cursor-not-allowed disabled:opacity-30">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {expandido && (
                      <div className="mt-3 space-y-3 border-t border-[#eef1f5] pt-3">
                        {camposConteudo(indice)}
                      </div>
                    )}
                  </div>
                )
              })}

              <p className="text-[11px] font-semibold leading-4 text-[#8595a4]">Cada bloco é um conteúdo/melhoria mostrado ao usuário — mínimo 1, máximo {conteudosMax}.</p>
            </div>
          )}

          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Com que frequência esta campanha deve aparecer?</span>
            <div className="grid gap-2">
              {[
                // "Uma vez" persiste exatamente igual pros demais formatos
                // (mostrar_uma_vez=true / politica_reexibicao=
                // 'uma_vez_apos_visualizacao', sem mudança de schema) — só o
                // rótulo muda pra destaque_elemento, porque nesse formato
                // markShown só roda numa interação explícita (clicar no
                // badge/CTA ou dispensar), nunca só por o badge ter
                // renderizado. Ver destaqueElementoMontar em widget.js.
                formatoExibicao === FORMATO_DESTAQUE_ELEMENTO
                  ? { id: 'uma_vez' as const, icon: 'touch_app', titulo: 'Até interagir', desc: 'Continua destacando a novidade até o usuário interagir ou dispensá-la.' }
                  : { id: 'uma_vez' as const, icon: 'looks_one', titulo: 'Uma vez', desc: 'Mostra uma única vez para cada usuário.' },
                { id: 'ate_responder' as const, icon: 'repeat', titulo: 'Até responder ou confirmar', desc: 'Continua aparecendo até o usuário responder ou confirmar.' },
                { id: 'reexibir_depois' as const, icon: 'event_repeat', titulo: 'Reexibir periodicamente', desc: DESCRICAO_REEXIBIR_PERIODICAMENTE[acaoFinal] },
              ].map(opcao => {
                const desabilitado = opcao.id === 'ate_responder' && !form.feedback_habilitado && !form.exige_confirmacao_leitura
                const selecionado = frequenciaExibicao === opcao.id
                return (
                  <button
                    key={opcao.id}
                    type="button"
                    onClick={() => selecionarFrequenciaExibicao(opcao.id)}
                    disabled={desabilitado}
                    title={desabilitado ? 'Ative feedback ou confirmação de leitura para usar esta frequência.' : undefined}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${desabilitado ? 'cursor-not-allowed border-[#dee3e9] bg-[#f1f3f5] text-[#9aa3ad]' : selecionado ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                  >
                    <span className={`material-symbols-outlined mt-0.5 text-[20px] ${desabilitado ? 'text-[#a8b0b8]' : selecionado ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                      <span className={`mt-0.5 block text-[12px] font-semibold leading-4 ${desabilitado ? 'text-[#8d98a3]' : 'text-[#5d6c7b]'}`}>
                        {desabilitado ? 'Ative feedback ou confirmação para manter a campanha aparecendo até a ação final.' : opcao.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {frequenciaExibicao === 'reexibir_depois' && (() => {
            const dias = Number(form.reexibir_apos_dias)
            const diasValido = form.reexibir_apos_dias.trim() !== '' && Number.isFinite(dias) && dias > 0
            const { acao, substantivo } = VERBO_REEXIBICAO[acaoFinal]
            return (
              <CampoDock
                label={LABEL_INTERVALO_REEXIBICAO[acaoFinal]}
                value={form.reexibir_apos_dias}
                onChange={valor => setCampo('reexibir_apos_dias', valor)}
                type="number"
                hint={diasValido
                  ? `Exemplo: se o usuário ${acao} hoje, poderá receber esta campanha novamente em ${dias} dia(s). Cada nova ${substantivo} reinicia a contagem.`
                  : undefined}
              />
            )
          })()}

          <CampoDock label="Tempo antes de aparecer (ms)" value={form.atraso_ms} onChange={valor => setCampo('atraso_ms', valor)} type="number" />
          {/* Prioridade não é mais digitada aqui — ordenação visual (setas
              ↑/↓, mesmo componente ReordenarPrioridade.tsx usado na listagem
              de Campanhas, aberto aqui como overlay sobre o próprio
              formulário — ver reordenarAberto/onSaved em
              CampanhaFormIndex) define a prioridade de exibição entre
              campanhas concorrentes (mesmo grupo: sistema/tela ou
              url_contem + gatilho). O valor atual de form.prioridade
              continua sendo carregado/reenviado sem alteração (ver
              hidratarFormState/montarPayloadCampanha), só não é mais
              editável por aqui — só o botão abaixo (visível apenas ao
              editar uma campanha com concorrente) muda a prioridade. */}
          {editando && temGrupoConcorrente && (
            <Button type="button" variant="ghost" size="sm" onClick={onDefinirPrioridade}>
              Definir prioridade de exibição
            </Button>
          )}
        </div>
      )}

      {secao === 'agendamento' && (() => {
        // Início e fim são INDEPENDENTES — trocar um nunca mexe no outro.
        // "Ao publicar" mantém modo_inicio='imediato' (data_inicio: null no
        // payload); "Sem data final" mantém modo_fim='sem_data' (data_fim: null).
        // Os pares (data, hora) preservam o valor já digitado ao alternar de
        // modo, então voltar pra "Em uma data e horário" reaproveita o que
        // estava lá. A validação de ordem é só um aviso aqui — o backend
        // valida de verdade (parseDataVigencia / validarPeriodoVigencia).
        const inicioMs = form.modo_inicio === 'agendado' && form.data_inicio_data.trim()
          ? new Date(combinarDataHoraISO(form.data_inicio_data, form.data_inicio_hora)).getTime()
          : NaN
        const fimMs = form.modo_fim === 'em_data' && form.data_fim_data.trim()
          ? new Date(combinarDataHoraISO(form.data_fim_data, form.data_fim_hora)).getTime()
          : NaN
        const ordemInvalida = Number.isFinite(inicioMs) && Number.isFinite(fimMs) && inicioMs >= fimMs
        const encerramentoLegivel = [
          form.data_fim_data ? form.data_fim_data.split('-').reverse().join('/') : '—',
          form.data_fim_hora ? `às ${form.data_fim_hora}` : '',
        ].filter(Boolean).join(' ')
        return (
        <div className="space-y-5">
          {/* ── Início da campanha ── */}
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Início da campanha</span>
            <div className="grid gap-2">
              {[
                { id: 'imediato' as const, icon: 'rocket_launch', titulo: 'Ao publicar', desc: 'Fica disponível assim que a campanha for publicada.' },
                { id: 'agendado' as const, icon: 'event_upcoming', titulo: 'Em uma data e horário', desc: 'Só começa a aparecer na data e hora escolhidas.' },
              ].map(opcao => (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => setCampo('modo_inicio', opcao.id)}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${form.modo_inicio === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                >
                  <span className={`material-symbols-outlined mt-0.5 text-[20px] ${form.modo_inicio === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {form.modo_inicio === 'agendado' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CampoDock
                  label="Data"
                  type="date"
                  value={form.data_inicio_data}
                  onChange={valor => setCampo('data_inicio_data', valor)}
                  error={!form.data_inicio_data.trim() ? 'Informe a data de início.' : undefined}
                  hint="A campanha só será exibida a partir desta data e horário."
                />
                <CampoDock
                  label="Hora"
                  type="time"
                  value={form.data_inicio_hora}
                  onChange={valor => setCampo('data_inicio_hora', valor)}
                  error={!form.data_inicio_hora.trim() ? 'Informe a hora de início.' : undefined}
                />
              </div>
            )}
          </div>

          {/* ── Encerramento ── */}
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Encerramento</span>
            {campanhaEncerrada ? (
              <div className="space-y-1 rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3">
                <p className="text-[12px] font-semibold leading-4 text-[#5d6c7b]">Esta campanha já foi encerrada e não pode ter a vigência reaberta.</p>
                <p className="text-[13px] font-bold leading-5 text-[#1c1e21]">Encerrada em {encerramentoLegivel}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  {[
                    { id: 'sem_data' as const, icon: 'all_inclusive', titulo: 'Sem data final', desc: 'Fica ativa até ser encerrada ou desativada manualmente.' },
                    { id: 'em_data' as const, icon: 'event_busy', titulo: 'Em uma data e horário', desc: 'Para de aparecer automaticamente na data e hora escolhidas.' },
                  ].map(opcao => (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => setCampo('modo_fim', opcao.id)}
                      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${form.modo_fim === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                    >
                      <span className={`material-symbols-outlined mt-0.5 text-[20px] ${form.modo_fim === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                        <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {form.modo_fim === 'em_data' && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <CampoDock
                      label="Data"
                      type="date"
                      value={form.data_fim_data}
                      onChange={valor => setCampo('data_fim_data', valor)}
                      error={!form.data_fim_data.trim() ? 'Informe a data de término.' : undefined}
                      hint="Após esta data e horário, a campanha deixa de ser exibida automaticamente."
                    />
                    <CampoDock
                      label="Hora"
                      type="time"
                      value={form.data_fim_hora}
                      onChange={valor => setCampo('data_fim_hora', valor)}
                      error={!form.data_fim_hora.trim() ? 'Informe a hora de término.' : undefined}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {ordemInvalida && (
            <div className="rounded-2xl border border-[#f0284a]/40 bg-[#fdecef] px-4 py-3 text-[12px] font-semibold leading-4 text-[#c21837]">
              A data de início deve ser anterior à data de término.
            </div>
          )}
        </div>
        )
      })()}

      {secao === 'feedback' && (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">O que o usuário precisa fazer no final da campanha?</span>
            <div className="grid gap-2">
              {[
                { id: 'feedback' as const, icon: 'rate_review', titulo: 'Enviar feedback', desc: 'Coleta uma nota e, opcionalmente, uma observação.' },
                { id: 'confirmacao' as const, icon: 'task_alt', titulo: 'Confirmar leitura', desc: 'Exige que o usuário clique em Li e entendi.' },
                { id: 'visualizacao' as const, icon: 'visibility', titulo: 'Apenas visualizar', desc: 'Mostra a campanha sem exigir resposta ou confirmação.' },
              ].map(opcao => (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => selecionarAcaoFinal(opcao.id)}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${acaoFinal === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                >
                  <span className={`material-symbols-outlined mt-0.5 text-[20px] ${acaoFinal === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {form.feedback_habilitado && (
            <div className="space-y-3 rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3">
              <label className="flex items-start gap-3 text-[13px] font-semibold leading-5 text-[#1c1e21]">
                <input
                  type="checkbox"
                  checked={form.observacao_obrigatoria}
                  onChange={event => setCampo('observacao_obrigatoria', event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#0064e0]"
                />
                <span>
                  <span className="block font-bold">Exigir observação junto com a nota</span>
                  <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">O usuário precisa escrever um comentário para enviar o feedback.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 border-t border-[#dee3e9] pt-3 text-[13px] font-semibold leading-5 text-[#1c1e21]">
                <input
                  type="checkbox"
                  checked={form.permitir_fechar_modal}
                  onChange={event => alternarFechamento(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#0064e0]"
                />
                <span>
                  <span className="block font-bold">Permitir fechar sem responder</span>
                  <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">O usuário pode fechar a campanha mesmo sem enviar feedback.</span>
                </span>
              </label>
            </div>
          )}
          {acaoFinal === 'visualizacao' ? (
            <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
              Nesta opção, o usuário sempre pode fechar a campanha porque não há ação obrigatória.
            </div>
          ) : acaoFinal === 'feedback' ? null : (
            <CampoBooleanoDock label="Permitir fechar sem responder" checked={form.permitir_fechar_modal} onChange={alternarFechamento} />
          )}
          {!form.permitir_fechar_modal && (
            <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3 text-[12px] font-semibold leading-4 text-[#5d6c7b]">
              Fechamento desabilitado exige uma saída clara: feedback ou confirmação de leitura. Se nenhuma estiver ativa, a confirmação é ligada automaticamente.
            </div>
          )}
        </div>
      )}

      {secao === 'segmentacao' && (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Para quem esta campanha deve aparecer?</span>
            <div className="grid gap-2">
              {[
                { id: 'todos' as const, icon: 'groups', titulo: 'Todos', desc: 'Sem filtros. Aparece para qualquer usuário elegível.' },
                { id: 'cliente' as const, icon: 'domain', titulo: 'Por cliente', desc: 'Filtra por IDs de clientes e unidades.' },
                { id: 'perfil' as const, icon: 'person_search', titulo: 'Por perfil', desc: 'Filtra por perfis, tipos de usuário e estados.' },
              ].map(opcao => (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => selecionarModoSegmentacao(opcao.id)}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${modoSegmentacao === opcao.id ? 'border-[#0064e0] bg-[#eff4ff] text-[#0058be]' : 'border-[#dee3e9] bg-white text-[#1c1e21] hover:border-[#0064e0]'}`}
                >
                  <span className={`material-symbols-outlined mt-0.5 text-[20px] ${modoSegmentacao === opcao.id ? 'text-[#0064e0]' : 'text-[#8595a4]'}`}>{opcao.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-5">{opcao.titulo}</span>
                    <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">{opcao.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {modoSegmentacao !== 'todos' && (
            <div className="rounded-2xl border border-[#dee3e9] bg-[#f8f9ff] px-4 py-3">
              <label className="flex items-start gap-3 text-[13px] font-semibold leading-5 text-[#1c1e21]">
                <input
                  type="checkbox"
                  checked={modoSegmentacao === 'combinada'}
                  onChange={event => selecionarModoSegmentacao(event.target.checked ? 'combinada' : 'todos')}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#0064e0]"
                />
                <span>
                  <span className="block font-bold">Combinar filtros</span>
                  <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[#5d6c7b]">Use cliente, unidade, perfil, tipo de usuário e estado na mesma campanha.</span>
                </span>
              </label>
            </div>
          )}

          {(modoSegmentacao === 'cliente' || modoSegmentacao === 'combinada') && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoListaDock label="IDs de clientes" value={form.segmentar_cliente_ids} onChange={valor => setCampo('segmentar_cliente_ids', valor)} />
              <CampoListaDock label="IDs de unidades" value={form.segmentar_unidade_ids} onChange={valor => setCampo('segmentar_unidade_ids', valor)} />
            </div>
          )}

          {(modoSegmentacao === 'perfil' || modoSegmentacao === 'combinada') && (
            <div className="space-y-4">
              <CampoListaDock label="Perfis permitidos" value={form.segmentar_perfis} onChange={valor => setCampo('segmentar_perfis', valor)} />
              <CampoListaDock label="Tipos permitidos" value={form.segmentar_usuario_tipos} onChange={valor => setCampo('segmentar_usuario_tipos', valor)} />
              <CampoListaDock label="Estados permitidos" value={form.segmentar_estados} onChange={valor => setCampo('segmentar_estados', valor)} hint="Ex.: SP, RJ, MG." />
            </div>
          )}

          <CampoDominiosDock
            catalogo={sistemasConfig.find(s => s.identificador === sistemaSelecionado)?.dominios ?? []}
            value={form.segmentar_dominios}
            onChange={valor => setCampo('segmentar_dominios', valor)}
            onGerenciarSistemas={onGerenciarSistemas}
          />
        </div>
      )}
      </div>

      <div className="mt-6 border-t border-[#dee3e9] pt-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <Button type="button" variant="ghost" fullWidthMobile onClick={onPreview} disabled={salvando} iconLeft={<span className="material-symbols-outlined text-[18px]">visibility</span>}>Simular</Button>
          <Button type="button" variant="ghost" fullWidthMobile onClick={onLimpar} disabled={salvando} iconLeft={<span className="material-symbols-outlined text-[18px]">restart_alt</span>}>Resetar</Button>
          <Button type="submit" variant="gradient" size="md" fullWidthMobile disabled={salvando} className="sm:col-span-2 shadow-[0_10px_24px_rgba(0,100,224,0.22)]">{salvando ? 'Salvando...' : (editando ? 'Salvar alterações' : 'Criar campanha')}</Button>
        </div>
      </div>
    </aside>
  )
}

// Preview de "Destaque em elemento" — simula a tela do cliente com o
// elemento alvo (localizado pelo data-cy configurado no dock), o badge/
// beacon ancorado nele e o tooltip contextual (título/descrição/CTA
// opcional/fechar) que abre ao interagir. Edição acontece só no dock lateral
// (aba Exibição) — este card é só a representação visual, igual ao papel do
// CardEditavel pros outros formatos, mas sem os campos de edição inline
// (media, arrastar, etc. não se aplicam a este formato).
function DestaqueElementoCard({ form, sistemas, sistemaPadraoIdentificador, aparencia, setCampo, onGerenciarSistemas }: { form: FormState; sistemas: string[]; sistemaPadraoIdentificador?: string; aparencia: AparenciaCard | null; setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void; onGerenciarSistemas?: () => void }) {
  const resolverIdDestaque = useRef(criarResolvedorIdDestaque()).current
  const corAcao = corSistemaValida(aparencia?.cor_principal)
  const [indicePreview, setIndicePreview] = useState(0)
  const itens = form.destaques
  // Clampa contra remoção/reordenação de itens acontecendo enquanto este
  // índice estava selecionado — nunca aponta pra fora da lista atual.
  const indice = itens.length > 0 ? Math.min(indicePreview, itens.length - 1) : 0
  const item = itens[indice]

  return (
    <article className="mx-auto w-full max-w-[580px] rounded-2xl border border-[#dee3e9] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#0064e0]">
            <span className="material-symbols-outlined text-[19px]">new_releases</span>
          </span>
          <p className="text-[22px] font-semibold leading-tight text-[#0a1317]">Preview</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PillDropdown label="Sistema do design" value={form.sistema} options={sistemas} onChange={valor => setCampo('sistema', valor)} placeholder="Sistema" highlightValue={sistemaPadraoIdentificador} emptyMessage="Nenhum sistema cadastrado" manageLabel="Gerenciar sistemas" onManage={onGerenciarSistemas} />
          {itens.length > 1 && (
            <SeletorDestaqueSimulacao
              valor={indice}
              onChange={setIndicePreview}
              opcoes={itens.map((it, i) => ({ valor: i, rotulo: it.titulo.trim() || `Destaque ${i + 1}` }))}
            />
          )}
        </div>
      </div>

      <div className="overflow-visible rounded-xl border border-outline-variant">
        <div className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface-container-low px-4 py-2.5 text-[11px] font-semibold text-outline">
          <span className="material-symbols-outlined text-[15px]">public</span>
          Simulação da tela do cliente
        </div>

        {/* items-start (não items-center) + pt-12 pequeno pro badge, deixando
            toda a folga do min-h pro lado de baixo — o tooltip (título +
            descrição + CTA) é bem mais alto que o badge acima do alvo, e os
            dois são absolutamente posicionados (saem do fluxo do alvo), então
            não empurram a altura do canvas sozinhos. Centralizar
            verticalmente (como antes) desperdiçava metade da folga do lado
            do badge, que precisa de bem menos espaço — sobrava pouco pro
            tooltip e ele cortava no overflow-hidden do wrapper acima. */}
        <div className="relative flex min-h-[520px] items-start justify-center bg-[#f1f4f7] px-6 pb-12 pt-12">
          <DestaqueElementoSimulacao
            corAcao={corAcao}
            dataCyLabel={(item?.data_cy ?? '').trim()}
            itemId={item ? resolverIdDestaque(item) : 'builder-sem-destaque'}
            placeholderSemAlvo="Informe o data-cy do elemento alvo no dock ao lado para ver o destaque posicionado aqui."
            badgeTexto={item?.texto_badge.trim() || 'Novo'}
            titulo={item?.titulo.trim() || 'Título da novidade'}
            descricao={item?.descricao.trim() || 'Explique brevemente a novidade para o usuário.'}
            ctaTexto={item?.cta_habilitado ? (item.texto_botao.trim() || 'Saiba mais') : null}
            ctaUrl={item?.cta_habilitado ? (item.url_botao.trim() || null) : null}
            permitirDispensar
          />
        </div>
      </div>
    </article>
  )
}

function CardEditavel({
  form, sistemas, sistemaPadraoIdentificador, aparencia, mostrarMidia, mediaPosition, arrastandoMidia, setCampo, onDragStartMedia, onMostrarMidia, onRemoverMidia, onMoverMidia, onFecharPreview, onGerenciarSistemas, modo = 'construtor',
  conteudoAtivo, onSelecionarConteudo, onAtualizarConteudo, onAplicarLinkMidiaConteudo,
}: {
  form: FormState
  sistemas: string[]
  sistemaPadraoIdentificador?: string
  aparencia: AparenciaCard | null
  mostrarMidia: boolean
  mediaPosition: PosicaoMidia
  arrastandoMidia: boolean
  setCampo: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  onDragStartMedia: () => void
  onMostrarMidia: (posicao?: PosicaoMidia) => void
  onRemoverMidia: () => void
  onMoverMidia: (posicao: PosicaoMidia) => void
  onFecharPreview?: () => void
  onGerenciarSistemas?: () => void
  modo?: 'construtor' | 'preview'
  // Etapa 9 — MESMO índice de conteúdo ativo do dock (ver CampanhaFormIndex/
  // DockLateral), nunca um segundo estado independente. Título/subtítulo do
  // cabeçalho continuam ligados a form.titulo/form.subtitulo (identidade da
  // campanha, sempre global — mesma coisa que o widget renderiza uma única
  // vez no up-title, ver widget.js); mídia/descrição/CTA do CORPO passam a
  // ser sempre os do conteúdo ATIVO (form.conteudos[indiceAtivo]), nunca mais
  // os campos legados soltos — únicafonte de verdade com o dock.
  conteudoAtivo: number | null
  onSelecionarConteudo: (indice: number) => void
  onAtualizarConteudo: <K extends keyof ConteudoFormItem>(indice: number, campo: K, valor: ConteudoFormItem[K]) => void
  onAplicarLinkMidiaConteudo: (indice: number, valor: string) => void
}) {
  const preview = modo === 'preview'
  const corAcao = corSistemaValida(aparencia?.cor_principal)
  const corSubtitulo = corTextoSistemaLegivel(corAcao)
  const iconeCampanha = iconeTipoCampanha(form.tipo)
  const midiaRef = useRef<HTMLDivElement>(null)
  const descricaoRef = useRef<HTMLTextAreaElement>(null)

  // Índice ativo sempre um valor válido (clamp defensivo — nunca estoura os
  // limites do array, mesmo que conteudoAtivo aponte pra um item já
  // removido). form.conteudos tem sempre >= 1 item (ver formInicial/
  // hidratarFormState), então itemAtivo nunca é undefined na prática.
  const indiceAtivo = Math.min(conteudoAtivo ?? 0, Math.max(0, form.conteudos.length - 1))
  // Fallback defensivo pro caso patológico de conteudos=[] (nunca deveria
  // acontecer — formInicial/hidratarFormState sempre semeiam >= 1 item) —
  // nunca deixa o corpo do card quebrar em runtime.
  const itemAtivo = form.conteudos[indiceAtivo] ?? {
    titulo: '', descricao: '', imagem_url: '', video_url: '', cta_habilitado: false, texto_botao: '', url_botao: '',
  }
  const multiConteudo = form.conteudos.length > 1
  const modoSlides = form.modo_navegacao === 'SLIDES' && multiConteudo
  const embedUrlAtivo = itemAtivo.video_url.trim() ? converterVideoEmbed(itemAtivo.video_url) : ''
  const temVideo = Boolean(embedUrlAtivo)
  const temImagem = Boolean(itemAtivo.imagem_url.trim())
  const ctaHabilitado = itemAtivo.cta_habilitado
  const textoCta = itemAtivo.texto_botao.trim() || 'Saiba mais'
  const [editandoMidia, setEditandoMidia] = useState(false)
  const [linkMidiaInline, setLinkMidiaInline] = useState(itemAtivo.video_url || itemAtivo.imagem_url)
  const [notaFeedbackPreview, setNotaFeedbackPreview] = useState<number | null>(null)
  const [observacaoFeedbackPreview, setObservacaoFeedbackPreview] = useState('')
  const [confirmadoConstrutor, setConfirmadoConstrutor] = useState(false)
  const [mensagemSimulacao, setMensagemSimulacao] = useState<{ tipo: 'aviso' | 'erro' | 'sucesso'; texto: string } | null>(null)
  const [editandoLinkCta, setEditandoLinkCta] = useState(false)

  useEffect(() => {
    if (editandoMidia) return
    setLinkMidiaInline(itemAtivo.video_url || itemAtivo.imagem_url)
  }, [editandoMidia, itemAtivo.video_url, itemAtivo.imagem_url])

  // Trocar o conteúdo ativo (navegação SLIDES, clique num bloco em SCROLL ou
  // seleção pelo dock) sempre sai do modo de edição de mídia/link do item
  // anterior — o próximo useEffect acima já resincroniza linkMidiaInline pro
  // novo item ativo. Mesmo raciocínio de "estado único parametrizado pelo
  // ativo": nunca duplica editandoMidia/editandoLinkCta por item.
  useEffect(() => {
    setEditandoMidia(false)
    setEditandoLinkCta(false)
  }, [indiceAtivo])

  useEffect(() => {
    const textarea = descricaoRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [itemAtivo.descricao])

  function aplicarLinkMidia(valor: string) {
    setLinkMidiaInline(valor)
    onAplicarLinkMidiaConteudo(indiceAtivo, valor)
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
    onAtualizarConteudo(indiceAtivo, 'cta_habilitado', !ctaHabilitado)
  }

  // Etapa 9 — representação estática/clicável de um conteúdo QUE NÃO é o
  // ativo, usada só em SCROLL com 2+ itens (SLIDES nunca mostra outros
  // itens). Clicar torna o item ativo — a partir daí ele passa a usar a
  // MESMA edição rica de sempre (blocoMidia/blocoDescricao/blocoCta acima,
  // já ligados a itemAtivo). Nunca duplica o estado de edição (editandoMidia
  // etc.) — este bloco nunca entra em modo de edição, só exibe.
  // Card-resumo compacto (linha única, altura fixa) — nunca a mídia/
  // descrição em tamanho real (isso é só do item ATIVO, ver blocoMidia/
  // blocoDescricao/blocoCta acima). Miniatura fixa (imagem real, ícone de
  // vídeo, ou ícone genérico quando não há mídia — nunca uma área vazia
  // grande), trecho truncado de 1 linha da descrição, badge do CTA (nunca o
  // botão em tamanho real) e um ícone de lápis só pra deixar claro que o
  // bloco é clicável/editável.
  function renderItemEstatico(indice: number) {
    const item = form.conteudos[indice]
    const temVideoItem = Boolean(item.video_url.trim())
    const temImagemItem = Boolean(item.imagem_url.trim())
    const temCtaItem = Boolean(item.cta_habilitado && item.texto_botao.trim() && item.url_botao.trim())
    const tituloItem = item.titulo.trim() || `Conteúdo ${indice + 1}`
    const descricaoItem = item.descricao.trim()
    return (
      <button
        type="button"
        onClick={() => onSelecionarConteudo(indice)}
        aria-label={`Editar conteúdo ${indice + 1}`}
        title="Clique para editar este conteúdo"
        className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/50 p-3 text-left transition hover:border-primary/50 hover:bg-surface-container-low/50"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container text-outline">
          {temImagemItem ? (
            <img src={item.imagem_url} alt="" className="h-full w-full object-cover" />
          ) : temVideoItem ? (
            <span className="material-symbols-outlined text-[22px]">play_circle</span>
          ) : (
            <span className="material-symbols-outlined text-[22px]">notes</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-md font-bold text-on-surface">{tituloItem}</span>
          <span className={`block truncate text-body-sm ${descricaoItem ? 'text-on-surface-variant' : 'italic text-outline'}`}>
            {descricaoItem || 'Sem descrição'}
          </span>
          {temCtaItem && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-label-sm font-bold text-primary">
              <span className="material-symbols-outlined text-[12px]">link</span>
              {item.texto_botao.trim()}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined shrink-0 text-[18px] text-outline">edit</span>
      </button>
    )
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
            <iframe src={embedUrlAtivo} title="Vídeo da campanha" className="pointer-events-none h-full w-full" allowFullScreen />
          ) : temImagem && !editandoMidia ? (
            <img src={itemAtivo.imagem_url} alt="" className="h-full w-full object-cover" />
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
            onClick={() => { setLinkMidiaInline(itemAtivo.video_url || itemAtivo.imagem_url); setEditandoMidia(true) }}
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
      {itemAtivo.descricao || 'Descrição da campanha.'}
    </p>
  ) : (
    <textarea
      ref={descricaoRef}
      value={itemAtivo.descricao}
      onChange={e => onAtualizarConteudo(indiceAtivo, 'descricao', e.target.value)}
      required
      rows={1}
      aria-label="Descrição da campanha"
      placeholder="Escreva a mensagem da campanha..."
      className="min-h-[28px] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-body-md leading-[1.35] text-on-surface-variant outline-none placeholder:italic placeholder:text-on-surface-variant/40 focus:ring-0"
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
      {preview ? (
        <p className="mb-2 text-body-md font-semibold text-on-surface">
          {form.pergunta_feedback.trim() || 'Como podemos melhorar?'}
        </p>
      ) : (
        <input
          value={form.pergunta_feedback}
          onChange={event => setCampo('pergunta_feedback', event.target.value)}
          onBlur={() => { if (!form.pergunta_feedback.trim()) setCampo('pergunta_feedback', 'Como podemos melhorar?') }}
          aria-label="Pergunta de feedback"
          placeholder="Como podemos melhorar?"
          className="mb-2 w-full border-0 bg-transparent p-0 text-body-md font-semibold text-on-surface outline-none placeholder:text-on-surface/70 focus:ring-0"
        />
      )}
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
              value={itemAtivo.texto_botao}
              onChange={e => onAtualizarConteudo(indiceAtivo, 'texto_botao', e.target.value)}
              onBlur={() => { if (!itemAtivo.texto_botao.trim()) onAtualizarConteudo(indiceAtivo, 'texto_botao', 'Saiba mais') }}
              aria-label="Texto do CTA"
              placeholder={textoCta}
              className="w-full border-0 bg-transparent p-0 text-center text-label-md font-bold text-inherit outline-none placeholder:text-current placeholder:opacity-80 focus:ring-0"
            />
          </div>
        )) : !preview ? (
          // Etapa 10 — ação discreta pra habilitar o CTA do conteúdo ATIVO
          // direto pelo Preview (mesmo alternarCta/itemAtivo de sempre — já
          // opera sobre form.conteudos[indiceAtivo], então SCROLL e SLIDES
          // se comportam igual, e trocar de conteúdo nunca afeta outro item).
          <button
            type="button"
            onClick={alternarCta}
            className="flex min-h-[42px] flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-outline transition hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Adicionar botão de ação
          </button>
        ) : null}
        {!preview && ctaHabilitado && (
          <button
            type="button"
            onClick={() => setEditandoLinkCta(prev => !prev)}
            aria-label="Editar link do CTA"
            title="Editar link do CTA"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition ${itemAtivo.url_botao.trim() ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-lowest text-outline hover:border-primary hover:text-primary'}`}
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
          value={itemAtivo.url_botao}
          onChange={e => onAtualizarConteudo(indiceAtivo, 'url_botao', e.target.value)}
          autoFocus
          aria-label="Link do CTA"
          placeholder="https://..."
          className="h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
        />
      ) : null)}
    </div>
  )

  return (
    <article className={`mx-auto w-full text-on-surface ${preview ? 'max-w-[560px]' : 'max-w-[580px] rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-sm'}`}>
      {!preview && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 xl:flex-nowrap">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#0064e0]">
              <span className="material-symbols-outlined text-[19px]">view_quilt</span>
            </span>
            <p className="text-[22px] font-semibold leading-tight text-[#0a1317]">Preview</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            <PillDropdown label="Tipo da campanha" value={form.tipo} options={TIPOS_CAMPANHA} onChange={valor => setCampo('tipo', valor)} />
            <PillDropdown
              label="Sistema do design"
              value={form.sistema}
              options={sistemas}
              onChange={valor => setCampo('sistema', valor)}
              placeholder="Sistema"
              highlightValue={sistemaPadraoIdentificador}
              emptyMessage="Nenhum sistema cadastrado"
              manageLabel="Gerenciar sistemas"
              onManage={onGerenciarSistemas}
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-outline-variant shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/40 bg-surface-container-low px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${preview ? '' : 'self-center'}`} style={{ backgroundColor: corAcao }}>
              <span className="material-symbols-outlined text-[18px] leading-none">{iconeCampanha}</span>
            </div>
            {preview ? (
              <p className="m-0 min-w-0 flex-1 break-words text-label-md font-bold text-on-surface">{form.titulo || 'Título da campanha'}</p>
            ) : (
              <input
                value={form.titulo}
                onChange={e => setCampo('titulo', e.target.value)}
                required
                aria-label="Título da campanha"
                placeholder="Título da campanha"
                className="min-w-0 flex-1 self-center truncate border-0 bg-transparent p-0 text-label-md font-bold text-on-surface outline-none placeholder:text-outline focus:ring-0"
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
            form.subtitulo.trim() && <p className="m-0 text-label-md font-bold" style={{ color: corSubtitulo }}>{form.subtitulo.trim()}</p>
          ) : (
            <input
              value={form.subtitulo}
              onChange={e => setCampo('subtitulo', e.target.value.replace(/[\r\n]+/g, ' '))}
              aria-label="Subtítulo da campanha"
              placeholder="Subtítulo opcional"
              style={{ color: corSubtitulo }}
              className="w-full truncate border-0 bg-transparent p-0 text-label-md font-bold outline-none placeholder:text-outline focus:ring-0"
            />
          )}
          {/* Etapa 9 — SCROLL com 2+ conteúdos: itens antes do ativo aparecem
              estáticos/clicáveis (renderItemEstatico), na mesma ordem de
              sempre. SLIDES nunca mostra outros itens (só o ativo). */}
          {multiConteudo && !modoSlides && form.conteudos.slice(0, indiceAtivo).map((_, i) => (
            <div key={form.conteudos[i].id ?? `conteudo-preview-${i}`}>{renderItemEstatico(i)}</div>
          ))}

          {multiConteudo && (
            preview ? (
              itemAtivo.titulo.trim() && <p className="m-0 text-body-md font-bold text-on-surface">{itemAtivo.titulo.trim()}</p>
            ) : (
              <input
                value={itemAtivo.titulo}
                onChange={e => onAtualizarConteudo(indiceAtivo, 'titulo', e.target.value)}
                aria-label={`Título do conteúdo ${indiceAtivo + 1}`}
                placeholder={`Título do conteúdo ${indiceAtivo + 1}`}
                className="w-full border-0 bg-transparent p-0 text-body-md font-bold text-on-surface outline-none placeholder:text-outline focus:ring-0"
              />
            )
          )}
          {mostrarMidia ? (mediaPosition === 'topo' ? blocoMidia : pontoMidia('topo')) : (mediaPosition === 'topo' ? pontoMidia('topo') : null)}
          {blocoDescricao}
          {mostrarMidia ? (mediaPosition === 'antes_cta' ? blocoMidia : pontoMidia('antes_cta')) : (mediaPosition === 'antes_cta' ? pontoMidia('antes_cta') : null)}
          {blocoCta}

          {multiConteudo && !modoSlides && form.conteudos.slice(indiceAtivo + 1).map((_, i) => (
            <div key={form.conteudos[indiceAtivo + 1 + i].id ?? `conteudo-preview-${indiceAtivo + 1 + i}`}>{renderItemEstatico(indiceAtivo + 1 + i)}</div>
          ))}

          {/* SLIDES com 2+ conteúdos: só o ativo aparece, com
              anterior/próximo + indicador "X de N" (sem swipe no Preview,
              mesma decisão da Etapa 8). */}
          {modoSlides && (
            <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 pt-3">
              <button
                type="button"
                onClick={() => onSelecionarConteudo(Math.max(0, indiceAtivo - 1))}
                disabled={indiceAtivo === 0}
                aria-label="Conteúdo anterior"
                className="flex h-8 w-8 items-center justify-center rounded-full text-outline transition hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <span className="text-label-md font-bold text-outline">{indiceAtivo + 1} de {form.conteudos.length}</span>
              <button
                type="button"
                onClick={() => onSelecionarConteudo(Math.min(form.conteudos.length - 1, indiceAtivo + 1))}
                disabled={indiceAtivo === form.conteudos.length - 1}
                aria-label="Próximo conteúdo"
                className="flex h-8 w-8 items-center justify-center rounded-full text-outline transition hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          )}
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

function PreviewCampanhaModal({ form, aparencia, onClose }: {
  form: FormState
  aparencia: AparenciaCard | null
  onClose: () => void
}) {
  const [nota, setNota] = useState<number | null>(null)
  const [observacao, setObservacao] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [indicePreviewDestaque, setIndicePreviewDestaque] = useState(0)
  // Etapa 8 — índice do conteúdo atual em SLIDES, só nesta sessão de preview
  // (nunca persistido — mesmo raciocínio de state.conteudoSlideIndex no
  // widget). Sempre começa em 0 (primeiro conteúdo).
  const [indicePreviewConteudo, setIndicePreviewConteudo] = useState(0)
  const resolverIdDestaque = useRef(criarResolvedorIdDestaque()).current
  const corAcao = corSistemaValida(aparencia?.cor_principal)
  const pergunta = form.pergunta_feedback.trim() || 'Como podemos melhorar?'
  const descricao = form.descricao.trim()
  const titulo = form.titulo.trim() || 'Título da campanha'
  const iconeCampanha = iconeTipoCampanha(form.tipo)
  const subtitulo = form.subtitulo.trim()
  const feedbackHabilitado = form.feedback_habilitado !== false

  // Etapa 8 — mesma resolução de fallback usada em CampanhaPreview
  // (Preview.tsx), via resolverConteudosPreview: `form.conteudos` (inclusive
  // alterações ainda não salvas, já que isto é o FormState em edição) tem
  // prioridade; sem nenhum item, cai pro pseudo-item legado.
  const conteudosPreview = resolverConteudosPreview(
    form.conteudos.map(item => ({
      id: item.id,
      titulo: item.titulo,
      descricao: item.descricao,
      imagem_url: item.imagem_url,
      video_url: item.video_url,
      texto_botao: item.cta_habilitado ? item.texto_botao : '',
      url_botao: item.cta_habilitado ? item.url_botao : '',
    })),
    {
      titulo: form.titulo,
      descricao: form.descricao,
      imagem_url: form.imagem_url,
      video_url: form.video_url,
      texto_botao: form.cta_habilitado ? form.texto_botao : '',
      url_botao: form.cta_habilitado ? form.url_botao : '',
    }
  )
  // SLIDES só ganha controles com mais de 1 item — 1 único conteúdo (novo ou
  // fallback legado) renderiza exatamente como o preview de sempre.
  const usaSlidesPreview = form.modo_navegacao === 'SLIDES' && conteudosPreview.length > 1
  const indiceConteudoSeguro = Math.min(indicePreviewConteudo, conteudosPreview.length - 1)
  const itensConteudoExibidos = usaSlidesPreview ? [conteudosPreview[indiceConteudoSeguro]] : conteudosPreview
  const mostrarTituloPorConteudo = conteudosPreview.length > 1

  function simularEnvio() {
    if (nota === null) return
    if (form.observacao_obrigatoria && !observacao.trim()) {
      setErro('Observação obrigatória')
      return
    }
    setErro('')
    setEnviado(true)
  }

  function simularConfirmacao() {
    if (!confirmado) {
      setErro('Marque a confirmação de leitura para continuar.')
      return
    }
    setErro('')
    setEnviado(true)
  }

  // Destaque em elemento não é uma modal — simular aqui mostraria conteúdo
  // enganoso (o mock de modal completo abaixo não representa o badge/
  // tooltip real). Mesmo backdrop/portal do preview normal, conteúdo via
  // DestaqueElementoSimulacao (mesmo componente do builder canvas e de
  // /campanhas/:id/preview — nunca reimplementar um terceiro mock aqui).
  if (form.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO) {
    const itens = form.destaques
    const indice = itens.length > 0 ? Math.min(indicePreviewDestaque, itens.length - 1) : 0
    const item = itens[indice]
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Preview do destaque em elemento" onClick={onClose}>
        <div className="flex max-h-[calc(100vh-32px)] w-full flex-col items-center gap-3 overflow-y-auto pb-[360px] pt-[52px]" onClick={event => event.stopPropagation()}>
          {itens.length > 1 && (
            <SeletorDestaqueSimulacao
              valor={indice}
              onChange={setIndicePreviewDestaque}
              opcoes={itens.map((it, i) => ({ valor: i, rotulo: it.titulo.trim() || `Destaque ${i + 1}` }))}
            />
          )}
          <DestaqueElementoSimulacao
            corAcao={corAcao}
            dataCyLabel={(item?.data_cy ?? '').trim()}
            itemId={item ? resolverIdDestaque(item) : 'modal-sem-destaque'}
            placeholderSemAlvo="Nenhum elemento alvo (data-cy) configurado."
            badgeTexto={item?.texto_badge.trim() || 'Novo'}
            titulo={item?.titulo.trim() || titulo}
            descricao={item?.descricao.trim() || descricao}
            ctaTexto={item?.cta_habilitado ? (item.texto_botao.trim() || null) : null}
            ctaUrl={item?.cta_habilitado ? (item.url_botao.trim() || null) : null}
            permitirDispensar={form.permitir_fechar_modal !== false}
            onFechar={onClose}
          />
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Preview da campanha">
      <div className="flex max-h-[calc(100vh-32px)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-[#c2c6d6] bg-white text-[#0b1c30] shadow-[0_24px_70px_rgba(11,28,48,.22)]">
        {enviado ? (
          <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-[22px] py-[26px] text-center">
            <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[rgba(0,105,71,.1)] text-[#006947]">
              <span className="material-symbols-outlined text-[34px]">check</span>
            </div>
            <h4 className="m-0 text-[20px] font-extrabold leading-7 text-[#0b1c30]">Obrigado!</h4>
            <p className="m-0 text-[14px] leading-5 text-[#424754]">Seu feedback foi registrado e nos ajudará a melhorar.</p>
            <button type="button" onClick={onClose} className="h-10 w-full rounded-xl border border-[#c2c6d6] bg-white text-[12px] font-extrabold text-[#424754]">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(194,198,214,.45)] px-5 py-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: corAcao }}>
                  <span className="material-symbols-outlined text-[18px]">{iconeCampanha}</span>
                </div>
                <p className="m-0 min-w-0 flex-1 break-words text-[15px] font-extrabold leading-[21px] text-[#0b1c30]">{titulo}</p>
              </div>
              {form.permitir_fechar_modal !== false && (
                <button type="button" onClick={onClose} aria-label="Fechar campanha" title="Fechar" className="flex shrink-0 items-center justify-center rounded-lg p-1 text-[#727785] hover:bg-[#eff4ff] hover:text-[#0b1c30]">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 pt-[18px]">
              {subtitulo && <p className="m-0 text-[13px] font-extrabold leading-[18px]" style={{ color: corAcao }}>{subtitulo}</p>}

              {itensConteudoExibidos.map((item, indice) => {
                const itemEmbedUrl = item.video_url.trim() ? converterVideoEmbed(item.video_url) : ''
                const itemImagemUrl = item.imagem_url.trim()
                const itemDescricao = item.descricao.trim()
                const itemTemCta = Boolean(item.texto_botao.trim() && item.url_botao.trim())
                return (
                  <div key={item.id ?? `conteudo-preview-${indice}`} className="space-y-3">
                    {mostrarTituloPorConteudo && item.titulo.trim() && (
                      <p className="m-0 text-[14px] font-extrabold leading-5 text-[#0b1c30]">{item.titulo.trim()}</p>
                    )}
                    {itemEmbedUrl ? (
                      <div className="relative h-0 w-full overflow-hidden rounded-xl border border-[rgba(194,198,214,.45)] bg-[#eff4ff] pb-[56.25%]">
                        <iframe src={itemEmbedUrl} title="Vídeo da campanha" tabIndex={-1} loading="lazy" allowFullScreen className="absolute left-0 top-0 block h-full w-full border-0" />
                      </div>
                    ) : itemImagemUrl ? (
                      <div className="w-full overflow-hidden rounded-xl border border-[rgba(194,198,214,.45)] bg-[#eff4ff]">
                        <img src={itemImagemUrl} alt="" className="block h-auto w-full object-contain" />
                      </div>
                    ) : null}

                    {itemDescricao && <p className="m-0 whitespace-pre-wrap text-[14px] leading-[21px] text-[#424754]">{itemDescricao}</p>}

                    {itemTemCta && (
                      <button type="button" style={{ backgroundColor: corAcao }} className="flex min-h-[42px] w-full items-center justify-center rounded-xl border-0 text-[12px] font-extrabold leading-4 text-white transition hover:opacity-90">
                        {item.texto_botao.trim()}
                      </button>
                    )}
                  </div>
                )
              })}

              {usaSlidesPreview && (
                <div className="flex items-center justify-between gap-3 border-t border-[rgba(194,198,214,.45)] pt-3">
                  <button
                    type="button"
                    onClick={() => setIndicePreviewConteudo(i => Math.max(0, i - 1))}
                    disabled={indiceConteudoSeguro === 0}
                    aria-label="Conteúdo anterior"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <span className="text-[12px] font-bold text-[#727785]">{indiceConteudoSeguro + 1} de {conteudosPreview.length}</span>
                  <button
                    type="button"
                    onClick={() => setIndicePreviewConteudo(i => Math.min(conteudosPreview.length - 1, i + 1))}
                    disabled={indiceConteudoSeguro === conteudosPreview.length - 1}
                    aria-label="Próximo conteúdo"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              )}

              {form.exige_confirmacao_leitura ? (
                <div className="flex flex-col gap-2.5 border-t border-[#e0e2ef] pt-3">
                  {erro && <p className="m-0 text-[12px] leading-4 text-[#ba1a1a]">{erro}</p>}
                  <label className="flex items-center gap-3 rounded-xl border border-[#c2c6d6] bg-[#f8f9ff] px-3 py-2.5 text-[13px] font-bold leading-5 text-[#424754]">
                    <input type="checkbox" checked={confirmado} onChange={event => { setConfirmado(event.target.checked); setErro('') }} className="h-4 w-4 accent-[#0058be]" />
                    Confirmo que li esta comunicação
                  </label>
                  <button type="button" disabled={!confirmado} onClick={simularConfirmacao} style={{ backgroundColor: corAcao }} className="h-[42px] w-full rounded-xl border-0 text-[12px] font-extrabold leading-4 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    Li e entendi
                  </button>
                </div>
              ) : feedbackHabilitado ? (
                <div className="flex flex-col gap-2.5 border-t border-[#e0e2ef] pt-3">
                  <p className="m-0 text-[15px] font-bold leading-[21px] text-[#0b1c30]">{pergunta}</p>
                  <div>
                    <div className="flex w-full gap-1">
                      {Array.from({ length: 11 }, (_, n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => { setNota(n); setErro('') }}
                          className="h-[34px] min-w-[22px] flex-1 rounded-lg border text-[12px] font-extrabold transition hover:-translate-y-px"
                          style={nota === n ? { backgroundColor: corAcao, borderColor: corAcao, color: '#fff' } : { borderColor: '#c2c6d6', backgroundColor: '#fff', color: '#424754' }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] font-extrabold uppercase leading-[14px] text-[#727785]"><span>Ruim</span><span>Excelente</span></div>
                  </div>
                  <textarea
                    value={observacao}
                    onChange={event => { setObservacao(event.target.value); setErro('') }}
                    placeholder={form.observacao_obrigatoria ? 'Obrigatório: escreva sua observação...' : 'Observação (opcional)'}
                    className="min-h-[72px] w-full resize-y rounded-xl border border-[#c2c6d6] bg-[#f8f9ff] px-3 py-2.5 text-[14px] leading-5 text-[#0b1c30] outline-none focus:border-[#0058be] focus:shadow-[0_0_0_3px_rgba(0,88,190,.16)]"
                  />
                  {form.observacao_obrigatoria && <p className="m-[-8px_0_0] text-[11px] leading-4 text-[#ba1a1a]">Observação obrigatória</p>}
                  {erro && <p className="m-0 text-[12px] leading-4 text-[#ba1a1a]">{erro}</p>}
                  <button type="button" disabled={nota === null} onClick={simularEnvio} style={{ backgroundColor: corAcao }} className="h-[42px] w-full rounded-xl border-0 text-[12px] font-extrabold leading-4 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    Enviar Feedback
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export function CampanhaFormIndex() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  // Ajuste pós-revisão (Fase 5) — esta página só exige CAMPANHAS.GERENCIAR
  // pra ser alcançada (ver App.tsx), mas dois atalhos aqui escrevem em
  // CONFIGURACOES (criar sistema/tela inline, ver DockLateral/CardEditavel
  // abaixo): POST /catalogo-telas e a navegação pra /configuracoes/sistemas.
  // Sem essa checagem, um EDITOR (CAMPANHAS=GERENCIAR, CONFIGURACOES=NENHUM
  // por padrão) via essas ações, que o backend/rota já bloqueariam — GET
  // de catalogo-telas/sistemas (selecionar uma tela/sistema já existente)
  // continua liberado pra qualquer papel, só a CRIAÇÃO inline é restrita.
  const podeGerenciarConfiguracoes = podeGerenciarModulo(user, 'CONFIGURACOES')
  const [carregandoCampanha, setCarregandoCampanha] = useState(Boolean(id))
  const [erroCarregarCampanha, setErroCarregarCampanha] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(formInicial)
  const [sistemas, setSistemas] = useState<string[]>([])
  const [sistemasConfig, setSistemasConfig] = useState<Sistema[]>([])
  const [aparencias, setAparencias] = useState<Record<string, AparenciaCard>>({})
  const [aparenciaDefault, setAparenciaDefault] = useState<AparenciaCard | null>(null)
  const [catalogoTelas, setCatalogoTelas] = useState<TelaCatalogo[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arrastandoMidia, setArrastandoMidia] = useState(false)
  const [mostrarMidia, setMostrarMidia] = useState(true)
  const [mediaPosition, setMediaPosition] = useState<PosicaoMidia>('topo')
  const [previewAberto, setPreviewAberto] = useState(false)
  const [revisarAberto, setRevisarAberto] = useState(false)
  const [modalNovaTelaAberto, setModalNovaTelaAberto] = useState(false)
  const [formNovaTela, setFormNovaTela] = useState(TELA_CATALOGO_EMPTY_FORM)
  const [salvandoNovaTela, setSalvandoNovaTela] = useState(false)
  const [erroNovaTela, setErroNovaTela] = useState<string | null>(null)
  // Etapa inicial (nova campanha e edição, sem deep-link pra etapa
  // específica existente hoje) — acompanha a 1ª aba da ordem visual atual
  // (ver `secoes` em DockLateral: Exibição -> Destino -> Segmentação ->
  // Feedback).
  const [secaoDock, setSecaoDock] = useState<SecaoDock>('exibicao')

  // Etapa 9 — único índice de "conteúdo ativo", levantado pra este nível
  // (antes vivia só dentro de DockLateral) justamente pra Preview
  // (CardEditavel) e o dock nunca terem estados divergentes sobre "qual
  // conteúdo está selecionado" — nunca duplicar em dois `useState` separados.
  // Começa fechado/sem seleção (null): com 1 único conteúdo (caso mais
  // comum), o card nasce resumido "Conteúdo 1 de 1" e o Preview edita o
  // primeiro item sem forçar nenhuma seleção visível no dock.
  const [conteudoAtivo, setConteudoAtivo] = useState<number | null>(null)
  const resolverIdConteudo = useRef(criarResolvedorIdDestaque()).current
  const CONTEUDOS_MAX = 10

  function adicionarConteudo() {
    if (form.conteudos.length >= CONTEUDOS_MAX) return
    const novoIndice = form.conteudos.length
    setCampo('conteudos', [...form.conteudos, {
      titulo: '', descricao: '', imagem_url: '', video_url: '', cta_habilitado: false, texto_botao: '', url_botao: '',
    }])
    setConteudoAtivo(novoIndice)
  }

  function removerConteudo(indice: number) {
    if (form.conteudos.length <= 1) return // sempre precisa de pelo menos 1
    const novaLista = form.conteudos.filter((_, i) => i !== indice)
    setCampo('conteudos', novaLista)
    // Voltar a 1 único conteúdo normaliza modo_navegacao (SLIDES só faz
    // sentido com 2+ itens) — o seletor continua visível, só o valor muda.
    if (novaLista.length <= 1) setCampo('modo_navegacao', 'SCROLL')
    setConteudoAtivo(prev => {
      if (prev === null) return null
      if (prev === indice) return Math.min(indice, novaLista.length - 1) // remover o ativo seleciona um item válido restante
      return prev > indice ? prev - 1 : prev
    })
  }

  function moverConteudo(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= form.conteudos.length) return
    const lista = form.conteudos.slice()
    const temp = lista[indice]
    lista[indice] = lista[alvo]
    lista[alvo] = temp
    setCampo('conteudos', lista)
    setConteudoAtivo(prev => (prev === indice ? alvo : prev === alvo ? indice : prev))
  }

  function atualizarConteudo<K extends keyof ConteudoFormItem>(indice: number, campo: K, valor: ConteudoFormItem[K]) {
    setCampo('conteudos', form.conteudos.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)))
  }

  // Mesmo raciocínio de aplicarLinkMidia (CardEditavel, campo único legado):
  // um único campo de link decide se é imagem ou vídeo via pareceUrlVideo —
  // nunca os dois preenchidos ao mesmo tempo (mesma regra do backend,
  // validarConteudos). Precisa ser 1 setCampo só (não 2 chamadas de
  // atualizarConteudo em sequência): duas chamadas leriam `form.conteudos`
  // desatualizado entre si (state ainda não re-renderizado), perdendo a
  // primeira mudança.
  function aplicarLinkMidiaConteudo(indice: number, valor: string) {
    const link = valor.trim()
    const video = link && pareceUrlVideo(link) ? link : ''
    const imagem = link && !video ? link : ''
    setCampo('conteudos', form.conteudos.map((item, i) => (i === indice ? { ...item, video_url: video, imagem_url: imagem } : item)))
  }

  function selecionarModoNavegacao(modo: ModoNavegacaoConteudo) {
    setCampo('modo_navegacao', modo)
  }

  // Campos de UM conteúdo (título/descrição/mídia/CTA) — usados só pelo dock
  // (lista de cards); CardEditavel (Preview) tem sua PRÓPRIA renderização
  // rica (mídia arrastável, editor de link do CTA etc.), não reaproveita
  // isto. Função comum (JSX inline), NUNCA um componente React
  // (`<CamposConteudo/>`): declará-la como componente criaria um tipo novo a
  // cada render, remontando os inputs e perdendo o foco a cada tecla.
  function camposConteudo(indice: number) {
    const item = form.conteudos[indice]
    if (!item) return null
    return (
      <>
        <CampoDock label="Título" value={item.titulo} onChange={valor => atualizarConteudo(indice, 'titulo', valor)} placeholder="Título deste conteúdo" />
        <label className="block">
          <span className="mb-2 block text-[12px] font-semibold text-[#444950]">Descrição</span>
          <textarea
            value={item.descricao}
            onChange={event => atualizarConteudo(indice, 'descricao', event.target.value)}
            rows={3}
            placeholder="Descreva esta melhoria ou conteúdo para o usuário."
            className="w-full rounded-lg border border-[#ced0d4] bg-white px-3 py-2 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0064e0] focus:ring-1 focus:ring-[#0064e0]"
          />
        </label>
        <CampoDock
          label="Imagem ou vídeo (link)"
          value={item.video_url || item.imagem_url}
          onChange={valor => aplicarLinkMidiaConteudo(indice, valor)}
          placeholder="https://..."
          hint="YouTube, Vimeo e Loom viram vídeo; outros links viram imagem. Nunca os dois ao mesmo tempo. Opcional."
        />
        <CampoBooleanoDock label="Mostrar botão de ação (CTA)" checked={item.cta_habilitado} onChange={valor => atualizarConteudo(indice, 'cta_habilitado', valor)} />
        {item.cta_habilitado && (
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoDock label="Texto do botão" value={item.texto_botao} onChange={valor => atualizarConteudo(indice, 'texto_botao', valor)} placeholder="Saiba mais" />
            <CampoDock
              label="Link do botão"
              value={item.url_botao}
              onChange={valor => atualizarConteudo(indice, 'url_botao', valor)}
              placeholder="https://"
              error={!urlHttpValida(item.url_botao) ? 'Informe uma URL válida iniciando com http:// ou https://.' : undefined}
            />
          </div>
        )}
      </>
    )
  }

  // Ações de status (Fase 2 dos 3 status) — fora do FormState de propósito
  // (ver comentário no topo de campanhaForm.ts: status nunca viaja no
  // payload de Salvar alterações). `campanhaAtual` guarda o registro cru
  // carregado do backend só pra saber o status/vigência atual e reagir às
  // ações abaixo, nunca é usado pra hidratar o formulário.
  const [campanhaAtual, setCampanhaAtual] = useState<Campanha | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [erroPublicar, setErroPublicar] = useState<string | null>(null)
  const [sucessoStatus, setSucessoStatus] = useState<string | null>(null)
  const [confirmarDesativar, setConfirmarDesativar] = useState(false)
  const [desativando, setDesativando] = useState(false)
  const [erroDesativar, setErroDesativar] = useState<string | null>(null)
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erroEncerrar, setErroEncerrar] = useState<string | null>(null)
  // Snapshot do form logo após hidratar a campanha carregada — comparado
  // contra o form atual pra saber se há alterações não salvas antes de
  // permitir qualquer ação de status (ver possuiAlteracoesNaoSalvas). Não
  // existia um mecanismo de dirty genérico no projeto pra reaproveitar.
  const formCarregadoRef = useRef<FormState | null>(null)

  // Todas as campanhas do tenant (mesma chamada que já alimentava a lista
  // de sistemas abaixo) — reaproveitada só pra saber, ao editar, se a
  // campanha atual tem concorrente (mesmo grupo, ver chaveGrupoConcorrente)
  // e abrir a reordenação sobre este formulário (ver
  // temGrupoConcorrente/reordenarAberto).
  const [campanhasExistentes, setCampanhasExistentes] = useState<Campanha[]>([])
  const [reordenarAberto, setReordenarAberto] = useState(false)

  const grupoAtual = useMemo(() => {
    if (!campanhaAtual) return null
    const chave = chaveGrupoConcorrente(campanhaAtual)
    if (!chave) return null
    const membros = campanhasExistentes.filter(c => chaveGrupoConcorrente(c) === chave)
    return membros.length >= 2 ? { chave, campanhas: membros } : null
  }, [campanhaAtual, campanhasExistentes])

  const aparenciaAtual = useMemo(() => {
    const chave = form.sistema.trim()
    return (chave ? aparencias[chave] : null) ?? aparenciaDefault
  }, [aparenciaDefault, aparencias, form.sistema])
  const sistemaPadraoIdentificador = useMemo(
    () => sistemasConfig.find(sistema => sistema.padrao && sistema.ativo)?.identificador ?? '',
    [sistemasConfig]
  )

  useEffect(() => {
    let cancelado = false

    async function carregarSistemas() {
      const sistemasConfig = await get<Sistema[]>('/sistemas?ativo=true').catch(() => [])
      if (cancelado) return

      const unicos = [...new Set(sistemasConfig.map(s => s.identificador).filter(Boolean))]
      setSistemas(unicos)
      setSistemasConfig(sistemasConfig)
      const sistemaPadrao = sistemasConfig.find(sistema => sistema.padrao && sistema.ativo) ?? sistemasConfig[0]
      if (sistemaPadrao) {
        setForm(prev => prev.sistema.trim() ? prev : { ...prev, sistema: sistemaPadrao.identificador })
      }
    }

    async function carregarSistemasDeCampanhasExistentes() {
      const campanhas = await get<Campanha[]>('/campanhas').catch(() => [])
      if (cancelado) return

      setCampanhasExistentes(campanhas)

      const sistemasCampanhas = campanhas.map(c => c.sistema).filter(Boolean)
      if (sistemasCampanhas.length === 0) return

      setSistemas(prev => [...new Set([...prev, ...sistemasCampanhas])])
    }

    async function carregarAparenciaPadrao() {
      const aparenciaPadrao = await get<AparenciaWidget>('/aparencia-widget/default').catch(() => null)
      if (cancelado) return

      setAparenciaDefault(aparenciaPadrao ? { cor_principal: aparenciaPadrao.cor_principal, logo_url: aparenciaPadrao.logo_url } : null)
    }

    carregarSistemas().catch(() => {})
    carregarSistemasDeCampanhasExistentes().catch(() => {})
    carregarAparenciaPadrao().catch(() => {})
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

  useEffect(() => {
    if (!id) {
      const sistemaPadrao = sistemasConfig.find(sistema => sistema.padrao && sistema.ativo) ?? sistemasConfig[0]
      setForm({ ...formInicial, sistema: sistemaPadrao?.identificador ?? '' })
      setMostrarMidia(true)
      setMediaPosition('topo')
      setCarregandoCampanha(false)
      setErroCarregarCampanha(null)
      setCampanhaAtual(null)
      formCarregadoRef.current = null
      return
    }
    let cancelado = false
    setCarregandoCampanha(true)
    setErroCarregarCampanha(null)
    setErroPublicar(null)
    setSucessoStatus(null)

    get<Campanha>(`/campanhas/${id}`)
      .then(c => {
        if (cancelado) return
        const hidratado = hidratarFormState(c)
        setForm(hidratado)
        setCampanhaAtual(c)
        formCarregadoRef.current = hidratado
      })
      .catch(err => {
        if (!cancelado) setErroCarregarCampanha(err instanceof Error ? err.message : 'Erro ao carregar campanha.')
      })
      .finally(() => {
        if (!cancelado) setCarregandoCampanha(false)
      })

    return () => { cancelado = true }
  }, [id, location.key])

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

  function usarTelaCriada(tela: TelaCatalogo) {
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

  function abrirModalNovaTela(busca?: string) {
    const sistemaAtual = form.sistema.trim()
    const sistemaConfig = sistemasConfig.find(sistema => sistema.identificador === sistemaAtual)
    const valorBusca = busca?.trim() ?? ''
    setErroNovaTela(null)
    setFormNovaTela({
      ...TELA_CATALOGO_EMPTY_FORM,
      nome: valorBusca,
      sistema_id: sistemaConfig?.id ?? '',
      sistema: sistemaAtual,
      categoria: 'Produto',
      modo_identificacao: 'sistema_tela',
      tela: valorBusca || form.tela,
    })
    setModalNovaTelaAberto(true)
  }

  async function salvarNovaTela(event: FormEvent) {
    event.preventDefault()
    setErroNovaTela(null)
    setSalvandoNovaTela(true)
    try {
      const urlConterNormalizada = normalizarPathUrl(formNovaTela.url_contem)
      if (formNovaTela.modo_identificacao === 'url_contem' && !pathUrlValido(urlConterNormalizada)) {
        setErroNovaTela('Informe apenas um caminho relativo, como /app/faturamento. A URL completa vem do embed do widget no sistema.')
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

  function limparConstrutor() {
    const sistemaPadrao = sistemasConfig.find(sistema => sistema.padrao && sistema.ativo) ?? sistemasConfig[0]
    setForm({ ...formInicial, sistema: sistemaPadrao?.identificador ?? '' })
    setMostrarMidia(true)
    setMediaPosition('topo')
    setConteudoAtivo(null)
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

  // Etapa 9 — opera sobre o conteúdo ATIVO (form.conteudos[indiceAtivo]),
  // nunca mais os campos legados soltos. Mesmo clamp defensivo de
  // CardEditavel (nunca estoura os limites do array).
  function removerMidia() {
    const indiceAtivo = Math.min(conteudoAtivo ?? 0, Math.max(0, form.conteudos.length - 1))
    aplicarLinkMidiaConteudo(indiceAtivo, '')
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
    const erroVigencia = validarVigenciaForm(form)
    if (erroVigencia) {
      setErro(erroVigencia)
      setSecaoDock('agendamento')
      return
    }
    setSalvando(true)
    try {
      const payload = montarPayloadCampanha(form)
      const salva = id ? await put<Campanha>(`/campanhas/${id}`, payload) : await post<Campanha>('/campanhas', payload)
      navigate(`/campanhas/${salva.id}/preview`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : (id ? 'Erro ao salvar campanha.' : 'Erro ao criar campanha.'))
    } finally {
      setSalvando(false)
    }
  }

  // POST /campanhas/reordenar (chamado dentro do overlay) já persiste a
  // nova prioridade no backend — aqui só rebusca a campanha atual pra
  // sincronizar form.prioridade (e o snapshot formCarregadoRef, pra não
  // acusar alteração não salva por causa disso) com o valor novo. Sem isso,
  // um "Salvar alterações" logo em seguida reenviaria via PUT o
  // form.prioridade antigo (ver montarPayloadCampanha) e sobrescreveria a
  // ordem que acabou de ser definida. Nunca troca o resto do form, mesmo
  // princípio de publicarOuReativarCampanha acima.
  async function aoSalvarPrioridade() {
    setReordenarAberto(false)
    if (!id) return
    try {
      const atualizada = await get<Campanha>(`/campanhas/${id}`)
      const prioridade = String(atualizada.prioridade)
      setForm(prev => ({ ...prev, prioridade }))
      if (formCarregadoRef.current) {
        formCarregadoRef.current = { ...formCarregadoRef.current, prioridade }
      }
      setCampanhaAtual(atualizada)
    } catch {
      // Prioridade já foi salva no backend (reorder concluiu antes de
      // chegar aqui) — só a sincronização local falhou; o próximo
      // carregamento da página traz o valor certo.
    }
    get<Campanha[]>('/campanhas').then(setCampanhasExistentes).catch(() => {})
  }

  const AVISO_ALTERACOES_PENDENTES = 'Salve as alterações antes de alterar o status da campanha.'

  // O form pode divergir do que está persistido (usuário editou e não
  // salvou) no momento em que ele clica numa ação de status — essa ação
  // valeria sobre os dados antigos, não sobre o que está na tela. Guarda
  // cada ação de status contra isso (não existia mecanismo de dirty prévio
  // no projeto pra reaproveitar, ver formCarregadoRef acima).
  function possuiAlteracoesNaoSalvas(): boolean {
    return formCarregadoRef.current !== null && JSON.stringify(form) !== JSON.stringify(formCarregadoRef.current)
  }

  // Publicar (RASCUNHO -> ATIVA) e Reativar (INATIVA -> ATIVA) são a mesma
  // chamada — mesmo endpoint/regra de campanhas/Index.tsx e Preview.tsx (o
  // backend decide se a transição é válida, ver
  // validarTransicaoStatusCampanha em server/src/controllers/campanhas.ts).
  // Nunca envia o resto do `form` junto: só o status muda, edições ainda não
  // salvas no builder continuam intactas na tela.
  async function publicarOuReativarCampanha() {
    if (!campanhaAtual) return
    if (possuiAlteracoesNaoSalvas()) {
      setErroPublicar(AVISO_ALTERACOES_PENDENTES)
      setSucessoStatus(null)
      return
    }
    const eraRascunho = campanhaAtual.status === 'RASCUNHO'
    setPublicando(true)
    setErroPublicar(null)
    setSucessoStatus(null)
    try {
      const atualizada = await put<Campanha>(`/campanhas/${campanhaAtual.id}`, { status: 'ATIVA' })
      setCampanhaAtual(prev => (prev ? { ...prev, ...atualizada } : atualizada))
      setSucessoStatus(eraRascunho ? 'Campanha publicada com sucesso.' : 'Campanha reativada com sucesso.')
    } catch (err) {
      setErroPublicar(err instanceof Error ? err.message : 'Erro ao atualizar status da campanha.')
    } finally {
      setPublicando(false)
    }
  }

  // Desativar — mesmo endpoint de campanhas/Index.tsx (DELETE /campanhas/:id
  // não é exclusão real, só marca INATIVA, ver comentário em
  // routes/campanhas.ts).
  async function desativarCampanha() {
    if (!campanhaAtual) return
    if (possuiAlteracoesNaoSalvas()) {
      setErroDesativar(AVISO_ALTERACOES_PENDENTES)
      return
    }
    setDesativando(true)
    setErroDesativar(null)
    try {
      await del(`/campanhas/${campanhaAtual.id}`)
      setCampanhaAtual(prev => (prev ? { ...prev, status: 'INATIVA' } : prev))
      setSucessoStatus('Campanha desativada com sucesso.')
      setConfirmarDesativar(false)
    } catch (err) {
      setErroDesativar(err instanceof Error ? err.message : 'Erro ao desativar campanha. Tente novamente.')
    } finally {
      setDesativando(false)
    }
  }

  // Encerrar — ação própria com endpoint dedicado, mesma regra de
  // campanhas/Index.tsx (só disponível pra ATIVA ainda não encerrada; o
  // backend valida de novo e devolve a campanha com data_fim atualizado).
  async function encerrarCampanha() {
    if (!campanhaAtual) return
    if (possuiAlteracoesNaoSalvas()) {
      setErroEncerrar(AVISO_ALTERACOES_PENDENTES)
      return
    }
    setEncerrando(true)
    setErroEncerrar(null)
    try {
      const atualizada = await post<Campanha>(`/campanhas/${campanhaAtual.id}/encerrar`, {})
      setCampanhaAtual(prev => (prev ? { ...prev, ...atualizada } : atualizada))
      setSucessoStatus('Campanha encerrada com sucesso.')
      setConfirmarEncerrar(false)
    } catch (err) {
      setErroEncerrar(err instanceof Error ? err.message : 'Erro ao encerrar campanha. Tente novamente.')
    } finally {
      setEncerrando(false)
    }
  }

  if (carregandoCampanha) return <div className="px-4 py-8"><LoadingSpinner /></div>
  if (erroCarregarCampanha) {
    return (
      <div className="mx-auto max-w-[680px] rounded-2xl border border-[#f0284a] bg-white px-6 py-5 text-[14px] font-semibold text-[#e41e3f]">
        {erroCarregarCampanha}
      </div>
    )
  }

  return (
    <div className="space-y-5 xl:pr-3 pt-6 pb-8">
      <div className="mx-auto w-full max-w-[1128px] rounded-3xl border border-[#dee3e9] bg-white px-6 py-5">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-[680px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[24px] font-semibold leading-tight text-[#0a1317]">{id ? 'Editar campanha in-app' : 'Crie uma campanha in-app'}</h1>
              {campanhaAtual && <StatusBadge status={getStatus(campanhaAtual)} dataInicio={campanhaAtual.data_inicio} />}
            </div>
            <p className="mt-1.5 text-[14px] font-normal leading-5 text-[#5d6c7b]">Monte o card, escolha o momento de exibição e valide a experiência antes de publicar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Ações explícitas de status (Fase 2 dos 3 status) — nunca um
                checkbox no formulário, ver comentário no topo de
                campanhaForm.ts. Mesmas regras/endpoints de campanhas/
                Index.tsx e Preview.tsx: RASCUNHO->Publicar e INATIVA->
                Reativar chamam o mesmo PUT status=ATIVA; Encerrar some
                quando a vigência (data_fim) já passou. */}
            {(campanhaAtual?.status === 'RASCUNHO' || campanhaAtual?.status === 'INATIVA') && (
              <Button type="button" variant="ghost" onClick={() => setRevisarAberto(true)} iconLeft={<span className="material-symbols-outlined text-[18px]">checklist</span>}>
                Revisar configuração
              </Button>
            )}
            {campanhaAtual?.status === 'RASCUNHO' && (
              <Button type="button" variant="gradient" onClick={publicarOuReativarCampanha} disabled={publicando}>
                {publicando ? 'Publicando...' : 'Publicar campanha'}
              </Button>
            )}
            {campanhaAtual?.status === 'ATIVA' && (
              <>
                <Button type="button" variant="ghost" onClick={() => setConfirmarDesativar(true)} disabled={desativando}>
                  Desativar campanha
                </Button>
                {getStatus(campanhaAtual) !== 'encerrada' && (
                  <Button type="button" variant="ghost" onClick={() => setConfirmarEncerrar(true)} disabled={encerrando}>
                    Encerrar campanha
                  </Button>
                )}
              </>
            )}
            {campanhaAtual?.status === 'INATIVA' && (
              <Button type="button" variant="gradient" onClick={publicarOuReativarCampanha} disabled={publicando}>
                {publicando ? 'Reativando...' : 'Reativar campanha'}
              </Button>
            )}
            <Button type="button" variant="primary" onClick={() => navigate('/campanhas')} className="shadow-[0_10px_24px_rgba(0,100,224,0.18)]">
              Ver outras campanhas
            </Button>
          </div>
        </div>
        {(erroPublicar || sucessoStatus) && (
          <div className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold ${erroPublicar ? 'bg-[#fdecef] text-[#e41e3f]' : 'bg-[#e9f7ee] text-[#1e7e34]'}`}>
            <span className="material-symbols-outlined text-[18px] shrink-0">{erroPublicar ? 'error' : 'check_circle'}</span>
            {erroPublicar || sucessoStatus}
          </div>
        )}
      </div>

      <form onSubmit={salvar} className="grid items-start gap-8 xl:grid-cols-[minmax(0,580px)_minmax(460px,520px)] xl:justify-center">
        <div className="mx-auto w-full max-w-[580px] min-w-0">
          {erro && <div className="mb-5 rounded-lg border border-[#f0284a] bg-white px-4 py-3 text-[14px] font-semibold text-[#e41e3f]">{erro}</div>}

          <div className="flex justify-center" onDragEnd={() => setArrastandoMidia(false)}>
            {form.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO ? (
              <DestaqueElementoCard form={form} sistemas={sistemas} sistemaPadraoIdentificador={sistemaPadraoIdentificador} aparencia={aparenciaAtual} setCampo={setCampo} onGerenciarSistemas={podeGerenciarConfiguracoes ? () => navigate('/configuracoes/sistemas') : undefined} />
            ) : (
              <CardEditavel
                form={form}
                sistemas={sistemas}
                sistemaPadraoIdentificador={sistemaPadraoIdentificador}
                aparencia={aparenciaAtual}
                mostrarMidia={mostrarMidia}
                mediaPosition={mediaPosition}
                arrastandoMidia={arrastandoMidia}
                setCampo={setCampo}
                onDragStartMedia={() => setArrastandoMidia(true)}
                onMostrarMidia={(posicao = 'topo') => { setMostrarMidia(true); setMediaPosition(posicao) }}
                onRemoverMidia={removerMidia}
                onMoverMidia={moverMidia}
                onGerenciarSistemas={podeGerenciarConfiguracoes ? () => navigate('/configuracoes/sistemas') : undefined}
                conteudoAtivo={conteudoAtivo}
                onSelecionarConteudo={setConteudoAtivo}
                onAtualizarConteudo={atualizarConteudo}
                onAplicarLinkMidiaConteudo={aplicarLinkMidiaConteudo}
              />
            )}
          </div>

        </div>

        <DockLateral
          secao={secaoDock}
          form={form}
          catalogoTelas={catalogoTelas}
          sistemasConfig={sistemasConfig}
          temSistemas={sistemasConfig.length > 0}
          salvando={salvando}
          editando={Boolean(id)}
          temGrupoConcorrente={grupoAtual !== null}
          campanhaEncerrada={Boolean(campanhaAtual && getStatus(campanhaAtual) === 'encerrada')}
          setCampo={setCampo}
          setSecao={setSecaoDock}
          onSelecionarTela={selecionarTelaCatalogo}
          onAdicionarTela={podeGerenciarConfiguracoes ? abrirModalNovaTela : undefined}
          onGerenciarSistemas={podeGerenciarConfiguracoes ? () => navigate('/configuracoes/sistemas') : undefined}
          onLimpar={limparConstrutor}
          onPreview={() => setPreviewAberto(true)}
          onDefinirPrioridade={() => setReordenarAberto(true)}
          conteudoAtivo={conteudoAtivo}
          onSelecionarConteudo={setConteudoAtivo}
          conteudosMax={CONTEUDOS_MAX}
          adicionarConteudo={adicionarConteudo}
          removerConteudo={removerConteudo}
          moverConteudo={moverConteudo}
          selecionarModoNavegacao={selecionarModoNavegacao}
          camposConteudo={camposConteudo}
          resolverIdConteudo={resolverIdConteudo}
        />
      </form>

      {reordenarAberto && grupoAtual && (
        <ReordenarPrioridade
          grupos={[grupoAtual]}
          onClose={() => setReordenarAberto(false)}
          onSaved={aoSalvarPrioridade}
        />
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

      {previewAberto && (
        <PreviewCampanhaModal
          form={form}
          aparencia={aparenciaAtual}
          onClose={() => setPreviewAberto(false)}
        />
      )}

      {/* Revisar configuração — mesmo conteúdo do "Resumo da configuração" da
          página de Preview, num modal leve. Só no fluxo de edição de
          RASCUNHO/INATIVA (antes de Publicar/Reativar); campanha ATIVA não
          precisa. Lê campanhaAtual (persistida), nunca o FormState em edição. */}
      {revisarAberto && campanhaAtual && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Revisar configuração"
          onClick={() => setRevisarAberto(false)}
        >
          <div
            className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl bg-surface-container-lowest shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-outline-variant/30 bg-surface-container-lowest px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined shrink-0 text-on-surface-variant">checklist</span>
                <h3 className="text-title-lg font-bold text-on-surface">Revisar configuração</h3>
              </div>
              <button
                type="button"
                onClick={() => setRevisarAberto(false)}
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <ResumoConfiguracao campanha={campanhaAtual} />
          </div>
        </div>,
        document.body
      )}

      {confirmarDesativar && campanhaAtual && (
        <ConfirmDialog
          title={`Desativar "${campanhaAtual.nome_interno}"?`}
          description="Ela deixará de ser exibida para os usuários, mas o histórico de respostas será preservado."
          confirmLabel="Desativar campanha"
          variant="danger"
          loading={desativando}
          erro={erroDesativar}
          onConfirm={desativarCampanha}
          onCancel={() => { setConfirmarDesativar(false); setErroDesativar(null) }}
        />
      )}

      {confirmarEncerrar && campanhaAtual && (
        <ConfirmDialog
          title={`Encerrar "${campanhaAtual.nome_interno}"?`}
          description="A vigência termina agora — ela para de ser exibida para os usuários, mas continua ATIVA (diferente de desativar) e o histórico de respostas é preservado."
          confirmLabel="Encerrar campanha"
          variant="danger"
          loading={encerrando}
          erro={erroEncerrar}
          onConfirm={encerrarCampanha}
          onCancel={() => { setConfirmarEncerrar(false); setErroEncerrar(null) }}
        />
      )}
    </div>
  )
}
