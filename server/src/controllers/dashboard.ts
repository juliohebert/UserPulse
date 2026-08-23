import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
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

export interface SerieImpressao {
  data: string
  visualizacoes: number
}

export const TIMEZONE_DASHBOARD = 'America/Sao_Paulo'

function dataCivilSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_DASHBOARD,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data)
  const porTipo = new Map(partes.map(parte => [parte.type, parte.value]))
  return `${porTipo.get('year')}-${porTipo.get('month')}-${porTipo.get('day')}`
}

export interface AtividadeDiaSemana {
  dia: number
  visualizacoes: number
}

// O gráfico e os dias ativos usam o universo completo da campanha, não a
// janela de eventos recentes carregada para a tabela. O SQL já devolve datas
// civis no fuso do negócio; Date continua aceito para chamadas legadas/testes.
export function normalizarSerieImpressao(rows: Array<{ data: Date | string; visualizacoes: bigint | number }>): SerieImpressao[] {
  return rows.map(row => ({
    data: typeof row.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.data)
      ? row.data
      : dataCivilSaoPaulo(new Date(row.data)),
    visualizacoes: Number(row.visualizacoes),
  }))
}

export function normalizarAtividadeDiaSemana(rows: Array<{ dia: number | string; visualizacoes: bigint | number }>): AtividadeDiaSemana[] {
  const porDia = new Map(rows.map(row => [Number(row.dia), Number(row.visualizacoes)]))
  return Array.from({ length: 7 }, (_, dia) => ({ dia, visualizacoes: porDia.get(dia) ?? 0 }))
    .sort((a, b) => b.visualizacoes - a.visualizacoes || a.dia - b.dia)
}

function pagina(query: Record<string, unknown>, padrao: number) {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1)
  const perPage = Math.min(100, Math.max(1, Math.trunc(Number(query.per_page)) || padrao))
  return { page, perPage }
}

function dataQuery(value: unknown, fimDoDia = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined
  // Datas civis sem horário pertencem explicitamente a America/Sao_Paulo;
  // instantes ISO completos preservam o offset enviado pelo frontend.
  const date = new Date(value.length === 10
    ? `${value}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`
    : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function intervalo(query: Request['query']) {
  const inicio = dataQuery(query.data_inicio)
  const fim = dataQuery(query.data_fim, true)
  return { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) }
}

function filtrosFeedback(query: Request['query'], campanhaId: string): Prisma.FeedbackWhereInput {
  const where: Prisma.FeedbackWhereInput = { ...whereFeedbackNps(campanhaId), criado_em: intervalo(query) }
  const nota = Number(query.nota)
  if (Number.isInteger(nota) && nota >= 0 && nota <= 10) where.nota = nota
  if (query.nps === 'Promotor') where.nota = { gte: 9 }
  if (query.nps === 'Neutro') where.nota = { gte: 7, lte: 8 }
  if (query.nps === 'Detrator') where.nota = { lte: 6 }
  if (query.tem_telefone === 'sim') where.telefone_contato = { not: null }
  if (query.tem_telefone === 'nao') where.telefone_contato = null
  const contexto: Prisma.FeedbackWhereInput[] = []
  for (const [key, value] of [['cliente_nome', query.cliente_nome], ['unidade_nome', query.unidade_nome], ['usuario_tipo', query.usuario_tipo], ['Estado', query.estado]] as Array<[string, unknown]>) {
    if (typeof value === 'string' && value) contexto.push({ contexto: { path: [key], string_contains: value } })
  }
  if (typeof query.busca === 'string' && query.busca.trim()) {
    const termo = query.busca.trim()
    where.OR = [
      { usuario_id: { contains: termo, mode: 'insensitive' } },
      { usuario_nome: { contains: termo, mode: 'insensitive' } },
      { usuario_email: { contains: termo, mode: 'insensitive' } },
      { observacao: { contains: termo, mode: 'insensitive' } },
      { contexto: { path: ['usuario_nome'], string_contains: termo } },
      { contexto: { path: ['usuario_email'], string_contains: termo } },
      { contexto: { path: ['cliente_nome'], string_contains: termo } },
      { contexto: { path: ['unidade_nome'], string_contains: termo } },
    ]
  }
  return contexto.length ? { AND: [where, ...contexto] } : where
}

function filtrosEventos(query: Request['query'], campanhaId: string): Prisma.EventoCampanhaWhereInput {
  const where: Prisma.EventoCampanhaWhereInput = { campanha_id: campanhaId, criado_em: intervalo(query) }
  const tipos: Record<string, string> = { Visualização: 'visualizacao', Clique: 'clique_cta', Interação: 'interacao_badge', Dispensa: 'dispensa' }
  if (typeof query.tipo === 'string' && tipos[query.tipo]) where.tipo_evento = tipos[query.tipo]
  if (typeof query.destaque_id === 'string' && query.destaque_id) where.destaque_item_id = query.destaque_id
  if (typeof query.busca_evento === 'string' && query.busca_evento.trim()) {
    const termo = query.busca_evento.trim()
    where.OR = [
      { usuario_id: { contains: termo, mode: 'insensitive' } },
      { tipo_evento: { contains: termo, mode: 'insensitive' } },
      { contexto: { path: ['usuario_nome'], string_contains: termo } },
      { contexto: { path: ['usuario_email'], string_contains: termo } },
      { contexto: { path: ['cliente_nome'], string_contains: termo } },
      { contexto: { path: ['unidade_nome'], string_contains: termo } },
    ]
  }
  return where
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
    const range = intervalo(req.query)
    // Filtros da tabela nunca podem alterar os KPIs, distribuição ou NPS.
    // Mantemos dois universos: período para o resumo e filtros para a lista.
    const feedbackPeriodoWhere: Prisma.FeedbackWhereInput = { ...whereFeedbackNps(id), criado_em: range }
    const feedbackWhere = filtrosFeedback(req.query, id)
    const eventosWhere = filtrosEventos(req.query, id)
    const respPag = pagina({ page: req.query.res_page, per_page: req.query.res_per_page }, 10)
    const interPag = pagina({ page: req.query.event_page, per_page: req.query.event_per_page }, 10)
    const avalPag = pagina({ page: req.query.avaliacao_page, per_page: req.query.avaliacao_per_page }, 10)
    const eventosPeriodoWhere = { campanha_id: id, criado_em: range }
    const avaliacaoWhere: Prisma.FeedbackWhereInput = { ...whereUtilidadeDestaque(id), criado_em: range }
    if (typeof req.query.avaliacao_destaque_id === 'string' && req.query.avaliacao_destaque_id) avaliacaoWhere.destaque_item_id = req.query.avaliacao_destaque_id
    if (req.query.avaliacao_util === 'sim') avaliacaoWhere.util = true
    if (req.query.avaliacao_util === 'nao') avaliacaoWhere.util = false
    if (typeof req.query.busca_avaliacao === 'string' && req.query.busca_avaliacao.trim()) {
      const termo = req.query.busca_avaliacao.trim()
      avaliacaoWhere.OR = [
        { usuario_id: { contains: termo, mode: 'insensitive' } },
        { usuario_nome: { contains: termo, mode: 'insensitive' } },
        { usuario_email: { contains: termo, mode: 'insensitive' } },
        { observacao: { contains: termo, mode: 'insensitive' } },
        { contexto: { path: ['usuario_nome'], string_contains: termo } },
        { contexto: { path: ['usuario_email'], string_contains: termo } },
      ]
    }

    const [
      agregado, porNota, feedbacks_recentes, feedbacks_total,
      visualizacoes, cliques_cta, total_confirmacoes,
      eventos_recentes, eventos_total, visualizacoesUnicasArr, cliquesUnicosArr,
      respondentesUnicosArr,
      itensDestaque, totaisPorItem, unicosPorItem, utilidadePorItem,
      avaliacoes_destaques, avaliacoes_total,
      serie_impressao,
      atividade_semana,
      destaqueEventosPeriodo,
      destaqueAvaliacoesPeriodo,
      quotePromotor,
      quoteDetrator,
    ] = await Promise.all([
      prisma.feedback.aggregate({
        where: feedbackPeriodoWhere,
        _avg: { nota: true },
        _count: { id: true },
      }),

      prisma.feedback.groupBy({
        by: ['nota'],
        where: feedbackPeriodoWhere,
        _count: { nota: true },
      }),

      prisma.feedback.findMany({
        where: feedbackWhere,
        orderBy: { criado_em: 'desc' },
        skip: (respPag.page - 1) * respPag.perPage,
        take: respPag.perPage,
      }),
      prisma.feedback.count({ where: feedbackWhere }),

      prisma.eventoCampanha.count({ where: { ...eventosPeriodoWhere, tipo_evento: 'visualizacao' } }),
      prisma.eventoCampanha.count({ where: { ...eventosPeriodoWhere, tipo_evento: 'clique_cta' } }),
      prisma.confirmacaoLeitura.count({ where: { campanha_id: id, criado_em: range } }),

      prisma.eventoCampanha.findMany({
        where: eventosWhere,
        orderBy: { criado_em: 'desc' },
        skip: (interPag.page - 1) * interPag.perPage,
        take: interPag.perPage,
      }),
      prisma.eventoCampanha.count({ where: eventosWhere }),
      // Únicos NO NÍVEL DA CAMPANHA: agrupa só por usuario_id, sem
      // destaque_item_id — um usuário que interagiu com 2 destaques
      // diferentes da mesma campanha conta 1 vez aqui, nunca 2 (é assim
      // que já funcionava antes desta fase; adicionar destaque_item_id não
      // muda esta query, então a deduplicação entre itens já é automática).
      prisma.eventoCampanha.groupBy({
        by: ['usuario_id'],
        where: { ...eventosPeriodoWhere, tipo_evento: 'visualizacao', usuario_id: { not: null } },
      }),
      prisma.eventoCampanha.groupBy({
        by: ['usuario_id'],
        where: { ...eventosPeriodoWhere, tipo_evento: 'clique_cta', usuario_id: { not: null } },
      }),
      prisma.feedback.groupBy({
        by: ['usuario_id'],
        where: { ...feedbackPeriodoWhere, usuario_id: { not: null } },
      }),

      // Sem filtro de ativo, de propósito — um item removido da configuração
      // continua aparecendo marcado como inativo, mas os eventos e avaliações
      // obedecem à mesma janela factual selecionada no dashboard.
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
            where: { ...eventosPeriodoWhere, destaque_item_id: { not: null } },
            _count: { id: true },
          })
        : Promise.resolve([]),
      ehDestaqueElemento
        ? prisma.eventoCampanha.groupBy({
            by: ['destaque_item_id', 'tipo_evento', 'usuario_id'],
            where: { ...eventosPeriodoWhere, destaque_item_id: { not: null }, usuario_id: { not: null } },
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
            where: { ...whereUtilidadeDestaque(id), criado_em: range },
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
            where: avaliacaoWhere,
            orderBy: { criado_em: 'desc' },
            skip: (avalPag.page - 1) * avalPag.perPage,
            take: avalPag.perPage,
          })
        : Promise.resolve([]),
      ehDestaqueElemento ? prisma.feedback.count({ where: avaliacaoWhere }) : Promise.resolve(0),
      prisma.$queryRaw<Array<{ data: string; visualizacoes: bigint }>>`
        SELECT TO_CHAR(DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS data, COUNT(*)::bigint AS visualizacoes
        FROM eventos_campanha
        WHERE campanha_id = ${id} AND tipo_evento = 'visualizacao'
          ${range.gte ? Prisma.sql`AND criado_em >= ${range.gte}` : Prisma.empty}
          ${range.lte ? Prisma.sql`AND criado_em <= ${range.lte}` : Prisma.empty}
        GROUP BY DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY data ASC
      `,
      prisma.$queryRaw<Array<{ dia: number; visualizacoes: bigint }>>`
        SELECT EXTRACT(DOW FROM criado_em AT TIME ZONE 'America/Sao_Paulo')::int AS dia, COUNT(*)::bigint AS visualizacoes
        FROM eventos_campanha
        WHERE campanha_id = ${id} AND tipo_evento = 'visualizacao'
          ${range.gte ? Prisma.sql`AND criado_em >= ${range.gte}` : Prisma.empty}
          ${range.lte ? Prisma.sql`AND criado_em <= ${range.lte}` : Prisma.empty}
        GROUP BY EXTRACT(DOW FROM criado_em AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY dia ASC
      `,
      prisma.eventoCampanha.groupBy({
        by: ['tipo_evento'],
        where: eventosPeriodoWhere,
        _count: { id: true },
      }),
      ehDestaqueElemento
        ? prisma.feedback.groupBy({
            by: ['util'],
            where: { ...whereUtilidadeDestaque(id), criado_em: range },
            _count: { id: true },
          })
        : Promise.resolve([]),
      prisma.feedback.findFirst({
        where: { ...feedbackPeriodoWhere, nota: { gte: 9 }, observacao: { not: '' } },
        orderBy: { criado_em: 'desc' },
      }),
      prisma.feedback.findFirst({
        where: { ...feedbackPeriodoWhere, nota: { lte: 6 }, observacao: { not: '' } },
        orderBy: { criado_em: 'desc' },
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

    const desempenho_destaques = ehDestaqueElemento
      ? montarDesempenhoDestaques(itensDestaque, totaisPorItem, unicosPorItem, utilidadePorItem)
      : []
    const destaqueResumoPeriodo = {
      interacoes: destaqueEventosPeriodo.find(item => item.tipo_evento === 'interacao_badge')?._count.id ?? 0,
      dispensas: destaqueEventosPeriodo.find(item => item.tipo_evento === 'dispensa')?._count.id ?? 0,
      avaliacoes: destaqueAvaliacoesPeriodo.reduce((sum, item) => sum + item._count.id, 0),
      sim: destaqueAvaliacoesPeriodo.find(item => item.util === true)?._count.id ?? 0,
    }

    res.json({
      campanha,
      media,
      total: feedbacks_total,
      total_periodo: agregado._count.id,
      distribuicao,
      feedbacks_recentes,
      visualizacoes,
      cliques_cta,
      taxa_clique,
      total_confirmacoes,
      percentual_confirmacao,
      eventos_recentes,
      eventos_total,
      eventos_page: interPag.page,
      eventos_per_page: interPag.perPage,
      visualizacoes_unicas,
      cliques_unicos,
      respondentes_unicos,
      desempenho_destaques,
      destaque_resumo_periodo: destaqueResumoPeriodo,
      quotes_nps: [quotePromotor, quoteDetrator].filter(Boolean),
      // Só não-vazio pra campanhas destaque_elemento — ver ehDestaqueElemento.
      avaliacoes_destaques: ehDestaqueElemento ? avaliacoes_destaques : [],
      avaliacoes_total: ehDestaqueElemento ? avaliacoes_total : 0,
      avaliacoes_page: avalPag.page,
      avaliacoes_per_page: avalPag.perPage,
      respostas_page: respPag.page,
      respostas_per_page: respPag.perPage,
      serie_impressao: normalizarSerieImpressao(serie_impressao),
      atividade_semana: normalizarAtividadeDiaSemana(atividade_semana),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard.' })
  }
}
