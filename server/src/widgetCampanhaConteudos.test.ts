import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE, sem module.exports) — carregado
// aqui via vm com stubs MÍNIMOS, mesmo padrão de widgetTourSegmentacao.test.ts.
// conteudoResolverItens/conteudoResolverModoNavegacao são funções puras (só
// leem o objeto `campanha` recebido como argumento, nunca tocam em
// document/fetch/localStorage), então não precisam de DOM de verdade.
// Mecanismo independente de destaqueElementoResolverItens (ver
// widgetDestaqueElemento.test.ts) — nunca misturar os dois.
type ConteudoItem = {
  id?: string | null
  titulo?: unknown
  descricao?: unknown
  imagem_url?: unknown
  video_url?: unknown
  texto_botao?: unknown
  url_botao?: unknown
}
type Campanha = {
  titulo?: unknown
  descricao?: unknown
  imagem_url?: unknown
  video_url?: unknown
  texto_botao?: unknown
  url_botao?: unknown
  modo_navegacao?: unknown
  conteudos?: ConteudoItem[]
}
type ConteudoResolverItens = (campanha: Campanha | null | undefined) => ConteudoItem[]
type ConteudoResolverModoNavegacao = (campanha: Campanha | null | undefined) => string
type ConteudoRenderScroll = (itens: ConteudoItem[]) => string
type ConteudoRenderSlides = (itens: ConteudoItem[], indiceAtual: number) => string
type ConteudoResolverDirecaoSwipe = (deltaX: number, deltaY: number) => 'prev' | 'next' | null

let conteudoResolverItens: ConteudoResolverItens
let conteudoResolverModoNavegacao: ConteudoResolverModoNavegacao
let conteudoRenderScroll: ConteudoRenderScroll
let conteudoRenderSlides: ConteudoRenderSlides
let conteudoResolverDirecaoSwipe: ConteudoResolverDirecaoSwipe

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
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '', hostname: 'ng.quarkclinic.com.br' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as {
    UserPulse?: {
      _internal?: {
        conteudoResolverItens?: ConteudoResolverItens
        conteudoResolverModoNavegacao?: ConteudoResolverModoNavegacao
        conteudoRenderScroll?: ConteudoRenderScroll
        conteudoRenderSlides?: ConteudoRenderSlides
        conteudoResolverDirecaoSwipe?: ConteudoResolverDirecaoSwipe
      }
    }
  }).UserPulse
  const resolverItensFn = UserPulse?._internal?.conteudoResolverItens
  const resolverModoFn = UserPulse?._internal?.conteudoResolverModoNavegacao
  const renderScrollFn = UserPulse?._internal?.conteudoRenderScroll
  const renderSlidesFn = UserPulse?._internal?.conteudoRenderSlides
  const resolverDirecaoSwipeFn = UserPulse?._internal?.conteudoResolverDirecaoSwipe
  assert.equal(typeof resolverItensFn, 'function', 'window.UserPulse._internal.conteudoResolverItens não foi exposta por widget.js')
  assert.equal(typeof resolverModoFn, 'function', 'window.UserPulse._internal.conteudoResolverModoNavegacao não foi exposta por widget.js')
  assert.equal(typeof renderScrollFn, 'function', 'window.UserPulse._internal.conteudoRenderScroll não foi exposta por widget.js')
  assert.equal(typeof renderSlidesFn, 'function', 'window.UserPulse._internal.conteudoRenderSlides não foi exposta por widget.js')
  assert.equal(typeof resolverDirecaoSwipeFn, 'function', 'window.UserPulse._internal.conteudoResolverDirecaoSwipe não foi exposta por widget.js')
  conteudoResolverDirecaoSwipe = resolverDirecaoSwipeFn as ConteudoResolverDirecaoSwipe
  conteudoRenderSlides = renderSlidesFn as ConteudoRenderSlides
  conteudoResolverItens = resolverItensFn as ConteudoResolverItens
  conteudoResolverModoNavegacao = resolverModoFn as ConteudoResolverModoNavegacao
  conteudoRenderScroll = renderScrollFn as ConteudoRenderScroll
})

describe('conteudoResolverItens (widget.js) — campanha nova, com conteudos[]', () => {
  test('retorna os itens de conteudos[] em ordem, sem tocar nos campos legados', () => {
    const campanha: Campanha = {
      titulo: 'Legado', descricao: 'Legado desc',
      conteudos: [
        { id: 'c1', titulo: 'Primeiro', descricao: 'Desc 1' },
        { id: 'c2', titulo: 'Segundo', descricao: 'Desc 2' },
      ],
    }
    const itens = conteudoResolverItens(campanha)
    assert.equal(itens.length, 2)
    assert.equal(itens[0].id, 'c1')
    assert.equal(itens[0].titulo, 'Primeiro')
    assert.equal(itens[1].id, 'c2')
    assert.equal(itens[1].titulo, 'Segundo')
  })

  test('preserva a ordem exata do array recebido (backend já ordena, widget nunca reordena)', () => {
    const campanha: Campanha = {
      conteudos: [
        { id: 'z', titulo: 'Z' },
        { id: 'a', titulo: 'A' },
        { id: 'm', titulo: 'M' },
      ],
    }
    const itens = conteudoResolverItens(campanha)
    assert.deepEqual(itens.map(i => i.id), ['z', 'a', 'm'])
  })

  test('1 único item em conteudos[] também é retornado como está (nunca cai no fallback legado)', () => {
    const campanha: Campanha = {
      titulo: 'Legado', descricao: 'Legado desc',
      conteudos: [{ id: 'unico', titulo: 'Único', descricao: 'Desc única' }],
    }
    const itens = conteudoResolverItens(campanha)
    assert.equal(itens.length, 1)
    assert.equal(itens[0].id, 'unico')
  })

  test('não muta o objeto campanha recebido', () => {
    const campanha: Campanha = { conteudos: [{ id: 'c1', titulo: 'T' }] }
    const antes = JSON.stringify(campanha)
    conteudoResolverItens(campanha)
    assert.equal(JSON.stringify(campanha), antes)
  })
})

describe('conteudoResolverItens (widget.js) — campanha antiga, sem conteudos (fallback legado)', () => {
  test('conteudos ausente -> 1 pseudo-item montado a partir dos campos legados', () => {
    const campanha: Campanha = {
      titulo: 'Boas-vindas', descricao: 'Bem-vindo!',
      imagem_url: 'https://x.com/a.png', video_url: null,
      texto_botao: 'Saiba mais', url_botao: 'https://x.com',
    }
    const itens = conteudoResolverItens(campanha)
    assert.equal(itens.length, 1)
    assert.equal(itens[0].id, null)
    assert.equal(itens[0].titulo, 'Boas-vindas')
    assert.equal(itens[0].descricao, 'Bem-vindo!')
    assert.equal(itens[0].imagem_url, 'https://x.com/a.png')
    assert.equal(itens[0].video_url, null)
    assert.equal(itens[0].texto_botao, 'Saiba mais')
    assert.equal(itens[0].url_botao, 'https://x.com')
  })

  test('conteudos === [] (array vazio) também cai no fallback legado', () => {
    const campanha: Campanha = { titulo: 'T', descricao: 'D', conteudos: [] }
    const itens = conteudoResolverItens(campanha)
    assert.equal(itens.length, 1)
    assert.equal(itens[0].titulo, 'T')
  })

  test('campos opcionais ausentes/null viram null no pseudo-item, nunca undefined ou string vazia inventada', () => {
    const campanha: Campanha = { titulo: 'T', descricao: 'D' }
    const itens = conteudoResolverItens(campanha)
    assert.equal(itens[0].imagem_url, null)
    assert.equal(itens[0].video_url, null)
    assert.equal(itens[0].texto_botao, null)
    assert.equal(itens[0].url_botao, null)
  })

  test('campanha null/undefined -> lista vazia, nunca lança', () => {
    // .length em vez de deepEqual contra um [] literal — o array devolvido é
    // criado DENTRO do sandbox vm (protótipo de outro realm); deepEqual/
    // deepStrictEqual exigiria o mesmo protótipo (mesmo padrão documentado
    // em widgetDestaqueElemento.test.ts).
    assert.equal(conteudoResolverItens(null).length, 0)
    assert.equal(conteudoResolverItens(undefined).length, 0)
  })
})

describe('conteudoResolverModoNavegacao (widget.js)', () => {
  test('SCROLL explícito é respeitado', () => {
    assert.equal(conteudoResolverModoNavegacao({ modo_navegacao: 'SCROLL' }), 'SCROLL')
  })

  test('SLIDES explícito é respeitado', () => {
    assert.equal(conteudoResolverModoNavegacao({ modo_navegacao: 'SLIDES' }), 'SLIDES')
  })

  test('ausente -> default SCROLL', () => {
    assert.equal(conteudoResolverModoNavegacao({}), 'SCROLL')
  })

  test('valor desconhecido/inválido -> cai em SCROLL', () => {
    assert.equal(conteudoResolverModoNavegacao({ modo_navegacao: 'CARROSSEL' }), 'SCROLL')
    assert.equal(conteudoResolverModoNavegacao({ modo_navegacao: '' }), 'SCROLL')
    assert.equal(conteudoResolverModoNavegacao({ modo_navegacao: 'scroll' }), 'SCROLL')
  })

  test('campanha null/undefined -> SCROLL, nunca lança', () => {
    assert.equal(conteudoResolverModoNavegacao(null), 'SCROLL')
    assert.equal(conteudoResolverModoNavegacao(undefined), 'SCROLL')
  })
})

// Etapa 4 — render SCROLL. conteudoRenderScroll é a mesma função chamada por
// renderModal (extraída pra ser testável sem precisar montar um init()
// completo) — recebe sempre os itens já resolvidos por conteudoResolverItens.
describe('conteudoRenderScroll (widget.js)', () => {
  test('campanha antiga (fallback, 1 pseudo-item) renderiza igual ao comportamento atual: sem título por item, sem separador, sem controle de navegação', () => {
    const campanha: Campanha = {
      titulo: 'Boas-vindas', descricao: 'Bem-vindo!',
      imagem_url: 'https://x.com/a.png',
      texto_botao: 'Saiba mais', url_botao: 'https://x.com',
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.equal((html.match(/up-conteudo-item/g) || []).length, 1)
    assert.doesNotMatch(html, /up-conteudo-titulo/)
    assert.match(html, /up-media/)
    assert.match(html, /<img src="https:\/\/x\.com\/a\.png"/)
    assert.match(html, /up-description/)
    assert.match(html, /Bem-vindo!/)
    assert.match(html, /up-action/)
    assert.match(html, /Saiba mais/)
    // Nenhum controle de slides (setas/indicador) aparece em SCROLL.
    assert.doesNotMatch(html, /up-slide|up-indicador|up-prev|up-next/)
  })

  test('campanha nova com 1 único conteúdo também não ganha título por item nem UI de navegação', () => {
    const campanha: Campanha = { conteudos: [{ id: 'c1', titulo: 'Único', descricao: 'Desc única' }] }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.equal((html.match(/up-conteudo-item/g) || []).length, 1)
    assert.doesNotMatch(html, /up-conteudo-titulo/)
    assert.doesNotMatch(html, /up-slide|up-indicador|up-prev|up-next/)
  })

  test('campanha nova com 2+ conteúdos renderiza todos, em ordem, cada um com seu próprio título', () => {
    const campanha: Campanha = {
      conteudos: [
        { id: 'c1', titulo: 'Primeiro', descricao: 'Desc 1' },
        { id: 'c2', titulo: 'Segundo', descricao: 'Desc 2' },
        { id: 'c3', titulo: 'Terceiro', descricao: 'Desc 3' },
      ],
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.equal((html.match(/up-conteudo-item/g) || []).length, 3)
    const posPrimeiro = html.indexOf('Primeiro')
    const posSegundo = html.indexOf('Segundo')
    const posTerceiro = html.indexOf('Terceiro')
    assert.ok(posPrimeiro >= 0 && posSegundo > posPrimeiro && posTerceiro > posSegundo, 'ordem dos itens deve ser preservada no HTML')
    assert.equal((html.match(/up-conteudo-titulo/g) || []).length, 3)
    assert.doesNotMatch(html, /up-slide|up-indicador|up-prev|up-next/)
  })

  test('imagem e vídeo continuam mutuamente exclusivos no render: vídeo tem prioridade quando (por engano) os dois vierem preenchidos', () => {
    const comImagem = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', imagem_url: 'https://x.com/a.png' }])
    assert.match(comImagem, /<img src="https:\/\/x\.com\/a\.png"/)
    assert.doesNotMatch(comImagem, /<iframe/)

    const comVideo = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', video_url: 'https://x.com/a.mp4' }])
    assert.match(comVideo, /<iframe src="https:\/\/x\.com\/a\.mp4"/)
    assert.doesNotMatch(comVideo, /<img/)

    const comOsDois = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', imagem_url: 'https://x.com/a.png', video_url: 'https://x.com/a.mp4' }])
    assert.match(comOsDois, /<iframe/)
    assert.doesNotMatch(comOsDois, /<img/)

    const semNenhum = conteudoRenderScroll([{ titulo: 'T', descricao: 'D' }])
    assert.doesNotMatch(semNenhum, /up-media/)
  })

  test('CTA é opcional: presente só quando texto_botao E url_botao vêm preenchidos', () => {
    const comCta = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', texto_botao: 'Ir', url_botao: 'https://x.com' }])
    assert.match(comCta, /up-action/)
    assert.match(comCta, /data-up-url="https:\/\/x\.com"/)
    assert.match(comCta, />Ir</)

    const semTextoBotao = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', url_botao: 'https://x.com' }])
    assert.doesNotMatch(semTextoBotao, /up-action/)

    const semUrlBotao = conteudoRenderScroll([{ titulo: 'T', descricao: 'D', texto_botao: 'Ir' }])
    assert.doesNotMatch(semUrlBotao, /up-action/)

    const semNenhum = conteudoRenderScroll([{ titulo: 'T', descricao: 'D' }])
    assert.doesNotMatch(semNenhum, /up-action/)
  })

  test('nenhum controle de slides aparece em SCROLL, mesmo com vários itens (SLIDES ainda não implementado)', () => {
    const campanha: Campanha = {
      conteudos: [
        { id: 'c1', titulo: 'Primeiro', descricao: 'Desc 1' },
        { id: 'c2', titulo: 'Segundo', descricao: 'Desc 2' },
      ],
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.doesNotMatch(html, /up-slide|up-indicador|up-prev|up-next|data-up-slide/)
  })

  test('escapa HTML no título/descrição/CTA de cada item (nunca injeta markup do backend sem escape)', () => {
    const html = conteudoRenderScroll([{ titulo: '<b>x</b>', descricao: '<i>y</i>', texto_botao: '<u>z</u>', url_botao: 'https://x.com' }, { titulo: 'Segundo', descricao: 'D' }])
    assert.doesNotMatch(html, /<b>x<\/b>/)
    assert.doesNotMatch(html, /<i>y<\/i>/)
    assert.doesNotMatch(html, /<u>z<\/u>/)
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/)
  })
})

// Etapa 5 — render SLIDES. conteudoRenderSlides é a mesma função chamada por
// renderModal (índice atual sempre lido de state.conteudoSlideIndex, nunca
// escrito por ela — quem avança/volta é o clique em
// [data-up-slide-prev]/[data-up-slide-next], testado só via a função pura
// abaixo, mesmo padrão de conteudoRenderScroll: sem harness de init()/DOM).
describe('conteudoRenderSlides (widget.js)', () => {
  const tres = (): ConteudoItem[] => [
    { id: 'c1', titulo: 'Primeiro', descricao: 'Desc 1' },
    { id: 'c2', titulo: 'Segundo', descricao: 'Desc 2', texto_botao: 'Ver mais', url_botao: 'https://x.com/2' },
    { id: 'c3', titulo: 'Terceiro', descricao: 'Desc 3' },
  ]

  test('índice 0 (padrão de abertura) mostra somente o primeiro item', () => {
    const html = conteudoRenderSlides(tres(), 0)
    assert.equal((html.match(/up-conteudo-item/g) || []).length, 1)
    assert.match(html, /Primeiro/)
    assert.doesNotMatch(html, /Segundo/)
    assert.doesNotMatch(html, /Terceiro/)
  })

  test('indicador mostra "1 de N" no primeiro item', () => {
    const html = conteudoRenderSlides(tres(), 0)
    assert.match(html, /up-slides-indicador/)
    assert.match(html, />1 de 3</)
  })

  test('avançar (índice 1) troca o item exibido e atualiza o indicador', () => {
    const html = conteudoRenderSlides(tres(), 1)
    assert.match(html, /Segundo/)
    assert.doesNotMatch(html, /Primeiro/)
    assert.doesNotMatch(html, /Terceiro/)
    assert.match(html, />2 de 3</)
  })

  test('voltar (índice 0 depois de ter avançado) exibe o primeiro item de novo', () => {
    const avancado = conteudoRenderSlides(tres(), 1)
    const voltou = conteudoRenderSlides(tres(), 0)
    assert.match(avancado, /Segundo/)
    assert.match(voltou, /Primeiro/)
    assert.doesNotMatch(voltou, /Segundo/)
  })

  test('primeiro item -> botão anterior desabilitado, próximo habilitado', () => {
    const html = conteudoRenderSlides(tres(), 0)
    assert.match(html, /data-up-slide-prev="true" aria-label="Conteúdo anterior" disabled/)
    assert.doesNotMatch(html, /data-up-slide-next="true" aria-label="Próximo conteúdo" disabled/)
  })

  test('último item -> botão próximo desabilitado, anterior habilitado', () => {
    const html = conteudoRenderSlides(tres(), 2)
    assert.match(html, /data-up-slide-next="true" aria-label="Próximo conteúdo" disabled/)
    assert.doesNotMatch(html, /data-up-slide-prev="true" aria-label="Conteúdo anterior" disabled/)
    assert.match(html, />3 de 3</)
  })

  test('item do meio -> nenhum dos dois botões desabilitado', () => {
    const html = conteudoRenderSlides(tres(), 1)
    assert.doesNotMatch(html, /disabled/)
  })

  test('índice fora dos limites é clampado (defesa extra) em vez de quebrar', () => {
    assert.match(conteudoRenderSlides(tres(), 99), />3 de 3</)
    assert.match(conteudoRenderSlides(tres(), -5), />1 de 3</)
  })

  test('CTA do item atual continua presente e funcional (mesmo data-up-cta/data-up-url de sempre)', () => {
    const html = conteudoRenderSlides(tres(), 1)
    assert.match(html, /up-action/)
    assert.match(html, /data-up-cta="true"/)
    assert.match(html, /data-up-url="https:\/\/x\.com\/2"/)
    assert.match(html, />Ver mais</)
  })

  test('SLIDES com 1 item não mostra controles (nem indicador, nem botões) — comportamento igual a conteúdo único', () => {
    const html = conteudoRenderSlides([{ titulo: 'Único', descricao: 'D' }], 0)
    assert.doesNotMatch(html, /up-slides-nav|up-slides-indicador|data-up-slide-prev|data-up-slide-next/)
    assert.doesNotMatch(html, /up-conteudo-titulo/)
    assert.equal((html.match(/up-conteudo-item/g) || []).length, 1)
  })

  test('SLIDES com 0 item (lista vazia, caso defensivo) não lança e não mostra controles', () => {
    const html = conteudoRenderSlides([], 0)
    assert.doesNotMatch(html, /up-slides-nav/)
  })
})

// Etapa 6 — swipe horizontal. conteudoResolverDirecaoSwipe é função pura
// (só recebe o deslocamento total do gesto, deltaX/deltaY = fim - início) —
// quem decide se o índice de fato pode mover (limites) é conteudoMoverSlide,
// não exposta/testada aqui por não ser pura (mexe em state/render); a
// wiring real do touchstart/touchend (ver bindEvents) foi só revisada por
// leitura de código, mesmo padrão de escopo já usado na Etapa 5 pros botões.
describe('conteudoResolverDirecaoSwipe (widget.js)', () => {
  test('movimento horizontal abaixo do threshold (40px) não navega', () => {
    assert.equal(conteudoResolverDirecaoSwipe(10, 0), null)
    assert.equal(conteudoResolverDirecaoSwipe(-39, 0), null)
    assert.equal(conteudoResolverDirecaoSwipe(0, 0), null)
  })

  test('movimento majoritariamente vertical não navega, mesmo com deltaX grande', () => {
    assert.equal(conteudoResolverDirecaoSwipe(50, 100), null)
    assert.equal(conteudoResolverDirecaoSwipe(-60, 200), null)
  })

  test('deltaX negativo (arrastou pra esquerda) acima do threshold -> next', () => {
    assert.equal(conteudoResolverDirecaoSwipe(-40, 0), 'next')
    assert.equal(conteudoResolverDirecaoSwipe(-120, 5), 'next')
  })

  test('deltaX positivo (arrastou pra direita) acima do threshold -> prev', () => {
    assert.equal(conteudoResolverDirecaoSwipe(40, 0), 'prev')
    assert.equal(conteudoResolverDirecaoSwipe(120, -5), 'prev')
  })

  test('exatamente no threshold (40px) conta como swipe válido', () => {
    assert.equal(conteudoResolverDirecaoSwipe(40, 0), 'prev')
    assert.equal(conteudoResolverDirecaoSwipe(-40, 0), 'next')
  })

  test('diagonal com horizontal estritamente maior que vertical -> ainda navega', () => {
    assert.equal(conteudoResolverDirecaoSwipe(-50, 30), 'next')
    assert.equal(conteudoResolverDirecaoSwipe(45, 44), 'prev')
  })

  test('diagonal com horizontal igual ao vertical não navega (precisa ser estritamente maior)', () => {
    assert.equal(conteudoResolverDirecaoSwipe(-45, 45), null)
  })
})

// ─── Etapa 2 de analytics por conteúdo — data-up-conteudo-id no CTA ─────────
// conteudoRenderItemHtml (via conteudoRenderScroll/conteudoRenderSlides)
// carimba no botão do CTA o id do CampanhaConteudoItem que o originou, pra o
// clique poder ser atribuído ao item certo no backend/dashboard (etapas
// seguintes). Só quando o item tem id de verdade: no fallback legado
// (conteudoResolverItens monta 1 pseudo-item com id:null) o atributo é
// omitido e o clique segue sendo registrado sem conteudo_item_id. Mecanismo
// independente de destaque_item_id (destaque_elemento nunca passa por aqui).
describe('data-up-conteudo-id no CTA de conteúdo (widget.js)', () => {
  const cta = { texto_botao: 'Ver', url_botao: 'https://x.com' }

  test('SCROLL — item persistido: CTA carrega data-up-conteudo-id com o id do item', () => {
    const campanha: Campanha = {
      conteudos: [{ id: 'c1', titulo: 'Único', descricao: 'D', ...cta }],
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.match(html, /data-up-cta="true"/)
    assert.match(html, /data-up-conteudo-id="c1"/)
  })

  test('SCROLL — fallback legado (id ausente/null): CTA não emite data-up-conteudo-id, mas o CTA continua presente', () => {
    const campanha: Campanha = {
      titulo: 'Boas-vindas', descricao: 'Bem-vindo!', ...cta,
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.match(html, /up-action/)
    assert.match(html, /data-up-cta="true"/)
    assert.doesNotMatch(html, /data-up-conteudo-id/)
  })

  test('SCROLL — conteúdos diferentes carregam ids diferentes, cada um no seu próprio CTA', () => {
    const campanha: Campanha = {
      conteudos: [
        { id: 'c1', titulo: 'Primeiro', descricao: 'D1', ...cta },
        { id: 'c2', titulo: 'Segundo', descricao: 'D2', texto_botao: 'Ver 2', url_botao: 'https://x.com/2' },
      ],
    }
    const html = conteudoRenderScroll(conteudoResolverItens(campanha))
    assert.match(html, /data-up-conteudo-id="c1"/)
    assert.match(html, /data-up-conteudo-id="c2"/)
    assert.ok(html.indexOf('data-up-conteudo-id="c1"') < html.indexOf('data-up-conteudo-id="c2"'), 'ordem preservada')
  })

  test('SCROLL — item sem CTA não gera atributo (sem botão, sem data-up-conteudo-id)', () => {
    const html = conteudoRenderScroll([{ id: 'c1', titulo: 'T', descricao: 'D' }])
    assert.doesNotMatch(html, /up-action/)
    assert.doesNotMatch(html, /data-up-conteudo-id/)
  })

  test('SLIDES — o CTA exibido carrega o data-up-conteudo-id do item do índice atual', () => {
    const itens: ConteudoItem[] = [
      { id: 'c1', titulo: 'Primeiro', descricao: 'D1', texto_botao: 'Ver 1', url_botao: 'https://x.com/1' },
      { id: 'c2', titulo: 'Segundo', descricao: 'D2', texto_botao: 'Ver 2', url_botao: 'https://x.com/2' },
      { id: 'c3', titulo: 'Terceiro', descricao: 'D3', texto_botao: 'Ver 3', url_botao: 'https://x.com/3' },
    ]
    const slide0 = conteudoRenderSlides(itens, 0)
    assert.match(slide0, /data-up-conteudo-id="c1"/)
    assert.doesNotMatch(slide0, /data-up-conteudo-id="c2"/)
    assert.doesNotMatch(slide0, /data-up-conteudo-id="c3"/)

    const slide1 = conteudoRenderSlides(itens, 1)
    assert.match(slide1, /data-up-conteudo-id="c2"/)
    assert.doesNotMatch(slide1, /data-up-conteudo-id="c1"/)
    assert.doesNotMatch(slide1, /data-up-conteudo-id="c3"/)
  })

  test('SLIDES — item do índice atual sem CTA não emite atributo, e os outros itens continuam ocultos', () => {
    const itens: ConteudoItem[] = [
      { id: 'c1', titulo: 'Primeiro', descricao: 'D1' },
      { id: 'c2', titulo: 'Segundo', descricao: 'D2', texto_botao: 'Ver 2', url_botao: 'https://x.com/2' },
    ]
    const slide0 = conteudoRenderSlides(itens, 0)
    assert.doesNotMatch(slide0, /up-action/)
    assert.doesNotMatch(slide0, /data-up-conteudo-id/)
  })
})
