import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

type Harness = {
  internal: {
    presentationEnfileirar(item: Record<string, unknown>): boolean
    presentationAssumirFoco(item: Record<string, unknown>): boolean
    presentationLiberar(key?: string): boolean
    presentationNovoContexto(): void
    presentationIniciarColeta(): () => void
    presentationGetTestSnapshot(): { ativo: string | null; aguardando: string[]; geracaoContexto: number }
    presentationResetTestState(): void
  }
}

let harness: Harness

beforeEach(() => {
  const eventos: string[] = []
  const fakeDocument = {
    currentScript: null,
    documentElement: { clientWidth: 1024 },
    body: { appendChild() {} },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  }
  const window: Record<string, unknown> = {
    location: { origin: 'https://app.test', href: 'https://app.test/inicio', pathname: '/inicio', search: '', hash: '' },
    navigator: { userAgent: 'test' },
    innerWidth: 1024,
    setTimeout: (fn: () => void) => { fn(); return 1 },
    clearTimeout() {},
    UserPulse: {},
  }
  const context = vm.createContext({ window, document: fakeDocument, console, URL, URLSearchParams, Date, Math, fetch: () => Promise.reject(new Error('unused')), eventos })
  const source = fs.readFileSync(path.resolve(process.cwd(), '../web/public/widget.js'), 'utf8')
  vm.runInContext(source, context)
  harness = { internal: (window.UserPulse as { _internal: Harness['internal'] })._internal }
  harness.internal.presentationResetTestState()
})

test('ordena por classe, prioridade e sequência, mantendo um único item ativo', () => {
  const aberturas: string[] = []
  harness.internal.presentationEnfileirar({ key: 'baixo', tipo: 'tour', prioridadeClasse: 6, abrir: () => aberturas.push('baixo') })
  harness.internal.presentationEnfileirar({ key: 'manual', tipo: 'tour', prioridadeClasse: 1, abrir: () => aberturas.push('manual') })
  harness.internal.presentationEnfileirar({ key: 'outro', tipo: 'campanha', prioridadeClasse: 1, prioridadeNegocio: 10, abrir: () => aberturas.push('outro') })

  assert.deepEqual(aberturas, ['baixo'])
  assert.equal(JSON.stringify(harness.internal.presentationGetTestSnapshot()), JSON.stringify({ ativo: 'baixo', aguardando: ['outro', 'manual'], geracaoContexto: 0 }))
  harness.internal.presentationLiberar()
  assert.deepEqual(aberturas, ['baixo', 'outro'])
})

test('deduplica candidaturas e descarta itens de geração antiga', () => {
  let aberturas = 0
  const item = { key: 'tour:1:autonomo:', tipo: 'tour', abrir: () => { aberturas++ } }
  assert.equal(harness.internal.presentationEnfileirar(item), true)
  assert.equal(harness.internal.presentationEnfileirar(item), false)
  harness.internal.presentationNovoContexto()
  assert.equal(harness.internal.presentationLiberar(), true)
  assert.equal(aberturas, 1)
  assert.equal(JSON.stringify(harness.internal.presentationGetTestSnapshot().aguardando), '[]')
})

test('preserva ação explícita aguardando após mudança de contexto', () => {
  const aberturas: string[] = []
  harness.internal.presentationEnfileirar({ key: 'ativo', tipo: 'tour', prioridadeClasse: 5, abrir: () => aberturas.push('ativo') })
  harness.internal.presentationEnfileirar({ key: 'manual', tipo: 'tour', origem: 'usuario', prioridadeClasse: 1, abrir: () => aberturas.push('manual') })

  harness.internal.presentationNovoContexto()
  assert.equal(JSON.stringify(harness.internal.presentationGetTestSnapshot().aguardando), JSON.stringify(['manual']))
  harness.internal.presentationLiberar('ativo')
  assert.deepEqual(aberturas, ['ativo', 'manual'])
})

test('liberação com chave errada não altera o foco', () => {
  harness.internal.presentationEnfileirar({ key: 'ativo', tipo: 'tour', abrir() {} })
  assert.equal(harness.internal.presentationLiberar('outro'), false)
  assert.equal(harness.internal.presentationGetTestSnapshot().ativo, 'ativo')
})

test('ação explícita assume o foco atomicamente antes de qualquer pendente', () => {
  const aberturas: string[] = []
  harness.internal.presentationEnfileirar({ key: 'central', tipo: 'jornada_panel', abrir: () => aberturas.push('central') })
  harness.internal.presentationEnfileirar({ key: 'automatico', tipo: 'campanha', prioridadeClasse: 1, abrir: () => aberturas.push('automatico') })

  harness.internal.presentationAssumirFoco({ key: 'etapa-clicada', tipo: 'tour', origem: 'usuario', prioridadeClasse: 1, abrir: () => aberturas.push('etapa-clicada') })

  assert.deepEqual(aberturas, ['central', 'etapa-clicada'])
  assert.equal(harness.internal.presentationGetTestSnapshot().ativo, 'etapa-clicada')
  assert.equal(JSON.stringify(harness.internal.presentationGetTestSnapshot().aguardando), JSON.stringify(['automatico']))
})

test('revalida candidatura imediatamente antes de abrir', () => {
  const aberturas: string[] = []
  harness.internal.presentationEnfileirar({ key: 'central', abrir() {} })
  harness.internal.presentationEnfileirar({ key: 'stale', prioridadeClasse: 1, validar: () => false, abrir: () => aberturas.push('stale') })
  harness.internal.presentationEnfileirar({ key: 'valido', prioridadeClasse: 2, validar: () => true, abrir: () => aberturas.push('valido') })

  harness.internal.presentationLiberar('central')
  assert.deepEqual(aberturas, ['valido'])
})

test('Tour automático vence Campanha informativa coletada na mesma janela', () => {
  const aberturas: string[] = []
  harness.internal.presentationEnfileirar({ key: 'coleta', abrir() {} })
  harness.internal.presentationEnfileirar({ key: 'campanha', origem: 'autonomo', prioridadeClasse: 6, abrir: () => aberturas.push('campanha') })
  harness.internal.presentationEnfileirar({ key: 'tour', origem: 'autonomo', prioridadeClasse: 4, abrir: () => aberturas.push('tour') })

  harness.internal.presentationLiberar('coleta')
  assert.deepEqual(aberturas, ['tour'])
})

test('aguarda todas as avaliações automáticas antes do drain', () => {
  const aberturas: string[] = []
  const fimCampanha = harness.internal.presentationIniciarColeta()
  const fimTour = harness.internal.presentationIniciarColeta()
  harness.internal.presentationEnfileirar({ key: 'campanha', prioridadeClasse: 6, abrir: () => aberturas.push('campanha') })
  fimCampanha()
  assert.deepEqual(aberturas, [])
  harness.internal.presentationEnfileirar({ key: 'tour', prioridadeClasse: 4, abrir: () => aberturas.push('tour') })
  fimTour()
  assert.deepEqual(aberturas, ['tour'])
})

test('evento do host perde validade ao mudar a geração de contexto', () => {
  harness.internal.presentationEnfileirar({ key: 'ocupado', abrir() {} })
  harness.internal.presentationEnfileirar({ key: 'host', origem: 'host', abrir() {} })
  harness.internal.presentationNovoContexto()
  assert.equal(JSON.stringify(harness.internal.presentationGetTestSnapshot().aguardando), '[]')
})
