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

function validarCamposPlano(body: PlanoBody): { ok: true; data: Prisma.PlanoUncheckedCreateInput } | { ok: false; erro: string } {
  const nome = body.nome?.trim()
  const slug = body.slug?.trim().toLowerCase()
  if (!nome || !slug) return { ok: false, erro: 'nome e slug são obrigatórios.' }

  const preco = parsePreco(body.preco_mensal)
  if (!preco.ok) return { ok: false, erro: 'preco_mensal inválido.' }

  const valorAssinaturaAsaas = parsePreco(body.asaas_subscription_value)
  if (!valorAssinaturaAsaas.ok) return { ok: false, erro: 'asaas_subscription_value inválido.' }

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
// hoje nenhum cliente use um deles ainda) e nunca um plano com pelo menos um
// Tenant vinculado (evita derrubar tenant.plano_id sem querer — a FK é ON
// DELETE SET NULL, então tecnicamente não quebraria nada no banco, mas
// apagaria silenciosamente a informação comercial "qual plano esse cliente
// contratou"). Pra todos esses casos, a UI orienta inativar em vez de
// remover (ver Planos.tsx) — só plano customizado/de teste sem vínculo é
// removível de verdade.
export async function remover(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.plano.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
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

    await prisma.plano.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover plano.' })
  }
}
