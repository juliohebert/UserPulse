import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Testa só o GUARD de captura do Gravador de Tours enquanto pausado — clique
// e input/change não devem virar passo novo com recorderState.pausado=true,
// e devem voltar a virar normalmente depois de retomar (mesmo mecanismo já
// coberto manualmente, ver validação local na entrega desta tarefa). Não
// cobre o restante do fluxo de gravação (seletor sugerido, painel lateral,
// persistência) — só a decisão "captura ou ignora" em si, mesmo escopo restrito
// de widgetTourVoltar.test.ts para tourVoltar.
//
// Carrega o widget.js real via vm (mesmo padrão de widgetTourVoltar.test.ts)
// e usa window.UserPulse._internal (recorderCapturarClique,
// recorderCapturarValor, recorderPausarOuContinuar,
// recorderPrepararTesteCaptura, recorderGetTestSnapshot) pra montar o cenário
// e inspecionar o resultado. recorderState em si NUNCA é exposto por
// widget.js (nem aqui, nem em produção) — só a contagem de passos via
// recorderGetTestSnapshot(), nunca título/seletor/descrição de cada um, já
// que o widget roda no browser do cliente.

interface Snapshot {
  ativo: boolean
  pausado: boolean
  totalPassos: number
}

interface Internos {
  recorderCapturarClique: (event: { target: unknown }) => void
  recorderCapturarValor: (event: { target: unknown; type: 'input' | 'change' }) => void
  recorderPausarOuContinuar: () => void
  recorderPrepararTesteCaptura: () => void
  recorderGetTestSnapshot: () => Snapshot
}

function makeStyleStub() {
  const props: Record<string, string> = {}
  return {
    setProperty(k: string, v: string) { props[k] = v },
    removeProperty(k: string) { delete props[k] },
    getPropertyValue(k: string) { return props[k] || '' },
  }
}

// Elemento "capturável" mínimo: data-cy resolve o seletor de primeira (ver
// recorderGerarSeletor), sem precisar simular subida por ancestrais/
// detecção de dropdown/overlay de framework.
//
// recorderCapturarClique/recorderCapturarValor checam `el instanceof
// Element` — precisa ser uma instância do MESMO `Element` usado dentro do
// sandbox vm (não o Element do Node, que nem existe fora do jsdom). Monta o
// objeto solto primeiro (Object.assign não preservaria os getters/setters de
// innerHTML/textContent abaixo) e só troca o protótipo no fim, pra
// `instanceof ElementCtor` funcionar sem passar pelo construtor.
function makeFakeElement(ElementCtor: new () => object, tag: string, attrs: Record<string, string> = {}): any {
  const attributes: Record<string, string> = { ...attrs }
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
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: () => null,
    matches: () => false,
    parentElement: null,
    id: '',
    get innerHTML() { return this._html || '' },
    set innerHTML(v: string) { this._html = v },
    get textContent() { return this._text || 'Botão de teste' },
    set textContent(v: string) { this._text = v },
  }
  Object.setPrototypeOf(el, ElementCtor.prototype)
  return el
}

class ElementStub {}

function criarInstancia() {
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
    documentElement: makeFakeElement(ElementStub, 'html'),
    body: makeFakeElement(ElementStub, 'body'),
    head: makeFakeElement(ElementStub, 'head'),
    createElement: (tag: string) => makeFakeElement(ElementStub, tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  }
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    document: documentStub,
    Element: ElementStub,
    MutationObserver: MutationObserverStub,
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
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: MutationObserverStub,
    fetch: () => Promise.resolve({ ok: false }),
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
  const UserPulse = (sandbox.window as { UserPulse?: { _internal?: Internos } }).UserPulse
  const internos = UserPulse?._internal
  assert.ok(internos, 'window.UserPulse._internal não foi exposto por widget.js')
  assert.equal(
    Object.prototype.hasOwnProperty.call(internos, 'recorderState'), false,
    'recorderState não deveria estar exposto em _internal (dados capturados do fluxo)'
  )
  return internos as Internos
}

describe('Gravador de Tours — captura ignora clique/input enquanto pausado', () => {
  test('clique captura passo normalmente quando NÃO está pausado (baseline)', () => {
    const internos = criarInstancia()
    internos.recorderPrepararTesteCaptura()
    const botao = makeFakeElement(ElementStub, 'button', { 'data-cy': 'botao-salvar' })

    internos.recorderCapturarClique({ target: botao })

    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 1, 'clique deveria ter capturado 1 passo')
  })

  test('clique NÃO captura passo enquanto pausado', () => {
    const internos = criarInstancia()
    internos.recorderPrepararTesteCaptura()
    internos.recorderPausarOuContinuar() // pausado=false -> true
    assert.equal(internos.recorderGetTestSnapshot().pausado, true, 'pré-condição: gravação pausada')
    const botao = makeFakeElement(ElementStub, 'button', { 'data-cy': 'botao-salvar' })

    internos.recorderCapturarClique({ target: botao })

    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 0, 'clique não deveria capturar passo nenhum enquanto pausado')
  })

  test('input/change NÃO captura passo enquanto pausado', () => {
    const internos = criarInstancia()
    internos.recorderPrepararTesteCaptura()
    internos.recorderPausarOuContinuar()
    const campo = makeFakeElement(ElementStub, 'input', { name: 'busca' })

    internos.recorderCapturarValor({ target: campo, type: 'change' })

    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 0, 'input/change não deveria capturar passo nenhum enquanto pausado')
  })

  test('retomar (recorderPausarOuContinuar) volta a permitir captura, sem apagar passos já existentes', () => {
    const internos = criarInstancia()
    internos.recorderPrepararTesteCaptura()
    const primeiroBotao = makeFakeElement(ElementStub, 'button', { 'data-cy': 'botao-um' })
    internos.recorderCapturarClique({ target: primeiroBotao })
    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 1, 'pré-condição: 1 passo capturado antes de pausar')

    internos.recorderPausarOuContinuar()
    assert.equal(internos.recorderGetTestSnapshot().pausado, true, 'pré-condição: gravação pausada')

    const segundoBotao = makeFakeElement(ElementStub, 'button', { 'data-cy': 'botao-dois' })
    internos.recorderCapturarClique({ target: segundoBotao })
    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 1, 'nada deveria ser capturado enquanto pausado — só a contagem é verificada, nunca o conteúdo dos passos')

    internos.recorderPausarOuContinuar() // retoma
    assert.equal(internos.recorderGetTestSnapshot().pausado, false, 'deveria estar retomado')

    const terceiroBotao = makeFakeElement(ElementStub, 'button', { 'data-cy': 'botao-tres' })
    internos.recorderCapturarClique({ target: terceiroBotao })

    assert.equal(internos.recorderGetTestSnapshot().totalPassos, 2, 'retomar deveria voltar a permitir captura, preservando o passo anterior à pausa (por contagem)')
  })
})
