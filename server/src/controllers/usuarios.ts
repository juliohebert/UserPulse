import { Request, Response } from 'express'
import { AdminRole, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { checarLimiteAcessosComConvites, comLockDeCapacidade, contarUsoAcessos, planoEfetivoParaLimite } from '../lib/tenantGuards'
import {
  calcularExpiracaoConvite, condicaoConvitePendente, condicaoConviteReenviavel,
  gerarTokenConvite, hashTokenConvite, CONVITE_VALIDADE_DIAS,
} from '../lib/convites'
import { emailService } from '../lib/email/EmailService'
import { validarPayloadPermissoes, montarRespostaPermissoes } from './adminTenantsPermissoes'
import { ROLES_ACESSO_CLIENTE } from './adminTenants'
import type { PermissaoModuloLinha } from '../lib/permissoesModulo'

// Gestão de usuários self-service (ADMIN do próprio tenant convida/edita/
// remove acessos, sem depender do SUPER_ADMIN) — ver routes/usuarios.ts,
// montado em /api/usuarios com requireEscritaConfiguracao (ADMIN-only
// dentro do próprio tenant) em TODAS as rotas, mesmo padrão de billing.ts.
// Tenant SEMPRE resolvido por req.adminUser.tenant_id — nenhuma rota aqui
// recebe um :tenantId (diferente de adminTenants.ts, que é Gestão SaaS
// cross-tenant); :id nas rotas abaixo é sempre um AdminUser ou
// ConviteUsuario, escopado por tenant_id em toda query.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Erro interno pra sair de dentro de comLockDeCapacidade com a mensagem já
// pronta (mesmo padrão de ConviteInvalido em controllers/auth.ts) — nunca
// vaza pro caller fora dos handlers abaixo, sempre capturado e traduzido
// pra um 400.
class LimiteCapacidadeAtingido extends Error {}

// ─── Validação pura do payload de convite (sem Prisma/IO) — testável direto
// (ver usuarios.test.ts). Duplicidade de e-mail/limite de plano continuam
// exclusivos do handler (dependem do banco), esta função só garante que
// email/role/permissoes chegaram bem formados antes de qualquer consulta.
// `permissoes` é OPCIONAL no payload (convite sem personalização é o caso
// comum) — só quando presente é validada via validarPayloadPermissoes
// (mesma função de adminTenantsPermissoes.ts, nunca uma segunda
// implementação da mesma regra de matriz de módulos/níveis).
export interface DadosConviteValidados {
  email: string
  role: AdminRole
  permissoes: PermissaoModuloLinha[] | null
}

export function validarPayloadConvite(
  body: { email?: string; role?: string; permissoes?: unknown }
): { ok: true; data: DadosConviteValidados } | { ok: false; erro: string } {
  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, erro: 'email é obrigatório e precisa ser válido.' }
  }
  const role = (body.role?.trim().toUpperCase() || '') as AdminRole
  if (!ROLES_ACESSO_CLIENTE.has(role)) {
    return { ok: false, erro: `role inválida. Valores aceitos: ${[...ROLES_ACESSO_CLIENTE].join(', ')}.` }
  }
  if (body.permissoes === undefined) {
    return { ok: true, data: { email, role, permissoes: null } }
  }
  const validacaoPermissoes = validarPayloadPermissoes({ permissoes: body.permissoes })
  if (!validacaoPermissoes.ok) {
    return { ok: false, erro: validacaoPermissoes.erro }
  }
  return { ok: true, data: { email, role, permissoes: validacaoPermissoes.permissoes } }
}

// Nunca permite que o próprio usuário logado edite/desative/altere as
// próprias permissões através destas rotas — evita alguém tirar o próprio
// acesso ADMIN por engano sem ter outro admin pra reverter (edição do
// próprio usuário continua só por /minha-conta, trocar-senha). Pura (sem
// Request) pra ser testável direto — bloqueioAutoEdicao abaixo só adapta
// pro shape de req.
export function alvoIgualUsuarioLogado(usuarioLogadoId: string, alvoId: string): boolean {
  return alvoId === usuarioLogadoId
}

function bloqueioAutoEdicao(req: Request, alvoId: string): boolean {
  return alvoIgualUsuarioLogado(req.adminUser!.id, alvoId)
}

const SELECAO_USUARIO = {
  id: true, nome: true, email: true, role: true, ativo: true,
  permissoes_personalizadas: true, criado_em: true, atualizado_em: true,
} as const

const SELECAO_CONVITE = {
  id: true, email: true, role: true, criado_em: true, expires_at: true,
  convidadoPor: { select: { nome: true } },
} as const

// ─── GET / — lista usuários + convites reenviáveis + capacidade do plano ──
// Lista todos os convites REENVIÁVEIS (não aceitos, não cancelados —
// inclusive expirados, ver condicaoConviteReenviavel), não só os pendentes
// no sentido estrito de contarUsoAcessos: o front precisa enxergar convites
// expirados pra oferecer o botão "Reenviar" (ver Usuarios.tsx). A CAPACIDADE
// (usados/limite) continua vindo só de contarUsoAcessos, que já usa
// condicaoConvitePendente (expirado nunca consome vaga do plano) — as duas
// listas propositalmente divergem nesse critério.
export async function listar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const [usuarios, convites, usados] = await Promise.all([
      prisma.adminUser.findMany({ where: { tenant_id: tenantId }, select: SELECAO_USUARIO, orderBy: { criado_em: 'asc' } }),
      prisma.conviteUsuario.findMany({
        where: { tenant_id: tenantId, ...condicaoConviteReenviavel() },
        select: SELECAO_CONVITE,
        orderBy: { criado_em: 'asc' },
      }),
      contarUsoAcessos(tenantId),
    ])

    const agora = new Date()
    const plano = planoEfetivoParaLimite(tenant)
    res.json({
      usuarios,
      convites: convites.map(c => ({
        id: c.id, email: c.email, role: c.role, criado_em: c.criado_em, expires_at: c.expires_at,
        // convidadoPor pode ser null (autor removido depois — onDelete:
        // SetNull, ver schema.prisma) — nunca crasha, só perde a atribuição.
        convidado_por_nome: c.convidadoPor?.nome ?? null,
        expirado: c.expires_at.getTime() <= agora.getTime(),
      })),
      capacidade: { usados, limite: plano?.limite_usuarios_admin ?? null },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar usuários.' })
  }
}

// ─── POST /convites — convida um novo acesso ───────────────────────────────
export async function criarConvite(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const validacao = validarPayloadConvite(req.body as { email?: string; role?: string; permissoes?: unknown })
    if (!validacao.ok) { res.status(400).json({ erro: validacao.erro }); return }
    const { email: emailNormalizado, role: roleNormalizada, permissoes } = validacao.data

    const usuarioExistente = await prisma.adminUser.findFirst({ where: { tenant_id: tenantId, email: emailNormalizado, ativo: true } })
    if (usuarioExistente) { res.status(409).json({ erro: 'Este e-mail já tem um acesso ativo neste workspace.' }); return }

    const convitePendenteExistente = await prisma.conviteUsuario.findFirst({
      where: { tenant_id: tenantId, email: emailNormalizado, ...condicaoConvitePendente() },
    })
    if (convitePendenteExistente) { res.status(409).json({ erro: 'Já existe um convite pendente para este e-mail.' }); return }

    const token = gerarTokenConvite()
    let convite
    try {
      // Checagem de capacidade + criação na MESMA transaction travada (ver
      // comLockDeCapacidade em tenantGuards.ts) — nunca checar limite fora
      // da transaction que escreve, ou duas requisições concorrentes podem
      // ambas passar na checagem antes de qualquer uma commitar.
      convite = await comLockDeCapacidade(tenantId, async tx => {
        const limiteErro = await checarLimiteAcessosComConvites(tenantId, planoEfetivoParaLimite(tenant), tx)
        if (limiteErro) throw new LimiteCapacidadeAtingido(limiteErro)
        return tx.conviteUsuario.create({
          data: {
            tenant_id: tenantId,
            email: emailNormalizado,
            role: roleNormalizada,
            token_hash: hashTokenConvite(token),
            convidado_por_id: req.adminUser!.id,
            expires_at: calcularExpiracaoConvite(),
            permissoes_pendentes: (permissoes as unknown as Prisma.InputJsonValue) ?? undefined,
          },
        })
      })
    } catch (err) {
      if (err instanceof LimiteCapacidadeAtingido) { res.status(400).json({ erro: err.message }); return }
      throw err
    }

    const urlBase = process.env.APP_URL || 'http://localhost:5173'
    const urlConvite = `${urlBase}/convite/${token}`

    // Best-effort, mesmo padrão de enviarBoasVindas/enviarRedefinicaoSenha em
    // auth.ts — nunca faz esta resposta esperar ou falhar por causa do e-mail.
    emailService
      .enviarConviteUsuario(
        emailNormalizado,
        { tenantNome: tenant.nome, convidadoPorNome: req.adminUser!.nome, urlConvite, validadeDias: CONVITE_VALIDADE_DIAS },
        { idempotencyKey: `convite-usuario:${convite.id}` }
      )
      .catch(err => console.error(`Erro ao enviar e-mail de convite (convite ${convite.id}):`, err))

    res.status(201).json({
      id: convite.id, email: convite.email, role: convite.role,
      criado_em: convite.criado_em, expires_at: convite.expires_at,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar convite.' })
  }
}

// ─── DELETE /convites/:id — cancela um convite pendente ────────────────────
export async function cancelarConvite(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const conviteId = req.params.id as string

    const convite = await prisma.conviteUsuario.findFirst({ where: { id: conviteId, tenant_id: tenantId } })
    if (!convite) { res.status(404).json({ erro: 'Convite não encontrado.' }); return }

    await prisma.conviteUsuario.update({ where: { id: conviteId }, data: { cancelado_em: new Date() } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao cancelar convite.' })
  }
}

// ─── POST /convites/:id/reenviar — renova token/prazo e reenvia o e-mail ──
// Aceita convite pendente (não expirado ainda) OU expirado, desde que nunca
// aceito/cancelado (condicaoConviteReenviavel). Convite expirado não conta
// em contarUsoAcessos hoje — reenviar é o que faz ele voltar a consumir uma
// vaga, então a checagem de capacidade precisa rodar de novo, dentro do
// mesmo lock que grava o novo token_hash/expires_at (mesmo raciocínio de
// criarConvite acima). excluirConviteId exclui ESTE convite da contagem: se
// ele já está pendente (não expirado), já consome uma vaga hoje e reenviar
// não cria vaga nova nenhuma — sem excluir a si mesmo, um tenant exatamente
// no limite nunca conseguiria reenviar um convite que já era dele.
export async function reenviarConvite(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant
    const conviteId = req.params.id as string

    const convite = await prisma.conviteUsuario.findFirst({
      where: { id: conviteId, tenant_id: tenantId, ...condicaoConviteReenviavel() },
    })
    if (!convite) { res.status(404).json({ erro: 'Convite não encontrado.' }); return }

    const token = gerarTokenConvite()
    let atualizado
    try {
      atualizado = await comLockDeCapacidade(tenantId, async tx => {
        const limiteErro = await checarLimiteAcessosComConvites(tenantId, planoEfetivoParaLimite(tenant), tx, conviteId)
        if (limiteErro) throw new LimiteCapacidadeAtingido(limiteErro)
        return tx.conviteUsuario.update({
          where: { id: conviteId },
          data: { token_hash: hashTokenConvite(token), expires_at: calcularExpiracaoConvite() },
        })
      })
    } catch (err) {
      if (err instanceof LimiteCapacidadeAtingido) { res.status(400).json({ erro: err.message }); return }
      throw err
    }

    const urlBase = process.env.APP_URL || 'http://localhost:5173'
    const urlConvite = `${urlBase}/convite/${token}`

    emailService
      .enviarConviteUsuario(
        atualizado.email,
        { tenantNome: tenant.nome, convidadoPorNome: req.adminUser!.nome, urlConvite, validadeDias: CONVITE_VALIDADE_DIAS },
        { idempotencyKey: `convite-usuario-reenvio:${atualizado.id}:${atualizado.expires_at.getTime()}` }
      )
      .catch(err => console.error(`Erro ao enviar e-mail de reenvio de convite (convite ${atualizado.id}):`, err))

    res.json({
      id: atualizado.id, email: atualizado.email, role: atualizado.role,
      criado_em: atualizado.criado_em, expires_at: atualizado.expires_at,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao reenviar convite.' })
  }
}

// ─── PUT /:id — edita nome/role/ativo de um acesso já existente ───────────
export async function atualizarUsuario(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant
    const adminId = req.params.id as string

    if (bloqueioAutoEdicao(req, adminId)) {
      res.status(403).json({ erro: 'Você não pode editar o próprio acesso por aqui. Peça a outro administrador.' })
      return
    }

    const existente = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId } })
    if (!existente) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }
    // SUPER_ADMIN pode pertencer ao próprio tenant (ver comentário em
    // schema.prisma) mas nunca é gerenciável por este fluxo self-service —
    // sem este bloqueio, roleNormalizada abaixo (sempre ADMIN/EDITOR/VIEWER)
    // rebaixaria um SUPER_ADMIN sem querer, já que este endpoint sempre
    // reenvia a role inteira, nunca um patch parcial.
    if (existente.role === 'SUPER_ADMIN') {
      res.status(403).json({ erro: 'Este acesso não pode ser gerenciado por aqui.' })
      return
    }

    const { nome, role, ativo } = req.body as { nome?: string; role?: string; ativo?: boolean }
    if (!nome?.trim()) { res.status(400).json({ erro: 'nome é obrigatório.' }); return }
    const roleNormalizada = (role?.trim().toUpperCase() || '') as AdminRole
    if (!ROLES_ACESSO_CLIENTE.has(roleNormalizada)) {
      res.status(400).json({ erro: `role inválida. Valores aceitos: ${[...ROLES_ACESSO_CLIENTE].join(', ')}.` })
      return
    }

    const ativoNovo = Boolean(ativo)
    const dadosUpdate = { nome: nome.trim(), role: roleNormalizada, ativo: ativoNovo }

    // Reativação (inativo -> ativo) consome uma vaga do plano — precisa da
    // mesma checagem de capacidade que criarConvite, dentro do mesmo lock
    // que grava a mudança (ver comLockDeCapacidade em tenantGuards.ts).
    // Edição que não reativa (nome/role, ou desativação) não consome vaga
    // nenhuma, nunca passa pelo lock.
    if (existente.ativo === false && ativoNovo === true) {
      try {
        const atualizado = await comLockDeCapacidade(tenantId, async tx => {
          const limiteErro = await checarLimiteAcessosComConvites(tenantId, planoEfetivoParaLimite(tenant), tx)
          if (limiteErro) throw new LimiteCapacidadeAtingido(limiteErro)
          return tx.adminUser.update({ where: { id: adminId }, data: dadosUpdate, select: SELECAO_USUARIO })
        })
        res.json(atualizado)
      } catch (err) {
        if (err instanceof LimiteCapacidadeAtingido) { res.status(400).json({ erro: err.message }); return }
        throw err
      }
      return
    }

    const atualizado = await prisma.adminUser.update({ where: { id: adminId }, data: dadosUpdate, select: SELECAO_USUARIO })
    res.json(atualizado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar acesso.' })
  }
}

// ─── DELETE /:id — desativa um acesso (nunca hard delete) ─────────────────
export async function desativarUsuario(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const adminId = req.params.id as string

    if (bloqueioAutoEdicao(req, adminId)) {
      res.status(403).json({ erro: 'Você não pode remover o próprio acesso por aqui. Peça a outro administrador.' })
      return
    }

    const existente = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId } })
    if (!existente) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }
    // Mesmo bloqueio de atualizarUsuario acima — SUPER_ADMIN nunca é
    // gerenciável por este fluxo self-service.
    if (existente.role === 'SUPER_ADMIN') {
      res.status(403).json({ erro: 'Este acesso não pode ser gerenciado por aqui.' })
      return
    }

    await prisma.adminUser.update({ where: { id: adminId }, data: { ativo: false } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover acesso.' })
  }
}

// ─── GET/PUT/DELETE /:id/permissoes — espelham adminTenantsPermissoes.ts ───
// Mesmas funções puras (validarPayloadPermissoes/montarRespostaPermissoes),
// nunca uma segunda implementação da regra — só a escopagem por tenant_id
// muda (aqui vem de req.adminUser, nunca de um :tenantId de rota, diferente
// de Gestão SaaS).

const SELECAO_PERMISSOES = {
  role: true,
  permissoes_personalizadas: true,
  permissoes: { select: { modulo: true, nivel: true } },
} as const

export async function consultarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const adminId = req.params.id as string

    const usuarioAlvo = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId }, select: SELECAO_PERMISSOES })
    if (!usuarioAlvo) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }

    res.json(montarRespostaPermissoes(usuarioAlvo, usuarioAlvo.permissoes))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao consultar permissões.' })
  }
}

export async function salvarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const adminId = req.params.id as string

    if (bloqueioAutoEdicao(req, adminId)) {
      res.status(403).json({ erro: 'Você não pode editar as próprias permissões por aqui. Peça a outro administrador.' })
      return
    }

    const usuarioAlvo = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId }, select: { role: true } })
    if (!usuarioAlvo) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }
    if (usuarioAlvo.role === 'SUPER_ADMIN') {
      res.status(403).json({ erro: 'SUPER_ADMIN não pode receber permissões personalizadas — este papel já é sempre irrestrito.' })
      return
    }

    const validacao = validarPayloadPermissoes(req.body)
    if (!validacao.ok) { res.status(400).json({ erro: validacao.erro }); return }

    const modulosEnviados = validacao.permissoes.map(p => p.modulo)
    await prisma.$transaction([
      prisma.adminUserPermissao.deleteMany({ where: { admin_user_id: adminId, modulo: { notIn: modulosEnviados } } }),
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

export async function desativarPermissoes(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const adminId = req.params.id as string

    if (bloqueioAutoEdicao(req, adminId)) {
      res.status(403).json({ erro: 'Você não pode editar as próprias permissões por aqui. Peça a outro administrador.' })
      return
    }

    const usuarioAlvo = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId }, select: { role: true } })
    if (!usuarioAlvo) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }

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
