import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é IIFE de navegador — carregado via vm, mesmo padrão de
// widgetCampaignIcon.test.ts. campanhaIconeMarca é pura (só lê
// campanha.icone_url / campanha.tipo; nunca toca document/fetch/localStorage)
// — exposta via _internal. Trava a regra da marca do cabeçalho:
//   com icone_url  -> <img class="up-brand-img"> + <span> fallback + onerror
//   sem icone_url  -> SVG do ícone por tipo (campaignIconName)
// Geometria/CSS (.up-brand-icon-img, object-fit) é validada por homologação
// manual, não por node:test.

type Campanha = { tipo?: unknown; icone_url?: unknown } | null | undefined
type CampanhaIconeMarca = (campanha: Campanha) => string

let campanhaIconeMarca: CampanhaIconeMarca

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
  campanhaIconeMarca = internal!.campanhaIconeMarca as CampanhaIconeMarca
  assert.equal(typeof campanhaIconeMarca, 'function', 'campanhaIconeMarca não exposta')
})

describe('campanhaIconeMarca (widget.js) — imagem opcional do ícone da campanha', () => {
  const svgSemImg = (tipo: string) => campanhaIconeMarca({ tipo })

  test('sem icone_url -> SVG do ícone por tipo, sem <img>', () => {
    const html = svgSemImg('pesquisa')
    assert.ok(html.startsWith('<svg'), 'deve ser o SVG do ícone padrão')
    assert.ok(!html.includes('<img'), 'não deve renderizar <img> sem icone_url')
    assert.notEqual(svgSemImg('pesquisa'), svgSemImg('comunicado'))
  })

  test('icone_url null / "" / só espaços / tipo errado -> ícone por tipo (não quebra layout)', () => {
    const icone = svgSemImg('melhoria')
    assert.equal(campanhaIconeMarca({ tipo: 'melhoria', icone_url: null }), icone)
    assert.equal(campanhaIconeMarca({ tipo: 'melhoria', icone_url: '' }), icone)
    assert.equal(campanhaIconeMarca({ tipo: 'melhoria', icone_url: '   ' }), icone)
    assert.equal(campanhaIconeMarca({ tipo: 'melhoria', icone_url: 42 }), icone)
    assert.ok(!icone.includes('<img'))
  })

  test('com icone_url -> <img class="up-brand-img" src=...> + <span> fallback + onerror', () => {
    const html = campanhaIconeMarca({ tipo: 'pesquisa', icone_url: 'https://cdn.exemplo.com/icone.png' })
    assert.ok(html.includes('<img'))
    assert.ok(html.includes('class="up-brand-img"'))
    assert.ok(html.includes('src="https://cdn.exemplo.com/icone.png"'))
    assert.ok(html.includes('onerror='), 'deve ter fallback onerror')
    assert.ok(html.includes('up-brand-fallback'), 'deve embutir o ícone de fallback')
    assert.ok(html.includes('up-brand-icon-img'), 'onerror deve reverter a classe de fundo branco')
  })

  test('icone_url com aspas/HTML é escapado no atributo src', () => {
    const html = campanhaIconeMarca({ tipo: 'pesquisa', icone_url: 'https://x.com/a"><script>alert(1)</script>' })
    assert.ok(!html.includes('<script>'), 'não pode injetar <script>')
    assert.ok(html.includes('&quot;') || html.includes('&#34;'), 'aspas escapadas')
  })

  test('imagem tem prioridade mesmo com tipo desconhecido', () => {
    const html = campanhaIconeMarca({ tipo: 'xpto', icone_url: 'https://cdn/i.svg' })
    assert.ok(html.includes('src="https://cdn/i.svg"'))
  })

  test('campanha null/undefined -> não lança, cai no ícone padrão', () => {
    assert.ok(campanhaIconeMarca(null).startsWith('<svg'))
    assert.ok(campanhaIconeMarca(undefined).startsWith('<svg'))
  })
})
