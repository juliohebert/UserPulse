import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  tenantPublicoPermiteAcesso, obterSituacaoComercialTenant, motivoBloqueioEscrita,
  motivoLimiteAtivosAtingido, resolverPlanoTrial, resolverDuracaoTrialDias, TRIAL_DIAS_PADRAO,
  diasRestantesTrial, motivoBloqueioOperacionalTrial,
  motivoLimiteTrialAtingido, deveChecarLimiteCadastro,
} from './tenantGuards'
import type { Plano } from '@prisma/client'

const AGORA = new Date('2026-07-10T12:00:00Z')
const DIA_MS = 86_400_000
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA_MS)
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA_MS)

// Fase 2 do widget multi-tenant — decisão pura de acesso público (sem banco),
// usada por resolverTenantPublico em cima de um tenant já buscado por
// public_key ou pelo fallback do tenant Quark. Ver widget.ts.
describe('tenantPublicoPermiteAcesso — decisão de acesso público (sem banco)', () => {
  test('tenant nulo (public_key/slug não encontrado) nunca tem acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso(null), false)
  })

  test('SUSPENDED bloqueia o widget público', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'SUSPENDED' }), false)
  })

  test('CANCELED bloqueia o widget público', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'CANCELED' }), false)
  })

  test('ACTIVE permite acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'ACTIVE' }), true)
  })

  test('TRIAL permite acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'TRIAL' }), true)
  })

  test('EXPIRED ainda permite o widget público — só bloqueia escrita no admin (ver motivoBloqueioEscrita)', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'EXPIRED' }), true)
  })
})

// obterSituacaoComercialTenant — decisão pura (sem banco) que agora
// considera trial_fim/licenca_fim além de status, usada tanto pra bloquear
// escrita (motivoBloqueioEscrita) quanto pro banner do painel (ver
// tenantPublico() em controllers/auth.ts). `agora` fixo (AGORA acima) pra
// testar as bordas de vencimento sem depender do relógio real.
describe('obterSituacaoComercialTenant — TRIAL', () => {
  test('sem trial_fim => trial_ativo (sem prazo definido, nunca vence sozinho)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: null, licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim no futuro => trial_ativo', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim no passado => trial_vencido', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA), 'trial_vencido')
  })
  test('trial_fim exatamente agora ainda não venceu (< estrito, não <=)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: AGORA, licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim 1ms no passado já venceu', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: new Date(AGORA.getTime() - 1), licenca_fim: null }, AGORA), 'trial_vencido')
  })
})

describe('obterSituacaoComercialTenant — ACTIVE', () => {
  test('sem licenca_fim => licenca_ativa (sem prazo definido, nunca vence sozinha)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: null }, AGORA), 'licenca_ativa')
  })
  test('licenca_fim no futuro => licenca_ativa', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), 'licenca_ativa')
  })
  test('licenca_fim no passado => licenca_vencida', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA), 'licenca_vencida')
  })
})

describe('obterSituacaoComercialTenant — EXPIRED, SUSPENDED, CANCELED', () => {
  test('EXPIRED sem licenca_fim => trial_vencido (nunca teve licença paga)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), 'trial_vencido')
  })
  test('EXPIRED com licenca_fim => licenca_vencida (já teve licença paga)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'EXPIRED', trial_fim: passado(60), licenca_fim: passado(5) }, AGORA), 'licenca_vencida')
  })
  test('SUSPENDED => suspenso, independente de qualquer data', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'SUSPENDED', trial_fim: futuro(10), licenca_fim: futuro(10) }, AGORA), 'suspenso')
  })
  test('CANCELED => cancelado, independente de qualquer data', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'CANCELED', trial_fim: futuro(10), licenca_fim: futuro(10) }, AGORA), 'cancelado')
  })
})

// motivoBloqueioEscrita — mesma matriz acima, agora conferindo o efeito
// prático (bloqueia ou não escrita) e a mensagem devolvida ao controller.
describe('motivoBloqueioEscrita — bloqueia todo mundo "vencido", libera o resto', () => {
  test('TRIAL ativo (trial_fim futuro) não bloqueia', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null }, AGORA), null)
  })
  test('TRIAL vencido bloqueia com mensagem de teste grátis', () => {
    const motivo = motivoBloqueioEscrita({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /teste grátis vencido/i)
  })
  test('ACTIVE com licença em dia não bloqueia', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), null)
  })
  test('ACTIVE com licença vencida bloqueia com mensagem de licença', () => {
    const motivo = motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA)
    assert.match(motivo ?? '', /licença vencida/i)
  })
  test('EXPIRED bloqueia (mesmo sem SUSPENDED/CANCELED)', () => {
    assert.notEqual(motivoBloqueioEscrita({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), null)
  })
  test('SUSPENDED bloqueia com mensagem de suspensão', () => {
    const motivo = motivoBloqueioEscrita({ status: 'SUSPENDED', trial_fim: null, licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /suspensa/i)
  })
  test('CANCELED bloqueia com mensagem de cancelamento', () => {
    const motivo = motivoBloqueioEscrita({ status: 'CANCELED', trial_fim: null, licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /cancelada/i)
  })
})

// Fase 6A — motivoLimiteAtivosAtingido é a decisão pura por trás de
// checarLimiteCampanhasAtivas/checarLimiteToursAtivos/checarLimiteJornadasAtivas
// (cada um só busca o `total` no banco e delega a decisão pra cá) — testar
// aqui cobre as três, sem precisar de Prisma/banco (mesmo padrão do resto
// deste arquivo). Serve também de regressão: campanhas/tours usavam a mesma
// comparação copiada 2x antes desta função existir.
describe('motivoLimiteAtivosAtingido — decisão pura de limite "X ativos simultâneos"', () => {
  test('limite null = sem limite, nunca bloqueia', () => {
    assert.equal(motivoLimiteAtivosAtingido(null, 999, 'campanha(s) ativa(s)'), null)
  })
  test('limite undefined = sem limite, nunca bloqueia', () => {
    assert.equal(motivoLimiteAtivosAtingido(undefined, 999, 'tour(s) ativo(s)'), null)
  })
  test('total abaixo do limite libera (campanhas)', () => {
    assert.equal(motivoLimiteAtivosAtingido(10, 9, 'campanha(s) ativa(s)'), null)
  })
  test('total igual ao limite bloqueia (tours)', () => {
    const motivo = motivoLimiteAtivosAtingido(1, 1, 'tour(s) ativo(s)')
    assert.match(motivo ?? '', /Limite de 1 tour\(s\) ativo\(s\) do plano atingido\./)
  })
  test('total acima do limite bloqueia (jornadas)', () => {
    const motivo = motivoLimiteAtivosAtingido(1, 2, 'jornada(s) ativa(s)')
    assert.match(motivo ?? '', /Limite de 1 jornada\(s\) ativa\(s\) do plano atingido\./)
  })
  test('total zero, dentro do limite, libera (jornadas — limite disponível)', () => {
    assert.equal(motivoLimiteAtivosAtingido(1, 0, 'jornada(s) ativa(s)'), null)
  })
})

// Fase 6A — resolverPlanoTrial garante a experiência de trial única: nunca
// resolve arbitrariamente quando a configuração está ambígua (0 ou 2+
// planos marcados eh_plano_trial=true), só quando existe exatamente 1.
describe('resolverPlanoTrial — exige exatamente 1 plano marcado como trial', () => {
  test('nenhum plano marcado => erro, não resolve nada', () => {
    const resultado = resolverPlanoTrial([])
    assert.equal(resultado.ok, false)
  })
  test('exatamente 1 plano marcado => resolve esse plano', () => {
    const resultado = resolverPlanoTrial([{ id: 'plano-teste-gratis', trial_dias: 14 }])
    assert.deepEqual(resultado, { ok: true, plano: { id: 'plano-teste-gratis', trial_dias: 14 } })
  })
  test('mais de 1 plano marcado => erro, configuração ambígua', () => {
    const resultado = resolverPlanoTrial([
      { id: 'plano-a', trial_dias: 14 },
      { id: 'plano-b', trial_dias: 7 },
    ])
    assert.equal(resultado.ok, false)
  })
})

describe('resolverDuracaoTrialDias — default de 14 dias, trial_dias<=0 é configuração inválida', () => {
  test('null cai no default (14)', () => {
    assert.deepEqual(resolverDuracaoTrialDias(null), { ok: true, dias: TRIAL_DIAS_PADRAO })
  })
  test('undefined cai no default (14)', () => {
    assert.deepEqual(resolverDuracaoTrialDias(undefined), { ok: true, dias: TRIAL_DIAS_PADRAO })
  })
  test('1 usa o valor configurado (1)', () => {
    assert.deepEqual(resolverDuracaoTrialDias(1), { ok: true, dias: 1 })
  })
  test('14 usa o valor configurado (14, igual ao default mas explícito)', () => {
    assert.deepEqual(resolverDuracaoTrialDias(14), { ok: true, dias: 14 })
  })
  test('trial_dias definido no plano prevalece sobre o default (30)', () => {
    assert.deepEqual(resolverDuracaoTrialDias(30), { ok: true, dias: 30 })
  })
  test('0 é inválido', () => {
    const resultado = resolverDuracaoTrialDias(0)
    assert.equal(resultado.ok, false)
  })
  test('negativo é inválido', () => {
    const resultado = resolverDuracaoTrialDias(-1)
    assert.equal(resultado.ok, false)
  })
})

// Fase 6C — diasRestantesTrial: cálculo dinâmico (sem persistência) de
// quantos dias faltam pro trial vencer, sempre a partir de trial_fim.
describe('diasRestantesTrial — dias restantes calculados em runtime a partir de trial_fim', () => {
  test('trial_fim null => null (trial sem prazo definido)', () => {
    assert.equal(diasRestantesTrial(null, AGORA), null)
  })
  test('14 dias no futuro => 14 dias restantes', () => {
    assert.equal(diasRestantesTrial(futuro(14), AGORA), 14)
  })
  test('1 dia no futuro => 1 dia restante', () => {
    assert.equal(diasRestantesTrial(futuro(1), AGORA), 1)
  })
  test('menos de 24h no futuro (1h) => arredonda pra cima, 1 dia restante', () => {
    assert.equal(diasRestantesTrial(new Date(AGORA.getTime() + 60 * 60 * 1000), AGORA), 1)
  })
  test('23h59min no futuro => ainda 1 dia restante (ceil, não floor)', () => {
    assert.equal(diasRestantesTrial(new Date(AGORA.getTime() + DIA_MS - 1), AGORA), 1)
  })
  test('exatamente 2 dias no futuro => 2 dias restantes (sem arredondar pra cima à toa)', () => {
    assert.equal(diasRestantesTrial(futuro(2), AGORA), 2)
  })
  test('exatamente no vencimento (trial_fim === agora) => 0 dias restantes', () => {
    assert.equal(diasRestantesTrial(AGORA, AGORA), 0)
  })
  test('trial_fim no passado (expirado) => 0 dias restantes, nunca negativo', () => {
    assert.equal(diasRestantesTrial(passado(5), AGORA), 0)
  })
  test('trial_fim 1ms no passado => 0 dias restantes', () => {
    assert.equal(diasRestantesTrial(new Date(AGORA.getTime() - 1), AGORA), 0)
  })
})

// Fase 6C — motivoBloqueioOperacionalTrial: bloqueio de USO OPERACIONAL
// inteiro (não só escrita), exclusivo de trial vencido — licença paga
// vencida/suspenso/cancelado continuam só sob motivoBloqueioEscrita, sem
// mudança (ver requireAcessoOperacional.test.ts pro middleware completo).
describe('motivoBloqueioOperacionalTrial — só bloqueia por TRIAL vencido', () => {
  test('trial ativo permite (não bloqueia)', () => {
    assert.equal(motivoBloqueioOperacionalTrial({ status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null }, AGORA), null)
  })
  test('trial vencido bloqueia com mensagem de "escolha um plano"', () => {
    const motivo = motivoBloqueioOperacionalTrial({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /teste grátis terminou/i)
    assert.match(motivo ?? '', /escolha um plano/i)
  })
  test('tenant pago (ACTIVE, licença em dia) não é afetado', () => {
    assert.equal(motivoBloqueioOperacionalTrial({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), null)
  })
  test('ACTIVE com licença vencida NÃO usa este bloqueio (continua só sob motivoBloqueioEscrita)', () => {
    assert.equal(motivoBloqueioOperacionalTrial({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA), null)
  })
  test('SUSPENDED não usa este bloqueio (continua só sob motivoBloqueioEscrita)', () => {
    assert.equal(motivoBloqueioOperacionalTrial({ status: 'SUSPENDED', trial_fim: null, licenca_fim: null }, AGORA), null)
  })
  test('CANCELED não usa este bloqueio (continua só sob motivoBloqueioEscrita)', () => {
    assert.equal(motivoBloqueioOperacionalTrial({ status: 'CANCELED', trial_fim: null, licenca_fim: null }, AGORA), null)
  })
})

// Fase 6D — limite de trial conta TOTAL cadastrado (ativo ou não), não só
// ativos: sem isso, dava pra contornar o limite exibido ("1 tour") criando
// vários itens inativos e alternando qual fica ativo. As duas funções
// abaixo (motivoLimiteTrialAtingido e deveChecarLimiteCadastro) são as
// decisões puras por trás de checarLimiteCampanhasAtivas/ToursAtivos/
// JornadasAtivas (cada uma só busca o `total` via prisma.count — com o
// WHERE certo pra cada modo, ver o próprio arquivo — e delega a decisão pra
// cá); a contagem em si (prisma.count com tenant_id/ativo/id:{not}) segue o
// mesmo padrão já usado no resto do arquivo e foi validada manualmente
// contra um servidor local (mesmo critério do restante do projeto pra
// Prisma — ver CLAUDE.md, "Tests"): criar N itens inativos até o limite
// bloqueia o N+1º mesmo com 0 ativos; excluir um deles libera a vaga
// (COUNT reflete o estado atual da tabela, sem lógica própria a testar
// aqui); tenant_id no WHERE (idêntico ao já usado em checarLimite*Ativas
// antes desta fase) garante isolamento entre tenants.
describe('motivoLimiteTrialAtingido — mensagem do limite de trial (conta TOTAL, não só ativos)', () => {
  test('limite null = sem limite, nunca bloqueia', () => {
    assert.equal(motivoLimiteTrialAtingido(null, 999, 'campanha'), null)
  })
  test('total abaixo do limite libera', () => {
    assert.equal(motivoLimiteTrialAtingido(10, 9, 'campanha'), null)
  })
  test('total igual ao limite bloqueia — trial com limite atingido, mesmo que os itens estejam todos inativos (total, não ativos)', () => {
    const motivo = motivoLimiteTrialAtingido(1, 1, 'tour')
    assert.match(motivo ?? '', /Limite do teste grátis atingido\. Seu plano permite até 1 tour durante o período gratuito\./)
  })
  test('total acima do limite bloqueia', () => {
    const motivo = motivoLimiteTrialAtingido(1, 2, 'jornada')
    assert.match(motivo ?? '', /Limite do teste grátis atingido\. Seu plano permite até 1 jornada durante o período gratuito\./)
  })
  test('limite=1 usa singular ("1 tour", não "1 tours")', () => {
    const motivo = motivoLimiteTrialAtingido(1, 5, 'tour')
    assert.match(motivo ?? '', /até 1 tour durante/)
  })
  test('limite>1 usa plural ("10 campanhas")', () => {
    const motivo = motivoLimiteTrialAtingido(10, 10, 'campanha')
    assert.match(motivo ?? '', /até 10 campanhas durante/)
  })
  test('excluir um item libera vaga — total abaixo do limite depois de descontar a exclusão volta a liberar', () => {
    // Simula o efeito de uma exclusão: total cai de 1 (no limite) para 0.
    assert.notEqual(motivoLimiteTrialAtingido(1, 1, 'tour'), null)
    assert.equal(motivoLimiteTrialAtingido(1, 0, 'tour'), null)
  })
})

// deveChecarLimiteCadastro decide QUANDO a checagem de limite roda numa
// criação — é o que garante que, em trial, um POST com ativo:false não
// escapa do limite (a checagem não fica presa a "só quando ativa").
describe('deveChecarLimiteCadastro — quando a checagem de limite entra em jogo na criação', () => {
  const planoTrial: Plano = { eh_plano_trial: true } as Plano
  const planoPago: Plano = { eh_plano_trial: false } as Plano

  test('trial + criando inativo (ativo:false) => precisa checar (impede contornar o limite com itens inativos)', () => {
    assert.equal(deveChecarLimiteCadastro(false, planoTrial), true)
  })
  test('trial + criando ativo => precisa checar', () => {
    assert.equal(deveChecarLimiteCadastro(true, planoTrial), true)
  })
  test('plano pago + criando inativo => NÃO precisa checar (comportamento atual preservado — só ativos contam)', () => {
    assert.equal(deveChecarLimiteCadastro(false, planoPago), false)
  })
  test('plano pago + criando ativo => precisa checar (comportamento atual preservado)', () => {
    assert.equal(deveChecarLimiteCadastro(true, planoPago), true)
  })
  test('sem plano vinculado + criando inativo => NÃO precisa checar (mesmo raciocínio do plano pago)', () => {
    assert.equal(deveChecarLimiteCadastro(false, null), false)
  })
})
