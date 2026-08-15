import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { FORMATO_DESTAQUE_ELEMENTO } from './campanhas'

// ─── Desempenho por destaque (Fase 3 — múltiplos destaques) ────────────────
// Igual ao restante deste dashboard (visualizacoes_unicas/cliques_unicos):
// o "único" por item vem de um groupBy 3 colunas (destaque_item_id,
// tipo_evento, usuario_id) já feito no banco — cada linha devolvida já É
// uma combinação distinta, então contar quantas linhas caem em cada
// (item, tipo) aqui é só uma tally, nunca um cálculo de distinct em JS.
// Função pura — recebe os resultados já agregados pelo Prisma, não toca
// no banco, testável direto com arrays sintéticos.
export interface DesempenhoDestaqueItem {
  destaque_item_id: string
  titulo: string
  ativo: boolean
  visualizacoes: number
  visualizacoes_unicas: number
  interacoes: number
  interacoes_unicas: number
  cliques_cta: number
  cliques_cta_unicos: number
  dispensas: number
  dispensas_unicas: number
}

type CampoContagem = 'visualizacoes' | 'interacoes' | 'cliques_cta' | 'dispensas'
type CampoUnico = 'visualizacoes_unicas' | 'interacoes_unicas' | 'cliques_cta_unicos' | 'dispensas_unicas'

const CAMPO_POR_TIPO: Record<string, { total: CampoContagem; unico: CampoUnico }> = {
  visualizacao: { total: 'visualizacoes', unico: 'visualizacoes_unicas' },
  interacao_badge: { total: 'interacoes', unico: 'interacoes_unicas' },
  clique_cta: { total: 'cliques_cta', unico: 'cliques_cta_unicos' },
  dispensa: { total: 'dispensas', unico: 'dispensas_unicas' },
}

export function montarDesempenhoDestaques(
  itens: Array<{ id: string; titulo: string; ativo: boolean }>,
  totaisPorItemTipo: Array<{ destaque_item_id: string | null; tipo_evento: string; _count: { id: number } }>,
  unicosPorItemTipo: Array<{ destaque_item_id: string | null; tipo_evento: string; usuario_id: string | null }>
): DesempenhoDestaqueItem[] {
  const porItem = new Map<string, DesempenhoDestaqueItem>()
  for (const item of itens) {
    porItem.set(item.id, {
      destaque_item_id: item.id,
      titulo: item.titulo,
      ativo: item.ativo,
      visualizacoes: 0,
      visualizacoes_unicas: 0,
      interacoes: 0,
      interacoes_unicas: 0,
      cliques_cta: 0,
      cliques_cta_unicos: 0,
      dispensas: 0,
      dispensas_unicas: 0,
    })
  }

  for (const t of totaisPorItemTipo) {
    if (!t.destaque_item_id) continue
    const alvo = porItem.get(t.destaque_item_id)
    const campo = CAMPO_POR_TIPO[t.tipo_evento]
    if (!alvo || !campo) continue
    alvo[campo.total] = t._count.id
  }

  const contagemUnicos = new Map<string, number>()
  for (const u of unicosPorItemTipo) {
    if (!u.destaque_item_id || !u.usuario_id) continue
    const chave = `${u.destaque_item_id}:${u.tipo_evento}`
    contagemUnicos.set(chave, (contagemUnicos.get(chave) ?? 0) + 1)
  }
  for (const [chave, contagem] of contagemUnicos) {
    const separador = chave.indexOf(':')
    const itemId = chave.slice(0, separador)
    const tipo = chave.slice(separador + 1)
    const alvo = porItem.get(itemId)
    const campo = CAMPO_POR_TIPO[tipo]
    if (!alvo || !campo) continue
    alvo[campo.unico] = contagem
  }

  return Array.from(porItem.values())
}

export async function buscarDashboard(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const campanha = await prisma.campanha.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!campanha) {
      return res.status(404).json({ erro: 'Campanha não encontrada.' })
    }

    // Destaques (Fase 3) só tem custo extra pra campanhas destaque_elemento —
    // as outras 3 queries (itensDestaque/totaisPorItem/unicosPorItem) nem
    // entram no Promise.all quando o formato não é esse.
    const ehDestaqueElemento = campanha.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO

    const [
      agregado, porNota, feedbacks_recentes,
      visualizacoes, cliques_cta, total_confirmacoes,
      eventos_recentes, visualizacoesUnicasArr, cliquesUnicosArr,
      respondentesUnicosArr,
      itensDestaque, totaisPorItem, unicosPorItem,
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
      // Únicos NO NÍVEL DA CAMPANHA: agrupa só por usuario_id, sem
      // destaque_item_id — um usuário que interagiu com 2 destaques
      // diferentes da mesma campanha conta 1 vez aqui, nunca 2 (é assim
      // que já funcionava antes desta fase; adicionar destaque_item_id não
      // muda esta query, então a deduplicação entre itens já é automática).
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

      // Sem filtro de ativo, de propósito — "Desempenho dos destaques"
      // preserva histórico de verdade: um item removido da configuração
      // (ativo:false, ver sincronizarDestaques/atualizar em campanhas.ts)
      // continua aparecendo aqui com os números que já tinha acumulado,
      // só marcado como inativo (campo `ativo` no retorno) pro frontend
      // sinalizar "removido" em vez de escondê-lo.
      ehDestaqueElemento
        ? prisma.campanhaDestaqueItem.findMany({
            where: { campanha_id: id },
            orderBy: { ordem: 'asc' },
            select: { id: true, titulo: true, ativo: true },
          })
        : Promise.resolve([]),
      ehDestaqueElemento
        ? prisma.eventoCampanha.groupBy({
            by: ['destaque_item_id', 'tipo_evento'],
            where: { campanha_id: id, destaque_item_id: { not: null } },
            _count: { id: true },
          })
        : Promise.resolve([]),
      ehDestaqueElemento
        ? prisma.eventoCampanha.groupBy({
            by: ['destaque_item_id', 'tipo_evento', 'usuario_id'],
            where: { campanha_id: id, destaque_item_id: { not: null }, usuario_id: { not: null } },
          })
        : Promise.resolve([]),
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

    const desempenho_destaques = ehDestaqueElemento
      ? montarDesempenhoDestaques(itensDestaque, totaisPorItem, unicosPorItem)
      : []

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
      desempenho_destaques,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard.' })
  }
}
