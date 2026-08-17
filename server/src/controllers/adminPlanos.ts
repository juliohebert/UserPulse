import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

// Planos comerciais padrão do UserPulse (ver prisma/seedPlanos.ts) — nunca
// removíveis, mesmo sem nenhum cliente vinculado (só editáveis/inativáveis,
// ver remover() abaixo). Mantido em sincronia manual com PLANOS_OFICIAIS em
// web/src/pages/admin/Planos.tsx — lá é só UX (esconder o botão Remover);
// aqui é a fonte de verdade que de fato bloqueia a exclusão.
const SLUGS_PLANOS_OFICIAIS = new Set(['teste-gratis', 'starter', 'growth', 'scale', 'enterprise'])

interface PlanoBody {
  nome?: string
  slug?: string
  descricao?: string | null
  preco_mensal?: number | string | null
  limite_campanhas_ativas?: number | null
  limite_tours_ativos?: number | null
  limite_eventos_mes?: number | null
  limite_usuarios_admin?: number | null
  permite_tours?: boolean
  permite_jornadas?: boolean
  permite_white_label?: boolean
  ativo?: boolean
  // Nunca exposto como checkbox no formulário de Planos.tsx (só o plano
  // "Interno (Quark)" usa isso, gerido pelo seed) — mas precisa fazer
  // round-trip aqui pra um PUT de edição normal (ex.: corrigir a descrição
  // do plano interno) não resetar o flag pra false por omissão.
  interno?: boolean
  // Hierarquia explícita entre planos comerciais (ver schema.prisma) —
  // nunca inferida por preço. Obrigatório quando `interno` for false;
  // ignorado (sempre gravado null) quando `interno` for true.
  nivel?: number | string | null
  // Config da assinatura Asaas correspondente (ver criarAssinaturaAsaas em
  // services/asaasClient.ts) — todos opcionais, fundação/sandbox.
  asaas_external_reference?: string | null
  asaas_subscription_value?: number | string | null
  asaas_billing_cycle?: string | null
}

// Limite nulo = sem limite (mesmo raciocínio documentado no schema.prisma) —
// qualquer valor vazio/ausente vira null, nunca 0 por engano.
function parseLimite(valor: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (valor == null || valor === '') return { ok: true, valor: null }
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0) return { ok: false }
  return { ok: true, valor: n }
}

function parsePreco(valor: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (valor == null || valor === '') return { ok: true, valor: null }
  const n = Number(valor)
  if (Number.isNaN(n) || n < 0) return { ok: false }
  return { ok: true, valor: n }
}

// Mesma convenção de parseLimite (vazio/ausente => null) — a diferença de
// "obrigatório pra plano comercial" não mora aqui (aqui só valida FORMATO),
// mora em validarCamposPlano logo abaixo, que já sabe se `interno` é true.
function parseNivel(valor: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (valor == null || valor === '') return { ok: true, valor: null }
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0) return { ok: false }
  return { ok: true, valor: n }
}

// Exportada só pra teste direto (função pura, sem I/O) — nunca importada
// fora deste arquivo/testes, mesmo padrão de validarECalcularUpgrade em
// billing.ts.
export function validarCamposPlano(body: PlanoBody): { ok: true; data: Prisma.PlanoUncheckedCreateInput } | { ok: false; erro: string } {
  const nome = body.nome?.trim()
  const slug = body.slug?.trim().toLowerCase()
  if (!nome || !slug) return { ok: false, erro: 'nome e slug são obrigatórios.' }

  const preco = parsePreco(body.preco_mensal)
  if (!preco.ok) return { ok: false, erro: 'preco_mensal inválido.' }

  const valorAssinaturaAsaas = parsePreco(body.asaas_subscription_value)
  if (!valorAssinaturaAsaas.ok) return { ok: false, erro: 'asaas_subscription_value inválido.' }

  const interno = body.interno === true
  const nivel = parseNivel(body.nivel)
  if (!nivel.ok) return { ok: false, erro: 'nivel inválido — deve ser um número inteiro maior ou igual a 0.' }
  if (!interno && nivel.valor === null) {
    return { ok: false, erro: 'nivel é obrigatório para planos comerciais (não internos).' }
  }
  // Plano interno fica de propósito FORA da hierarquia comercial (nunca é
  // upgrade/downgrade de nada, ver validarPlanoParaAssinaturaSelfService) —
  // nivel é sempre gravado null pra ele, mesmo se algo vier no body (mesmo
  // raciocínio defensivo de outros campos que não fazem sentido pro
  // interno).
  const nivelFinal = interno ? null : nivel.valor

  const limites = {
    limite_campanhas_ativas: parseLimite(body.limite_campanhas_ativas),
    limite_tours_ativos: parseLimite(body.limite_tours_ativos),
    limite_eventos_mes: parseLimite(body.limite_eventos_mes),
    limite_usuarios_admin: parseLimite(body.limite_usuarios_admin),
  }
  for (const [campo, resultado] of Object.entries(limites)) {
    if (!resultado.ok) return { ok: false, erro: `${campo} inválido.` }
  }

  return {
    ok: true,
    data: {
      nome,
      slug,
      descricao: body.descricao?.trim() || null,
      preco_mensal: preco.valor,
      nivel: nivelFinal,
      limite_campanhas_ativas: limites.limite_campanhas_ativas.ok ? limites.limite_campanhas_ativas.valor : null,
      limite_tours_ativos: limites.limite_tours_ativos.ok ? limites.limite_tours_ativos.valor : null,
      limite_eventos_mes: limites.limite_eventos_mes.ok ? limites.limite_eventos_mes.valor : null,
      limite_usuarios_admin: limites.limite_usuarios_admin.ok ? limites.limite_usuarios_admin.valor : null,
      permite_tours: body.permite_tours !== false,
      permite_jornadas: body.permite_jornadas !== false,
      permite_white_label: body.permite_white_label === true,
      ativo: body.ativo !== false,
      interno: body.interno === true,
      asaas_external_reference: body.asaas_external_reference?.trim() || null,
      asaas_subscription_value: valorAssinaturaAsaas.valor,
      asaas_billing_cycle: body.asaas_billing_cycle?.trim().toUpperCase() || null,
    },
  }
}

// Função pura (sem I/O) — o controller busca os candidatos (planos
// comerciais com o MESMO nivel, excluindo o próprio id em edição) e só
// aplica a decisão aqui, mesmo padrão do resto do projeto (ver CLAUDE.md,
// "pure exported functions"). "comercial" = interno false, mesmo recorte já
// usado em toda parte pra distinguir comercial de interno (remover() acima,
// Planos.tsx) — nunca há colisão com o plano interno porque ele nunca tem
// nivel (ver validarCamposPlano). candidatos normalmente tem 0 ou 1 item (a
// query do controller já filtra por nivel=X), mas a função aceita uma lista
// pra ficar testável sem depender de como o controller monta a query.
export function motivoNivelDuplicado(
  candidatos: { nome: string; nivel: number | null }[],
  nivel: number
): string | null {
  const conflito = candidatos.find(p => p.nivel === nivel)
  if (!conflito) return null
  return `Já existe um plano comercial ("${conflito.nome}") com nivel ${nivel}. Escolha um nivel diferente.`
}

async function validarNivelUnico(nivel: number | null, excluirId?: string): Promise<string | null> {
  if (nivel === null) return null
  const candidatos = await prisma.plano.findMany({
    where: { interno: false, nivel, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
    select: { nome: true, nivel: true },
  })
  return motivoNivelDuplicado(candidatos, nivel)
}

// Sem filtro de `ativo` de propósito — o super admin precisa ver planos
// inativos pra poder reativá-los, diferente das listagens operacionais
// (campanhas/tours) que só mostram o que está em uso.
export async function listar(_req: Request, res: Response) {
  try {
    const planos = await prisma.plano.findMany({ orderBy: { nome: 'asc' } })
    res.json(planos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar planos.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const validado = validarCamposPlano(req.body as PlanoBody)
    if (!validado.ok) { res.status(400).json({ erro: validado.erro }); return }

    const motivoNivel = await validarNivelUnico(validado.data.nivel ?? null)
    if (motivoNivel) { res.status(400).json({ erro: motivoNivel }); return }

    const criado = await prisma.plano.create({ data: validado.data })
    res.status(201).json(criado)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ erro: 'Slug já em uso.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar plano.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const validado = validarCamposPlano(req.body as PlanoBody)
    if (!validado.ok) { res.status(400).json({ erro: validado.erro }); return }

    const existente = await prisma.plano.findUnique({ where: { id } })
    if (!existente) { res.status(404).json({ erro: 'Plano não encontrado.' }); return }

    const motivoNivel = await validarNivelUnico(validado.data.nivel ?? null, id)
    if (motivoNivel) { res.status(400).json({ erro: motivoNivel }); return }

    const atualizado = await prisma.plano.update({ where: { id }, data: validado.data })
    res.json(atualizado)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ erro: 'Slug já em uso.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar plano.' })
  }
}

// Remoção de verdade (hard delete) — só quando é seguro: nunca o plano
// interno (Interno (Quark) é permanente, independente de estar vinculado a
// tenant ou não), nunca um dos 5 planos oficiais padrão (SLUGS_PLANOS_OFICIAIS
// — existem pra sempre estarem disponíveis pra venda/teste grátis, mesmo que
// hoje nenhum cliente use um deles ainda), nunca um plano com pelo menos um
// Tenant vinculado como plano ATUAL (evita derrubar tenant.plano_id sem
// querer — a FK é ON DELETE SET NULL, então tecnicamente não quebraria nada
// no banco, mas apagaria silenciosamente a informação comercial "qual
// plano esse cliente contratou") e nunca um plano referenciado como DESTINO
// de um downgrade agendado (correção pós-revisão — auditoria 8B, bloqueador:
// plano_downgrade_id também usa ON DELETE SET NULL; remover o plano nesse
// meio-tempo apagaria silenciosamente qual plano/valor foi de fato
// combinado com o Asaas — downgrade_valor_destino continuaria certo, mas
// plano_id sairia null na efetivação do scheduler), nem um plano PENDENTE
// de confirmação de pagamento (correção pós-revisão — hardening final 8B:
// plano_pendente_id, gravado em primeira contratação/upgrade ainda não
// confirmados, usa a mesma FK ON DELETE SET NULL; removê-lo quebraria a
// efetivação quando o webhook PAYMENT_CONFIRMED chegasse). Pra todos esses
// casos, a UI orienta inativar em vez de remover (ver Planos.tsx) — só
// plano customizado/de teste sem vínculo nenhum é removível de verdade.
export async function remover(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.plano.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true, tenants_downgrade: true, tenants_pendentes: true } } },
    })
    if (!existente) { res.status(404).json({ erro: 'Plano não encontrado.' }); return }

    if (existente.interno) {
      res.status(400).json({ erro: 'O plano interno não pode ser removido.' })
      return
    }
    if (SLUGS_PLANOS_OFICIAIS.has(existente.slug)) {
      res.status(400).json({
        erro: 'Este é um plano padrão do UserPulse e não pode ser removido. Inative o plano se não quiser oferecê-lo.',
      })
      return
    }
    if (existente._count.tenants > 0) {
      res.status(400).json({
        erro: 'Este plano está vinculado a clientes e não pode ser removido. Inative o plano para ocultá-lo de novas vendas.',
      })
      return
    }
    if (existente._count.tenants_downgrade > 0) {
      res.status(400).json({
        erro: 'Este plano é o destino de um downgrade agendado de pelo menos um cliente e não pode ser removido. Inative o plano para ocultá-lo de novas vendas.',
      })
      return
    }
    if (existente._count.tenants_pendentes > 0) {
      res.status(400).json({
        erro: 'Este plano possui contratação ou alteração de plano pendente de confirmação e não pode ser removido. Inative o plano para ocultá-lo de novas vendas.',
      })
      return
    }

    await prisma.plano.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover plano.' })
  }
}
