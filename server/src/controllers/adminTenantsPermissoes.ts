import { Request, Response } from 'express'
import { AdminRole, ModuloPainel, NivelAcessoModulo } from '@prisma/client'
import prisma from '../lib/prisma'
import { nivelAcessoEfetivo, type PermissaoModuloLinha, type SujeitoPermissao } from '../lib/permissoesModulo'

// Fase 2 de permissões personalizadas — API de gestão, montada sobre a
// superfície já existente de Gestão SaaS (/api/admin/tenants/:id/admins/
// :adminId/..., ver routes/adminTenants.ts). Sem guard próprio aqui: o
// router inteiro já vem atrás de requireAdminAuth + requireSuperAdmin em
// index.ts (mesmo padrão de listarAdmins/criarAcesso/atualizarAcesso ao
// lado, nenhuma delas tem guard por rota também). "Preservar Fase 1"
// significa nunca duplicar a lógica de nível efetivo — toda decisão de
// autorização em runtime (requireAcessoModulo, requireEscritaTenant.ts)
// continua vindo só de lib/permissoesModulo.ts; este arquivo só lê/escreve
// a tabela que aquela lógica consome.

const MODULOS_VALIDOS = new Set<ModuloPainel>(Object.values(ModuloPainel))
const NIVEIS_VALIDOS = new Set<NivelAcessoModulo>(Object.values(NivelAcessoModulo))

// ─── Validação pura do payload (sem Prisma/IO) ─────────────────────────────

export type ResultadoValidacaoPermissoes =
  | { ok: true; permissoes: PermissaoModuloLinha[] }
  | { ok: false; erro: string }

// "API deve trabalhar com payload explícito e validado" — permissoes
// ausente ou não-array é erro (nunca um default silencioso pra []); cada
// módulo só pode aparecer uma vez (matriz completa, não patch incremental —
// ver salvarPermissoes); módulo/nível fora do enum é rejeitado, nunca
// ignorado silenciosamente.
export function validarPayloadPermissoes(body: unknown): ResultadoValidacaoPermissoes {
  const permissoesBody = (body as { permissoes?: unknown } | null | undefined)?.permissoes
  if (!Array.isArray(permissoesBody)) {
    return { ok: false, erro: 'permissoes é obrigatório e deve ser uma lista de { modulo, nivel }.' }
  }

  const vistos = new Set<ModuloPainel>()
  const permissoes: PermissaoModuloLinha[] = []
  for (const item of permissoesBody) {
    const modulo = (item as { modulo?: unknown } | null)?.modulo
    const nivel = (item as { nivel?: unknown } | null)?.nivel
    if (typeof modulo !== 'string' || !MODULOS_VALIDOS.has(modulo as ModuloPainel)) {
      return { ok: false, erro: `Módulo inválido: ${String(modulo)}. Valores aceitos: ${[...MODULOS_VALIDOS].join(', ')}.` }
    }
    if (typeof nivel !== 'string' || !NIVEIS_VALIDOS.has(nivel as NivelAcessoModulo)) {
      return { ok: false, erro: `Nível inválido para ${modulo}: ${String(nivel)}. Valores aceitos: ${[...NIVEIS_VALIDOS].join(', ')}.` }
    }
    if (vistos.has(modulo as ModuloPainel)) {
      return { ok: false, erro: `Módulo duplicado no payload: ${modulo}.` }
    }
    vistos.add(modulo as ModuloPainel)
    permissoes.push({ modulo: modulo as ModuloPainel, nivel: nivel as NivelAcessoModulo })
  }
  return { ok: true, permissoes }
}

// ─── Regra de quem pode ser alvo (pura) ────────────────────────────────────

export interface BloqueioAlvoPermissoes {
  status: number
  erro: string
}

// usuarioAlvo já vem de uma consulta ESCOPADA por tenant_id (findFirst com
// {id, tenant_id} — mesmo padrão de atualizarAcesso/resetarSenha em
// adminTenants.ts), então null aqui já cobre tanto "não existe" quanto
// "existe mas é de outro tenant" — nunca revela cross-tenant, 404 genérico
// nos dois casos.
export function motivoBloqueioAlvoPermissoes(usuarioAlvo: { role: AdminRole } | null): BloqueioAlvoPermissoes | null {
  if (!usuarioAlvo) return { status: 404, erro: 'Acesso não encontrado.' }
  if (usuarioAlvo.role === 'SUPER_ADMIN') {
    return { status: 403, erro: 'SUPER_ADMIN não pode receber permissões personalizadas — este papel já é sempre irrestrito.' }
  }
  return null
}

// ─── Projeção da resposta (pura) ────────────────────────────────────────────

export interface RespostaPermissoes {
  role: AdminRole
  permissoes_personalizadas: boolean
  permissoes_efetivas: Record<ModuloPainel, NivelAcessoModulo>
  permissoes_personalizadas_salvas: Record<ModuloPainel, NivelAcessoModulo | null>
}

// permissoes_efetivas reusa nivelAcessoEfetivo (Fase 1) — nunca uma segunda
// implementação da mesma regra. permissoes_personalizadas_salvas mostra o
// que está gravado independente da flag estar ligada (útil pra ver o que
// seria aplicado se a personalização for reativada depois de desativada).
export function montarRespostaPermissoes(
  usuarioAlvo: { role: AdminRole; permissoes_personalizadas: boolean },
  linhasSalvas: PermissaoModuloLinha[]
): RespostaPermissoes {
  const sujeito: SujeitoPermissao = {
    role: usuarioAlvo.role,
    permissoes_personalizadas: usuarioAlvo.permissoes_personalizadas,
    permissoes: linhasSalvas,
  }
  const salvasPorModulo = new Map(linhasSalvas.map(p => [p.modulo, p.nivel]))

  const permissoes_efetivas = {} as Record<ModuloPainel, NivelAcessoModulo>
  const permissoes_personalizadas_salvas = {} as Record<ModuloPainel, NivelAcessoModulo | null>
  for (const modulo of MODULOS_VALIDOS) {
    permissoes_efetivas[modulo] = nivelAcessoEfetivo(sujeito, modulo)
    permissoes_personalizadas_salvas[modulo] = salvasPorModulo.get(modulo) ?? null
  }

  return {
    role: usuarioAlvo.role,
    permissoes_personalizadas: usuarioAlvo.permissoes_personalizadas,
    permissoes_efetivas,
    permissoes_personalizadas_salvas,
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

const SELECAO_PERMISSOES = {
  role: true,
  permissoes_personalizadas: true,
  permissoes: { select: { modulo: true, nivel: true } },
} as const

export async function consultarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const adminId = req.params.adminId as string

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const usuarioAlvo = await prisma.adminUser.findFirst({
      where: { id: adminId, tenant_id: tenantId },
      select: SELECAO_PERMISSOES,
    })
    const bloqueio = motivoBloqueioAlvoPermissoes(usuarioAlvo)
    if (bloqueio) { res.status(bloqueio.status).json({ erro: bloqueio.erro }); return }

    res.json(montarRespostaPermissoes(usuarioAlvo!, usuarioAlvo!.permissoes))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao consultar permissões.' })
  }
}

// Salva a matriz COMPLETA de forma transacional — nunca um patch parcial.
// Módulos ausentes do payload são apagados (deleteMany), os enviados são
// upsert, e a flag é ligada, tudo num único $transaction: ou tudo aplica,
// ou nada aplica (nunca fica com a flag ligada e a matriz pela metade se
// algo falhar no meio).
export async function salvarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const adminId = req.params.adminId as string

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const usuarioAlvo = await prisma.adminUser.findFirst({
      where: { id: adminId, tenant_id: tenantId },
      select: { role: true },
    })
    const bloqueio = motivoBloqueioAlvoPermissoes(usuarioAlvo)
    if (bloqueio) { res.status(bloqueio.status).json({ erro: bloqueio.erro }); return }

    const validacao = validarPayloadPermissoes(req.body)
    if (!validacao.ok) { res.status(400).json({ erro: validacao.erro }); return }

    const modulosEnviados = validacao.permissoes.map(p => p.modulo)
    await prisma.$transaction([
      prisma.adminUserPermissao.deleteMany({
        where: { admin_user_id: adminId, modulo: { notIn: modulosEnviados } },
      }),
      ...validacao.permissoes.map(p =>
        prisma.adminUserPermissao.upsert({
          where: { admin_user_id_modulo: { admin_user_id: adminId, modulo: p.modulo } },
          create: { admin_user_id: adminId, modulo: p.modulo, nivel: p.nivel },
          update: { nivel: p.nivel },
        })
      ),
      prisma.adminUser.update({ where: { id: adminId }, data: { permissoes_personalizadas: true } }),
    ])

    const atualizado = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId }, select: SELECAO_PERMISSOES })
    res.json(montarRespostaPermissoes(atualizado, atualizado.permissoes))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao salvar permissões.' })
  }
}

// Só desliga a flag — as linhas de AdminUserPermissao ficam salvas
// (dormentes: nivelAcessoEfetivo as ignora inteiramente enquanto a flag
// estiver false, ver lib/permissoesModulo.ts e o teste correspondente em
// permissoesModulo.test.ts), pra não perder a configuração se alguém
// reativar depois. Update de 1 linha já é atômico por natureza — sem
// $transaction aqui.
export async function desativarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const adminId = req.params.adminId as string

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const usuarioAlvo = await prisma.adminUser.findFirst({
      where: { id: adminId, tenant_id: tenantId },
      select: { role: true },
    })
    const bloqueio = motivoBloqueioAlvoPermissoes(usuarioAlvo)
    if (bloqueio) { res.status(bloqueio.status).json({ erro: bloqueio.erro }); return }

    const atualizado = await prisma.adminUser.update({
      where: { id: adminId },
      data: { permissoes_personalizadas: false },
      select: SELECAO_PERMISSOES,
    })
    res.json(montarRespostaPermissoes(atualizado, atualizado.permissoes))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao desativar permissões personalizadas.' })
  }
}
