import { Plano, Tenant } from '@prisma/client'
import prisma from './prisma'

// Helpers de escopo/limite de tenant, usados pelos controllers admin
// (campanhas/tours/jornadas/catalogoTelas/aparenciaWidget) antes de qualquer
// escrita. Nunca usados pelas rotas públicas do widget (widget.ts) — essas
// permanecem sem conceito de tenant nesta fase (ver comentário no topo de
// schema.prisma sobre a Fase 2 do widget multi-tenant).

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
