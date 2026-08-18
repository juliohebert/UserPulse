import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AdminRole, ModuloPainel, NivelAcessoModulo, Plano, Prisma, Tenant, TenantStatus } from '@prisma/client'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions, signSessionToken } from '../lib/auth'
import { diasRestantesTolerancia, diasRestantesTrial, obterSituacaoComercialTenant, resolverDuracaoTrialDias, resolverPlanoTrial } from '../lib/tenantGuards'
import { nivelAcessoEfetivo, type PermissaoModuloLinha } from '../lib/permissoesModulo'
import { emailService } from '../lib/email/EmailService'
import {
  REDEFINICAO_SENHA_VALIDADE_MINUTOS, calcularExpiracaoRedefinicaoSenha,
  condicaoTokenAtivo, gerarTokenRedefinicaoSenha, hashTokenRedefinicaoSenha,
} from '../lib/passwordReset'

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
    // Fase 6C — dias restantes de trial calculados em runtime a partir de
    // trial_fim (nunca persistido, sem cron) — o front nunca recalcula essa
    // conta sozinho, só formata o número (ver AvisoComercial.tsx). null
    // quando o tenant não tem trial_fim definido, mesmo caso de
    // situacao_comercial acima.
    trial_dias_restantes: diasRestantesTrial(t.trial_fim),
    // Fase 7 — dias restantes da tolerância de inadimplência (assinatura
    // paga vencida), calculados em runtime a partir de licenca_fim (nunca
    // persistido). null quando não está em 'licenca_vencida' — nunca expõe
    // data/status financeiro bruto aqui, só o número de dias (regra
    // explícita da tarefa; datas/status detalhados continuam exclusivos de
    // Minha Assinatura, ver GET /api/billing/situacao).
    tolerancia_dias_restantes: diasRestantesTolerancia(t),
    plano: t.plano && {
      id: t.plano.id,
      nome: t.plano.nome,
      slug: t.plano.slug,
      permite_tours: t.plano.permite_tours,
      permite_jornadas: t.plano.permite_jornadas,
      permite_white_label: t.plano.permite_white_label,
      limite_campanhas_ativas: t.plano.limite_campanhas_ativas,
      limite_tours_ativos: t.plano.limite_tours_ativos,
      // Fase 6A (fundação do trial) — mesma convenção dos dois limites
      // acima (null = sem limite), agora pra jornadas.
      limite_jornadas_ativas: t.plano.limite_jornadas_ativas,
      limite_eventos_mes: t.plano.limite_eventos_mes,
      limite_usuarios_admin: t.plano.limite_usuarios_admin,
      // Fase 6E — o frontend precisa saber SE o limite de campanhas/tours/
      // jornadas conta total cadastrado (trial) ou só ativos (pago) pra
      // espelhar a mesma decisão do backend (ver checarLimite*Ativas em
      // tenantGuards.ts) ao desabilitar o botão "Novo"/bloquear a rota
      // direta — nunca inferir isso a partir de tenant.status/situacao_comercial
      // no front (SUPER_ADMIN pode atribuir um plano não-trial a um tenant
      // TRIAL manualmente, ver adminTenants.ts, então os dois podem divergir).
      eh_plano_trial: t.plano.eh_plano_trial,
    },
  }
}

// Fase 4 de permissões personalizadas — os 4 módulos personalizáveis do
// painel, mesma lista de lib/permissoesModulo.ts (sem export de lá hoje,
// duplicado aqui como já é feito em adminTenantsPermissoes.ts).
const MODULOS_PAINEL = Object.values(ModuloPainel)

// Nunca devolve password_hash — nem aqui, nem em /me. Sempre a mesma forma
// reduzida do usuário em qualquer resposta de sucesso (login/me/trocar-senha/
// cadastro) — exportada pra me() (abaixo) reaproveitar em cima de
// req.adminUser, sem duplicar o formato do tenant/plano devolvido.
//
// permissoes_efetivas (Fase 4) reusa nivelAcessoEfetivo (lib/
// permissoesModulo.ts) — a MESMA função pura que os middlewares
// (requireAcessoModulo/requireEscritaTenant.ts) usam pra autorizar de
// verdade. Nunca uma segunda implementação da regra aqui: o front só lê o
// resultado já calculado, exatamente como já faz com situacao_comercial
// (ver tenantPublico acima). Sem query adicional — quem chama
// usuarioPublico() já trouxe permissoes_personalizadas/permissoes no mesmo
// SELECT que buscou o resto do usuário (ver login/me/trocarSenha/cadastro
// abaixo; me() nem precisa disso, req.adminUser já vem populado por
// requireAdminAuth.ts).
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
  permissoes_personalizadas: boolean
  permissoes: PermissaoModuloLinha[]
}) {
  const permissoes_efetivas = {} as Record<ModuloPainel, NivelAcessoModulo>
  for (const modulo of MODULOS_PAINEL) {
    permissoes_efetivas[modulo] = nivelAcessoEfetivo(
      { role: u.role, permissoes_personalizadas: u.permissoes_personalizadas, permissoes: u.permissoes },
      modulo
    )
  }

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
    permissoes_personalizadas: u.permissoes_personalizadas,
    permissoes_efetivas,
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
      // permissoes (Fase 4) no mesmo SELECT que já busca tenant/plano —
      // nunca uma query própria por módulo (mesmo raciocínio de
      // requireAdminAuth.ts). permissoes_personalizadas já vem junto por
      // ser coluna escalar de AdminUser (sem select explícito, Prisma
      // sempre traz todos os escalares).
      include: { tenant: { include: { plano: true } }, permissoes: true },
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
    // Mesma regra do cadastro público (ver motivoSenhaFraca mais abaixo neste
    // arquivo) — antes disso, trocar a senha só exigia 8 caracteres,
    // permitindo contornar a política de senha forte logo após criar a
    // conta com uma senha temporária fraca de propósito.
    const motivoNovaSenha = motivoSenhaFraca(nova_senha)
    if (motivoNovaSenha) {
      res.status(400).json({ erro: motivoNovaSenha.replace('A senha precisa ter', 'nova_senha precisa ter') })
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

    // Reemite a sessão com um token novo (iat atualizado) — sem isso, a
    // PRÓPRIA sessão que acabou de trocar a senha seria invalidada na
    // próxima requisição por sessaoInvalidadaPorTrocaSenha em
    // requireAdminAuth.ts (que compara iat contra o senha_alterada_em recém
    // gravado acima), obrigando um logout indesejado logo após um fluxo que
    // deu certo. Sessões de OUTROS lugares (outro navegador/aparelho, ou uma
    // sessão comprometida) continuam com o iat antigo e caem nessa checagem
    // normalmente — esse é o efeito de segurança que este fluxo busca.
    const token = signSessionToken({ sub: atualizado.id, email: atualizado.email, role: atualizado.role })
    res.cookie(ADMIN_SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE })

    // Troca de senha nunca mexe em permissão — reaproveita o que
    // requireAdminAuth já carregou pra req.adminUser no início do request
    // (Fase 4), em vez de pedir permissoes de novo nas duas queries acima.
    res.json(usuarioPublico({
      ...atualizado,
      permissoes_personalizadas: req.adminUser!.permissoes_personalizadas,
      permissoes: req.adminUser!.permissoes,
    }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao trocar senha.' })
  }
}

// ─── Fase 6B — cadastro público self-service ────────────────────────────────
// Único par de rotas deste arquivo alcançável sem sessão nem convite de
// ninguém (ver routes/auth.ts) — todo o resto de "criar Tenant/AdminUser"
// continua exclusivo do SUPER_ADMIN (adminTenants.ts). Mensagem genérica
// "Cadastro indisponível" quando a configuração de trial está ambígua (ver
// resolverPlanoTrial/resolverDuracaoTrialDias em tenantGuards.ts) — falha
// fechada: nunca cria um Tenant sem plano/duração de trial resolvidos com
// segurança, e nunca expõe ao público QUAL é o problema de configuração.

interface CadastroBody {
  nome?: string
  empresa?: string
  email?: string
  senha?: string
}

export interface DadosCadastroValidados {
  nome: string
  empresa: string
  email: string
  senha: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Fonte única da regra de senha forte — reaproveitada por TODO fluxo onde o
// próprio usuário final define a senha da própria conta: cadastro público
// (validarCadastroPublico abaixo) e troca de senha (trocarSenha acima). Sem
// isso, trocar a senha logo após o cadastro seria um jeito de contornar a
// política (voltar pra uma senha fraca de 8 caracteres). O frontend espelha
// a MESMA lista (ver web/src/pages/Cadastro.tsx, REGRAS_SENHA) pra mostrar o
// checklist em tempo real, mas quem decide de verdade é sempre este
// validador no backend (o frontend nunca é a única barreira). Duplicado em
// vez de compartilhado de propósito — sem pacote comum entre server/web
// neste projeto (mesmo raciocínio de gerarSlugBase/SALT_ROUNDS acima).
//
// Não cobre (identificado, fora de escopo — ver relatório da tarefa): as
// senhas iniciais/temporárias que o SUPER_ADMIN define pra outra pessoa em
// adminTenants.ts (validarAdminInicial, criarAcesso, resetarSenha) — hoje só
// exigem 8 caracteres. São sempre senha_temporaria=true, forçando troca no
// primeiro login, mas essa troca cai exatamente aqui em trocarSenha, então
// já herda a regra forte a partir do momento em que o próprio usuário troca.
export const REGRAS_SENHA_FORTE: { chave: string; descricao: string; testar: (s: string) => boolean }[] = [
  { chave: 'tamanho', descricao: 'pelo menos 8 caracteres', testar: s => s.length >= 8 },
  { chave: 'maiuscula', descricao: 'uma letra maiúscula', testar: s => /[A-Z]/.test(s) },
  { chave: 'minuscula', descricao: 'uma letra minúscula', testar: s => /[a-z]/.test(s) },
  { chave: 'numero', descricao: 'um número', testar: s => /[0-9]/.test(s) },
  { chave: 'especial', descricao: 'um caractere especial', testar: s => /[^A-Za-z0-9]/.test(s) },
]

export function motivoSenhaFraca(senha: string): string | null {
  const atende = REGRAS_SENHA_FORTE.every(r => r.testar(senha))
  if (atende) return null
  return `A senha precisa ter ${REGRAS_SENHA_FORTE.map(r => r.descricao).join(', ')}.`
}

// Único portão de entrada do body do cadastro público — a lista de campos
// devolvida em `data` é, por construção, a lista de campos que o cadastro
// aceita do cliente. tenant_id/plano_id/role/status/trial_*/public_key/slug/
// limites NUNCA são lidos daqui nem de nenhum outro lugar do body: são
// sempre resolvidos no servidor (ver cadastro() abaixo).
export function validarCadastroPublico(body: CadastroBody): { ok: true; data: DadosCadastroValidados } | { ok: false; erro: string } {
  const nome = body.nome?.trim()
  const empresa = body.empresa?.trim()
  const email = body.email?.trim().toLowerCase()
  const senha = body.senha

  if (!nome || !empresa || !email || !senha) {
    return { ok: false, erro: 'nome, empresa, email e senha são obrigatórios.' }
  }
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, erro: 'email inválido.' }
  }
  const motivoSenha = motivoSenhaFraca(senha)
  if (motivoSenha) {
    return { ok: false, erro: motivoSenha }
  }
  return { ok: true, data: { nome, empresa, email, senha } }
}

// Mesmo algoritmo de gerarSlugBase em campanhas.ts/tours.ts/jornadas.ts
// (duplicado de propósito — sem util compartilhado no projeto ainda, ver
// SALT_ROUNDS acima pelo mesmo raciocínio). Diferença: aqui o slug é do
// TENANT (globalmente único, ver slugUnico abaixo), não de um registro
// dentro de um tenant.
function gerarSlugBase(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

async function slugUnico(base: string): Promise<string> {
  let slug = base
  let contador = 1
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    contador += 1
    slug = `${base}-${contador}`
  }
  return slug
}

// Decisão pura das datas do trial — separada só pra poder ser testada sem
// depender de Date.now() (mesmo padrão de `agora` injetável já usado em
// tenantGuards.ts/widget.ts).
export function calcularTrialDatas(agora: Date, dias: number): { trial_inicio: Date; trial_fim: Date } {
  return { trial_inicio: agora, trial_fim: new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000) }
}

// Monta os dados de criação de Tenant/AdminUser a partir de valores JÁ
// resolvidos no servidor — plano/dias vêm de resolverPlanoTrial/
// resolverDuracaoTrialDias, slug de slugUnico, passwordHash já com bcrypt
// aplicado. role é sempre 'ADMIN' (nunca lido de lugar nenhum, nem
// parâmetro) — o único jeito de um cadastro público virar SUPER_ADMIN seria
// alguém reescrever esta função. status é sempre 'TRIAL' pelo mesmo
// raciocínio. plano_pendente_id nunca é setado aqui (permanece null, padrão
// do schema) — este fluxo nunca envolve conversão/pagamento.
export function montarDadosCadastroPublico(params: {
  dados: DadosCadastroValidados
  slug: string
  planoTrialId: string
  trialDias: number
  passwordHash: string
  agora?: Date
}): {
  tenantData: Prisma.TenantUncheckedCreateInput
  adminData: { nome: string; email: string; password_hash: string; role: AdminRole }
} {
  const { trial_inicio, trial_fim } = calcularTrialDatas(params.agora ?? new Date(), params.trialDias)
  return {
    tenantData: {
      nome: params.dados.empresa,
      slug: params.slug,
      plano_id: params.planoTrialId,
      status: TenantStatus.TRIAL,
      trial_inicio,
      trial_fim,
    },
    adminData: {
      nome: params.dados.nome,
      email: params.dados.email,
      password_hash: params.passwordHash,
      role: AdminRole.ADMIN,
    },
  }
}

// GET público — só o mínimo pra montar a UX de /cadastro (dias de trial +
// limites), nunca id do plano, preço ou qualquer campo administrativo (ver
// regra "não expor id/preço/Asaas/config administrativa" da tarefa).
export async function cadastroConfig(req: Request, res: Response) {
  try {
    const planosTrial = await prisma.plano.findMany({
      where: { eh_plano_trial: true },
      select: { id: true, trial_dias: true, limite_campanhas_ativas: true, limite_tours_ativos: true, limite_jornadas_ativas: true },
    })
    const resolucaoPlano = resolverPlanoTrial(planosTrial)
    if (!resolucaoPlano.ok) {
      console.error('Cadastro público indisponível (config):', resolucaoPlano.motivo)
      res.status(503).json({ erro: 'Cadastro indisponível no momento. Tente novamente mais tarde.' })
      return
    }
    const resolucaoDias = resolverDuracaoTrialDias(resolucaoPlano.plano.trial_dias)
    if (!resolucaoDias.ok) {
      console.error('Cadastro público indisponível (config):', resolucaoDias.motivo)
      res.status(503).json({ erro: 'Cadastro indisponível no momento. Tente novamente mais tarde.' })
      return
    }
    const plano = planosTrial[0]!
    res.json({
      dias: resolucaoDias.dias,
      limite_campanhas_ativas: plano.limite_campanhas_ativas,
      limite_tours_ativos: plano.limite_tours_ativos,
      limite_jornadas_ativas: plano.limite_jornadas_ativas,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao carregar configuração de cadastro.' })
  }
}

// POST público — cria Tenant+AdminUser(ADMIN) numa única transação (nenhum
// dos dois fica órfão se o outro falhar) e já autentica (mesmo cookie de
// sessão do login(), ver assinatura logo abaixo) — o cliente entra
// diretamente no produto, sem precisar logar de novo.
export async function cadastro(req: Request, res: Response) {
  try {
    const validacao = validarCadastroPublico(req.body as CadastroBody)
    if (!validacao.ok) {
      res.status(400).json({ erro: validacao.erro })
      return
    }
    const { data: dados } = validacao

    const planosTrial = await prisma.plano.findMany({
      where: { eh_plano_trial: true },
      select: {
        id: true, trial_dias: true,
        limite_campanhas_ativas: true, limite_tours_ativos: true, limite_jornadas_ativas: true,
      },
    })
    const resolucaoPlano = resolverPlanoTrial(planosTrial)
    if (!resolucaoPlano.ok) {
      console.error('Cadastro público indisponível (cadastro):', resolucaoPlano.motivo)
      res.status(503).json({ erro: 'Cadastro indisponível no momento. Tente novamente mais tarde.' })
      return
    }
    const resolucaoDias = resolverDuracaoTrialDias(resolucaoPlano.plano.trial_dias)
    if (!resolucaoDias.ok) {
      console.error('Cadastro público indisponível (cadastro):', resolucaoDias.motivo)
      res.status(503).json({ erro: 'Cadastro indisponível no momento. Tente novamente mais tarde.' })
      return
    }
    // resolverPlanoTrial já garante exatamente 1 item em planosTrial quando
    // ok:true — reaproveita o registro completo (com os limites, que
    // resolucaoPlano.plano não carrega, ver Pick em ResolucaoPlanoTrial) só
    // pro e-mail de boas-vindas abaixo.
    const planoTrialCompleto = planosTrial[0]!

    // Checagem antecipada só pra devolver a mensagem certa rápido — a
    // constraint @unique em AdminUser.email (ver schema.prisma) é quem
    // realmente protege contra corrida (dois cadastros simultâneos com o
    // mesmo e-mail), pega no catch de P2002 abaixo.
    const emailExistente = await prisma.adminUser.findUnique({ where: { email: dados.email } })
    if (emailExistente) {
      res.status(409).json({ erro: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' })
      return
    }

    const slug = await slugUnico(gerarSlugBase(dados.empresa) || 'conta')
    const password_hash = await bcrypt.hash(dados.senha, SALT_ROUNDS)
    const { tenantData, adminData } = montarDadosCadastroPublico({
      dados,
      slug,
      planoTrialId: resolucaoPlano.plano.id,
      trialDias: resolucaoDias.dias,
      passwordHash: password_hash,
    })

    let criado
    try {
      criado = await prisma.$transaction(async tx => {
        const tenant = await tx.tenant.create({ data: tenantData })
        return tx.adminUser.create({
          data: { ...adminData, tenant_id: tenant.id },
          include: { tenant: { include: { plano: true } } },
        })
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const alvo = ((err.meta?.target as string[] | undefined) ?? []).join(',')
        if (alvo.includes('email')) {
          res.status(409).json({ erro: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' })
          return
        }
        // Colisão de slug (corrida rara entre dois cadastros com o mesmo
        // nome de empresa no mesmo instante) — pede pra tentar de novo em
        // vez de expor detalhe técnico da constraint.
        res.status(409).json({ erro: 'Não foi possível concluir o cadastro. Tente novamente.' })
        return
      }
      throw err
    }

    const token = signSessionToken({ sub: criado.id, email: criado.email, role: criado.role })
    res.cookie(ADMIN_SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE })

    // Best-effort: mesmo padrão de ultimo_login_em em login() acima — nunca
    // faz o cadastro (que já teve sucesso) esperar ou falhar por causa do
    // e-mail; a resposta abaixo (res.status(201)) nunca informa se o e-mail
    // foi enviado ou não, o frontend não tem como saber. Sem provider
    // configurado (ver lib/email/provider.ts), enviarBoasVindas só loga e
    // segue, nunca finge que enviou. idempotencyKey é estável por usuário
    // (nunca por tentativa) — um retry deste envio (ex.: timeout na
    // resposta do provider) nunca duplica o e-mail; nenhum banco/fila novo
    // precisou ser criado pra isso, o provider (Resend) já garante a
    // deduplicação do lado dele a partir da mesma chave.
    emailService
      .enviarBoasVindas(
        criado.email,
        {
          nomeResponsavel: criado.nome,
          diasTrial: resolucaoDias.dias,
          limiteCampanhas: planoTrialCompleto.limite_campanhas_ativas,
          limiteTours: planoTrialCompleto.limite_tours_ativos,
          limiteJornadas: planoTrialCompleto.limite_jornadas_ativas,
          urlProduto: process.env.APP_URL || 'http://localhost:5173',
        },
        { idempotencyKey: `boas-vindas:${criado.id}` }
      )
      .catch(err => console.error(`Erro ao enviar e-mail de boas-vindas (usuário ${criado.id}):`, err))

    // Cadastro cria o AdminUser agora mesmo, na mesma transação acima —
    // nunca existe nenhuma linha de AdminUserPermissao pra ele ainda
    // (permissoes_personalizadas já nasce false, valor default da coluna).
    // Sem query adicional: não há nada pra buscar.
    res.status(201).json(usuarioPublico({ ...criado, permissoes: [] }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao concluir o cadastro.' })
  }
}

// ─── "Esqueci minha senha" — recuperação pública por e-mail ────────────────
// Segundo par de rotas públicas deste arquivo (o primeiro é o cadastro
// acima). Resposta de esqueciSenha é SEMPRE a mesma, exista ou não conta com
// aquele e-mail — nunca dá pra usar esta rota pra descobrir se um e-mail
// está cadastrado (regra explícita da tarefa). token bruto só existe em
// memória neste request e no e-mail enviado; o banco nunca guarda mais que
// o hash (ver lib/passwordReset.ts).

interface EsqueciSenhaBody {
  email?: string
}

const MENSAGEM_ESQUECI_SENHA = 'Se existir uma conta com esse e-mail, enviaremos as instruções para redefinir sua senha.'

export async function esqueciSenha(req: Request, res: Response) {
  try {
    const { email } = req.body as EsqueciSenhaBody
    if (!email?.trim()) {
      res.status(400).json({ erro: 'email é obrigatório.' })
      return
    }
    const emailNormalizado = email.trim().toLowerCase()

    const usuario = await prisma.adminUser.findUnique({ where: { email: emailNormalizado } })
    // ativo=false segue o mesmo raciocínio de login(): uma conta desativada
    // não deveria conseguir nem iniciar uma redefinição de senha.
    if (usuario && usuario.ativo) {
      const agora = new Date()
      const token = gerarTokenRedefinicaoSenha()

      // Invalidar tokens anteriores e criar o novo são dois statements —
      // sob duas requisições concorrentes pro MESMO usuário, cada uma podia
      // invalidar o estado "antes das duas" e criar seu próprio token sem
      // nunca ver o token da outra (nenhuma das duas escreveu ainda quando
      // a outra leu), deixando dois tokens ativos ao mesmo tempo. Um lock
      // consultivo por usuário (pg_advisory_xact_lock) serializa pedidos
      // concorrentes do MESMO admin_user_id (nunca bloqueia usuários
      // diferentes — hashtext() é específico por linha) — a segunda
      // requisição só entra na transação depois que a primeira já
      // commitou invalidação+criação, então enxerga o token da primeira e
      // o invalida corretamente. Liberado sozinho no fim da transação
      // (commit ou rollback), sem unlock manual.
      const tokenRow = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${usuario.id}))`

        await tx.passwordResetToken.updateMany({
          where: { admin_user_id: usuario.id, ...condicaoTokenAtivo(agora) },
          data: { used_at: agora },
        })

        return tx.passwordResetToken.create({
          data: {
            admin_user_id: usuario.id,
            token_hash: hashTokenRedefinicaoSenha(token),
            expires_at: calcularExpiracaoRedefinicaoSenha(agora),
          },
        })
      })

      const urlBase = process.env.APP_URL || 'http://localhost:5173'
      const urlRedefinicao = `${urlBase}/redefinir-senha?token=${token}`

      // Best-effort, mesmo padrão de enviarBoasVindas em cadastro() — nunca
      // faz esta resposta esperar ou variar por causa do e-mail.
      // idempotencyKey por token (nunca por usuário, diferente de boas-
      // vindas): cada pedido de redefinição é um evento distinto, um
      // usuário pode legitimamente pedir várias vezes.
      emailService
        .enviarRedefinicaoSenha(
          usuario.email,
          { nomeResponsavel: usuario.nome, urlRedefinicao, validadeMinutos: REDEFINICAO_SENHA_VALIDADE_MINUTOS },
          { idempotencyKey: `redefinicao-senha:${tokenRow.id}` }
        )
        .catch(err => console.error(`Erro ao enviar e-mail de redefinição de senha (usuário ${usuario.id}):`, err))
    }

    res.json({ mensagem: MENSAGEM_ESQUECI_SENHA })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao processar solicitação.' })
  }
}

interface RedefinirSenhaBody {
  token?: string
  nova_senha?: string
}

// Sentinela só pra abortar a transação de forma controlada quando o token
// não é consumível (ver redefinirSenha abaixo) — nunca escapa da função,
// sempre capturada logo depois do $transaction.
class TokenRedefinicaoInvalido extends Error {}

// Existente + não expirado + não usado, tudo numa ÚNICA operação atômica
// (UPDATE condicional, não um SELECT seguido de UPDATE separado) — a
// mensagem de erro nunca diferencia qual das três falhou, pelo mesmo motivo
// de esqueciSenha nunca revelar se um e-mail existe: um link antigo/reusado
// não deveria virar um jeito de descobrir detalhe nenhum sobre o estado da
// conta.
//
// Por que atômico: ler o token, decidir "válido" em código e só then
// escrever used_at (como este endpoint fazia antes) tem uma janela entre a
// leitura e a escrita — duas requisições concorrentes com o MESMO token
// liam "ainda válido" as duas, e as duas conseguiam completar a troca de
// senha, o token efetivamente sendo usado duas vezes. Fazendo a checagem
// SER o próprio UPDATE (WHERE token_hash + condicaoTokenAtivo), o Postgres
// trata isso com o lock de linha normal de um UPDATE: a segunda transação
// concorrente bloqueia até a primeira commitar, então reavalia o WHERE
// contra o estado já commitado (used_at já não é mais null) e não casa
// nenhuma linha — count fica 0 pra ela, nunca as duas "ganham".
export async function redefinirSenha(req: Request, res: Response) {
  try {
    const { token, nova_senha } = req.body as RedefinirSenhaBody
    if (!token?.trim() || !nova_senha) {
      res.status(400).json({ erro: 'token e nova_senha são obrigatórios.' })
      return
    }
    const motivoSenha = motivoSenhaFraca(nova_senha)
    if (motivoSenha) {
      res.status(400).json({ erro: motivoSenha })
      return
    }

    const tokenHash = hashTokenRedefinicaoSenha(token.trim())
    const password_hash = await bcrypt.hash(nova_senha, SALT_ROUNDS)
    const agora = new Date()

    try {
      await prisma.$transaction(async tx => {
        // Consumo atômico — token_hash é @unique, então isto afeta no
        // máximo 1 linha. count===0 cobre as 3 formas de "não consumível"
        // de uma vez: token_hash não existe, já usado, ou expirado.
        const consumo = await tx.passwordResetToken.updateMany({
          where: { token_hash: tokenHash, ...condicaoTokenAtivo(agora) },
          data: { used_at: agora },
        })
        if (consumo.count === 0) throw new TokenRedefinicaoInvalido()

        const tokenRow = await tx.passwordResetToken.findUniqueOrThrow({ where: { token_hash: tokenHash } })

        await tx.adminUser.update({
          where: { id: tokenRow.admin_user_id },
          data: { password_hash, senha_temporaria: false, senha_alterada_em: agora },
        })
        // Defesa em profundidade contra qualquer outro token que ainda
        // esteja ativo pro mesmo usuário (ex.: criado antes da correção de
        // concorrência de esqueciSenha, ou por uma corrida que o lock
        // consultivo de lá não cobriu por algum motivo) — nunca é a
        // proteção principal contra reuso DESTE token, essa já é o
        // updateMany atômico acima.
        await tx.passwordResetToken.updateMany({
          where: { admin_user_id: tokenRow.admin_user_id, ...condicaoTokenAtivo(agora) },
          data: { used_at: agora },
        })
      })
    } catch (err) {
      if (err instanceof TokenRedefinicaoInvalido) {
        res.status(400).json({ erro: 'Link inválido ou expirado. Solicite uma nova redefinição de senha.' })
        return
      }
      throw err
    }

    // Nunca autentica automaticamente (regra explícita da tarefa) — nenhum
    // cookie de sessão setado aqui, diferente de login()/cadastro()/
    // trocarSenha(). Sessões antigas (de antes desta troca) já caem em
    // sessaoInvalidadaPorTrocaSenha (requireAdminAuth.ts) na próxima
    // requisição, graças ao senha_alterada_em atualizado acima.
    res.json({ mensagem: 'Senha redefinida com sucesso. Faça login com sua nova senha.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao redefinir senha.' })
  }
}
