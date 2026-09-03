import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  RICH_TEXT_MAX_BYTES,
  RICH_TEXT_MAX_NODES,
  RICH_TEXT_MAX_TEXT_LENGTH,
  validarRichText,
} from '../lib/richText'
import {
  FORMATO_DESTAQUE_ELEMENTO,
  normalizarDataCy,
  dataCyValido,
  validarFormatoDestaqueElemento,
  resolverModoIdentificacao,
  validarDestaques,
  validarOwnershipDestaques,
  sincronizarDestaques,
  paraCriacaoDestaqueItem,
  paraAtualizacaoDestaqueItem,
  validarTransicaoStatusCampanha,
  STATUS_INICIAL_CAMPANHA,
  resolverRemocaoCampanha,
  resolverEncerramentoCampanha,
  motivoBloqueioReaberturaEncerrada,
  motivoBloqueioPublicarComDataFimPassada,
  motivoBloqueioEncerramentoSilencioso,
  parseDataVigencia,
  validarPeriodoVigencia,
  vigenciaCopiaCampanha,
  chaveGrupoConcorrente,
  validarIdsReordenacao,
  calcularPrioridadesReordenadas,
  normalizarDominio,
  validarModoNavegacao,
  validarConteudos,
  validarOwnershipConteudos,
  sincronizarConteudos,
  paraCriacaoConteudoItem,
  paraAtualizacaoConteudoItem,
  type CampanhaGrupoInput,
  type DestaqueItemInput,
  type ConteudoItemInput,
} from './campanhas'

describe('validarRichText', () => {
  const documentoValido = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Texto ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'formatado', marks: [{ type: 'italic' }, { type: 'underline' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'na linha seguinte' },
      ] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primeiro' }] }] },
      ] },
      { type: 'orderedList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Segundo' }] }] },
      ] },
    ],
  }

  test('aceita o schema previsto e extrai texto simples com quebras', () => {
    const resultado = validarRichText(documentoValido)
    assert.equal(resultado.erro, null)
    assert.equal(resultado.texto, 'Texto formatado\nna linha seguinte\nPrimeiro\nSegundo')
  })

  test('aceita null para compatibilidade com campanhas antigas', () => {
    assert.deepEqual(validarRichText(null), { erro: null, documento: null, texto: null })
  })

  test('rejeita HTML livre, scripts, atributos e tipos fora do contrato', () => {
    assert.notEqual(validarRichText('<p>HTML</p>').erro, null)
    assert.notEqual(validarRichText({ type: 'doc', content: [{ type: 'script' }] }).erro, null)
    assert.notEqual(validarRichText({ type: 'doc', attrs: {}, content: [] }).erro, null)
    assert.notEqual(validarRichText({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 } }] }).erro, null)
    assert.notEqual(validarRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', style: 'color:red' }] }] }).erro, null)
  })

  test('rejeita links e atributos extras nas marcas permitidas', () => {
    const comMarca = (marca: Record<string, unknown>) => ({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'texto', marks: [marca] }] }],
    })
    assert.notEqual(validarRichText(comMarca({ type: 'link', attrs: { href: 'https://example.com' } })).erro, null)
    assert.notEqual(validarRichText(comMarca({ type: 'bold', attrs: {} })).erro, null)
  })

  test('limita quantidade de nós', () => {
    const noLimite = Array.from({ length: RICH_TEXT_MAX_NODES - 1 }, () => ({ type: 'paragraph' }))
    const acimaDoLimite = [...noLimite, { type: 'paragraph' }]
    assert.equal(validarRichText({ type: 'doc', content: noLimite }).erro, null)
    assert.notEqual(validarRichText({ type: 'doc', content: acimaDoLimite }).erro, null)
  })

  test('limita o total de texto', () => {
    const comTexto = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
    assert.equal(validarRichText(comTexto('a'.repeat(RICH_TEXT_MAX_TEXT_LENGTH))).erro, null)
    assert.notEqual(validarRichText(comTexto('a'.repeat(RICH_TEXT_MAX_TEXT_LENGTH + 1))).erro, null)
  })

  test('limita o JSON por bytes', () => {
    const documento = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'texto', marks: Array.from({ length: RICH_TEXT_MAX_BYTES }, () => ({ type: 'bold' })) }],
      }],
    }
    assert.notEqual(validarRichText(documento).erro, null)
  })
})

// Fase 1 de adoção — "Destaque em elemento" (ver CLAUDE.md). Só funções
// puras (sem Prisma/DB): a validação de verdade em criar()/atualizar() é
// integration-only e testada manualmente contra um servidor local, mesmo
// limite documentado nas outras suítes deste projeto.

describe('normalizarDataCy', () => {
  test('remove espaços nas bordas', () => {
    assert.equal(normalizarDataCy('  botao-salvar  '), 'botao-salvar')
  })

  test('valor não-string vira string vazia', () => {
    assert.equal(normalizarDataCy(undefined), '')
    assert.equal(normalizarDataCy(null), '')
    assert.equal(normalizarDataCy(123), '')
  })
})

describe('dataCyValido', () => {
  test('aceita letras, números, -, _, : e .', () => {
    assert.equal(dataCyValido('botao-finalizar-compra'), true)
    assert.equal(dataCyValido('menu:configuracoes'), true)
    assert.equal(dataCyValido('card.item_1'), true)
  })

  test('rejeita vazio', () => {
    assert.equal(dataCyValido(''), false)
  })

  test('rejeita caracteres perigosos pra seletor CSS (aspas, colchetes, espaço)', () => {
    assert.equal(dataCyValido('x"]'), false)
    assert.equal(dataCyValido('a b'), false)
    assert.equal(dataCyValido('x[y]'), false)
    assert.equal(dataCyValido("x' or '1'='1"), false)
  })
})

describe('validarFormatoDestaqueElemento', () => {
  test('formato normal (modal_automatica) não exige data-cy adicional', () => {
    assert.equal(validarFormatoDestaqueElemento('modal_automatica', ''), null)
    assert.equal(validarFormatoDestaqueElemento('modal_automatica', 'qualquer-coisa'), null)
  })

  test('destaque em elemento sem data-cy -> inválido', () => {
    const erro = validarFormatoDestaqueElemento(FORMATO_DESTAQUE_ELEMENTO, '')
    assert.notEqual(erro, null)
    assert.match(erro as string, /data-cy/i)
  })

  test('destaque em elemento com data-cy inválido (charset perigoso) -> inválido', () => {
    const erro = validarFormatoDestaqueElemento(FORMATO_DESTAQUE_ELEMENTO, 'x"] , y')
    assert.notEqual(erro, null)
  })

  test('destaque em elemento com data-cy válido -> válido', () => {
    assert.equal(validarFormatoDestaqueElemento(FORMATO_DESTAQUE_ELEMENTO, 'botao-finalizar-compra'), null)
  })

  test('outros formatos continuam inalterados (nenhuma checagem de data-cy)', () => {
    assert.equal(validarFormatoDestaqueElemento('botao_flutuante', ''), null)
    assert.equal(validarFormatoDestaqueElemento('banner', ''), null)
  })
})

describe('resolverModoIdentificacao', () => {
  test('destaque em elemento sempre força modo_identificacao=data_cy, mesmo que o cliente envie outro', () => {
    assert.equal(resolverModoIdentificacao(FORMATO_DESTAQUE_ELEMENTO, 'sistema_tela'), 'data_cy')
    assert.equal(resolverModoIdentificacao(FORMATO_DESTAQUE_ELEMENTO, 'url_contem'), 'data_cy')
    assert.equal(resolverModoIdentificacao(FORMATO_DESTAQUE_ELEMENTO, ''), 'data_cy')
  })

  test('outros formatos preservam o modo_identificacao informado (ou o default sistema_tela)', () => {
    assert.equal(resolverModoIdentificacao('modal_automatica', 'url_contem'), 'url_contem')
    assert.equal(resolverModoIdentificacao('modal_automatica', ''), 'sistema_tela')
  })
})

// Fase 2 — múltiplos destaques por campanha. validarDestaques/
// paraCriacaoDestaqueItem são funções puras (sem Prisma/DB) chamadas por
// criar()/atualizar(); a integração com o banco (transação delete+recreate,
// mirror dos campos legados) é integration-only, testada manualmente contra
// um servidor local, mesmo limite documentado nas outras suítes.
describe('validarDestaques', () => {
  const item = (over: Partial<DestaqueItemInput> = {}): DestaqueItemInput => ({
    data_cy: 'filtro-status', titulo: 'Filtro por status', descricao: 'Use o filtro.', ...over,
  })

  test('lista vazia -> inválido (exige pelo menos 1 item)', () => {
    const { erro, lista } = validarDestaques([])
    assert.notEqual(erro, null)
    assert.match(erro as string, /ao menos 1/i)
    assert.deepEqual(lista, [])
  })

  test('não-array -> inválido', () => {
    assert.notEqual(validarDestaques(undefined).erro, null)
    assert.notEqual(validarDestaques(null).erro, null)
    assert.notEqual(validarDestaques('destaque').erro, null)
  })

  test('1 item válido -> ok', () => {
    const { erro, lista } = validarDestaques([item()])
    assert.equal(erro, null)
    assert.equal(lista.length, 1)
  })

  test('vários itens válidos (filtro-status, filtro-profissional, filtro-convenio) -> ok', () => {
    const { erro, lista } = validarDestaques([
      item({ data_cy: 'filtro-status', titulo: 'Status' }),
      item({ data_cy: 'filtro-profissional', titulo: 'Profissional' }),
      item({ data_cy: 'filtro-convenio', titulo: 'Convênio' }),
    ])
    assert.equal(erro, null)
    assert.equal(lista.length, 3)
  })

  test('data-cy inválido em qualquer item -> inválido, aponta o índice 1-based', () => {
    const { erro } = validarDestaques([item(), item({ data_cy: 'x"] , y' })])
    assert.notEqual(erro, null)
    assert.match(erro as string, /Destaque 2/)
  })

  test('data-cy ausente/vazio -> inválido', () => {
    assert.notEqual(validarDestaques([item({ data_cy: '' })]).erro, null)
    assert.notEqual(validarDestaques([item({ data_cy: undefined })]).erro, null)
  })

  test('título ausente/vazio -> inválido', () => {
    assert.notEqual(validarDestaques([item({ titulo: '' })]).erro, null)
    assert.notEqual(validarDestaques([item({ titulo: undefined })]).erro, null)
  })

  test('item não-objeto (string/número/array solto na lista) -> inválido', () => {
    assert.notEqual(validarDestaques(['x']).erro, null)
    assert.notEqual(validarDestaques([123]).erro, null)
    assert.notEqual(validarDestaques([[1, 2]]).erro, null)
  })

  test('CTA/badge são opcionais — item sem eles continua válido', () => {
    const { erro } = validarDestaques([item({ texto_badge: undefined, texto_botao: undefined, url_botao: undefined })])
    assert.equal(erro, null)
  })

  test('id ausente é válido (item novo, vira CREATE)', () => {
    const { erro, lista } = validarDestaques([item()])
    assert.equal(erro, null)
    assert.equal(lista[0].id, undefined)
  })

  test('id string não-vazia é válido e preservado na lista', () => {
    const { erro, lista } = validarDestaques([item({ id: 'item-123' })])
    assert.equal(erro, null)
    assert.equal(lista[0].id, 'item-123')
  })

  test('id vazio/não-string -> inválido', () => {
    assert.notEqual(validarDestaques([item({ id: '' })]).erro, null)
    assert.notEqual(validarDestaques([item({ id: '   ' })]).erro, null)
    assert.notEqual(validarDestaques([item({ id: 123 })]).erro, null)
    assert.notEqual(validarDestaques([item({ id: {} })]).erro, null)
  })
})

// Fase 3 — sincronização por identidade (substitui delete+recreate total).
// Cobre: id estável ao editar/reordenar, create sem id, delete de id removido
// da lista, e rejeição de id de outra campanha/tenant (validarOwnershipDestaques).
describe('validarOwnershipDestaques', () => {
  const item = (over: Partial<DestaqueItemInput> = {}): DestaqueItemInput => ({
    data_cy: 'filtro-status', titulo: 'Filtro por status', descricao: 'Use o filtro.', ...over,
  })

  test('lista sem nenhum id -> sempre ok, mesmo com idsExistentes vazio (caso de criar())', () => {
    assert.equal(validarOwnershipDestaques([], [item(), item()]), null)
  })

  test('id presente em idsExistentes -> ok', () => {
    assert.equal(validarOwnershipDestaques(['id-a', 'id-b'], [item({ id: 'id-a' })]), null)
  })

  test('id que não pertence à campanha atual (outra campanha/tenant) -> rejeitado', () => {
    const erro = validarOwnershipDestaques(['id-a'], [item({ id: 'id-de-outra-campanha' })])
    assert.notEqual(erro, null)
    assert.match(erro as string, /não pertence/)
  })

  test('em criar() (idsExistentes=[]), qualquer id enviado é rejeitado — campanha nova não tem itens prévios', () => {
    const erro = validarOwnershipDestaques([], [item({ id: 'id-emprestado' })])
    assert.notEqual(erro, null)
  })

  test('aponta o índice 1-based do item inválido', () => {
    const erro = validarOwnershipDestaques(['id-a'], [item({ id: 'id-a' }), item({ id: 'id-estranho' })])
    assert.match(erro as string, /Destaque 2/)
  })
})

describe('sincronizarDestaques', () => {
  const item = (over: Partial<DestaqueItemInput> = {}): DestaqueItemInput => ({
    data_cy: 'filtro-status', titulo: 'Filtro por status', descricao: 'Use o filtro.', ...over,
  })

  test('todos os itens sem id -> tudo vai para paraCriar, nada para atualizar/remover', () => {
    const r = sincronizarDestaques([], [item(), item()])
    assert.equal(r.paraCriar.length, 2)
    assert.equal(r.paraAtualizar.length, 0)
    assert.deepEqual(r.idsParaRemover, [])
  })

  test('item com id existente -> vai para paraAtualizar, preservando o id', () => {
    const r = sincronizarDestaques(['id-1'], [item({ id: 'id-1' })])
    assert.equal(r.paraAtualizar.length, 1)
    assert.equal(r.paraAtualizar[0].id, 'id-1')
    assert.equal(r.paraCriar.length, 0)
    assert.deepEqual(r.idsParaRemover, [])
  })

  test('id existente ausente da nova lista -> vai para idsParaRemover', () => {
    const r = sincronizarDestaques(['id-1', 'id-2'], [item({ id: 'id-1' })])
    assert.deepEqual(r.idsParaRemover, ['id-2'])
  })

  test('editar texto sem mexer no id -> continua em paraAtualizar com o mesmo id (id nunca muda)', () => {
    const r = sincronizarDestaques(['id-1'], [item({ id: 'id-1', titulo: 'Título editado' })])
    assert.equal(r.paraAtualizar[0].id, 'id-1')
    assert.equal(r.paraAtualizar[0].item.titulo, 'Título editado')
  })

  test('reordenar (inverter 2 itens com id) -> ambos continuam em paraAtualizar com os MESMOS ids, só troca ordem', () => {
    const r = sincronizarDestaques(['id-1', 'id-2'], [item({ id: 'id-2' }), item({ id: 'id-1' })])
    assert.equal(r.paraAtualizar.length, 2)
    assert.equal(r.paraAtualizar[0].id, 'id-2')
    assert.equal(r.paraAtualizar[0].ordem, 1)
    assert.equal(r.paraAtualizar[1].id, 'id-1')
    assert.equal(r.paraAtualizar[1].ordem, 2)
    assert.deepEqual(r.idsParaRemover, [])
  })

  test('adicionar um item novo no meio de existentes -> só o novo vai para paraCriar, os outros continuam em paraAtualizar com o mesmo id (siblings intocados)', () => {
    const r = sincronizarDestaques(['id-1', 'id-2'], [item({ id: 'id-1' }), item(), item({ id: 'id-2' })])
    assert.equal(r.paraCriar.length, 1)
    assert.equal(r.paraAtualizar.length, 2)
    assert.deepEqual(r.paraAtualizar.map(a => a.id), ['id-1', 'id-2'])
    assert.deepEqual(r.idsParaRemover, [])
  })

  test('remover um item do meio -> só o id removido vai para idsParaRemover, os outros continuam em paraAtualizar com o mesmo id', () => {
    const r = sincronizarDestaques(['id-1', 'id-2', 'id-3'], [item({ id: 'id-1' }), item({ id: 'id-3' })])
    assert.deepEqual(r.idsParaRemover, ['id-2'])
    assert.deepEqual(r.paraAtualizar.map(a => a.id), ['id-1', 'id-3'])
  })

  test('ordem reflete a posição 1-based na lista recebida, tanto para criar quanto para atualizar', () => {
    const r = sincronizarDestaques(['id-1'], [item(), item({ id: 'id-1' }), item()])
    assert.equal(r.paraCriar[0].ordem, 1)
    assert.equal(r.paraAtualizar[0].ordem, 2)
    assert.equal(r.paraCriar[1].ordem, 3)
  })
})

describe('paraAtualizacaoDestaqueItem', () => {
  test('não inclui tenant_id nem id — id vai sempre no `where` da escrita, nunca no `data`', () => {
    const resultado = paraAtualizacaoDestaqueItem({ id: 'id-1', data_cy: 'x', titulo: 'T' }, 2) as Record<string, unknown>
    assert.equal('tenant_id' in resultado, false)
    assert.equal('id' in resultado, false)
    assert.equal(resultado.ordem, 2)
  })

  test('normaliza data_cy e faz trim nos textos, igual paraCriacaoDestaqueItem', () => {
    const resultado = paraAtualizacaoDestaqueItem({ data_cy: '  filtro-status  ', titulo: '  Status  ' }, 1)
    assert.equal(resultado.data_cy, 'filtro-status')
    assert.equal(resultado.titulo, 'Status')
  })
})

describe('paraCriacaoDestaqueItem', () => {
  test('usa o tenantId e a ordem passados por parâmetro — nunca o que vier no item', () => {
    // O tipo de DestaqueItemInput nem declara tenant_id/campanha_id — mas
    // simula um payload malicioso tentando injetar via propriedades extras,
    // confirmando que só data_cy/texto_badge/titulo/... são lidos.
    const itemMalicioso = { data_cy: 'x', titulo: 'T', tenant_id: 'tenant-invasor', campanha_id: 'campanha-de-outro' } as DestaqueItemInput
    const resultado = paraCriacaoDestaqueItem(itemMalicioso, 'tenant-correto', 3)
    assert.equal(resultado.tenant_id, 'tenant-correto')
    assert.equal(resultado.ordem, 3)
    assert.equal('campanha_id' in resultado, false)
  })

  test('normaliza data_cy e faz trim nos textos', () => {
    const resultado = paraCriacaoDestaqueItem({ data_cy: '  filtro-status  ', titulo: '  Status  ', descricao: '  Use o filtro  ' }, 't1', 1)
    assert.equal(resultado.data_cy, 'filtro-status')
    assert.equal(resultado.titulo, 'Status')
    assert.equal(resultado.descricao, 'Use o filtro')
  })

  test('campos opcionais ausentes viram null (texto_badge/texto_botao/url_botao), não undefined/string vazia', () => {
    const resultado = paraCriacaoDestaqueItem({ data_cy: 'x', titulo: 'T' }, 't1', 1)
    assert.equal(resultado.texto_badge, null)
    assert.equal(resultado.texto_botao, null)
    assert.equal(resultado.url_botao, null)
  })

  test('ativo default true quando não informado; respeita false explícito', () => {
    assert.equal(paraCriacaoDestaqueItem({ data_cy: 'x', titulo: 'T' }, 't1', 1).ativo, true)
    assert.equal(paraCriacaoDestaqueItem({ data_cy: 'x', titulo: 'T', ativo: false }, 't1', 1).ativo, false)
  })
})

// Etapa 2 — múltiplos conteúdos por campanha (Campanha.modo_navegacao +
// CampanhaConteudoItem). Mecanismo independente de destaques/
// CampanhaDestaqueItem acima — só funções puras aqui (sem Prisma/DB), mesmo
// limite documentado no resto desta suíte.
describe('validarModoNavegacao', () => {
  test('SCROLL e SLIDES são válidos', () => {
    assert.equal(validarModoNavegacao('SCROLL'), null)
    assert.equal(validarModoNavegacao('SLIDES'), null)
  })

  test('qualquer outro valor é inválido', () => {
    assert.notEqual(validarModoNavegacao('CARROSSEL'), null)
    assert.notEqual(validarModoNavegacao(''), null)
    assert.notEqual(validarModoNavegacao('scroll'), null)
  })
})

describe('validarConteudos', () => {
  const item = (over: Partial<ConteudoItemInput> = {}): ConteudoItemInput => ({
    titulo: 'Título', descricao: 'Descrição do conteúdo.', ...over,
  })

  test('não-array -> inválido', () => {
    assert.notEqual(validarConteudos(undefined).erro, null)
    assert.notEqual(validarConteudos(null).erro, null)
    assert.notEqual(validarConteudos('conteudo').erro, null)
  })

  test('0 itens -> inválido (mínimo 1)', () => {
    const { erro, lista } = validarConteudos([])
    assert.notEqual(erro, null)
    assert.match(erro as string, /entre 1 e 10/i)
    assert.deepEqual(lista, [])
  })

  test('11 itens -> inválido (máximo 10)', () => {
    const onze = Array.from({ length: 11 }, () => item())
    const { erro } = validarConteudos(onze)
    assert.notEqual(erro, null)
    assert.match(erro as string, /entre 1 e 10/i)
  })

  test('10 itens -> válido (limite máximo permitido)', () => {
    const dez = Array.from({ length: 10 }, () => item())
    const { erro, lista } = validarConteudos(dez)
    assert.equal(erro, null)
    assert.equal(lista.length, 10)
  })

  test('1 item válido -> ok', () => {
    const { erro, lista } = validarConteudos([item()])
    assert.equal(erro, null)
    assert.equal(lista.length, 1)
  })

  test('título ausente/vazio -> inválido', () => {
    assert.notEqual(validarConteudos([item({ titulo: '' })]).erro, null)
    assert.notEqual(validarConteudos([item({ titulo: undefined })]).erro, null)
  })

  test('descrição ausente/vazia -> inválido', () => {
    assert.notEqual(validarConteudos([item({ descricao: '' })]).erro, null)
    assert.notEqual(validarConteudos([item({ descricao: undefined })]).erro, null)
  })

  test('descricao_rich válida substitui descricao pelo texto derivado no servidor', () => {
    const descricao_rich = {
      type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Texto confiável', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Segunda linha' }] },
      ],
    }
    const { erro, lista } = validarConteudos([item({ descricao: 'Texto adulterado', descricao_rich })])
    assert.equal(erro, null)
    assert.equal(lista[0].descricao, 'Texto confiável\nSegunda linha')
    assert.deepEqual(lista[0].descricao_rich, descricao_rich)
  })

  test('descricao_rich inválida é rejeitada mesmo com descricao simples válida', () => {
    const { erro } = validarConteudos([item({
      descricao: 'Fallback aparentemente válido',
      descricao_rich: { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] },
    })])
    assert.match(erro as string, /Conteúdo 1/)
  })

  test('sem imagem nem vídeo -> válido (mídia é opcional, mesma regra dos campos legados)', () => {
    const { erro } = validarConteudos([item()])
    assert.equal(erro, null)
  })

  test('só imagem, ou só vídeo -> válido', () => {
    assert.equal(validarConteudos([item({ imagem_url: 'https://x.com/a.png' })]).erro, null)
    assert.equal(validarConteudos([item({ video_url: 'https://x.com/a.mp4' })]).erro, null)
  })

  test('imagem E vídeo juntos -> inválido', () => {
    const { erro } = validarConteudos([item({ imagem_url: 'https://x.com/a.png', video_url: 'https://x.com/a.mp4' })])
    assert.notEqual(erro, null)
    assert.match(erro as string, /nunca os dois/i)
  })

  test('texto_botao e url_botao ausentes juntos -> válido (CTA opcional)', () => {
    assert.equal(validarConteudos([item({ texto_botao: undefined, url_botao: undefined })]).erro, null)
  })

  test('texto_botao e url_botao presentes juntos -> válido', () => {
    assert.equal(validarConteudos([item({ texto_botao: 'Saiba mais', url_botao: 'https://x.com' })]).erro, null)
  })

  test('texto_botao sem url_botao -> inválido', () => {
    assert.notEqual(validarConteudos([item({ texto_botao: 'Saiba mais', url_botao: undefined })]).erro, null)
  })

  test('url_botao sem texto_botao -> válido, texto_botao normalizado para "Saiba mais"', () => {
    const { erro, lista } = validarConteudos([item({ texto_botao: undefined, url_botao: 'https://x.com' })])
    assert.equal(erro, null)
    assert.equal(lista[0].texto_botao, 'Saiba mais')
  })

  test('item não-objeto (string/número/array solto na lista) -> inválido', () => {
    assert.notEqual(validarConteudos(['x']).erro, null)
    assert.notEqual(validarConteudos([123]).erro, null)
    assert.notEqual(validarConteudos([[1, 2]]).erro, null)
  })

  test('erro aponta o índice 1-based do item inválido', () => {
    const { erro } = validarConteudos([item(), item({ titulo: '' })])
    assert.match(erro as string, /Conteúdo 2/)
  })

  test('id ausente é válido (item novo, vira CREATE); id string não-vazia é preservado', () => {
    assert.equal(validarConteudos([item()]).lista[0].id, undefined)
    assert.equal(validarConteudos([item({ id: 'item-123' })]).lista[0].id, 'item-123')
  })

  test('id vazio/não-string -> inválido', () => {
    assert.notEqual(validarConteudos([item({ id: '' })]).erro, null)
    assert.notEqual(validarConteudos([item({ id: 123 })]).erro, null)
  })
})

describe('validarOwnershipConteudos', () => {
  const item = (over: Partial<ConteudoItemInput> = {}): ConteudoItemInput => ({
    titulo: 'Título', descricao: 'Descrição.', ...over,
  })

  test('lista sem nenhum id -> sempre ok, mesmo com idsExistentes vazio (caso de criar())', () => {
    assert.equal(validarOwnershipConteudos([], [item(), item()]), null)
  })

  test('id presente em idsExistentes -> ok', () => {
    assert.equal(validarOwnershipConteudos(['id-a', 'id-b'], [item({ id: 'id-a' })]), null)
  })

  test('id que não pertence à campanha atual -> rejeitado', () => {
    const erro = validarOwnershipConteudos(['id-a'], [item({ id: 'id-de-outra-campanha' })])
    assert.notEqual(erro, null)
    assert.match(erro as string, /não pertence/)
  })

  test('em criar() (idsExistentes=[]), qualquer id enviado é rejeitado', () => {
    assert.notEqual(validarOwnershipConteudos([], [item({ id: 'id-emprestado' })]), null)
  })
})

describe('sincronizarConteudos', () => {
  const item = (over: Partial<ConteudoItemInput> = {}): ConteudoItemInput => ({
    titulo: 'Título', descricao: 'Descrição.', ...over,
  })

  test('todos os itens sem id -> tudo vai para paraCriar, nada para atualizar/remover', () => {
    const r = sincronizarConteudos([], [item(), item()])
    assert.equal(r.paraCriar.length, 2)
    assert.equal(r.paraAtualizar.length, 0)
    assert.equal(r.idsParaRemover.length, 0)
  })

  test('item com id reconhecido -> paraAtualizar, preservando o id e a nova ordem (reordenação)', () => {
    const r = sincronizarConteudos(['id-a', 'id-b'], [item({ id: 'id-b' }), item({ id: 'id-a' })])
    assert.deepEqual(r.paraAtualizar.map(x => x.id), ['id-b', 'id-a'])
    assert.deepEqual(r.paraAtualizar.map(x => x.ordem), [1, 2])
    assert.equal(r.idsParaRemover.length, 0)
  })

  test('id existente que não veio na nova lista -> idsParaRemover', () => {
    const r = sincronizarConteudos(['id-a', 'id-b'], [item({ id: 'id-a' })])
    assert.deepEqual(r.idsParaRemover, ['id-b'])
  })

  test('mistura: mantém um, remove outro, cria um novo', () => {
    const r = sincronizarConteudos(['id-a', 'id-b'], [item({ id: 'id-a' }), item()])
    assert.deepEqual(r.paraAtualizar.map(x => x.id), ['id-a'])
    assert.equal(r.paraCriar.length, 1)
    assert.deepEqual(r.idsParaRemover, ['id-b'])
  })
})

describe('paraCriacaoConteudoItem / paraAtualizacaoConteudoItem', () => {
  test('paraCriacaoConteudoItem usa o tenantId e a ordem passados por parâmetro, nunca o que vier no item', () => {
    const itemMalicioso = { titulo: 'T', descricao: 'D', tenant_id: 'tenant-invasor', campanha_id: 'campanha-de-outro' } as ConteudoItemInput
    const resultado = paraCriacaoConteudoItem(itemMalicioso, 'tenant-correto', 3)
    assert.equal(resultado.tenant_id, 'tenant-correto')
    assert.equal(resultado.ordem, 3)
    assert.equal('campanha_id' in resultado, false)
  })

  test('paraAtualizacaoConteudoItem não inclui tenant_id nem id', () => {
    const resultado = paraAtualizacaoConteudoItem({ id: 'id-1', titulo: 'T', descricao: 'D' }, 2) as Record<string, unknown>
    assert.equal('tenant_id' in resultado, false)
    assert.equal('id' in resultado, false)
    assert.equal(resultado.ordem, 2)
  })

  test('faz trim nos textos e normaliza campos opcionais ausentes para null', () => {
    const resultado = paraCriacaoConteudoItem({ titulo: '  Título  ', descricao: '  Descrição  ' }, 't1', 1)
    assert.equal(resultado.titulo, 'Título')
    assert.equal(resultado.descricao, 'Descrição')
    assert.equal(resultado.imagem_url, null)
    assert.equal(resultado.video_url, null)
    assert.equal(resultado.texto_botao, null)
    assert.equal(resultado.url_botao, null)
  })

  test('persiste descricao_rich validada junto do texto simples derivado', () => {
    const descricao_rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Formatado' }] }] }
    const itemValidado = validarConteudos([{ titulo: 'T', descricao: 'não confiar', descricao_rich }]).lista[0]
    const resultado = paraCriacaoConteudoItem(itemValidado, 't1', 1)
    assert.equal(resultado.descricao, 'Formatado')
    assert.deepEqual(resultado.descricao_rich, descricao_rich)
  })
})

// Fase 1 dos 3 status de Campanha — validarTransicaoStatusCampanha é a única
// peça que decide se uma transição pode ser persistida (ver atualizar() em
// campanhas.ts, que chama isso antes de qualquer prisma.campanha.update).
// "Agendada"/"Encerrada" nunca entram aqui — são só uma leitura de período
// (data_inicio/data_fim) calculada em cima de uma campanha já ATIVA, nunca
// um status persistido; esta função só conhece RASCUNHO/ATIVA/INATIVA.
describe('validarTransicaoStatusCampanha', () => {
  test('RASCUNHO -> ATIVA: válida', () => {
    assert.equal(validarTransicaoStatusCampanha('RASCUNHO', 'ATIVA'), null)
  })

  test('ATIVA -> INATIVA: válida', () => {
    assert.equal(validarTransicaoStatusCampanha('ATIVA', 'INATIVA'), null)
  })

  test('INATIVA -> ATIVA: válida', () => {
    assert.equal(validarTransicaoStatusCampanha('INATIVA', 'ATIVA'), null)
  })

  test('RASCUNHO -> INATIVA: bloqueada (nunca foi publicada, não existe o que desativar)', () => {
    const erro = validarTransicaoStatusCampanha('RASCUNHO', 'INATIVA')
    assert.notEqual(erro, null)
  })

  test('ATIVA -> RASCUNHO: bloqueada (campanha publicada nunca volta a rascunho)', () => {
    const erro = validarTransicaoStatusCampanha('ATIVA', 'RASCUNHO')
    assert.notEqual(erro, null)
  })

  test('INATIVA -> RASCUNHO: bloqueada (campanha publicada nunca volta a rascunho)', () => {
    const erro = validarTransicaoStatusCampanha('INATIVA', 'RASCUNHO')
    assert.notEqual(erro, null)
  })

  test('mesmo status (no-op) é sempre válido nos 3 casos', () => {
    assert.equal(validarTransicaoStatusCampanha('RASCUNHO', 'RASCUNHO'), null)
    assert.equal(validarTransicaoStatusCampanha('ATIVA', 'ATIVA'), null)
    assert.equal(validarTransicaoStatusCampanha('INATIVA', 'INATIVA'), null)
  })
})

// criar() e duplicar() (campanhas.ts) escrevem STATUS_INICIAL_CAMPANHA
// direto no `data` do prisma.campanha.create — não há branch/decisão pra
// testar isoladamente ali (não depende de nenhum input do request, é
// sempre o mesmo valor), então a garantia de "toda campanha nova/duplicada
// nasce em RASCUNHO" é esta constante compartilhada pelos dois pontos de
// criação. O restante de criar()/atualizar()/duplicar() (Prisma/DB) segue o
// padrão já estabelecido nesta suíte: integration-only, validado manualmente
// contra um servidor local.
describe('STATUS_INICIAL_CAMPANHA', () => {
  test('é RASCUNHO — usado tanto por criar() quanto por duplicar()', () => {
    assert.equal(STATUS_INICIAL_CAMPANHA, 'RASCUNHO')
  })
})

// remover() (DELETE /:id) — semântica por status, nunca hard-delete.
describe('resolverRemocaoCampanha', () => {
  test('ATIVA -> DELETE: inativa', () => {
    assert.deepEqual(resolverRemocaoCampanha('ATIVA'), { tipo: 'inativada' })
  })

  test('INATIVA -> DELETE: informa que já estava inativa, sem mudança', () => {
    assert.deepEqual(resolverRemocaoCampanha('INATIVA'), { tipo: 'ja_inativa' })
  })

  test('RASCUNHO -> DELETE: erro — nunca vira INATIVA (RASCUNHO->INATIVA não existe no grafo)', () => {
    assert.deepEqual(resolverRemocaoCampanha('RASCUNHO'), {
      tipo: 'erro',
      mensagem: 'Campanha em rascunho não pode ser inativada.',
    })
  })
})

// Encerrar (Fase 2) — ação própria, nunca reaproveita resolverRemocaoCampanha/
// DELETE. Nunca decide `status` (sempre ATIVA nos casos que encerram de
// verdade) — só o `data_fim` que faz getStatus (frontend) passar a ler
// "Encerrada" por período.
describe('resolverEncerramentoCampanha', () => {
  const AGORA = new Date('2026-06-15T12:00:00.000Z')
  const FUTURA = new Date('2026-07-01T00:00:00.000Z')
  const PASSADA = new Date('2026-01-01T00:00:00.000Z')

  test('ATIVA sem data_fim (null) -> encerra agora', () => {
    assert.deepEqual(resolverEncerramentoCampanha('ATIVA', null, AGORA), { tipo: 'encerrada', data_fim: AGORA })
  })

  test('ATIVA com data_fim futura -> encerra agora (substitui a data futura, nunca preserva)', () => {
    const resultado = resolverEncerramentoCampanha('ATIVA', FUTURA, AGORA)
    assert.deepEqual(resultado, { tipo: 'encerrada', data_fim: AGORA })
    // Explícito: o resultado é AGORA, não a data futura que já estava salva.
    if (resultado.tipo === 'encerrada') assert.notEqual(resultado.data_fim, FUTURA)
  })

  test('ATIVA já encerrada (data_fim no passado) -> não encerra de novo', () => {
    assert.deepEqual(resolverEncerramentoCampanha('ATIVA', PASSADA, AGORA), { tipo: 'ja_encerrada' })
  })

  test('RASCUNHO -> bloqueia, nunca encerra', () => {
    assert.deepEqual(resolverEncerramentoCampanha('RASCUNHO', null, AGORA), {
      tipo: 'erro',
      mensagem: 'Só uma campanha ativa pode ser encerrada.',
    })
  })

  test('INATIVA -> bloqueia, nunca encerra', () => {
    assert.deepEqual(resolverEncerramentoCampanha('INATIVA', null, AGORA), {
      tipo: 'erro',
      mensagem: 'Só uma campanha ativa pode ser encerrada.',
    })
  })
})

// motivoBloqueioReaberturaEncerrada — campanha Encerrada (ATIVA + data_fim no
// passado) nunca pode voltar a Ativa/Agendada por edição normal de data_fim
// (só existe Encerrar, nunca existe Reabrir). Chamada por atualizar() só
// quando `data_fim` vem no corpo — ver comentário em campanhas.ts; por isso
// "alterar só o título" é coberto aqui como "data_fim resubmetida sem
// mudança" (exatamente o que o formulário real faz: montarPayloadCampanha
// sempre reenvia todos os campos, nunca um PATCH parcial).
describe('motivoBloqueioReaberturaEncerrada', () => {
  const AGORA = new Date('2026-06-15T12:00:00.000Z')
  const FUTURA = new Date('2026-07-01T00:00:00.000Z')
  const PASSADA = new Date('2026-01-01T00:00:00.000Z')
  const PASSADA_2 = new Date('2026-02-01T00:00:00.000Z')

  test('encerrada + alterar título (data_fim resubmetida sem mudança) -> permitido', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', PASSADA, PASSADA, AGORA), null)
  })

  test('encerrada + data_fim futura -> bloqueado', () => {
    const erro = motivoBloqueioReaberturaEncerrada('ATIVA', PASSADA, FUTURA, AGORA)
    assert.equal(erro, 'Campanha encerrada não pode ser reaberta alterando a data de término. Para reabrir, crie uma nova campanha.')
  })

  test('encerrada + remover data_fim (null) -> bloqueado', () => {
    const erro = motivoBloqueioReaberturaEncerrada('ATIVA', PASSADA, null, AGORA)
    assert.notEqual(erro, null)
  })

  test('encerrada + trocar por outra data ainda no passado -> permitido (continua encerrada)', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', PASSADA, PASSADA_2, AGORA), null)
  })

  test('ATIVA ainda não encerrada (data_fim futura) -> edição de data_fim livre, mesmo pra null', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', FUTURA, null, AGORA), null)
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', FUTURA, FUTURA, AGORA), null)
  })

  test('ATIVA sem data_fim (nunca esteve encerrada) -> edição de data_fim livre', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', null, FUTURA, AGORA), null)
    assert.equal(motivoBloqueioReaberturaEncerrada('ATIVA', null, null, AGORA), null)
  })

  test('RASCUNHO -> nunca bloqueia (regra só se aplica a campanha ATIVA encerrada)', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('RASCUNHO', PASSADA, FUTURA, AGORA), null)
  })

  test('INATIVA -> nunca bloqueia (regra só se aplica a campanha ATIVA encerrada)', () => {
    assert.equal(motivoBloqueioReaberturaEncerrada('INATIVA', PASSADA, null, AGORA), null)
  })
})

// motivoBloqueioPublicarComDataFimPassada — publicar (RASCUNHO->ATIVA) ou
// reativar (INATIVA->ATIVA) nunca pode terminar silenciosamente "Encerrada"
// (data_fim já no passado). Cobre tanto o caso de data_fim já salva na
// campanha (RASCUNHO com data_fim antiga, ex.: herdada de uma duplicação)
// quanto uma data_fim passada enviada na MESMA requisição de publicar.
describe('motivoBloqueioPublicarComDataFimPassada', () => {
  const AGORA = new Date('2026-06-15T12:00:00.000Z')
  const FUTURA = new Date('2026-07-01T00:00:00.000Z')
  const PASSADA = new Date('2026-01-01T00:00:00.000Z')

  test('publicar com data_fim no passado -> bloqueado', () => {
    const erro = motivoBloqueioPublicarComDataFimPassada(PASSADA, AGORA)
    assert.equal(erro, 'Não é possível publicar/reativar uma campanha com a data de término no passado. Ajuste o período (data_fim) antes de publicar.')
  })

  test('publicar sem data_fim (null) -> permitido', () => {
    assert.equal(motivoBloqueioPublicarComDataFimPassada(null, AGORA), null)
  })

  test('publicar com data_fim futura -> permitido', () => {
    assert.equal(motivoBloqueioPublicarComDataFimPassada(FUTURA, AGORA), null)
  })
})

// motivoBloqueioEncerramentoSilencioso — uma edição NORMAL (fora de publicar/
// reativar e fora do POST /encerrar) nunca pode encerrar a campanha só por
// colocar `data_fim` no passado. Só age em campanha ATIVA que ainda NÃO está
// encerrada; o `data_fim` de uma já encerrada é governado só por
// motivoBloqueioReaberturaEncerrada (preservado).
describe('motivoBloqueioEncerramentoSilencioso', () => {
  const AGORA = new Date('2026-06-15T12:00:00.000Z')
  const FUTURA = new Date('2026-07-01T00:00:00.000Z')
  const PASSADA = new Date('2026-01-01T00:00:00.000Z')
  const PASSADA_2 = new Date('2026-02-01T00:00:00.000Z')

  test('ATIVA vigente + nova data_fim futura -> permitido', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', null, FUTURA, AGORA), null)
  })

  test('ATIVA vigente + nova data_fim no passado -> bloqueado, orienta usar "Encerrar campanha"', () => {
    const erro = motivoBloqueioEncerramentoSilencioso('ATIVA', null, PASSADA, AGORA)
    assert.equal(erro, 'Não é possível definir a data de término no passado por aqui. Para encerrar a campanha agora, use a ação "Encerrar campanha".')
  })

  test('ATIVA agendada (data_fim futura ainda) + nova data_fim no passado -> bloqueado', () => {
    assert.notEqual(motivoBloqueioEncerramentoSilencioso('ATIVA', FUTURA, PASSADA, AGORA), null)
  })

  test('campanha JÁ encerrada reenviando a MESMA data_fim passada (salvar outros campos) -> permitido', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', PASSADA, PASSADA, AGORA), null)
  })

  test('campanha JÁ encerrada trocando por OUTRA data passada -> permitido aqui (governado por motivoBloqueioReaberturaEncerrada)', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', PASSADA, PASSADA_2, AGORA), null)
  })

  test('campanha JÁ encerrada tentando null ou futuro -> este bloqueio não age (motivoBloqueioReaberturaEncerrada é quem barra)', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', PASSADA, null, AGORA), null)
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', PASSADA, FUTURA, AGORA), null)
  })

  test('data_fim nulo ou no futuro -> nunca encerra, sempre válido ("início sem fim" continua ok)', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', null, null, AGORA), null)
    assert.equal(motivoBloqueioEncerramentoSilencioso('ATIVA', null, AGORA, AGORA), null)
  })

  test('RASCUNHO / INATIVA -> não age (edição de data_fim livre; publicar já é barrado por motivoBloqueioPublicarComDataFimPassada)', () => {
    assert.equal(motivoBloqueioEncerramentoSilencioso('RASCUNHO', null, PASSADA, AGORA), null)
    assert.equal(motivoBloqueioEncerramentoSilencioso('INATIVA', PASSADA, PASSADA_2, AGORA), null)
  })
})

// Etapa 1 de agendamento/vigência — parseDataVigencia (parse seguro do valor
// bruto do corpo) e validarPeriodoVigencia (ordem só quando ambos vêm). Não
// tocam em elegibilidade/status/getStatus/Encerrar; data_inicio no passado é
// permitida; "publicar com data_fim passada" continua sendo
// motivoBloqueioPublicarComDataFimPassada (acima), não estas.
describe('parseDataVigencia', () => {
  test('ausente/null/string vazia -> { data: null, erro: null }', () => {
    assert.deepEqual(parseDataVigencia(undefined, 'Data de início'), { data: null, erro: null })
    assert.deepEqual(parseDataVigencia(null, 'Data de início'), { data: null, erro: null })
    assert.deepEqual(parseDataVigencia('', 'Data de início'), { data: null, erro: null })
  })

  test('string ISO válida (com offset) -> Date correspondente, sem erro', () => {
    const r = parseDataVigencia('2026-09-01T09:00:00-03:00', 'Data de início')
    assert.equal(r.erro, null)
    assert.ok(r.data instanceof Date)
    assert.equal(r.data!.getTime(), new Date('2026-09-01T09:00:00-03:00').getTime())
  })

  test('data-only (YYYY-MM-DD) válida -> Date, sem erro', () => {
    const r = parseDataVigencia('2026-09-01', 'Data de término')
    assert.equal(r.erro, null)
    assert.equal(r.data!.getTime(), new Date('2026-09-01').getTime())
  })

  test('já sendo Date -> passa direto', () => {
    const d = new Date('2026-09-01T00:00:00.000Z')
    const r = parseDataVigencia(d, 'Data de início')
    assert.equal(r.erro, null)
    assert.equal(r.data, d)
  })

  test('string não parseável -> erro claro com o rótulo, data null', () => {
    const r = parseDataVigencia('amanhã de manhã', 'Data de início')
    assert.equal(r.data, null)
    assert.equal(r.erro, 'Data de início inválida. Informe uma data/hora válida.')

    const r2 = parseDataVigencia('2026-13-45', 'Data de término')
    assert.equal(r2.data, null)
    assert.match(r2.erro!, /Data de término inválida/)
  })
})

describe('validarPeriodoVigencia', () => {
  const INICIO = new Date('2026-09-01T09:00:00.000Z')
  const FIM = new Date('2026-09-30T18:00:00.000Z')
  const PASSADO = new Date('2020-01-01T00:00:00.000Z')

  test('null / null -> válido (sem restrição de período)', () => {
    assert.equal(validarPeriodoVigencia(null, null), null)
  })

  test('só início (fim null) -> válido', () => {
    assert.equal(validarPeriodoVigencia(INICIO, null), null)
  })

  test('só fim (início null) -> válido', () => {
    assert.equal(validarPeriodoVigencia(null, FIM), null)
  })

  test('início < fim -> válido', () => {
    assert.equal(validarPeriodoVigencia(INICIO, FIM), null)
  })

  test('início == fim -> inválido', () => {
    assert.equal(
      validarPeriodoVigencia(INICIO, new Date(INICIO)),
      'A data de início deve ser anterior à data de término.'
    )
  })

  test('início > fim -> inválido', () => {
    assert.equal(
      validarPeriodoVigencia(FIM, INICIO),
      'A data de início deve ser anterior à data de término.'
    )
  })

  test('início no passado, sem fim -> válido (data_inicio no passado é permitida)', () => {
    assert.equal(validarPeriodoVigencia(PASSADO, null), null)
  })

  test('início no passado < fim -> válido', () => {
    assert.equal(validarPeriodoVigencia(PASSADO, FIM), null)
  })
})

// Etapa 4 — duplicar() nunca herda a vigência: a cópia nasce RASCUNHO com
// data_inicio/data_fim nulos, qualquer que seja o período da original.
describe('vigenciaCopiaCampanha', () => {
  const INICIO = new Date('2026-09-01T09:00:00.000Z')
  const FIM = new Date('2026-09-30T18:00:00.000Z')

  test('original com início + fim -> cópia null/null', () => {
    assert.deepEqual(vigenciaCopiaCampanha(INICIO, FIM), { data_inicio: null, data_fim: null })
  })

  test('original só início -> cópia null/null', () => {
    assert.deepEqual(vigenciaCopiaCampanha(INICIO, null), { data_inicio: null, data_fim: null })
  })

  test('original só fim -> cópia null/null', () => {
    assert.deepEqual(vigenciaCopiaCampanha(null, FIM), { data_inicio: null, data_fim: null })
  })

  test('original sem datas -> cópia null/null', () => {
    assert.deepEqual(vigenciaCopiaCampanha(null, null), { data_inicio: null, data_fim: null })
  })
})

describe('validarIdsReordenacao', () => {
  // idsDoGrupo simula o subconjunto já filtrado por chaveGrupoConcorrente
  // (calculado pelo controller), nunca o total de campanhas do tenant.
  const idsDoGrupo = ['a', 'b', 'c']

  test('lista vazia ou não-array -> erro', () => {
    assert.match(validarIdsReordenacao([], idsDoGrupo).erro!, /Informe a lista/)
    assert.match(validarIdsReordenacao(null, idsDoGrupo).erro!, /Informe a lista/)
    assert.match(validarIdsReordenacao('a,b,c', idsDoGrupo).erro!, /Informe a lista/)
  })

  test('item não-string ou vazio -> erro', () => {
    assert.match(validarIdsReordenacao(['a', 2, 'c'], idsDoGrupo).erro!, /inválida/)
    assert.match(validarIdsReordenacao(['a', '  ', 'c'], idsDoGrupo).erro!, /inválida/)
  })

  test('ids duplicados -> erro', () => {
    assert.match(validarIdsReordenacao(['a', 'b', 'a'], ['a', 'b']).erro!, /duplicados/)
  })

  test('lista que não bate exatamente com o grupo -> erro', () => {
    assert.match(validarIdsReordenacao(['a', 'b'], idsDoGrupo).erro!, /grupo de prioridade/)
    assert.match(validarIdsReordenacao(['a', 'b', 'x'], idsDoGrupo).erro!, /grupo de prioridade/)
  })

  test('lista válida (mesmo conjunto do grupo, ordem qualquer) -> sem erro', () => {
    const resultado = validarIdsReordenacao(['c', 'a', 'b'], idsDoGrupo)
    assert.equal(resultado.erro, null)
    assert.deepEqual(resultado.ids, ['c', 'a', 'b'])
  })
})

describe('chaveGrupoConcorrente', () => {
  function campanha(overrides: Partial<CampanhaGrupoInput>): CampanhaGrupoInput {
    return {
      id: 'x',
      sistema: 'esig',
      tela: 'Agenda',
      modo_identificacao: 'sistema_tela',
      url_contem: null,
      gatilho: 'ao_abrir_tela',
      evento: null,
      ...overrides,
    }
  }

  test('sistema_tela: mesma sistema+tela -> mesma chave', () => {
    const a = chaveGrupoConcorrente(campanha({ id: 'a' }))
    const b = chaveGrupoConcorrente(campanha({ id: 'b' }))
    assert.equal(a, b)
    assert.ok(a)
  })

  test('sistema_tela: telas diferentes -> chaves diferentes', () => {
    const a = chaveGrupoConcorrente(campanha({ tela: 'Agenda' }))
    const b = chaveGrupoConcorrente(campanha({ tela: 'Faturamento' }))
    assert.notEqual(a, b)
  })

  test('sistemas diferentes -> chaves diferentes mesmo com a mesma tela', () => {
    const a = chaveGrupoConcorrente(campanha({ sistema: 'esig' }))
    const b = chaveGrupoConcorrente(campanha({ sistema: 'quark' }))
    assert.notEqual(a, b)
  })

  test('url_contem: mesma sistema+url_contem -> mesma chave', () => {
    const a = chaveGrupoConcorrente(campanha({ modo_identificacao: 'url_contem', url_contem: '/agenda', tela: null }))
    const b = chaveGrupoConcorrente(campanha({ modo_identificacao: 'url_contem', url_contem: '/agenda', tela: null }))
    assert.equal(a, b)
    assert.ok(a)
  })

  test('url_contem sem valor -> sem grupo (null)', () => {
    assert.equal(chaveGrupoConcorrente(campanha({ modo_identificacao: 'url_contem', url_contem: null })), null)
  })

  test('sistema_tela e url_contem nunca competem entre si', () => {
    const a = chaveGrupoConcorrente(campanha({ modo_identificacao: 'sistema_tela', tela: 'Agenda' }))
    const b = chaveGrupoConcorrente(campanha({ modo_identificacao: 'url_contem', url_contem: 'Agenda' }))
    assert.notEqual(a, b)
  })

  test('data_cy nunca forma grupo -> sempre null', () => {
    assert.equal(chaveGrupoConcorrente(campanha({ modo_identificacao: 'data_cy' })), null)
  })

  test('apos_evento com eventos diferentes -> chaves diferentes', () => {
    const a = chaveGrupoConcorrente(campanha({ gatilho: 'apos_evento', evento: 'salvou_ficha' }))
    const b = chaveGrupoConcorrente(campanha({ gatilho: 'apos_evento', evento: 'abriu_relatorio' }))
    assert.notEqual(a, b)
  })

  test('ao_abrir_tela e apos_evento (mesma tela) nunca competem entre si', () => {
    const a = chaveGrupoConcorrente(campanha({ gatilho: 'ao_abrir_tela' }))
    const b = chaveGrupoConcorrente(campanha({ gatilho: 'apos_evento', evento: 'salvou_ficha' }))
    assert.notEqual(a, b)
  })
})

describe('calcularPrioridadesReordenadas', () => {
  test('primeiro da lista recebe a maior prioridade, decrescendo por posição', () => {
    assert.deepEqual(calcularPrioridadesReordenadas(['x', 'y', 'z']), [
      { id: 'x', prioridade: 3 },
      { id: 'y', prioridade: 2 },
      { id: 'z', prioridade: 1 },
    ])
  })

  test('lista com 1 item -> prioridade 1', () => {
    assert.deepEqual(calcularPrioridadesReordenadas(['único']), [{ id: 'único', prioridade: 1 }])
  })
})

// segmentar_dominios (multi-URL do mesmo sistema, ex.: QuarkClinic) — mesma
// normalização usada por normalizarDominioRegra em tours.ts.
describe('normalizarDominio', () => {
  test('URL completa com protocolo/porta/path é reduzida a hostname puro em lowercase', () => {
    assert.equal(normalizarDominio(' HTTPS://NG.QuarkClinic.com.br:8443/caminho/x '), 'ng.quarkclinic.com.br')
  })

  test('hostname já puro só é trimado/lowercased', () => {
    assert.equal(normalizarDominio(' Profissional.QuarkClinic.com.br '), 'profissional.quarkclinic.com.br')
  })

  test('hostname com porta mas sem protocolo remove a porta', () => {
    assert.equal(normalizarDominio('gng.quarkclinic.com.br:3000'), 'gng.quarkclinic.com.br')
  })
})
