import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

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
