import { Request, Response } from 'express'
import prisma from '../lib/prisma'

export async function buscarDashboard(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const campanha = await prisma.campanha.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!campanha) {
      return res.status(404).json({ erro: 'Campanha não encontrada.' })
    }

    const [
      agregado, porNota, feedbacks_recentes,
      visualizacoes, cliques_cta, total_confirmacoes,
      eventos_recentes, visualizacoesUnicasArr, cliquesUnicosArr,
      respondentesUnicosArr,
    ] = await Promise.all([
      prisma.feedback.aggregate({
        where: { campanha_id: id },
        _avg: { nota: true },
        _count: { id: true },
      }),

      prisma.feedback.groupBy({
        by: ['nota'],
        where: { campanha_id: id },
        _count: { nota: true },
      }),

      prisma.feedback.findMany({
        where: { campanha_id: id },
        orderBy: { criado_em: 'desc' },
        take: 20,
      }),

      prisma.eventoCampanha.count({ where: { campanha_id: id, tipo_evento: 'visualizacao' } }),
      prisma.eventoCampanha.count({ where: { campanha_id: id, tipo_evento: 'clique_cta' } }),
      prisma.confirmacaoLeitura.count({ where: { campanha_id: id } }),

      prisma.eventoCampanha.findMany({
        where: { campanha_id: id },
        orderBy: { criado_em: 'desc' },
        take: 100,
      }),
      prisma.eventoCampanha.groupBy({
        by: ['usuario_id'],
        where: { campanha_id: id, tipo_evento: 'visualizacao', usuario_id: { not: null } },
      }),
      prisma.eventoCampanha.groupBy({
        by: ['usuario_id'],
        where: { campanha_id: id, tipo_evento: 'clique_cta', usuario_id: { not: null } },
      }),
      prisma.feedback.groupBy({
        by: ['usuario_id'],
        where: { campanha_id: id, usuario_id: { not: null } },
      }),
    ])

    const distribuicao: Record<string, number> = {}
    for (let i = 0; i <= 10; i++) distribuicao[String(i)] = 0
    for (const item of porNota) distribuicao[String(item.nota)] = item._count?.nota ?? 0

    const avgNota = agregado._avg?.nota ?? null
    const media = avgNota !== null ? Math.round(avgNota * 10) / 10 : null
    const taxa_clique = visualizacoes > 0
      ? Math.round((cliques_cta / visualizacoes) * 1000) / 10
      : 0

    const percentual_confirmacao = visualizacoes > 0
      ? Math.round((total_confirmacoes / visualizacoes) * 1000) / 10
      : 0

    const visualizacoes_unicas = visualizacoesUnicasArr.length
    const cliques_unicos = cliquesUnicosArr.length
    const respondentes_unicos = respondentesUnicosArr.length

    res.json({
      campanha,
      media,
      total: agregado._count?.id ?? 0,
      distribuicao,
      feedbacks_recentes,
      visualizacoes,
      cliques_cta,
      taxa_clique,
      total_confirmacoes,
      percentual_confirmacao,
      eventos_recentes,
      visualizacoes_unicas,
      cliques_unicos,
      respondentes_unicos,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard.' })
  }
}
