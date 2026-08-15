import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE, sem module.exports) — carregado
// via vm com stubs mínimos, mesmo padrão de widgetTourSegmentacao.test.ts.
// campaignIconName é uma função pura (só lê campanha.tipo, nunca toca em
// document/fetch/localStorage) — exposta via window.UserPulse._internal só
// pra este teste.
//
// Bug original: o ícone do cabeçalho do widget não batia com o preview do
// Campanhas 2. A REGRA de seleção (tipo -> nome do ícone) já era idêntica
// nos dois lados (campaignIconName aqui e iconeTipoCampanha/
// ICONES_TIPO_CAMPANHA em campanhas2/Index.tsx) — a divergência real estava
// na EXIBIÇÃO em widget.js: faltava `.up-brand-icon svg{width/height/fill}`
// (ícone saía estourado/com cor errada) e o desenho de icon('campaign') não
// era o path oficial do Material Symbols Outlined (formato errado). Ambos
// corrigidos diretamente em widget.js — não são testáveis por node:test
// (CSS/geometria de SVG), validados por leitura/homologação manual. Este
// arquivo trava só a REGRA de seleção em paridade com o admin, pra nunca
// mais divergir.
type CampaignIconName = (campanha: { tipo?: unknown } | null | undefined) => string

let campaignIconName: CampaignIconName

before(() => {
  const codigo = fs.readFileSync(
    path.resolve(__dirname, '../../web/public/widget.js'),
    'utf8'
  )
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
  }
  sandbox.window = {
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as { UserPulse?: { _internal?: { campaignIconName?: CampaignIconName } } }).UserPulse
  const fn = UserPulse?._internal?.campaignIconName
  assert.equal(typeof fn, 'function', 'window.UserPulse._internal.campaignIconName não foi exposta por widget.js')
  campaignIconName = fn as CampaignIconName
})

// Mesma tabela de campanhas2/Index.tsx (ICONES_TIPO_CAMPANHA/iconeTipoCampanha)
// — se um dos dois lados mudar sem o outro, este teste quebra.
const ICONES_TIPO_CAMPANHA_ADMIN: Record<string, string> = {
  comunicado: 'campaign',
  melhoria: 'rocket_launch',
  pesquisa: 'quiz',
}

describe('campaignIconName (widget.js) — paridade com o preview do Campanhas 2', () => {
  for (const [tipo, iconeEsperado] of Object.entries(ICONES_TIPO_CAMPANHA_ADMIN)) {
    test(`tipo "${tipo}" -> mesmo ícone do preview ("${iconeEsperado}")`, () => {
      assert.equal(campaignIconName({ tipo }), iconeEsperado)
    })
  }

  test('tipo desconhecido -> "campaign" (mesmo fallback de iconeTipoCampanha)', () => {
    assert.equal(campaignIconName({ tipo: 'formato-que-nao-existe' }), 'campaign')
  })

  test('tipo ausente/vazio -> "campaign"', () => {
    assert.equal(campaignIconName({ tipo: '' }), 'campaign')
    assert.equal(campaignIconName({}), 'campaign')
  })

  test('campanha null/undefined -> "campaign", sem lançar erro', () => {
    assert.equal(campaignIconName(null), 'campaign')
    assert.equal(campaignIconName(undefined), 'campaign')
  })

  test('determinística — mesma entrada sempre produz a mesma saída', () => {
    const campanha = { tipo: 'melhoria' }
    assert.equal(campaignIconName(campanha), campaignIconName(campanha))
  })
})
