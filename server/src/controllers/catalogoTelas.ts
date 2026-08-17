import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { motivoBloqueioEscrita } from '../lib/tenantGuards'

async function resolverSistema(tenantId: string, sistemaId?: string, sistemaTexto?: string) {
  if (sistemaId?.trim()) {
    return prisma.sistema.findFirst({ where: { id: sistemaId.trim(), tenant_id: tenantId } })
  }
  if (sistemaTexto?.trim()) {
    return prisma.sistema.findFirst({ where: { tenant_id: tenantId, identificador: sistemaTexto.trim() } })
  }
  return null
}

function urlConterValida(modoIdentificacao: string, urlConter?: string | null): boolean {
  if (modoIdentificacao !== 'url_contem' || !urlConter) return true
  return urlConter.startsWith('/') && !/^https?:\/\//i.test(urlConter) && !/[\s,]/.test(urlConter)
}

function normalizarUrlConter(valor?: string): string | null {
  const limpo = valor?.trim()
  if (!limpo) return null
  if (!/^https?:\/\//i.test(limpo)) return limpo
  try {
    const url = new URL(limpo)
    return `${url.pathname}${url.search}${url.hash}` || '/'
  } catch {
    return limpo
  }
}

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
        { sistemaConfig: { nome: { contains: term, mode: 'insensitive' } } },
        { categoria: { contains: term, mode: 'insensitive' } },
        { url_contem: { contains: term, mode: 'insensitive' } },
      ]
    }
    const telas = await prisma.telaCatalogo.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      include: { sistemaConfig: true },
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

    const { nome, sistema_id, sistema, categoria, modo_identificacao, tela, url_contem, data_cy, ativo } = req.body as {
      nome?: string; sistema_id?: string; sistema?: string; categoria?: string; modo_identificacao?: string
      tela?: string; url_contem?: string; data_cy?: string; ativo?: boolean
    }
    const sistemaConfig = await resolverSistema(req.adminUser!.tenant_id, sistema_id, sistema)
    if (!nome?.trim() || !sistemaConfig || !categoria?.trim() || !modo_identificacao?.trim()) {
      res.status(400).json({ erro: 'nome, sistema_id, categoria e modo_identificacao são obrigatórios.' })
      return
    }
    const urlConter = normalizarUrlConter(url_contem)
    if (!urlConterValida(modo_identificacao.trim(), urlConter)) {
      res.status(400).json({ erro: 'Caminho da URL deve ser um único caminho relativo, como /app/faturamento.' })
      return
    }
    const nova = await prisma.telaCatalogo.create({
      data: {
        tenant_id: req.adminUser!.tenant_id,
        sistema_id: sistemaConfig.id,
        nome: nome.trim(),
        sistema: sistemaConfig.identificador,
        categoria: categoria.trim(),
        modo_identificacao: modo_identificacao.trim(),
        tela: tela?.trim() || null,
        url_contem: urlConter,
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
    const { nome, sistema_id, sistema, categoria, modo_identificacao, tela, url_contem, data_cy, ativo } = req.body as {
      nome?: string; sistema_id?: string; sistema?: string; categoria?: string; modo_identificacao?: string
      tela?: string; url_contem?: string; data_cy?: string; ativo?: boolean
    }
    const sistemaConfig = await resolverSistema(req.adminUser!.tenant_id, sistema_id, sistema)
    if (!nome?.trim() || !sistemaConfig || !categoria?.trim() || !modo_identificacao?.trim()) {
      res.status(400).json({ erro: 'nome, sistema_id, categoria e modo_identificacao são obrigatórios.' })
      return
    }
    const urlConter = normalizarUrlConter(url_contem)
    if (!urlConterValida(modo_identificacao.trim(), urlConter)) {
      res.status(400).json({ erro: 'Caminho da URL deve ser um único caminho relativo, como /app/faturamento.' })
      return
    }
    const existente = await prisma.telaCatalogo.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) { res.status(404).json({ erro: 'Tela não encontrada.' }); return }
    const atualizada = await prisma.telaCatalogo.update({
      where: { id },
      data: {
        nome: nome.trim(),
        sistema_id: sistemaConfig.id,
        sistema: sistemaConfig.identificador,
        categoria: categoria.trim(),
        modo_identificacao: modo_identificacao.trim(),
        tela: tela?.trim() || null,
        url_contem: urlConter,
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
