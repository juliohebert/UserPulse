import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é IIFE de navegador — carregado via vm, mesmo padrão de
// widgetCampaignIcon.test.ts. campanhaBrandIcone é pura (recebe campanha +
// aparencia já resolvida; nunca toca document/fetch/localStorage) — exposta
// via _internal. Trava a REGRA da marca do cabeçalho da modal/NPS:
//   com aparencia.logo_url  -> <img class="up-brand-logo"> + <span> fallback
//   sem logo (null/''/espaço/tipo errado) -> ícone por tipo (campaignIconName)
// A geometria/CSS (.up-brand-icon-logo, object-fit) é validada por
// homologação manual, não por node:test.

type Campanha = { tipo?: unknown } | null | undefined
type Aparencia = { cor_principal?: unknown; logo_url?: unknown } | null | undefined
type CampanhaBrandIcone = (campanha: Campanha, aparencia: Aparencia) => string

let campanhaBrandIcone: CampanhaBrandIcone

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console, URL, URLSearchParams,
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      querySelectorAll: () => [], getElementById: () => null,
      addEventListener() {}, removeEventListener() {},
    },
  }
  sandbox.window = {
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const internal = (sandbox.window as { UserPulse?: { _internal?: Record<string, unknown> } }).UserPulse?._internal
  assert.ok(internal, '_internal não exposto por widget.js')
  campanhaBrandIcone = internal!.campanhaBrandIcone as CampanhaBrandIcone
  assert.equal(typeof campanhaBrandIcone, 'function', 'campanhaBrandIcone não exposta')
})

describe('campanhaBrandIcone (widget.js) — identidade visual do sistema/tenant na modal/NPS', () => {
  // campanhaBrandIcone devolve o SVG já renderizado (icon(nome)); _internal
  // .campaignIconName devolve só o NOME. No caminho sem logo os dois têm que
  // apontar pro mesmo ícone — comparamos gerando o mesmo SVG pra tipos
  // diferentes (se a regra divergir, um dos pares quebra).
  const svgSemLogo = (tipo: string) => campanhaBrandIcone({ tipo }, null)

  test('sem aparência -> SVG do ícone por tipo, sem <img>', () => {
    const html = svgSemLogo('pesquisa')
    assert.ok(html.startsWith('<svg'), 'deve ser o SVG do ícone')
    assert.ok(!html.includes('<img'), 'não deve renderizar <img> sem logo')
    // paridade de regra: tipos diferentes -> SVGs diferentes; mesmo tipo -> igual
    assert.notEqual(svgSemLogo('pesquisa'), svgSemLogo('melhoria'))
    assert.equal(svgSemLogo('pesquisa'), svgSemLogo('pesquisa'))
  })

  test('aparência sem logo_url -> mesmo SVG do caminho sem aparência', () => {
    assert.equal(campanhaBrandIcone({ tipo: 'melhoria' }, { cor_principal: '#123456', logo_url: null }), svgSemLogo('melhoria'))
  })

  test('logo vazia / só espaços / tipo errado -> ícone por tipo (não quebra layout)', () => {
    const icone = svgSemLogo('comunicado')
    assert.equal(campanhaBrandIcone({ tipo: 'comunicado' }, { logo_url: '' }), icone)
    assert.equal(campanhaBrandIcone({ tipo: 'comunicado' }, { logo_url: '   ' }), icone)
    assert.equal(campanhaBrandIcone({ tipo: 'comunicado' }, { logo_url: 123 }), icone)
    assert.ok(!icone.includes('<img'))
  })

  test('com logo_url -> <img class="up-brand-logo"> apontando pra logo + <span> fallback + onerror', () => {
    const html = campanhaBrandIcone({ tipo: 'pesquisa' }, { cor_principal: '#0a7', logo_url: 'https://cdn.exemplo.com/logo.png' })
    assert.ok(html.includes('<img'), 'deve renderizar <img>')
    assert.ok(html.includes('class="up-brand-logo"'))
    assert.ok(html.includes('src="https://cdn.exemplo.com/logo.png"'))
    assert.ok(html.includes('onerror='), 'deve ter fallback onerror')
    assert.ok(html.includes('up-brand-fallback'), 'deve embutir o ícone de fallback')
    assert.ok(html.includes('up-brand-icon-logo'), 'onerror deve reverter a classe de fundo branco')
  })

  test('logo_url com aspas/HTML é escapado no atributo src', () => {
    const html = campanhaBrandIcone({ tipo: 'pesquisa' }, { logo_url: 'https://x.com/a"><script>alert(1)</script>' })
    assert.ok(!html.includes('<script>'), 'não pode injetar <script>')
    assert.ok(html.includes('&quot;') || html.includes('&#34;'), 'aspas devem ser escapadas')
  })

  test('logo tem prioridade mesmo com tipo desconhecido', () => {
    const html = campanhaBrandIcone({ tipo: 'xpto' }, { logo_url: 'https://cdn/logo.svg' })
    assert.ok(html.includes('src="https://cdn/logo.svg"'))
  })
})
