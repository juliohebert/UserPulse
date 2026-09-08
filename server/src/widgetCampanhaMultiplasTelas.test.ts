import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE) — carregado via vm com stubs
// mínimos, mesmo padrão de widgetCampaignIcon.test.ts. Aqui trava o núcleo
// de "múltiplas telas/URLs por campanha":
//   - checkMode: OR entre campanha.regras (ou cai nos campos legados quando
//     `regras` não vem — resposta antiga / compat);
//   - checkRegra: avalia UMA regra (sistema_tela / url_contem / data_cy);
//   - campanhaTemModo: usado pela reavaliação por mudança de URL (SPA);
//   - shownKey: campanha com 2+ regras usa chave POR CAMPANHA (não por
//     tela), pra dispensar numa tela suprimir em todas as configuradas;
//     campanha de 1 regra mantém EXATAMENTE a chave de antes.
type Regra = { modo_identificacao?: string; tela?: string | null; url_contem?: string | null; data_cy?: string | null }
type Campanha = { id?: string; modo_identificacao?: string; tela?: string | null; url_contem?: string | null; data_cy?: string | null; regras?: Regra[] }
type Config = { slug?: string; sistema?: string; tela?: string; usuario_id?: string }

let checkMode: (c: Campanha, cfg: Config) => boolean
let checkRegra: (r: Regra, cfg: Config) => boolean
let campanhaTemModo: (c: Campanha, modo: string) => boolean
let shownKey: (c: Campanha, cfg: Config, itemId?: string | null) => string

let fakeLocation: { href: string; pathname: string; search: string; hash: string }
let elementosDataCy: Set<string>

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  fakeLocation = { href: 'http://localhost/', pathname: '/', search: '', hash: '' }
  elementosDataCy = new Set()
  const doc = {
    currentScript: { src: 'http://localhost/widget.js' },
    querySelectorAll: () => [],
    querySelector: (sel: string) => {
      const m = /^\[data-cy="(.+)"\]$/.exec(sel)
      return m && elementosDataCy.has(m[1]) ? {} : null
    },
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  }
  const sandbox: Record<string, unknown> = { console, URL, URLSearchParams, document: doc }
  sandbox.window = {
    get location() { return fakeLocation },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const internal = (sandbox.window as { UserPulse?: { _internal?: Record<string, unknown> } }).UserPulse?._internal
  assert.ok(internal, 'window.UserPulse._internal não foi exposto')
  checkMode = internal!.checkMode as typeof checkMode
  checkRegra = internal!.checkRegra as typeof checkRegra
  campanhaTemModo = internal!.campanhaTemModo as typeof campanhaTemModo
  shownKey = internal!.shownKey as typeof shownKey
  for (const nome of ['checkMode', 'checkRegra', 'campanhaTemModo', 'shownKey']) {
    assert.equal(typeof internal![nome], 'function', `${nome} não exposta`)
  }
})

beforeEach(() => {
  fakeLocation = { href: 'http://localhost/', pathname: '/', search: '', hash: '' }
  elementosDataCy = new Set()
})

describe('checkRegra — uma regra isolada', () => {
  test('sistema_tela: corresponde só quando a tela é exatamente a informada', () => {
    assert.equal(checkRegra({ modo_identificacao: 'sistema_tela', tela: 'Agenda' }, { tela: 'Agenda' }), true)
    assert.equal(checkRegra({ modo_identificacao: 'sistema_tela', tela: 'Agenda' }, { tela: 'Prontuario' }), false)
  })

  test('url_contem: casa por prefixo de path', () => {
    fakeLocation = { href: 'http://x/app/faturamento/abrir', pathname: '/app/faturamento/abrir', search: '', hash: '' }
    assert.equal(checkRegra({ modo_identificacao: 'url_contem', url_contem: '/app/faturamento' }, {}), true)
    assert.equal(checkRegra({ modo_identificacao: 'url_contem', url_contem: '/app/agenda' }, {}), false)
  })

  test('data_cy: casa quando o elemento existe no DOM', () => {
    elementosDataCy.add('btn-x')
    assert.equal(checkRegra({ modo_identificacao: 'data_cy', data_cy: 'btn-x' }, {}), true)
    assert.equal(checkRegra({ modo_identificacao: 'data_cy', data_cy: 'btn-y' }, {}), false)
  })
})

describe('checkMode — OR entre campanha.regras (múltiplas telas/URLs)', () => {
  test('campanha antiga: SEM `regras` -> cai nos campos legados (comportamento inalterado)', () => {
    const c: Campanha = { modo_identificacao: 'sistema_tela', tela: 'Agenda' }
    assert.equal(checkMode(c, { tela: 'Agenda' }), true)
    assert.equal(checkMode(c, { tela: 'Financeiro' }), false)
  })

  test('2 telas: a campanha aparece em CADA uma delas', () => {
    const c: Campanha = {
      modo_identificacao: 'sistema_tela', tela: 'Agenda',
      regras: [
        { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
        { modo_identificacao: 'sistema_tela', tela: 'Prontuario' },
      ],
    }
    assert.equal(checkMode(c, { tela: 'Agenda' }), true)
    assert.equal(checkMode(c, { tela: 'Prontuario' }), true)
    assert.equal(checkMode(c, { tela: 'Financeiro' }), false) // não configurada
  })

  test('regras mistas (tela + url_contem + data_cy) — qualquer uma que casar já basta', () => {
    elementosDataCy.add('menu-novo')
    const c: Campanha = {
      regras: [
        { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
        { modo_identificacao: 'url_contem', url_contem: '/app/faturamento' },
        { modo_identificacao: 'data_cy', data_cy: 'menu-novo' },
      ],
    }
    assert.equal(checkMode(c, { tela: 'Agenda' }), true)                       // por tela
    fakeLocation = { href: 'http://x/app/faturamento', pathname: '/app/faturamento', search: '', hash: '' }
    assert.equal(checkMode(c, { tela: 'Outra' }), true)                        // por URL
    fakeLocation = { href: 'http://x/nada', pathname: '/nada', search: '', hash: '' }
    assert.equal(checkMode(c, { tela: 'Outra' }), true)                        // por data_cy
    elementosDataCy.clear()
    assert.equal(checkMode(c, { tela: 'Outra' }), false)                       // nenhuma regra casa
  })

  test('duas regras compatíveis ao mesmo tempo -> checkMode retorna UM booleano (nunca "duplica")', () => {
    fakeLocation = { href: 'http://x/app/agenda', pathname: '/app/agenda', search: '', hash: '' }
    const c: Campanha = {
      regras: [
        { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
        { modo_identificacao: 'url_contem', url_contem: '/app/agenda' },
      ],
    }
    const r = checkMode(c, { tela: 'Agenda' })
    assert.equal(r, true)
    assert.equal(typeof r, 'boolean')
  })

  test('lista `regras` vazia -> cai nos campos legados', () => {
    assert.equal(checkMode({ modo_identificacao: 'sistema_tela', tela: 'Agenda', regras: [] }, { tela: 'Agenda' }), true)
  })
})

describe('campanhaTemModo — usado pela reavaliação por mudança de URL (SPA)', () => {
  test('true quando alguma regra é do modo pedido', () => {
    const c: Campanha = { regras: [{ modo_identificacao: 'sistema_tela', tela: 'A' }, { modo_identificacao: 'url_contem', url_contem: '/x' }] }
    assert.equal(campanhaTemModo(c, 'url_contem'), true)
    assert.equal(campanhaTemModo(c, 'data_cy'), false)
  })

  test('sem `regras` -> usa o modo_identificacao legado', () => {
    assert.equal(campanhaTemModo({ modo_identificacao: 'url_contem', url_contem: '/x' }, 'url_contem'), true)
    assert.equal(campanhaTemModo({ modo_identificacao: 'sistema_tela', tela: 'A' }, 'url_contem'), false)
  })
})

describe('shownKey — dedupe de "já visto" por navegação SPA', () => {
  test('campanha de 1 regra: chave IDÊNTICA à de antes (sistema:tela) — sem regressão', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'sistema_tela', tela: 'Agenda' }] }
    assert.equal(shownKey(c, { sistema: 'quark', tela: 'Agenda' }), 'userpulse:shown:c1:quark:Agenda')
  })

  test('campanha de 1 regra sem `regras` (legado) também mantém a chave por tela', () => {
    assert.equal(shownKey({ id: 'c1' }, { sistema: 'quark', tela: 'Agenda' }), 'userpulse:shown:c1:quark:Agenda')
  })

  test('campanha com 2+ regras: chave POR CAMPANHA (sistema:*) — dispensar numa tela suprime em todas', () => {
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'sistema_tela', tela: 'Prontuario' },
    ] }
    const kAgenda = shownKey(c, { sistema: 'quark', tela: 'Agenda' })
    const kProntuario = shownKey(c, { sistema: 'quark', tela: 'Prontuario' })
    assert.equal(kAgenda, 'userpulse:shown:c1:quark:*')
    assert.equal(kAgenda, kProntuario) // mesma chave nas duas telas
  })

  test('slug tem prioridade sobre sistema:tela (inalterado)', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'sistema_tela', tela: 'A' }, { modo_identificacao: 'sistema_tela', tela: 'B' }] }
    assert.equal(shownKey(c, { slug: 'promo', sistema: 'quark', tela: 'A' }), 'userpulse:shown:c1:promo')
  })
})
