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

interface PassoInicialSanitizado {
  titulo: string
  descricao: string
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
  acao_ao_avancar: string
  modo_avanco_interacao: string
  seletor_confirmacao: string | null
  secao: string
}

interface TourPreviewState {
  ativo: boolean
  preview: boolean
  tour: { titulo: string; passos: Array<{ seletor_tipo: string; titulo: string }> } | null
}

interface Internos {
  recorderCapturarClique: (event: { target: unknown }) => void
  recorderCapturarValor: (event: { target: unknown; type: 'input' | 'change' }) => void
  recorderPausarOuContinuar: () => void
  recorderPrepararTesteCaptura: () => void
  recorderGetTestSnapshot: () => Snapshot
  recorderSanitizarPassoInicial: (p: unknown) => PassoInicialSanitizado | null
  iniciarPreviewSeNecessario: () => void
  iniciarGravadorSeNecessario: () => void
  tourState: TourPreviewState
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

// Codifica passos exatamente como buildPreviewUrl/buildGravadorUrl fazem no
// admin (web/src/utils/tour.ts) — base64url de JSON.stringify(passos), sem
// a compactação de campos default (não é preciso replicar aqui: o widget só
// decodifica, quem gera a URL de verdade decide o que compactar).
function encodeBase64UrlPassos(passos: unknown[]): string {
  const base64 = Buffer.from(JSON.stringify(passos), 'utf8').toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function criarInstancia(search = '') {
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
    // recorderDecodificarBase64Url (up_rec_passos/up_preview_passos) usa
    // TextDecoder global — API WHATWG, não builtin de ECMAScript, então não
    // existe sozinha dentro de um contexto vm novo (ao contrário de
    // Uint8Array/JSON, que são core JS e já funcionam sem isso).
    TextDecoder,
  }
  sandbox.window = {
    location: { href: 'http://host/pagina' + search, pathname: '/pagina', search: search, hash: '', origin: 'http://host' },
    history: { pushState() {}, replaceState() {}, back() {} },
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    navigator: { userAgent: 'node-harness' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    // Stub, não o setInterval real do Node — recorderIniciarPollUrl (poll de
    // navegação do gravador) só precisa de uma função que não quebre; um
    // interval de verdade nunca seria limpo neste harness (nenhum teste roda
    // o event loop até ele disparar) e travaria o processo do test runner
    // esperando o loop esvaziar.
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: MutationObserverStub,
    fetch: () => Promise.resolve({ ok: false }),
    Element: ElementStub,
    URL,
    URLSearchParams,
    // recorderDecodificarBase64Url (up_rec_passos/up_preview_passos) precisa
    // de atob de verdade — sem isso falha em silêncio (capturado pelo
    // try/catch de recorderLerPassosIniciais) e os testes de preview
    // pareciam "sem passos válidos" mesmo com um payload correto.
    atob,
    btoa,
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

// recorderSanitizarPassoInicial é a função pura usada por
// recorderLerPassosIniciais pra validar cada item de up_rec_passos ao abrir o
// gravador a partir de um Tour existente ("Editar fluxo no sistema") — nunca
// toca em recorderState, só transforma o objeto recebido. Cobre o bug
// corrigido nesta tarefa: seletor_tipo 'area' virava 'data_cy' por não estar
// na lista de tipos aceitos (só 'css'/'id' eram reconhecidos).
describe('recorderSanitizarPassoInicial — preserva seletor_tipo válido, cai no fallback pra inválido', () => {
  function passoBruto(seletorTipo: unknown) {
    return {
      titulo: 'Passo de teste',
      descricao: 'Descrição',
      seletor_tipo: seletorTipo,
      seletor: '.filtros-agenda',
      tooltip_posicao: 'top',
      acao_ao_avancar: 'clicar_elemento',
      modo_avanco_interacao: 'ao_clicar',
      seletor_confirmacao: null,
      secao: 'Filtros',
    }
  }

  test("seletor_tipo 'area' é preservado (bug corrigido)", () => {
    const internos = criarInstancia()
    const resultado = internos.recorderSanitizarPassoInicial(passoBruto('area'))
    assert.equal(resultado?.seletor_tipo, 'area')
  })

  test("seletor_tipo 'data_cy' é preservado", () => {
    const internos = criarInstancia()
    const resultado = internos.recorderSanitizarPassoInicial(passoBruto('data_cy'))
    assert.equal(resultado?.seletor_tipo, 'data_cy')
  })

  test("seletor_tipo 'id' é preservado", () => {
    const internos = criarInstancia()
    const resultado = internos.recorderSanitizarPassoInicial(passoBruto('id'))
    assert.equal(resultado?.seletor_tipo, 'id')
  })

  test("seletor_tipo 'css' é preservado", () => {
    const internos = criarInstancia()
    const resultado = internos.recorderSanitizarPassoInicial(passoBruto('css'))
    assert.equal(resultado?.seletor_tipo, 'css')
  })

  test('seletor_tipo inválido/ausente cai no fallback data_cy (comportamento já existente, preservado)', () => {
    const internos = criarInstancia()
    assert.equal(internos.recorderSanitizarPassoInicial(passoBruto('tipo_que_nao_existe'))?.seletor_tipo, 'data_cy')
    assert.equal(internos.recorderSanitizarPassoInicial(passoBruto(undefined))?.seletor_tipo, 'data_cy')
    assert.equal(internos.recorderSanitizarPassoInicial(passoBruto(123))?.seletor_tipo, 'data_cy')
  })

  test('demais campos do passo continuam sanitizados normalmente (sem regressão ao redor do fix)', () => {
    const internos = criarInstancia()
    const resultado = internos.recorderSanitizarPassoInicial(passoBruto('area'))
    assert.equal(resultado?.titulo, 'Passo de teste')
    assert.equal(resultado?.seletor, '.filtros-agenda')
    assert.equal(resultado?.tooltip_posicao, 'top')
    assert.equal(resultado?.acao_ao_avancar, 'clicar_elemento')
    assert.equal(resultado?.modo_avanco_interacao, 'ao_clicar')
    assert.equal(resultado?.secao, 'Filtros')
  })

  test('passo sem título retorna null (comportamento já existente, preservado)', () => {
    const internos = criarInstancia()
    assert.equal(internos.recorderSanitizarPassoInicial({ ...passoBruto('area'), titulo: '' }), null)
    assert.equal(internos.recorderSanitizarPassoInicial(null), null)
  })
})

// iniciarPreviewSeNecessario — "Testar estes passos" (Form.tsx): roda os
// passos colados como um Tour temporário 100% em memória, sem tocar
// recorderState (sem gravador, sem barra, sem captura, sem persistência) e
// sem gerar evento (tourState.preview=true já suprime registrarEventoTour/
// tourMarkShown — ver definições em widget.js). Mesmo harness/vm de cima,
// só variando window.location.search por instância.
describe('iniciarPreviewSeNecessario — preview de passos colados, sem gravador/sem tracking', () => {
  test('userpulse_preview=1 com up_preview_passos válidos inicia o Tour em modo preview', () => {
    const passos = [
      { titulo: 'Abrir filtros', seletor_tipo: 'area', seletor: '.filtros-agenda' },
    ]
    const search = '?userpulse_preview=1&up_preview_titulo=Teste%20de%20passos&up_preview_passos=' + encodeBase64UrlPassos(passos)
    const internos = criarInstancia(search)

    internos.iniciarPreviewSeNecessario()

    assert.equal(internos.tourState.ativo, true, 'deveria ter iniciado um tour')
    assert.equal(internos.tourState.preview, true, 'precisa estar marcado como preview (suprime tracking)')
    assert.equal(internos.tourState.tour?.titulo, 'Teste de passos')
    assert.equal(internos.tourState.tour?.passos.length, 1)
  })

  test('preview usa os passos já sanitizados (reaproveita recorderSanitizarPassoInicial)', () => {
    const passos = [
      { titulo: 'Passo com tipo válido', seletor_tipo: 'area', seletor: '.grupo' },
      { titulo: 'Passo com tipo inválido', seletor_tipo: 'tipo_que_nao_existe', seletor: '#x' },
    ]
    const internos = criarInstancia('?userpulse_preview=1&up_preview_passos=' + encodeBase64UrlPassos(passos))

    internos.iniciarPreviewSeNecessario()

    const passosNoTour = internos.tourState.tour?.passos ?? []
    assert.equal(passosNoTour.length, 2)
    assert.equal(passosNoTour[0].seletor_tipo, 'area', "'area' precisa sobreviver à sanitização, igual ao gravador")
    assert.equal(passosNoTour[1].seletor_tipo, 'data_cy', 'tipo inválido cai no mesmo fallback de sempre')
  })

  test('não inicia preview sem passos válidos (up_preview_passos ausente, vazio ou só com passos sem título)', () => {
    const semParametro = criarInstancia('?userpulse_preview=1')
    semParametro.iniciarPreviewSeNecessario()
    assert.equal(semParametro.tourState.ativo, false, 'sem up_preview_passos não deveria iniciar nada')

    const listaVazia = criarInstancia('?userpulse_preview=1&up_preview_passos=' + encodeBase64UrlPassos([]))
    listaVazia.iniciarPreviewSeNecessario()
    assert.equal(listaVazia.tourState.ativo, false, 'lista vazia não deveria iniciar nada')

    const soInvalidos = criarInstancia('?userpulse_preview=1&up_preview_passos=' + encodeBase64UrlPassos([{ seletor_tipo: 'css' }]))
    soInvalidos.iniciarPreviewSeNecessario()
    assert.equal(soInvalidos.tourState.ativo, false, 'passo sem título é descartado pelo sanitizador — nenhum passo válido sobra')
  })

  test('userpulse_recorder=1 junto com userpulse_preview=1 — gravador vence, preview não inicia', () => {
    const passos = [{ titulo: 'Passo', seletor_tipo: 'css', seletor: '#x' }]
    const search = '?userpulse_recorder=1&userpulse_preview=1&up_preview_passos=' + encodeBase64UrlPassos(passos)
    const internos = criarInstancia(search)

    // Mesma ordem de chamada de init() no widget real: gravador primeiro.
    internos.iniciarGravadorSeNecessario()
    internos.iniciarPreviewSeNecessario()

    assert.equal(internos.recorderGetTestSnapshot().ativo, true, 'gravador deveria ter ativado normalmente')
    assert.equal(internos.tourState.ativo, false, 'preview não deveria iniciar com o gravador já ativo')
  })

  test('preview nunca ativa recorderState (sem gravador, sem barra, sem captura)', () => {
    const passos = [{ titulo: 'Passo', seletor_tipo: 'css', seletor: '#x' }]
    const internos = criarInstancia('?userpulse_preview=1&up_preview_passos=' + encodeBase64UrlPassos(passos))

    internos.iniciarPreviewSeNecessario()

    assert.equal(internos.tourState.ativo, true, 'pré-condição: preview iniciou')
    const snapshot = internos.recorderGetTestSnapshot()
    assert.equal(snapshot.ativo, false, 'recorderState.ativo precisa continuar false — preview nunca é gravador')
    assert.equal(snapshot.totalPassos, 0, 'nenhum passo deveria ter ido pro recorderState')
  })
})
