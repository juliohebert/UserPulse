import type { TourGuiado } from '../types'

// Mesma convenção de WIDGET_URL em utils/campanha.ts: usa o domínio configurado
// para o widget em produção, ou cai para a própria origem (válido quando admin
// e API são servidos pelo mesmo processo Express, como em produção).
const WIDGET_ORIGIN: string = (() => {
  const envUrl = import.meta.env.VITE_USERPULSE_WIDGET_URL as string | undefined
  if (envUrl) {
    try {
      return new URL(envUrl).origin
    } catch {
      // valor malformado no .env — ignora e cai no fallback
    }
  }
  return window.location.origin
})()

export function comandoIniciarTour(tour: Pick<TourGuiado, 'slug'>): string {
  return `window.UserPulse.iniciarTour("${tour.slug}");`
}

// URL do test-embed.html servido pelo mesmo Express que expõe /widget-loader.js,
// já com ?local=1 (widget local) e ?tour=<slug> (auto-inicia o tour ao carregar).
export function testEmbedUrl(tour: Pick<TourGuiado, 'slug'>): string {
  const params = new URLSearchParams({ local: '1', tour: tour.slug })
  return `${WIDGET_ORIGIN}/test-embed.html?${params.toString()}`
}

// Comando para colar no console do navegador (na página real do sistema
// integrado, não aqui no admin) e conferir se o seletor configurado acha o
// elemento — mesma lógica de seleção usada por selecionarElementoPasso() em
// widget.js.
export function comandoTestarSeletor(seletorTipo: string, seletor: string): string {
  if (seletorTipo === 'css') {
    return `document.querySelector('${seletor}')`
  }
  return `document.querySelector('[data-cy="${seletor}"]')`
}

// ─── Gravador de fluxo (MVP) ────────────────────────────────────────────────
// Monta a URL que o admin abre numa nova aba para iniciar a gravação: a URL
// informada + parâmetros que o widget.js lê no init() (ver iniciarGravadorSeNecessario
// em widget.js) pra saber que deve entrar em modo de gravação e já ter o
// título/descrição/sistema/prioridade prontos pro JSON final. Lança se
// urlInicial não for uma URL absoluta válida — quem chama decide como avisar.
export interface GravadorParams {
  urlInicial: string
  titulo: string
  descricao: string
  sistema: string
  prioridade: number
}

export function buildGravadorUrl(params: GravadorParams): string {
  const url = new URL(params.urlInicial)
  url.searchParams.set('userpulse_recorder', '1')
  if (params.titulo.trim()) url.searchParams.set('up_rec_titulo', params.titulo.trim())
  if (params.descricao.trim()) url.searchParams.set('up_rec_descricao', params.descricao.trim())
  if (params.sistema.trim()) url.searchParams.set('up_rec_sistema', params.sistema.trim())
  if (params.prioridade) url.searchParams.set('up_rec_prioridade', String(params.prioridade))
  return url.toString()
}

// Baixa um objeto como arquivo .json — mesmo padrão de download client-side
// (Blob + link temporário) usado para exportar CSV em CampanhaDashboard.tsx.
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
