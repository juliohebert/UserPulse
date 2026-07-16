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
  // 'area' usa o mesmo formato de seletor CSS do 'css' — só muda o que o
  // widget faz com o elemento encontrado (destaca o container inteiro em vez
  // de um único elemento), não como ele é localizado.
  if (seletorTipo === 'css' || seletorTipo === 'area') {
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
  // Só enviado em modo edição (TourForm) — pré-carrega o gravador com os
  // passos já cadastrados do tour (ver recorderLerPassosIniciais em
  // widget.js). Omitido na criação (TourGravador), que sempre abre vazio.
  passos?: GravadorPassoPayload[]
}

export interface GravadorPassoPayload {
  titulo: string
  descricao: string | null
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
  acao_ao_avancar: string
  modo_avanco_interacao: string
  seletor_confirmacao: string | null
  secao: string | null
}

export interface GravadorUrlResultado {
  url: string
  // false quando não havia passos pra enviar OU quando o payload codificado
  // excedeu UP_REC_PASSOS_MAX_LEN (ver aviso em console.warn) — nesse caso o
  // gravador abre vazio e o fallback "Colar passos gravados" continua sendo
  // o caminho pra trazer os passos de volta.
  passosIncluidos: boolean
}

// Limite conservador pro parâmetro up_rec_passos codificado: URLs muito
// longas podem estourar limites do navegador ou do servidor do sistema
// hospedeiro (ex.: nginx costuma limitar ~8KB de header por padrão). Preferimos
// abrir o gravador vazio e cair no fallback já existente a arriscar uma URL
// que alguns hosts rejeitam silenciosamente.
const UP_REC_PASSOS_MAX_LEN = 4000

// btoa não lida com UTF-8 fora do range Latin1 (títulos/descrições em
// português têm acento) — por isso passa por TextEncoder antes, e o
// resultado vira base64url (sem +/=) pra ir de forma segura dentro de uma
// query string. Contraparte em widget.js: recorderDecodificarBase64Url.
function encodePassosBase64Url(passos: GravadorPassoPayload[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(passos))
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function buildGravadorUrl(params: GravadorParams): GravadorUrlResultado {
  const url = new URL(params.urlInicial)
  url.searchParams.set('userpulse_recorder', '1')
  if (params.titulo.trim()) url.searchParams.set('up_rec_titulo', params.titulo.trim())
  if (params.descricao.trim()) url.searchParams.set('up_rec_descricao', params.descricao.trim())
  if (params.sistema.trim()) url.searchParams.set('up_rec_sistema', params.sistema.trim())
  if (params.prioridade) url.searchParams.set('up_rec_prioridade', String(params.prioridade))

  let passosIncluidos = false
  if (params.passos && params.passos.length > 0) {
    const encoded = encodePassosBase64Url(params.passos)
    if (encoded.length <= UP_REC_PASSOS_MAX_LEN) {
      url.searchParams.set('up_rec_passos', encoded)
      passosIncluidos = true
    } else {
      console.warn(
        `[UserPulse] Passos atuais do tour (${encoded.length} caracteres codificados) excedem o limite de ` +
        `${UP_REC_PASSOS_MAX_LEN} para enviar ao gravador pela URL — abrindo gravador vazio. ` +
        'Use "Colar passos gravados" ao finalizar a gravação para trazê-los de volta.'
      )
    }
  }

  return { url: url.toString(), passosIncluidos }
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
