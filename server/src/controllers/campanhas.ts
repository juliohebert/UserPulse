import { Request, Response } from 'express'
import prisma from '../lib/prisma'

const CAMPOS_OBRIGATORIOS = ['titulo', 'descricao', 'tipo', 'sistema', 'tela'] as const

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
    const existente = await prisma.campanha.findFirst({
      where: { slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    })
    if (!existente) return slug
    slug = `${base}-${contador++}`
  }
}

export async function listar(_req: Request, res: Response) {
  try {
    const campanhas = await prisma.campanha.findMany({
      orderBy: { criado_em: 'desc' },
      include: { _count: { select: { feedbacks: true } } },
    })
    res.json(campanhas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar campanhas.' })
  }
}

export async function buscarPorId(req: Request, res: Response) {
  try {
    const campanha = await prisma.campanha.findUnique({
      where: { id: req.params.id as string },
      include: { _count: { select: { feedbacks: true } } },
    })
    if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' })
    res.json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanha.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const faltando = CAMPOS_OBRIGATORIOS.filter(c => !req.body[c]?.toString().trim())
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      modo_exibicao, gatilho, evento, atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, intervalo_reexibicao_dias, categoria,
    } = req.body

    const slug = await slugUnico(gerarSlugBase(titulo))

    const campanha = await prisma.campanha.create({
      data: {
        slug,
        titulo: titulo.trim(),
        subtitulo: subtitulo?.trim() || null,
        descricao: descricao.trim(),
        tipo: tipo.trim(),
        sistema: sistema.trim(),
        tela: tela.trim(),
        imagem_url: imagem_url?.trim() || null,
        video_url: video_url?.trim() || null,
        texto_botao: texto_botao?.trim() || null,
        url_botao: url_botao?.trim() || null,
        feedback_habilitado: feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : true,
        modo_exibicao: modo_exibicao?.trim() || 'modal_automatica',
        gatilho: gatilho?.trim() || 'ao_abrir_tela',
        evento: evento?.trim() || null,
        atraso_ms: atraso_ms !== undefined ? Number(atraso_ms) : 800,
        mostrar_uma_vez: Boolean(mostrar_uma_vez),
        prioridade: prioridade !== undefined ? Number(prioridade) : 0,
        ordem: ordem !== undefined ? Number(ordem) : 0,
        ativo: ativo !== undefined ? Boolean(ativo) : true,
        data_inicio: data_inicio ? new Date(data_inicio) : null,
        data_fim: data_fim ? new Date(data_fim) : null,
        pergunta_feedback: pergunta_feedback?.trim() || null,
        observacao_obrigatoria: Boolean(observacao_obrigatoria),
        exige_confirmacao_leitura: Boolean(exige_confirmacao_leitura),
        intervalo_reexibicao_dias: intervalo_reexibicao_dias != null && intervalo_reexibicao_dias !== '' ? Number(intervalo_reexibicao_dias) : null,
        categoria: categoria?.trim() || null,
      },
    })

    res.status(201).json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar campanha.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const existente = await prisma.campanha.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const vazios = CAMPOS_OBRIGATORIOS.filter(c => c in req.body && !req.body[c]?.toString().trim())
    if (vazios.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios não podem ficar vazios: ${vazios.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      modo_exibicao, gatilho, evento, atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, intervalo_reexibicao_dias, categoria,
    } = req.body

    let slug = existente.slug
    if (titulo && titulo.trim() !== existente.titulo) {
      slug = await slugUnico(gerarSlugBase(titulo.trim()), id)
    }

    const campanha = await prisma.campanha.update({
      where: { id },
      data: {
        ...(titulo !== undefined && { titulo: titulo.trim(), slug }),
        ...(subtitulo !== undefined && { subtitulo: subtitulo?.trim() || null }),
        ...(descricao !== undefined && { descricao: descricao.trim() }),
        ...(tipo !== undefined && { tipo: tipo.trim() }),
        ...(sistema !== undefined && { sistema: sistema.trim() }),
        ...(tela !== undefined && { tela: tela.trim() }),
        ...(imagem_url !== undefined && { imagem_url: imagem_url?.trim() || null }),
        ...(video_url !== undefined && { video_url: video_url?.trim() || null }),
        ...(texto_botao !== undefined && { texto_botao: texto_botao?.trim() || null }),
        ...(url_botao !== undefined && { url_botao: url_botao?.trim() || null }),
        ...(feedback_habilitado !== undefined && { feedback_habilitado: Boolean(feedback_habilitado) }),
        ...(modo_exibicao !== undefined && { modo_exibicao: modo_exibicao?.trim() || 'modal_automatica' }),
        ...(gatilho !== undefined && { gatilho: gatilho?.trim() || 'ao_abrir_tela' }),
        ...(evento !== undefined && { evento: evento?.trim() || null }),
        ...(atraso_ms !== undefined && { atraso_ms: Number(atraso_ms) }),
        ...(mostrar_uma_vez !== undefined && { mostrar_uma_vez: Boolean(mostrar_uma_vez) }),
        ...(prioridade !== undefined && { prioridade: Number(prioridade) }),
        ...(ordem !== undefined && { ordem: Number(ordem) }),
        ...(ativo !== undefined && { ativo: Boolean(ativo) }),
        ...(data_inicio !== undefined && { data_inicio: data_inicio ? new Date(data_inicio) : null }),
        ...(data_fim !== undefined && { data_fim: data_fim ? new Date(data_fim) : null }),
        ...(pergunta_feedback !== undefined && { pergunta_feedback: pergunta_feedback?.trim() || null }),
        ...(observacao_obrigatoria !== undefined && { observacao_obrigatoria: Boolean(observacao_obrigatoria) }),
        ...(exige_confirmacao_leitura !== undefined && { exige_confirmacao_leitura: Boolean(exige_confirmacao_leitura) }),
        ...(intervalo_reexibicao_dias !== undefined && {
          intervalo_reexibicao_dias: intervalo_reexibicao_dias != null && intervalo_reexibicao_dias !== '' ? Number(intervalo_reexibicao_dias) : null,
        }),
        ...(categoria !== undefined && { categoria: categoria?.trim() || null }),
      },
    })

    res.json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar campanha.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.campanha.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    await prisma.campanha.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover campanha.' })
  }
}
