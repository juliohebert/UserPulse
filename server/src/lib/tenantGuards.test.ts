import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  tenantPublicoPermiteAcesso, obterSituacaoComercialTenant, motivoBloqueioEscrita,
  motivoLimiteAtivosAtingido, resolverPlanoTrial, resolverDuracaoTrialDias, TRIAL_DIAS_PADRAO,
  diasRestantesTrial, motivoBloqueioOperacionalTrial,
  motivoLimiteTrialAtingido, deveChecarLimiteCadastro,
  situacaoAdimplenciaTenant, diasRestantesTolerancia, motivoBloqueioOperacionalInadimplencia,
  TOLERANCIA_INADIMPLENCIA_DIAS, menorLimite, planoEfetivoParaLimite, avaliarEncaixeLimitesDowngrade,
} from './tenantGuards'
import type { Plano } from '@prisma/client'

const AGORA = new Date('2026-07-10T12:00:00Z')
const DIA_MS = 86_400_000
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA_MS)
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA_MS)

// Fase 2 do widget multi-tenant — decisão pura de acesso público (sem banco),
// usada por resolverTenantPublico em cima de um tenant já buscado por
// public_key. Ver widget.ts.
describe('tenantPublicoPermiteAcesso — decisão de acesso público (sem banco)', () => {
  test('tenant nulo (public_key não encontrada) nunca tem acesso', () => {
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
  // Fase 7 — licença vencida DENTRO da tolerância (TOLERANCIA_INADIMPLENCIA_DIAS
  // = 5 dias, ver describe dedicado abaixo) não bloqueia mais escrita; só
  // além da tolerância continua bloqueando como antes.
  test('ACTIVE com licença vencida DENTRO da tolerância (1 dia) não bloqueia', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA), null)
  })
  test('ACTIVE com licença vencida ALÉM da tolerância (6 dias) bloqueia com mensagem de licença', () => {
    const motivo = motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) }, AGORA)
    assert.match(motivo ?? '', /licença vencida/i)
  })
  test('EXPIRED bloqueia (mesmo sem SUSPENDED/CANCELED)', () => {
    assert.notEqual(motivoBloqueioEscrita({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), null)
  })
  // Comportamento atual documentado: EXPIRED com licenca_fim preenchido
  // vira 'licenca_vencida' (mesmo que ACTIVE vencida, ver
  // obterSituacaoComercialTenant) e por isso também ganha a tolerância de
  // 5 dias — não é um caso especial, é consequência direta de
  // situacaoAdimplenciaTenant decidir pela SITUAÇÃO, nunca pelo status bruto.
  test('EXPIRED com licenca_fim vencido DENTRO da tolerância também não bloqueia (mesma regra de ACTIVE)', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'EXPIRED', trial_fim: null, licenca_fim: passado(1) }, AGORA), null)
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

// Fase 8B (fundação) — capacidade efetiva durante downgrade agendado: o
// menor dos dois limites vence, null (sem limite) nunca "vence" por engano
// sobre um número real (Math.min(50, null) trataria null como 0, por isso
// o tratamento explícito).
describe('menorLimite', () => {
  test('os dois números => o menor vence', () => {
    assert.equal(menorLimite(50, 10), 10)
    assert.equal(menorLimite(10, 50), 10)
  })
  test('a null (sem limite) => vale o de b', () => {
    assert.equal(menorLimite(null, 10), 10)
  })
  test('b null (sem limite) => vale o de a', () => {
    assert.equal(menorLimite(50, null), 50)
  })
  test('os dois null => sem limite (null)', () => {
    assert.equal(menorLimite(null, null), null)
  })
  test('undefined tratado igual a null', () => {
    assert.equal(menorLimite(undefined, 10), 10)
    assert.equal(menorLimite(50, undefined), 50)
  })
})

describe('planoEfetivoParaLimite — combina plano atual + downgrade AGENDAMENTO COMPLETO (correção pós-revisão)', () => {
  const growth: Plano = {
    limite_campanhas_ativas: 50, limite_tours_ativos: 20, limite_jornadas_ativas: 20, limite_usuarios_admin: 10,
    permite_tours: true, permite_jornadas: true,
  } as Plano
  const starter: Plano = {
    limite_campanhas_ativas: 10, limite_tours_ativos: 5, limite_jornadas_ativas: 5, limite_usuarios_admin: 2,
    permite_tours: false, permite_jornadas: false,
  } as Plano

  const SEM_DOWNGRADE = { plano_downgrade_id: null, downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null }
  const AGENDAMENTO_COMPLETO = {
    plano_downgrade_id: 'plano-starter', downgrade_efetivar_em: new Date('2026-09-12'),
    downgrade_valor_origem: 349, downgrade_valor_destino: 149,
  }
  // Claim TÉCNICO incompleto (ver classificarClaimDowngrade/downgradeAgendamentoCompleto
  // em asaasClient.ts): o Asaas já pode ter sido reprecificado durante o
  // POST, mas a persistência local ainda não confirmou — downgrade_valor_origem
  // continua null até esse momento.
  const CLAIM_INCOMPLETO = { ...AGENDAMENTO_COMPLETO, downgrade_valor_origem: null }

  test('1. sem downgrade agendado => devolve o plano atual sem alterar nada', () => {
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: null, ...SEM_DOWNGRADE })
    assert.equal(efetivo, growth)
  })

  test('sem plano atual (tenant ainda sem plano) => null, nunca inventa um plano', () => {
    assert.equal(planoEfetivoParaLimite({ plano: null, plano_downgrade: starter, ...AGENDAMENTO_COMPLETO }), null)
  })

  // Caso obrigatório da tarefa: Growth 50, Starter claimado (limite 10),
  // downgrade_valor_origem ainda null, uso hipotético 20 — o limite efetivo
  // TEM que continuar 50 (nunca 10), já que o agendamento não está completo.
  test('2. claim incompleto (downgrade_valor_origem null) => mantém INTEGRALMENTE os limites do plano atual, nunca antecipa', () => {
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: starter, ...CLAIM_INCOMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 50)
    assert.equal(efetivo?.limite_tours_ativos, 20)
    assert.equal(efetivo?.limite_jornadas_ativas, 20)
    assert.equal(efetivo?.limite_usuarios_admin, 10)
  })

  test('3. downgrade AGENDAMENTO COMPLETO: os 4 limites numéricos usam o menor (Growth 50/Starter 10 => 10, exemplo da tarefa)', () => {
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: starter, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 10)
    assert.equal(efetivo?.limite_tours_ativos, 5)
    assert.equal(efetivo?.limite_jornadas_ativas, 5)
    assert.equal(efetivo?.limite_usuarios_admin, 2)
  })

  test('4. destino com limite MAIOR que o atual => mantém o limite atual (menor), nunca "libera" capacidade', () => {
    const growthMenor = { ...growth, limite_campanhas_ativas: 5 } as Plano
    const starterMaior = { ...starter, limite_campanhas_ativas: 100 } as Plano
    const efetivo = planoEfetivoParaLimite({ plano: growthMenor, plano_downgrade: starterMaior, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 5)
  })

  test('5. atual sem limite (null) + destino limitado => usa o limite do destino', () => {
    const growthIlimitado = { ...growth, limite_campanhas_ativas: null } as Plano
    const efetivo = planoEfetivoParaLimite({ plano: growthIlimitado, plano_downgrade: starter, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 10)
  })

  test('6. atual limitado + destino sem limite (null) => usa o limite do atual', () => {
    const starterIlimitado = { ...starter, limite_campanhas_ativas: null } as Plano
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: starterIlimitado, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 50)
  })

  // 7/8 — a comparação exata que bloqueia criação/ativação (`total >=
  // plano.limite_...`) já existe, INALTERADA, dentro de
  // checarLimiteCampanhasAtivas/ToursAtivos/JornadasAtivas/UsuariosAdmin —
  // esta rodada só muda QUAL plano chega até ela (ver os call sites em
  // campanhas.ts/tours.ts/jornadas.ts/adminTenants.ts). Confirmar aqui que
  // o limite efetivo é exatamente 10 (não 9, não 11) garante que "uso=10"
  // vai bloquear e "uso=8" vai permitir quando checarLimite* rodar de
  // verdade — a comparação em si (>=) e "nunca excluir/desativar
  // existente" seguem validados manualmente contra servidor local (mesmo
  // limite de sempre pra funções que tocam Prisma, nunca mockado aqui).
  test('7/8. limite efetivo é exatamente o valor do destino (10) — base da checagem >= que bloqueia uso=10/12 sem tocar registros existentes', () => {
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: starter, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.limite_campanhas_ativas, 10)
  })

  test('9. gates booleanos NUNCA antecipam o plano futuro — continuam do plano ATUAL, mesmo com agendamento COMPLETO', () => {
    const efetivo = planoEfetivoParaLimite({ plano: growth, plano_downgrade: starter, ...AGENDAMENTO_COMPLETO })
    assert.equal(efetivo?.permite_tours, true)
    assert.equal(efetivo?.permite_jornadas, true)
  })
})

// Fase 8B (fundação) — "cabe no plano destino?" pro preview de downgrade.
// `usoAtual > limiteDestino` bloqueia; `usoAtual === limiteDestino` cabe
// (diferente dos checarLimite*Ativas, que usam `>=` porque respondem "posso
// criar mais UM?", pergunta diferente).
describe('avaliarEncaixeLimitesDowngrade', () => {
  const planoDestino = {
    limite_campanhas_ativas: 10, limite_tours_ativos: 5, limite_jornadas_ativas: 5, limite_usuarios_admin: 2,
  } as Plano
  const usoBase = { campanhas: 0, tours: 0, jornadas: 0, admins: 0 }

  test('todos os recursos abaixo do limite => nenhuma incompatibilidade', () => {
    const uso = { campanhas: 9, tours: 4, jornadas: 4, admins: 1 }
    assert.deepEqual(avaliarEncaixeLimitesDowngrade(uso, planoDestino), [])
  })

  test('todos os recursos EXATAMENTE no limite => cabe, nenhuma incompatibilidade (== não é >)', () => {
    const uso = { campanhas: 10, tours: 5, jornadas: 5, admins: 2 }
    assert.deepEqual(avaliarEncaixeLimitesDowngrade(uso, planoDestino), [])
  })

  test('campanhas acima do limite => reportada com excedente correto', () => {
    const uso = { ...usoBase, campanhas: 12 }
    const resultado = avaliarEncaixeLimitesDowngrade(uso, planoDestino)
    assert.deepEqual(resultado, [{ recurso: 'campanhas', usoAtual: 12, limiteDestino: 10, excedente: 2 }])
  })

  test('tours acima do limite => reportado', () => {
    const uso = { ...usoBase, tours: 8 }
    const resultado = avaliarEncaixeLimitesDowngrade(uso, planoDestino)
    assert.deepEqual(resultado, [{ recurso: 'tours', usoAtual: 8, limiteDestino: 5, excedente: 3 }])
  })

  test('jornadas acima do limite => reportada', () => {
    const uso = { ...usoBase, jornadas: 6 }
    const resultado = avaliarEncaixeLimitesDowngrade(uso, planoDestino)
    assert.deepEqual(resultado, [{ recurso: 'jornadas', usoAtual: 6, limiteDestino: 5, excedente: 1 }])
  })

  test('admins acima do limite => reportado', () => {
    const uso = { ...usoBase, admins: 5 }
    const resultado = avaliarEncaixeLimitesDowngrade(uso, planoDestino)
    assert.deepEqual(resultado, [{ recurso: 'admins', usoAtual: 5, limiteDestino: 2, excedente: 3 }])
  })

  test('vários recursos incompatíveis ao mesmo tempo => todos reportados', () => {
    const uso = { campanhas: 12, tours: 4, jornadas: 6, admins: 1 }
    const resultado = avaliarEncaixeLimitesDowngrade(uso, planoDestino)
    assert.equal(resultado.length, 2)
    assert.deepEqual(resultado.map((r) => r.recurso).sort(), ['campanhas', 'jornadas'])
  })

  test('limiteDestino null (plano destino ilimitado nesse recurso) => nunca bloqueia, qualquer que seja o uso', () => {
    const planoIlimitado = { ...planoDestino, limite_campanhas_ativas: null } as Plano
    const uso = { ...usoBase, campanhas: 9999 }
    assert.deepEqual(avaliarEncaixeLimitesDowngrade(uso, planoIlimitado), [])
  })

  test('exemplo exato da tarefa: Growth 50 -> Starter 10, uso atual 8 => cabe (excedente só a partir de 11)', () => {
    const uso = { ...usoBase, campanhas: 8 }
    assert.deepEqual(avaliarEncaixeLimitesDowngrade(uso, planoDestino), [])
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

// Fase 7 — tolerância de inadimplência (assinatura paga vencida). Reaproveita
// licenca_fim (já era a data de vencimento da cobrança em vigor, ver
// calcularAtualizacaoTenant em services/asaasClient.ts) — nenhum campo novo.
describe('situacaoAdimplenciaTenant — só se aplica a licença paga vencida (ACTIVE)', () => {
  test('ACTIVE em dia (licenca_fim futuro) => em_dia', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), 'em_dia')
  })
  test('vencimento hoje (licenca_fim algumas horas no passado) => tolerancia', () => {
    const licencaFim = new Date(AGORA.getTime() - 3 * 60 * 60 * 1000) // 3h atrás
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: licencaFim }, AGORA), 'tolerancia')
  })
  for (const dias of [1, 2, 3, 4, 5]) {
    test(`vencida há ${dias} dia(s) => tolerancia (ainda permite)`, () => {
      assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(dias) }, AGORA), 'tolerancia')
    })
  }
  test(`vencida há exatamente ${TOLERANCIA_INADIMPLENCIA_DIAS} dias (limite) => tolerancia (ainda permite, "<=" inclusive)`, () => {
    assert.equal(
      situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(TOLERANCIA_INADIMPLENCIA_DIAS) }, AGORA),
      'tolerancia'
    )
  })
  // 1ms além de licenca_fim + TOLERANCIA_INADIMPLENCIA_DIAS — mesmo padrão
  // de "trial_fim 1ms no passado já venceu" (diasRestantesTrial acima),
  // agora pra borda da tolerância: com `agora` fixo, não depende do
  // relógio real.
  test('1ms após o limite exato (licenca_fim + 5 dias) => tolerancia_expirada', () => {
    const licencaFim = new Date(passado(TOLERANCIA_INADIMPLENCIA_DIAS).getTime() - 1)
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: licencaFim }, AGORA), 'tolerancia_expirada')
  })
  test('vencida há 6 dias (além do limite de 5) => tolerancia_expirada (bloqueia)', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) }, AGORA), 'tolerancia_expirada')
  })
  test('vencida há 30 dias => tolerancia_expirada', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(30) }, AGORA), 'tolerancia_expirada')
  })
  test('pagamento confirmado libera automaticamente — licenca_fim avançado pro futuro volta a em_dia, mesmo tendo estado tolerancia_expirada momentos antes', () => {
    // Simula o efeito do webhook (calcularAtualizacaoTenant): licenca_fim
    // passa a apontar pro próximo vencimento, no futuro.
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(30) }, AGORA), 'tolerancia_expirada')
    assert.equal(situacaoAdimplenciaTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), 'em_dia')
  })
  test('TRIAL vencido não é confundido com inadimplência paga => em_dia (fora do domínio desta função)', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA), 'em_dia')
  })
  test('SUSPENDED nunca entra em tolerância, mesmo com licenca_fim vencido => em_dia (fora do domínio, bloqueio já é outro)', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'SUSPENDED', trial_fim: null, licenca_fim: passado(1) }, AGORA), 'em_dia')
  })
  test('CANCELED nunca entra em tolerância, mesmo com licenca_fim vencido => em_dia (fora do domínio, bloqueio já é outro)', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'CANCELED', trial_fim: null, licenca_fim: passado(1) }, AGORA), 'em_dia')
  })
  // Comportamento atual documentado explicitamente (não uma mudança desta
  // revisão): obterSituacaoComercialTenant já trata EXPIRED+licenca_fim
  // igual a ACTIVE vencida (ambos viram 'licenca_vencida', ver describe
  // "obterSituacaoComercialTenant — EXPIRED, SUSPENDED, CANCELED" acima) —
  // situacaoAdimplenciaTenant herda isso por construção (decide a partir da
  // SITUAÇÃO, nunca do status bruto), então EXPIRED com licenca_fim vencido
  // recebe a MESMA tolerância de 5 dias que ACTIVE. Nenhuma indicação em
  // contrário na tarefa — comportamento intencional, agora coberto.
  test('EXPIRED com licenca_fim vencido recebe a MESMA tolerância de ACTIVE (dentro dos 5 dias) => tolerancia', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'EXPIRED', trial_fim: null, licenca_fim: passado(1) }, AGORA), 'tolerancia')
  })
  test('EXPIRED com licenca_fim vencido além dos 5 dias => tolerancia_expirada, igual a ACTIVE', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'EXPIRED', trial_fim: null, licenca_fim: passado(6) }, AGORA), 'tolerancia_expirada')
  })
  test('EXPIRED sem licenca_fim (nunca teve licença paga) => em_dia — vira trial_vencido, não licenca_vencida, fora do domínio desta função', () => {
    assert.equal(situacaoAdimplenciaTenant({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), 'em_dia')
  })
})

describe('diasRestantesTolerancia — dias restantes de tolerância, pra exibição', () => {
  test('ACTIVE em dia => null (não aplicável)', () => {
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), null)
  })
  test('não é licença paga vencida (TRIAL) => null', () => {
    assert.equal(diasRestantesTolerancia({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA), null)
  })
  test('vencida agora mesmo (licenca_fim === agora - 1ms) => 5 dias restantes (tolerância cheia)', () => {
    const licencaFim = new Date(AGORA.getTime() - 1)
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: licencaFim }, AGORA), TOLERANCIA_INADIMPLENCIA_DIAS)
  })
  test('vencida há 1 dia => 4 dias restantes de tolerância', () => {
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA), 4)
  })
  test('vencida há 2 dias => 3 dias restantes de tolerância', () => {
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(2) }, AGORA), 3)
  })
  // Faltam pouco menos de 24h pra tolerância acabar (mesmo padrão de "23h59min
  // no futuro => ainda 1 dia restante" em diasRestantesTrial acima) — ceil
  // arredonda qualquer fração de dia restante pra cima, nunca mostra "0 dias"
  // enquanto ainda houver tempo de verdade.
  test('faltam pouco menos de 24h pro fim da tolerância => ainda 1 dia restante (ceil, não floor)', () => {
    const licencaFim = new Date(passado(4).getTime() - 1) // 4 dias e ~1ms no passado
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: licencaFim }, AGORA), 1)
  })
  test(`vencida há exatamente ${TOLERANCIA_INADIMPLENCIA_DIAS} dias => 0 dias restantes (mas ainda dentro da tolerância, ver situacaoAdimplenciaTenant)`, () => {
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(TOLERANCIA_INADIMPLENCIA_DIAS) }, AGORA), 0)
  })
  test('tolerância já expirada (6 dias vencida) => 0 dias restantes, nunca negativo', () => {
    assert.equal(diasRestantesTolerancia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) }, AGORA), 0)
  })
})

describe('motivoBloqueioOperacionalInadimplencia — só bloqueia depois da tolerância expirar', () => {
  test('ACTIVE em dia não bloqueia', () => {
    assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), null)
  })
  test('vencida dentro da tolerância (1 a 5 dias) não bloqueia', () => {
    for (const dias of [1, 2, 3, 4, 5]) {
      assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(dias) }, AGORA), null)
    }
  })
  test('vencida além da tolerância (6 dias) bloqueia com mensagem de "pagamento pendente"', () => {
    const motivo = motivoBloqueioOperacionalInadimplencia({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) }, AGORA)
    assert.match(motivo ?? '', /pagamento pendente/i)
  })
  test('TRIAL vencido nunca usa este bloqueio (continua sob motivoBloqueioOperacionalTrial)', () => {
    assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'TRIAL', trial_fim: passado(30), licenca_fim: null }, AGORA), null)
  })
  test('SUSPENDED preservado — nunca usa este bloqueio', () => {
    assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'SUSPENDED', trial_fim: null, licenca_fim: passado(30) }, AGORA), null)
  })
  test('CANCELED preservado — nunca usa este bloqueio', () => {
    assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'CANCELED', trial_fim: null, licenca_fim: passado(30) }, AGORA), null)
  })
  test('EXPIRED com licenca_fim vencido segue a mesma regra de ACTIVE (comportamento atual documentado)', () => {
    assert.equal(motivoBloqueioOperacionalInadimplencia({ status: 'EXPIRED', trial_fim: null, licenca_fim: passado(1) }, AGORA), null)
    assert.match(motivoBloqueioOperacionalInadimplencia({ status: 'EXPIRED', trial_fim: null, licenca_fim: passado(6) }, AGORA) ?? '', /pagamento pendente/i)
  })
})
