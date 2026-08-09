import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarCadastroPublico, calcularTrialDatas, montarDadosCadastroPublico, motivoSenhaFraca } from './auth'

// Fase 6B — cadastro público self-service. Só funções puras (sem Prisma/
// banco), mesmo padrão de tenantGuards.test.ts/tours.test.ts — os caminhos
// que tocam banco (checagem de e-mail duplicado, criação em transação,
// resolução do plano trial via prisma.plano.findMany) são validados
// manualmente contra um servidor local, documentado no relatório da fase.

describe('validarCadastroPublico — payload válido/inválido', () => {
  test('payload completo e válido é aceito', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana Silva', empresa: 'Acme Ltda', email: 'ana@acme.com', senha: 'Senha@123' })
    assert.deepEqual(resultado, {
      ok: true,
      data: { nome: 'Ana Silva', empresa: 'Acme Ltda', email: 'ana@acme.com', senha: 'Senha@123' },
    })
  })
  test('nome ausente é rejeitado', () => {
    const resultado = validarCadastroPublico({ empresa: 'Acme', email: 'ana@acme.com', senha: 'Senha@123' })
    assert.equal(resultado.ok, false)
  })
  test('empresa ausente é rejeitado', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', email: 'ana@acme.com', senha: 'Senha@123' })
    assert.equal(resultado.ok, false)
  })
  test('email ausente é rejeitado', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', empresa: 'Acme', senha: 'Senha@123' })
    assert.equal(resultado.ok, false)
  })
  test('senha ausente é rejeitado', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', empresa: 'Acme', email: 'ana@acme.com' })
    assert.equal(resultado.ok, false)
  })
  test('email sem formato válido é rejeitado', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', empresa: 'Acme', email: 'não-é-email', senha: 'Senha@123' })
    assert.equal(resultado.ok, false)
  })
  test('email é normalizado (trim + lowercase), mesmo padrão de login()', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', empresa: 'Acme', email: '  Ana@ACME.com  ', senha: 'Senha@123' })
    assert.equal(resultado.ok, true)
    assert.equal(resultado.ok && resultado.data.email, 'ana@acme.com')
  })
  test('nome/empresa são trimados', () => {
    const resultado = validarCadastroPublico({ nome: '  Ana  ', empresa: '  Acme  ', email: 'ana@acme.com', senha: 'Senha@123' })
    assert.equal(resultado.ok, true)
    assert.equal(resultado.ok && resultado.data.nome, 'Ana')
    assert.equal(resultado.ok && resultado.data.empresa, 'Acme')
  })
  test('campos sensíveis enviados no body são ignorados — data só tem nome/empresa/email/senha', () => {
    const malicioso = {
      nome: 'Ana', empresa: 'Acme', email: 'ana@acme.com', senha: 'Senha@123',
      tenant_id: 'outro-tenant', plano_id: 'plano-enterprise', role: 'SUPER_ADMIN',
      status: 'ACTIVE', trial_inicio: '2020-01-01', trial_fim: '2099-01-01',
      public_key: 'forjado', slug: 'forjado', limite_campanhas_ativas: 999999,
    } as Record<string, unknown>
    const resultado = validarCadastroPublico(malicioso)
    assert.equal(resultado.ok, true)
    assert.deepEqual(resultado.ok && Object.keys(resultado.data).sort(), ['email', 'empresa', 'nome', 'senha'])
  })
})

// Regra única de senha forte (backend é fonte de verdade — ver comentário
// em REGRAS_SENHA_FORTE no auth.ts; o frontend espelha a mesma lista só
// pra exibir o checklist, nunca decide sozinho). Reaproveitada tal qual por
// validarCadastroPublico (cadastro) e trocarSenha (troca de senha) — os
// blocos abaixo testam a mesma função pura pelos dois ângulos.
describe('motivoSenhaFraca — 8+ caracteres, maiúscula, minúscula, número e caractere especial', () => {
  test('curta (menos de 8 caracteres, mesmo satisfazendo o resto) é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Sh@1'), null)
  })
  test('sem maiúscula é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('senha@123'), null)
  })
  test('sem minúscula é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('SENHA@123'), null)
  })
  test('sem número é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Senha@abc'), null)
  })
  test('sem caractere especial é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Senha1234'), null)
  })
  test('senha válida (atende todas as regras) é aceita', () => {
    assert.equal(motivoSenhaFraca('Senha@123'), null)
  })
})

describe('validarCadastroPublico — senha fraca é rejeitada de ponta a ponta', () => {
  test('senha sem caractere especial é rejeitada pelo validador completo', () => {
    const resultado = validarCadastroPublico({ nome: 'Ana', empresa: 'Acme', email: 'ana@acme.com', senha: 'Senha1234' })
    assert.equal(resultado.ok, false)
  })
})

// trocarSenha (POST /auth/trocar-senha) chama motivoSenhaFraca(nova_senha)
// exatamente como validarCadastroPublico — antes desta correção, só exigia
// 8 caracteres, permitindo contornar a senha forte do cadastro trocando a
// senha logo em seguida. trocarSenha em si não é testado aqui (toca Prisma/
// bcrypt.compare, ver convenção do projeto) — estes casos comprovam que a
// MESMA função que ele chama rejeita/aceita exatamente o que esperado.
describe('trocarSenha — nova_senha usa a mesma regra de senha forte do cadastro', () => {
  test('curta é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Sh@1'), null)
  })
  test('sem maiúscula é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('senha@123'), null)
  })
  test('sem minúscula é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('SENHA@123'), null)
  })
  test('sem número é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Senha@abc'), null)
  })
  test('sem caractere especial é rejeitada', () => {
    assert.notEqual(motivoSenhaFraca('Senha1234'), null)
  })
  test('válida é aceita', () => {
    assert.equal(motivoSenhaFraca('Senha@123'), null)
  })
})

describe('calcularTrialDatas — trial_inicio/trial_fim a partir de `agora` + dias', () => {
  test('trial_inicio é exatamente `agora`', () => {
    const agora = new Date('2026-08-08T12:00:00Z')
    const { trial_inicio } = calcularTrialDatas(agora, 14)
    assert.equal(trial_inicio.getTime(), agora.getTime())
  })
  test('trial_fim é agora + N dias (14)', () => {
    const agora = new Date('2026-08-08T12:00:00Z')
    const { trial_fim } = calcularTrialDatas(agora, 14)
    assert.equal(trial_fim.toISOString(), '2026-08-22T12:00:00.000Z')
  })
  test('trial_fim é agora + N dias (1)', () => {
    const agora = new Date('2026-08-08T12:00:00Z')
    const { trial_fim } = calcularTrialDatas(agora, 1)
    assert.equal(trial_fim.toISOString(), '2026-08-09T12:00:00.000Z')
  })
})

describe('montarDadosCadastroPublico — Tenant/AdminUser sempre a partir de valores resolvidos no servidor', () => {
  const dados = { nome: 'Ana Silva', empresa: 'Acme Ltda', email: 'ana@acme.com', senha: 'Senha@123' }
  const agora = new Date('2026-08-08T12:00:00Z')

  test('role do AdminUser é sempre ADMIN', () => {
    const { adminData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id', trialDias: 14, passwordHash: 'hash', agora,
    })
    assert.equal(adminData.role, 'ADMIN')
  })
  test('status do Tenant é sempre TRIAL', () => {
    const { tenantData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id', trialDias: 14, passwordHash: 'hash', agora,
    })
    assert.equal(tenantData.status, 'TRIAL')
  })
  test('plano_id do Tenant vem do parâmetro resolvido (planoTrialId), nunca do body', () => {
    const { tenantData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id-xyz', trialDias: 14, passwordHash: 'hash', agora,
    })
    assert.equal(tenantData.plano_id, 'plano-trial-id-xyz')
  })
  test('trial_inicio/trial_fim calculados a partir de agora+trialDias', () => {
    const { tenantData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id', trialDias: 7, passwordHash: 'hash', agora,
    })
    assert.equal((tenantData.trial_inicio as Date).getTime(), agora.getTime())
    assert.equal((tenantData.trial_fim as Date).toISOString(), '2026-08-15T12:00:00.000Z')
  })
  test('password_hash do AdminUser é o hash recebido, nunca a senha em texto puro', () => {
    const { adminData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id', trialDias: 14, passwordHash: 'hash-bcrypt-simulado', agora,
    })
    assert.equal(adminData.password_hash, 'hash-bcrypt-simulado')
    assert.notEqual(adminData.password_hash, dados.senha)
  })
  test('slug do Tenant é o parâmetro já resolvido (slugUnico), não recalculado aqui', () => {
    const { tenantData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda-2', planoTrialId: 'plano-trial-id', trialDias: 14, passwordHash: 'hash', agora,
    })
    assert.equal(tenantData.slug, 'acme-ltda-2')
  })
  test('plano_pendente_id nunca é setado por este fluxo (fica no default null do schema)', () => {
    const { tenantData } = montarDadosCadastroPublico({
      dados, slug: 'acme-ltda', planoTrialId: 'plano-trial-id', trialDias: 14, passwordHash: 'hash', agora,
    })
    assert.equal('plano_pendente_id' in tenantData, false)
  })
})
