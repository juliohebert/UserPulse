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

// Bloqueia QUALQUER escrita (create/update/delete) — usado por todos os
// controllers admin de dados operacionais. SUSPENDED/CANCELED são estados
// definitivos até uma ação comercial (fora do escopo desta fase, sem
// pagamento/checkout).
export function motivoBloqueioEscrita(tenant: Pick<Tenant, 'status'>): string | null {
  if (tenant.status === 'SUSPENDED') return 'Conta suspensa. Entre em contato com o suporte para reativar.'
  if (tenant.status === 'CANCELED') return 'Conta cancelada. Entre em contato com o suporte para reativar.'
  return null
}

// Bloqueia especificamente CRIAÇÃO de novo conteúdo e ATIVAÇÃO (ativo: true)
// de conteúdo já existente — usado por campanhas/tours/jornadas ao criar ou
// quando o payload liga ativo=true. Contas EXPIRED ainda podem editar/
// inativar o que já existe, só não podem publicar coisa nova.
export function motivoBloqueioAtivacao(tenant: Pick<Tenant, 'status'>): string | null {
  if (tenant.status === 'EXPIRED') {
    return 'Período de teste expirado. Assine um plano para criar ou ativar novo conteúdo.'
  }
  return motivoBloqueioEscrita(tenant)
}

// Sem plano vinculado = sem limite algum (mesmo padrão de "limite nulo =
// ilimitado" já usado nos campos limite_* do Plano) — permite operar num
// tenant que ainda não tem plano definido (ex.: recém-criado, aguardando
// contratação).
export async function checarLimiteCampanhasAtivas(tenantId: string, plano: Plano | null): Promise<string | null> {
  if (!plano?.limite_campanhas_ativas) return null
  const total = await prisma.campanha.count({ where: { tenant_id: tenantId, ativo: true } })
  if (total >= plano.limite_campanhas_ativas) {
    return `Limite de ${plano.limite_campanhas_ativas} campanha(s) ativa(s) do plano atingido.`
  }
  return null
}

export async function checarLimiteToursAtivos(tenantId: string, plano: Plano | null): Promise<string | null> {
  if (!plano?.limite_tours_ativos) return null
  const total = await prisma.tourGuiado.count({ where: { tenant_id: tenantId, ativo: true } })
  if (total >= plano.limite_tours_ativos) {
    return `Limite de ${plano.limite_tours_ativos} tour(s) ativo(s) do plano atingido.`
  }
  return null
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
