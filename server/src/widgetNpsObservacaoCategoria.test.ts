import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um IIFE de navegador — carregado via vm, mesmo padrão de
// widgetCampanhaMultiplasTelas.test.ts. Aqui trava a decisão de exibir o
// campo de observação do NPS conforme a categoria da nota:
//   promotor 9-10 / neutro 7-8 / detrator 0-6.
// campanha.observacao_categorias (Json do backend). Ausente/categoria não
// configurada => comportamento LEGADO (campo sempre visível).

type Campanha = { observacao_categorias?: unknown; observacao_obrigatoria?: boolean }

let categoriaNotaNps: (nota: number) => 'promotor' | 'neutro' | 'detrator'
let resolverObservacaoNps: (c: Campanha, nota: number | null) => { legado: boolean; visivel: boolean; mensagem: string | null }
let observacaoObrigatoriaEfetivaNps: (c: Campanha, nota: number | null) => boolean

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console, URL, URLSearchParams,
    document: { currentScript: { src: 'http://localhost/widget.js' }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, addEventListener() {}, removeEventListener() {} },
  }
  sandbox.window = {
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const internal = (sandbox.window as { UserPulse?: { _internal?: Record<string, unknown> } }).UserPulse?._internal
  assert.ok(internal, '_internal não exposto')
  categoriaNotaNps = internal!.categoriaNotaNps as typeof categoriaNotaNps
  resolverObservacaoNps = internal!.resolverObservacaoNps as typeof resolverObservacaoNps
  observacaoObrigatoriaEfetivaNps = internal!.observacaoObrigatoriaEfetivaNps as typeof observacaoObrigatoriaEfetivaNps
  for (const n of ['categoriaNotaNps', 'resolverObservacaoNps', 'observacaoObrigatoriaEfetivaNps']) {
    assert.equal(typeof internal![n], 'function', `${n} não exposta`)
  }
})

describe('categoriaNotaNps', () => {
  test('9-10 promotor, 7-8 neutro, 0-6 detrator', () => {
    assert.equal(categoriaNotaNps(10), 'promotor')
    assert.equal(categoriaNotaNps(9), 'promotor')
    assert.equal(categoriaNotaNps(8), 'neutro')
    assert.equal(categoriaNotaNps(7), 'neutro')
    for (const n of [6, 4, 0]) assert.equal(categoriaNotaNps(n), 'detrator')
  })
})

describe('resolverObservacaoNps', () => {
  const cfg = {
    promotor: { habilitado: true, mensagem: 'O que te encantou?' },
    neutro: { habilitado: true, mensagem: '' },
    detrator: { habilitado: false, mensagem: 'x' },
  }
  // resolverObservacaoNps devolve um objeto criado no realm do vm — spread
  // pra um objeto do realm do teste antes de comparar (mesmo motivo de
  // contextoComRegra em widgetCampanhaMultiplasTelas.test.ts).
  const res = (c: Campanha, n: number | null) => ({ ...resolverObservacaoNps(c, n) })

  test('sem observacao_categorias -> legado (campo sempre visível)', () => {
    assert.deepEqual(res({}, 9), { legado: true, visivel: true, mensagem: null })
    assert.deepEqual(res({ observacao_categorias: null }, 3), { legado: true, visivel: true, mensagem: null })
  })

  test('com config + nota null -> campo escondido (aguarda a nota)', () => {
    assert.deepEqual(res({ observacao_categorias: cfg }, null), { legado: false, visivel: false, mensagem: null })
  })

  test('1. nota 9-10 usa promotor', () => {
    assert.deepEqual(res({ observacao_categorias: cfg }, 9), { legado: false, visivel: true, mensagem: 'O que te encantou?' })
    assert.deepEqual(res({ observacao_categorias: cfg }, 10), { legado: false, visivel: true, mensagem: 'O que te encantou?' })
  })

  test('2. nota 7-8 usa neutro (mensagem vazia -> null, mas visível)', () => {
    assert.deepEqual(res({ observacao_categorias: cfg }, 8), { legado: false, visivel: true, mensagem: null })
  })

  test('3+4. nota 0-6 usa detrator -> desabilitado -> não mostra', () => {
    assert.deepEqual(res({ observacao_categorias: cfg }, 6), { legado: false, visivel: false, mensagem: null })
    assert.deepEqual(res({ observacao_categorias: cfg }, 0), { legado: false, visivel: false, mensagem: null })
  })

  test('5. categoria ausente no objeto -> fallback legado', () => {
    assert.deepEqual(res({ observacao_categorias: { promotor: { habilitado: false } } }, 8), { legado: true, visivel: true, mensagem: null })
  })
})

describe('observacaoObrigatoriaEfetivaNps — desabilitada nunca bloqueia', () => {
  const cfg = { detrator: { habilitado: false, mensagem: '' }, promotor: { habilitado: true, mensagem: '' } }

  test('observacao_obrigatoria=false -> sempre false', () => {
    assert.equal(observacaoObrigatoriaEfetivaNps({ observacao_obrigatoria: false, observacao_categorias: cfg }, 9), false)
  })
  test('obrigatória + categoria visível -> true', () => {
    assert.equal(observacaoObrigatoriaEfetivaNps({ observacao_obrigatoria: true, observacao_categorias: cfg }, 9), true)
  })
  test('obrigatória + categoria desabilitada -> false (campo escondido)', () => {
    assert.equal(observacaoObrigatoriaEfetivaNps({ observacao_obrigatoria: true, observacao_categorias: cfg }, 2), false)
  })
  test('obrigatória + legado (sem config) -> true', () => {
    assert.equal(observacaoObrigatoriaEfetivaNps({ observacao_obrigatoria: true }, 2), true)
  })
})
