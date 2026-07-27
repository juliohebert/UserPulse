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

// Comando de diagnóstico para colar no console do navegador — na página real
// do sistema integrado, não aqui no admin, já que o dashboard roda em outra
// origem e não enxerga o DOM da aplicação hospedeira. Mesma lógica de busca
// usada por selecionarElementoPasso() em widget.js, mas reportando TODOS os
// resultados (não só "o melhor candidato") para expor ambiguidade — e
// destaca temporariamente o alvo encontrado por alguns segundos.
export function comandoTestarSeletor(seletorTipo: string, seletor: string): string {
  const valorEscapado = seletor.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  // 'area' usa o mesmo formato de seletor CSS do 'css' — só muda o que o
  // widget faz com o elemento encontrado (destaca o container inteiro em vez
  // de um único elemento), não como ele é localizado.
  let expressaoBusca: string
  if (seletorTipo === 'css' || seletorTipo === 'area') {
    expressaoBusca = `document.querySelectorAll('${valorEscapado}')`
  } else if (seletorTipo === 'id') {
    expressaoBusca = `(function(){var v='${valorEscapado}'.replace(/^#/,'');var e=document.getElementById(v);return e?[e]:[];})()`
  } else {
    expressaoBusca = `document.querySelectorAll('[data-cy="${valorEscapado}"]')`
  }
  return [
    '(function(){',
    `  var els = Array.prototype.slice.call(${expressaoBusca});`,
    '  if (els.length === 0) { console.log("%c[UserPulse] Seletor NÃO encontrado", "color:#c62828;font-weight:bold"); return; }',
    '  if (els.length > 1) console.log("%c[UserPulse] " + els.length + " elementos encontrados (seletor ambíguo)", "color:#e65100;font-weight:bold", els);',
    '  var el = els[0];',
    '  var r = el.getBoundingClientRect();',
    '  var estilo = window.getComputedStyle(el);',
    '  var invisivel = r.width === 0 || r.height === 0 || estilo.visibility === "hidden" || estilo.display === "none" || Number(estilo.opacity) === 0;',
    '  console.log(',
    '    "%c[UserPulse] " + (els.length === 1 ? "Elemento encontrado" : "1º elemento de " + els.length) + (invisivel ? " — mas está INVISÍVEL" : " — visível") + " — aprox. " + Math.round(r.width) + "x" + Math.round(r.height) + "px",',
    '    "color:" + (invisivel ? "#e65100" : "#006947") + ";font-weight:bold",',
    '    el',
    '  );',
    '  var outlineAntes = el.style.outline, offsetAntes = el.style.outlineOffset;',
    '  el.style.outline = "3px solid #6b38d4";',
    '  el.style.outlineOffset = "2px";',
    '  el.scrollIntoView({ block: "center", behavior: "smooth" });',
    '  setTimeout(function(){ el.style.outline = outlineAntes; el.style.outlineOffset = offsetAntes; }, 2500);',
    '})();',
  ].join('\n')
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
// hospedeiro (ex.: nginx costuma limitar ~8KB de header por padrão, em vários
// buffers). Preferimos abrir o gravador vazio e cair no fallback já existente
// a arriscar uma URL que alguns hosts rejeitam silenciosamente.
const UP_REC_PASSOS_MAX_LEN = 8000

// Remove do payload os campos que já correspondem ao default aplicado por
// recorderSanitizarPassoInicial em widget.js quando a chave está ausente —
// preserva o valor de volta na hora de decodificar, só evita gastar bytes na
// URL com o que já seria o valor implícito. Tours reais tendem a ter a
// maioria dos passos com descrição/seção/confirmação vazias e usando os
// defaults de tooltip/avanço, então isso reduz bastante o tamanho codificado
// sem mudar o resultado final (ver bug: tour com 15 passos e algumas
// descrições preenchidas gerava ~5600 caracteres codificados e estourava o
// limite anterior de 4000, abrindo o gravador com "Passos capturados 0").
function compactarPassoParaUrl(p: GravadorPassoPayload): Partial<GravadorPassoPayload> {
  const compacto: Partial<GravadorPassoPayload> = {
    titulo: p.titulo,
    seletor_tipo: p.seletor_tipo,
    seletor: p.seletor,
  }
  if (p.descricao) compacto.descricao = p.descricao
  if (p.tooltip_posicao && p.tooltip_posicao !== 'auto') compacto.tooltip_posicao = p.tooltip_posicao
  if (p.acao_ao_avancar && p.acao_ao_avancar !== 'apenas_avancar') compacto.acao_ao_avancar = p.acao_ao_avancar
  if (p.modo_avanco_interacao && p.modo_avanco_interacao !== 'manual') compacto.modo_avanco_interacao = p.modo_avanco_interacao
  if (p.seletor_confirmacao) compacto.seletor_confirmacao = p.seletor_confirmacao
  if (p.secao) compacto.secao = p.secao
  return compacto
}

// btoa não lida com UTF-8 fora do range Latin1 (títulos/descrições em
// português têm acento) — por isso passa por TextEncoder antes, e o
// resultado vira base64url (sem +/=) pra ir de forma segura dentro de uma
// query string. Contraparte em widget.js: recorderDecodificarBase64Url.
function encodePassosBase64Url(passos: GravadorPassoPayload[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(passos.map(compactarPassoParaUrl)))
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
