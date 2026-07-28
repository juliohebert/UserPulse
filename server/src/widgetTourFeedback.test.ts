import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Testa a persistência do feedback final do Tour (tourFeedback/
// registrarEventoTour em widget.js) — clicar numa das opções da tela final
// (nao_ajudou/ajudou/muito_util) deve registrar um evento 'feedback_tour' via
// fetch, exceto em prévia (tourState.preview=true), nunca duplicar em clique
// repetido, e nunca lançar exceção se a chamada falhar.
//
// Carrega o widget.js real via vm (mesmo padrão de widgetTourVoltar.test.ts)
// e usa window.UserPulse._internal (tourState, renderTour,
// tourGetTestSnapshot, finalizarTour) pra montar o cenário.
//
// De propósito, este harness NÃO chama tourFeedback() diretamente e NÃO lê
// `state` (o objeto geral do widget, com config/campanha/jornada — pode
// carregar usuario_email/nome passados pelo host): widget.js não expõe nem
// um nem outro em _internal (mesma razão de recorderState nunca ser exposto
// — é o widget PÚBLICO, rodando no browser do cliente, e tourFeedback tem
// efeito colateral real de registrar evento). Em vez disso:
//   - state.config é preenchido chamando window.UserPulse.init() de verdade
//     (a MESMA API pública que qualquer host já usa) sem slug/sistema — só
//     o suficiente pra passar no guard de registrarEventoTour, e o próprio
//     init() retorna cedo (antes de qualquer fetch de campanha/aparência)
//     quando não há slug nem sistema, então não precisa de infraestrutura
//     extra no sandbox.
//   - o clique no feedback é simulado de verdade: internos.renderTour()
//     desenha a tela final e religa o listener de clique real (via
//     bindTourEvents, chamado por dentro do próprio renderTour) no
//     tourState.root; o teste recupera esse listener e dispara um evento de
//     clique sintético num elemento com o atributo data-up-tour-feedback,
//     do mesmo jeito que um clique real do usuário chegaria até lá — sem
//     chamar tourFeedback() como função solta.
//
// Diferente de widgetTourVoltar.test.ts, aqui o fetch precisa GRAVAR as
// chamadas — o stub fica no objeto global do sandbox (não só em
// window.fetch): o código do widget chama `fetch(...)` como identificador
// solto (herdado do runtime de browser, onde window===globalThis), então
// dentro do vm.createContext isso só resolve se `fetch` também existir como
// propriedade do próprio sandbox — window.fetch sozinho não é suficiente.

interface TourStateParaTeste {
  ativo: boolean
  tour: { id: string; slug: string; passos: unknown[] } | null
  indice: number
  preview: boolean
  feedbackEscolhido: string | null
  tela: string | null
  root: FakeElement | null
  fimTimer: unknown
}

interface Snapshot {
  ativo: boolean
  preview: boolean
  feedbackEscolhido: string | null
}

interface Internos {
  tourState: TourStateParaTeste
  renderTour: () => void
  tourGetTestSnapshot: () => Snapshot
  finalizarTour: (motivo: string) => void
}

function makeStyleStub() {
  const props: Record<string, string> = {}
  return {
    setProperty(k: string, v: string) { props[k] = v },
    removeProperty(k: string) { delete props[k] },
    getPropertyValue(k: string) { return props[k] || '' },
  }
}

type FakeElement = ReturnType<typeof makeFakeElementFactory>

// target.closest('[data-up-tour-feedback]') (e demais seletores usados por
// bindTourEvents) só precisa reconhecer presença de atributo — nenhum outro
// combinador é usado no delegate de clique do tour.
function fakeCloses(this: any, selector: string) {
  const m = /^\[([a-zA-Z0-9_-]+)\]$/.exec(selector)
  if (!m) return null
  let el: any = this
  while (el) {
    if (el.hasAttribute && el.hasAttribute(m[1])) return el
    el = el.parentElement || null
  }
  return null
}

// elemento "clicável" mínimo: precisa ser instanceof do MESMO `Element` usado
// dentro do sandbox vm (bindTourEvents checa `target instanceof Element`) e
// registrar listeners de clique de verdade (addEventListener grava, não
// ignora) — é isso que permite ao teste recuperar o listener religado por
// bindTourEvents e disparar um clique sintético nele depois.
function makeFakeElementFactory(ElementCtor: new () => object, tag: string, attrs: Record<string, string> = {}) {
  const attributes: Record<string, string> = { ...attrs }
  const listeners: Record<string, Array<(event: unknown) => void>> = {}
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    style: makeStyleStub(),
    attributes,
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k: string, v: string) { attributes[k] = String(v) },
    getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(attributes, k) ? attributes[k] : null },
    hasAttribute(k: string) { return Object.prototype.hasOwnProperty.call(attributes, k) },
    removeAttribute(k: string) { delete attributes[k] },
    appendChild(child: unknown) { return child },
    insertBefore(child: unknown) { return child },
    remove() {},
    addEventListener(type: string, cb: (event: unknown) => void) { (listeners[type] = listeners[type] || []).push(cb) },
    removeEventListener() {},
    listeners,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: fakeCloses,
    matches: () => false,
    parentElement: null,
    id: '',
    get innerHTML() { return this._html || '' },
    set innerHTML(v: string) { this._html = v },
    get textContent() { return this._text || '' },
    set textContent(v: string) { this._text = v },
  }
  Object.setPrototypeOf(el, ElementCtor.prototype)
  return el
}

class ElementStub {}

function makeFakeElement(tag?: string, attrs?: Record<string, string>) {
  return makeFakeElementFactory(ElementStub, tag || 'div', attrs)
}

type FetchChamada = { url: string; body: any }

// fetchImpl (opcional) controla o resultado da chamada (sucesso/rejeição) —
// por padrão resolve com { ok: true }, sem precisar de um servidor real.
function criarInstancia(fetchImpl?: () => Promise<unknown>) {
  const sessionStorageMap = new Map<string, string>()
  const sessionStorageStub = {
    getItem: (k: string) => (sessionStorageMap.has(k) ? sessionStorageMap.get(k)! : null),
    setItem: (k: string, v: string) => { sessionStorageMap.set(k, String(v)) },
    removeItem: (k: string) => { sessionStorageMap.delete(k) },
  }
  const localStorageMap = new Map<string, string>()
  const localStorageStub = {
    getItem: (k: string) => (localStorageMap.has(k) ? localStorageMap.get(k)! : null),
    setItem: (k: string, v: string) => { localStorageMap.set(k, String(v)) },
    removeItem: (k: string) => { localStorageMap.delete(k) },
  }
  class MutationObserverStub { observe() {} disconnect() {} }
  const documentStub = {
    currentScript: { src: 'http://localhost/widget.js' },
    readyState: 'complete',
    documentElement: makeFakeElement('html'),
    body: makeFakeElement('body'),
    head: makeFakeElement('head'),
    createElement: (tag: string) => makeFakeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  }

  const fetchChamadas: FetchChamada[] = []
  const fetchStub = (url: string, opts?: { body?: string }) => {
    fetchChamadas.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : undefined })
    return fetchImpl ? fetchImpl() : Promise.resolve({ ok: true })
  }

  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    document: documentStub,
    Element: ElementStub,
    MutationObserver: MutationObserverStub,
    fetch: fetchStub,
  }
  sandbox.window = {
    location: { href: 'http://host/pagina', pathname: '/pagina', search: '', hash: '', origin: 'http://host' },
    history: { pushState() {}, replaceState() {}, back() {} },
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    navigator: { userAgent: 'node-harness' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: MutationObserverStub,
    fetch: fetchStub,
    Element: ElementStub,
    URL,
    URLSearchParams,
  }
  vm.createContext(sandbox)
  const codigo = fs.readFileSync(
    path.resolve(__dirname, '../../web/public/widget.js'),
    'utf8'
  )
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as { UserPulse?: { _internal?: Internos; init?: (config: unknown) => void } }).UserPulse
  const internos = UserPulse?._internal
  assert.ok(internos, 'window.UserPulse._internal não foi exposto por widget.js')
  assert.equal(
    Object.prototype.hasOwnProperty.call(internos, 'state'), false,
    'state (config/campanha/jornada do widget) não deveria estar exposto em _internal'
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(internos, 'tourFeedback'), false,
    'tourFeedback não deveria estar exposto diretamente em _internal (efeito colateral de registrar evento)'
  )

  // Preenche state.config via a MESMA API pública que qualquer host usa —
  // sem slug/sistema, init() seta state.config e retorna antes de qualquer
  // fetch de campanha/aparência (ver widget.js: `if (!normalized.slug &&
  // !normalized.sistema) return;`), então não precisa de infraestrutura
  // extra no sandbox só pra isso.
  UserPulse!.init!({ usuario_id: 'user-1', tela: 'tela-teste' })

  return {
    internos: internos as Internos,
    fetchChamadas: () => fetchChamadas.slice(),
  }
}

function passoFake(id: string) {
  return { id, seletor_tipo: 'css', seletor: 'body', tooltip_posicao: 'auto' }
}

function tourFake() {
  return { id: 'tour-teste', slug: 'tour-teste', passos: [passoFake('p0'), passoFake('p1')] }
}

// Prepara um tourState "na tela final", pronto pra simular o clique de
// feedback — mesma forma mínima usada pelas outras suítes (harness monta o
// estado direto, sem depender de iniciarTour()/tourConcluir() de ponta a
// ponta rodando DOM real).
function prepararTourNaTelaFinal(internos: Internos) {
  const ts = internos.tourState
  ts.ativo = true
  ts.tour = tourFake()
  ts.indice = 1
  ts.tela = 'concluido'
  ts.feedbackEscolhido = null
  return ts
}

// Dispara um clique real no botão de feedback: renderTour() desenha a tela
// final e religa o listener via bindTourEvents (rodando por dentro dela) no
// tourState.root; recupera esse listener e chama com um alvo sintético que
// carrega o atributo data-up-tour-feedback, exatamente como bindTourEvents
// espera encontrar num clique de verdade — nunca chama tourFeedback() solta.
function clicarBotaoFeedback(internos: Internos, valor: string) {
  internos.renderTour()
  const root = internos.tourState.root
  const clickListener = root && root.listeners.click && root.listeners.click[0]
  assert.ok(clickListener, 'renderTour() deveria ter religado o listener de clique (bindTourEvents) no tourState.root')
  const botao = makeFakeElement('button', { 'data-up-tour-feedback': valor })
  clickListener!({ target: botao, preventDefault() {}, stopPropagation() {} })
}

describe('feedback final do Tour — persistência via clique real simulado (widget.js)', () => {
  test('em prévia (tourState.preview=true) não registra evento', () => {
    const inst = criarInstancia()
    const ts = prepararTourNaTelaFinal(inst.internos)
    ts.preview = true

    clicarBotaoFeedback(inst.internos, 'ajudou')

    assert.equal(inst.fetchChamadas().length, 0, 'prévia do gravador nunca deve gerar evento real')
    const snap = inst.internos.tourGetTestSnapshot()
    assert.equal(snap.feedbackEscolhido, 'ajudou', 'a UI local (obrigado/auto-fechar) continua funcionando mesmo em prévia')

    inst.internos.finalizarTour('fim_do_teste')
  })

  test('tour normal (fora de prévia) registra evento feedback_tour com valor/label/emoji', () => {
    const inst = criarInstancia()
    const ts = prepararTourNaTelaFinal(inst.internos)
    ts.preview = false

    clicarBotaoFeedback(inst.internos, 'muito_util')

    const chamadas = inst.fetchChamadas()
    assert.equal(chamadas.length, 1, 'deveria registrar exatamente 1 evento')
    assert.equal(chamadas[0].url, 'http://localhost/api/widget/tour/evento')
    assert.equal(chamadas[0].body.tipo_evento, 'feedback_tour')
    assert.equal(chamadas[0].body.tour_id, 'tour-teste')
    assert.equal(chamadas[0].body.passo_ordem, 1)
    assert.equal(chamadas[0].body.contexto.feedback_valor, 'muito_util')
    assert.equal(chamadas[0].body.contexto.feedback_label, 'Muito útil')
    assert.equal(chamadas[0].body.contexto.feedback_emoji, '🤩')

    const snap = inst.internos.tourGetTestSnapshot()
    assert.equal(snap.feedbackEscolhido, 'muito_util')
    assert.equal(snap.preview, false)

    inst.internos.finalizarTour('fim_do_teste')
  })

  test('clique duplicado/repetido não reenvia o evento (trava por feedbackEscolhido)', () => {
    const inst = criarInstancia()
    const ts = prepararTourNaTelaFinal(inst.internos)
    ts.preview = false

    clicarBotaoFeedback(inst.internos, 'ajudou')
    clicarBotaoFeedback(inst.internos, 'ajudou')
    clicarBotaoFeedback(inst.internos, 'nao_ajudou') // mesmo um valor diferente não deveria reenviar

    assert.equal(inst.fetchChamadas().length, 1, 'cliques repetidos não devem empilhar chamadas')
    assert.equal(inst.internos.tourGetTestSnapshot().feedbackEscolhido, 'ajudou', 'mantém o primeiro valor escolhido')

    inst.internos.finalizarTour('fim_do_teste')
  })

  test('falha na chamada (API indisponível) não lança exceção nem quebra o estado', () => {
    const inst = criarInstancia(() => Promise.reject(new Error('rede indisponível')))
    const ts = prepararTourNaTelaFinal(inst.internos)
    ts.preview = false

    assert.doesNotThrow(() => clicarBotaoFeedback(inst.internos, 'nao_ajudou'))

    assert.equal(inst.fetchChamadas().length, 1, 'a tentativa acontece normalmente, só a resposta que falha')
    assert.equal(inst.internos.tourGetTestSnapshot().feedbackEscolhido, 'nao_ajudou', 'estado local não deve ser desfeito por falha de rede')

    inst.internos.finalizarTour('fim_do_teste')
  })
})
