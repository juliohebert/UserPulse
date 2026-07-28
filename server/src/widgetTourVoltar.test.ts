import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Testa só a DECISÃO de navegação do "Voltar" (tourVoltar/tourVoltarNavegar
// em widget.js) — se a página do passo anterior é diferente da atual, deve
// disparar history.back() e marcar uma navegação pendente (nunca navegar de
// verdade, nunca aguardar o elemento aparecer). O resto do fluxo (esperar o
// elemento aparecer depois da navegação, via localizarComRetry) já depende
// de DOM/timing reais e fica coberto por validação manual/harness — ver
// nota no final deste arquivo.
//
// Carrega o widget.js real via vm (mesmo padrão de
// widgetTourSegmentacao.test.ts) e usa window.UserPulse._internal
// (tourSetTestState, tourGetTestSnapshot, tourVoltar, finalizarTour) pra
// montar o cenário direto no estado interno, sem precisar rodar
// iniciarTour()/irParaPasso() de ponta a ponta com DOM verdadeiro — só o
// suficiente pra exercitar a decisão em si. _internal.tourState NÃO existe
// mais (removido por expor o estado inteiro do tour por referência); os
// helpers acima substituem cada uso que este arquivo fazia dele.

interface TourTestStateParcial {
  ativo?: boolean
  tour?: { id: string; slug: string; passos: unknown[] } | null
  indice?: number
  urlPorPasso?: Record<number, string>
}

interface Snapshot {
  ativo: boolean
  preview: boolean
  feedbackEscolhido: string | null
  indice: number
  voltarFallbackTimerAtivo: boolean
}

interface Internos {
  tourSetTestState: (parcial: TourTestStateParcial) => void
  tourGetTestSnapshot: () => Snapshot
  tourVoltar: () => void
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

function makeFakeElement(tag?: string): any {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: makeStyleStub(),
    childNodes: [] as unknown[],
    attributes: {} as Record<string, string>,
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k: string, v: string) { this.attributes[k] = String(v) },
    getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null },
    hasAttribute(k: string) { return Object.prototype.hasOwnProperty.call(this.attributes, k) },
    removeAttribute(k: string) { delete this.attributes[k] },
    appendChild(child: unknown) { this.childNodes.push(child); return child },
    insertBefore(child: unknown) { this.childNodes.push(child); return child },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: () => null,
    get innerHTML() { return this._html || '' },
    set innerHTML(v: string) { this._html = v },
    get textContent() { return this._text || '' },
    set textContent(v: string) { this._text = v },
    id: '',
  }
}

// Cria uma instância isolada do widget.js (vm.createContext próprio) — cada
// teste recebe seu window/história/sessionStorage/tourState do zero, sem
// vazar estado entre cenários (mesma abordagem usada na validação manual da
// Segmentação de Tours).
function criarInstancia(hrefInicial: string) {
  let currentHref = hrefInicial
  function urlParts(href: string) {
    const u = new URL(href)
    return { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash }
  }
  const locationStub = {
    get href() { return currentHref },
    get pathname() { return urlParts(currentHref).pathname },
    get search() { return urlParts(currentHref).search },
    get hash() { return urlParts(currentHref).hash },
  }
  let historyBackChamadas = 0
  const historyStub = {
    pushState(_s: unknown, _t: unknown, url?: string) { if (url) currentHref = new URL(url, currentHref).href },
    replaceState(_s: unknown, _t: unknown, url?: string) { if (url) currentHref = new URL(url, currentHref).href },
    back() { historyBackChamadas += 1 },
  }
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
    // Retorna um elemento "visível" de propósito (não []): localizarComRetry
    // resolve na primeira tentativa, sem agendar timers de retry/backoff em
    // segundo plano — só a decisão de tourVoltar (navegar ou não) importa
    // pra estes testes, não o resultado da busca em si.
    querySelector: () => makeFakeElement('body'),
    querySelectorAll: () => [makeFakeElement('body')],
    getElementById: () => makeFakeElement('body'),
    addEventListener() {},
    removeEventListener() {},
  }

  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    document: documentStub,
    history: historyStub,
  }
  sandbox.window = {
    location: locationStub,
    history: historyStub,
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    navigator: { userAgent: 'node-harness' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: MutationObserverStub,
    fetch: () => Promise.resolve({ ok: false }),
    URL,
    URLSearchParams,
  }
  vm.createContext(sandbox)
  const codigo = fs.readFileSync(
    path.resolve(__dirname, '../../web/public/widget.js'),
    'utf8'
  )
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as { UserPulse?: { _internal?: Internos } }).UserPulse
  const internos = UserPulse?._internal
  assert.ok(internos, 'window.UserPulse._internal não foi exposto por widget.js')
  return {
    internos: internos as Internos,
    historyBackChamadas: () => historyBackChamadas,
    setHref(href: string) { currentHref = href },
  }
}

function passoFake(id: string) {
  return { id, seletor_tipo: 'css', seletor: 'body', tooltip_posicao: 'auto' }
}

function tourFake() {
  return { id: 'tour-teste', slug: 'tour-teste', passos: [passoFake('p0'), passoFake('p1'), passoFake('p2')] }
}

describe('tourVoltar — decisão de navegação (widget.js)', () => {
  test('passo anterior na mesma URL não navega (comportamento atual preservado)', () => {
    const inst = criarInstancia('http://host/pagina-a')
    inst.internos.tourSetTestState({
      ativo: true,
      tour: tourFake(),
      indice: 1,
      urlPorPasso: { 0: 'http://host/pagina-a', 1: 'http://host/pagina-a' },
    })

    inst.internos.tourVoltar()

    assert.equal(inst.historyBackChamadas(), 0, 'não deveria chamar history.back() quando a URL é a mesma')

    // irParaPasso (chamado sincronamente aqui) achou o elemento de primeira e
    // agendou a vigilância de reposicionamento (~4s) — encerra o tour só pra
    // não deixar esse timer vivo até expirar sozinho no fim do processo.
    inst.internos.finalizarTour('fim_do_teste')
  })

  test('sem URL registrada pro passo anterior (ex.: tour retomado no meio) não navega', () => {
    const inst = criarInstancia('http://host/pagina-a')
    inst.internos.tourSetTestState({
      ativo: true,
      tour: tourFake(),
      indice: 1,
      urlPorPasso: { 1: 'http://host/pagina-a' }, // índice 0 nunca foi visitado nesta sessão
    })

    inst.internos.tourVoltar()

    assert.equal(inst.historyBackChamadas(), 0, 'sem URL conhecida, mantém o comportamento de antes (busca na página atual)')

    inst.internos.finalizarTour('fim_do_teste') // ver comentário no teste anterior
  })

  test('passo anterior em URL diferente navega (history.back) e marca navegação pendente', () => {
    const inst = criarInstancia('http://host/pagina-b')
    inst.internos.tourSetTestState({
      ativo: true,
      tour: tourFake(),
      indice: 1,
      urlPorPasso: { 0: 'http://host/pagina-a', 1: 'http://host/pagina-b' },
    })

    inst.internos.tourVoltar()

    assert.equal(inst.historyBackChamadas(), 1, 'deveria chamar history.back() exatamente uma vez')
    let snap = inst.internos.tourGetTestSnapshot()
    assert.equal(snap.voltarFallbackTimerAtivo, true, 'deveria marcar uma navegação pendente (voltarFallbackTimer)')
    // Não resolve o índice sincronamente — só depois que a navegação de
    // verdade acontecer (via handleUrlChange) ou o fallback expirar.
    assert.equal(snap.indice, 1, 'não deveria já ter avançado o índice antes da navegação resolver')

    // Limpa o timer de fallback pendente (1.5s) — sem isso o processo de
    // teste fica vivo esperando ele expirar à toa, só deixando a suíte mais
    // lenta sem checar nada a mais.
    inst.internos.finalizarTour('fim_do_teste')
  })

  test('navegação pendente não entra em loop — clique repetido não chama history.back() de novo', () => {
    const inst = criarInstancia('http://host/pagina-b')
    inst.internos.tourSetTestState({
      ativo: true,
      tour: tourFake(),
      indice: 1,
      urlPorPasso: { 0: 'http://host/pagina-a', 1: 'http://host/pagina-b' },
    })

    inst.internos.tourVoltar()
    inst.internos.tourVoltar()
    inst.internos.tourVoltar()

    assert.equal(inst.historyBackChamadas(), 1, 'cliques repetidos em Voltar durante a navegação pendente não devem empilhar history.back()')

    inst.internos.finalizarTour('fim_do_teste') // limpa o timer de fallback pendente, ver comentário acima
  })

  test('fechar o tour durante navegação pendente cancela o fallback (não reabre sozinho depois)', () => {
    const inst = criarInstancia('http://host/pagina-b')
    inst.internos.tourSetTestState({
      ativo: true,
      tour: tourFake(),
      indice: 1,
      urlPorPasso: { 0: 'http://host/pagina-a', 1: 'http://host/pagina-b' },
    })

    inst.internos.tourVoltar()
    assert.equal(inst.internos.tourGetTestSnapshot().voltarFallbackTimerAtivo, true, 'pré-condição: navegação pendente marcada')

    inst.internos.finalizarTour('usuario_fechou')

    const snap = inst.internos.tourGetTestSnapshot()
    assert.equal(snap.ativo, false)
    assert.equal(snap.voltarFallbackTimerAtivo, false, 'finalizarTour deve cancelar o timer de fallback pendente')
  })
})

// ─── O que ficou fora deste arquivo, e por quê ─────────────────────────────
// O restante do fluxo — esperar a SPA navegar de verdade, localizarComRetry
// achar o elemento na nova página, spotlight/tooltip reposicionarem — não
// tem teste automatizado aqui: depende de DOM real (layout, roteador do
// host reagindo a popstate, mutação de DOM assíncrona) que um stub mínimo
// não reproduz com fidelidade suficiente pra valer a pena, e simular isso
// de verdade exigiria jsdom/navegador — infraestrutura que o projeto não tem
// hoje (mesma limitação já documentada em tours.test.ts). Esse trecho foi
// validado manualmente com harness Node contra o servidor local real (ver
// entrega desta tarefa) e deve ser validado de novo no ambiente de testes.
