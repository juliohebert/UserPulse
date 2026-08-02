import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { motivoBloqueioEscrita } from '../lib/tenantGuards'

export async function listar(req: Request, res: Response) {
  try {
    const ativo = req.query.ativo as string | undefined
    const busca = req.query.busca as string | undefined

    const where: Prisma.TelaCatalogoWhereInput = { tenant_id: req.adminUser!.tenant_id }
    if (ativo === 'true') where.ativo = true
    if (ativo === 'false') where.ativo = false
    if (busca?.trim()) {
      const term = busca.trim()
      where.OR = [
        { nome: { contains: term, mode: 'insensitive' } },
        { sistema: { contains: term, mode: 'insensitive' } },
        { categoria: { contains: term, mode: 'insensitive' } },
        { url_contem: { contains: term, mode: 'insensitive' } },
      ]
    }
    const telas = await prisma.telaCatalogo.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    })
    res.json(telas)
  } catch {
    res.status(500).json({ erro: 'Erro ao listar catálogo.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const { nome, sistema, categoria, modo_identificacao, tela, url_contem, data_cy, ativo } = req.body as {
      nome?: string; sistema?: string; categoria?: string; modo_identificacao?: string
      tela?: string; url_contem?: string; data_cy?: string; ativo?: boolean
    }
    if (!nome?.trim() || !sistema?.trim() || !categoria?.trim() || !modo_identificacao?.trim()) {
      res.status(400).json({ erro: 'nome, sistema, categoria e modo_identificacao são obrigatórios.' })
      return
    }
    const nova = await prisma.telaCatalogo.create({
      data: {
        tenant_id: req.adminUser!.tenant_id,
        nome: nome.trim(),
        sistema: sistema.trim(),
        categoria: categoria.trim(),
        modo_identificacao: modo_identificacao.trim(),
        tela: tela?.trim() || null,
        url_contem: url_contem?.trim() || null,
        data_cy: data_cy?.trim() || null,
        ativo: ativo !== false,
      },
    })
    res.status(201).json(nova)
  } catch {
    res.status(500).json({ erro: 'Erro ao criar tela.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const id = req.params.id as string
    const { nome, sistema, categoria, modo_identificacao, tela, url_contem, data_cy, ativo } = req.body as {
      nome?: string; sistema?: string; categoria?: string; modo_identificacao?: string
      tela?: string; url_contem?: string; data_cy?: string; ativo?: boolean
    }
    if (!nome?.trim() || !sistema?.trim() || !categoria?.trim() || !modo_identificacao?.trim()) {
      res.status(400).json({ erro: 'nome, sistema, categoria e modo_identificacao são obrigatórios.' })
      return
    }
    const existente = await prisma.telaCatalogo.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) { res.status(404).json({ erro: 'Tela não encontrada.' }); return }
    const atualizada = await prisma.telaCatalogo.update({
      where: { id },
      data: {
        nome: nome.trim(),
        sistema: sistema.trim(),
        categoria: categoria.trim(),
        modo_identificacao: modo_identificacao.trim(),
        tela: tela?.trim() || null,
        url_contem: url_contem?.trim() || null,
        data_cy: data_cy?.trim() || null,
        ativo: Boolean(ativo),
      },
    })
    res.json(atualizada)
  } catch {
    res.status(500).json({ erro: 'Erro ao atualizar tela.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const id = req.params.id as string
    const existente = await prisma.telaCatalogo.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) { res.status(404).json({ erro: 'Tela não encontrada.' }); return }
    await prisma.telaCatalogo.update({ where: { id }, data: { ativo: false } })
    res.status(204).send()
  } catch {
    res.status(500).json({ erro: 'Erro ao remover tela.' })
  }
}
