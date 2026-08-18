import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE, sem module.exports) — carregado
// via vm com stubs mínimos, mesmo padrão de widgetTourSegmentacao.test.ts e
// widgetDestaqueElemento.test.ts.
//
// Bug coberto aqui: campanha modal_automatica corretamente devolvida por
// /api/widget/candidatas (usuário identificado, servidor autoritativo —
// política ate_responder_ou_confirmar) nunca reaparecia depois de: abrir →
// fechar no X → navegar (SPA) → voltar pra tela elegível. Causa raiz NÃO era
// wasShown/mostrar_uma_vez (já bypassado corretamente pra usuario_id desde
// a correção anterior) — era destaqueElementoSincronizarSelecao, chamada
// incondicionalmente ao final de evaluateCampaigns() a cada reavaliação
// (mesmo quando a candidata da vez é modal, não destaque_elemento), limpando
// `state.timer` achando que era um agendamento de destaque desatualizado.
// Só que scheduleAutoOpen() usa esse MESMO `state.timer` pro auto-open do
// modal — o timer do modal recém-agendado era cancelado antes de disparar,
// então a modal nunca chegava a abrir de novo, mesmo com a candidata
// corretamente selecionada. Corrigido separando os dois timers
// (state.timer = modal; state.destaqueTimer = destaque_elemento).
type Campanha = {
  id?: string
  modo_exibicao?: string
  modo_identificacao?: string
  gatilho?: string
  tela?: string
  url_contem?: string
  data_cy?: string
  mostrar_uma_vez?: boolean
  always_show_user?: boolean
  permitir_fechar_modal?: boolean
  atraso_ms?: number
  titulo?: string
  descricao?: string
  destaques?: unknown[]
}
type ConfigWidget = { slug?: string; sistema?: string; tela?: string; usuario_id?: string; contexto?: Record<string, unknown> | null }
type EvaluateCampaigns = () => void
type HandleUrlChange = (forcarReavaliacao?: boolean) => void
type ConfigSetTestState = (parcial: Partial<ConfigWidget>) => void
type WasShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => boolean
type MarkShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => void
type DoClose = () => void
type UserPulseInit = (config: Record<string, unknown>) => void

let evaluateCampaigns: EvaluateCampaigns
let handleUrlChange: HandleUrlChange
let configSetTestState: ConfigSetTestState
let wasShown: WasShown
let markShown: MarkShown
let doClose: DoClose
let userPulseInit: UserPulseInit

let candidatasResponse: Campanha[] = []
let localStorageStore: Map<string, string>
let chamadasRastreamento: Array<{ url: string; body: Record<string, unknown> }> = []

// Fila fake de window.setTimeout/clearTimeout — nunca dispara sozinha; só o
// teste decide quando "o tempo passou", mesmo padrão de
// widgetDestaqueElemento.test.ts (dispararTimersPendentesDestaque).
let timersPendentes: Array<{ id: number; cb: () => void }> = []
let proximoTimerId = 1
function dispararTimersPendentes() {
  const pendentes = timersPendentes.slice()
  timersPendentes = []
  for (const t of pendentes) t.cb()
}

// Espera um tick de microtask real (fora da vm) — necessário depois de
// qualquer ação que dispare fetch(), já que o fetch fake resolve via
// Promise, e o .then() do widget só roda depois do síncrono atual terminar.
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

// Último root criado por document.createElement (resetRoot() do modal) — só
// pra inspecionar className (up-widget-overlay = aberto) sem expor `state`
// inteiro do widget.
let ultimoRootModal: { id: string; className: string; innerHTML: string; isConnected: boolean } | null = null
function criarFakeRootModal() {
  const root = {
    id: '',
    className: '',
    innerHTML: '',
    style: {} as Record<string, string>,
    isConnected: true,
    remove() { root.isConnected = false },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    querySelectorAll(): unknown[] { return [] },
  }
  ultimoRootModal = root
  return root
}

let sandboxCompartilhado: { window: Record<string, unknown> } | null = null

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    // widget.js chama fetch(...) sem prefixo window — bare global call,
    // precisa estar aqui em cima (mesma observação de
    // widgetDestaqueElemento.test.ts). Só /api/widget/candidatas devolve
    // dado controlável pelo teste; qualquer outro endpoint (aparência, tour,
    // jornadas...) devolve ok:false — todo consumidor desses endpoints em
    // widget.js já trata isso como "nada disponível" (nunca lança).
    // bindSpaListeners() (chamada por init()) monkey-patcha history.pushState/
    // replaceState via referência bare (sem window.), mesma observação do
    // fetch acima — precisa existir aqui em cima. Nunca usado de verdade
    // pelos testes (navegação é simulada via handleUrlChange direto).
    history: { pushState() {}, replaceState() {} },
    fetch: (url: string, opts?: { body?: string }) => {
      chamadasRastreamento.push({ url, body: opts?.body ? JSON.parse(opts.body) : {} })
      if (url.indexOf('/api/widget/candidatas') !== -1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(candidatasResponse) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    },
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      getElementById: () => null,
      createElement: () => criarFakeRootModal(),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
      body: { appendChild() {}, style: {} as Record<string, string> },
      head: { appendChild() {} },
      // aplicarAparenciaCss() (aparência/cor do tenant) sempre escreve as
      // custom properties aqui, mesmo sem aparência real configurada
      // (fallback = removeProperty) — sem isso, o fetch de aparência
      // (sempre disparado por init()) lança de forma assíncrona depois que
      // o teste já terminou, virando unhandledRejection e derrubando o
      // arquivo inteiro mesmo com todo teste individual passando.
      documentElement: { style: { removeProperty() {}, setProperty() {} } },
    },
  }
  localStorageStore = new Map<string, string>()
  sandbox.window = {
    location: { pathname: '/app/home', href: 'http://localhost/app/home', search: '', hash: '' },
    localStorage: {
      getItem: (chave: string) => (localStorageStore.has(chave) ? localStorageStore.get(chave) : null),
      setItem: (chave: string, valor: string) => { localStorageStore.set(chave, valor) },
      removeItem: (chave: string) => { localStorageStore.delete(chave) },
    },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
    // Fake, nunca dispara sozinho — ver timersPendentes/dispararTimersPendentes.
    setTimeout: (cb: () => void) => { const id = proximoTimerId++; timersPendentes.push({ id, cb }); return id },
    clearTimeout: (id: number) => { timersPendentes = timersPendentes.filter(t => t.id !== id) },
    scrollTo() {},
    requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
    navigator: { userAgent: 'node:test' },
    // getDevice() (registrarEvento) lê window.innerWidth || document.documentElement.clientWidth
    // — sem isso, document.documentElement (undefined no mock) lança dentro
    // do try/catch de registrarEvento, o erro é engolido silenciosamente e
    // NENHUM /api/widget/evento chega a ser enviado (custou uma sessão de
    // depuração pra achar: state.open virava true normalmente, só o
    // rastreamento é que sumia sem erro visível).
    innerWidth: 1024,
    pageYOffset: 0,
  }
  sandboxCompartilhado = sandbox as unknown as { window: Record<string, unknown> }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: {
      init?: UserPulseInit
      _internal?: {
        evaluateCampaigns?: EvaluateCampaigns
        handleUrlChange?: HandleUrlChange
        configSetTestState?: ConfigSetTestState
        wasShown?: WasShown
        markShown?: MarkShown
        doClose?: DoClose
      }
    }
  }).UserPulse
  assert.equal(typeof UserPulse?.init, 'function', 'window.UserPulse.init não foi exposta por widget.js')
  userPulseInit = UserPulse!.init as UserPulseInit
  evaluateCampaigns = UserPulse!._internal!.evaluateCampaigns as EvaluateCampaigns
  handleUrlChange = UserPulse!._internal!.handleUrlChange as HandleUrlChange
  configSetTestState = UserPulse!._internal!.configSetTestState as ConfigSetTestState
  wasShown = UserPulse!._internal!.wasShown as WasShown
  markShown = UserPulse!._internal!.markShown as MarkShown
  doClose = UserPulse!._internal!.doClose as DoClose
  assert.equal(typeof evaluateCampaigns, 'function')
  assert.equal(typeof handleUrlChange, 'function')
  assert.equal(typeof configSetTestState, 'function')
  assert.equal(typeof wasShown, 'function')
  assert.equal(typeof markShown, 'function')
  assert.equal(typeof doClose, 'function')
})

// init() de verdade zera state.campanha/open/timer/destaqueTimer e recria
// o root (ver comentário em widget.js, dentro de init()) — é o jeito mais
// realista de garantir sessão limpa entre testes, igual a um reload de
// página, sem precisar expor o `state` inteiro do widget.
beforeEach(async () => {
  candidatasResponse = []
  timersPendentes = []
  proximoTimerId = 1
  chamadasRastreamento = []
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = '/app/home'
  win.location.href = 'http://localhost/app/home'
  userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: '' })
  // init() dispara suas próprias buscas assíncronas (candidatas/tour/
  // aparência) usando o candidatasResponse=[] de agora — espera elas
  // drenarem antes do corpo do teste rodar; senão, quando essa promise
  // pendente finalmente resolve (mais tarde, já dentro do teste), ela lê o
  // candidatasResponse NOVO que o teste setou depois, corrida com
  // evaluateUrlCampaigns/evaluateCampaigns de handleUrlChange().
  await tick()
  await tick()
  dispararTimersPendentes()
})

function irParaUrl(pathname: string) {
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = pathname
  win.location.href = 'http://localhost' + pathname
}

function campanhaModalUrlContem(over: Partial<Campanha> = {}): Campanha {
  return {
    id: 'camp-modal-1',
    modo_exibicao: 'modal_automatica',
    modo_identificacao: 'url_contem',
    gatilho: 'ao_abrir_tela',
    url_contem: '/app/home',
    tela: '',
    mostrar_uma_vez: true,
    permitir_fechar_modal: true,
    atraso_ms: 10,
    titulo: 'Novidade',
    descricao: 'Descrição',
    ...over,
  }
}

// Dispara handleUrlChange (debounce de 200ms, fake) + aguarda os 2 fetches
// de candidatas (evaluateUrlCampaigns + evaluateCampaigns) resolverem +
// dispara o timer de scheduleAutoOpen (atraso_ms, fake) — sequência
// completa de uma navegação SPA até a modal (se elegível) efetivamente abrir.
async function navegarEAguardarAvaliacao() {
  handleUrlChange(true)
  dispararTimersPendentes() // debounce de 200ms
  await tick()
  await tick()
  dispararTimersPendentes() // scheduleAutoOpen (atraso_ms), se alguma candidata foi selecionada
}

describe('reexibição de campanha modal_automatica — usuário identificado (bug corrigido)', () => {
  test('1. candidata retornada pelo servidor -> mostra a modal', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    candidatasResponse = [campanhaModalUrlContem()]

    await navegarEAguardarAvaliacao()

    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'modal deveria estar aberta depois da candidata ser selecionada e o timer disparar')
    const visualizacoes = chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/evento') !== -1 && c.body.tipo_evento === 'visualizacao')
    assert.equal(visualizacoes.length, 1, 'abrir a modal deve registrar exatamente 1 visualização')
  })

  test('2 e 3. fecha no X -> navega -> volta -> a MESMA candidata reaparece', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    candidatasResponse = [campanhaModalUrlContem()]

    await navegarEAguardarAvaliacao()
    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'pré-condição: modal aberta na primeira exibição')

    // 2. fecha no X — só desmonta a exibição atual (nunca marca como vista
    // pra usuário identificado; backend continua sendo a fonte de verdade).
    doClose()
    assert.doesNotMatch(ultimoRootModal!.className, /up-widget-overlay/, 'X deve fechar a modal imediatamente')

    // Navega pra outra tela via SPA (a candidata não é elegível lá).
    irParaUrl('/app/outra-tela')
    await navegarEAguardarAvaliacao()
    assert.doesNotMatch(ultimoRootModal!.className, /up-widget-overlay/, 'não deve reabrir numa tela onde a candidata não é elegível')

    // 3. Volta pra /app/home — servidor devolve a MESMA candidata de novo
    // (ver evidência do bug: /candidatas já retornava; o bug era só no widget).
    irParaUrl('/app/home')
    await navegarEAguardarAvaliacao()

    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'BUG: a modal deveria reabrir ao voltar pra uma tela elegível com a mesma candidata retornada pelo servidor')
  })

  test('4. mostrar_uma_vez=true não bloqueia localmente um usuário identificado (mesmo depois de markShown ser tentado)', () => {
    const campanha = campanhaModalUrlContem({ mostrar_uma_vez: true })
    const configIdentificado: ConfigWidget = { sistema: 'erp', tela: 'home', usuario_id: 'user-2' }
    markShown(campanha, configIdentificado)
    assert.equal(wasShown(campanha, configIdentificado), false, 'usuario_id presente: mostrar_uma_vez nunca é decidido pelo localStorage')
  })

  test('5. simples visualização (abrir a modal) não bloqueia reexibição futura do mesmo usuário identificado', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-3' })
    candidatasResponse = [campanhaModalUrlContem()]
    await navegarEAguardarAvaliacao()
    assert.match(ultimoRootModal!.className, /up-widget-overlay/)

    // Só visualizou (nunca respondeu feedback nem confirmou leitura) —
    // wasShown continua false pro mesmo usuário/campanha.
    assert.equal(wasShown(campanhaModalUrlContem(), { sistema: 'erp', tela: 'home', usuario_id: 'user-3' }), false)
  })

  test('7. resposta/confirmação continuam controladas pelo servidor (widget nunca decide isso sozinho pra identificado)', () => {
    // Não existe, no cliente, nenhum caminho que marque "respondeu" localmente
    // pra usuário identificado — wasShown/markShown são as duas únicas
    // funções que decidiriam bloqueio local, e ambas retornam cedo com
    // usuario_id presente, então NENHUMA interação client-side (visualizar,
    // fechar, ou mesmo tentar markShown depois de uma resposta) grava nada
    // que impeça a próxima /candidatas de ser a fonte de verdade.
    const campanha = campanhaModalUrlContem({ exige_confirmacao_leitura: true } as Partial<Campanha>)
    const configIdentificado: ConfigWidget = { sistema: 'erp', tela: 'home', usuario_id: 'user-4' }
    markShown(campanha, configIdentificado)
    assert.equal(wasShown(campanha, configIdentificado), false)
  })
})

describe('reexibição de campanha modal_automatica — usuário anônimo (fallback local preservado)', () => {
  test('6. sem usuario_id, mostrar_uma_vez=true + já visto no localStorage continua bloqueando', () => {
    const campanha = campanhaModalUrlContem({ id: 'camp-anonimo-1' })
    const configAnonimo: ConfigWidget = { sistema: 'erp', tela: 'home' }
    assert.equal(wasShown(campanha, configAnonimo), false, 'antes de markShown, ainda não foi visto')
    markShown(campanha, configAnonimo)
    assert.equal(wasShown(campanha, configAnonimo), true, 'depois de markShown, anônimo continua bloqueado (fallback local preservado)')
  })

  test('mostrar_uma_vez=false nunca bloqueia, mesmo anônimo', () => {
    const campanha = campanhaModalUrlContem({ id: 'camp-anonimo-2', mostrar_uma_vez: false })
    const configAnonimo: ConfigWidget = { sistema: 'erp', tela: 'home' }
    markShown(campanha, configAnonimo)
    assert.equal(wasShown(campanha, configAnonimo), false)
  })
})

describe('reexibição — sem regressão em destaque_elemento nem em tracking/dispensa', () => {
  test('8. destaque_elemento identificado continua sem bloqueio local (mesmo comportamento de antes desta correção)', () => {
    const destaque: Campanha = { id: 'camp-destaque-1', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const configIdentificado: ConfigWidget = { sistema: 'erp', tela: 'home', usuario_id: 'user-5' }
    markShown(destaque, configIdentificado)
    assert.equal(wasShown(destaque, configIdentificado), false)
  })

  test('8b. destaque_elemento anônimo continua respeitando o fallback local (mostrar_uma_vez)', () => {
    const destaque: Campanha = { id: 'camp-destaque-2', modo_exibicao: 'destaque_elemento', mostrar_uma_vez: true, permitir_fechar_modal: true }
    const configAnonimo: ConfigWidget = { sistema: 'erp', tela: 'home' }
    markShown(destaque, configAnonimo)
    assert.equal(wasShown(destaque, configAnonimo), true)
  })

  test('9. abrir a modal continua gerando exatamente 1 evento de visualização (sem duplicar, sem perder o tracking de sempre)', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-6' })
    candidatasResponse = [campanhaModalUrlContem({ id: 'camp-tracking-1' })]

    await navegarEAguardarAvaliacao()

    const eventos = chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/evento') !== -1)
    assert.equal(eventos.length, 1)
    assert.equal(eventos[0].body.tipo_evento, 'visualizacao')
    assert.equal(eventos[0].body.campanha_id, 'camp-tracking-1')
  })
})
