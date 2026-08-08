import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AdminRole, Plano, Tenant } from '@prisma/client'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions, signSessionToken } from '../lib/auth'
import { obterSituacaoComercialTenant } from '../lib/tenantGuards'

// Mesmo custo de hash usado em adminTenants.ts/seedAdmin.ts.
const SALT_ROUNDS = 10

// Recorte público do tenant devolvido em login/me — plano/status é o mínimo
// que o frontend precisa pra mostrar "conta em teste/expirada/suspensa" (ver
// Topbar.tsx) sem expor nada de billing ainda (sem checkout nesta fase).
function tenantPublico(t: Tenant & { plano: Plano | null }) {
  return {
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    slug: t.slug,
    // public_key é o identificador PÚBLICO do tenant (Fase 2 do widget
    // multi-tenant) — mostrado no painel (tela de Integração) pro admin
    // colar no window.UserPulse.init(). Não é segredo (nunca autentica
    // nada sozinho, só resolve qual tenant o widget está falando), então
    // expor em /auth/me é seguro; tenant_id (UUID técnico) nunca é exposto.
    public_key: t.public_key,
    status: t.status,
    trial_fim: t.trial_fim,
    // licenca_fim entra aqui pela primeira vez — precisa junto com status
    // pro front montar o banner de aviso de vencimento (ver
    // web/src/components/layout/AvisoComercial.tsx). situacao_comercial é
    // a mesma decisão pura que já bloqueia escrita no backend
    // (obterSituacaoComercialTenant, ver tenantGuards.ts) — o front nunca
    // recalcula essa regra sozinho, só lê o valor já calculado aqui.
    licenca_fim: t.licenca_fim,
    situacao_comercial: obterSituacaoComercialTenant(t),
    plano: t.plano && {
      id: t.plano.id,
      nome: t.plano.nome,
      slug: t.plano.slug,
      permite_tours: t.plano.permite_tours,
      permite_jornadas: t.plano.permite_jornadas,
      permite_white_label: t.plano.permite_white_label,
      limite_campanhas_ativas: t.plano.limite_campanhas_ativas,
      limite_tours_ativos: t.plano.limite_tours_ativos,
      limite_eventos_mes: t.plano.limite_eventos_mes,
      limite_usuarios_admin: t.plano.limite_usuarios_admin,
    },
  }
}

// Nunca devolve password_hash — nem aqui, nem em /me. Sempre a mesma forma
// reduzida do usuário em qualquer resposta de sucesso (login/me) — exportada
// pra me() (abaixo) reaproveitar em cima de req.adminUser, sem duplicar o
// formato do tenant/plano devolvido.
export function usuarioPublico(u: {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  senha_temporaria: boolean
  criado_em: Date
  atualizado_em: Date
  tenant: Tenant & { plano: Plano | null }
}) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    // senha_temporaria: true sempre que a senha foi definida por outra
    // pessoa (admin inicial do cliente ou reset pelo SUPER_ADMIN) — ver
    // adminTenants.ts. precisa_trocar_senha é o mesmo valor, com o nome que
    // o frontend usa pra decidir o redirect obrigatório (ver
    // RequireSenhaAtualizada.tsx) — mantidos os dois pra deixar explícito
    // qual campo é o "estado" e qual é a "decisão" derivada dele.
    senha_temporaria: u.senha_temporaria,
    precisa_trocar_senha: u.senha_temporaria,
    criado_em: u.criado_em,
    atualizado_em: u.atualizado_em,
    tenant: tenantPublico(u.tenant),
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string }
    if (!email?.trim() || !senha) {
      // Mensagem genérica mesmo aqui (campo ausente) — não dar pista nenhuma
      // sobre o que especificamente está errado na tentativa de login.
      res.status(400).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }

    const usuario = await prisma.adminUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { tenant: { include: { plano: true } } },
    })
    // Mesma mensagem genérica pra "usuário não existe", "inativo" e "senha
    // errada" — nunca revelar qual dessas três é o motivo real (evita um
    // atacante descobrir e-mails válidos por tentativa e erro). Conta
    // suspensa/cancelada/expirada ainda pode logar (ver contexto da tarefa
    // SaaS: login sempre permitido, só a escrita é bloqueada) — não checado aqui.
    if (!usuario || !usuario.ativo) {
      res.status(401).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }
    const senhaOk = await bcrypt.compare(senha, usuario.password_hash)
    if (!senhaOk) {
      res.status(401).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }

    const token = signSessionToken({ sub: usuario.id, email: usuario.email, role: usuario.role })
    res.cookie(ADMIN_SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE })
    // Best-effort: nunca deixa uma falha aqui derrubar um login com
    // credenciais corretas (ver comentário no contexto da tarefa).
    prisma.adminUser
      .update({ where: { id: usuario.id }, data: { ultimo_login_em: new Date() } })
      .catch(err => console.error('Erro ao atualizar ultimo_login_em:', err))
    res.json(usuarioPublico(usuario))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao efetuar login.' })
  }
}

// Sempre atrás de requireAdminAuth (ver routes/auth.ts) — se chegou aqui,
// req.adminUser já foi validado contra o banco (usuário existe e está ativo).
// Mesmo formato de login (usuarioPublico) — front não precisa tratar /me e
// /login como respostas diferentes.
export async function me(req: Request, res: Response) {
  res.json(usuarioPublico(req.adminUser!))
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE, sessionCookieOptions())
  res.status(204).send()
}

// Sempre atrás de requireAdminAuth (ver routes/auth.ts) — troca a senha do
// PRÓPRIO usuário logado, nunca de outro (não recebe id no body/params).
// req.adminUser (ver middleware/requireAdminAuth.ts) nunca carrega
// password_hash de propósito, então precisa rebuscar o registro completo
// aqui pra comparar a senha atual.
export async function trocarSenha(req: Request, res: Response) {
  try {
    const { senha_atual, nova_senha, confirmar_senha } = req.body as {
      senha_atual?: string
      nova_senha?: string
      confirmar_senha?: string
    }
    if (!senha_atual || !nova_senha || !confirmar_senha) {
      res.status(400).json({ erro: 'senha_atual, nova_senha e confirmar_senha são obrigatórios.' })
      return
    }
    if (nova_senha.length < 8) {
      res.status(400).json({ erro: 'nova_senha precisa ter pelo menos 8 caracteres.' })
      return
    }
    if (nova_senha !== confirmar_senha) {
      res.status(400).json({ erro: 'confirmar_senha não confere com nova_senha.' })
      return
    }

    const usuario = await prisma.adminUser.findUniqueOrThrow({
      where: { id: req.adminUser!.id },
      include: { tenant: { include: { plano: true } } },
    })

    const senhaAtualOk = await bcrypt.compare(senha_atual, usuario.password_hash)
    if (!senhaAtualOk) {
      res.status(400).json({ erro: 'senha_atual incorreta.' })
      return
    }

    // Comparada contra o hash já salvo (não contra a string senha_atual) —
    // mesmo resultado aqui (senha_atual já validada acima), mas deixa a
    // checagem correta mesmo se essa validação mudar no futuro.
    const novaSenhaIgualAtual = await bcrypt.compare(nova_senha, usuario.password_hash)
    if (novaSenhaIgualAtual) {
      res.status(400).json({ erro: 'nova_senha não pode ser igual à senha atual.' })
      return
    }

    const password_hash = await bcrypt.hash(nova_senha, SALT_ROUNDS)
    const atualizado = await prisma.adminUser.update({
      where: { id: usuario.id },
      data: { password_hash, senha_temporaria: false, senha_alterada_em: new Date() },
      include: { tenant: { include: { plano: true } } },
    })
    res.json(usuarioPublico(atualizado))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao trocar senha.' })
  }
}
