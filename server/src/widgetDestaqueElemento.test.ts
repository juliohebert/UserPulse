import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE, sem module.exports) — carregado
// via vm com stubs mínimos, mesmo padrão de widgetTourSegmentacao.test.ts.
// destaqueElementoSeletorSeguro e destaqueElementoLocalizarAlvo são funções
// puras/quase-puras (só leem document.querySelector, nunca localStorage/
// rede), expostas via window.UserPulse._internal só pra este teste.
type DestaqueItem = {
  id?: string | null
  data_cy?: unknown
  texto_badge?: unknown
  titulo?: unknown
  descricao?: unknown
  texto_botao?: unknown
  url_botao?: unknown
  ativo?: boolean
}
type Campanha = {
  id?: string
  modo_exibicao?: string
  data_cy?: unknown
  titulo?: unknown
  subtitulo?: unknown
  descricao?: unknown
  texto_botao?: unknown
  url_botao?: unknown
  mostrar_uma_vez?: boolean
  always_show_user?: boolean
  permitir_fechar_modal?: boolean
  atraso_ms?: number
  gatilho?: string
  destaques?: DestaqueItem[]
}
type ConfigWidget = { slug?: string; sistema?: string; tela?: string; usuario_id?: string }
type DestaqueElementoSeletorSeguro = (dataCyBruto: unknown) => string | null
type DestaqueElementoLocalizarAlvo = (item: DestaqueItem | null | undefined) => unknown
type WasShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => boolean
type MarkShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => void
type Retangulo = { top: number; left: number; right: number; bottom: number; width: number; height: number }
type TamanhoBadge = { width: number; height: number }
type Viewport = { width: number; height: number }
type PosicaoCalculada = { top: number; left: number; posicao: 'acima' | 'abaixo' }
type DestaqueElementoCalcularPosicao = (
  alvoRect: Retangulo,
  badgeSize: TamanhoBadge,
  viewport: Viewport,
  opts?: { gap?: number; margem?: number }
) => PosicaoCalculada
type PosicaoTooltipCalculada = { top: number; left: number; posicao: 'abaixo' | 'acima' | 'direita' | 'esquerda' }
type DestaqueElementoCalcularPosicaoTooltip = (
  alvoRect: Retangulo,
  badgeRect: Retangulo,
  tooltipSize: TamanhoBadge,
  viewport: Viewport,
  opts?: { gap?: number; margem?: number }
) => PosicaoTooltipCalculada
type PosicaoBeacon = { left: number }
type DestaqueElementoCalcularBeacon = (alvoRect: Retangulo, badgeRect: Retangulo) => PosicaoBeacon
type DestaqueElementoRectsIguais = (a: Retangulo | null | undefined, b: Retangulo | null | undefined) => boolean
type PontoRepresentativo = { x: number; y: number }
type DestaqueElementoPontoRepresentativo = (rect: Retangulo) => PontoRepresentativo
type DestaqueElementoAlvoRealmenteVisivel = (alvo: unknown, rect: Retangulo | null | undefined, elementoNoPonto?: unknown) => boolean
type DestaqueElementoMutacoesApenasNoRoot = (root: { contains: (node: unknown) => boolean }, mutationsList: Array<{ target: unknown }>) => boolean
type DestaqueElementoObterViewport = () => Viewport
type DestaqueElementoMontar = (campanha: Campanha, config: ConfigWidget, alvo: unknown) => void
type DestaqueElementoResolverItens = (campanha: Campanha | null | undefined) => DestaqueItem[]
type DestaqueElementoMontarTodos = (campanha: Campanha, config: ConfigWidget) => void
type SelecaoIdentidade = { campanhaId: string | null; itemIds: Array<string | null> }
type DestaqueElementoIdentidadeSelecao = (campanha: Campanha | null | undefined) => SelecaoIdentidade
type DestaqueElementoIdentidadesIguais = (a: SelecaoIdentidade | null | undefined, b: SelecaoIdentidade | null | undefined) => boolean
type DestaqueElementoSincronizarSelecao = (campanhaSelecionada: Campanha | null, config: ConfigWidget) => void
type EvaluateCampaigns = () => void
type ConfigSetTestState = (parcial: Partial<ConfigWidget> & { contexto?: Record<string, unknown> | null }) => void
type ClickEvent = { target: { closest: (seletor: string) => { getAttribute: (chave: string) => string | null } | null } }
type ClickListener = (event: ClickEvent) => void
type DestaqueElementoGetTestClickListener = (indice?: number) => ClickListener | null
type InputEvent = { target: { matches: (seletor: string) => boolean; value: string } }
type InputListener = (event: InputEvent) => void
type DestaqueElementoGetTestInputListener = (indice?: number) => InputListener | null
type UtilidadeState = { escolha: boolean | null; comentario: string; enviando: boolean; erro: string | null; comentarioEnviado: boolean }
type DestaqueElementoGetTestUtilidadeState = (indice?: number) => UtilidadeState | null
type DestaqueElementoGetTestAberto = (indice?: number) => boolean | null
type DestaqueElementoGetTestOculto = (indice?: number) => boolean | null
type UserPulseInit = (config: Record<string, unknown>) => void
type UserPulseUpdateContext = (contexto: Record<string, unknown>) => void

let destaqueElementoSeletorSeguro: DestaqueElementoSeletorSeguro
let destaqueElementoLocalizarAlvo: DestaqueElementoLocalizarAlvo
let destaqueElementoCalcularPosicao: DestaqueElementoCalcularPosicao
let destaqueElementoCalcularPosicaoTooltip: DestaqueElementoCalcularPosicaoTooltip
let destaqueElementoCalcularBeacon: DestaqueElementoCalcularBeacon
let destaqueElementoRectsIguais: DestaqueElementoRectsIguais
let destaqueElementoPontoRepresentativo: DestaqueElementoPontoRepresentativo
let destaqueElementoAlvoRealmenteVisivel: DestaqueElementoAlvoRealmenteVisivel
let destaqueElementoMutacoesApenasNoRoot: DestaqueElementoMutacoesApenasNoRoot
let destaqueElementoObterViewport: DestaqueElementoObterViewport
let destaqueElementoMontar: DestaqueElementoMontar
let destaqueElementoResolverItens: DestaqueElementoResolverItens
let destaqueElementoMontarTodos: DestaqueElementoMontarTodos
let destaqueElementoGetTestClickListener: DestaqueElementoGetTestClickListener
let destaqueElementoGetTestInputListener: DestaqueElementoGetTestInputListener
let destaqueElementoGetTestUtilidadeState: DestaqueElementoGetTestUtilidadeState
let destaqueElementoGetTestAberto: DestaqueElementoGetTestAberto
let destaqueElementoGetTestOculto: DestaqueElementoGetTestOculto
let destaqueElementoIdentidadeSelecao: DestaqueElementoIdentidadeSelecao
let destaqueElementoIdentidadesIguais: DestaqueElementoIdentidadesIguais
let destaqueElementoSincronizarSelecao: DestaqueElementoSincronizarSelecao
let evaluateCampaigns: EvaluateCampaigns
let configSetTestState: ConfigSetTestState
let userPulseInit: UserPulseInit
let userPulseUpdateContext: UserPulseUpdateContext
let wasShown: WasShown
let markShown: MarkShown
// Último root fake criado por document.createElement (ver criarFakeRootDestaque
// abaixo) — só pra inspecionar root.style.top/left aplicados de verdade após
// destaqueElementoMontar/estabilização, sem expor destaqueElementoState.
let ultimoRootDestaque: {
  style: Record<string, string>
  contains: (node: unknown) => boolean
  querySelector?: (seletor: string) => unknown
} | null = null
// Acumula TODOS os roots já criados (nunca é resetado sozinho) — testes de
// múltiplos destaques usam .length (delta antes/depois da própria ação) pra
// confirmar quantas instâncias foram montadas de verdade.
let todasAsRaizesDestaque: Array<{ style: Record<string, string> }> = []
// Mesmo padrão — acumula TODAS as chamadas de fetch (POST /api/widget/evento)
// já feitas pelo widget na sandbox compartilhada, nunca resetado sozinho.
// Fica com o corpo já parseado (JSON.parse do body enviado) pra assert direto
// em tipo_evento/campanha_id/destaque_item_id sem reimplementar o parsing em
// cada teste.
let chamadasRastreamento: Array<{ url: string; body: Record<string, unknown> }> = []
// Sandbox compartilhada (ver before() abaixo) — exposta pra testes que
// precisam mutar window.visualViewport/innerWidth/document.documentElement/
// document.fonts pontualmente, sem recriar o contexto vm inteiro.
let sandboxCompartilhado: {
  document: Record<string, unknown>
  window: Record<string, unknown>
} | null = null
// Último MutationObserver fake criado (ver FakeMutationObserver abaixo) —
// permite ao teste disparar `.cb([...])` manualmente, simulando uma
// notificação real de mutação sem precisar de um DOM/MutationObserver de
// verdade (indisponível fora de um navegador).
let ultimoMutationObserverDestaque: { cb: (records: Array<{ target: unknown }>) => void; disconnected: boolean; observeChamadoCom: unknown } | null = null
// Fila fake de window.setTimeout/clearTimeout — nunca dispara sozinha (nem
// por tempo real, nem por microtask); só o teste decide quando "o tempo
// passou" chamando dispararTimersPendentesDestaque(), mesmo espírito do
// FakeMutationObserver acima. Necessário pro fechamento automático do
// tooltip de utilidade_destaque (destaqueElementoUtilAgendarFechamento, ver
// widget.js), que é a primeira coisa no widget destaque_elemento a
// realmente chamar window.setTimeout.
let timersPendentesDestaque: Array<{ id: number; cb: () => void }> = []
let proximoTimerIdDestaque = 1
function dispararTimersPendentesDestaque() {
  const pendentes = timersPendentesDestaque.slice()
  timersPendentesDestaque = []
  for (const t of pendentes) t.cb()
}

// Elemento "clicável" mínimo pro harness: só precisa resolver `.closest(seletor)`
// pro atributo que o clique real teria alcançado (data-up-destaque-toggle/
// -close/-cta), igual ao padrão de widgetTourFeedback.test.ts.
function elementoClique(atributo: string, atributosExtra: Record<string, string> = {}) {
  return {
    closest(seletor: string) {
      return seletor === '[' + atributo + ']' ? { getAttribute: (chave: string) => atributosExtra[chave] ?? null } : null
    },
  }
}

// Elemento "digitável" mínimo pro harness: só precisa resolver `.matches(seletor)`
// pro atributo que o input real teria (data-up-util-comentario) e expor `.value`
// — mesmo raciocínio de elementoClique, mas pro listener 'input'.
function elementoInput(atributo: string, valor: string) {
  return {
    matches(seletor: string) { return seletor === '[' + atributo + ']' },
    value: valor,
  }
}
let presentes: Set<string>
let duplicados: Set<string>
let alvosPorDataCy: Map<string, { tagName: string; dataCy: string; getBoundingClientRect: () => Retangulo }>
let localStorageStore: Map<string, string>

function retangulo(top: number, left: number, width: number, height: number): Retangulo {
  return { top: top, left: left, right: left + width, bottom: top + height, width: width, height: height }
}

before(() => {
  const codigo = fs.readFileSync(
    path.resolve(__dirname, '../../web/public/widget.js'),
    'utf8'
  )
  presentes = new Set<string>()
  duplicados = new Set<string>()
  alvosPorDataCy = new Map()
  function alvoDoDataCy(dataCy: string) {
    if (!alvosPorDataCy.has(dataCy)) {
      alvosPorDataCy.set(dataCy, { tagName: 'BUTTON', dataCy, getBoundingClientRect: () => retangulo(100, 100, 140, 40) })
    }
    return alvosPorDataCy.get(dataCy)!
  }
  // Fake "elemento" pra document.createElement('div') — usado só pelo root
  // do destaque (destaqueElementoMontar). innerHTML/querySelector não fazem
  // parsing de HTML de verdade: badge/beacon são fixos, e o tooltip só
  // "existe" (via querySelector) quando a string de innerHTML contém a
  // classe correspondente — suficiente pra exercitar destaqueElementoRender/
  // Reposicionar de ponta a ponta sem precisar de um DOM real.
  function criarFakeRootDestaque() {
    const listeners: Record<string, Array<(event: unknown) => void>> = {}
    let html = ''
    let geracao = 0
    let badgeEl!: { geracao: number; offsetWidth: number; offsetHeight: number; getBoundingClientRect: () => Retangulo }
    let tooltipEl!: { geracao: number; offsetWidth: number; offsetHeight: number; style: Record<string, string>; getBoundingClientRect: () => Retangulo }
    let beaconEl!: { geracao: number; style: Record<string, string> }
    function recriarFilhos() {
      geracao++
      badgeEl = { geracao, offsetWidth: 160, offsetHeight: 24, getBoundingClientRect: () => retangulo(50, 200, 160, 24) }
      tooltipEl = { geracao, offsetWidth: 260, offsetHeight: 150, style: {}, getBoundingClientRect: () => retangulo(0, 0, 260, 150) }
      beaconEl = { geracao, style: {} }
    }
    recriarFilhos()
    const root = {
      className: '',
      style: {} as Record<string, string>,
      parentNode: { removeChild() {} },
      setAttribute() {},
      // Só reconhece a si mesma e seus 3 filhos fixos (badge/beacon/tooltip)
      // — suficiente pra destaqueElementoMutacoesApenasNoRoot filtrar
      // mutations "de dentro do próprio widget" nos testes de MutationObserver.
      contains(node: unknown) { return node === root || node === badgeEl || node === beaconEl || node === tooltipEl },
      addEventListener(type: string, cb: (event: unknown) => void) { (listeners[type] = listeners[type] || []).push(cb) },
      removeEventListener() {},
      listeners,
      get innerHTML() { return html },
      set innerHTML(v: string) { html = v; recriarFilhos() },
      querySelector(seletor: string) {
        if (seletor === '.up-destaque-badge') return badgeEl
        if (seletor === '.up-destaque-beacon') return html.indexOf('up-destaque-beacon') !== -1 ? beaconEl : null
        if (seletor === '.up-destaque-tooltip') return html.indexOf('up-destaque-tooltip') !== -1 ? tooltipEl : null
        return null
      },
    }
    ultimoRootDestaque = root
    todasAsRaizesDestaque.push(root)
    return root
  }
  // Fake MutationObserver — não observa nada de verdade (não há DOM real
  // fora de um navegador); só guarda o callback pra o teste disparar
  // manualmente via ultimoMutationObserverDestaque.cb([...]), simulando uma
  // notificação real de mutação.
  class FakeMutationObserver {
    cb: (records: Array<{ target: unknown }>) => void
    disconnected = false
    observeChamadoCom: unknown = null
    constructor(cb: (records: Array<{ target: unknown }>) => void) { this.cb = cb }
    observe(target: unknown) { this.observeChamadoCom = target; ultimoMutationObserverDestaque = this }
    disconnect() { this.disconnected = true }
  }
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    // widget.js chama fetch(...) sem prefixo window. — bare global call,
    // resolve contra o CONTEXTO da vm (este objeto sandbox em si), nunca
    // contra sandbox.window (que só cobre window.algo explícito). Precisa
    // estar aqui em cima, não dentro de sandbox.window abaixo.
    fetch: (url: string, opts?: { body?: string }) => {
      chamadasRastreamento.push({ url, body: opts?.body ? JSON.parse(opts.body) : {} })
      return Promise.resolve({ ok: true })
    },
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      querySelectorAll: (seletor: string) => {
        const m = /^\[data-cy="([\s\S]*)"\]$/.exec(seletor)
        if (!m || !presentes.has(m[1])) return []
        const alvo = alvoDoDataCy(m[1])
        return duplicados.has(m[1]) ? [alvo, { ...alvo }] : [alvo]
      },
      querySelector: (seletor: string) => {
        const m = /^\[data-cy="([\s\S]*)"\]$/.exec(seletor)
        if (!m) return null
        return presentes.has(m[1]) ? alvoDoDataCy(m[1]) : null
      },
      getElementById: () => null,
      createElement: () => criarFakeRootDestaque(),
      addEventListener() {},
      removeEventListener() {},
      // style: {} — necessário pra window.UserPulse.init() de verdade poder
      // rodar (ele sempre seta document.body.style.overflow, mesmo com
      // config vazia), usado pelos testes de ciclo de vida entre init()s.
      body: {
        contains: (node: unknown) => {
          const dataCy = (node as { dataCy?: string } | null)?.dataCy
          return dataCy ? presentes.has(dataCy) : true
        },
        appendChild() {}, style: {} as Record<string, string>
      },
      // head.appendChild — ensureStyles() (chamada por evaluateCampaigns()
      // pra qualquer candidata selecionada, destaque_elemento incluso) usa
      // isso pra injetar a <style> global uma única vez. Só precisa existir
      // e não lançar; nenhum teste inspeciona o conteúdo real do CSS.
      head: { appendChild() {} },
      // Ausente por padrão (undefined) — só setado pontualmente pelos testes
      // de fallback de viewport (document.documentElement.clientWidth/Height).
      documentElement: undefined as { clientWidth: number; clientHeight: number } | undefined,
      // Ausente por padrão — só setado pontualmente pelo teste de fontes
      // (document.fonts.ready). Ausência aqui já prova, implicitamente, que
      // nenhum outro teste depende da Fonts API existir.
      fonts: undefined as { ready: Promise<void> } | undefined,
    },
  }
  localStorageStore = new Map<string, string>()
  sandbox.window = {
    MutationObserver: FakeMutationObserver,
    // Ausente por padrão — só setado pontualmente pelo teste de
    // visualViewport. Ausência aqui já prova que o fallback funciona (todo
    // o resto da suíte roda sem visualViewport).
    visualViewport: undefined as { width: number; height: number } | undefined,
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
    localStorage: {
      getItem: (chave: string) => (localStorageStore.has(chave) ? localStorageStore.get(chave) : null),
      setItem: (chave: string, valor: string) => { localStorageStore.set(chave, valor) },
      removeItem: (chave: string) => { localStorageStore.delete(chave) },
    },
    addEventListener() {},
    removeEventListener() {},
    // Síncrono de propósito — o teste não precisa esperar um frame de
    // verdade, só quer que destaqueElementoRender já tenha rodado quando
    // destaqueElementoMontar retorna.
    requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    // Fake, nunca dispara sozinho — ver timersPendentesDestaque/
    // dispararTimersPendentesDestaque acima.
    setTimeout: (cb: () => void) => {
      const id = proximoTimerIdDestaque++
      timersPendentesDestaque.push({ id, cb })
      return id
    },
    clearTimeout: (id: number) => {
      timersPendentesDestaque = timersPendentesDestaque.filter(t => t.id !== id)
    },
    open() {},
    history: { pushState() {}, replaceState() {} },
    CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
    navigator: { userAgent: 'node:test' },
    innerWidth: 1024,
  }
  sandboxCompartilhado = sandbox as unknown as { document: Record<string, unknown>; window: Record<string, unknown>; fetch: unknown }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: {
      init?: UserPulseInit
      updateContext?: UserPulseUpdateContext
      _internal?: {
        destaqueElementoSeletorSeguro?: DestaqueElementoSeletorSeguro
        destaqueElementoLocalizarAlvo?: DestaqueElementoLocalizarAlvo
        destaqueElementoCalcularPosicao?: DestaqueElementoCalcularPosicao
        destaqueElementoCalcularPosicaoTooltip?: DestaqueElementoCalcularPosicaoTooltip
        destaqueElementoCalcularBeacon?: DestaqueElementoCalcularBeacon
        destaqueElementoRectsIguais?: DestaqueElementoRectsIguais
        destaqueElementoPontoRepresentativo?: DestaqueElementoPontoRepresentativo
        destaqueElementoAlvoRealmenteVisivel?: DestaqueElementoAlvoRealmenteVisivel
        destaqueElementoMutacoesApenasNoRoot?: DestaqueElementoMutacoesApenasNoRoot
        destaqueElementoObterViewport?: DestaqueElementoObterViewport
        destaqueElementoMontar?: DestaqueElementoMontar
        destaqueElementoResolverItens?: DestaqueElementoResolverItens
        destaqueElementoMontarTodos?: DestaqueElementoMontarTodos
        destaqueElementoGetTestClickListener?: DestaqueElementoGetTestClickListener
        destaqueElementoGetTestInputListener?: DestaqueElementoGetTestInputListener
        destaqueElementoGetTestUtilidadeState?: DestaqueElementoGetTestUtilidadeState
        destaqueElementoGetTestAberto?: DestaqueElementoGetTestAberto
        destaqueElementoGetTestOculto?: DestaqueElementoGetTestOculto
        destaqueElementoIdentidadeSelecao?: DestaqueElementoIdentidadeSelecao
        destaqueElementoIdentidadesIguais?: DestaqueElementoIdentidadesIguais
        destaqueElementoSincronizarSelecao?: DestaqueElementoSincronizarSelecao
        evaluateCampaigns?: EvaluateCampaigns
        configSetTestState?: ConfigSetTestState
        wasShown?: WasShown
        markShown?: MarkShown
      }
    }
  }).UserPulse
  const seletorFn = UserPulse?._internal?.destaqueElementoSeletorSeguro
  const localizarFn = UserPulse?._internal?.destaqueElementoLocalizarAlvo
  const calcularPosicaoFn = UserPulse?._internal?.destaqueElementoCalcularPosicao
  const calcularPosicaoTooltipFn = UserPulse?._internal?.destaqueElementoCalcularPosicaoTooltip
  const calcularBeaconFn = UserPulse?._internal?.destaqueElementoCalcularBeacon
  const rectsIguaisFn = UserPulse?._internal?.destaqueElementoRectsIguais
  const pontoRepresentativoFn = UserPulse?._internal?.destaqueElementoPontoRepresentativo
  const alvoRealmenteVisivelFn = UserPulse?._internal?.destaqueElementoAlvoRealmenteVisivel
  const mutacoesApenasNoRootFn = UserPulse?._internal?.destaqueElementoMutacoesApenasNoRoot
  const obterViewportFn = UserPulse?._internal?.destaqueElementoObterViewport
  const montarFn = UserPulse?._internal?.destaqueElementoMontar
  const resolverItensFn = UserPulse?._internal?.destaqueElementoResolverItens
  const montarTodosFn = UserPulse?._internal?.destaqueElementoMontarTodos
  const getTestClickListenerFn = UserPulse?._internal?.destaqueElementoGetTestClickListener
  const getTestInputListenerFn = UserPulse?._internal?.destaqueElementoGetTestInputListener
  const getTestUtilidadeStateFn = UserPulse?._internal?.destaqueElementoGetTestUtilidadeState
  const getTestAbertoFn = UserPulse?._internal?.destaqueElementoGetTestAberto
  const getTestOcultoFn = UserPulse?._internal?.destaqueElementoGetTestOculto
  const identidadeSelecaoFn = UserPulse?._internal?.destaqueElementoIdentidadeSelecao
  const identidadesIguaisFn = UserPulse?._internal?.destaqueElementoIdentidadesIguais
  const sincronizarSelecaoFn = UserPulse?._internal?.destaqueElementoSincronizarSelecao
  const evaluateCampaignsFn = UserPulse?._internal?.evaluateCampaigns
  const configSetTestStateFn = UserPulse?._internal?.configSetTestState
  const initFn = UserPulse?.init
  const updateContextFn = UserPulse?.updateContext
  const wasShownFn = UserPulse?._internal?.wasShown
  const markShownFn = UserPulse?._internal?.markShown
  assert.equal(typeof seletorFn, 'function', 'window.UserPulse._internal.destaqueElementoSeletorSeguro não foi exposta por widget.js')
  assert.equal(typeof localizarFn, 'function', 'window.UserPulse._internal.destaqueElementoLocalizarAlvo não foi exposta por widget.js')
  assert.equal(typeof calcularPosicaoFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularPosicao não foi exposta por widget.js')
  assert.equal(typeof calcularPosicaoTooltipFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularPosicaoTooltip não foi exposta por widget.js')
  assert.equal(typeof calcularBeaconFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularBeacon não foi exposta por widget.js')
  assert.equal(typeof rectsIguaisFn, 'function', 'window.UserPulse._internal.destaqueElementoRectsIguais não foi exposta por widget.js')
  assert.equal(typeof pontoRepresentativoFn, 'function', 'window.UserPulse._internal.destaqueElementoPontoRepresentativo não foi exposta por widget.js')
  assert.equal(typeof alvoRealmenteVisivelFn, 'function', 'window.UserPulse._internal.destaqueElementoAlvoRealmenteVisivel não foi exposta por widget.js')
  assert.equal(typeof mutacoesApenasNoRootFn, 'function', 'window.UserPulse._internal.destaqueElementoMutacoesApenasNoRoot não foi exposta por widget.js')
  assert.equal(typeof obterViewportFn, 'function', 'window.UserPulse._internal.destaqueElementoObterViewport não foi exposta por widget.js')
  assert.equal(typeof montarFn, 'function', 'window.UserPulse._internal.destaqueElementoMontar não foi exposta por widget.js')
  assert.equal(typeof resolverItensFn, 'function', 'window.UserPulse._internal.destaqueElementoResolverItens não foi exposta por widget.js')
  assert.equal(typeof montarTodosFn, 'function', 'window.UserPulse._internal.destaqueElementoMontarTodos não foi exposta por widget.js')
  assert.equal(typeof getTestClickListenerFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestClickListener não foi exposta por widget.js')
  assert.equal(typeof getTestInputListenerFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestInputListener não foi exposta por widget.js')
  assert.equal(typeof getTestUtilidadeStateFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestUtilidadeState não foi exposta por widget.js')
  assert.equal(typeof getTestAbertoFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestAberto não foi exposta por widget.js')
  assert.equal(typeof getTestOcultoFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestOculto não foi exposta por widget.js')
  assert.equal(typeof identidadeSelecaoFn, 'function', 'window.UserPulse._internal.destaqueElementoIdentidadeSelecao não foi exposta por widget.js')
  assert.equal(typeof identidadesIguaisFn, 'function', 'window.UserPulse._internal.destaqueElementoIdentidadesIguais não foi exposta por widget.js')
  assert.equal(typeof sincronizarSelecaoFn, 'function', 'window.UserPulse._internal.destaqueElementoSincronizarSelecao não foi exposta por widget.js')
  assert.equal(typeof evaluateCampaignsFn, 'function', 'window.UserPulse._internal.evaluateCampaigns não foi exposta por widget.js')
  assert.equal(typeof configSetTestStateFn, 'function', 'window.UserPulse._internal.configSetTestState não foi exposta por widget.js')
  assert.equal(typeof initFn, 'function', 'window.UserPulse.init não foi exposta por widget.js')
  assert.equal(typeof updateContextFn, 'function', 'window.UserPulse.updateContext não foi exposta por widget.js')
  assert.equal(typeof wasShownFn, 'function', 'window.UserPulse._internal.wasShown não foi exposta por widget.js')
  assert.equal(typeof markShownFn, 'function', 'window.UserPulse._internal.markShown não foi exposta por widget.js')
  destaqueElementoSeletorSeguro = seletorFn as DestaqueElementoSeletorSeguro
  destaqueElementoLocalizarAlvo = localizarFn as DestaqueElementoLocalizarAlvo
  destaqueElementoCalcularPosicao = calcularPosicaoFn as DestaqueElementoCalcularPosicao
  destaqueElementoCalcularPosicaoTooltip = calcularPosicaoTooltipFn as DestaqueElementoCalcularPosicaoTooltip
  destaqueElementoCalcularBeacon = calcularBeaconFn as DestaqueElementoCalcularBeacon
  destaqueElementoRectsIguais = rectsIguaisFn as DestaqueElementoRectsIguais
  destaqueElementoPontoRepresentativo = pontoRepresentativoFn as DestaqueElementoPontoRepresentativo
  destaqueElementoAlvoRealmenteVisivel = alvoRealmenteVisivelFn as DestaqueElementoAlvoRealmenteVisivel
  destaqueElementoMutacoesApenasNoRoot = mutacoesApenasNoRootFn as DestaqueElementoMutacoesApenasNoRoot
  destaqueElementoObterViewport = obterViewportFn as DestaqueElementoObterViewport
  destaqueElementoMontar = montarFn as DestaqueElementoMontar
  destaqueElementoResolverItens = resolverItensFn as DestaqueElementoResolverItens
  destaqueElementoMontarTodos = montarTodosFn as DestaqueElementoMontarTodos
  destaqueElementoGetTestClickListener = getTestClickListenerFn as DestaqueElementoGetTestClickListener
  destaqueElementoGetTestInputListener = getTestInputListenerFn as DestaqueElementoGetTestInputListener
  destaqueElementoGetTestUtilidadeState = getTestUtilidadeStateFn as DestaqueElementoGetTestUtilidadeState
  destaqueElementoGetTestAberto = getTestAbertoFn as DestaqueElementoGetTestAberto
  destaqueElementoGetTestOculto = getTestOcultoFn as DestaqueElementoGetTestOculto
  destaqueElementoIdentidadeSelecao = identidadeSelecaoFn as DestaqueElementoIdentidadeSelecao
  destaqueElementoIdentidadesIguais = identidadesIguaisFn as DestaqueElementoIdentidadesIguais
  destaqueElementoSincronizarSelecao = sincronizarSelecaoFn as DestaqueElementoSincronizarSelecao
  evaluateCampaigns = evaluateCampaignsFn as EvaluateCampaigns
  configSetTestState = configSetTestStateFn as ConfigSetTestState
  userPulseInit = initFn as UserPulseInit
  userPulseUpdateContext = updateContextFn as UserPulseUpdateContext
  wasShown = wasShownFn as WasShown
  markShown = markShownFn as MarkShown
})

describe('destaqueElementoSeletorSeguro', () => {
  test('monta o seletor pra um data-cy válido', () => {
    assert.equal(destaqueElementoSeletorSeguro('botao-finalizar-compra'), '[data-cy="botao-finalizar-compra"]')
  })

  test('rejeita data-cy vazio/ausente', () => {
    assert.equal(destaqueElementoSeletorSeguro(''), null)
    assert.equal(destaqueElementoSeletorSeguro(undefined), null)
    assert.equal(destaqueElementoSeletorSeguro(null), null)
  })

  test('nunca deixa um data-cy malicioso escapar do atributo [data-cy="..."]', () => {
    // Tentativa de fechar o atributo e injetar seletor extra — bloqueado
    // pelo mesmo charset validado no servidor, antes até de chamar CSS.escape.
    assert.equal(destaqueElementoSeletorSeguro('x"] , y'), null)
    assert.equal(destaqueElementoSeletorSeguro('x" onmouseover="1'), null)
  })
})

describe('destaqueElementoLocalizarAlvo — localiza o alvo de UM item (data_cy direto, sem checar modo_exibicao)', () => {
  // A partir da Fase 2 (múltiplos destaques), destaqueElementoLocalizarAlvo
  // recebe um ITEM (CampanhaDestaqueItem ou o pseudo-item legado) — só
  // precisa de `.data_cy`. A checagem de "isso é destaque_elemento mesmo?"
  // saiu daqui e virou responsabilidade de destaqueElementoResolverItens
  // (testado abaixo), que é quem decide SE existe algum item pra localizar.
  test('elemento existe no DOM -> retorna o elemento', () => {
    presentes.add('botao-cy')
    const alvo = destaqueElementoLocalizarAlvo({ data_cy: 'botao-cy' })
    assert.notEqual(alvo, null)
  })

  test('elemento não existe no DOM -> não exibe (retorna null, sem lançar erro)', () => {
    const alvo = destaqueElementoLocalizarAlvo({ data_cy: 'nao-existe-na-pagina' })
    assert.equal(alvo, null)
  })

  test('múltiplos matches do mesmo data-cy -> retorna null, sem escolher/trocar alvo silenciosamente', () => {
    presentes.add('data-cy-duplicado')
    duplicados.add('data-cy-duplicado')
    try {
      assert.equal(destaqueElementoLocalizarAlvo({ data_cy: 'data-cy-duplicado' }), null)
    } finally {
      duplicados.delete('data-cy-duplicado')
    }
  })

  test('item nulo/sem data_cy -> retorna null, sem lançar erro', () => {
    assert.equal(destaqueElementoLocalizarAlvo(null), null)
    assert.equal(destaqueElementoLocalizarAlvo({}), null)
  })
})

describe('campanha dispensada não reaparece (wasShown/markShown reaproveitados do modal)', () => {
  test('antes de markShown, wasShown é false — o destaque pode aparecer', () => {
    const campanha: Campanha = { id: 'camp-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-x' }
    assert.equal(wasShown(campanha, config), false)
  })

  test('depois de markShown (destaqueElementoMontar chama isso ao montar), wasShown é true — não reaparece', () => {
    const campanha: Campanha = { id: 'camp-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-y' }
    markShown(campanha, config)
    assert.equal(wasShown(campanha, config), true)
  })

  test('mostrar_uma_vez=false — política não se aplica, sempre elegível de novo', () => {
    const campanha: Campanha = { id: 'camp-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: false, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-z' }
    markShown(campanha, config)
    assert.equal(wasShown(campanha, config), false)
  })
})

describe('destaqueElementoCalcularPosicao — badge nunca sobrepõe o alvo', () => {
  const viewport: Viewport = { width: 1280, height: 800 }
  const badge: TamanhoBadge = { width: 160, height: 24 }

  test('espaço acima disponível -> posiciona acima, com gap de 8px', () => {
    const alvo = retangulo(300, 500, 140, 40)
    const pos = destaqueElementoCalcularPosicao(alvo, badge, viewport)
    assert.equal(pos.posicao, 'acima')
    assert.equal(pos.top, alvo.top - 8 - badge.height)
  })

  test('sem espaço acima (alvo colado no topo) -> posiciona abaixo, com gap de 8px', () => {
    const alvo = retangulo(10, 500, 140, 40)
    const pos = destaqueElementoCalcularPosicao(alvo, badge, viewport)
    assert.equal(pos.posicao, 'abaixo')
    assert.equal(pos.top, alvo.bottom + 8)
  })

  test('alvo próximo da borda direita -> badge não estoura a viewport', () => {
    const alvo = retangulo(300, 1200, 70, 40)
    const pos = destaqueElementoCalcularPosicao(alvo, badge, viewport)
    assert.ok(pos.left + badge.width <= viewport.width, 'badge não deve ultrapassar a borda direita da viewport')
    assert.ok(pos.left >= 0)
  })

  test('alvo próximo da borda esquerda -> badge não estoura a viewport', () => {
    const alvo = retangulo(300, 5, 40, 40)
    const pos = destaqueElementoCalcularPosicao(alvo, badge, viewport)
    assert.ok(pos.left >= 0, 'badge não deve ultrapassar a borda esquerda da viewport')
  })

  test('badge nunca ocupa a caixa do elemento alvo (acima ou abaixo)', () => {
    const casos = [retangulo(300, 500, 140, 40), retangulo(10, 500, 140, 40), retangulo(792, 500, 140, 6)]
    for (const alvo of casos) {
      const pos = destaqueElementoCalcularPosicao(alvo, badge, viewport)
      const badgeTop = pos.top
      const badgeBottom = pos.top + badge.height
      if (pos.posicao === 'acima') {
        assert.ok(badgeBottom <= alvo.top, `badge (bottom=${badgeBottom}) deve terminar antes do topo do alvo (top=${alvo.top})`)
      } else {
        assert.ok(badgeTop >= alvo.bottom, `badge (top=${badgeTop}) deve começar depois da base do alvo (bottom=${alvo.bottom})`)
      }
    }
  })
})

function intersecta(a: Retangulo, b: { top: number; left: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

describe('destaqueElementoCalcularPosicaoTooltip — tooltip nunca cobre o alvo', () => {
  const viewport: Viewport = { width: 1280, height: 800 }
  const tooltip: TamanhoBadge = { width: 260, height: 150 }

  test('espaço abaixo do alvo -> tooltip abaixo', () => {
    const alvo = retangulo(100, 500, 140, 40)
    const badge = retangulo(alvo.top - 32, alvo.right - 160, 160, 24)
    const pos = destaqueElementoCalcularPosicaoTooltip(alvo, badge, tooltip, viewport)
    assert.equal(pos.posicao, 'abaixo')
    assert.equal(pos.top, alvo.bottom + 8)
  })

  test('sem espaço abaixo (alvo colado na base) -> tooltip acima', () => {
    const alvo = retangulo(750, 500, 140, 40)
    const badge = retangulo(alvo.top - 32, alvo.right - 160, 160, 24)
    const pos = destaqueElementoCalcularPosicaoTooltip(alvo, badge, tooltip, viewport)
    assert.equal(pos.posicao, 'acima')
    assert.equal(pos.top, alvo.top - 8 - tooltip.height)
  })

  test('conflito acima e abaixo (alvo altíssimo) -> tooltip lateral', () => {
    const alvo = retangulo(10, 100, 200, 780)
    const badge = retangulo(alvo.top, alvo.right - 160, 160, 24)
    const pos = destaqueElementoCalcularPosicaoTooltip(alvo, badge, tooltip, viewport)
    assert.ok(pos.posicao === 'direita' || pos.posicao === 'esquerda', `esperado lateral, recebido "${pos.posicao}"`)
  })

  test('alvo próximo da borda direita -> tooltip permanece dentro da viewport', () => {
    const alvo = retangulo(100, 1200, 60, 40)
    const badge = retangulo(alvo.top - 32, alvo.right - 160, 160, 24)
    const pos = destaqueElementoCalcularPosicaoTooltip(alvo, badge, tooltip, viewport)
    assert.ok(pos.left >= 0, 'tooltip não deve ultrapassar a borda esquerda da viewport')
    assert.ok(pos.left + tooltip.width <= viewport.width, 'tooltip não deve ultrapassar a borda direita da viewport')
  })

  test('tooltip nunca intersecta a caixa do alvo, em nenhum dos 4 cenários acima', () => {
    const casos: Array<{ alvo: Retangulo; badge: Retangulo }> = [
      { alvo: retangulo(100, 500, 140, 40), badge: retangulo(68, 480, 160, 24) },
      { alvo: retangulo(750, 500, 140, 40), badge: retangulo(718, 480, 160, 24) },
      { alvo: retangulo(10, 100, 200, 780), badge: retangulo(10, 140, 160, 24) },
      { alvo: retangulo(100, 1200, 60, 40), badge: retangulo(68, 1100, 160, 24) },
      { alvo: retangulo(100, 5, 40, 40), badge: retangulo(68, 5, 160, 24) },
    ]
    for (const { alvo, badge } of casos) {
      const pos = destaqueElementoCalcularPosicaoTooltip(alvo, badge, tooltip, viewport)
      const caixaTooltip = { top: pos.top, left: pos.left, right: pos.left + tooltip.width, bottom: pos.top + tooltip.height }
      assert.equal(intersecta(alvo, caixaTooltip), false, `tooltip (posicao=${pos.posicao}) não pode intersectar o alvo`)
    }
  })
})

// Viewport estreita (mobile) reproduzindo o cenário relatado — a mesma
// função destaqueElementoCalcularPosicao/destaqueElementoCalcularBeacon do
// desktop, só que com um viewport bem menor, onde o clamp horizontal entra
// em jogo com muito mais frequência (ver server/src/widgetDestaqueElemento.test.ts
// acima pra desktop, que não passa perto do clamp com esses mesmos alvos).
describe('destaqueElementoCalcularPosicao / destaqueElementoCalcularBeacon — mobile (viewport estreita)', () => {
  const viewportMobile: Viewport = { width: 375, height: 667 }
  const badge: TamanhoBadge = { width: 160, height: 24 }

  test('alvo próximo à borda direita em viewport estreita -> badge é clampado, não estoura a tela', () => {
    const alvo = retangulo(300, 340, 30, 40) // right = 370, quase no limite de 375
    const pos = destaqueElementoCalcularPosicao(alvo, badge, viewportMobile)
    const maxLeft = viewportMobile.width - badge.width - 8
    assert.equal(pos.left, maxLeft, 'badge deve ser clampado exatamente na borda direita disponível')
    assert.ok(pos.left + badge.width <= viewportMobile.width, 'badge não pode estourar a viewport mobile')
  })

  test('badge largo (texto longo) precisa ser deslocado pra esquerda pra caber na tela', () => {
    const badgeLargo: TamanhoBadge = { width: 300, height: 24 }
    const alvo = retangulo(300, 200, 40, 40) // right = 240; alinhado à direita o badge de 300px estouraria a esquerda (240-300 = -60)
    const pos = destaqueElementoCalcularPosicao(alvo, badgeLargo, viewportMobile)
    assert.equal(pos.left, 8, 'badge deve ser deslocado até a margem esquerda (8px), não pode ficar com left negativo')
    assert.ok(pos.left >= 0, 'badge não pode sair da viewport pela esquerda')
  })

  test('em qualquer um dos casos acima, o badge clampado continua sem sobrepor o alvo', () => {
    const casos: Array<{ alvo: Retangulo; badgeSize: TamanhoBadge }> = [
      { alvo: retangulo(300, 340, 30, 40), badgeSize: badge },
      { alvo: retangulo(300, 200, 40, 40), badgeSize: { width: 300, height: 24 } },
      { alvo: retangulo(10, 5, 40, 40), badgeSize: badge }, // colado nos dois cantos (topo + esquerda)
    ]
    for (const { alvo, badgeSize } of casos) {
      const pos = destaqueElementoCalcularPosicao(alvo, badgeSize, viewportMobile)
      const caixaBadge = { top: pos.top, left: pos.left, right: pos.left + badgeSize.width, bottom: pos.top + badgeSize.height }
      assert.equal(intersecta(alvo, caixaBadge), false, `badge (posicao=${pos.posicao}) não pode sobrepor o alvo`)
    }
  })

  test('beacon aponta pra dentro da largura do alvo mesmo depois do badge ser clampado horizontalmente', () => {
    // Mesmo cenário do teste "badge largo" acima: sem o cálculo dinâmico do
    // beacon, um `left:50%` fixo no centro do badge (300px de largura,
    // começando em left=8) apontaria pra x=158 — bem longe do alvo
    // (right=240, ou seja, fora da faixa [200,240]). O cálculo correto
    // projeta o centro do alvo dentro da largura do badge.
    const alvo = retangulo(300, 200, 40, 40) // left=200, right=240, centro=220
    const badgeRectClampado = retangulo(300 - 8 - 24, 8, 300, 24) // left=8 (clamped), width=300 — mesmo resultado do teste anterior
    const posBeacon = destaqueElementoCalcularBeacon(alvo, badgeRectClampado)
    const beaconAbsolutoX = badgeRectClampado.left + posBeacon.left
    assert.ok(
      beaconAbsolutoX >= alvo.left && beaconAbsolutoX <= alvo.right,
      `beacon (x absoluto=${beaconAbsolutoX}) deve apontar pra dentro da largura do alvo [${alvo.left}, ${alvo.right}]`
    )
  })

  test('resize desktop -> mobile: os mesmos retângulos do alvo recalculam corretamente pro novo viewport', () => {
    const viewportDesktop: Viewport = { width: 1280, height: 800 }
    // Alvo perto da borda direita em ambos os viewports (ex.: layout que não
    // reflui, só o viewport muda de largura — replica test-embed.html, que
    // não tem @media breakpoints).
    const alvo = retangulo(300, 1100, 140, 40) // right = 1240

    const posDesktop = destaqueElementoCalcularPosicao(alvo, badge, viewportDesktop)
    // Em 1280px de largura, right=1240 + gap não estoura — badge fica na
    // posição preferencial (alinhado à direita do alvo, sem clamp).
    assert.equal(posDesktop.left, alvo.right - badge.width)

    // O MESMO alvo, recalculado pro viewport mobile (375px) após um resize —
    // 1100px de left já não existe nessa largura, então o clamp entra em
    // ação e o resultado muda, mas continua válido (dentro da viewport, sem
    // sobrepor o alvo).
    const posMobile = destaqueElementoCalcularPosicao(alvo, badge, viewportMobile)
    assert.notEqual(posMobile.left, posDesktop.left, 'o recálculo pro viewport mobile deve produzir uma posição diferente do desktop')
    assert.ok(posMobile.left + badge.width <= viewportMobile.width, 'resultado mobile deve caber na nova viewport')
    const caixaBadgeMobile = { top: posMobile.top, left: posMobile.left, right: posMobile.left + badge.width, bottom: posMobile.top + badge.height }
    assert.equal(intersecta(alvo, caixaBadgeMobile), false, 'badge recalculado pro mobile não pode sobrepor o alvo')
  })
})

// Política de reexibição de destaque_elemento: renderizar o badge NÃO é
// "visto" — só uma interação explícita (clicar no badge, no CTA, ou
// dispensar) marca a campanha como concluída pra aquele navegador/usuário.
// Reaproveita a MESMA infra (wasShown/markShown/localStorage) que o modal
// tradicional já usava — só o MOMENTO em que markShown roda mudou, e só
// pra este formato (destaqueElementoMontar, não wasShown/markShown em si).
describe('destaque_elemento — markShown só numa interação explícita, nunca só ao renderizar', () => {
  function criarAlvo() {
    return { tagName: 'BUTTON', getBoundingClientRect: () => ({ top: 300, left: 500, right: 640, bottom: 340, width: 140, height: 40 }) }
  }

  test('renderizar o badge NÃO marca como visto (destaqueElementoMontar não chama markShown ao montar)', () => {
    const campanha: Campanha = { id: 'destaque-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-destaque-1' }
    destaqueElementoMontar(campanha, config, criarAlvo())
    assert.equal(wasShown(campanha, config), false, 'só renderizar o badge não pode contar como "visto"')
  })

  test('sem interação, a campanha continua elegível (equivalente a sair da tela/recarregar sem interagir)', () => {
    const campanha: Campanha = { id: 'destaque-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-destaque-2' }
    destaqueElementoMontar(campanha, config, criarAlvo())
    // "Reload" não existe de verdade nesse harness — o que representa reload
    // sem interação é justamente wasShown continuar false depois do mount,
    // já que é essa mesma checagem que agendarDestaqueElemento faz antes de
    // remontar o destaque numa nova carga de página.
    assert.equal(wasShown(campanha, config), false)
  })

  test('clique no badge marca a interação (destaque some numa próxima carga de página)', () => {
    const campanha: Campanha = { id: 'destaque-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-destaque-3' }
    destaqueElementoMontar(campanha, config, criarAlvo())
    const listener = destaqueElementoGetTestClickListener()
    assert.notEqual(listener, null, 'clique não foi religado no root do destaque')
    listener!({ target: elementoClique('data-up-destaque-toggle') })
    assert.equal(wasShown(campanha, config), true)
  })

  test('clique no CTA marca a interação', () => {
    const campanha: Campanha = { id: 'destaque-4', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-destaque-4' }
    destaqueElementoMontar(campanha, config, criarAlvo())
    const listener = destaqueElementoGetTestClickListener()
    assert.notEqual(listener, null)
    listener!({ target: elementoClique('data-up-destaque-cta', { 'data-up-url': 'https://example.com/novidade' }) })
    assert.equal(wasShown(campanha, config), true)
  })

  test('dispensar (fechar) marca a interação', () => {
    const campanha: Campanha = { id: 'destaque-5', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-destaque-5' }
    destaqueElementoMontar(campanha, config, criarAlvo())
    const listener = destaqueElementoGetTestClickListener()
    assert.notEqual(listener, null)
    listener!({ target: elementoClique('data-up-destaque-close') })
    assert.equal(wasShown(campanha, config), true)
  })

  test('campanha tradicional (modal) continua marcando "visto" pela mesma wasShown/markShown, sem mudança de semântica', () => {
    // O que mudou nesta tarefa foi só QUANDO destaqueElementoMontar chama
    // markShown — wasShown/markShown em si continuam as mesmas funções
    // genéricas de sempre, reaproveitadas por scheduleAutoOpen pro modal
    // exatamente como antes (marca ao abrir, não numa interação).
    const campanha: Campanha = { id: 'modal-1', modo_exibicao: 'modal_automatica', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-modal-1' }
    assert.equal(wasShown(campanha, config), false)
    markShown(campanha, config) // mesma chamada eager que scheduleAutoOpen faz ao abrir o modal
    assert.equal(wasShown(campanha, config), true)
  })

  test('cálculo de posição/beacon mobile (correção anterior) continua inalterado por esta mudança', () => {
    // Regressão: garante que mexer só no MOMENTO do markShown não afetou a
    // matemática de posicionamento aprovada na tarefa anterior.
    const viewportMobile: Viewport = { width: 375, height: 667 }
    const badgeLargo: TamanhoBadge = { width: 300, height: 24 }
    const alvo = retangulo(300, 200, 40, 40)
    const pos = destaqueElementoCalcularPosicao(alvo, badgeLargo, viewportMobile)
    assert.equal(pos.left, 8)
    const badgeRectClampado = retangulo(pos.top, pos.left, badgeLargo.width, badgeLargo.height)
    const posBeacon = destaqueElementoCalcularBeacon(alvo, badgeRectClampado)
    const beaconAbsolutoX = badgeRectClampado.left + posBeacon.left
    assert.ok(beaconAbsolutoX >= alvo.left && beaconAbsolutoX <= alvo.right)
  })
})

describe('destaqueElementoRectsIguais — comparação pura de retângulos', () => {
  test('retângulos idênticos são iguais', () => {
    const a = retangulo(100, 100, 140, 40)
    const b = retangulo(100, 100, 140, 40)
    assert.equal(destaqueElementoRectsIguais(a, b), true)
  })

  test('top diferente -> não são iguais (mesmo width/height/left)', () => {
    const a = retangulo(250, 500, 140, 40)
    const b = retangulo(300, 500, 140, 40)
    assert.equal(destaqueElementoRectsIguais(a, b), false)
  })

  test('null/undefined só são iguais um ao outro', () => {
    assert.equal(destaqueElementoRectsIguais(null, null), true)
    assert.equal(destaqueElementoRectsIguais(undefined, undefined), true)
    assert.equal(destaqueElementoRectsIguais(null, retangulo(0, 0, 10, 10)), false)
    assert.equal(destaqueElementoRectsIguais(retangulo(0, 0, 10, 10), null), false)
  })
})

// Cenário reproduzido em homologação: o alvo é localizado e o badge é
// ancorado nele, mas um reflow tardio (comum em mobile — menu responsivo,
// banner, imagem sem dimensão reservada) empurra o alvo pra baixo SEM mudar
// o tamanho dele. Nesse caso o ResizeObserver do alvo (mecanismo já
// aprovado) nunca dispara — ele só reage a mudança de TAMANHO da caixa
// observada, nunca só de posição, por definição da própria API. Confirmado
// medindo getBoundingClientRect em frames sucessivos abaixo (fakeAlvoComReflow),
// não assumido.
describe('estabilização pós-mount — reflow que só muda a posição do alvo (não o tamanho)', () => {
  // Simula o alvo indo de Y=250 (rect medido na montagem, antes do reflow
  // assentar) pra Y=300 (posição final, depois do reflow) — as primeiras 3
  // chamadas devolvem o Y antigo, a partir da 4ª o Y novo (estabiliza e não
  // muda mais depois disso), reproduzindo exatamente a janela de tempo entre
  // o mount e o reflow tardio terminar.
  function fakeAlvoComReflow() {
    let chamadas = 0
    const alvo = {
      tagName: 'BUTTON',
      getBoundingClientRect: () => {
        chamadas++
        const top = chamadas <= 3 ? 250 : 300
        return retangulo(top, 500, 140, 40)
      },
    }
    return { alvo, contarChamadas: () => chamadas }
  }

  test('sequência real dos rects (frame a frame): Y=250,250,250 depois Y=300 estável -> muda detectada e badge reposicionado pro Y=300', () => {
    const { alvo, contarChamadas } = fakeAlvoComReflow()
    const campanha: Campanha = { id: 'destaque-reflow-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-reflow-1' }
    destaqueElementoMontar(campanha, config, alvo)
    assert.notEqual(ultimoRootDestaque, null)
    // badge fake tem height=24; gap=8 -> top aplicado = alvoRect.top - 32.
    // Sem a estabilização, o badge ficaria preso em 250-32=218px (Y antigo).
    assert.equal(ultimoRootDestaque!.style.top, '268px', 'depois do reflow (Y 250->300), o badge deve seguir o alvo pro Y NOVO — não pode ficar preso no Y antigo (218px)')
    // 8 chamadas = 1 (render inicial) + 1 (baseline do monitor) + 2 (frames
    // que ainda liam Y antigo/detectaram a mudança) + 1 (remedição dentro do
    // reposicionamento) + 3 (frames estáveis consecutivos que encerram o
    // monitor) — ver destaqueElementoEstabilizar.
    assert.equal(contarChamadas(), 8, 'número de medições esperado pra essa sequência exata de frames')
  })

  test('depois de detectar a mudança, os frames seguintes com o MESMO rect não geram reposicionamentos extras', () => {
    let chamadas = 0
    const alvo = {
      tagName: 'BUTTON',
      // Nunca reflow — rect já estável desde o primeiro frame.
      getBoundingClientRect: () => { chamadas++; return retangulo(250, 500, 140, 40) },
    }
    const campanha: Campanha = { id: 'destaque-estavel-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-estavel-1' }
    destaqueElementoMontar(campanha, config, alvo)
    assert.equal(ultimoRootDestaque!.style.top, '218px')
    // 1 (render inicial) + 1 (baseline) + 3 (frames estáveis consecutivos,
    // sem nenhuma mudança pra detectar) = 5 chamadas, e o monitor encerra
    // sozinho — nunca mais que isso.
    assert.equal(chamadas, 5, 'com o alvo já estável desde o início, o monitor deve encerrar rápido, sem reposicionamentos extras')
  })

  test('"Até interagir" continua intacta: reposicionar durante a estabilização NUNCA marca a campanha como vista', () => {
    const { alvo } = fakeAlvoComReflow()
    const campanha: Campanha = { id: 'destaque-reflow-naomarca', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-reflow-naomarca' }
    destaqueElementoMontar(campanha, config, alvo)
    // O reposicionamento causado pelo reflow (mecanismo desta tarefa) é
    // puramente visual — não é uma interação do usuário, então não pode
    // encerrar a política "Até interagir" implementada na tarefa anterior.
    assert.equal(wasShown(campanha, config), false)
  })
})

// O corte por tempo (não por frames estáveis) precisa de um cenário onde o
// alvo NUNCA para de mudar. Sandbox própria e mínima, isolada da instância
// compartilhada — window.requestAnimationFrame e Date.now são controlados
// pelo próprio teste (relógio falso avançado manualmente, fila de frames
// drenada sob demanda), nunca por setTimeout/tempo real: cada "frame" é só
// uma função na fila sendo chamada e o relógio avançando um valor fixo, sem
// nenhum macrotask real envolvido — determinístico independente de carga da
// máquina rodando a suíte. Isso também evita o estouro de pilha que um stub
// SÍNCRONO e recursivo de requestAnimationFrame causaria (chamar passo()
// direto de dentro de si mesma, sem nunca desempilhar): aqui cada frame só
// entra na fila (fica pendente) até o teste decidir drenar, então nunca
// empilha, mesmo sendo síncrono.
describe('estabilização — limite máximo de execução (tempo, relógio controlado)', () => {
  test('alvo que nunca estabiliza é cortado por tempo máximo (~1s simulados), nunca roda pra sempre', () => {
    const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
    const localStorageMap = new Map<string, string>()
    let chamadas = 0
    const alvo = {
      tagName: 'BUTTON',
      // Nunca estabiliza de propósito — top muda em todo frame, forçando o
      // corte por tempo (não por frames estáveis) a ser o único jeito de
      // encerrar o monitoramento.
      getBoundingClientRect: () => { chamadas++; return retangulo(100 + chamadas, 500, 140, 40) },
    }
    let rootLocal: { style: Record<string, string>; querySelector: (s: string) => unknown } | null = null
    // Relógio falso — só Date.now() é chamado pelo trecho de estabilização
    // exercitado aqui (destaqueElementoEstabilizar, ver widget.js), então um
    // stub mínimo com só `now()` basta; o teste avança `agoraMs` manualmente,
    // nunca o tempo real da máquina.
    let agoraMs = 0
    // Fila de frames pendentes — window.requestAnimationFrame só enfileira
    // (nunca executa nem agenda via setTimeout/macrotask); o teste decide
    // quando "rodar 1 frame" chamando drenarFrame(), que também é quem faz o
    // relógio avançar. rafChamadas conta toda chamada de requestAnimationFrame
    // (inclusive as que viram o próximo frame reagendado), pra provar que o
    // monitor realmente para de reagendar depois do corte.
    let rafFila: Array<() => void> = []
    let rafChamadas = 0
    function drenarFrame(incrementoMs: number) {
      agoraMs += incrementoMs
      const pendentes = rafFila
      rafFila = []
      for (const cb of pendentes) cb()
    }
    const sandboxLocal: Record<string, unknown> = {
      console,
      URL,
      URLSearchParams,
      Date: { now: () => agoraMs },
      document: {
        currentScript: { src: 'http://localhost/widget.js' },
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => null,
        createElement: () => {
          const listeners: Record<string, Array<(event: unknown) => void>> = {}
          let html = ''
          const badgeEl = { offsetWidth: 160, offsetHeight: 24, getBoundingClientRect: () => retangulo(0, 0, 160, 24) }
          rootLocal = {
            style: {} as Record<string, string>,
            parentNode: { removeChild() {} },
            setAttribute() {},
            addEventListener(type: string, cb: (event: unknown) => void) { (listeners[type] = listeners[type] || []).push(cb) },
            removeEventListener() {},
            listeners,
            get innerHTML() { return html },
            set innerHTML(v: string) { html = v },
            querySelector: (seletor: string) => (seletor === '.up-destaque-badge' ? badgeEl : null),
          } as unknown as { style: Record<string, string>; querySelector: (s: string) => unknown }
          return rootLocal
        },
        addEventListener() {},
        removeEventListener() {},
        body: { contains: () => true, appendChild() {} },
      },
    }
    sandboxLocal.window = {
      location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
      localStorage: {
        getItem: (chave: string) => (localStorageMap.has(chave) ? localStorageMap.get(chave)! : null),
        setItem: (chave: string, valor: string) => { localStorageMap.set(chave, valor) },
        removeItem: (chave: string) => { localStorageMap.delete(chave) },
      },
      addEventListener() {},
      removeEventListener() {},
      // Só enfileira — nunca executa a callback nem agenda via
      // setTimeout/macrotask. Quem decide quando o "frame" roda (e faz o
      // relógio falso avançar) é drenarFrame(), abaixo, chamado pelo teste.
      requestAnimationFrame: (cb: () => void) => { rafChamadas++; rafFila.push(cb); return rafChamadas },
      open() {},
      history: { pushState() {}, replaceState() {} },
      CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
    }
    vm.createContext(sandboxLocal)
    vm.runInContext(codigo, sandboxLocal, { filename: 'widget.js' })
    const montarLocal = (sandboxLocal.window as { UserPulse?: { _internal?: { destaqueElementoMontar?: DestaqueElementoMontar } } })
      .UserPulse?._internal?.destaqueElementoMontar
    assert.equal(typeof montarLocal, 'function')

    montarLocal!(
      { id: 'destaque-maxtime', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true },
      { sistema: 'sis', tela: 'tela-maxtime' },
      alvo
    )

    // Drena frame a frame, avançando o relógio falso ~16ms por vez (~60fps),
    // até a fila esvaziar sozinha — é isso que prova o corte por tempo: o
    // alvo nunca estabiliza (rect muda sempre), então só
    // `Date.now() - inicio >= DESTAQUE_ESTABILIZACAO_MAX_MS` (dentro de
    // destaqueElementoEstabilizar, ver widget.js) pode fazer passo() parar de
    // reagendar. Limite de 300 iterações (~4.8s simulados) é só uma rede de
    // segurança contra uma regressão real que vire loop infinito — bem acima
    // do ~1s (DESTAQUE_ESTABILIZACAO_MAX_MS) esperado pra sair sozinho.
    let frames = 0
    while (rafFila.length > 0 && frames < 300) {
      drenarFrame(16)
      frames++
    }
    assert.ok(frames < 300, 'não pode ser a rede de segurança que encerrou o loop — o corte por tempo (~1s) precisa ter agido sozinho')
    assert.equal(rafFila.length, 0, 'depois do corte por tempo máximo, nenhum novo frame pode estar pendente')
    assert.ok(agoraMs < 2000, `corte deveria acontecer perto de ~1s simulado (DESTAQUE_ESTABILIZACAO_MAX_MS), levou ${agoraMs}ms simulados`)

    const chamadasNoCorte = chamadas
    const rafChamadasNoCorte = rafChamadas
    // Avança bem mais o relógio e tenta drenar de novo — fila já está vazia
    // (nada foi reagendado), então nada deveria rodar: prova que o
    // monitoramento realmente parou, não é só uma pausa entre frames.
    drenarFrame(5000)
    assert.equal(chamadas, chamadasNoCorte, 'depois do corte, nenhum novo frame pode rodar — nunca vira polling permanente')
    assert.equal(rafChamadas, rafChamadasNoCorte, 'depois do corte, requestAnimationFrame não pode ser chamado de novo')
    assert.ok(rootLocal !== null)
  })
})

describe('destaqueElementoMutacoesApenasNoRoot — filtra mutations auto-causadas pelo próprio widget', () => {
  const root = { contains: (node: unknown) => node === 'root' || node === 'badge' || node === 'beacon' }

  test('todas as mutations vieram de dentro do root -> ignora (evita loop com as próprias alterações do widget)', () => {
    assert.equal(destaqueElementoMutacoesApenasNoRoot(root, [{ target: 'root' }, { target: 'badge' }, { target: 'beacon' }]), true)
  })

  test('pelo menos uma mutation fora do root -> não ignora (reage)', () => {
    assert.equal(destaqueElementoMutacoesApenasNoRoot(root, [{ target: 'root' }, { target: 'algum-elemento-da-pagina' }]), false)
  })

  test('lista vazia -> ignora (nada aconteceu fora do root)', () => {
    assert.equal(destaqueElementoMutacoesApenasNoRoot(root, []), true)
  })
})

describe('destaqueElementoObterViewport — fonte da dimensão da viewport', () => {
  // assert.deepEqual/deepStrictEqual comparam o objeto retornado (criado
  // DENTRO do contexto vm, outro realm) contra um literal do lado de fora —
  // Node acusa "same structure but not reference-equal" nesse cross-realm
  // mesmo quando os valores batem; comparar width/height direto evita isso.
  test('visualViewport (375) prevalece sobre innerWidth (390) quando disponível', () => {
    sandboxCompartilhado!.window.visualViewport = { width: 375, height: 800 }
    sandboxCompartilhado!.window.innerWidth = 390
    sandboxCompartilhado!.window.innerHeight = 844
    const vp = destaqueElementoObterViewport()
    assert.equal(vp.width, 375)
    assert.equal(vp.height, 800)
    sandboxCompartilhado!.window.visualViewport = undefined
  })

  test('sem visualViewport, cai pro clientWidth/clientHeight do documentElement', () => {
    sandboxCompartilhado!.window.visualViewport = undefined
    sandboxCompartilhado!.window.innerWidth = 390
    sandboxCompartilhado!.window.innerHeight = 844
    sandboxCompartilhado!.document.documentElement = { clientWidth: 375, clientHeight: 829 }
    const vp = destaqueElementoObterViewport()
    assert.equal(vp.width, 375)
    assert.equal(vp.height, 829)
    sandboxCompartilhado!.document.documentElement = undefined
  })

  test('sem visualViewport nem documentElement, cai pro innerWidth/innerHeight (último recurso)', () => {
    sandboxCompartilhado!.window.visualViewport = undefined
    sandboxCompartilhado!.document.documentElement = undefined
    sandboxCompartilhado!.window.innerWidth = 390
    sandboxCompartilhado!.window.innerHeight = 844
    const vp = destaqueElementoObterViewport()
    assert.equal(vp.width, 390)
    assert.equal(vp.height, 844)
  })
})

// Cenário exato reproduzido e comprovado na tarefa anterior: um `resize`
// manual corrigia na hora (destaqueElementoReposicionar em si sempre esteve
// correto) — o que faltava era algo rearmar a estabilização quando o reflow
// só acontece DEPOIS do monitor inicial de ~1s já ter encerrado. Aumentar
// DESTAQUE_ESTABILIZACAO_MAX_MS não resolveria (só adiaria o mesmo bug) —
// por isso o MutationObserver: reage a QUALQUER mudança de layout real
// enquanto o destaque estiver montado, não só na primeira janela pós-mount.
describe('mutation tardia (depois do monitor inicial já ter encerrado) rearma a estabilização', () => {
  test('estabilização inicial encerra normalmente (Y=134) e só DEPOIS uma mutation externa detecta Y=354 e reposiciona', () => {
    let moveu = false
    let chamadas = 0
    const alvo = {
      tagName: 'BUTTON',
      getBoundingClientRect: () => {
        chamadas++
        return moveu ? retangulo(354, 500, 140, 40) : retangulo(134, 500, 140, 40)
      },
    }
    const campanha: Campanha = { id: 'destaque-mutacao-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-mutacao-1' }

    // Fase 1 (equivalente ao teste "estabilização inicial encerra
    // normalmente"): monta com o alvo já estável em Y=134.
    destaqueElementoMontar(campanha, config, alvo)
    assert.equal(ultimoRootDestaque!.style.top, (134 - 32) + 'px', 'estabilização inicial deve terminar com o badge correto em Y=134')
    const chamadasAntesDaMutacao = chamadas

    // Fase 2: nenhum rAF pendente nesse ponto (monitor já encerrou). Algo
    // FORA do widget move o alvo pra Y=354 — reflow tardio real, sem
    // disparar scroll/resize/ResizeObserver do alvo.
    moveu = true
    const observer = ultimoMutationObserverDestaque
    assert.notEqual(observer, null, 'MutationObserver não foi registrado em destaqueElementoMontar')
    observer!.cb([{ target: { tagName: 'DIV' } }]) // elemento qualquer FORA do root do destaque

    assert.equal(ultimoRootDestaque!.style.top, (354 - 32) + 'px', 'depois da mutation tardia, o badge deve seguir o alvo pro NOVO Y — não pode ficar preso no Y antigo')
    assert.ok(chamadas > chamadasAntesDaMutacao, 'a reação à mutation precisa medir o alvo de novo')
  })

  test('mutation dentro do próprio root do destaque é ignorada — não reposiciona nem entra em loop', () => {
    let chamadas = 0
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => { chamadas++; return retangulo(134, 500, 140, 40) } }
    const campanha: Campanha = { id: 'destaque-mutacao-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-mutacao-2' }
    destaqueElementoMontar(campanha, config, alvo)
    const chamadasApósMontar = chamadas
    const observer = ultimoMutationObserverDestaque
    assert.notEqual(observer, null)
    // root/badge/beacon do próprio widget (auto-causado por
    // destaqueElementoReposicionar setando style/atributos) — nunca deve
    // disparar uma nova reação.
    observer!.cb([{ target: ultimoRootDestaque }])
    assert.equal(chamadas, chamadasApósMontar, 'mutation originada dentro do próprio root não pode remedir o alvo nem reposicionar')
  })

  test('"Até interagir" continua intacta: reagir a uma mutation tardia NUNCA marca a campanha como vista', () => {
    let moveu = false
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => (moveu ? retangulo(354, 500, 140, 40) : retangulo(134, 500, 140, 40)) }
    const campanha: Campanha = { id: 'destaque-mutacao-naomarca', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-mutacao-naomarca' }
    destaqueElementoMontar(campanha, config, alvo)
    moveu = true
    ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    assert.equal(wasShown(campanha, config), false)
  })

  test('desmontar (via clique em dispensar) desconecta o MutationObserver e ignora reações agendadas depois', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-desmontar-mutation', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-desmontar-mutation' }
    destaqueElementoMontar(campanha, config, alvo)
    const observer = ultimoMutationObserverDestaque
    assert.notEqual(observer, null)
    assert.equal(observer!.disconnected, false)

    const listener = destaqueElementoGetTestClickListener()
    assert.notEqual(listener, null)
    listener!({ target: elementoClique('data-up-destaque-close') })

    assert.equal(observer!.disconnected, true, 'destaqueElementoDesmontar deve desconectar o MutationObserver')
    // Uma notificação chegando DEPOIS do disconnect (o fake não impede
    // sozinho — um MutationObserver real pararia de notificar) não pode
    // fazer nada: destaqueElementoAgendarReacao ignora porque
    // destaqueElementoState.root já não é mais esse root desmontado.
    assert.doesNotThrow(() => observer!.cb([{ target: { tagName: 'DIV' } }]))
  })

  test('fontes carregando (document.fonts.ready) dispara um novo reposicionamento quando a API existe', async () => {
    sandboxCompartilhado!.document.fonts = { ready: Promise.resolve() }
    let chamadas = 0
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => { chamadas++; return retangulo(134, 500, 140, 40) } }
    const campanha: Campanha = { id: 'destaque-fontes-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-fontes-1' }
    destaqueElementoMontar(campanha, config, alvo)
    const chamadasApósMontar = chamadas
    // document.fonts.ready é uma Promise — dá tempo do microtask (.then)
    // rodar antes de checar.
    await Promise.resolve()
    await Promise.resolve()
    assert.ok(chamadas > chamadasApósMontar, 'document.fonts.ready resolvendo deve remedir o alvo e reposicionar de novo')
    sandboxCompartilhado!.document.fonts = undefined
  })
})

describe('mutations no mesmo frame coalescem numa única reação (no máximo 1 requestAnimationFrame agendado)', () => {
  test('5 notificações da mutation observer antes do frame virar -> só 1 requestAnimationFrame é pedido', () => {
    const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
    const localStorageMap = new Map<string, string>()
    let rafChamadas = 0
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    let mutationObserverCb: ((records: Array<{ target: unknown }>) => void) | null = null
    const sandboxLocal: Record<string, unknown> = {
      console,
      URL,
      URLSearchParams,
      document: {
        currentScript: { src: 'http://localhost/widget.js' },
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => null,
        createElement: () => {
          const badgeEl = { offsetWidth: 160, offsetHeight: 24, getBoundingClientRect: () => retangulo(0, 0, 160, 24) }
          return {
            style: {} as Record<string, string>,
            parentNode: { removeChild() {} },
            setAttribute() {},
            // Nada é "do root" neste teste de propósito — não é o
            // comportamento sob teste aqui (ver suíte dedicada acima).
            contains: () => false,
            addEventListener() {},
            removeEventListener() {},
            innerHTML: '',
            querySelector: (s: string) => (s === '.up-destaque-badge' ? badgeEl : null),
          }
        },
        addEventListener() {},
        removeEventListener() {},
        body: { contains: () => true, appendChild() {} },
      },
    }
    sandboxLocal.window = {
      MutationObserver: class {
        constructor(cb: (records: Array<{ target: unknown }>) => void) { mutationObserverCb = cb }
        observe() {}
        disconnect() {}
      },
      location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
      localStorage: {
        getItem: (chave: string) => (localStorageMap.has(chave) ? localStorageMap.get(chave)! : null),
        setItem: (chave: string, valor: string) => { localStorageMap.set(chave, valor) },
        removeItem: (chave: string) => { localStorageMap.delete(chave) },
      },
      addEventListener() {},
      removeEventListener() {},
      // Deferido de propósito (NÃO executa o callback) — só conta quantas
      // vezes um novo frame foi PEDIDO, sem deixar nenhum "virar". É isso
      // que isola o coalescing: se cada mutation agendasse seu próprio rAF,
      // essa contagem seria 5, não 1.
      requestAnimationFrame: (cb: () => void) => { rafChamadas++; return rafChamadas },
      open() {},
      history: { pushState() {}, replaceState() {} },
      CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
    }
    vm.createContext(sandboxLocal)
    vm.runInContext(codigo, sandboxLocal, { filename: 'widget.js' })
    const montarLocal = (sandboxLocal.window as { UserPulse?: { _internal?: { destaqueElementoMontar?: DestaqueElementoMontar } } })
      .UserPulse?._internal?.destaqueElementoMontar
    assert.equal(typeof montarLocal, 'function')
    montarLocal!(
      { id: 'diag-coalesce', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true },
      { sistema: 'sis', tela: 'tela-coalesce' },
      alvo
    )

    // Só nos interessam os rAFs pedidos DEPOIS do mount (que já pede alguns
    // sozinho: duplo rAF do primeiro render + o da estabilização inicial).
    rafChamadas = 0

    assert.notEqual(mutationObserverCb, null)
    for (let i = 0; i < 5; i++) mutationObserverCb!([{ target: { tagName: 'DIV' } }])

    assert.equal(rafChamadas, 1, 'múltiplas mutations antes do frame virar devem coalescer num único requestAnimationFrame agendado')
  })
})

// Fase 2 — múltiplos destaques independentes por campanha (ex.:
// filtro-status, filtro-profissional, filtro-convenio). destaqueElementoResolverItens
// é pura (fallback destaques[] vs pseudo-item legado); destaqueElementoMontarTodos
// é quem orquestra o mount de ponta a ponta.
describe('destaqueElementoResolverItens — destaques[] tem prioridade, fallback legado quando vazio/ausente', () => {
  test('campanha com destaques[] -> retorna exatamente esses itens', () => {
    const destaques: DestaqueItem[] = [
      { id: 'item-1', data_cy: 'filtro-status', titulo: 'Status' },
      { id: 'item-2', data_cy: 'filtro-profissional', titulo: 'Profissional' },
    ]
    const itens = destaqueElementoResolverItens({ id: 'c1', modo_exibicao: 'destaque_elemento', destaques })
    assert.equal(itens.length, 2)
    assert.equal(itens[0].id, 'item-1')
    assert.equal(itens[1].id, 'item-2')
  })

  test('sem destaques[] (campanha legada, pré-Fase-2) -> 1 pseudo-item com id:null a partir dos campos antigos', () => {
    const itens = destaqueElementoResolverItens({
      id: 'c2', modo_exibicao: 'destaque_elemento',
      data_cy: 'botao-antigo', titulo: 'Título antigo', descricao: 'Descrição antiga',
      subtitulo: 'Badge antigo', texto_botao: 'Ver', url_botao: 'https://x',
    })
    assert.equal(itens.length, 1)
    assert.equal(itens[0].id, null)
    assert.equal(itens[0].data_cy, 'botao-antigo')
    assert.equal(itens[0].titulo, 'Título antigo')
    assert.equal(itens[0].texto_badge, 'Badge antigo')
  })

  test('destaques: [] (array vazio) -> mesmo fallback legado (não retorna vazio se houver data_cy legado)', () => {
    const itens = destaqueElementoResolverItens({ id: 'c3', modo_exibicao: 'destaque_elemento', data_cy: 'x', titulo: 'T', destaques: [] })
    assert.equal(itens.length, 1)
    assert.equal(itens[0].id, null)
  })

  // .length (não deepEqual contra um []) — o array devolvido é criado DENTRO
  // do contexto vm (outro realm); deepStrictEqual acusa "same structure but
  // not reference-equal" ao comparar com um literal do lado de fora, mesmo
  // quando ambos estão vazios.
  test('modo_exibicao diferente de destaque_elemento -> sempre []', () => {
    assert.equal(destaqueElementoResolverItens({ id: 'c4', modo_exibicao: 'modal_automatica', data_cy: 'x' }).length, 0)
  })

  test('destaque_elemento sem destaques[] e sem data_cy legado -> []', () => {
    assert.equal(destaqueElementoResolverItens({ id: 'c5', modo_exibicao: 'destaque_elemento' }).length, 0)
  })

  test('campanha null/undefined -> [], sem lançar erro', () => {
    assert.equal(destaqueElementoResolverItens(null).length, 0)
    assert.equal(destaqueElementoResolverItens(undefined).length, 0)
  })
})

describe('destaqueElementoMontarTodos — mount/interação independentes por item', () => {
  test('2 itens com data-cy no DOM -> 2 destaques montados', () => {
    presentes.add('filtro-status-multi')
    presentes.add('filtro-profissional-multi')
    const campanha: Campanha = {
      id: 'destaque-multi-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [
        { id: 'item-status', data_cy: 'filtro-status-multi', titulo: 'Status' },
        { id: 'item-prof', data_cy: 'filtro-profissional-multi', titulo: 'Profissional' },
      ],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-multi-1' }
    const antes = todasAsRaizesDestaque.length
    destaqueElementoMontarTodos(campanha, config)
    assert.equal(todasAsRaizesDestaque.length - antes, 2, '2 itens com alvo no DOM devem montar 2 instâncias independentes')
  })

  test('elemento ausente pra um item não bloqueia o outro — só o que existe é montado', () => {
    presentes.add('filtro-convenio-multi')
    // 'filtro-inexistente-multi' de propósito NUNCA adicionado a `presentes`.
    const campanha: Campanha = {
      id: 'destaque-multi-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [
        { id: 'item-ausente', data_cy: 'filtro-inexistente-multi', titulo: 'Ausente' },
        { id: 'item-convenio', data_cy: 'filtro-convenio-multi', titulo: 'Convênio' },
      ],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-multi-2' }
    const antes = todasAsRaizesDestaque.length
    assert.doesNotThrow(() => destaqueElementoMontarTodos(campanha, config))
    assert.equal(todasAsRaizesDestaque.length - antes, 1, 'só o item com alvo real no DOM deve montar')
  })

  test('interação no destaque A (fechar) marca só o item A como visto — B continua elegível', () => {
    presentes.add('filtro-a-multi')
    presentes.add('filtro-b-multi')
    const campanha: Campanha = {
      id: 'destaque-multi-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [
        { id: 'item-a', data_cy: 'filtro-a-multi', titulo: 'A' },
        { id: 'item-b', data_cy: 'filtro-b-multi', titulo: 'B' },
      ],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-multi-3' }
    destaqueElementoMontarTodos(campanha, config)

    const listenerA = destaqueElementoGetTestClickListener(0)
    assert.notEqual(listenerA, null)
    listenerA!({ target: elementoClique('data-up-destaque-close') })

    assert.equal(wasShown(campanha, config, 'item-a'), true, 'fechar o destaque A deve marcar A como visto')
    assert.equal(wasShown(campanha, config, 'item-b'), false, 'interagir com A nunca pode marcar/esconder B')
  })

  test('legado (campanha sem destaques[]) continua funcionando: monta o pseudo-item e respeita Até interagir com a MESMA chave de antes', () => {
    presentes.add('botao-legado-multi')
    const campanha: Campanha = {
      id: 'destaque-multi-legado', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      data_cy: 'botao-legado-multi', titulo: 'Legado', descricao: 'Descrição legada',
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-multi-legado' }
    const antes = todasAsRaizesDestaque.length
    destaqueElementoMontarTodos(campanha, config)
    assert.equal(todasAsRaizesDestaque.length - antes, 1)

    const listener = destaqueElementoGetTestClickListener(0)
    listener!({ target: elementoClique('data-up-destaque-close') })

    // Chave SEM item_id (undefined) — mesma que já existia antes de existir
    // `destaques[]`, preservando dispensas anteriores.
    assert.equal(wasShown(campanha, config), true)

    // Remontar depois de já ter sido dispensado não deve montar de novo.
    const antesDeNovo = todasAsRaizesDestaque.length
    destaqueElementoMontarTodos(campanha, config)
    assert.equal(todasAsRaizesDestaque.length - antesDeNovo, 0, 'item já dispensado não deve remontar')
  })

  test('nenhum item elegível (data-cy inexistente, sem destaques[] e sem data_cy legado) -> não monta nada, sem lançar erro', () => {
    const campanha: Campanha = { id: 'destaque-multi-vazio', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-multi-vazio' }
    const antes = todasAsRaizesDestaque.length
    assert.doesNotThrow(() => destaqueElementoMontarTodos(campanha, config))
    assert.equal(todasAsRaizesDestaque.length - antes, 0)
  })
})

// Fase 3 — tracking por item (destaque_item_id em EventoCampanha). Cobre só
// o que acontece no WIDGET: quais eventos disparam, com qual payload, e que
// uma falha de rede/exceção síncrona no rastreamento nunca impede o resto do
// clique (markShown/CTA/toggle) de rodar. Ownership/isolamento de tenant do
// destaque_item_id são validados do lado do servidor — ver
// server/src/controllers/widget.test.ts (validarDestaqueItemEvento).
describe('registrarEvento (destaque_elemento) — visualizacao/interacao_badge/clique_cta/dispensa por item', () => {
  test('renderizou -> visualizacao, com destaque_item_id do item montado', () => {
    presentes.add('filtro-track-view');
    const campanha: Campanha = {
      id: 'destaque-track-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-view', data_cy: 'filtro-track-view', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-1' };
    const antes = chamadasRastreamento.length;
    destaqueElementoMontarTodos(campanha, config);
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1, 'mount deve gerar exatamente 1 chamada de rastreamento (visualizacao)');
    assert.equal(novas[0].url, 'http://localhost/api/widget/evento');
    assert.equal(novas[0].body.tipo_evento, 'visualizacao');
    assert.equal(novas[0].body.campanha_id, 'destaque-track-1');
    assert.equal(novas[0].body.destaque_item_id, 'item-track-view');
  });

  test('clicou no badge (abrir) -> interacao_badge com o destaque_item_id certo', () => {
    presentes.add('filtro-track-badge');
    const campanha: Campanha = {
      id: 'destaque-track-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-badge', data_cy: 'filtro-track-badge', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-2' };
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    const antes = chamadasRastreamento.length;
    listener!({ target: elementoClique('data-up-destaque-toggle') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.tipo_evento, 'interacao_badge');
    assert.equal(novas[0].body.destaque_item_id, 'item-track-badge');
  });

  test('clicou no CTA -> clique_cta com o destaque_item_id certo', () => {
    presentes.add('filtro-track-cta');
    const campanha: Campanha = {
      id: 'destaque-track-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-cta', data_cy: 'filtro-track-cta', titulo: 'T', texto_botao: 'Ver', url_botao: 'https://x.com' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-3' };
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    const antes = chamadasRastreamento.length;
    listener!({ target: elementoClique('data-up-destaque-cta', { 'data-up-url': 'https://x.com' }) });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.tipo_evento, 'clique_cta');
    assert.equal(novas[0].body.destaque_item_id, 'item-track-cta');
  });

  test('fechou (dispensou) -> dispensa com o destaque_item_id certo, e markShown continua funcionando junto', () => {
    presentes.add('filtro-track-close');
    const campanha: Campanha = {
      id: 'destaque-track-4', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-close', data_cy: 'filtro-track-close', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-4' };
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    const antes = chamadasRastreamento.length;
    listener!({ target: elementoClique('data-up-destaque-close') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.tipo_evento, 'dispensa');
    assert.equal(novas[0].body.destaque_item_id, 'item-track-close');
    // "Até interagir" não pode ser afetado por rastreamento ter sido
    // adicionado — o item continua marcado como visto normalmente.
    assert.equal(wasShown(campanha, config, 'item-track-close'), true);
  });

  test('campanha legada (sem destaques[], pseudo-item id:null) -> visualizacao SEM destaque_item_id (chave ausente, nunca null solto)', () => {
    presentes.add('filtro-track-legado');
    const campanha: Campanha = {
      id: 'destaque-track-legado', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      data_cy: 'filtro-track-legado', titulo: 'Legado', descricao: 'D',
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-legado' };
    const antes = chamadasRastreamento.length;
    destaqueElementoMontarTodos(campanha, config);
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.tipo_evento, 'visualizacao');
    assert.equal('destaque_item_id' in novas[0].body, false, 'destaque_item_id nunca deve ir como null solto — ausente do payload quando o item não tem id');
  });

  test('falha de rastreamento (fetch lança síncrono) nunca impede o resto do clique de rodar — markShown continua funcionando', () => {
    presentes.add('filtro-track-falha-sync');
    const campanha: Campanha = {
      id: 'destaque-track-falha-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-falha-sync', data_cy: 'filtro-track-falha-sync', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-falha-1' };
    const fetchOriginal = sandboxCompartilhado.fetch;
    sandboxCompartilhado.fetch = () => { throw new Error('falha de rede simulada'); };
    try {
      assert.doesNotThrow(() => destaqueElementoMontarTodos(campanha, config), 'mount não pode lançar mesmo com fetch quebrado');
      const listener = destaqueElementoGetTestClickListener(0);
      assert.doesNotThrow(() => listener!({ target: elementoClique('data-up-destaque-close') }), 'clique de fechar não pode lançar mesmo com fetch quebrado');
      assert.equal(wasShown(campanha, config, 'item-track-falha-sync'), true, 'markShown deve continuar funcionando mesmo com o rastreamento quebrado');
    } finally {
      sandboxCompartilhado.fetch = fetchOriginal;
    }
  });

  test('falha de rastreamento (fetch rejeita a Promise) nunca impede o resto do clique de rodar — CTA continua abrindo', () => {
    presentes.add('filtro-track-falha-async');
    const campanha: Campanha = {
      id: 'destaque-track-falha-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-track-falha-async', data_cy: 'filtro-track-falha-async', titulo: 'T', texto_botao: 'Ver', url_botao: 'https://x.com' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-track-falha-2' };
    const fetchOriginal = sandboxCompartilhado.fetch;
    let urlAberta: string | null = null;
    sandboxCompartilhado.fetch = () => Promise.reject(new Error('falha de rede simulada'));
    const openOriginal = sandboxCompartilhado.window.open;
    sandboxCompartilhado.window.open = (url: string) => { urlAberta = url; };
    try {
      destaqueElementoMontarTodos(campanha, config);
      const listener = destaqueElementoGetTestClickListener(0);
      assert.doesNotThrow(() => listener!({ target: elementoClique('data-up-destaque-cta', { 'data-up-url': 'https://x.com' }) }));
      assert.equal(urlAberta, 'https://x.com', 'CTA deve abrir a URL normalmente mesmo com o rastreamento falhando');
      assert.equal(wasShown(campanha, config, 'item-track-falha-async'), true);
    } finally {
      sandboxCompartilhado.fetch = fetchOriginal;
      sandboxCompartilhado.window.open = openOriginal;
    }
  });
})

// Avaliação de utilidade do destaque ("Essa melhoria foi útil?" Sim/Não +
// comentário opcional) — cobre só o que acontece no WIDGET: payload
// enviado, independência entre itens, e que falha de rede nunca quebra o
// resto da interação. Ownership/isolamento de tenant do destaque_item_id
// são validados do lado do servidor por validarAvaliacaoFeedback — ver
// server/src/controllers/widget.test.ts (mesma função usada por
// registrarUtilidadeDestaque). "Uma resposta atual" (upsert por
// campanha_id+destaque_item_id+usuario_id+tipo_avaliacao) é garantida pelo
// índice único no banco (ver schema.prisma) — o widget só é responsável por
// reenviar a escolha atual a cada clique, nunca por deduplicar localmente.
describe('avaliação de utilidade do destaque (utilidade_destaque)', () => {
  function abrirTooltip(campanha: Campanha, config: ConfigWidget) {
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    listener!({ target: elementoClique('data-up-destaque-toggle') });
    return listener!;
  }

  test('Sim -> POST utilidade-destaque com util:true, campanha/item/usuário corretos, sem observacao', () => {
    presentes.add('filtro-util-sim');
    const campanha: Campanha = {
      id: 'destaque-util-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-sim', data_cy: 'filtro-util-sim', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-1', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-sim') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].url, 'http://localhost/api/widget/feedback/utilidade-destaque');
    assert.equal(novas[0].body.campanha_id, 'destaque-util-1');
    assert.equal(novas[0].body.destaque_item_id, 'item-util-sim');
    assert.equal(novas[0].body.usuario_id, 'user-1');
    assert.equal(novas[0].body.util, true);
    assert.equal('observacao' in novas[0].body, false, 'sem comentário ainda, observacao não deve ir no payload');
  });

  test('Não -> POST utilidade-destaque com util:false', () => {
    presentes.add('filtro-util-nao');
    const campanha: Campanha = {
      id: 'destaque-util-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-nao', data_cy: 'filtro-util-nao', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-2', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-nao') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.util, false);
  });

  test('comentário opcional -> digitar e clicar Enviar envia observacao no mesmo item/campanha/usuário, com a escolha atual', () => {
    presentes.add('filtro-util-comentario');
    const campanha: Campanha = {
      id: 'destaque-util-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-comentario', data_cy: 'filtro-util-comentario', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-3', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-sim') });

    const inputListener = destaqueElementoGetTestInputListener(0);
    inputListener!({ target: elementoInput('data-up-util-comentario', 'Adorei a novidade!') });
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.comentario, 'Adorei a novidade!')

    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-enviar-comentario') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.destaque_item_id, 'item-util-comentario');
    assert.equal(novas[0].body.usuario_id, 'user-1');
    assert.equal(novas[0].body.util, true, 'reenvia a escolha atual (Sim) junto com o comentário');
    assert.equal(novas[0].body.observacao, 'Adorei a novidade!');
  });

  test('não deixa enviar comentário antes de escolher Sim/Não (nenhuma requisição extra)', () => {
    presentes.add('filtro-util-sem-escolha');
    const campanha: Campanha = {
      id: 'destaque-util-sem-escolha', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-sem-escolha', data_cy: 'filtro-util-sem-escolha', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-sem-escolha', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-enviar-comentario') });
    assert.equal(chamadasRastreamento.length, antes, 'sem escolha de Sim/Não ainda, clicar Enviar não deve disparar nada')
  });

  test('alteração Sim -> Não envia um segundo POST com util:false (o widget sempre reenvia a escolha atual — "1 resposta" é garantido pelo índice único do banco, ver schema.prisma)', () => {
    presentes.add('filtro-util-troca-1');
    const campanha: Campanha = {
      id: 'destaque-util-troca-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-troca-1', data_cy: 'filtro-util-troca-1', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-troca-1', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-sim') });
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, true);

    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-nao') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.util, false);
    assert.equal(novas[0].body.destaque_item_id, 'item-util-troca-1');
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, false, 'estado local reflete a última escolha');
  });

  test('alteração Não -> Sim envia um segundo POST com util:true', () => {
    presentes.add('filtro-util-troca-2');
    const campanha: Campanha = {
      id: 'destaque-util-troca-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-troca-2', data_cy: 'filtro-util-troca-2', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-troca-2', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-nao') });

    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-sim') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.util, true);
  });

  test('itens A/B independentes: escolher no item A nunca envia nada pro item B, nem afeta o estado local de B', () => {
    presentes.add('filtro-util-a');
    presentes.add('filtro-util-b');
    const campanha: Campanha = {
      id: 'destaque-util-ab', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [
        { id: 'item-util-a', data_cy: 'filtro-util-a', titulo: 'A' },
        { id: 'item-util-b', data_cy: 'filtro-util-b', titulo: 'B' },
      ],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-ab', usuario_id: 'user-1' };
    destaqueElementoMontarTodos(campanha, config);
    const listenerA = destaqueElementoGetTestClickListener(0);
    const listenerB = destaqueElementoGetTestClickListener(1);
    listenerA!({ target: elementoClique('data-up-destaque-toggle') });
    listenerB!({ target: elementoClique('data-up-destaque-toggle') });

    const antes = chamadasRastreamento.length;
    listenerA!({ target: elementoClique('data-up-util-sim') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1, 'só o item A deve gerar requisição');
    assert.equal(novas[0].body.destaque_item_id, 'item-util-a');
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, true);
    assert.equal(destaqueElementoGetTestUtilidadeState(1)!.escolha, null, 'item B nunca é afetado pela escolha do item A');
  });

  test('usuário diferente -> mesmo item, cada instância manda o próprio usuario_id (dedupe por usuário é responsabilidade do índice único no banco)', () => {
    presentes.add('filtro-util-user-1');
    presentes.add('filtro-util-user-2');
    const campanhaBase = {
      modo_exibicao: 'destaque_elemento' as const, mostrar_uma_vez: true, permitir_fechar_modal: true,
    };
    const item1 = { id: 'item-util-mesmo', data_cy: 'filtro-util-user-1', titulo: 'T' };
    destaqueElementoMontarTodos({ ...campanhaBase, id: 'destaque-util-user-a', destaques: [item1] }, { sistema: 'sis', tela: 'tela-util-user-a', usuario_id: 'usuario-a' });
    const listenerUsuarioA = destaqueElementoGetTestClickListener(0);
    listenerUsuarioA!({ target: elementoClique('data-up-destaque-toggle') });
    const antesA = chamadasRastreamento.length;
    listenerUsuarioA!({ target: elementoClique('data-up-util-sim') });
    assert.equal(chamadasRastreamento[antesA].body.usuario_id, 'usuario-a');

    const item2 = { id: 'item-util-mesmo-2', data_cy: 'filtro-util-user-2', titulo: 'T' };
    destaqueElementoMontarTodos({ ...campanhaBase, id: 'destaque-util-user-b', destaques: [item2] }, { sistema: 'sis', tela: 'tela-util-user-b', usuario_id: 'usuario-b' });
    const listenerUsuarioB = destaqueElementoGetTestClickListener(0);
    listenerUsuarioB!({ target: elementoClique('data-up-destaque-toggle') });
    const antesB = chamadasRastreamento.length;
    listenerUsuarioB!({ target: elementoClique('data-up-util-sim') });
    assert.equal(chamadasRastreamento[antesB].body.usuario_id, 'usuario-b');
  });

  test('pseudo-item legado (sem destaques[], id:null) nunca gera avaliação de utilidade — clicar Sim/Não não existe pra este item', () => {
    presentes.add('filtro-util-legado');
    const campanha: Campanha = {
      id: 'destaque-util-legado', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      data_cy: 'filtro-util-legado', titulo: 'Legado', descricao: 'D',
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-legado', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    const antes = chamadasRastreamento.length;
    // Sem item.id, a seção nunca é renderizada — mas mesmo que o listener
    // seja acionado diretamente (harness não valida presença real no DOM),
    // enviarUtilidadeDestaque recusa por falta de item.id.
    listener({ target: elementoClique('data-up-util-sim') });
    assert.equal(chamadasRastreamento.length, antes, 'pseudo-item legado (id:null) nunca deve gerar POST de utilidade')
  });

  test('sem usuario_id no config -> escolha local continua otimista, mas nenhuma requisição é enviada (mesma exigência de registrarFeedback)', () => {
    presentes.add('filtro-util-sem-usuario');
    const campanha: Campanha = {
      id: 'destaque-util-sem-usuario', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-sem-usuario', data_cy: 'filtro-util-sem-usuario', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-sem-usuario' };
    const listener = abrirTooltip(campanha, config);
    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-sim') });
    assert.equal(chamadasRastreamento.length, antes, 'sem usuario_id, não deve chamar o backend')
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, true, 'a escolha local continua otimista mesmo sem poder persistir')
  });

  test('falha de rede síncrona (fetch lança) no clique Sim/Não nunca quebra o widget — clique seguinte (trocar pra Não) continua funcionando', () => {
    presentes.add('filtro-util-falha-sync');
    const campanha: Campanha = {
      id: 'destaque-util-falha-sync', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-falha-sync', data_cy: 'filtro-util-falha-sync', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-falha-sync', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    const fetchOriginal = sandboxCompartilhado.fetch;
    sandboxCompartilhado.fetch = () => { throw new Error('falha de rede simulada'); };
    try {
      assert.doesNotThrow(() => listener({ target: elementoClique('data-up-util-sim') }), 'clicar Sim não pode lançar mesmo com fetch quebrado');
      assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, true, 'escolha local se aplica mesmo com o envio falhando');
    } finally {
      sandboxCompartilhado.fetch = fetchOriginal;
    }
    // Widget continua utilizável depois da falha — trocar a escolha funciona.
    assert.doesNotThrow(() => listener({ target: elementoClique('data-up-util-nao') }));
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.escolha, false);
  });

  test('falha de rede (fetch rejeita) no envio do comentário mostra erro recuperável — enviando volta a false, permite tentar de novo, e o tooltip continua aberto', async () => {
    presentes.add('filtro-util-falha-comentario');
    const campanha: Campanha = {
      id: 'destaque-util-falha-comentario', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-falha-comentario', data_cy: 'filtro-util-falha-comentario', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-falha-comentario', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-sim') });

    const fetchOriginal = sandboxCompartilhado.fetch;
    sandboxCompartilhado.fetch = () => Promise.reject(new Error('falha de rede simulada'));
    try {
      assert.doesNotThrow(() => listener({ target: elementoClique('data-up-util-enviar-comentario') }));
      // Deixa a microtask da Promise rejeitada resolver antes de checar o estado.
      await new Promise(resolve => setTimeout(resolve, 0));
      const estado = destaqueElementoGetTestUtilidadeState(0)!;
      assert.equal(estado.enviando, false, 'enviando deve voltar a false depois da falha, permitindo tentar de novo');
      assert.notEqual(estado.erro, null, 'erro deve ficar visível pro usuário tentar de novo');
      assert.equal(destaqueElementoGetTestAberto(0), true, 'em erro, o tooltip permanece aberto (nunca fecha sozinho)');
      // Nenhum fechamento automático foi agendado — disparar a fila de
      // timers não deve fechar nada, já que erro não agenda nada.
      dispararTimersPendentesDestaque();
      assert.equal(destaqueElementoGetTestAberto(0), true, 'continua aberto mesmo depois de "passar o tempo"');
      // Erro no comentário nunca agenda nenhum fechamento automático — a
      // instância inteira (badge incluso) continua montada pra tentar de novo.
      assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a instância continua montada pra permitir retry');
    } finally {
      sandboxCompartilhado.fetch = fetchOriginal;
    }
  });

  test('Sim salvo com sucesso marca o item como consumido (markShown) — isolado do "até interagir" do próprio toggle, que já marca ao abrir o tooltip', async () => {
    presentes.add('filtro-util-consome');
    const campanha: Campanha = {
      id: 'destaque-util-consome', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-consome', data_cy: 'filtro-util-consome', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-consome', usuario_id: 'user-1' };
    // Não usa abrirTooltip aqui de propósito: clicar no toggle pra abrir o
    // tooltip JÁ chama markShown (interação explícita "até interagir", ver
    // o listener de clique) — usar abrirTooltip tornaria este teste incapaz
    // de provar que o SUCESSO do Sim/Não, por si só, também consome o item.
    // O listener não valida instancia.aberto antes de aceitar Sim/Não, então
    // dá pra clicar direto sem passar pelo toggle.
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    assert.notEqual(listener, null);
    assert.equal(wasShown(campanha, config, 'item-util-consome'), false, 'antes de qualquer interação, o item ainda não deve estar marcado como visto');

    listener!({ target: elementoClique('data-up-util-sim') });
    // markShown só roda depois da Promise do fetch resolver (microtask).
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(wasShown(campanha, config, 'item-util-consome'), true, 'Sim salvo com sucesso deve consumir o item usando a infra existente de markShown');
    // A instância ATUAL continua montada — markShown só afeta futuras
    // exibições (ver teste de "reload" abaixo), nunca fecha nada sozinho; o
    // comentário opcional continua disponível.
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a instância continua montada depois do markShown');
  });

  test('reload (nova chamada de destaqueElementoMontarTodos) depois de Sim/Não já salvo não exibe mais o destaque', async () => {
    presentes.add('filtro-util-reload');
    const campanha: Campanha = {
      id: 'destaque-util-reload', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-reload', data_cy: 'filtro-util-reload', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-reload', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-nao') });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(wasShown(campanha, config, 'item-util-reload'), true);

    // Simula um reload da página: destaqueElementoMontarTodos é exatamente o
    // que o runtime chama de novo do zero (desmonta tudo e reavalia
    // elegibilidade via wasShown) — nenhum estado de instância sobrevive a um
    // reload de verdade, só o localStorage (onde markShown persistiu).
    destaqueElementoMontarTodos(campanha, config);
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'depois do reload, o item já consumido não deve ser remontado');
  });

  test('sucesso no envio do comentário: mostra "Obrigado" brevemente e só desmonta a instância inteira (badge incluso) depois do tempo passar — nunca dispensa', async () => {
    presentes.add('filtro-util-fecha-sucesso');
    const campanha: Campanha = {
      id: 'destaque-util-fecha-sucesso', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-fecha-sucesso', data_cy: 'filtro-util-fecha-sucesso', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-fecha-sucesso', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-sim') });
    await new Promise(resolve => setTimeout(resolve, 0));

    const antesDispensa = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-util-enviar-comentario') });
    // Antes da Promise resolver, nada mudou ainda.
    await new Promise(resolve => setTimeout(resolve, 0));

    // Passo 1: sucesso mostra "Obrigado" e a instância CONTINUA montada — o
    // encerramento é automático, mas não instantâneo.
    assert.equal(destaqueElementoGetTestAberto(0), true, 'logo após o sucesso, o tooltip ainda deve estar aberto (mostra "Obrigado" brevemente)')
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.comentarioEnviado, true)
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.erro, null)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'ainda não desmontou — só passou o "Obrigado", o timer não disparou ainda')

    // Nenhuma chamada de dispensa foi disparada em momento algum deste fluxo
    // — encerramento automático por sucesso é uma ação diferente de fechar
    // explicitamente pelo X.
    const chamadasAteAqui = chamadasRastreamento.slice(antesDispensa);
    assert.equal(chamadasAteAqui.some(c => c.body.tipo_evento === 'dispensa'), false, 'sucesso nunca deve registrar o evento dispensa')

    // Passo 2: só depois do timer (tempo) passar, a instância inteira some.
    dispararTimersPendentesDestaque();
    assert.equal(destaqueElementoGetTestAberto(0), null, 'depois do tempo passar, a instância (e com ela o tooltip) não existe mais')
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'a instância inteira foi desmontada — badge incluso, não só o tooltip')

    // Desmontar automaticamente NUNCA é dispensa, mesmo depois de desmontar
    // de verdade.
    const chamadasFinal = chamadasRastreamento.slice(antesDispensa);
    assert.equal(chamadasFinal.some(c => c.body.tipo_evento === 'dispensa'), false, 'encerramento automático continua nunca sendo dispensa')

    // O item já tinha sido consumido no sucesso do Sim (markShown) — um
    // reload depois desse fluxo completo também não deve remontar nada.
    destaqueElementoMontarTodos(campanha, config);
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'depois do fluxo completo + reload, o item consumido não volta a aparecer');
  });

  test('duplo clique em "Enviar" durante o loading não gera envio duplicado', async () => {
    presentes.add('filtro-util-duplo-clique');
    const campanha: Campanha = {
      id: 'destaque-util-duplo-clique', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-duplo-clique', data_cy: 'filtro-util-duplo-clique', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-duplo-clique', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    listener({ target: elementoClique('data-up-util-sim') });

    const antes = chamadasRastreamento.length;
    // 2 cliques em sequência, ANTES da Promise do 1º envio resolver —
    // `enviando` já foi setado true de forma síncrona no 1º clique, então o
    // 2º clique deve ser ignorado pelo guard no listener.
    listener({ target: elementoClique('data-up-util-enviar-comentario') });
    listener({ target: elementoClique('data-up-util-enviar-comentario') });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1, 'só o 1º clique deve gerar requisição — o 2º é ignorado enquanto enviando=true');

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(destaqueElementoGetTestUtilidadeState(0)!.enviando, false, 'depois de resolver, enviando volta a false')
  });

  test('clique no elemento alvo original nunca conta como interação/consumo do destaque — o listener é anexado só ao root (badge/tooltip), nunca ao alvo', () => {
    presentes.add('filtro-util-alvo-original');
    const campanha: Campanha = {
      id: 'destaque-util-alvo-original', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-alvo-original', data_cy: 'filtro-util-alvo-original', titulo: 'T' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-alvo-original', usuario_id: 'user-1' };
    destaqueElementoMontarTodos(campanha, config);
    const listener = destaqueElementoGetTestClickListener(0);
    assert.notEqual(listener, null);

    const antes = chamadasRastreamento.length;
    // Simula um clique cujo target não é nenhum elemento interativo do
    // destaque (badge/CTA/close/util) — é exatamente o que aconteceria se,
    // por algum motivo, um clique no alvo alcançasse este listener: nenhuma
    // das branches (closeEl/toggleEl/ctaEl/utilSimEl/...) reconhece o alvo,
    // então nada acontece. Na prática isso nem chega a ser possível: o
    // listener é anexado só ao ROOT do destaque (ver destaqueElementoMontarItem),
    // nunca ao elemento alvo em si.
    listener!({ target: { closest: () => null } });
    assert.equal(chamadasRastreamento.length, antes, 'clicar no alvo original nunca deve gerar nenhuma requisição de tracking/utilidade');
    assert.equal(wasShown(campanha, config, 'item-util-alvo-original'), false, 'clicar no alvo original nunca deve consumir (markShown) o destaque');
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a instância continua montada — clicar no alvo original nunca desmonta nada');
  });

  test('badge/CTA/dispensa/tracking/"até interagir" continuam com o comportamento de sempre quando a campanha também tem avaliação de utilidade', () => {
    presentes.add('filtro-util-nao-interfere');
    const campanha: Campanha = {
      id: 'destaque-util-nao-interfere', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-util-nao-interfere', data_cy: 'filtro-util-nao-interfere', titulo: 'T', texto_botao: 'Ver', url_botao: 'https://x.com' }],
    };
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-util-nao-interfere', usuario_id: 'user-1' };
    const listener = abrirTooltip(campanha, config);
    // CTA continua abrindo normalmente e sendo rastreado, mesmo com a seção
    // de utilidade presente no mesmo tooltip.
    const antes = chamadasRastreamento.length;
    listener({ target: elementoClique('data-up-destaque-cta', { 'data-up-url': 'https://x.com' }) });
    const novas = chamadasRastreamento.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(novas[0].body.tipo_evento, 'clique_cta');
    assert.equal(wasShown(campanha, config, 'item-util-nao-interfere'), true, '"até interagir" continua marcando o item como visto no clique do CTA, de sempre');
  });
})

// Visibilidade real do alvo (destaque_elemento) — cobre o caso de clicar no
// alvo abrir uma drawer/modal/overlay por cima dele: o elemento continua no
// DOM (document.body.contains continua true), mas deixa de estar
// REALMENTE visível. destaqueElementoAlvoRealmenteVisivel/
// destaqueElementoPontoRepresentativo são funções puras (sem tocar em
// DOM/rede) — testadas primeiro isoladas com objetos sintéticos (o alvo
// fake do harness compartilhado, criado por document.querySelector no
// before() acima, não tem .contains(), então o caso "elementFromPoint
// retorna um DESCENDENTE do alvo" só é testável com um objeto próprio que
// implementa .contains()).
describe('destaqueElementoAlvoRealmenteVisivel / destaqueElementoPontoRepresentativo (funções puras)', () => {
  test('destaqueElementoPontoRepresentativo é o centro do retângulo do alvo', () => {
    // Objeto criado DENTRO do vm (protótipo diferente do Object deste
    // arquivo) — assert.deepEqual/deepStrictEqual exigiria mesmo protótipo,
    // por isso compara os campos individualmente.
    const ponto = destaqueElementoPontoRepresentativo(retangulo(100, 200, 40, 20))
    assert.equal(ponto.x, 220)
    assert.equal(ponto.y, 110)
  })

  test('elementFromPoint ausente (undefined) -> navegador sem suporte, alvo sempre considerado visível (preserva o comportamento de sempre)', () => {
    assert.equal(destaqueElementoAlvoRealmenteVisivel({}, retangulo(0, 0, 100, 40), undefined), true)
  })

  test('dimensões inválidas (largura ou altura <= 0) -> nunca visível, mesmo sem checar oclusão', () => {
    assert.equal(destaqueElementoAlvoRealmenteVisivel({}, retangulo(0, 0, 0, 40), undefined), false)
    assert.equal(destaqueElementoAlvoRealmenteVisivel({}, retangulo(0, 0, 100, 0), undefined), false)
  })

  test('elementFromPoint retorna null (ponto fora da viewport) -> não visível', () => {
    assert.equal(destaqueElementoAlvoRealmenteVisivel({}, retangulo(0, 0, 100, 40), null), false)
  })

  test('elementFromPoint retorna o próprio alvo -> nada por cima, visível', () => {
    const alvo = { tagName: 'BUTTON' }
    assert.equal(destaqueElementoAlvoRealmenteVisivel(alvo, retangulo(0, 0, 100, 40), alvo), true)
  })

  test('elementFromPoint retorna um DESCENDENTE do alvo (ex.: o texto/ícone dentro do botão) -> ainda é o próprio alvo, visível', () => {
    const descendente = { tagName: 'SPAN' }
    const alvo = { tagName: 'BUTTON', contains: (node: unknown) => node === descendente }
    assert.equal(destaqueElementoAlvoRealmenteVisivel(alvo, retangulo(0, 0, 100, 40), descendente), true)
  })

  test('elementFromPoint retorna um elemento QUALQUER, não relacionado ao alvo (overlay/drawer/modal) -> encoberto, não visível', () => {
    const overlay = { tagName: 'DIV', className: 'up-drawer-overlay' }
    const alvo = { tagName: 'BUTTON', contains: () => false }
    assert.equal(destaqueElementoAlvoRealmenteVisivel(alvo, retangulo(0, 0, 100, 40), overlay), false)
  })
})

// Integração com o mecanismo de reposicionamento/MutationObserver já
// existente (destaqueElementoReposicionar/destaqueElementoAgendarReacao) —
// nenhum observer/listener/polling novo é criado; a MESMA notificação de
// mutation que já reposiciona o badge é o que também reavalia se o alvo
// continua realmente visível. document.elementFromPoint é setado só
// pontualmente em cada teste (ausente por padrão no harness compartilhado,
// ver before() acima) e sempre restaurado no finally, pro resto da suíte
// continuar cobrindo o caso "navegador sem suporte" sem interferência.
describe('destaqueElementoReposicionar oculta/restaura o destaque quando o alvo é encoberto por overlay (integrado ao MutationObserver existente)', () => {
  test('clique abre/fecha imediatamente: filhos recriados são excluídos do hit-test sem mutation externa nem ciclo de ocultação', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(220, 460, 180, 48) }
    const campanha: Campanha = { id: 'destaque-abertura-imediata', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-abertura-imediata' }
    destaqueElementoMontar(campanha, config, alvo)
    const root = ultimoRootDestaque!
    const containsOriginal = root.contains.bind(root)
    let filhoVistoNoHitTest: unknown = null
    let geracaoAnterior = 0
    let mutationsExternas = 0
    const observer = ultimoMutationObserverDestaque!
    const cbOriginal = observer.cb
    observer.cb = (records) => { mutationsExternas++; cbOriginal(records) }

    // Reproduz o estado intermediário observado no ambiente real: sem tirar
    // a root da medição, a pilha pode devolver o tooltip recém-recriado antes
    // de contains reconhecê-lo como filho atual. Com pointer-events:none a
    // própria instância não participa da pilha e o alvo fica no topo.
    root.contains = (node: unknown) => node === filhoVistoNoHitTest ? false : containsOriginal(node)
    sandboxCompartilhado!.document.elementsFromPoint = () => {
      if (root.style.pointerEvents === 'none') return [alvo]
      filhoVistoNoHitTest = root.querySelector!('.up-destaque-tooltip')
      return filhoVistoNoHitTest ? [filhoVistoNoHitTest, alvo] : [alvo]
    }
    const listener = destaqueElementoGetTestClickListener(0)!
    const antesTracking = chamadasRastreamento.length
    try {
      for (let i = 0; i < 4; i++) {
        listener({ target: elementoClique('data-up-destaque-toggle') })
        const aberto = i % 2 === 0
        assert.equal(destaqueElementoGetTestAberto(0), aberto, 'o estado abre/fecha no próprio clique')
        assert.equal(destaqueElementoGetTestOculto(0), false, 'toggle nunca alterna oculto')
        assert.notEqual(root.style.display, 'none', 'a root nunca some durante o toggle')
        const filhoAtual = aberto ? root.querySelector!('.up-destaque-tooltip') as { geracao: number } : root.querySelector!('.up-destaque-badge') as { geracao: number }
        assert.ok(filhoAtual.geracao > geracaoAnterior, 'innerHTML recriou os filhos e a nova geração continuou ignorada')
        geracaoAnterior = filhoAtual.geracao
      }
    } finally {
      root.contains = containsOriginal
      observer.cb = cbOriginal
      delete sandboxCompartilhado!.document.elementsFromPoint
    }
    assert.equal(mutationsExternas, 0, 'nenhuma mutation externa foi necessária para o tooltip aparecer')
    const novosEventos = chamadasRastreamento.slice(antesTracking)
    assert.equal(novosEventos.length, 4, 'cada clique registra somente sua interação prevista')
    assert.ok(novosEventos.every(evento => evento.body.tipo_evento === 'interacao_badge'))
  })

  test('geometrias diferentes abrem imediatamente com a mesma regra de hit-test', () => {
    const geometrias = [retangulo(12, 16, 72, 28), retangulo(640, 980, 260, 64)]
    for (let i = 0; i < geometrias.length; i++) {
      const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => geometrias[i] }
      const campanha: Campanha = { id: 'destaque-layout-' + i, modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
      const config: ConfigWidget = { sistema: 'sis', tela: 'tela-layout-' + i }
      destaqueElementoMontar(campanha, config, alvo)
      const root = ultimoRootDestaque!
      sandboxCompartilhado!.document.elementsFromPoint = () => root.style.pointerEvents === 'none'
        ? [alvo]
        : [root.querySelector!('.up-destaque-tooltip'), alvo]
      try {
        destaqueElementoGetTestClickListener(0)!({ target: elementoClique('data-up-destaque-toggle') })
      } finally {
        delete sandboxCompartilhado!.document.elementsFromPoint
      }
      assert.equal(destaqueElementoGetTestAberto(0), true)
      assert.equal(destaqueElementoGetTestOculto(0), false)
      assert.notEqual(root.style.display, 'none')
    }
  })

  test('elementsFromPoint testa centro e quatro cantos: drawer cobrindo todos oculta o root inteiro e não consome', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-hit-stack-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-hit-stack-1' }
    destaqueElementoMontar(campanha, config, alvo)
    let pontosTestados = 0
    const antes = chamadasRastreamento.length
    sandboxCompartilhado!.document.elementsFromPoint = () => { pontosTestados++; return [{ tagName: 'DIV', className: 'drawer' }, alvo] }
    try {
      ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    } finally {
      delete sandboxCompartilhado!.document.elementsFromPoint
    }
    assert.equal(pontosTestados, 5)
    assert.equal(destaqueElementoGetTestOculto(0), true)
    assert.equal(ultimoRootDestaque!.style.display, 'none')
    assert.equal(wasShown(campanha, config), false)
    assert.equal(chamadasRastreamento.length, antes)
  })

  test('elementsFromPoint ignora o próprio root UserPulse; uma área útil descoberta restaura e reposiciona', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-hit-stack-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-hit-stack-2' }
    destaqueElementoMontar(campanha, config, alvo)
    const drawer = { tagName: 'DIV' }
    sandboxCompartilhado!.document.elementsFromPoint = () => [drawer, alvo]
    ultimoMutationObserverDestaque!.cb([{ target: drawer }])
    assert.equal(destaqueElementoGetTestOculto(0), true)

    let chamada = 0
    sandboxCompartilhado!.document.elementsFromPoint = () => {
      chamada++
      return chamada < 3 ? [drawer, alvo] : [ultimoRootDestaque, alvo]
    }
    try {
      ultimoMutationObserverDestaque!.cb([{ target: drawer }])
    } finally {
      delete sandboxCompartilhado!.document.elementsFromPoint
    }
    assert.equal(destaqueElementoGetTestOculto(0), false)
    assert.equal(ultimoRootDestaque!.style.display, '')
    assert.equal(ultimoRootDestaque!.style.top, '102px')
    assert.equal(wasShown(campanha, config), false)
  })

  test('alvo encoberto por overlay (drawer/modal) oculta badge+tooltip via display:none — sem desmontar, sem markShown, sem dispensa', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-visibilidade-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-visibilidade-1' }
    destaqueElementoMontar(campanha, config, alvo)
    assert.equal(destaqueElementoGetTestOculto(0), false, 'recém-montado, sem overlay, deve começar visível')

    const antes = chamadasRastreamento.length
    const overlay = { tagName: 'DIV' }
    sandboxCompartilhado!.document.elementFromPoint = () => overlay
    try {
      // Abrir a drawer/modal insere/altera algo em algum lugar da página —
      // uma mutation qualquer FORA do root do destaque já é o suficiente
      // pra disparar destaqueElementoAgendarReacao -> destaqueElementoReposicionar,
      // exatamente como já acontecia antes desta mudança.
      ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    } finally {
      delete sandboxCompartilhado!.document.elementFromPoint
    }

    assert.equal(destaqueElementoGetTestOculto(0), true, 'alvo encoberto pelo overlay deve ficar marcado como oculto')
    assert.equal(ultimoRootDestaque!.style.display, 'none', 'oculta via display:none — badge e tooltip somem juntos')
    assert.equal(chamadasRastreamento.length, antes, 'ficar coberto nunca dispara nenhuma requisição de tracking')
    assert.equal(wasShown(campanha, config), false, 'alvo coberto nunca consome (markShown) o destaque')
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a instância continua montada — só ficou oculta, nunca desmontada')
  })

  test('alvo volta a ficar realmente visível (overlay fechado) restaura o destaque — sem markShown, sem nova requisição', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-visibilidade-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-visibilidade-2' }
    destaqueElementoMontar(campanha, config, alvo)

    const overlay = { tagName: 'DIV' }
    sandboxCompartilhado!.document.elementFromPoint = () => overlay
    ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    assert.equal(destaqueElementoGetTestOculto(0), true, 'pré-condição: overlay cobrindo o alvo')

    const antes = chamadasRastreamento.length
    // Overlay fechado -> o ponto representativo do alvo resolve pro próprio
    // alvo de novo.
    sandboxCompartilhado!.document.elementFromPoint = () => alvo
    try {
      ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    } finally {
      delete sandboxCompartilhado!.document.elementFromPoint
    }

    assert.equal(destaqueElementoGetTestOculto(0), false, 'alvo descoberto deve restaurar o destaque')
    assert.equal(ultimoRootDestaque!.style.display, '', 'display volta ao normal (nada de "none")')
    assert.equal(ultimoRootDestaque!.style.top, (134 - 32) + 'px', 'reposicionamento normal (badge acima do alvo) volta a acontecer depois de restaurado')
    assert.equal(chamadasRastreamento.length, antes, 'restaurar a visibilidade nunca dispara tracking sozinho')
    assert.equal(wasShown(campanha, config), false, 'restaurar a visibilidade nunca marca o destaque como visto')
  })

  test('sem elementFromPoint (navegador sem suporte), abrir/fechar overlay nunca oculta o destaque — mesmo comportamento de sempre', () => {
    const alvo = { tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40) }
    const campanha: Campanha = { id: 'destaque-visibilidade-3', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-visibilidade-3' }
    destaqueElementoMontar(campanha, config, alvo)
    // document.elementFromPoint continua ausente aqui de propósito (default
    // do harness compartilhado) — qualquer mutation continua só reposicionando
    // normalmente, nunca ocultando.
    ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    assert.equal(destaqueElementoGetTestOculto(0), false)
    assert.equal(ultimoRootDestaque!.style.display, undefined, 'nunca setou display:none — a checagem de oclusão não roda sem elementFromPoint')
  })

  test('elemento alvo nunca recebe nenhum listener/handler novo — a checagem de visibilidade só lê getBoundingClientRect/elementFromPoint', () => {
    const alvo: { tagName: string; getBoundingClientRect: () => Retangulo; addEventListener?: unknown } = {
      tagName: 'BUTTON', getBoundingClientRect: () => retangulo(134, 500, 140, 40),
    }
    const campanha: Campanha = { id: 'destaque-visibilidade-4', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-visibilidade-4' }
    destaqueElementoMontar(campanha, config, alvo)
    ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'DIV' } }])
    assert.equal(alvo.addEventListener, undefined, 'a checagem de visibilidade nunca anexa nenhum listener ao alvo — clicar nele continua fora do alcance do widget')
  })
})

// Ciclo de vida da instância entre reavaliações (init()/updateContext() numa
// SPA que troca de usuário/contexto sem reload completo) — cobre a causa
// raiz investigada: destaqueElementoInstancias nunca era limpo quando
// init()/updateContext() rodavam de novo, a menos que uma nova avaliação
// selecionasse um destaque_elemento novo. Um destaque de um usuário/contexto
// anterior (root, listeners, MutationObserver/ResizeObserver, e o
// config/usuario_id fechado na instância) ficava vivo indefinidamente.
describe('destaqueElementoIdentidadeSelecao / destaqueElementoIdentidadesIguais (funções puras)', () => {
  test('campanha com destaques[]: campanhaId + ids ordenados dos itens ativos (ativo:false fica de fora)', () => {
    const campanha: Campanha = {
      id: 'campanha-x',
      destaques: [
        { id: 'item-c', data_cy: 'x' },
        { id: 'item-a', data_cy: 'x' },
        { id: 'item-b', data_cy: 'x', ativo: false },
      ],
    }
    const identidade = destaqueElementoIdentidadeSelecao(campanha)
    assert.equal(identidade.campanhaId, 'campanha-x')
    // itemIds pode ter sido criado DENTRO do vm (protótipo de Array
    // diferente do deste arquivo) — deepEqual/deepStrictEqual exigiria o
    // mesmo protótipo, por isso compara por tamanho + elementos.
    assert.equal(identidade.itemIds.length, 2)
    assert.equal(identidade.itemIds[0], 'item-a')
    assert.equal(identidade.itemIds[1], 'item-c')
  })

  test('campanha legada (sem destaques[], modo_exibicao destaque_elemento + data_cy): identidade do pseudo-item (id:null)', () => {
    const campanha: Campanha = { id: 'campanha-legada', modo_exibicao: 'destaque_elemento', data_cy: 'alvo-legado' }
    const identidade = destaqueElementoIdentidadeSelecao(campanha)
    assert.equal(identidade.campanhaId, 'campanha-legada')
    assert.equal(identidade.itemIds.length, 1)
    assert.equal(identidade.itemIds[0], null)
  })

  test('campanha null/undefined: identidade vazia (campanhaId null, sem itens)', () => {
    assert.equal(destaqueElementoIdentidadeSelecao(null).campanhaId, null)
    assert.equal(destaqueElementoIdentidadeSelecao(null).itemIds.length, 0)
    assert.equal(destaqueElementoIdentidadeSelecao(undefined).campanhaId, null)
  })

  test('identidadesIguais: mesma campanha + mesmos itens, em ORDEM diferente na entrada -> iguais (nunca usa posição/ordem do array como identidade)', () => {
    const a = destaqueElementoIdentidadeSelecao({ id: 'c1', destaques: [{ id: 'i1', data_cy: 'x' }, { id: 'i2', data_cy: 'x' }] })
    const b = destaqueElementoIdentidadeSelecao({ id: 'c1', destaques: [{ id: 'i2', data_cy: 'x' }, { id: 'i1', data_cy: 'x' }] })
    assert.equal(destaqueElementoIdentidadesIguais(a, b), true)
  })

  test('identidadesIguais: campanhaId diferente -> desiguais, mesmo com os mesmos itens', () => {
    const a = destaqueElementoIdentidadeSelecao({ id: 'c1', destaques: [{ id: 'i1', data_cy: 'x' }] })
    const b = destaqueElementoIdentidadeSelecao({ id: 'c2', destaques: [{ id: 'i1', data_cy: 'x' }] })
    assert.equal(destaqueElementoIdentidadesIguais(a, b), false)
  })

  test('identidadesIguais: mesma campanha, itens diferentes (quantidade ou conteúdo) -> desiguais', () => {
    const base = { id: 'c1', destaques: [{ id: 'i1', data_cy: 'x' }] }
    const maisItens = { id: 'c1', destaques: [{ id: 'i1', data_cy: 'x' }, { id: 'i2', data_cy: 'x' }] }
    const outroItem = { id: 'c1', destaques: [{ id: 'i3', data_cy: 'x' }] }
    assert.equal(destaqueElementoIdentidadesIguais(destaqueElementoIdentidadeSelecao(base), destaqueElementoIdentidadeSelecao(maisItens)), false)
    assert.equal(destaqueElementoIdentidadesIguais(destaqueElementoIdentidadeSelecao(base), destaqueElementoIdentidadeSelecao(outroItem)), false)
  })

  test('identidadesIguais: null/undefined tratados por igualdade estrita (nunca lança)', () => {
    assert.equal(destaqueElementoIdentidadesIguais(null, null), true)
    assert.equal(destaqueElementoIdentidadesIguais(null, destaqueElementoIdentidadeSelecao({ id: 'c1' })), false)
  })
})

describe('destaqueElementoSincronizarSelecao — updateContext preserva/substitui/remove sem flicker nem duplicação', () => {
  test('sai da rota e volta à mesma campanha/item repetidamente: desmonta e remonta sempre uma única instância, sem hard reload', () => {
    const dataCy = 'filtro-spa-volta'
    presentes.add(dataCy)
    const campanha: Campanha = {
      id: 'destaque-spa-volta', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-spa-volta', data_cy: dataCy, titulo: 'T' }],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-spa-volta' }
    destaqueElementoMontarTodos(campanha, config)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null)
    assert.equal(wasShown(campanha, config, 'item-spa-volta'), false, 'visualização sozinha mantém wasShown=false')

    for (let ciclo = 0; ciclo < 3; ciclo++) {
      presentes.delete(dataCy)
      ultimoMutationObserverDestaque!.cb([{ target: { tagName: 'MAIN' } }])
      assert.equal(destaqueElementoGetTestClickListener(0), null, 'alvo removido desmonta a instância')

      presentes.add(dataCy)
      const rootsAntes = todasAsRaizesDestaque.length
      destaqueElementoSincronizarSelecao(campanha, config)
      dispararTimersPendentesDestaque()
      assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'mesma identidade lógica remonta quando a instância deixou de existir')
      assert.equal(todasAsRaizesDestaque.length, rootsAntes + 1, 'cada retorno cria exatamente uma instância')
    }
    assert.equal(wasShown(campanha, config, 'item-spa-volta'), false)
  })

  test('mesma campanha + mesmos itens ativos: preserva a instância existente (nunca desmonta/remonta, nunca duplica root/observer)', () => {
    presentes.add('filtro-sync-preserva')
    const campanha: Campanha = {
      id: 'destaque-sync-preserva', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-sync-preserva', data_cy: 'filtro-sync-preserva', titulo: 'T' }],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-preserva' }
    destaqueElementoMontarTodos(campanha, config)
    const listenerAntes = destaqueElementoGetTestClickListener(0)
    const observerAntes = ultimoMutationObserverDestaque
    const raizesAntes = todasAsRaizesDestaque.length
    assert.notEqual(listenerAntes, null)

    // Mesmo objeto de campanha (poderia até ser uma cópia com o mesmo id e
    // os mesmos itens — a comparação é por identidade estrutural, não por
    // referência de objeto).
    destaqueElementoSincronizarSelecao(campanha, config)

    assert.equal(destaqueElementoGetTestClickListener(0), listenerAntes, 'mesma instância — o listener de clique religado é exatamente o mesmo, nunca remonta')
    assert.equal(ultimoMutationObserverDestaque, observerAntes, 'nenhum MutationObserver novo criado — nunca duplica observers')
    assert.equal(todasAsRaizesDestaque.length, raizesAntes, 'nenhum root novo criado — sem flicker/duplicação')
  })

  test('mesma campanha + mesmos itens: revalida/recalcula a posição contra o layout atual (mesmo preservando a instância)', () => {
    presentes.add('filtro-sync-reposiciona')
    const campanha: Campanha = {
      id: 'destaque-sync-reposiciona', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-sync-reposiciona', data_cy: 'filtro-sync-reposiciona', titulo: 'T' }],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-reposiciona' }
    // destaqueElementoMontarTodos (não a API legada destaqueElementoMontar)
    // é o que de fato marca destaqueElementoSelecaoAtual — necessário pra
    // destaqueElementoSincronizarSelecao reconhecer "mesma seleção" abaixo.
    destaqueElementoMontarTodos(campanha, config)
    // "Corrompe" a posição já aplicada com um valor-sentinela — se
    // destaqueElementoSincronizarSelecao realmente revalidar a posição
    // (mesmo preservando a instância), esse valor tem que ser sobrescrito
    // por um pixel de verdade calculado a partir do layout atual do alvo.
    ultimoRootDestaque!.style.top = 'valor-sentinela-nao-recalculado'

    destaqueElementoSincronizarSelecao(campanha, config)

    assert.notEqual(ultimoRootDestaque!.style.top, 'valor-sentinela-nao-recalculado', 'preservar a instância ainda precisa revalidar/recalcular a posição contra o layout atual (o contexto pode ter mudado mesmo sem trocar de campanha/item)')
  })

  test('nenhuma candidata destaque_elemento elegível nesta rodada (null): desmonta os destaques existentes', () => {
    presentes.add('filtro-sync-remove')
    const campanha: Campanha = {
      id: 'destaque-sync-remove', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-sync-remove', data_cy: 'filtro-sync-remove', titulo: 'T' }],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-remove' }
    destaqueElementoMontarTodos(campanha, config)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'pré-condição: instância montada')

    destaqueElementoSincronizarSelecao(null, config)

    assert.equal(destaqueElementoGetTestClickListener(0), null, 'sem nenhuma candidata elegível, a instância existente deve ser desmontada')
  })

  test('campanha mudou (id diferente): desmonta a antiga IMEDIATAMENTE e agenda a montagem da nova (respeita atraso_ms/gatilho normalmente)', () => {
    presentes.add('filtro-sync-antiga')
    presentes.add('filtro-sync-nova')
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-troca' }
    const campanhaAntiga: Campanha = {
      id: 'destaque-sync-antiga', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-sync-antiga', data_cy: 'filtro-sync-antiga', titulo: 'T' }],
    }
    const campanhaNova: Campanha = {
      id: 'destaque-sync-nova', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-sync-nova', data_cy: 'filtro-sync-nova', titulo: 'T' }],
    }
    destaqueElementoMontarTodos(campanhaAntiga, config)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null)

    destaqueElementoSincronizarSelecao(campanhaNova, config)
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'a campanha antiga já não deve mais existir, mesmo ANTES do timer da nova campanha disparar')

    dispararTimersPendentesDestaque()
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a nova campanha deve estar montada depois do timer (atraso_ms padrão)')
  })

  test('mesma campanha.id mas itens ativos diferentes: tratado como mudança (nunca "sem mudança" só por bater o id da campanha)', () => {
    presentes.add('filtro-sync-item-velho')
    presentes.add('filtro-sync-item-novo')
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-itens' }
    const campanhaV1: Campanha = {
      id: 'destaque-sync-itens', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-velho', data_cy: 'filtro-sync-item-velho', titulo: 'T' }],
    }
    destaqueElementoMontarTodos(campanhaV1, config)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null)

    const campanhaV2: Campanha = {
      id: 'destaque-sync-itens', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-novo', data_cy: 'filtro-sync-item-novo', titulo: 'T' }],
    }
    destaqueElementoSincronizarSelecao(campanhaV2, config)
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'itens diferentes (mesmo campanha.id) precisa ser tratado como mudança, nunca como "mesma seleção"')

    dispararTimersPendentesDestaque()
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a nova seleção (novos itens) deve estar montada depois do timer')
  })

  test('uma nova sincronização cancela o timer de montagem pendente de uma sincronização anterior — timer antigo nunca remonta algo já invalidado', () => {
    presentes.add('filtro-sync-timer-a')
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-sync-timer' }
    const campanhaA: Campanha = {
      id: 'destaque-sync-timer-a', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-timer-a', data_cy: 'filtro-sync-timer-a', titulo: 'T' }],
    }
    // Nada montado ainda -> primeira sincronização agenda a montagem de A.
    destaqueElementoSincronizarSelecao(campanhaA, config)
    // Antes do timer de A disparar, a avaliação seguinte já decide que não
    // há mais nenhuma candidata elegível.
    destaqueElementoSincronizarSelecao(null, config)

    // Se o timer de A não tivesse sido cancelado, ele montaria A aqui —
    // remontando algo que a decisão mais recente já invalidou.
    dispararTimersPendentesDestaque()
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'o timer de uma sincronização já superada nunca pode remontar um destaque invalidado')
  })
})

describe('window.UserPulse.init() nunca deixa destaque de um usuário/config anterior sobreviver', () => {
  test('init A monta um destaque -> init B (sem nenhuma candidata elegível) desmonta a instância de A incondicionalmente', () => {
    presentes.add('filtro-init-troca-usuario')
    const campanhaA: Campanha = {
      id: 'destaque-init-usuario-a', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-init-usuario-a', data_cy: 'filtro-init-troca-usuario', titulo: 'T' }],
    }
    const configA: ConfigWidget = { sistema: 'sis', tela: 'tela-init-usuario', usuario_id: 'usuario-a' }
    destaqueElementoMontarTodos(campanhaA, configA)
    assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'pré-condição: instância de A está montada')

    // init() com config vazia (sem slug/sistema) é suficiente pra provar o
    // teardown incondicional: ele é a PRIMEIRA coisa que init() faz, antes
    // até do early-return de config vazia — mesmo padrão já usado por
    // widgetTourFeedback.test.ts pra exercitar efeitos colaterais de init()
    // sem precisar simular o fetch de candidatas/aparência completo.
    userPulseInit({})

    assert.equal(destaqueElementoGetTestClickListener(0), null, 'a instância de A nunca pode sobreviver a um novo init(), mesmo sem nenhuma candidata nova elegível')
  })

  test('depois de init B, a instância de A não existe mais em lugar nenhum — nenhum evento pode continuar usando o usuario_id dela', () => {
    presentes.add('filtro-init-sem-vazamento')
    const campanhaA: Campanha = {
      id: 'destaque-init-sem-vazamento', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-init-sem-vazamento', data_cy: 'filtro-init-sem-vazamento', titulo: 'T' }],
    }
    const configA: ConfigWidget = { sistema: 'sis', tela: 'tela-init-vazamento', usuario_id: 'usuario-a' }
    destaqueElementoMontarTodos(campanhaA, configA)
    const antes = chamadasRastreamento.length

    userPulseInit({})

    // A única forma de qualquer clique gerar tracking/utilidade pra essa
    // instância é através do listener religado ao SEU root — se ela não
    // existe mais em destaqueElementoInstancias (índice 0 devolve null),
    // não sobra NENHUM jeito, dentro do próprio widget, de alcançá-la e
    // gerar um evento com o usuario_id antigo (um clique real, num browser
    // de verdade, também nunca alcançaria um nó já removido do DOM).
    assert.equal(destaqueElementoGetTestClickListener(0), null)
    assert.equal(chamadasRastreamento.length, antes, 'o próprio init() não deve gerar nenhuma chamada de tracking sozinho')
  })

  test('init A monta -> novo init() (mesmo sem trocar campanha) sempre desmonta antes — nunca preserva a instância antiga por engano (diferente de updateContext())', () => {
    presentes.add('filtro-init-mesma-campanha')
    const campanha: Campanha = {
      id: 'destaque-init-mesma-campanha', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      destaques: [{ id: 'item-init-mesma-campanha', data_cy: 'filtro-init-mesma-campanha', titulo: 'T' }],
    }
    const config: ConfigWidget = { sistema: 'sis', tela: 'tela-init-mesma-campanha', usuario_id: 'usuario-a' }
    destaqueElementoMontarTodos(campanha, config)
    const instanciaA = destaqueElementoGetTestClickListener(0)
    assert.notEqual(instanciaA, null)

    userPulseInit({})
    assert.equal(destaqueElementoGetTestClickListener(0), null, 'init() nunca preserva — diferente de updateContext()/evaluateCampaigns(), não compara identidade com o que já estava montado')

    // "B" monta de novo, com a MESMA campanha/config — o resultado precisa
    // ser uma instância NOVA, nunca a de A sobrevivendo por baixo.
    destaqueElementoMontarTodos(campanha, config)
    const instanciaB = destaqueElementoGetTestClickListener(0)
    assert.notEqual(instanciaB, null)
    assert.notEqual(instanciaB, instanciaA, 'a instância montada depois do init() é sempre NOVA — nunca a referência antiga preservada')
  })
})

describe('evaluateCampaigns — corrida entre avaliações assíncronas (token) nunca restaura contexto já substituído', () => {
  test('resposta desatualizada (fetch mais antiga) resolvendo DEPOIS de uma avaliação mais nova nunca monta/restaura destaque', async () => {
    presentes.add('filtro-race-alvo')
    // Sessão limpa (state.open/state.timer/instâncias) sem precisar simular
    // o fetch de candidatas/aparência completo de um init() de verdade —
    // mesmo raciocínio de init({}) usado acima, e configSetTestState
    // (mesmo padrão de tourSetTestState) seta só state.config.
    userPulseInit({})
    configSetTestState({ sistema: 'sis-race', tela: 'tela-race' })

    const campanhaVelha = {
      id: 'destaque-race-velha', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      tela: 'tela-race', data_cy: 'filtro-race-alvo', titulo: 'Velha',
    }

    let resolverPrimeira: (value: unknown) => void = () => {}
    let resolverSegunda: (value: unknown) => void = () => {}
    const respostas = [
      new Promise((resolve) => { resolverPrimeira = resolve }),
      new Promise((resolve) => { resolverSegunda = resolve }),
    ]
    let chamada = 0
    const fetchOriginal = sandboxCompartilhado!.fetch
    sandboxCompartilhado!.fetch = () => respostas[chamada++]
    try {
      evaluateCampaigns() // dispara a fetch #1 (token N) — avaliação mais ANTIGA
      evaluateCampaigns() // dispara a fetch #2 (token N+1) — avaliação mais NOVA

      // A resposta mais NOVA chega primeiro: nenhuma candidata elegível.
      resolverSegunda({ ok: true, json: () => Promise.resolve([]) })
      await new Promise(resolve => setTimeout(resolve, 0))

      // A resposta mais ANTIGA chega DEPOIS, atrasada — trazendo a campanha
      // velha como candidata elegível. Sem o token, isso remontaria um
      // destaque de um contexto já substituído pela avaliação mais nova.
      resolverPrimeira({ ok: true, json: () => Promise.resolve([campanhaVelha]) })
      await new Promise(resolve => setTimeout(resolve, 0))

      dispararTimersPendentesDestaque()
      assert.equal(destaqueElementoGetTestClickListener(0), null, 'resposta atrasada de uma avaliação já superada nunca pode montar/restaurar destaque')
    } finally {
      sandboxCompartilhado!.fetch = fetchOriginal
    }
  })

  test('avaliação mais recente ainda funciona normalmente (token não bloqueia a resposta atual, só as desatualizadas)', async () => {
    presentes.add('filtro-race-atual')
    userPulseInit({})
    configSetTestState({ sistema: 'sis-race-2', tela: 'tela-race-2' })

    const campanhaAtual = {
      id: 'destaque-race-atual', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true,
      tela: 'tela-race-2', data_cy: 'filtro-race-atual', titulo: 'Atual',
    }
    const fetchOriginal = sandboxCompartilhado!.fetch
    sandboxCompartilhado!.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([campanhaAtual]) })
    try {
      evaluateCampaigns()
      await new Promise(resolve => setTimeout(resolve, 0))
      dispararTimersPendentesDestaque()
      assert.notEqual(destaqueElementoGetTestClickListener(0), null, 'a avaliação mais recente (a única disparada aqui) deve montar o destaque normalmente')
    } finally {
      sandboxCompartilhado!.fetch = fetchOriginal
    }
  })
})
