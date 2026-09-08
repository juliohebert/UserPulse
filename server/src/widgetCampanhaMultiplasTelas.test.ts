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
type Campanha = { id?: string; modo_identificacao?: string; tela?: string | null; url_contem?: string | null; data_cy?: string | null; regras?: Regra[]; regras_bloqueadas?: string[]; mostrar_uma_vez?: boolean; permitir_fechar_modal?: boolean; _regraCasada?: Regra | null }
type Config = { slug?: string; sistema?: string; tela?: string; usuario_id?: string; contexto?: Record<string, unknown> | null }

let checkMode: (c: Campanha, cfg: Config) => boolean
let checkModeRegra: (c: Campanha, cfg: Config) => Regra | null
let checkRegra: (r: Regra, cfg: Config) => boolean
let campanhaTemModo: (c: Campanha, modo: string) => boolean
let chaveRegraExibicao: (r: Regra | null | undefined) => string | null
let contextoComRegra: (cfg: Config, c: Campanha) => Record<string, unknown> | undefined
let shownKey: (c: Campanha, cfg: Config, itemId?: string | null) => string
let wasShown: (c: Campanha, cfg: Config, itemId?: string | null) => boolean

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
  checkModeRegra = internal!.checkModeRegra as typeof checkModeRegra
  checkRegra = internal!.checkRegra as typeof checkRegra
  campanhaTemModo = internal!.campanhaTemModo as typeof campanhaTemModo
  chaveRegraExibicao = internal!.chaveRegraExibicao as typeof chaveRegraExibicao
  contextoComRegra = internal!.contextoComRegra as typeof contextoComRegra
  shownKey = internal!.shownKey as typeof shownKey
  wasShown = internal!.wasShown as typeof wasShown
  for (const nome of ['checkMode', 'checkModeRegra', 'checkRegra', 'campanhaTemModo', 'chaveRegraExibicao', 'contextoComRegra', 'shownKey', 'wasShown']) {
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

  test('campanha com 2+ regras: chave POR REGRA/destino — dispensar numa NÃO suprime a outra', () => {
    // Cenário do report: 2 regras url_contem, config.tela vazia nas duas.
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'url_contem', url_contem: '/app/home' },
      { modo_identificacao: 'url_contem', url_contem: '/app/profissional-saude' },
    ] }
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    checkModeRegra(c, { sistema: 'quark', tela: '' })  // fixa _regraCasada = /app/home
    const kHome = shownKey(c, { sistema: 'quark', tela: '' })

    fakeLocation = { href: 'http://x/app/profissional-saude', pathname: '/app/profissional-saude', search: '', hash: '' }
    checkModeRegra(c, { sistema: 'quark', tela: '' })  // fixa _regraCasada = /app/profissional-saude
    const kProf = shownKey(c, { sistema: 'quark', tela: '' })

    assert.equal(kHome, 'userpulse:shown:c1:quark::r:uc|/app/home')
    assert.notEqual(kHome, kProf)  // escopos separados -> dispensar num não afeta o outro
    assert.equal(kProf, 'userpulse:shown:c1:quark::r:uc|/app/profissional-saude')
  })

  test('2+ regras sistema_tela: chave por tela E por regra (redundante, mas independente)', () => {
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'sistema_tela', tela: 'Prontuario' },
    ] }
    checkModeRegra(c, { sistema: 'quark', tela: 'Agenda' })
    const kAgenda = shownKey(c, { sistema: 'quark', tela: 'Agenda' })
    checkModeRegra(c, { sistema: 'quark', tela: 'Prontuario' })
    const kProntuario = shownKey(c, { sistema: 'quark', tela: 'Prontuario' })
    assert.equal(kAgenda, 'userpulse:shown:c1:quark:Agenda:r:st|Agenda')
    assert.notEqual(kAgenda, kProntuario)
  })

  test('nenhuma regra casada (checkModeRegra não rodou) -> cai na chave por tela, sem :r:', () => {
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'sistema_tela', tela: 'Prontuario' },
    ] }
    assert.equal(shownKey(c, { sistema: 'quark', tela: 'Agenda' }), 'userpulse:shown:c1:quark:Agenda')
  })

  test('slug: base vira o slug, mas o recorte :r: por regra continua valendo (multi-regra)', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'sistema_tela', tela: 'A' }, { modo_identificacao: 'sistema_tela', tela: 'B' }] }
    checkModeRegra(c, { slug: 'promo', sistema: 'quark', tela: 'A' })
    assert.equal(shownKey(c, { slug: 'promo', sistema: 'quark', tela: 'A' }), 'userpulse:shown:c1:promo:r:st|A')
  })

  test('slug + campanha de 1 regra -> chave = só o slug (idêntica à de antes)', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'sistema_tela', tela: 'A' }] }
    checkModeRegra(c, { slug: 'promo', sistema: 'quark', tela: 'A' })
    assert.equal(shownKey(c, { slug: 'promo', sistema: 'quark', tela: 'A' }), 'userpulse:shown:c1:promo')
  })
})

// ─── checkModeRegra — qual regra casou (base do escopo por destino) ───────
describe('checkModeRegra', () => {
  test('retorna a PRIMEIRA regra que casa e a guarda em _regraCasada', () => {
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'url_contem', url_contem: '/app/faturamento' },
      { modo_identificacao: 'url_contem', url_contem: '/app/home' },
    ] }
    const r = checkModeRegra(c, { sistema: 'quark', tela: '' })
    assert.equal(r && r.url_contem, '/app/home')
    assert.equal(c._regraCasada && c._regraCasada.url_contem, '/app/home')
  })

  test('nenhuma casa -> null, _regraCasada = null', () => {
    fakeLocation = { href: 'http://x/nada', pathname: '/nada', search: '', hash: '' }
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'url_contem', url_contem: '/app/x' }] }
    assert.equal(checkModeRegra(c, { sistema: 'quark', tela: '' }), null)
    assert.equal(c._regraCasada, null)
  })

  test('campanha SEM `regras` (legado) -> pseudo-regra dos campos legados', () => {
    const c: Campanha = { id: 'c1', modo_identificacao: 'sistema_tela', tela: 'Agenda' }
    const r = checkModeRegra(c, { sistema: 'quark', tela: 'Agenda' })
    assert.ok(r && r.modo_identificacao === 'sistema_tela' && r.tela === 'Agenda')
  })

  test('2 regras casando na MESMA página -> fixa só a primeira (não duplica)', () => {
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'url_contem', url_contem: '/app/home' },
      { modo_identificacao: 'url_contem', url_contem: '/app' },   // também casa /app/home
    ] }
    const r = checkModeRegra(c, { sistema: 'quark', tela: '' })
    assert.equal(r && r.url_contem, '/app/home')  // a 1ª, sempre a mesma
    assert.equal(checkMode(c, { sistema: 'quark', tela: '' }), true)  // 1 booleano
  })
})

// ─── wasShown identificado — recorte por regra via regras_bloqueadas ─────
describe('wasShown (usuário identificado) — bloqueio POR REGRA do servidor', () => {
  const cfg = { sistema: 'quark', tela: '', usuario_id: 'u1' }
  function campanha(regrasBloqueadas?: string[]): Campanha {
    return {
      id: 'c1', mostrar_uma_vez: true, permitir_fechar_modal: true,
      regras: [
        { modo_identificacao: 'url_contem', url_contem: '/app/home' },
        { modo_identificacao: 'url_contem', url_contem: '/app/profissional-saude' },
      ],
      regras_bloqueadas: regrasBloqueadas,
    }
  }

  test('regra casada está em regras_bloqueadas -> wasShown true', () => {
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    const c = campanha(['uc|/app/home'])
    checkModeRegra(c, cfg)
    assert.equal(wasShown(c, cfg), true)
  })

  test('regra casada NÃO está na lista -> wasShown false (outro destino segue livre)', () => {
    fakeLocation = { href: 'http://x/app/profissional-saude', pathname: '/app/profissional-saude', search: '', hash: '' }
    const c = campanha(['uc|/app/home'])  // só /app/home bloqueada no servidor
    checkModeRegra(c, cfg)
    assert.equal(wasShown(c, cfg), false)
  })

  test('sem regras_bloqueadas (ou vazio) -> wasShown false (comportamento de 1 regra inalterado)', () => {
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    const c = campanha([])
    checkModeRegra(c, cfg)
    assert.equal(wasShown(c, cfg), false)
    const c2 = campanha(undefined)
    checkModeRegra(c2, cfg)
    assert.equal(wasShown(c2, cfg), false)
  })
})

// ─── contextoComRegra — carimbo __up_regra só p/ campanha multi-regra ────
describe('contextoComRegra', () => {
  test('campanha 2+ regras com regra casada -> mescla __up_regra sem mutar o contexto do host', () => {
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    const host = { usuario_tipo: 'MEDICO' }
    const c: Campanha = { id: 'c1', regras: [
      { modo_identificacao: 'url_contem', url_contem: '/app/home' },
      { modo_identificacao: 'url_contem', url_contem: '/app/x' },
    ] }
    checkModeRegra(c, { sistema: 'quark', tela: '' })
    const out = contextoComRegra({ sistema: 'quark', tela: '', contexto: host }, c)
    // `out` nasce no realm do vm -> compara via spread p/ um objeto do realm do teste.
    assert.deepEqual({ ...out }, { usuario_tipo: 'MEDICO', __up_regra: 'uc|/app/home' })
    assert.deepEqual({ ...host }, { usuario_tipo: 'MEDICO' })  // host intacto
  })

  test('campanha de 1 regra -> devolve o contexto do host puro (sem __up_regra)', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'url_contem', url_contem: '/app/home' }] }
    fakeLocation = { href: 'http://x/app/home', pathname: '/app/home', search: '', hash: '' }
    checkModeRegra(c, { sistema: 'quark', tela: '' })
    const ctx = { a: 1 }
    assert.equal(contextoComRegra({ sistema: 'quark', tela: '', contexto: ctx }, c), ctx)  // mesma ref, sem mexer
  })

  test('sem contexto de host e sem regra casada -> undefined', () => {
    const c: Campanha = { id: 'c1', regras: [{ modo_identificacao: 'url_contem', url_contem: '/x' }, { modo_identificacao: 'url_contem', url_contem: '/y' }] }
    assert.equal(contextoComRegra({ sistema: 'quark', tela: '' }, c), undefined)
  })
})
