import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Repro do bug "campanha aparece -> some -> reaparece" que SOBREVIVEU ao fix v1
// (guard `state.open && currentUrl !== urlAnterior` no doClose de
// handleUrlChange, commit e89bf41).
//
// Causa v2: handleUrlChange() chama SEMPRE evaluateUrlCampaigns() e
// evaluateCampaigns() (widget.js ~3866/3870), mesmo na MESMA URL. Se isso
// acontece na "janela pendente" (campanha já selecionada, timer de
// scheduleAutoOpen armado, state.open ainda false), as duas avaliações são
// disparadas com state.open=false e seguem em frente. Quando a resposta do
// fetch chega DEPOIS que o modal abriu:
//   - evaluateCampaigns() re-checa `if (state.open) return` (widget.js 3684) —
//     mas essa proteção é derrotada quando evaluateUrlCampaigns roda antes e
//     seta state.open=false;
//   - evaluateUrlCampaigns() NÃO re-checa state.open nem token nenhum —
//     executa state.open=false + resetRoot() (destrói o DOM do modal aberto =
//     CLOSE) + scheduleAutoOpen() (=> OPEN de novo), registrando uma 2ª
//     'visualizacao'.
//
// Harness = mesmo padrão de widgetCampanhaModalRepushState.test.ts, com um
// helper a mais (dispararTimer) pra firar UM timer específico e forçar a
// ordem real: debounce do handleUrlChange ANTES do auto-open.

type Campanha = {
  id?: string
  modo_exibicao?: string
  modo_identificacao?: string
  gatilho?: string
  tela?: string
  url_contem?: string
  mostrar_uma_vez?: boolean
  permitir_fechar_modal?: boolean
  atraso_ms?: number
  titulo?: string
  descricao?: string
  politica_reexibicao?: string
}
type ConfigWidget = { slug?: string; sistema?: string; tela?: string; usuario_id?: string; contexto?: Record<string, unknown> | null }

let handleUrlChange: (forcar?: boolean) => void
let userPulseInit: (config: Record<string, unknown>) => void

let candidatasResponse: Campanha[] = []
let localStorageStore: Map<string, string>
let chamadasRastreamento: Array<{ url: string; body: Record<string, unknown> }> = []
let timersPendentes: Array<{ id: number; cb: () => void }> = []
let proximoTimerId = 1
function dispararTimersPendentes() {
  const pend = timersPendentes.slice()
  timersPendentes = []
  for (const t of pend) t.cb()
}
// Fira só o timer mais recente ainda pendente (LIFO) — pra controlar a ordem
// entre o debounce do handleUrlChange (inserido por último) e o auto-open
// (inserido antes, dentro do init/eval).
function dispararTimerMaisRecente() {
  if (timersPendentes.length === 0) return
  const t = timersPendentes.pop()!
  t.cb()
}
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

let ultimoRootModal: { id: string; className: string; isConnected: boolean } | null = null
function criarFakeRootModal() {
  const root = {
    id: '', className: '', innerHTML: '', style: {} as Record<string, string>, isConnected: true,
    remove() { root.isConnected = false },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null }, querySelectorAll(): unknown[] { return [] },
  }
  ultimoRootModal = root
  return root
}

let sandboxCompartilhado: { window: Record<string, unknown> } | null = null

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const historyObj = { pushState(...a: unknown[]) { void a }, replaceState(...a: unknown[]) { void a } }
  const sandbox: Record<string, unknown> = {
    console, URL, URLSearchParams,
    history: historyObj,
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
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, removeEventListener() {},
      body: { appendChild() {}, style: {} as Record<string, string> },
      head: { appendChild() {} },
      documentElement: { style: { removeProperty() {}, setProperty() {} } },
    },
  }
  localStorageStore = new Map<string, string>()
  sandbox.window = {
    location: { pathname: '/app/home', href: 'http://localhost/app/home', search: '', hash: '' },
    localStorage: {
      getItem: (k: string) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
      setItem: (k: string, v: string) => { localStorageStore.set(k, v) },
      removeItem: (k: string) => { localStorageStore.delete(k) },
    },
    addEventListener() {}, removeEventListener() {},
    history: historyObj,
    setTimeout: (cb: () => void) => { const id = proximoTimerId++; timersPendentes.push({ id, cb }); return id },
    clearTimeout: (id: number) => { timersPendentes = timersPendentes.filter(t => t.id !== id) },
    scrollTo() {},
    requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    CSS: { escape: (v: string) => v.replace(/["\\]/g, '\\$&') },
    navigator: { userAgent: 'node:test' },
    innerWidth: 1024,
    pageYOffset: 0,
  }
  sandboxCompartilhado = sandbox as unknown as { window: Record<string, unknown> }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: { init?: (c: Record<string, unknown>) => void; _internal?: { handleUrlChange?: (f?: boolean) => void } }
  }).UserPulse
  userPulseInit = UserPulse!.init as typeof userPulseInit
  handleUrlChange = UserPulse!._internal!.handleUrlChange as typeof handleUrlChange
})

beforeEach(() => {
  candidatasResponse = []
  timersPendentes = []
  proximoTimerId = 1
  chamadasRastreamento = []
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = '/app/home'
  win.location.href = 'http://localhost/app/home'
})

function campanhaUrlContem(over: Partial<Campanha> = {}): Campanha {
  return {
    id: 'camp-1',
    modo_exibicao: 'modal_automatica',
    modo_identificacao: 'url_contem',
    gatilho: 'ao_abrir_tela',
    url_contem: '/app/home',
    tela: '',
    mostrar_uma_vez: true,
    permitir_fechar_modal: true,
    // Grande o suficiente pra o timer de auto-open ficar pendente enquanto o
    // teste dispara o debounce do handleUrlChange no meio.
    atraso_ms: 800,
    // Servidor nunca bloqueia por visualização — só depois de responder/
    // confirmar. Deixa o repro determinístico (independe do timing do POST).
    politica_reexibicao: 'ate_responder_ou_confirmar',
    titulo: 'Novidade',
    descricao: 'Descrição',
    ...over,
  }
}

function visualizacoes() {
  return chamadasRastreamento.filter(
    c => c.url.indexOf('/api/widget/evento') !== -1 && c.body.tipo_evento === 'visualizacao',
  ).length
}

describe('v2: pushState de rotina durante a janela pendente do modal', () => {
  test('não deve destruir e reabrir o modal (evaluateUrlCampaigns sem re-check de state.open)', async () => {
    // 1. init() com a candidata url_contem disponível -> fetch de candidatas
    //    do init seleciona a campanha e ARMA o timer de auto-open (atraso 800).
    candidatasResponse = [campanhaUrlContem()]
    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    await tick(); await tick() // resolve o fetch de candidatas do init
    // timer de auto-open pendente; state.open ainda false.
    assert.equal(visualizacoes(), 0, 'pré: nada aberto ainda')
    const autoOpenPendente = timersPendentes.length
    assert.ok(autoOpenPendente >= 1, 'pré: timer de auto-open deveria estar pendente')

    // 2. Router do host dispara pushState de rotina (MESMA URL) -> monkey-patch
    //    de bindSpaListeners -> handleUrlChange(true) -> debounce (200ms).
    const win = sandboxCompartilhado!.window as { history: { pushState: (...a: unknown[]) => void } }
    win.history.pushState({}, '', '/app/home')

    // 3. Fira SÓ o debounce (timer mais recente) -> corpo do handleUrlChange
    //    roda com state.open=false: guard do doClose não fecha nada (mesma URL,
    //    e nem está aberto), MAS evaluateUrlCampaigns() + evaluateCampaigns()
    //    são disparados agora, com fetch em voo.
    dispararTimerMaisRecente()

    // 4. Fira o timer de auto-open ORIGINAL -> modal ABRE (visualização #1).
    dispararTimersPendentes()
    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'modal deveria ter aberto')
    assert.equal(visualizacoes(), 1, '1ª visualização registrada ao abrir')
    const rootAberto = ultimoRootModal

    // 5. Agora as respostas dos fetches de re-avaliação chegam — DEPOIS do
    //    modal já estar aberto.
    await tick(); await tick()
    // scheduleAutoOpen reagendado por evaluate*Campaigns roda aqui, se houver.
    dispararTimersPendentes()
    await tick(); await tick()

    assert.equal(
      visualizacoes(), 1,
      'BUG v2: evaluateUrlCampaigns() (sem re-check de state.open) fez resetRoot()+scheduleAutoOpen() por cima do modal aberto -> 2ª visualização',
    )
    assert.equal(rootAberto!.isConnected, true, 'o root do modal aberto não deveria ter sido destruído por uma re-avaliação de rotina')
    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'modal deveria continuar aberto')
  })
})
