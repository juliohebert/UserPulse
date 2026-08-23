import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { FORMATO_DESTAQUE_ELEMENTO } from './campanhas'
import { Prisma } from '@prisma/client'

export interface DashboardPeriodo { inicio: string | null; fim: string | null }
export interface DashboardComparacao { visualizacoes: number; respostas: number; cliques_cta: number; nps: number | null }
export interface SerieDiariaItem { data: string; visualizacoes: number; respostas: number; cliques_cta: number }

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function normalizarDataDashboard(value: unknown): string | null {
  if (typeof value !== 'string' || !DATA_ISO.test(value)) return null
  const [, ano, mes, dia] = value.match(DATA_ISO)!
  const date = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  return date.getUTCFullYear() === Number(ano) && date.getUTCMonth() === Number(mes) - 1 && date.getUTCDate() === Number(dia)
    ? value : null
}

export function calcularPeriodoAnterior(periodo: DashboardPeriodo): DashboardPeriodo | null {
  if (!periodo.inicio || !periodo.fim) return null
  const inicio = new Date(`${periodo.inicio}T00:00:00Z`)
  const fim = new Date(`${periodo.fim}T00:00:00Z`)
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
  const anteriorFim = new Date(inicio.getTime() - 86400000)
  const anteriorInicio = new Date(anteriorFim.getTime() - (dias - 1) * 86400000)
  return { inicio: anteriorInicio.toISOString().slice(0, 10), fim: anteriorFim.toISOString().slice(0, 10) }
}

function intervaloDashboard(req: Request): { periodo: DashboardPeriodo; inicio: Date | null; fim: Date | null; erro?: string } {
  const inicio = normalizarDataDashboard(req.query.data_inicio)
  const fim = normalizarDataDashboard(req.query.data_fim)
  if (inicio && fim && fim < inicio) return { periodo: { inicio, fim }, inicio: null, fim: null, erro: 'data_fim deve ser igual ou posterior a data_inicio.' }
  return {
    periodo: { inicio, fim },
    inicio: inicio ? new Date(`${inicio}T00:00:00.000Z`) : null,
    fim: fim ? new Date(`${fim}T23:59:59.999Z`) : null,
  }
}

function filtroData(inicio: Date | null, fim: Date | null) {
  return inicio || fim ? { criado_em: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } } : {}
}

function construirSerieDiaria(inicio: string, fim: string, rows: Array<{ data: Date; visualizacoes: bigint; respostas: bigint; cliques_cta: bigint }>): SerieDiariaItem[] {
  const mapa = new Map(rows.map(row => [row.data.toISOString().slice(0, 10), row]))
  const resultado: SerieDiariaItem[] = []
  for (let cursor = new Date(`${inicio}T00:00:00Z`), limite = new Date(`${fim}T00:00:00Z`); cursor <= limite; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const data = cursor.toISOString().slice(0, 10)
    const row = mapa.get(data)
    resultado.push({ data, visualizacoes: Number(row?.visualizacoes ?? 0), respostas: Number(row?.respostas ?? 0), cliques_cta: Number(row?.cliques_cta ?? 0) })
  }
  return resultado
}

async function resumoPeriodo(campanhaId: string, inicio: Date | null, fim: Date | null): Promise<DashboardComparacao> {
  const filtro = filtroData(inicio, fim)
  const [visualizacoes, respostas, cliques_cta, porNota] = await Promise.all([
    prisma.eventoCampanha.count({ where: { campanha_id: campanhaId, tipo_evento: 'visualizacao', ...filtro } }),
    prisma.feedback.count({ where: { campanha_id: campanhaId, tipo_avaliacao: 'nps', ...filtro } }),
    prisma.eventoCampanha.count({ where: { campanha_id: campanhaId, tipo_evento: 'clique_cta', ...filtro } }),
    prisma.feedback.groupBy({ where: { campanha_id: campanhaId, tipo_avaliacao: 'nps', ...filtro }, by: ['nota'], _count: { nota: true } }),
  ])
  const total = porNota.reduce((sum, item) => sum + item._count.nota, 0)
  const promotores = porNota.filter(item => item.nota !== null && item.nota >= 9).reduce((sum, item) => sum + item._count.nota, 0)
  const detratores = porNota.filter(item => item.nota !== null && item.nota <= 6).reduce((sum, item) => sum + item._count.nota, 0)
  return { visualizacoes, respostas, cliques_cta, nps: total > 0 ? Math.round((promotores - detratores) / total * 100) : null }
}

async function seriePeriodo(campanhaId: string, inicio: Date | null, fim: Date | null, periodo: DashboardPeriodo): Promise<SerieDiariaItem[]> {
  let inicioSerie = periodo.inicio
  let fimSerie = periodo.fim
  if (!inicioSerie || !fimSerie) {
    const limites = await prisma.$queryRaw<Array<{ inicio: Date | null; fim: Date | null }>>(Prisma.sql`
      SELECT MIN(criado_em) AS inicio, MAX(criado_em) AS fim FROM (
        SELECT criado_em FROM eventos_campanha WHERE campanha_id = ${campanhaId}
        UNION ALL SELECT criado_em FROM feedbacks WHERE campanha_id = ${campanhaId} AND tipo_avaliacao = 'nps'
      ) atividade
    `)
    if (!limites[0]?.inicio || !limites[0]?.fim) return []
    inicioSerie ??= limites[0].inicio.toISOString().slice(0, 10)
    fimSerie ??= limites[0].fim.toISOString().slice(0, 10)
  }
  const rows = await prisma.$queryRaw<Array<{ data: Date; visualizacoes: bigint; respostas: bigint; cliques_cta: bigint }>>(Prisma.sql`
    SELECT data,
      SUM(visualizacoes)::bigint AS visualizacoes,
      SUM(respostas)::bigint AS respostas,
      SUM(cliques_cta)::bigint AS cliques_cta
    FROM (
      SELECT DATE_TRUNC('day', criado_em) AS data,
        COUNT(*) FILTER (WHERE tipo_evento = 'visualizacao') AS visualizacoes,
        0::bigint AS respostas,
        COUNT(*) FILTER (WHERE tipo_evento = 'clique_cta') AS cliques_cta
      FROM eventos_campanha
      WHERE campanha_id = ${campanhaId} AND criado_em >= ${inicio ?? new Date(`${inicioSerie}T00:00:00Z`)} AND criado_em <= ${fim ?? new Date(`${fimSerie}T23:59:59.999Z`)}
      GROUP BY 1
      UNION ALL
      SELECT DATE_TRUNC('day', criado_em), 0::bigint, COUNT(*)::bigint, 0::bigint
      FROM feedbacks
      WHERE campanha_id = ${campanhaId} AND tipo_avaliacao = 'nps' AND criado_em >= ${inicio ?? new Date(`${inicioSerie}T00:00:00Z`)} AND criado_em <= ${fim ?? new Date(`${fimSerie}T23:59:59.999Z`)}
      GROUP BY 1
    ) dados GROUP BY data ORDER BY data
  `)
  return construirSerieDiaria(inicioSerie, fimSerie, rows)
}

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
  // Avaliações de utilidade ("Essa melhoria foi útil?", Feedback com
  // tipo_avaliacao='utilidade_destaque') — nunca misturadas com
  // visualizacoes/interacoes/etc acima (que vêm de EventoCampanha, não de
  // Feedback). avaliacoes = sim + nao sempre (cada Feedback de utilidade
  // tem util true OU false, nunca null — ver validarAvaliacaoFeedback em
  // widget.ts), então não precisa de uma contagem "únicos" separada: o
  // índice único campanha_id+destaque_item_id+usuario_id+tipo_avaliacao já
  // garante no máximo 1 linha atual por usuário.
  avaliacoes: number
  sim: number
  nao: number
  // null (não 0) quando avaliacoes === 0 — estado neutro explícito, nunca
  // um "0%" enganoso nem NaN.
  percentual_util: number | null
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
  unicosPorItemTipo: Array<{ destaque_item_id: string | null; tipo_evento: string; usuario_id: string | null }>,
  // Opcional (default []) pra não quebrar quem já chamava com 3 argumentos —
  // groupBy(['destaque_item_id', 'util']) de Feedback com
  // tipo_avaliacao='utilidade_destaque'. util nunca é null nessas linhas na
  // prática (validarAvaliacaoFeedback exige boolean), mas o tipo aceita null
  // por segurança (defesa contra dado inconsistente, ver loop abaixo).
  utilidadePorItem: Array<{ destaque_item_id: string | null; util: boolean | null; _count: { id: number } }> = []
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
      avaliacoes: 0,
      sim: 0,
      nao: 0,
      percentual_util: null,
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

  for (const u of utilidadePorItem) {
    if (!u.destaque_item_id) continue
    const alvo = porItem.get(u.destaque_item_id)
    if (!alvo) continue
    if (u.util === true) alvo.sim = u._count.id
    else if (u.util === false) alvo.nao = u._count.id
  }
  for (const alvo of porItem.values()) {
    alvo.avaliacoes = alvo.sim + alvo.nao
    alvo.percentual_util = alvo.avaliacoes > 0
      ? Math.round((alvo.sim / alvo.avaliacoes) * 1000) / 10
      : null
  }

  return Array.from(porItem.values())
}

// Toda leitura de "Nota Média"/distribuição/respostas recentes/respondentes
// únicos deste dashboard só faz sentido pro cálculo de NPS — centraliza o
// filtro aqui pra nunca esquecer tipo_avaliacao numa query nova e pra nunca
// misturar CSAT/utilidade_destaque no cálculo atual (fundação NPS/CSAT/
// utilidade_destaque, ver Feedback.tipo_avaliacao em schema.prisma). Função
// pura, testável sem Prisma real.
export function whereFeedbackNps(campanhaId: string): { campanha_id: string; tipo_avaliacao: string } {
  return { campanha_id: campanhaId, tipo_avaliacao: 'nps' }
}

// Mesmo raciocínio de whereFeedbackNps, pra seção "Avaliações dos
// destaques" — usada nas 2 queries de utilidade (groupBy Sim/Não e a lista
// bruta). Garante que essa seção nunca mistura NPS/CSAT (Feedback com
// tipo_avaliacao diferente) mesmo que outra query do dashboard mude no
// futuro. Função pura, testável sem Prisma real.
export function whereUtilidadeDestaque(campanhaId: string): { campanha_id: string; tipo_avaliacao: string } {
  return { campanha_id: campanhaId, tipo_avaliacao: 'utilidade_destaque' }
}

export async function buscarDashboard(req: Request, res: Response) {
  try {
    const id = req.params.id as string

    const campanha = await prisma.campanha.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!campanha) {
      return res.status(404).json({ erro: 'Campanha não encontrada.' })
    }

    const intervalo = intervaloDashboard(req)
    if (intervalo.erro) return res.status(400).json({ erro: intervalo.erro })
    const { periodo, inicio, fim } = intervalo
    const filtro = filtroData(inicio, fim)
    const periodoAnterior = calcularPeriodoAnterior(periodo)
    const inicioAnterior = periodoAnterior?.inicio ? new Date(`${periodoAnterior.inicio}T00:00:00.000Z`) : null
    const fimAnterior = periodoAnterior?.fim ? new Date(`${periodoAnterior.fim}T23:59:59.999Z`) : null

    // Destaques (Fase 3) só tem custo extra pra campanhas destaque_elemento —
    // as outras 3 queries (itensDestaque/totaisPorItem/unicosPorItem) nem
    // entram no Promise.all quando o formato não é esse.
    const ehDestaqueElemento = campanha.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO

    const [
      agregado, porNota, feedbacks_recentes,
      visualizacoes, cliques_cta, total_confirmacoes,
      eventos_recentes, visualizacoesUnicasArr, cliquesUnicosArr,
      respondentesUnicosArr,
      itensDestaque, totaisPorItem, unicosPorItem, utilidadePorItem,
      avaliacoes_destaques,
    ] = await Promise.all([
      prisma.feedback.aggregate({
        where: { ...whereFeedbackNps(id), ...filtro },
        _avg: { nota: true },
        _count: { id: true },
      }),

      prisma.feedback.groupBy({
        by: ['nota'],
        where: { ...whereFeedbackNps(id), ...filtro },
        _count: { nota: true },
      }),

      prisma.feedback.findMany({
        where: { ...whereFeedbackNps(id), ...filtro },
        orderBy: { criado_em: 'desc' },
        take: 20,
      }),

      prisma.eventoCampanha.count({ where: { campanha_id: id, tipo_evento: 'visualizacao', ...filtro } }),
      prisma.eventoCampanha.count({ where: { campanha_id: id, tipo_evento: 'clique_cta', ...filtro } }),
      prisma.confirmacaoLeitura.count({ where: { campanha_id: id, ...filtro } }),

      prisma.eventoCampanha.findMany({
        where: { campanha_id: id, ...filtro },
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
        where: { campanha_id: id, tipo_evento: 'visualizacao', usuario_id: { not: null }, ...filtro },
      }),
      prisma.eventoCampanha.groupBy({
        by: ['usuario_id'],
        where: { campanha_id: id, tipo_evento: 'clique_cta', usuario_id: { not: null }, ...filtro },
      }),
      prisma.feedback.groupBy({
        by: ['usuario_id'],
        where: { ...whereFeedbackNps(id), usuario_id: { not: null }, ...filtro },
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
            where: { campanha_id: id, destaque_item_id: { not: null }, ...filtro },
            _count: { id: true },
          })
        : Promise.resolve([]),
      ehDestaqueElemento
        ? prisma.eventoCampanha.groupBy({
            by: ['destaque_item_id', 'tipo_evento', 'usuario_id'],
            where: { campanha_id: id, destaque_item_id: { not: null }, usuario_id: { not: null }, ...filtro },
          })
        : Promise.resolve([]),
      // Avaliações de utilidade ("Essa melhoria foi útil?") por item — só
      // Feedback com tipo_avaliacao='utilidade_destaque' (nunca nps/csat,
      // mesmo raciocínio de whereFeedbackNps: cada seção do dashboard filtra
      // explicitamente o tipo que lhe interessa, nunca assume "todo feedback
      // desta campanha é do meu tipo").
      ehDestaqueElemento
        ? prisma.feedback.groupBy({
            by: ['destaque_item_id', 'util'],
            where: { ...whereUtilidadeDestaque(id), ...filtro },
            _count: { id: true },
          })
        : Promise.resolve([]),
      // Lista bruta pra seção "Avaliações dos destaques" — filtros/busca são
      // aplicados no frontend (mesmo padrão de eventos_recentes/Interações).
      // Sem filtro de ativo no destaque (join é só por destaque_item_id, nem
      // JOIN de verdade) — um item removido continua tendo suas avaliações
      // aqui, o frontend resolve "Removido" via desempenho_destaques.
      ehDestaqueElemento
        ? prisma.feedback.findMany({
            where: { ...whereUtilidadeDestaque(id), ...filtro },
            orderBy: { criado_em: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
    ])

    const comparacao = periodoAnterior
      ? await resumoPeriodo(id, inicioAnterior, fimAnterior)
      : null
    const serie_diaria = await seriePeriodo(id, inicio, fim, periodo)
    const serie_diaria_anterior = periodoAnterior
      ? await seriePeriodo(id, inicioAnterior, fimAnterior, periodoAnterior)
      : []

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
      ? montarDesempenhoDestaques(itensDestaque, totaisPorItem, unicosPorItem, utilidadePorItem)
      : []

    res.json({
      campanha,
      periodo,
      comparacao,
      serie_diaria,
      serie_diaria_anterior,
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
      // Só não-vazio pra campanhas destaque_elemento — ver ehDestaqueElemento.
      avaliacoes_destaques: ehDestaqueElemento ? avaliacoes_destaques : [],
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard.' })
  }
}
