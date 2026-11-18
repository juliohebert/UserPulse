import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Frequência "A cada 24 horas" no widget (politica_reexibicao=
// 'reexibir_a_cada_24h'): fechamento manual registrado (evento no servidor p/
// identificado; timestamp em localStorage p/ anônimo), bloqueio por instante
// exato de 24h, sem timer/polling. widget.js é carregado via vm (mesmo
// padrão de widgetCampanhaModalReexibicao.test.ts) com relógio controlável.
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
  regras?: Array<{ modo_identificacao?: string; tela?: string | null; url_contem?: string | null; data_cy?: string | null }>
  regras_bloqueadas?: string[]
  politica_reexibicao?: string
}
type ConfigWidget = { slug?: string; sistema?: string; tela?: string; usuario_id?: string; contexto?: Record<string, unknown> | null }
type EvaluateCampaigns = () => void
type HandleUrlChange = (forcarReavaliacao?: boolean) => void
type ConfigSetTestState = (parcial: Partial<ConfigWidget>) => void
type WasShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => boolean
type MarkShown = (campanha: Campanha, config: ConfigWidget, itemId?: string | null) => void
type DoClose = (fechamentoManual?: boolean) => void
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

// Relógio controlável: Date.now()/new Date() do widget (dentro da vm) leem
// `relogio`. Nunca avança sozinho — o teste decide quanto tempo passou.
const T0 = Date.parse('2026-07-06T10:00:00.000Z')
let relogio = T0
let seqReset = 0
const RealDate = Date
class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    super(...((args.length ? args : [relogio]) as [number]))
  }
  static now() { return relogio }
}

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console,
    Date: FakeDate,
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
  relogio = T0
  candidatasResponse = []
  timersPendentes = []
  localStorageStore.clear()
  proximoTimerId = 1
  chamadasRastreamento = []
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = '/app/home'
  win.location.href = 'http://localhost/app/home'
  // usuario_id único: config efetiva diferente da do teste anterior => init() de
  // verdade (sem o guard de re-init redundante, que preservaria modal aberta).
  userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'reset-' + (++seqReset) })
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

// Simula o host chamando window.UserPulse.init() de novo (re-init por rota):
// dispara as buscas assíncronas do init() e o timer de scheduleAutoOpen.
async function reinit(config: Record<string, unknown>) {
  userPulseInit(config)
  // init() encadeia aparência + candidatas por microtasks; drena com folga e
  // dispara timers pendentes a cada volta (scheduleAutoOpen / debounces).
  for (let i = 0; i < 5; i++) {
    await tick()
    dispararTimersPendentes()
  }
}


const H = 3_600_000
const DIA = 24 * H
const POLITICA = 'reexibir_a_cada_24h'

// id único por teste: o bloqueio de fechamento manual em memória
// (campanhaFechadaManualmente) sobrevive a um init() redundante com a mesma
// config/URL — é a proteção que queremos preservar, então cada teste usa a
// sua própria campanha em vez de depender de estado limpo.
let ID = 'camp-24h'
let seq = 0
beforeEach(() => { ID = 'camp-24h-' + (++seq) })
const chaveAnonima = (id = ID, ctx = 'erp:home') => 'userpulse:shown:' + id + ':' + ctx

function campanha24h(over: Partial<Campanha> = {}): Campanha {
  return {
    id: ID,
    modo_exibicao: 'modal_automatica',
    modo_identificacao: 'url_contem',
    gatilho: 'ao_abrir_tela',
    url_contem: '/app/home',
    tela: '',
    mostrar_uma_vez: false, // o form grava false para esta frequência
    permitir_fechar_modal: true,
    atraso_ms: 10,
    titulo: 'Indique um amigo',
    descricao: 'Campanha recorrente',
    politica_reexibicao: POLITICA,
    ...over,
  }
}

const ANONIMO: ConfigWidget = { sistema: 'erp', tela: 'home' }
const identificado = (id: string): ConfigWidget => ({ sistema: 'erp', tela: 'home', usuario_id: id })
const modalAberta = () => /up-widget-overlay/.test(ultimoRootModal!.className)
const eventosDoTipo = (tipo: string) =>
  chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/evento') !== -1 && c.body.tipo_evento === tipo)
const chavesLocais = () => Array.from(localStorageStore.keys()).filter(k => k.indexOf('userpulse:shown:') === 0)

// Simula F5 de verdade: o estado em memória do widget (inclusive o bloqueio
// de fechamento manual) NÃO sobrevive a um reload completo — só o que está
// em localStorage/servidor. No vm isso é: init() com outra config (zera o
// estado) e depois init() com a config real.
async function refreshPagina(config: ConfigWidget, candidatas: Campanha[]) {
  candidatasResponse = []
  userPulseInit({ sistema: '__refresh__', tela: '__refresh__' })
  for (let i = 0; i < 3; i++) { await tick(); dispararTimersPendentes() }
  candidatasResponse = candidatas
  await reinit(config as Record<string, unknown>)
}

async function abrir(c: Campanha, config: ConfigWidget) {
  configSetTestState(config)
  candidatasResponse = [c]
  await navegarEAguardarAvaliacao()
  assert.equal(modalAberta(), true, 'pré-condição: modal aberta')
}

describe('24h — usuário anônimo (timestamp em localStorage)', () => {
  test('primeira exibição abre e grava o instante da exibição na MESMA chave existente', async () => {
    await abrir(campanha24h(), ANONIMO)
    assert.deepEqual(chavesLocais(), [chaveAnonima()])
    assert.equal(localStorageStore.get(chavesLocais()[0]), String(T0))
  })

  test('fechamento manual sobrescreve com o instante do fechamento e NÃO envia evento (sem rastreamento extra)', async () => {
    await abrir(campanha24h(), ANONIMO)
    relogio = T0 + 5 * 60_000
    doClose(true)
    assert.equal(modalAberta(), false)
    assert.equal(localStorageStore.get(chavesLocais()[0]), String(T0 + 5 * 60_000))
    assert.equal(eventosDoTipo('fechamento_manual').length, 0)
  })

  test('bloqueia com 23h59min e 23h59min59s999ms; libera exatamente com 24h (refresh real em cada instante)', async () => {
    const c = campanha24h()
    await abrir(c, ANONIMO)
    const fechouEm = T0 + 5 * 60_000
    relogio = fechouEm
    doClose(true)
    for (const [instante, rotulo] of [[fechouEm + DIA - 60_000, '23h59min'], [fechouEm + DIA - 1, '23h59min59s999ms']] as const) {
      relogio = instante
      await refreshPagina(ANONIMO, [c])
      assert.equal(modalAberta(), false, rotulo)
    }
    assert.equal(localStorageStore.get(chaveAnonima()), String(fechouEm), 'tentativas bloqueadas não reiniciam o intervalo')
    relogio = fechouEm + DIA
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), true, 'exatamente 24h')
  })

  test('atualizar a página (init) antes de 24h NÃO reabre; depois de 24h reabre', async () => {
    const c = campanha24h()
    await abrir(c, ANONIMO)
    relogio = T0 + 10 * 60_000
    doClose(true)

    relogio = T0 + 10 * 60_000 + 2 * H
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), false, 'refresh dentro do intervalo')

    relogio = T0 + 10 * 60_000 + DIA
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), true, 'refresh após 24h')
  })

  test('novo fechamento reinicia o ciclo', async () => {
    const c = campanha24h()
    await abrir(c, ANONIMO)
    relogio = T0 + 5 * 60_000
    doClose(true)

    relogio = T0 + 5 * 60_000 + DIA // volta
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), true)
    relogio += 4 * H // fecha 4h depois
    const segundoFechamento = relogio
    doClose(true)

    relogio = segundoFechamento + DIA - 1
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), false, 'ainda dentro do novo intervalo')
    relogio = segundoFechamento + DIA
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), true)
  })

  test('interrompida por navegação SEM fechar: o instante da exibição protege (sem reabertura imediata)', async () => {
    const c = campanha24h()
    await abrir(c, ANONIMO)
    doClose() // não manual (navegação/auto-close)
    relogio = T0 + 2 * 60_000
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), false)
    relogio = T0 + DIA
    await refreshPagina(ANONIMO, [c])
    assert.equal(modalAberta(), true)
  })

  test('registro legado "1" e timestamps inválidos/futuros NUNCA contam como fechamento recente', () => {
    const c = campanha24h()
    const chave = chaveAnonima()
    for (const valor of ['1', 'true', '', 'abc', '-5', String(T0 + 3 * DIA)]) {
      localStorageStore.set(chave, valor)
      assert.equal(wasShown(c, ANONIMO), false, 'valor ' + JSON.stringify(valor))
    }
  })

  test('nunca bloqueia permanentemente: passados 24h sem nenhuma ação o ciclo recomeça', () => {
    const c = campanha24h()
    markShown(c, ANONIMO)
    relogio = T0 + 30 * DIA
    assert.equal(wasShown(c, ANONIMO), false)
  })

  test('isolamento: outra campanha, outro sistema/tela e múltiplas regras usam chaves distintas', () => {
    const a = campanha24h({ id: 'camp-A' })
    const b = campanha24h({ id: 'camp-B' })
    markShown(a, ANONIMO)
    assert.equal(wasShown(a, ANONIMO), true)
    assert.equal(wasShown(b, ANONIMO), false, 'outra campanha')
    assert.equal(wasShown(a, { sistema: 'crm', tela: 'home' }), false, 'outro sistema')
    assert.equal(wasShown(a, { sistema: 'erp', tela: 'agenda' }), false, 'outra tela')

    const regras = [
      { modo_identificacao: 'sistema_tela', tela: 'home' },
      { modo_identificacao: 'sistema_tela', tela: 'agenda' },
    ]
    const m = campanha24h({ id: 'camp-M', regras }) as Campanha & { _regraCasada?: unknown }
    m._regraCasada = regras[0]
    markShown(m, ANONIMO)
    assert.equal(wasShown(m, ANONIMO), true)
    m._regraCasada = regras[1]
    assert.equal(wasShown(m, ANONIMO), false, 'fechar/ver em uma regra não bloqueia a outra')
    assert.ok(chavesLocais().some(k => k.indexOf(':r:st|home') !== -1))
  })

  test('always_show_user ignora o bloqueio', () => {
    const c = campanha24h({ always_show_user: true })
    markShown(c, ANONIMO)
    assert.equal(wasShown(c, ANONIMO), false)
    assert.equal(chavesLocais().length, 0)
  })

  test('sem polling: depois de 24h a modal fechada NÃO reaparece sozinha (só em reavaliação legítima)', async () => {
    const c = campanha24h()
    await abrir(c, ANONIMO)
    doClose(true)
    relogio += 2 * DIA
    candidatasResponse = [c]
    dispararTimersPendentes()
    await tick()
    dispararTimersPendentes()
    assert.equal(modalAberta(), false)
  })
})

describe('24h — usuário identificado (histórico persistido no servidor)', () => {
  test('fechamento manual registra EXATAMENTE 1 evento fechamento_manual com campanha, usuário e contexto', async () => {
    await abrir(campanha24h(), identificado('u-1'))
    chamadasRastreamento = []
    doClose(true)
    doClose(true) // duplo clique / segundo disparo
    const evs = eventosDoTipo('fechamento_manual')
    assert.equal(evs.length, 1)
    assert.equal(evs[0].body.campanha_id, ID)
    assert.equal(evs[0].body.usuario_id, 'u-1')
    assert.equal(evs[0].body.sistema, 'erp')
    assert.equal(evs[0].body.tela, 'home')
    assert.equal(eventosDoTipo('dispensa').length, 0, 'não polui o evento dispensa')
  })

  test('fechamento NÃO manual (navegação/auto-close) não registra fechamento_manual', async () => {
    await abrir(campanha24h(), identificado('u-2'))
    chamadasRastreamento = []
    doClose()
    assert.equal(eventosDoTipo('fechamento_manual').length, 0)
  })

  test('identificado nunca usa localStorage para a nova frequência (servidor é a fonte)', async () => {
    await abrir(campanha24h(), identificado('u-3'))
    doClose(true)
    assert.equal(chavesLocais().length, 0)
  })

  test('decisão vem do servidor: regra bloqueada -> não mostra; liberada -> mostra (mesmo com timestamp local recente)', () => {
    const regras = [{ modo_identificacao: 'sistema_tela', tela: 'home' }]
    const c = campanha24h({ regras }) as Campanha & { _regraCasada?: unknown }
    c._regraCasada = regras[0]
    localStorageStore.set(chaveAnonima(ID, 'erp:home:u:u-4'), String(T0))
    assert.equal(wasShown(c, identificado('u-4')), false, 'sem regras_bloqueadas -> elegível')
    c.regras_bloqueadas = ['st|home']
    assert.equal(wasShown(c, identificado('u-4')), true)
  })

  test('multi-regra: o evento carrega a regra casada (__up_regra) para o histórico por destino', async () => {
    const regras = [
      { modo_identificacao: 'url_contem', url_contem: '/app/home' },
      { modo_identificacao: 'url_contem', url_contem: '/app/outra' },
    ]
    await abrir(campanha24h({ regras }), identificado('u-5'))
    chamadasRastreamento = []
    doClose(true)
    const ev = eventosDoTipo('fechamento_manual')[0]
    assert.deepEqual((ev.body.contexto as Record<string, unknown>).__up_regra, 'uc|/app/home')
  })

  test('SPA: fechar -> reavaliação de rotina na mesma URL NÃO reabre (proteção existente preservada)', async () => {
    const c = campanha24h()
    await abrir(c, identificado('u-6'))
    doClose(true)
    candidatasResponse = [c] // servidor ainda não refletiu o fechamento
    await navegarEAguardarAvaliacao()
    await navegarEAguardarAvaliacao()
    assert.equal(modalAberta(), false)
  })

  test('SPA: navegação real + servidor devolvendo a candidata (24h cumpridas) reabre', async () => {
    const c = campanha24h()
    await abrir(c, identificado('u-7'))
    doClose(true)
    irParaUrl('/app/outra-tela')
    candidatasResponse = []
    await navegarEAguardarAvaliacao()
    relogio += DIA
    irParaUrl('/app/home')
    candidatasResponse = [c]
    await navegarEAguardarAvaliacao()
    assert.equal(modalAberta(), true)
  })

  test('mudança de usuário: histórico local do anônimo não vaza para o identificado', () => {
    const c = campanha24h()
    markShown(c, ANONIMO) // anônimo viu agora
    assert.equal(wasShown(c, ANONIMO), true)
    assert.equal(wasShown(c, identificado('u-8')), false)
  })

  test('campanha inativa/encerrada (servidor não devolve) não abre, mesmo passadas 24h', async () => {
    configSetTestState(identificado('u-9'))
    relogio += 5 * DIA
    candidatasResponse = []
    await navegarEAguardarAvaliacao()
    assert.equal(modalAberta(), false)
  })
})

describe('compatibilidade — frequências existentes não são alteradas pelo widget', () => {
  test('uma_vez (anônimo, mostrar_uma_vez): continua gravando "1" e bloqueando para sempre', () => {
    const c = campanha24h({ politica_reexibicao: 'uma_vez_apos_visualizacao', mostrar_uma_vez: true })
    markShown(c, ANONIMO)
    assert.equal(localStorageStore.get(chaveAnonima()), '1')
    relogio += 365 * DIA
    assert.equal(wasShown(c, ANONIMO), true)
  })

  test('políticas antigas nunca enviam fechamento_manual ao fechar', async () => {
    for (const politica of ['uma_vez_apos_visualizacao', 'ate_responder_ou_confirmar', 'reexibir_apos_dias']) {
      chamadasRastreamento = []
      await abrir(campanha24h({ id: 'c-' + politica, politica_reexibicao: politica, mostrar_uma_vez: false }), identificado('u-c-' + politica))
      doClose(true)
      assert.equal(eventosDoTipo('fechamento_manual').length, 0, politica)
      userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: '' })
      await tick(); await tick(); dispararTimersPendentes()
    }
  })

  test('reexibir_apos_dias anônimo (mostrar_uma_vez=false) segue sem bloqueio local e sem escrita', () => {
    const c = campanha24h({ politica_reexibicao: 'reexibir_apos_dias', mostrar_uma_vez: false })
    markShown(c, ANONIMO)
    assert.equal(chavesLocais().length, 0)
    assert.equal(wasShown(c, ANONIMO), false)
  })
})
