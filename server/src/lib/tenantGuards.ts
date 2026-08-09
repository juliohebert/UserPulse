import { Plano, Tenant } from '@prisma/client'
import prisma from './prisma'

// ─── Fase 2 do widget multi-tenant: resolução de tenant por public_key ──────
// Usado só pelas rotas públicas do widget (widget.ts), nunca pelo admin
// (que já resolve tenant via sessão em requireAdminAuth.ts).

export type ResolucaoTenantPublico =
  | { ok: true; tenantId: string; usouFallback: boolean }
  | { ok: false }

// Slug fixo do tenant Quark (mesmo usado na migration da fundação SaaS) —
// única exceção onde um slug aparece hardcoded fora de uma migration:
// compatibilidade temporária pra embeds que ainda não enviam public_key (ver
// resolverTenantPublico). Remover quando todo embed em produção enviar
// public_key — não deve virar um padrão pra novos tenants.
const TENANT_FALLBACK_SLUG = 'quark'

// Decisão pura (sem banco) de se um tenant já resolvido pode atender uma
// requisição pública do widget — extraída à parte só pra poder ser testada
// direto (mesmo padrão de motivoBloqueioEscrita abaixo), sem precisar de
// Prisma/banco no teste. EXPIRED não bloqueia leitura/tracking pública (só
// criação/ativação no admin, ver motivoBloqueioAtivacao) — só SUSPENDED/
// CANCELED encerram o widget de verdade, mesmo raciocínio de
// motivoBloqueioEscrita. tenant nulo (public_key/slug não encontrado) nunca
// tem acesso, obviamente.
export function tenantPublicoPermiteAcesso(tenant: Pick<Tenant, 'status'> | null): boolean {
  if (!tenant) return false
  return tenant.status !== 'SUSPENDED' && tenant.status !== 'CANCELED'
}

// Recebe a public_key enviada pelo widget (query string ou body, sempre uma
// string opcional/não confiável — daí o `unknown`) e resolve pra um tenant_id
// utilizável nas queries públicas. Nunca lança, nunca diferencia pro caller
// POR QUE falhou (public_key inexistente vs. tenant suspenso/cancelado) —
// quem chama sempre trata `ok:false` como "não encontrado" (404 genérico),
// pra nunca revelar se uma public_key existe mas está bloqueada.
//
// Fallback temporário: public_key ausente cai no tenant Quark (nunca em
// qualquer outro) — mantém embeds já instalados funcionando enquanto a
// public_key ainda não é obrigatória. `usouFallback` deixa o caller decidir
// se quer logar/avisar (ver debug do widget.js), nunca é usado pra bloquear.
export async function resolverTenantPublico(publicKeyBruta: unknown): Promise<ResolucaoTenantPublico> {
  const publicKey = typeof publicKeyBruta === 'string' ? publicKeyBruta.trim() : ''

  const tenant = publicKey
    ? await prisma.tenant.findUnique({ where: { public_key: publicKey } })
    : await prisma.tenant.findUnique({ where: { slug: TENANT_FALLBACK_SLUG } })

  if (!tenantPublicoPermiteAcesso(tenant)) return { ok: false }

  return { ok: true, tenantId: tenant!.id, usouFallback: !publicKey }
}

// Helpers de escopo/limite de tenant, usados pelos controllers admin
// (campanhas/tours/jornadas/catalogoTelas/aparenciaWidget) antes de qualquer
// escrita.

export type TenantComPlano = Tenant & { plano: Plano | null }

// Campos que toda decisão comercial (bloqueio de escrita, banner do painel)
// precisa — subconjunto de Tenant, mesmo padrão de Pick<> já usado no resto
// deste arquivo. `trial_fim`/`licenca_fim` entram aqui pela primeira vez:
// até agora só `status` era considerado, então um TRIAL com `trial_fim` no
// passado (ou ACTIVE com `licenca_fim` no passado) nunca era bloqueado — só
// era bloqueado depois de alguém trocar o status manualmente pra EXPIRED no
// painel. Ver obterSituacaoComercialTenant.
type TenantParaSituacao = Pick<Tenant, 'status' | 'trial_fim' | 'licenca_fim'>

// Mesmos 6 valores já usados por classificarSituacao em
// web/src/pages/admin/Tenants.tsx (lá é só pra filtrar/exibir a lista de
// clientes pro super admin; aqui é a versão que efetivamente decide
// bloqueio de escrita e o banner exibido pro próprio cliente logado).
export type SituacaoComercialTenant =
  | 'trial_ativo'
  | 'trial_vencido'
  | 'licenca_ativa'
  | 'licenca_vencida'
  | 'suspenso'
  | 'cancelado'

// Decisão pura (sem banco), testável isoladamente — nunca muda `status` no
// banco por conta própria (a tarefa pediu explicitamente pra calcular em
// runtime, não migrar dados pra EXPIRED automaticamente). `agora` é
// injetável só pros testes (mesmo padrão de avaliarReexibicaoPorDias em
// controllers/widget.ts) — em produção sempre usa o Date atual via default.
//
// EXPIRED (status setado manualmente pelo super admin, ou por uma futura
// rotina) sempre conta como vencido, independente das datas — dobra pra
// 'licenca_vencida' se o tenant já teve licença paga (licenca_fim
// preenchido) ou 'trial_vencido' caso contrário, mesmo critério de
// classificarSituacao no front.
export function obterSituacaoComercialTenant(
  tenant: TenantParaSituacao,
  agora: Date = new Date()
): SituacaoComercialTenant {
  if (tenant.status === 'SUSPENDED') return 'suspenso'
  if (tenant.status === 'CANCELED') return 'cancelado'

  const venceu = (data: Date | null) => data != null && data.getTime() < agora.getTime()

  if (tenant.status === 'TRIAL') return venceu(tenant.trial_fim) ? 'trial_vencido' : 'trial_ativo'
  if (tenant.status === 'ACTIVE') return venceu(tenant.licenca_fim) ? 'licenca_vencida' : 'licenca_ativa'
  // EXPIRED
  return tenant.licenca_fim ? 'licenca_vencida' : 'trial_vencido'
}

const MOTIVO_POR_SITUACAO: Record<Exclude<SituacaoComercialTenant, 'trial_ativo' | 'licenca_ativa'>, string> = {
  trial_vencido: 'Período de teste grátis vencido. Entre em contato para ativar sua licença.',
  licenca_vencida: 'Licença vencida. Entre em contato para regularizar o acesso.',
  suspenso: 'Conta suspensa. Entre em contato com o suporte para reativar.',
  cancelado: 'Conta cancelada. Entre em contato com o suporte para reativar.',
}

// Bloqueia QUALQUER escrita (create/update/delete) — usado por todos os
// controllers admin de dados operacionais. Cobre os 4 estados "vencidos":
// trial expirado, licença paga expirada, suspenso e cancelado — todos
// tratados como bloqueio total de escrita, leitura continua liberada (ver
// cada controller: só as rotas de escrita chamam isto, GET nunca chama).
export function motivoBloqueioEscrita(tenant: TenantParaSituacao, agora: Date = new Date()): string | null {
  const situacao = obterSituacaoComercialTenant(tenant, agora)
  if (situacao === 'trial_ativo' || situacao === 'licenca_ativa') return null
  return MOTIVO_POR_SITUACAO[situacao]
}

// Antes bloqueava só EXPIRED aqui, à parte (edição/inativação de conteúdo
// já existente continuava liberada nesse status, só criação/ativação era
// barrada) — agora motivoBloqueioEscrita já cobre TRIAL/ACTIVE vencidos e
// EXPIRED de forma unificada (todo mundo vencido bloqueia escrita inteira,
// não só ativação), então esta função vira um alias explícito. Mantida
// (em vez de removida) pra não mexer nos ~10 call sites que já chamam
// motivoBloqueioAtivacao logo depois de motivoBloqueioEscrita dentro do
// bloco `if (ativoBool)` (ver controllers/campanhas.ts, tours.ts,
// jornadas.ts) — essa chamada nunca mais encontra nada que a de cima já não
// tenha barrado antes, mas trocar isso é refactor fora do pedido aqui.
export function motivoBloqueioAtivacao(tenant: TenantParaSituacao, agora: Date = new Date()): string | null {
  return motivoBloqueioEscrita(tenant, agora)
}

// Decisão pura da checagem de limite "X ativos simultâneos" (campanhas,
// tours, jornadas) — separada da consulta ao banco (cada checarLimite*
// abaixo só busca o `total` e delega a decisão pra cá) só pra poder ser
// testada sem Prisma, mesmo padrão de motivoBloqueioEscrita/
// obterSituacaoComercialTenant acima. `limite` nulo/undefined = sem limite
// (mesmo padrão de "limite nulo = ilimitado" já usado em todos os campos
// limite_* do Plano) — permite operar num tenant que ainda não tem plano
// definido (ex.: recém-criado, aguardando contratação) ou cujo plano não
// restringe aquele recurso.
function excedeuLimite(limite: number | null | undefined, total: number): boolean {
  return Boolean(limite) && total >= (limite as number)
}

export function motivoLimiteAtivosAtingido(limite: number | null | undefined, total: number, rotulo: string): string | null {
  if (!excedeuLimite(limite, total)) return null
  return `Limite de ${limite} ${rotulo} do plano atingido.`
}

// Fase 6D — mensagem do limite de trial, quando o TOTAL cadastrado (ativo ou
// não, ver checarLimite*Ativas abaixo) já bateu no limite do plano — texto
// próprio (não reaproveita motivoLimiteAtivosAtingido, que fala de "ativas")
// pedido explicitamente pela tarefa. `entidadeSingular` já resolve
// singular/plural aqui dentro (limite=1 → singular), pra não duplicar essa
// regrinha nos 3 call sites abaixo.
export function motivoLimiteTrialAtingido(limite: number | null | undefined, total: number, entidadeSingular: string): string | null {
  if (!excedeuLimite(limite, total)) return null
  const entidade = limite === 1 ? entidadeSingular : `${entidadeSingular}s`
  return `Limite do teste grátis atingido. Seu plano permite até ${limite} ${entidade} durante o período gratuito.`
}

// `excluirId` desconsidera o próprio registro da contagem — usado só ao
// REATIVAR um item já existente (ver controllers/campanhas.ts, atualizar):
// sem isso, o item sendo reativado contaria contra si mesmo no modo trial
// (que conta TOTAL, não só ativos) e bloquearia uma reativação que não cria
// linha nenhuma. Nunca usado na criação (o registro ainda não existe).
//
// Fase 6D — em plano de trial (eh_plano_trial=true), o limite passa a valer
// pro TOTAL cadastrado (ativo ou inativo), não só ativos — sem isso, dava
// pra contornar o limite exibido ("1 tour", "1 jornada"...) criando vários
// itens inativos e alternando qual fica ativo. Planos pagos continuam
// exatamente como antes (só conta ativos). Ver deveChecarLimiteCadastro
// abaixo pra quando essa checagem entra em jogo na criação.
export async function checarLimiteCampanhasAtivas(tenantId: string, plano: Plano | null, excluirId?: string): Promise<string | null> {
  if (!plano?.limite_campanhas_ativas) return null
  const excluir = excluirId ? { id: { not: excluirId } } : {}
  if (plano.eh_plano_trial) {
    const total = await prisma.campanha.count({ where: { tenant_id: tenantId, ...excluir } })
    return motivoLimiteTrialAtingido(plano.limite_campanhas_ativas, total, 'campanha')
  }
  const total = await prisma.campanha.count({ where: { tenant_id: tenantId, ativo: true, ...excluir } })
  return motivoLimiteAtivosAtingido(plano.limite_campanhas_ativas, total, 'campanha(s) ativa(s)')
}

export async function checarLimiteToursAtivos(tenantId: string, plano: Plano | null, excluirId?: string): Promise<string | null> {
  if (!plano?.limite_tours_ativos) return null
  const excluir = excluirId ? { id: { not: excluirId } } : {}
  if (plano.eh_plano_trial) {
    const total = await prisma.tourGuiado.count({ where: { tenant_id: tenantId, ...excluir } })
    return motivoLimiteTrialAtingido(plano.limite_tours_ativos, total, 'tour')
  }
  const total = await prisma.tourGuiado.count({ where: { tenant_id: tenantId, ativo: true, ...excluir } })
  return motivoLimiteAtivosAtingido(plano.limite_tours_ativos, total, 'tour(s) ativo(s)')
}

// Fase 6A (fundação do trial) — mesmo padrão de checarLimiteCampanhasAtivas/
// checarLimiteToursAtivos acima, agora pra jornadas (antes só tinham o gate
// booleano permite_jornadas, sem nenhuma contagem de ativas simultâneas).
export async function checarLimiteJornadasAtivas(tenantId: string, plano: Plano | null, excluirId?: string): Promise<string | null> {
  if (!plano?.limite_jornadas_ativas) return null
  const excluir = excluirId ? { id: { not: excluirId } } : {}
  if (plano.eh_plano_trial) {
    const total = await prisma.jornada.count({ where: { tenant_id: tenantId, ...excluir } })
    return motivoLimiteTrialAtingido(plano.limite_jornadas_ativas, total, 'jornada')
  }
  const total = await prisma.jornada.count({ where: { tenant_id: tenantId, ativo: true, ...excluir } })
  return motivoLimiteAtivosAtingido(plano.limite_jornadas_ativas, total, 'jornada(s) ativa(s)')
}

// Fase 6D — decide SE a checagem de limite precisa rodar numa criação: em
// plano de trial, sempre (o limite é sobre o TOTAL cadastrado, então até uma
// criação com ativo:false conta); em plano pago (ou sem plano), só quando o
// novo registro nasce ativo (comportamento já existente, inalterado — uma
// campanha/tour/jornada inativa nunca esbarrava no limite de ativos). Usada
// tanto nos criar() quanto em duplicar()/importar() (que sempre criam
// ativo:false — nesses, `ativo` é sempre `false` na chamada).
export function deveChecarLimiteCadastro(ativo: boolean, plano: Plano | null): boolean {
  return ativo || plano?.eh_plano_trial === true
}

// Usado só na criação de um novo acesso (ver criarAcesso em adminTenants.ts)
// — reativar um acesso já existente ou editar nome/role não passa por aqui,
// só a criação de um AdminUser novo consome uma "vaga" do plano.
export async function checarLimiteUsuariosAdmin(tenantId: string, plano: Plano | null): Promise<string | null> {
  if (!plano?.limite_usuarios_admin) return null
  const total = await prisma.adminUser.count({ where: { tenant_id: tenantId, ativo: true } })
  if (total >= plano.limite_usuarios_admin) {
    return `Limite de ${plano.limite_usuarios_admin} usuário(s) admin do plano atingido.`
  }
  return null
}

// Sem plano vinculado = permite (mesmo raciocínio de limite nulo acima) —
// só bloqueia quando existe um plano explícito que desliga o recurso.
export function motivoRecursoNaoPermitido(plano: Plano | null, campo: 'permite_tours' | 'permite_jornadas'): string | null {
  if (!plano) return null
  if (!plano[campo]) {
    const nome = campo === 'permite_tours' ? 'Tours guiados' : 'Jornadas'
    return `${nome} não estão disponíveis no plano atual.`
  }
  return null
}

// ─── Fase 6A — fundação do trial (cadastro público ainda não existe) ────────
// A experiência de trial é única: deve existir exatamente 1 Plano com
// eh_plano_trial=true em uso normal — 0 (ninguém configurado) ou mais de 1
// (ambíguo, qual usar?) nunca são resolvidos arbitrariamente (ex.: "pega o
// primeiro"), porque isso esconderia um erro de configuração atrás de um
// comportamento que parece funcionar. Decisão pura (sem banco) — o caller
// (futuro endpoint de cadastro público) busca os planos com
// `prisma.plano.findMany({ where: { eh_plano_trial: true } })` e passa o
// resultado pra cá.
export type ResolucaoPlanoTrial =
  | { ok: true; plano: Pick<Plano, 'id' | 'trial_dias'> }
  | { ok: false; motivo: string }

export function resolverPlanoTrial(planosMarcados: Pick<Plano, 'id' | 'trial_dias'>[]): ResolucaoPlanoTrial {
  if (planosMarcados.length === 0) {
    return { ok: false, motivo: 'Nenhum plano está marcado como plano de trial (eh_plano_trial=true) — configure um antes de liberar o cadastro público.' }
  }
  if (planosMarcados.length > 1) {
    return { ok: false, motivo: `Mais de um plano está marcado como plano de trial (${planosMarcados.length}) — configuração ambígua, corrija antes de liberar o cadastro público.` }
  }
  return { ok: true, plano: planosMarcados[0]! }
}

// Duração efetiva do trial em dias — plano.trial_dias tem prioridade; null/
// undefined cai no default de 14 (mesmo valor já usado por seedAdmin.ts para
// o bootstrap manual). Decisão pura separada de resolverPlanoTrial porque o
// default só faz sentido depois que já se sabe qual plano é o de trial.
// trial_dias <=0 é configuração inválida (nunca um trial de duração zero ou
// negativa) — mesmo padrão de retorno de resolverPlanoTrial acima
// ({ok:false, motivo}), não lança exceção. Sem teto máximo de propósito
// (não pedido, não inventar limite arbitrário).
export const TRIAL_DIAS_PADRAO = 14

export type ResolucaoDuracaoTrialDias =
  | { ok: true; dias: number }
  | { ok: false; motivo: string }

export function resolverDuracaoTrialDias(planoTrialDias: number | null | undefined): ResolucaoDuracaoTrialDias {
  if (planoTrialDias == null) return { ok: true, dias: TRIAL_DIAS_PADRAO }
  if (planoTrialDias <= 0) {
    return { ok: false, motivo: `trial_dias inválido (${planoTrialDias}) — deve ser um número de dias positivo.` }
  }
  return { ok: true, dias: planoTrialDias }
}

// ─── Fase 6C — expiração dinâmica do trial + bloqueio operacional ───────────
// Nada disto é persistido (sem contador diário no banco, sem cron) — sempre
// recalculado em runtime a partir de trial_fim, mesmo espírito de
// obterSituacaoComercialTenant acima.

const DIA_MS = 24 * 60 * 60 * 1000

// Dias restantes de trial, arredondado pra cima: qualquer fração de dia
// (inclusive menos de 24h) conta como 1 dia inteiro. Nunca negativo — uma
// vez vencido (ms <= 0), sempre 0. null quando o tenant não tem trial_fim
// definido (trial sem prazo, nunca vence sozinho — mesmo caso já tratado em
// obterSituacaoComercialTenant, que devolve trial_ativo nesta situação).
// Não recalcula a fronteira de vencimento em si (isso continua sendo
// exclusivamente obterSituacaoComercialTenant, "< estrito" — ver teste
// "trial_fim exatamente agora ainda não venceu"); esta função só traduz o
// tempo restante em dias pra exibição, e no instante exato do vencimento
// (ms=0) devolve 0 mesmo com a situação ainda sendo trial_ativo por 1ms —
// diferença sem efeito prático (front nunca observa esse instante exato).
export function diasRestantesTrial(trialFim: Date | null, agora: Date = new Date()): number | null {
  if (trialFim == null) return null
  const ms = trialFim.getTime() - agora.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / DIA_MS)
}

// Mensagem estável usada pelo 403 de requireAcessoOperacional (ver
// middleware/requireAcessoOperacional.ts) — null quando o tenant pode
// operar normalmente. Só bloqueia por TRIAL vencido; licença paga vencida/
// suspenso/cancelado continuam exclusivamente sob motivoBloqueioEscrita
// (bloqueio só de escrita, não de uso operacional inteiro) — regra
// explícita da tarefa: não alterar o comportamento já existente desses três
// estados, só endurecer o de trial vencido (que hoje só bloqueava escrita,
// igual aos outros três).
export function motivoBloqueioOperacionalTrial(tenant: TenantParaSituacao, agora: Date = new Date()): string | null {
  if (obterSituacaoComercialTenant(tenant, agora) !== 'trial_vencido') return null
  return 'Seu teste grátis terminou. Escolha um plano para continuar usando o UserPulse.'
}
