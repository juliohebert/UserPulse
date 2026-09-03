import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Repro do bug "campanha aparece -> some -> reaparece" no widget real.
//
// Sequência: numa SPA, o router do sistema hospedeiro dispara
// history.pushState/replaceState de rotina (sync de query string, redirect
// interno, <Link replace>, libs de scroll-restore) — MUITAS vezes SEM mudar
// a URL. bindSpaListeners() monkey-patcha pushState/replaceState chamando
// handleUrlChange(true) (forçado — o guard `currentUrl === lastUrl` não
// protege). handleUrlChange então:
//   1. if (state.open) doClose();      -> a modal SOME
//   2. evaluateCampaigns();            -> refetch /candidatas
// Para usuário identificado, wasShown() retorna sempre false (servidor é
// autoritativo desde 898fade). Se /candidatas ainda devolve a campanha
// (política ate_responder_ou_confirmar, ou corrida read-after-write da
// política uma_vez_apos_visualizacao enquanto o POST de visualização não
// commitou), a campanha é re-selecionada e scheduleAutoOpen reabre -> a
// modal REAPARECE, e uma segunda 'visualizacao' é registrada.
//
// Harness = mesmo padrão de widgetCampanhaModalReexibicao.test.ts.

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
let configSetTestState: (parcial: Partial<ConfigWidget>) => void
let userPulseInit: (config: Record<string, unknown>) => void
let historyPushState: (...args: unknown[]) => void

let candidatasResponse: Campanha[] = []
let localStorageStore: Map<string, string>
let chamadasRastreamento: Array<{ url: string; body: Record<string, unknown> }> = []
let timersPendentes: Array<{ id: number; cb: () => void }> = []
let proximoTimerId = 1
function dispararTimersPendentes() {
  const pendentes = timersPendentes.slice()
  timersPendentes = []
  for (const t of pendentes) t.cb()
}
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

let ultimoRootModal: { id: string; className: string } | null = null
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
  const historyObj = {
    pushState(...args: unknown[]) { void args },
    replaceState(...args: unknown[]) { void args },
  }
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
    UserPulse?: {
      init?: (c: Record<string, unknown>) => void
      _internal?: {
        handleUrlChange?: (f?: boolean) => void
        configSetTestState?: (p: Partial<ConfigWidget>) => void
      }
    }
  }).UserPulse
  userPulseInit = UserPulse!.init as typeof userPulseInit
  handleUrlChange = UserPulse!._internal!.handleUrlChange as typeof handleUrlChange
  configSetTestState = UserPulse!._internal!.configSetTestState as typeof configSetTestState
  // pushState já monkey-patchado por bindSpaListeners() dentro de init()
  historyPushState = historyObj.pushState as typeof historyPushState
})

beforeEach(async () => {
  candidatasResponse = []
  timersPendentes = []
  proximoTimerId = 1
  chamadasRastreamento = []
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = '/app/home'
  win.location.href = 'http://localhost/app/home'
  userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: '' })
  await tick(); await tick()
  dispararTimersPendentes()
})

function campanhaModal(over: Partial<Campanha> = {}): Campanha {
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
    // Servidor nunca bloqueia por visualização com esta política — só depois
    // de responder/confirmar. Torna o repro determinístico (sem depender do
    // timing do POST de visualização).
    politica_reexibicao: 'ate_responder_ou_confirmar',
    titulo: 'Novidade',
    descricao: 'Descrição',
    ...over,
  }
}

async function navegarEAguardar() {
  dispararTimersPendentes() // debounce ~200ms do handleUrlChange
  await tick(); await tick()
  dispararTimersPendentes() // scheduleAutoOpen (atraso_ms)
}

function visualizacoesRegistradas() {
  return chamadasRastreamento.filter(
    c => c.url.indexOf('/api/widget/evento') !== -1 && c.body.tipo_evento === 'visualizacao',
  ).length
}

describe('modal não deve piscar (fechar+reabrir) por pushState de rotina do router SPA', () => {
  test('abre a modal na tela elegível', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    candidatasResponse = [campanhaModal()]
    handleUrlChange(true)
    await navegarEAguardar()
    assert.match(ultimoRootModal!.className, /up-widget-overlay/, 'pré-condição: modal aberta')
    assert.equal(visualizacoesRegistradas(), 1, 'pré-condição: 1 visualização registrada')
  })

  test('pushState do router SEM mudar a URL não deve fechar e reabrir a modal', async () => {
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    candidatasResponse = [campanhaModal()]
    handleUrlChange(true)
    await navegarEAguardar()
    assert.match(ultimoRootModal!.className, /up-widget-overlay/)
    assert.equal(visualizacoesRegistradas(), 1)

    // Router do host normaliza a URL / sincroniza query string logo depois do
    // mount — MESMA URL. bindSpaListeners() (rodou dentro de init()) já
    // monkey-patchou history.pushState pra chamar handleUrlChange(true).
    const win = sandboxCompartilhado!.window as { history: { pushState: (...a: unknown[]) => void } }
    win.history.pushState({}, '', '/app/home')
    await navegarEAguardar()

    assert.match(
      ultimoRootModal!.className, /up-widget-overlay/,
      'a modal deve continuar aberta após um pushState de rotina (mesma tela elegível)',
    )
    assert.equal(
      visualizacoesRegistradas(), 1,
      'BUG aparece->some->reaparece: doClose() no handleUrlChange fechou a modal e evaluateCampaigns() a reabriu, registrando uma 2ª visualização',
    )
  })

  test('controle: usuário ANÔNIMO não pisca — wasShown/localStorage (backstop local) segura o reopen', async () => {
    // Sem usuario_id, wasShown() consulta o localStorage que scheduleAutoOpen
    // marcou ao abrir -> evaluateCampaigns() re-seleciona e para em `jaVisto`.
    // É exatamente esse backstop que 898fade removeu pro usuário identificado.
    configSetTestState({ sistema: 'erp', tela: 'home', usuario_id: '' })
    candidatasResponse = [campanhaModal()]
    handleUrlChange(true)
    await navegarEAguardar()
    assert.equal(visualizacoesRegistradas(), 1)

    const win = sandboxCompartilhado!.window as { history: { pushState: (...a: unknown[]) => void } }
    win.history.pushState({}, '', '/app/home')
    await navegarEAguardar()

    assert.equal(visualizacoesRegistradas(), 1, 'anônimo: pushState de rotina não deve reabrir (backstop local intacto)')
  })
})
