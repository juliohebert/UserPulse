import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// INVESTIGAÇÃO v3 — o bug "aparece -> some -> reaparece" persiste mesmo com
// v1 (guard de doClose em pushState de mesma URL) e v2 (if state.open return
// pós-fetch de evaluateUrlCampaigns). Vídeo do cliente: modal aberto, some
// ~5-6s, FICA fechado, reaparece ~15-16s (gap ~10s = atraso_ms da campanha).
// Gap grande => um NOVO scheduleAutoOpen foi armado no CLOSE, não um flash.
//
// Hipótese: o host (Quark) chama UserPulse.init() DE NOVO enquanto o modal
// está aberto (SPA re-montando o bootstrap / loader re-injetado / re-init
// quando usuario_id resolve). init() (widget.js ~3256):
//   - state.open = false            (3302)  <- CLOSE sem doClose()
//   - clearTimeout(state.timer)     (3316)
//   - document.getElementById(WIDGET_ID).remove()  (3330) <- CLOSE visual
//     (DOM removido, sem render(), sem doClose())
//   - fetchCandidatas(...)          (3462) -> .then -> resetRoot() + render()
//     + scheduleAutoOpen(campanha, normalized)  (3488) <- 2º OPEN agendado
//       com o atraso_ms da campanha (~10s)
//   - state.visualizacaoRegistrada = false (3310) -> 2ª 'visualizacao'
//
// Este arquivo INSTRUMENTA o lifecycle (setTimeout/clearTimeout com stack,
// criação/remoção de root, POSTs de visualizacao, transições de overlay) e
// reproduz OPEN -> CLOSE -> espera -> OPEN, contando as visualizações.

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

let userPulseInit: (config: Record<string, unknown>) => void

let candidatasResponse: Campanha[] = []
let localStorageStore: Map<string, string>
let chamadasRastreamento: Array<{ url: string; body: Record<string, unknown> }> = []

// ── instrumentação de timers ──────────────────────────────────────────────
type TimerRec = { id: number; delay: number; tag: string; estado: 'pendente' | 'cancelado' | 'disparado' }
let timers: Map<number, { cb: () => void; rec: TimerRec }> = new Map()
let timersLog: TimerRec[] = []
let proximoTimerId = 1
// heurística: nome da função que criou o timer, a partir do stack
function tagDoStack(): string {
  const s = new Error().stack || ''
  for (const nome of ['scheduleAutoOpen', 'scheduleAutoClose', 'handleUrlChange', 'evaluateCampaigns', 'evaluateUrlCampaigns', 'agendarDestaqueElemento', 'init']) {
    if (s.indexOf(nome) !== -1) return nome
  }
  const m = s.split('\n')[3] || ''
  return m.trim().slice(0, 80)
}
function dispararTimer(id: number) {
  const t = timers.get(id)
  if (!t) return
  timers.delete(id)
  t.rec.estado = 'disparado'
  eventos.push({ t: agora(), tipo: 'timer:disparado', info: `#${id} (${t.rec.tag}, ${t.rec.delay}ms)` })
  t.cb()
}
function dispararTodosOsTimers() {
  for (const id of Array.from(timers.keys())) dispararTimer(id)
}
function dispararTimerMaisRecente() {
  const ids = Array.from(timers.keys())
  if (ids.length) dispararTimer(ids[ids.length - 1])
}

// ── instrumentação de lifecycle ───────────────────────────────────────────
let t0 = 0
function agora() { return Date.now() - t0 }
let eventos: Array<{ t: number; tipo: string; info?: string }> = []
function log(tipo: string, info?: string) { eventos.push({ t: agora(), tipo, info }) }

let roots: Array<{ obj: FakeRoot; criadoEm: number }> = []
type FakeRoot = {
  id: string; className: string; innerHTML: string; style: Record<string, string>; isConnected: boolean
  remove(): void; addEventListener(): void; removeEventListener(): void
  querySelector(): null; querySelectorAll(): unknown[]
}
function criarFakeRoot(): FakeRoot {
  const root: FakeRoot = {
    id: '', className: '', innerHTML: '', style: {}, isConnected: true,
    remove() { root.isConnected = false; log('root:remove', root.id || '(sem id)') },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null }, querySelectorAll() { return [] },
  }
  roots.push({ obj: root, criadoEm: agora() })
  log('root:createElement')
  return root
}
function rootAtual(): FakeRoot | null {
  return roots.length ? roots[roots.length - 1].obj : null
}
function overlayAberto(): boolean {
  const r = rootAtual()
  return !!r && r.isConnected && r.className.indexOf('up-widget-overlay') !== -1
}
function visualizacoes(): number {
  return chamadasRastreamento.filter(
    c => c.url.indexOf('/api/widget/evento') !== -1 && c.body.tipo_evento === 'visualizacao',
  ).length
}
function tick(): Promise<void> { return new Promise(r => setTimeout(r, 0)) }

const WIDGET_ID = 'userpulse-widget-root'
let sandboxCompartilhado: { window: Record<string, unknown> } | null = null

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const historyObj = { pushState(...a: unknown[]) { void a }, replaceState(...a: unknown[]) { void a } }
  const sandbox: Record<string, unknown> = {
    console, URL, URLSearchParams, Error,
    history: historyObj,
    fetch: (url: string, opts?: { body?: string }) => {
      const body = opts?.body ? JSON.parse(opts.body) : {}
      chamadasRastreamento.push({ url, body })
      if (url.indexOf('/api/widget/evento') !== -1) log('POST evento', String(body.tipo_evento))
      if (url.indexOf('/api/widget/candidatas') !== -1) {
        log('fetch candidatas ->')
        return Promise.resolve({ ok: true, json: () => Promise.resolve(candidatasResponse) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    },
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      getElementById: (id: string) => {
        // resetRoot()/init() fazem getElementById(WIDGET_ID).remove() — precisa
        // devolver o root vivo pra observar a remoção de verdade.
        if (id === WIDGET_ID) {
          const r = rootAtual()
          return r && r.isConnected ? r : null
        }
        return null
      },
      createElement: () => criarFakeRoot(),
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
    setTimeout: (cb: () => void, delay?: number) => {
      const id = proximoTimerId++
      const rec: TimerRec = { id, delay: delay || 0, tag: tagDoStack(), estado: 'pendente' }
      timers.set(id, { cb, rec })
      timersLog.push(rec)
      eventos.push({ t: agora(), tipo: 'timer:criado', info: `#${id} (${rec.tag}, ${rec.delay}ms)` })
      return id
    },
    clearTimeout: (id: number) => {
      const t = timers.get(id)
      if (t) { t.rec.estado = 'cancelado'; timers.delete(id); eventos.push({ t: agora(), tipo: 'timer:cancelado', info: `#${id} (${t.rec.tag})` }) }
    },
    scrollTo() {}, requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    CSS: { escape: (v: string) => v.replace(/["\\]/g, '\\$&') },
    navigator: { userAgent: 'node:test' },
    innerWidth: 1024, pageYOffset: 0,
  }
  sandboxCompartilhado = sandbox as unknown as { window: Record<string, unknown> }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  userPulseInit = (sandbox.window as { UserPulse?: { init?: typeof userPulseInit } }).UserPulse!.init as typeof userPulseInit
})

let contadorReset = 0

beforeEach(async () => {
  candidatasResponse = []
  timers = new Map(); timersLog = []; proximoTimerId = 1
  chamadasRastreamento = []
  roots = []; eventos = []
  t0 = Date.now()
  const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
  win.location.pathname = '/app/home'
  win.location.href = 'http://localhost/app/home'
  // O contexto vm é criado UMA vez (before) — state.config do widget.js
  // persiste entre testes. Reinicializa com uma config sempre DIFERENTE
  // (usuario_id único por teste) pra o guard de re-init idempotente nunca
  // pular ESTE reset, deixando state limpo (campanha=null, open=false,
  // timer=null) pro corpo do teste.
  contadorReset++
  userPulseInit({ sistema: '__reset__', tela: '__reset__', usuario_id: 'reset-' + contadorReset })
  await tick(); await tick()
  dispararTodosOsTimers()
  chamadasRastreamento = []; roots = []; eventos = []; timers = new Map(); timersLog = []
})

function campanha(over: Partial<Campanha> = {}): Campanha {
  return {
    id: 'camp-1',
    modo_exibicao: 'modal_automatica',
    modo_identificacao: 'sistema_tela',
    gatilho: 'ao_abrir_tela',
    tela: 'home',
    mostrar_uma_vez: true,
    permitir_fechar_modal: true,
    atraso_ms: 10000, // ~10s, igual ao gap do vídeo
    politica_reexibicao: 'ate_responder_ou_confirmar',
    titulo: 'Novidade',
    descricao: 'Descrição',
    ...over,
  }
}

function imprimirTimeline() {
  console.log('\n──────── TIMELINE ────────')
  for (const e of eventos) console.log(`  +${String(e.t).padStart(5)}ms  ${e.tipo}${e.info ? '  ' + e.info : ''}`)
  console.log('  scheduleAutoOpen(s) criados:')
  for (const r of timersLog.filter(x => x.tag === 'scheduleAutoOpen')) {
    console.log(`    timer #${r.id}  atraso=${r.delay}ms  estado=${r.estado}`)
  }
  console.log('──────────────────────────\n')
}

// Forma do bug (pré-fix): init #1 -> abre (viz #1) -> init #2 (MESMA config,
// modal aberto) -> init removia o root (getElementById(WIDGET_ID).remove(),
// widget.js:3330) + state.open=false (3302), SEM doClose()/render(), e
// reagendava scheduleAutoOpen com campanha.atraso_ms (3488) -> modal sumia e
// voltava ~atraso_ms depois com uma 2ª visualização. Gap grande = atraso_ms
// (~10s no vídeo do cliente). Fix: guard de re-init idempotente no topo de
// init() — no-op quando a config efetiva é igual E há campanha aberta ou
// auto-open pendente.

async function abrirCampanha(over: Partial<Campanha> = {}) {
  candidatasResponse = [campanha(over)]
  userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
  await tick(); await tick()
  dispararTodosOsTimers() // atraso_ms -> abre
}

describe('v3: re-init redundante do host NÃO deve fechar/reagendar a campanha aberta', () => {
  test('init() repetido com a MESMA config efetiva e modal aberto é no-op (root preservado, 1 visualização)', async () => {
    await abrirCampanha()
    assert.equal(overlayAberto(), true, 'pré: modal aberto')
    assert.equal(visualizacoes(), 1, 'pré: 1 visualização')
    const rootAberto = rootAtual()!
    const autoOpensAntes = timersLog.filter(x => x.tag === 'scheduleAutoOpen').length
    const candidatasAntes = chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/candidatas') !== -1).length
    log('MODAL ABERTO (viz #1)')

    // Host re-chama init() com a MESMA config (SPA remonta bootstrap / loader
    // re-injetado). Nenhum pushState, nenhum updateContext.
    candidatasResponse = [campanha()]
    log('CHAMA init #2 (re-init redundante, modal aberto)')
    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    await tick(); await tick()
    dispararTodosOsTimers()
    await tick(); await tick()
    dispararTodosOsTimers()
    imprimirTimeline()

    assert.equal(rootAberto.isConnected, true, 'root do modal aberto NÃO foi removido')
    assert.equal(overlayAberto(), true, 'modal continua aberto')
    assert.equal(
      timersLog.filter(x => x.tag === 'scheduleAutoOpen').length, autoOpensAntes,
      'nenhum scheduleAutoOpen novo foi armado pelo re-init',
    )
    assert.equal(
      chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/candidatas') !== -1).length, candidatasAntes,
      're-init não buscou candidatas de novo',
    )
    assert.equal(visualizacoes(), 1, 'nenhuma 2ª visualização registrada')
  })

  test('init() repetido com MESMA config mas SEM campanha ativa continua reinicializando normal', async () => {
    // Sem candidata -> nada aberto, nenhum timer pendente -> guard não aplica.
    candidatasResponse = []
    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    await tick(); await tick()
    assert.equal(overlayAberto(), false)
    const rootAntes = rootAtual()

    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1' })
    await tick(); await tick()
    // init procedeu: novo root criado (ensureStyles/resetRoot no fluxo normal)
    assert.notEqual(rootAtual(), rootAntes, 'sem campanha ativa, o guard não aplica — init reinicializa')
  })

  test('controle: mudança REAL de usuario_id -> init reinicializa (fecha e reavalia)', async () => {
    await abrirCampanha()
    assert.equal(overlayAberto(), true)
    const rootAberto = rootAtual()!

    // Troca real de usuário (SPA troca de conta sem reload) — config difere.
    candidatasResponse = [campanha()]
    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-2' })

    assert.equal(rootAberto.isConnected, false, 'usuario_id diferente: init desmonta o modal aberto (comportamento de sempre)')
    await tick(); await tick()
    assert.equal(chamadasRastreamento.filter(c => c.url.indexOf('/api/widget/candidatas') !== -1).length >= 1, true, 'init reavaliou candidatas para o novo usuário')
  })

  test('controle: mudança REAL de contexto -> init reinicializa', async () => {
    await abrirCampanha()
    const rootAberto = rootAtual()!

    // Mesmo sistema/tela/usuario_id, mas contexto diferente (cliente_id novo).
    candidatasResponse = [campanha()]
    userPulseInit({ sistema: 'erp', tela: 'home', usuario_id: 'user-1', cliente_id: '999' })

    assert.equal(rootAberto.isConnected, false, 'contexto diferente: init reinicializa')
  })

  test('controle: mudança REAL de tela -> init reinicializa', async () => {
    await abrirCampanha()
    const rootAberto = rootAtual()!

    candidatasResponse = []
    userPulseInit({ sistema: 'erp', tela: 'outra-tela', usuario_id: 'user-1' })

    assert.equal(rootAberto.isConnected, false, 'tela diferente: init reinicializa')
  })

  test('controle: SEM segundo init(), o modal aberto permanece (1 visualização)', async () => {
    await abrirCampanha()
    assert.equal(overlayAberto(), true)
    assert.equal(visualizacoes(), 1)
    await tick(); await tick()
    dispararTodosOsTimers()
    assert.equal(overlayAberto(), true, 'segue aberto')
    assert.equal(visualizacoes(), 1, 'sem re-init: só 1 visualização')
  })
})
