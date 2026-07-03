import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

const TIPOS_ETAPA = ['tour', 'campanha', 'link']

interface EtapaInput {
  titulo?: string
  descricao?: string
  tipo?: string
  tour_id?: string
  campanha_id?: string
  url?: string
  texto_cta?: string
  abrir_nova_aba?: boolean
  obrigatoria?: boolean
}

function gerarSlugBase(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

async function slugUnico(base: string, ignorarId?: string): Promise<string> {
  let slug = base
  let contador = 1
  while (true) {
    const existente = await prisma.jornada.findFirst({
      where: { slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    })
    if (!existente) return slug
    slug = `${base}-${contador++}`
  }
}

// Cada etapa deve ter exatamente uma referência de conteúdo, de acordo com o
// tipo: tour_id (tipo tour), campanha_id (tipo campanha) ou url (tipo link) —
// nunca mais de uma preenchida. Validado aqui na aplicação; não há constraint
// de banco garantindo essa exclusividade (decisão do modelo aprovado).
function validarEtapas(etapas: unknown): { erro: string | null; lista: EtapaInput[] } {
  if (etapas === undefined) return { erro: null, lista: [] }
  if (!Array.isArray(etapas)) {
    return { erro: 'etapas deve ser uma lista.', lista: [] }
  }
  for (const [i, e] of (etapas as EtapaInput[]).entries()) {
    const n = i + 1
    if (!e.titulo?.trim()) return { erro: `Etapa ${n}: título é obrigatório.`, lista: [] }
    if (!e.tipo || !TIPOS_ETAPA.includes(e.tipo)) {
      return { erro: `Etapa ${n}: tipo inválido. Use tour, campanha ou link.`, lista: [] }
    }
    const temTour = Boolean(e.tour_id?.trim())
    const temCampanha = Boolean(e.campanha_id?.trim())
    const temUrl = Boolean(e.url?.trim())

    if (e.tipo === 'tour') {
      if (!temTour) return { erro: `Etapa ${n}: tour_id é obrigatório para o tipo "tour".`, lista: [] }
      if (temCampanha || temUrl) return { erro: `Etapa ${n}: tipo "tour" não deve ter campanha_id/url preenchidos.`, lista: [] }
    } else if (e.tipo === 'campanha') {
      if (!temCampanha) return { erro: `Etapa ${n}: campanha_id é obrigatório para o tipo "campanha".`, lista: [] }
      if (temTour || temUrl) return { erro: `Etapa ${n}: tipo "campanha" não deve ter tour_id/url preenchidos.`, lista: [] }
    } else {
      // link
      if (!temUrl) return { erro: `Etapa ${n}: url é obrigatória para o tipo "link".`, lista: [] }
      if (temTour || temCampanha) return { erro: `Etapa ${n}: tipo "link" não deve ter tour_id/campanha_id preenchidos.`, lista: [] }
    }
  }
  return { erro: null, lista: etapas as EtapaInput[] }
}

function montarDadosEtapa(e: EtapaInput, ordem: number) {
  return {
    ordem,
    titulo: e.titulo!.trim(),
    descricao: e.descricao?.trim() || null,
    tipo: e.tipo!,
    tour_id: e.tipo === 'tour' ? e.tour_id!.trim() : null,
    campanha_id: e.tipo === 'campanha' ? e.campanha_id!.trim() : null,
    url: e.tipo === 'link' ? e.url!.trim() : null,
    texto_cta: e.tipo === 'link' ? (e.texto_cta?.trim() || 'Abrir') : null,
    abrir_nova_aba: e.tipo === 'link' ? (e.abrir_nova_aba !== undefined ? Boolean(e.abrir_nova_aba) : true) : true,
    obrigatoria: e.obrigatoria !== undefined ? Boolean(e.obrigatoria) : true,
  }
}

// Inclui só campos básicos do Tour/Campanha referenciado (id/titulo/slug/ativo)
// — o suficiente pro admin mostrar "aponta para: X" sem trazer o cadastro inteiro.
const INCLUDE_ETAPAS = {
  etapas: {
    orderBy: { ordem: 'asc' as const },
    include: {
      tour: { select: { id: true, titulo: true, slug: true, ativo: true } },
      campanha: { select: { id: true, titulo: true, slug: true, ativo: true } },
    },
  },
}

export async function listar(req: Request, res: Response) {
  try {
    const { busca, ativo } = req.query as Record<string, string | undefined>

    const where: Prisma.JornadaWhereInput = {}
    if (ativo === 'true') where.ativo = true
    else if (ativo === 'false') where.ativo = false

    if (busca?.trim()) {
      const termo = busca.trim()
      where.OR = [
        { titulo: { contains: termo, mode: 'insensitive' } },
        { slug: { contains: termo, mode: 'insensitive' } },
      ]
    }

    const jornadas = await prisma.jornada.findMany({
      where,
      orderBy: { criado_em: 'desc' },
      include: { _count: { select: { etapas: true } } },
    })
    res.json(jornadas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar jornadas.' })
  }
}

export async function buscarPorId(req: Request, res: Response) {
  try {
    const jornada = await prisma.jornada.findUnique({
      where: { id: req.params.id as string },
      include: INCLUDE_ETAPAS,
    })
    if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada.' })
    res.json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar jornada.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const { titulo, descricao, ativo, etapas } = req.body
    const {
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis,
      segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    if (!titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo é obrigatório.' })
    }

    const { erro: erroEtapas, lista: listaEtapas } = validarEtapas(etapas)
    if (erroEtapas) return res.status(400).json({ erro: erroEtapas })

    const slug = await slugUnico(gerarSlugBase(titulo))

    const jornada = await prisma.jornada.create({
      data: {
        slug,
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        ativo: ativo !== undefined ? Boolean(ativo) : true,
        segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [],
        segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [],
        segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [],
        segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [],
        segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [],
        etapas: {
          create: listaEtapas.map((e, i) => montarDadosEtapa(e, i)),
        },
      },
      include: INCLUDE_ETAPAS,
    })

    res.status(201).json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar jornada.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.jornada.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ erro: 'Jornada não encontrada.' })

    const { titulo, descricao, ativo, etapas } = req.body
    const {
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis,
      segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    if (titulo !== undefined && !titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo não pode ficar vazio.' })
    }

    let listaEtapas: EtapaInput[] | null = null
    if (etapas !== undefined) {
      const { erro: erroEtapas, lista } = validarEtapas(etapas)
      if (erroEtapas) return res.status(400).json({ erro: erroEtapas })
      listaEtapas = lista
    }

    // Slug é gerado só no POST e nunca muda depois — estável pra não quebrar
    // referências/URLs internas e debug, mesmo que o título seja editado.
    const jornada = await prisma.$transaction(async tx => {
      if (listaEtapas) {
        await tx.etapaJornada.deleteMany({ where: { jornada_id: id } })
      }
      return tx.jornada.update({
        where: { id },
        data: {
          ...(titulo !== undefined && { titulo: titulo.trim() }),
          ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
          ...(ativo !== undefined && { ativo: Boolean(ativo) }),
          ...(segmentar_cliente_ids !== undefined && { segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [] }),
          ...(segmentar_unidade_ids !== undefined && { segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [] }),
          ...(segmentar_perfis !== undefined && { segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [] }),
          ...(segmentar_usuario_tipos !== undefined && { segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [] }),
          ...(segmentar_estados !== undefined && { segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [] }),
          ...(listaEtapas && {
            etapas: {
              create: listaEtapas.map((e, i) => montarDadosEtapa(e, i)),
            },
          }),
        },
        include: INCLUDE_ETAPAS,
      })
    })

    res.json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar jornada.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.jornada.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ erro: 'Jornada não encontrada.' })

    // Exclusão de verdade (não é o "ativo: false" usado por tours/campanhas) —
    // pedido explícito para esta etapa. Etapas caem em cascade (migration);
    // eventos usam o comportamento padrão da FK (Restrict): se já existir
    // EventoJornada para esta jornada, a exclusão falha com P2003 abaixo.
    await prisma.jornada.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(409).json({ erro: 'Não é possível excluir: esta jornada possui eventos registrados.' })
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao excluir jornada.' })
  }
}
