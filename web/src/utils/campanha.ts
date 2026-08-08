import type { Campanha, StatusCampanha } from '../types'

export function getStatus(c: Campanha): StatusCampanha {
  if (!c.ativo) return 'inativa'
  const now = new Date()
  if (c.data_inicio && new Date(c.data_inicio) > now) return 'agendada'
  if (c.data_fim && new Date(c.data_fim) < now) return 'encerrada'
  return 'ativa'
}

export function gerarSlug(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Não informado'
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

export function formatarValorReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function toInputDate(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

const WIDGET_URL: string =
  import.meta.env.VITE_USERPULSE_WIDGET_URL ||
  `${window.location.origin}/widget-loader.js`

export interface EmbedParts {
  widgetSrcTag: string
  initCode: string
  initNote: string | null
  trackCode: string | null
  isAfterEvent: boolean
}

// publicKey (Fase 2 do widget multi-tenant) — opcional aqui só porque
// quem chama pode não ter a sessão/tenant carregada ainda; sem ela, o
// snippet gerado usa o placeholder de sempre, igual aos outros campos
// desta função quando a campanha não tem o dado preenchido.
export function gerarEmbedParts(campanha: Campanha, publicKey?: string): EmbedParts {
  const modo = campanha.modo_identificacao || 'sistema_tela'
  const gatilho = campanha.gatilho || 'ao_abrir_tela'
  const sistema = campanha.sistema || 'seu-sistema'
  const tela = campanha.tela || 'sua-tela'
  const dataCy = campanha.data_cy || 'data-cy-da-tela'
  const urlContem = campanha.url_contem || '/caminho-da-tela'
  const evento = campanha.evento || 'nome_do_evento'
  const isAfterEvent = gatilho === 'apos_evento'

  const initLines: string[] = [`  public_key: "${publicKey || '00000000-0000-0000-0000-000000000000'}",`, `  sistema: "${sistema}",`]
  if (modo === 'sistema_tela') initLines.push(`  tela: "${tela}",`)
  initLines.push(`  usuario_id: "ID_DO_USUARIO"`)

  const initCode = ['window.UserPulse.init({', ...initLines, '});'].join('\n')

  const initNote: string | null =
    modo === 'data_cy'
      ? `// A página precisa conter um elemento com:\n// data-cy="${dataCy}"`
      : modo === 'url_contem'
      ? `// A URL atual precisa conter:\n// ${urlContem}`
      : null

  const trackCode: string | null = isAfterEvent
    ? `// Chame somente após a ação desejada acontecer\nwindow.UserPulse.track("${evento}");`
    : null

  return {
    widgetSrcTag: `<script src="${WIDGET_URL}"></script>`,
    initCode,
    initNote,
    trackCode,
    isAfterEvent,
  }
}

export function gerarEmbed(campanha: Campanha, publicKey?: string): string {
  const p = gerarEmbedParts(campanha, publicKey)
  const body: string[] = [p.initCode]
  if (p.initNote) body.push('', p.initNote)
  if (p.trackCode) body.push('', p.trackCode)
  return [p.widgetSrcTag, '<script>', ...body, '</script>'].join('\n')
}
