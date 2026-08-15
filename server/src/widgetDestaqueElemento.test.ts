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
type DestaqueElementoMutacoesApenasNoRoot = (root: { contains: (node: unknown) => boolean }, mutationsList: Array<{ target: unknown }>) => boolean
type DestaqueElementoObterViewport = () => Viewport
type DestaqueElementoMontar = (campanha: Campanha, config: ConfigWidget, alvo: unknown) => void
type DestaqueElementoResolverItens = (campanha: Campanha | null | undefined) => DestaqueItem[]
type DestaqueElementoMontarTodos = (campanha: Campanha, config: ConfigWidget) => void
type ClickEvent = { target: { closest: (seletor: string) => { getAttribute: (chave: string) => string | null } | null } }
type ClickListener = (event: ClickEvent) => void
type DestaqueElementoGetTestClickListener = (indice?: number) => ClickListener | null

let destaqueElementoSeletorSeguro: DestaqueElementoSeletorSeguro
let destaqueElementoLocalizarAlvo: DestaqueElementoLocalizarAlvo
let destaqueElementoCalcularPosicao: DestaqueElementoCalcularPosicao
let destaqueElementoCalcularPosicaoTooltip: DestaqueElementoCalcularPosicaoTooltip
let destaqueElementoCalcularBeacon: DestaqueElementoCalcularBeacon
let destaqueElementoRectsIguais: DestaqueElementoRectsIguais
let destaqueElementoMutacoesApenasNoRoot: DestaqueElementoMutacoesApenasNoRoot
let destaqueElementoObterViewport: DestaqueElementoObterViewport
let destaqueElementoMontar: DestaqueElementoMontar
let destaqueElementoResolverItens: DestaqueElementoResolverItens
let destaqueElementoMontarTodos: DestaqueElementoMontarTodos
let destaqueElementoGetTestClickListener: DestaqueElementoGetTestClickListener
let wasShown: WasShown
let markShown: MarkShown
// Último root fake criado por document.createElement (ver criarFakeRootDestaque
// abaixo) — só pra inspecionar root.style.top/left aplicados de verdade após
// destaqueElementoMontar/estabilização, sem expor destaqueElementoState.
let ultimoRootDestaque: { style: Record<string, string>; contains: (node: unknown) => boolean } | null = null
// Acumula TODOS os roots já criados (nunca é resetado sozinho) — testes de
// múltiplos destaques usam .length (delta antes/depois da própria ação) pra
// confirmar quantas instâncias foram montadas de verdade.
let todasAsRaizesDestaque: Array<{ style: Record<string, string> }> = []
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
let presentes: Set<string>
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
  // Fake "elemento" pra document.createElement('div') — usado só pelo root
  // do destaque (destaqueElementoMontar). innerHTML/querySelector não fazem
  // parsing de HTML de verdade: badge/beacon são fixos, e o tooltip só
  // "existe" (via querySelector) quando a string de innerHTML contém a
  // classe correspondente — suficiente pra exercitar destaqueElementoRender/
  // Reposicionar de ponta a ponta sem precisar de um DOM real.
  function criarFakeRootDestaque() {
    const listeners: Record<string, Array<(event: unknown) => void>> = {}
    let html = ''
    const badgeEl = { offsetWidth: 160, offsetHeight: 24, getBoundingClientRect: () => ({ top: 50, left: 200, right: 360, bottom: 74, width: 160, height: 24 }) }
    const tooltipEl = { offsetWidth: 260, offsetHeight: 150, style: {} as Record<string, string>, getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 260, height: 150 }) }
    const beaconEl = { style: {} as Record<string, string> }
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
      set innerHTML(v: string) { html = v },
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
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      querySelectorAll: () => [],
      querySelector: (seletor: string) => {
        const m = /^\[data-cy="([\s\S]*)"\]$/.exec(seletor)
        if (!m) return null
        return presentes.has(m[1])
          ? { tagName: 'BUTTON', getBoundingClientRect: () => ({ top: 100, left: 100, right: 240, bottom: 140, width: 140, height: 40 }) }
          : null
      },
      getElementById: () => null,
      createElement: () => criarFakeRootDestaque(),
      addEventListener() {},
      removeEventListener() {},
      body: { contains: () => true, appendChild() {} },
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
    open() {},
    history: { pushState() {}, replaceState() {} },
    CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
  }
  sandboxCompartilhado = sandbox as unknown as { document: Record<string, unknown>; window: Record<string, unknown> }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: {
      _internal?: {
        destaqueElementoSeletorSeguro?: DestaqueElementoSeletorSeguro
        destaqueElementoLocalizarAlvo?: DestaqueElementoLocalizarAlvo
        destaqueElementoCalcularPosicao?: DestaqueElementoCalcularPosicao
        destaqueElementoCalcularPosicaoTooltip?: DestaqueElementoCalcularPosicaoTooltip
        destaqueElementoCalcularBeacon?: DestaqueElementoCalcularBeacon
        destaqueElementoRectsIguais?: DestaqueElementoRectsIguais
        destaqueElementoMutacoesApenasNoRoot?: DestaqueElementoMutacoesApenasNoRoot
        destaqueElementoObterViewport?: DestaqueElementoObterViewport
        destaqueElementoMontar?: DestaqueElementoMontar
        destaqueElementoResolverItens?: DestaqueElementoResolverItens
        destaqueElementoMontarTodos?: DestaqueElementoMontarTodos
        destaqueElementoGetTestClickListener?: DestaqueElementoGetTestClickListener
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
  const mutacoesApenasNoRootFn = UserPulse?._internal?.destaqueElementoMutacoesApenasNoRoot
  const obterViewportFn = UserPulse?._internal?.destaqueElementoObterViewport
  const montarFn = UserPulse?._internal?.destaqueElementoMontar
  const resolverItensFn = UserPulse?._internal?.destaqueElementoResolverItens
  const montarTodosFn = UserPulse?._internal?.destaqueElementoMontarTodos
  const getTestClickListenerFn = UserPulse?._internal?.destaqueElementoGetTestClickListener
  const wasShownFn = UserPulse?._internal?.wasShown
  const markShownFn = UserPulse?._internal?.markShown
  assert.equal(typeof seletorFn, 'function', 'window.UserPulse._internal.destaqueElementoSeletorSeguro não foi exposta por widget.js')
  assert.equal(typeof localizarFn, 'function', 'window.UserPulse._internal.destaqueElementoLocalizarAlvo não foi exposta por widget.js')
  assert.equal(typeof calcularPosicaoFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularPosicao não foi exposta por widget.js')
  assert.equal(typeof calcularPosicaoTooltipFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularPosicaoTooltip não foi exposta por widget.js')
  assert.equal(typeof calcularBeaconFn, 'function', 'window.UserPulse._internal.destaqueElementoCalcularBeacon não foi exposta por widget.js')
  assert.equal(typeof rectsIguaisFn, 'function', 'window.UserPulse._internal.destaqueElementoRectsIguais não foi exposta por widget.js')
  assert.equal(typeof mutacoesApenasNoRootFn, 'function', 'window.UserPulse._internal.destaqueElementoMutacoesApenasNoRoot não foi exposta por widget.js')
  assert.equal(typeof obterViewportFn, 'function', 'window.UserPulse._internal.destaqueElementoObterViewport não foi exposta por widget.js')
  assert.equal(typeof montarFn, 'function', 'window.UserPulse._internal.destaqueElementoMontar não foi exposta por widget.js')
  assert.equal(typeof resolverItensFn, 'function', 'window.UserPulse._internal.destaqueElementoResolverItens não foi exposta por widget.js')
  assert.equal(typeof montarTodosFn, 'function', 'window.UserPulse._internal.destaqueElementoMontarTodos não foi exposta por widget.js')
  assert.equal(typeof getTestClickListenerFn, 'function', 'window.UserPulse._internal.destaqueElementoGetTestClickListener não foi exposta por widget.js')
  assert.equal(typeof wasShownFn, 'function', 'window.UserPulse._internal.wasShown não foi exposta por widget.js')
  assert.equal(typeof markShownFn, 'function', 'window.UserPulse._internal.markShown não foi exposta por widget.js')
  destaqueElementoSeletorSeguro = seletorFn as DestaqueElementoSeletorSeguro
  destaqueElementoLocalizarAlvo = localizarFn as DestaqueElementoLocalizarAlvo
  destaqueElementoCalcularPosicao = calcularPosicaoFn as DestaqueElementoCalcularPosicao
  destaqueElementoCalcularPosicaoTooltip = calcularPosicaoTooltipFn as DestaqueElementoCalcularPosicaoTooltip
  destaqueElementoCalcularBeacon = calcularBeaconFn as DestaqueElementoCalcularBeacon
  destaqueElementoRectsIguais = rectsIguaisFn as DestaqueElementoRectsIguais
  destaqueElementoMutacoesApenasNoRoot = mutacoesApenasNoRootFn as DestaqueElementoMutacoesApenasNoRoot
  destaqueElementoObterViewport = obterViewportFn as DestaqueElementoObterViewport
  destaqueElementoMontar = montarFn as DestaqueElementoMontar
  destaqueElementoResolverItens = resolverItensFn as DestaqueElementoResolverItens
  destaqueElementoMontarTodos = montarTodosFn as DestaqueElementoMontarTodos
  destaqueElementoGetTestClickListener = getTestClickListenerFn as DestaqueElementoGetTestClickListener
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
