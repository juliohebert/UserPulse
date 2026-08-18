import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Fase 2 da restauração de Tours autônomos (ver server/src/controllers/
// tours.ts e widget.ts, restaurados na Fase 1): testa avaliarTourAutomatico
// (seleção de candidato elegível pra autoabertura) e iniciarTourPublico
// (window.UserPulse.iniciarTour(slug)), restaurados semanticamente ao
// comportamento pré-825dd62, e confirma que o caminho de Jornada
// (iniciarTour(etapa.tour, ..., jornadaContexto) chamado direto por
// jornadaEtapaClicar, nunca tocado nesta fase) continua funcionando sem
// depender de nenhum fetch público e sem se importar com Tour.ativo.
//
// Carrega o widget.js real via vm (mesmo padrão de
// widgetCampanhaModalReexibicao.test.ts) com um fetch fake que responde por
// endpoint e registra toda chamada feita — usado tanto pra controlar as
// respostas quanto pra provar ausência de chamada (Jornada nunca deve bater
// no backend público pra iniciar um tour já embutido na etapa).

type Passo = { id: string; seletor_tipo: string; seletor: string; tooltip_posicao?: string; titulo?: string }
type TourCandidato = {
  id: string
  titulo?: string
  slug?: string
  ativo?: boolean
  modo_identificacao?: string
  tela?: string
  data_cy?: string
  url_contem?: string
  prioridade?: number
  segmentacao_regras?: unknown
  passos: Passo[]
}
type ConfigAvaliacao = { sistema?: string; tela?: string; usuario_id?: string; contexto?: Record<string, unknown> | null }
type AvaliarTourAutomatico = (config: ConfigAvaliacao) => void
type IniciarTourPublico = (slug?: string, jornadaContexto?: unknown) => void
type IniciarTour = (
  tour: TourCandidato | null,
  pularIntro?: boolean,
  preview?: boolean,
  modoUsuarioFinal?: boolean,
  jornadaContexto?: unknown
) => void
type TourSetTestState = (parcial: { ativo?: boolean; tour?: unknown; indice?: number }) => void
type Snapshot = { ativo: boolean; preview: boolean; feedbackEscolhido: string | null; indice: number; voltarFallbackTimerAtivo: boolean }
type StepSnapshot = { tourTitulo: string | null; totalPassos: number; seletorTipos: string[] }
type FinalizarTour = (motivo: string) => void
type UserPulseInit = (config: Record<string, unknown>) => void
type UpdateContext = (contexto: Record<string, unknown>) => void
type HandleUrlChange = (forcarReavaliacao?: boolean) => void

let avaliarTourAutomatico: AvaliarTourAutomatico
let iniciarTourPublico: IniciarTourPublico
let iniciarTour: IniciarTour
let tourSetTestState: TourSetTestState
let tourGetTestSnapshot: () => Snapshot
let tourGetTestStepSnapshot: () => StepSnapshot
let finalizarTour: FinalizarTour
let userPulseInit: UserPulseInit
let updateContext: UpdateContext
let handleUrlChange: HandleUrlChange

let candidatosResponse: TourCandidato[] = []
let tourPorSlugResponse: TourCandidato | null = null
let chamadasRastreamento: Array<{ url: string }> = []
let seletoresPresentes: Set<string>
let localStorageStore: Map<string, string>
let sandboxCompartilhado: { window: Record<string, unknown> } | null = null

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function makeFakeElement(): any {
  const el: any = {
    style: {},
    childNodes: [] as unknown[],
    attributes: {} as Record<string, string>,
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k: string, v: string) { el.attributes[k] = String(v) },
    getAttribute(k: string) { return Object.prototype.hasOwnProperty.call(el.attributes, k) ? el.attributes[k] : null },
    removeAttribute(k: string) { delete el.attributes[k] },
    appendChild(child: unknown) { el.childNodes.push(child); return child },
    insertBefore(child: unknown) { el.childNodes.push(child); return child },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: () => null,
    get innerHTML() { return el._html || '' },
    set innerHTML(v: string) { el._html = v },
    id: '',
  }
  return el
}

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    history: { pushState() {}, replaceState() {} },
    // Endpoints não mapeados explicitamente (aparência, jornadas, candidatas
    // de campanha, eventos) sempre devolvem "nada disponível" — todo
    // consumidor em widget.js já trata isso como tal (mesmo padrão de
    // widgetCampanhaModalReexibicao.test.ts).
    fetch: (url: string) => {
      chamadasRastreamento.push({ url })
      if (url.indexOf('/api/widget/tour/candidatas') !== -1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(candidatosResponse) })
      }
      if (url.indexOf('/api/widget/tour?') !== -1) {
        return tourPorSlugResponse
          ? Promise.resolve({ ok: true, json: () => Promise.resolve(tourPorSlugResponse) })
          : Promise.resolve({ ok: false, status: 404 })
      }
      if (url.indexOf('/api/widget/candidatas') !== -1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    },
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      getElementById: () => null,
      createElement: () => makeFakeElement(),
      querySelectorAll: () => [],
      // data_cy: checkMode consulta document.querySelector('[data-cy="..."]')
      // — cada teste controla quais seletores "existem na página" via
      // seletoresPresentes (Set de strings do seletor completo).
      querySelector: (sel: string) => (seletoresPresentes.has(sel) ? makeFakeElement() : null),
      addEventListener() {},
      removeEventListener() {},
      body: { appendChild() {}, style: {} as Record<string, string> },
      head: { appendChild() {} },
      documentElement: { style: { removeProperty() {}, setProperty() {} }, clientWidth: 1024 },
    },
  }
  localStorageStore = new Map<string, string>()
  sandbox.window = {
    location: { pathname: '/app/agenda', href: 'http://localhost/app/agenda', search: '', hash: '' },
    localStorage: {
      getItem: (chave: string) => (localStorageStore.has(chave) ? localStorageStore.get(chave) : null),
      setItem: (chave: string, valor: string) => { localStorageStore.set(chave, valor) },
      removeItem: (chave: string) => { localStorageStore.delete(chave) },
    },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    CSS: { escape: (valor: string) => valor.replace(/["\\]/g, '\\$&') },
    navigator: { userAgent: 'node:test' },
    innerWidth: 1024,
    pageYOffset: 0,
    scrollTo() {},
  }
  sandboxCompartilhado = sandbox as unknown as { window: Record<string, unknown> }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: {
      init?: UserPulseInit
      updateContext?: UpdateContext
      _internal?: {
        avaliarTourAutomatico?: AvaliarTourAutomatico
        iniciarTourPublico?: IniciarTourPublico
        iniciarTour?: IniciarTour
        tourSetTestState?: TourSetTestState
        tourGetTestSnapshot?: () => Snapshot
        tourGetTestStepSnapshot?: () => StepSnapshot
        finalizarTour?: FinalizarTour
        handleUrlChange?: HandleUrlChange
      }
    }
  }).UserPulse
  assert.equal(typeof UserPulse?.init, 'function', 'window.UserPulse.init não foi exposta por widget.js')
  userPulseInit = UserPulse!.init as UserPulseInit
  updateContext = UserPulse!.updateContext as UpdateContext
  avaliarTourAutomatico = UserPulse!._internal!.avaliarTourAutomatico as AvaliarTourAutomatico
  iniciarTourPublico = UserPulse!._internal!.iniciarTourPublico as IniciarTourPublico
  iniciarTour = UserPulse!._internal!.iniciarTour as IniciarTour
  tourSetTestState = UserPulse!._internal!.tourSetTestState as TourSetTestState
  tourGetTestSnapshot = UserPulse!._internal!.tourGetTestSnapshot as () => Snapshot
  tourGetTestStepSnapshot = UserPulse!._internal!.tourGetTestStepSnapshot as () => StepSnapshot
  finalizarTour = UserPulse!._internal!.finalizarTour as FinalizarTour
  handleUrlChange = UserPulse!._internal!.handleUrlChange as HandleUrlChange
  assert.equal(typeof avaliarTourAutomatico, 'function')
  assert.equal(typeof iniciarTourPublico, 'function')
  assert.equal(typeof iniciarTour, 'function')
})

beforeEach(async () => {
  candidatosResponse = []
  tourPorSlugResponse = null
  chamadasRastreamento = []
  seletoresPresentes = new Set()
  // Sessão limpa entre testes — mesmo tour ativo/preview/indice de sempre
  // (ver widgetTourVoltar.test.ts), sem precisar reconstruir a vm inteira.
  finalizarTour('fim_do_teste_anterior')
  tourSetTestState({ ativo: false, tour: null, indice: 0 })
})

function passo(id: string): Passo {
  return { id, seletor_tipo: 'css', seletor: 'body', tooltip_posicao: 'auto' }
}

function tourFake(overrides: Partial<TourCandidato> = {}): TourCandidato {
  return {
    id: 'tour-1',
    titulo: 'Tour 1',
    slug: 'tour-1',
    ativo: true,
    modo_identificacao: 'sistema_tela',
    tela: 'agenda',
    prioridade: 0,
    passos: [passo('p0')],
    ...overrides,
  }
}

describe('avaliarTourAutomatico — candidato elegível inicia (widget.js)', () => {
  test('candidato com tela batendo (modo sistema_tela) inicia automaticamente', async () => {
    candidatosResponse = [tourFake({ id: 't-elegivel', titulo: 'Elegível', tela: 'agenda' })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda', usuario_id: 'u1' })
    await tick()
    await tick()

    assert.equal(tourGetTestSnapshot().ativo, true)
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Elegível')
    const chamadaCandidatas = chamadasRastreamento.find(c => c.url.indexOf('/api/widget/tour/candidatas') !== -1)
    assert.ok(chamadaCandidatas, 'deveria ter chamado /api/widget/tour/candidatas')
    assert.match(chamadaCandidatas!.url, /sistema=erp/)
    assert.match(chamadaCandidatas!.url, /tela=agenda/)
    assert.match(chamadaCandidatas!.url, /usuario_id=u1/)
  })

  test('sem sistema no config, nem chama o backend', async () => {
    avaliarTourAutomatico({ tela: 'agenda' })
    await tick()
    assert.equal(chamadasRastreamento.length, 0)
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('já há um tour ativo em andamento => não reavalia nem chama o backend', async () => {
    tourSetTestState({ ativo: true, tour: tourFake() })
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    assert.equal(chamadasRastreamento.length, 0)
  })
})

describe('avaliarTourAutomatico — checkMode filtra por modo_identificacao (tela/data-cy/url) (widget.js)', () => {
  test('modo sistema_tela: tela diferente da config não inicia', async () => {
    candidatosResponse = [tourFake({ modo_identificacao: 'sistema_tela', tela: 'financeiro' })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('modo data_cy: seletor ausente na página não inicia', async () => {
    candidatosResponse = [tourFake({ modo_identificacao: 'data_cy', data_cy: 'botao-agendar', tela: undefined })]
    // seletoresPresentes vazio => document.querySelector nunca acha o elemento
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('modo data_cy: seletor presente na página inicia', async () => {
    seletoresPresentes.add('[data-cy="botao-agendar"]')
    candidatosResponse = [tourFake({ modo_identificacao: 'data_cy', data_cy: 'botao-agendar', tela: undefined })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, true)
  })

  test('modo url_contem: URL atual não contém o caminho configurado não inicia', async () => {
    candidatosResponse = [tourFake({ modo_identificacao: 'url_contem', url_contem: '/financeiro', tela: undefined })]
    // window.location.pathname (setado no before()) é /app/agenda
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('modo url_contem: URL atual contém o caminho configurado inicia', async () => {
    candidatosResponse = [tourFake({ modo_identificacao: 'url_contem', url_contem: '/app/agenda', tela: undefined })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, true)
  })
})

describe('avaliarTourAutomatico — segmentação continua respeitada (widget.js)', () => {
  test('regra de segmentação não atendida bloqueia o candidato', async () => {
    candidatosResponse = [tourFake({
      segmentacao_regras: [{ campo: 'estado', operador: 'igual', valor: 'RN' }],
    })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda', contexto: { Estado: 'SP' } })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('regra de segmentação atendida libera o candidato', async () => {
    candidatosResponse = [tourFake({
      segmentacao_regras: [{ campo: 'estado', operador: 'igual', valor: 'RN' }],
    })]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda', contexto: { Estado: 'RN' } })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, true)
  })
})

describe('avaliarTourAutomatico — dedupe (widget.js)', () => {
  test('sem usuario_id, tour já visto (localStorage) não reinicia', async () => {
    const tour = tourFake({ id: 't-visto' })
    localStorageStore.set('userpulse:tour:t-visto', '1')
    candidatosResponse = [tour]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' }) // sem usuario_id
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('com usuario_id, dedupe já é do backend — localStorage "visto" não bloqueia no client', async () => {
    const tour = tourFake({ id: 't-visto-2' })
    localStorageStore.set('userpulse:tour:t-visto-2', '1')
    candidatosResponse = [tour] // backend já teria filtrado se de fato concluído/pulado; aqui simulamos que ele devolveu mesmo assim
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda', usuario_id: 'u1' })
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, true)
  })
})

describe('avaliarTourAutomatico — prioridade (widget.js)', () => {
  test('entre dois elegíveis, o primeiro da lista (ordem já definida pelo backend) é o escolhido', async () => {
    candidatosResponse = [
      tourFake({ id: 't-alta', titulo: 'Prioridade alta', prioridade: 10 }),
      tourFake({ id: 't-baixa', titulo: 'Prioridade baixa', prioridade: 0 }),
    ]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Prioridade alta')
  })

  test('primeiro da lista inelegível (checkMode falha) => segundo elegível é escolhido', async () => {
    candidatosResponse = [
      tourFake({ id: 't-inelegivel', titulo: 'Inelegível', tela: 'financeiro' }),
      tourFake({ id: 't-elegivel', titulo: 'Elegível', tela: 'agenda' }),
    ]
    avaliarTourAutomatico({ sistema: 'erp', tela: 'agenda' })
    await tick()
    await tick()
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Elegível')
  })
})

describe('iniciarTourPublico — window.UserPulse.iniciarTour(slug) (widget.js)', () => {
  test('slug encontrado (backend devolve tour ativo) inicia o tour', async () => {
    tourPorSlugResponse = tourFake({ id: 't-slug', titulo: 'Via slug', slug: 'meu-tour' })
    iniciarTourPublico('meu-tour')
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, true)
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Via slug')
    const chamada = chamadasRastreamento.find(c => c.url.indexOf('/api/widget/tour?') !== -1)
    assert.ok(chamada, 'deveria ter chamado /api/widget/tour?slug=...')
    assert.match(chamada!.url, /slug=meu-tour/)
  })

  test('slug não encontrado (backend 404 — tour inativo/inexistente) não inicia', async () => {
    tourPorSlugResponse = null // fetch mock responde 404 pra qualquer slug quando isto é null
    iniciarTourPublico('tour-inativo-ou-inexistente')
    await tick()
    await tick()
    assert.equal(tourGetTestSnapshot().ativo, false)
  })

  test('sem slug informado, nem chama o backend', async () => {
    iniciarTourPublico(undefined)
    await tick()
    assert.equal(chamadasRastreamento.length, 0)
    assert.equal(tourGetTestSnapshot().ativo, false)
  })
})

describe('Jornada — iniciar Tour embutido direto, sem fetch público (widget.js)', () => {
  // jornadaEtapaClicar (não tocado nesta fase) chama exatamente
  // iniciarTour(etapa.tour, false, false, false, jornadaContexto) — o tour
  // já vem embutido (com passos) na resposta de /api/widget/jornadas, então
  // este caminho nunca precisa de fetchTour/fetchTourCandidatos.
  test('iniciarTour(tourEmbutido, ..., jornadaContexto) inicia sem nenhuma chamada de rede', async () => {
    const tourEmbutido = tourFake({ id: 't-jornada', titulo: 'Etapa da jornada', ativo: true })
    iniciarTour(tourEmbutido, false, false, false, { jornadaId: 'j1', blocoId: 'b1', etapaId: 'e1' })
    await tick()

    assert.equal(tourGetTestSnapshot().ativo, true)
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Etapa da jornada')
    assert.equal(chamadasRastreamento.length, 0, 'Jornada não deveria bater em nenhum endpoint público pra iniciar um tour já embutido')
  })

  test('Jornada consegue iniciar Tour com ativo=false — Tour.ativo não é lido por iniciarTour', async () => {
    const tourInativo = tourFake({ id: 't-jornada-inativo', titulo: 'Etapa inativa fora da jornada', ativo: false })
    iniciarTour(tourInativo, false, false, false, { jornadaId: 'j2', blocoId: 'b2', etapaId: 'e2' })
    await tick()

    assert.equal(tourGetTestSnapshot().ativo, true, 'Tour.ativo=false não deve impedir o uso do tour como etapa de Jornada')
    assert.equal(tourGetTestStepSnapshot().tourTitulo, 'Etapa inativa fora da jornada')
    assert.equal(chamadasRastreamento.length, 0)
  })
})

describe('avaliarTourAutomatico é reavaliado a cada mudança de contexto/navegação SPA (widget.js)', () => {
  test('init() com sistema dispara avaliação automática de tour', async () => {
    userPulseInit({ sistema: 'erp', tela: 'agenda', usuario_id: 'u1' })
    await tick()
    await tick()
    assert.ok(
      chamadasRastreamento.some(c => c.url.indexOf('/api/widget/tour/candidatas') !== -1),
      'init() deveria disparar fetchTourCandidatos via avaliarTourAutomatico'
    )
  })

  test('updateContext() redispara avaliação automática de tour', async () => {
    userPulseInit({ sistema: 'erp', tela: 'agenda', usuario_id: 'u1' })
    await tick()
    await tick()
    chamadasRastreamento = []

    updateContext({ cliente_id: '123' })
    await tick()
    await tick()
    assert.ok(
      chamadasRastreamento.some(c => c.url.indexOf('/api/widget/tour/candidatas') !== -1),
      'updateContext() deveria redisparar avaliarTourAutomatico'
    )
  })

  test('handleUrlChange (navegação SPA) redispara avaliação automática de tour', async () => {
    userPulseInit({ sistema: 'erp', tela: 'agenda', usuario_id: 'u1' })
    await tick()
    await tick()
    chamadasRastreamento = []

    const win = sandboxCompartilhado!.window as { location: { pathname: string; href: string } }
    win.location.pathname = '/app/relatorios'
    win.location.href = 'http://localhost/app/relatorios'
    handleUrlChange(true)
    // handleUrlChange debounça o trabalho de verdade em window.setTimeout(...,
    // 200) antes de reavaliar — o sandbox usa o setTimeout real (não uma fila
    // fake), então é preciso esperar o debounce de verdade, não só um tick de
    // microtask.
    await new Promise(resolve => setTimeout(resolve, 260))
    await tick()
    assert.ok(
      chamadasRastreamento.some(c => c.url.indexOf('/api/widget/tour/candidatas') !== -1),
      'handleUrlChange() deveria redisparar avaliarTourAutomatico numa navegação SPA'
    )
  })
})

describe('avaliarTourAutomatico/iniciarTourPublico não interferem com timers de campanha/destaque (widget.js)', () => {
  // state.timer (auto-open do modal de campanha) e state.destaqueTimer
  // (agendamento de destaque em elemento) foram separados em
  // "fix: corrigir reexibição de campanha modal em navegação SPA" — bug
  // coberto em widgetCampanhaModalReexibicao.test.ts. Tour usa tourState
  // (objeto isolado, próprio), nunca `state` (campanha) — checagem estática
  // do texto-fonte das duas funções restauradas nesta fase, confirmando que
  // nenhuma delas voltou a referenciar state.timer/state.destaqueTimer.
  test('corpo de avaliarTourAutomatico não referencia state.timer nem state.destaqueTimer', () => {
    const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
    const inicio = codigo.indexOf('function avaliarTourAutomatico(config) {')
    const fim = codigo.indexOf('function aguardarAparenciaEIniciarTour(tour) {')
    assert.ok(inicio > -1 && fim > inicio, 'não encontrou os marcadores de início/fim de avaliarTourAutomatico no widget.js')
    const corpo = codigo.slice(inicio, fim)
    assert.equal(corpo.indexOf('state.timer'), -1)
    assert.equal(corpo.indexOf('state.destaqueTimer'), -1)
  })

  test('corpo de iniciarTourPublico não referencia state.timer nem state.destaqueTimer', () => {
    const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
    const inicio = codigo.indexOf('function iniciarTourPublico(slug, jornadaContexto) {')
    const fim = codigo.indexOf('// ─── Onboarding Guiado (Jornadas)')
    assert.ok(inicio > -1 && fim > inicio, 'não encontrou os marcadores de início/fim de iniciarTourPublico no widget.js')
    const corpo = codigo.slice(inicio, fim)
    assert.equal(corpo.indexOf('state.timer'), -1)
    assert.equal(corpo.indexOf('state.destaqueTimer'), -1)
  })

  test('jornadaEtapaClicar continua chamando iniciarTour(etapa.tour, ...) direto, nunca iniciarTourPublico', () => {
    const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
    assert.match(codigo, /iniciarTour\(etapa\.tour, false, false, false\)/)
    assert.match(codigo, /iniciarTour\(etapa\.tour, false, false, false, \{/)
  })
})
