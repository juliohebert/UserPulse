import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { motivoBloqueioEscrita } from '../lib/tenantGuards'
import { normalizarDominio } from '../lib/dominio'

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function normalizarTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

// Exportada pra ser testada diretamente em sistemas.test.ts — mesma
// normalização compartilhada de campanhas.ts/tours.ts/jornadas.ts (ver
// normalizarDominio em lib/dominio.ts).
export function normalizarDominios(v: unknown): string[] {
  const lista = Array.isArray(v) ? (v as unknown[]).map(String) : []
  return lista.map(normalizarDominio).filter(Boolean)
}

function normalizarSlug(valor: string): string {
  return valor.trim().toLowerCase()
}

function erroUnicidade(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null
  const target = Array.isArray(err.meta?.target) ? err.meta.target : []
  if (target.includes('slug')) return 'Já existe um sistema com este slug.'
  if (target.includes('identificador')) return 'Já existe um sistema com este identificador.'
  return 'Já existe um sistema com estes dados.'
}

export async function listar(req: Request, res: Response) {
  try {
    const ativo = req.query.ativo as string | undefined
    const busca = req.query.busca as string | undefined
    const where: Prisma.SistemaWhereInput = { tenant_id: req.adminUser!.tenant_id }
    if (ativo === 'true') where.ativo = true
    if (ativo === 'false') where.ativo = false
    if (busca?.trim()) {
      const term = busca.trim()
      where.OR = [
        { nome: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { identificador: { contains: term, mode: 'insensitive' } },
        { descricao: { contains: term, mode: 'insensitive' } },
      ]
    }

    const sistemas = await prisma.sistema.findMany({
      where,
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      include: { _count: { select: { telas: true, aparencias: true } } },
    })
    res.json(sistemas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar sistemas.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const nome = normalizarTexto((req.body as { nome?: unknown }).nome)
    const slugBruto = normalizarTexto((req.body as { slug?: unknown }).slug)
    const identificador = normalizarTexto((req.body as { identificador?: unknown }).identificador)
    const descricao = normalizarTexto((req.body as { descricao?: unknown }).descricao)
    const urlBase = normalizarTexto((req.body as { url_base?: unknown }).url_base)
    const ativo = (req.body as { ativo?: unknown }).ativo
    const padraoSolicitado = (req.body as { padrao?: unknown }).padrao === true
    const dominios = normalizarDominios((req.body as { dominios?: unknown }).dominios)

    if (!nome || !slugBruto || !identificador) {
      res.status(400).json({ erro: 'nome, slug e identificador são obrigatórios.' })
      return
    }

    const slug = normalizarSlug(slugBruto)
    if (!SLUG_REGEX.test(slug)) {
      res.status(400).json({ erro: 'Slug inválido. Use letras minúsculas, números e hífens.' })
      return
    }

    const totalSistemas = await prisma.sistema.count({ where: { tenant_id: req.adminUser!.tenant_id } })
    const padrao = totalSistemas === 0 || padraoSolicitado

    const [criado] = await prisma.$transaction([
      prisma.sistema.create({
        data: {
          tenant_id: req.adminUser!.tenant_id,
          nome,
          slug,
          identificador,
          descricao,
          url_base: urlBase,
          ativo: ativo !== false,
          padrao,
          dominios,
        },
        include: { _count: { select: { telas: true, aparencias: true } } },
      }),
      ...(padrao ? [prisma.sistema.updateMany({ where: { tenant_id: req.adminUser!.tenant_id, slug: { not: slug } }, data: { padrao: false } })] : []),
    ])
    res.status(201).json(criado)
  } catch (err) {
    console.error(err)
    const erro = erroUnicidade(err)
    if (erro) { res.status(409).json({ erro }); return }
    res.status(500).json({ erro: 'Erro ao criar sistema.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const id = req.params.id as string
    const existente = await prisma.sistema.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) { res.status(404).json({ erro: 'Sistema não encontrado.' }); return }

    const nome = normalizarTexto((req.body as { nome?: unknown }).nome)
    const slugBruto = normalizarTexto((req.body as { slug?: unknown }).slug)
    const identificador = normalizarTexto((req.body as { identificador?: unknown }).identificador)
    const descricao = normalizarTexto((req.body as { descricao?: unknown }).descricao)
    const urlBase = normalizarTexto((req.body as { url_base?: unknown }).url_base)
    const ativo = (req.body as { ativo?: unknown }).ativo
    const padrao = (req.body as { padrao?: unknown }).padrao === true
    const dominios = normalizarDominios((req.body as { dominios?: unknown }).dominios)

    if (!nome || !slugBruto || !identificador) {
      res.status(400).json({ erro: 'nome, slug e identificador são obrigatórios.' })
      return
    }

    const slug = normalizarSlug(slugBruto)
    if (!SLUG_REGEX.test(slug)) {
      res.status(400).json({ erro: 'Slug inválido. Use letras minúsculas, números e hífens.' })
      return
    }

    if (existente.padrao && (!padrao || ativo === false)) {
      res.status(400).json({ erro: 'Sistema padrão não pode ser removido ou desmarcado. Defina outro sistema como padrão antes.' })
      return
    }

    const atualizarSistema = prisma.sistema.update({
      where: { id },
      data: { nome, slug, identificador, descricao, url_base: urlBase, ativo: Boolean(ativo), padrao, dominios },
      include: { _count: { select: { telas: true, aparencias: true } } },
    })

    const operacoes = [
      atualizarSistema,
      prisma.telaCatalogo.updateMany({
        where: { tenant_id: req.adminUser!.tenant_id, sistema_id: id },
        data: { sistema: identificador },
      }),
      prisma.aparenciaWidget.updateMany({
        where: { tenant_id: req.adminUser!.tenant_id, sistema_id: id },
        data: { sistema: identificador },
      }),
      ...(padrao ? [prisma.sistema.updateMany({ where: { tenant_id: req.adminUser!.tenant_id, id: { not: id } }, data: { padrao: false } })] : []),
    ]

    const [atualizado] = await prisma.$transaction(operacoes)
    res.json(atualizado)
  } catch (err) {
    console.error(err)
    const erro = erroUnicidade(err)
    if (erro) { res.status(409).json({ erro }); return }
    res.status(500).json({ erro: 'Erro ao atualizar sistema.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const id = req.params.id as string
    const existente = await prisma.sistema.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) { res.status(404).json({ erro: 'Sistema não encontrado.' }); return }
    if (existente.padrao) {
      res.status(400).json({ erro: 'Sistema padrão não pode ser removido. Defina outro sistema como padrão antes.' })
      return
    }

    await prisma.$transaction(async tx => {
      await tx.sistema.update({ where: { id }, data: { ativo: false, padrao: false } })
      const aindaTemPadrao = await tx.sistema.count({ where: { tenant_id: req.adminUser!.tenant_id, padrao: true } })
      if (aindaTemPadrao > 0) return
      const proximo = await tx.sistema.findFirst({ where: { tenant_id: req.adminUser!.tenant_id, ativo: true }, orderBy: [{ nome: 'asc' }, { criado_em: 'asc' }] })
      if (proximo) await tx.sistema.update({ where: { id: proximo.id }, data: { padrao: true } })
    })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover sistema.' })
  }
}
