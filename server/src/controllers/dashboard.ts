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

// ─── Desempenho por conteúdo (Etapa 4 — analytics por CampanhaConteudoItem) ─
// Mecanismo independente de montarDesempenhoDestaques acima (nunca misturar
// os dois): isto é o carrossel de conteúdo do próprio modal (SCROLL/SLIDES),
// não o destaque_elemento. V1 só cobre clique_cta — sem visualização por
// item, sem CTR por conteúdo (não há denominador confiável por item). Função
// pura: recebe os resultados já agregados pelo Prisma, não toca no banco.
// Mesma mecânica de "únicos" das outras seções: o groupBy de 3 colunas
// (conteudo_item_id, tipo_evento, usuario_id) já vem deduplicado — contar
// quantas linhas caem em cada conteúdo aqui é só um tally, nunca distinct em JS.
export interface DesempenhoConteudoItem {
  conteudo_item_id: string
  titulo: string
  ordem: number
  // true só quando o conteúdo tem URL de CTA — o texto pode cair no default
  // "Saiba mais" no widget, então NÃO se exige texto_botao aqui.
  tem_cta: boolean
  cliques_cta: number
  cliques_cta_unicos: number
}

export function montarDesempenhoConteudos(
  // Sempre ordenados por `ordem` ASC pelo caller — o Map preserva a ordem de
  // inserção, então o array de saída mantém a mesma ordem.
  itens: Array<{ id: string; titulo: string; ordem: number; url_botao: string | null }>,
  totaisPorItem: Array<{ conteudo_item_id: string | null; tipo_evento: string; _count: { id: number } }>,
  unicosPorItem: Array<{ conteudo_item_id: string | null; tipo_evento: string; usuario_id: string | null }>
): DesempenhoConteudoItem[] {
  const porItem = new Map<string, DesempenhoConteudoItem>()
  for (const item of itens) {
    porItem.set(item.id, {
      conteudo_item_id: item.id,
      titulo: item.titulo,
      ordem: item.ordem,
      tem_cta: typeof item.url_botao === 'string' && item.url_botao.trim() !== '',
      cliques_cta: 0,
      cliques_cta_unicos: 0,
    })
  }

  for (const t of totaisPorItem) {
    // Bucket null (eventos antigos / fallback legado / conteúdo removido)
    // nunca vira uma linha de conteúdo — quem contabiliza isso é
    // cliques_cta_sem_conteudo, calculado à parte no controller.
    if (!t.conteudo_item_id) continue
    if (t.tipo_evento !== 'clique_cta') continue
    const alvo = porItem.get(t.conteudo_item_id)
    if (!alvo) continue
    alvo.cliques_cta = t._count.id
  }

  const contagemUnicos = new Map<string, number>()
  for (const u of unicosPorItem) {
    if (!u.conteudo_item_id || !u.usuario_id) continue
    if (u.tipo_evento !== 'clique_cta') continue
    contagemUnicos.set(u.conteudo_item_id, (contagemUnicos.get(u.conteudo_item_id) ?? 0) + 1)
  }
  for (const [itemId, contagem] of contagemUnicos) {
    const alvo = porItem.get(itemId)
    if (!alvo) continue
    alvo.cliques_cta_unicos = contagem
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

// ─── Exclusão de usuários internos (SUPER_USUARIO) ─────────────────────────
// O sistema hospedeiro (Quark) marca contas internas/administrativas com
// contexto.usuario_tipo === 'SUPER_USUARIO' no init() do widget — esse valor
// vai parar no JSON `contexto` de EventoCampanha/Feedback/ConfirmacaoLeitura.
// Por PADRÃO o dashboard inteiro (KPIs, gráficos, listas, totais derivados)
// desconsidera essas contas; ?incluir_super_usuario=true reinclui.
export const PERFIL_SUPER_USUARIO = 'SUPER_USUARIO'
// Nome da chave dentro de `contexto` (mesma usada pela coluna "Usuário Tipo"
// e pelo filtro "Perfil" do dashboard — ver CampanhaDashboard.tsx).
const CHAVE_PERFIL_CONTEXTO = 'usuario_tipo'

export function incluirSuperUsuario(query: Request['query']): boolean {
  return query.incluir_super_usuario === 'true' || query.incluir_super_usuario === '1'
}

// Envolve QUALQUER where de Feedback/EventoCampanha/ConfirmacaoLeitura do
// dashboard, adicionando (via AND, pra nunca colidir com um OR/AND já
// existente no where) a condição que exclui as contas internas. Quando
// `incluir` é true devolve o where intacto.
//
// As três cláusulas do OR são necessárias e foram verificadas contra o
// Postgres local: o `NOT { path, equals }` puro do Prisma descarta linhas
// cujo `contexto` é nulo OU não tem a chave `usuario_tipo` (semântica de
// NULL do SQL) — o que apagaria dados antigos sem perfil das métricas. As
// duas primeiras cláusulas reincluem exatamente esses casos, de forma que
// só some a linha cujo usuario_tipo é EXATAMENTE 'SUPER_USUARIO'.
export function semSuperUsuario<W extends object>(where: W, incluir: boolean): W {
  if (incluir) return where
  return {
    AND: [
      where,
      {
        OR: [
          { contexto: { equals: Prisma.DbNull } },
          { contexto: { path: [CHAVE_PERFIL_CONTEXTO], equals: Prisma.AnyNull } },
          { NOT: { contexto: { path: [CHAVE_PERFIL_CONTEXTO], equals: PERFIL_SUPER_USUARIO } } },
        ],
      },
    ],
  } as unknown as W
}

// Fragmento equivalente para as queries em SQL cru ($queryRaw sobre
// eventos_campanha). `IS DISTINCT FROM` é null-safe: quando o extract é NULL
// (contexto nulo, sem a chave, ou JSON null) o resultado é TRUE, então a
// linha continua contando — mesma regra do semSuperUsuario acima.
export function sqlSemSuperUsuario(incluir: boolean): Prisma.Sql {
  // `usuario_tipo` é constante de código (nunca entrada do usuário) — literal
  // direto no SQL; só o valor comparado vira parâmetro.
  return incluir
    ? Prisma.empty
    : Prisma.sql`AND (contexto->>'usuario_tipo' IS DISTINCT FROM ${PERFIL_SUPER_USUARIO})`
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

function intervaloAnterior(range: { gte?: Date; lte?: Date }) {
  if (!range.gte || !range.lte) return null
  const duracao = range.lte.getTime() - range.gte.getTime() + 1
  return {
    gte: new Date(range.gte.getTime() - duracao),
    lte: new Date(range.gte.getTime() - 1),
  }
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
  // Filtro por conteúdo (seção "Cliques CTA por conteúdo") — id específico, ou
  // a sentinela __nao_identificado__.
  if (typeof query.conteudo_id === 'string' && query.conteudo_id) {
    if (query.conteudo_id === '__nao_identificado__') {
      // "Não identificado" = clique no CTA que não carregou conteudo_item_id
      // (evento legado, embed antigo sem data-up-conteudo-id, ou conteúdo já
      // removido — FK ON DELETE SET NULL). Restringe a clique_cta pra NÃO
      // trazer visualizacao/dispensa/interacao_badge, que têm
      // conteudo_item_id null por natureza. Via AND: se o filtro de Tipo já
      // fixou outro tipo_evento acima, a combinação incompatível vira lista
      // vazia (previsível), nunca "vaza" outros eventos.
      where.conteudo_item_id = null
      where.AND = [{ tipo_evento: 'clique_cta' }]
    } else {
      where.conteudo_item_id = query.conteudo_id
    }
  }
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
    // Padrão do dashboard: desconsiderar contas internas (SUPER_USUARIO).
    // Resolvido UMA vez aqui e aplicado a todas as queries abaixo, pra
    // numerador e denominador nunca usarem universos diferentes.
    const incluirSuper = incluirSuperUsuario(req.query)
    const sqlSemSuper = sqlSemSuperUsuario(incluirSuper)
    // Filtros da tabela nunca podem alterar os KPIs, distribuição ou NPS.
    // Mantemos dois universos: período para o resumo e filtros para a lista.
    const feedbackPeriodoWhere: Prisma.FeedbackWhereInput = semSuperUsuario({ ...whereFeedbackNps(id), criado_em: range }, incluirSuper)
    const feedbackWhere = semSuperUsuario(filtrosFeedback(req.query, id), incluirSuper)
    const eventosWhere = semSuperUsuario(filtrosEventos(req.query, id), incluirSuper)
    const respPag = pagina({ page: req.query.res_page, per_page: req.query.res_per_page }, 10)
    const interPag = pagina({ page: req.query.event_page, per_page: req.query.event_per_page }, 10)
    const avalPag = pagina({ page: req.query.avaliacao_page, per_page: req.query.avaliacao_per_page }, 10)
    const eventosPeriodoWhere = semSuperUsuario({ campanha_id: id, criado_em: range }, incluirSuper)
    const utilidadePeriodoWhere = semSuperUsuario({ ...whereUtilidadeDestaque(id), criado_em: range }, incluirSuper)
    const avaliacaoWhereBase: Prisma.FeedbackWhereInput = { ...whereUtilidadeDestaque(id), criado_em: range }
    if (typeof req.query.avaliacao_destaque_id === 'string' && req.query.avaliacao_destaque_id) avaliacaoWhereBase.destaque_item_id = req.query.avaliacao_destaque_id
    if (req.query.avaliacao_util === 'sim') avaliacaoWhereBase.util = true
    if (req.query.avaliacao_util === 'nao') avaliacaoWhereBase.util = false
    if (typeof req.query.busca_avaliacao === 'string' && req.query.busca_avaliacao.trim()) {
      const termo = req.query.busca_avaliacao.trim()
      avaliacaoWhereBase.OR = [
        { usuario_id: { contains: termo, mode: 'insensitive' } },
        { usuario_nome: { contains: termo, mode: 'insensitive' } },
        { usuario_email: { contains: termo, mode: 'insensitive' } },
        { observacao: { contains: termo, mode: 'insensitive' } },
        { contexto: { path: ['usuario_nome'], string_contains: termo } },
        { contexto: { path: ['usuario_email'], string_contains: termo } },
      ]
    }
    const avaliacaoWhere = semSuperUsuario(avaliacaoWhereBase, incluirSuper)

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
      itensConteudo, totaisPorConteudo, unicosPorConteudo, cliques_cta_sem_conteudo,
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
      prisma.confirmacaoLeitura.count({ where: semSuperUsuario({ campanha_id: id, criado_em: range }, incluirSuper) }),

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
            where: utilidadePeriodoWhere,
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
          ${sqlSemSuper}
        GROUP BY DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY data ASC
      `,
      prisma.$queryRaw<Array<{ dia: number; visualizacoes: bigint }>>`
        SELECT EXTRACT(DOW FROM criado_em AT TIME ZONE 'America/Sao_Paulo')::int AS dia, COUNT(*)::bigint AS visualizacoes
        FROM eventos_campanha
        WHERE campanha_id = ${id} AND tipo_evento = 'visualizacao'
          ${range.gte ? Prisma.sql`AND criado_em >= ${range.gte}` : Prisma.empty}
          ${range.lte ? Prisma.sql`AND criado_em <= ${range.lte}` : Prisma.empty}
          ${sqlSemSuper}
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
            where: utilidadePeriodoWhere,
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

      // ─── Desempenho por conteúdo (Etapa 4) — só campanhas que NÃO são
      // destaque_elemento. Sem filtro de `ativo` (CampanhaConteudoItem não
      // tem essa coluna — "remover" um conteúdo já é DELETE de verdade).
      // Ordenado por `ordem` ASC, base de montarDesempenhoConteudos.
      ehDestaqueElemento
        ? Promise.resolve([])
        : prisma.campanhaConteudoItem.findMany({
            where: { campanha_id: id },
            orderBy: { ordem: 'asc' },
            select: { id: true, titulo: true, ordem: true, url_botao: true },
          }),
      // Total de clique_cta por conteúdo — mesmo padrão do groupBy de
      // destaque, restrito a clique_cta e a eventos que carregam conteudo_item_id.
      ehDestaqueElemento
        ? Promise.resolve([])
        : prisma.eventoCampanha.groupBy({
            by: ['conteudo_item_id', 'tipo_evento'],
            where: { ...eventosPeriodoWhere, tipo_evento: 'clique_cta', conteudo_item_id: { not: null } },
            _count: { id: true },
          }),
      // Únicos por conteúdo — groupBy de 3 colunas (já deduplicado pelo
      // banco), só usuario_id não-null; consolidação por conteúdo é feita em
      // montarDesempenhoConteudos.
      ehDestaqueElemento
        ? Promise.resolve([])
        : prisma.eventoCampanha.groupBy({
            by: ['conteudo_item_id', 'tipo_evento', 'usuario_id'],
            where: { ...eventosPeriodoWhere, tipo_evento: 'clique_cta', conteudo_item_id: { not: null }, usuario_id: { not: null } },
          }),
      // Bucket "sem conteúdo": clique_cta com conteudo_item_id nulo — eventos
      // antigos, fallback legado do widget, ou conteúdo já removido. Nunca
      // vira uma linha de conteúdo (ver montarDesempenhoConteudos). 0 pra
      // destaque_elemento, que não usa este mecanismo.
      ehDestaqueElemento
        ? Promise.resolve(0)
        : prisma.eventoCampanha.count({
            where: { ...eventosPeriodoWhere, tipo_evento: 'clique_cta', conteudo_item_id: null },
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
    // Etapa 4 — desempenho por conteúdo. Só pra campanha que NÃO é
    // destaque_elemento; campanha sem conteúdos -> itensConteudo vazio ->
    // array vazio. Não altera nenhum KPI geral nem o bloco de destaque.
    const desempenho_conteudos = ehDestaqueElemento
      ? []
      : montarDesempenhoConteudos(itensConteudo, totaisPorConteudo, unicosPorConteudo)
    const destaqueResumoPeriodo = {
      interacoes: destaqueEventosPeriodo.find(item => item.tipo_evento === 'interacao_badge')?._count.id ?? 0,
      dispensas: destaqueEventosPeriodo.find(item => item.tipo_evento === 'dispensa')?._count.id ?? 0,
      avaliacoes: destaqueAvaliacoesPeriodo.reduce((sum, item) => sum + item._count.id, 0),
      sim: destaqueAvaliacoesPeriodo.find(item => item.util === true)?._count.id ?? 0,
    }

    // Não há comparação honesta para "Todo período"; só calculamos a janela
    // imediatamente anterior quando o usuário forneceu início e fim.
    const rangeAnterior = intervaloAnterior(range)
    let comparacao: { visualizacoes: number; respostas: number; cliques_cta: number; nps: number | null; media: number | null } | null = null
    let serie_impressao_anterior: Array<{ data: string; visualizacoes: number }> = []
    if (rangeAnterior) {
      const [visualizacoesAnterior, cliquesAnterior, respostasAnteriores, notasAnteriores, mediaAnterior, serieAnterior] = await Promise.all([
        prisma.eventoCampanha.count({ where: semSuperUsuario({ campanha_id: id, tipo_evento: 'visualizacao', criado_em: rangeAnterior }, incluirSuper) }),
        prisma.eventoCampanha.count({ where: semSuperUsuario({ campanha_id: id, tipo_evento: 'clique_cta', criado_em: rangeAnterior }, incluirSuper) }),
        prisma.feedback.count({ where: semSuperUsuario({ ...whereFeedbackNps(id), criado_em: rangeAnterior }, incluirSuper) }),
        prisma.feedback.groupBy({ by: ['nota'], where: semSuperUsuario({ ...whereFeedbackNps(id), criado_em: rangeAnterior }, incluirSuper), _count: { nota: true } }),
        prisma.feedback.aggregate({ where: semSuperUsuario({ ...whereFeedbackNps(id), criado_em: rangeAnterior }, incluirSuper), _avg: { nota: true } }),
        prisma.$queryRaw<Array<{ data: string; visualizacoes: bigint }>>`
          SELECT TO_CHAR(DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS data,
                 COUNT(*)::bigint AS visualizacoes
          FROM eventos_campanha
          WHERE campanha_id = ${id} AND tipo_evento = 'visualizacao'
            AND criado_em >= ${rangeAnterior.gte} AND criado_em <= ${rangeAnterior.lte}
            ${sqlSemSuper}
          GROUP BY DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo')
          ORDER BY data ASC
        `,
      ])
      const totalNotasAnteriores = notasAnteriores.reduce((sum, item) => sum + item._count.nota, 0)
      const promotoresAnteriores = notasAnteriores.filter(item => item.nota !== null && item.nota >= 9).reduce((sum, item) => sum + item._count.nota, 0)
      const detratoresAnteriores = notasAnteriores.filter(item => item.nota !== null && item.nota <= 6).reduce((sum, item) => sum + item._count.nota, 0)
      comparacao = {
        visualizacoes: visualizacoesAnterior,
        respostas: respostasAnteriores,
        cliques_cta: cliquesAnterior,
        nps: totalNotasAnteriores > 0 ? Math.round((promotoresAnteriores - detratoresAnteriores) / totalNotasAnteriores * 100) : null,
        media: mediaAnterior._avg.nota !== null ? Math.round(mediaAnterior._avg.nota * 10) / 10 : null,
      }
      serie_impressao_anterior = normalizarSerieImpressao(serieAnterior)
    }

    res.json({
      campanha,
      periodo: { inicio: range.gte?.toISOString() ?? null, fim: range.lte?.toISOString() ?? null },
      comparacao,
      serie_diaria: [],
      serie_diaria_anterior: [],
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
      desempenho_conteudos,
      cliques_cta_sem_conteudo,
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
      serie_impressao_anterior,
      atividade_semana: normalizarAtividadeDiaSemana(atividade_semana),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard.' })
  }
}
