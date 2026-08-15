import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORMATO_DESTAQUE_ELEMENTO,
  normalizarDataCy,
  dataCyValido,
  validarFormatoDestaqueElemento,
  resolverModoIdentificacao,
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
