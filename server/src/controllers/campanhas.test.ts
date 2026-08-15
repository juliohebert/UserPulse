import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
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
  type DestaqueItemInput,
} from './campanhas'

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
