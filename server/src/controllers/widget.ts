import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { resolverTenantPublico } from '../lib/tenantGuards'

// tenant_id/codigo são identificadores internos/comerciais (fundação SaaS
// multi-tenant, ver schema.prisma) — nenhum dos dois deve aparecer numa
// resposta pública do widget. Em vez de reescrever cada select do Prisma
// campo a campo (arriscado: um campo esquecido quebraria o runtime do widget
// em produção, silenciosamente), esta função remove essas duas chaves de
// qualquer objeto/array antes do res.json(), em qualquer profundidade — cobre
// tanto o objeto de topo (Campanha/TourGuiado/Jornada) quanto qualquer objeto
// aninhado. Hoje só Tenant tem "codigo" (Campanha/TourGuiado/Jornada nunca
// carregam esse campo, então o strip é defensivo/sem efeito atual — nenhum
// desses modelos é consultado aqui), e a função não depende disso pra estar
// correta. Não remove nem altera nenhum outro campo.
const CHAVES_INTERNAS = new Set(['tenant_id', 'codigo', 'nome_interno'])

export function ocultarTenantId<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map(item => ocultarTenantId(item)) as unknown as T
  }
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    const resto: Record<string, unknown> = {}
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_INTERNAS.has(chave)) continue
      resto[chave] = ocultarTenantId(v)
    }
    return resto as unknown as T
  }
  return valor
}

interface SegCtx {
  cliente_id?: string
  unidade_id?: string
  perfil?: string
  usuario_tipo?: string
  estado?: string
  dominio?: string
}

interface SegCampanha {
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
  // Opcional: Jornada reusa este mesmo tipo/passaSegmentacao mas não tem
  // coluna segmentar_dominios (só Campanha) — undefined aqui equivale a
  // "sem restrição de domínio", mesmo comportamento de uma lista vazia.
  segmentar_dominios?: string[]
}

export function passaSegmentacao(campanha: SegCampanha, ctx: SegCtx): boolean {
  const check = (lista: string[], valor?: string) => {
    if (lista.length === 0) return true
    if (!valor) return false
    return lista.includes(valor)
  }
  // Domínio sempre comparado em lowercase nos dois lados — nunca confia que
  // o valor salvo no admin já veio normalizado (defesa em profundidade, além
  // da normalização em campanhas.ts na gravação).
  const checkDominio = (lista: string[] | undefined, valor?: string) => {
    if (!lista || lista.length === 0) return true
    if (!valor) return false
    const alvo = valor.toLowerCase()
    return lista.some(d => d.toLowerCase() === alvo)
  }
  return (
    check(campanha.segmentar_cliente_ids, ctx.cliente_id) &&
    check(campanha.segmentar_unidade_ids, ctx.unidade_id) &&
    check(campanha.segmentar_perfis, ctx.perfil) &&
    check(campanha.segmentar_usuario_tipos, ctx.usuario_tipo) &&
    check(campanha.segmentar_estados, ctx.estado) &&
    checkDominio(campanha.segmentar_dominios, ctx.dominio)
  )
}

// Filtro de /api/widget/candidatas — extraído de buscarCandidatas() pra
// poder testar sem banco (mesmo padrão de fonteReferenciaReexibicao/
// avaliarReexibicaoPorDias acima). tenant_id/ativo continuam aplicados pelo
// caller (buscarCandidatas), fora daqui — nunca weakened por esta função.
//
// sistema agora usa mode:'insensitive' — o cadastro de Sistema já trata
// `identificador` como case-insensitive pra unicidade (ver sistemas.ts,
// mesmo mode:'insensitive'), mas essa rota comparava com igualdade exata:
// uma campanha com sistema "quarkclinic" nunca batia com uma consulta
// sistema=QuarkClinic (nem o inverso), embora ambos sejam "o mesmo sistema"
// pra quem cadastrou. Sem isso, /api/widget/candidatas podia devolver []
// pra uma campanha ativa, elegível em todo o resto, só por causa da caixa.
//
// modo_identificacao=data_cy (e url_contem) continuam SEMPRE incluídos no
// OR, independente da `tela` da campanha ou da que o widget informou — o
// alvo de um data_cy é o próprio elemento, não uma tela; a checagem real
// (elemento existe no DOM) é feita pelo widget depois de receber a
// candidata (ver checkMode em widget.js). Isso já era o comportamento
// antes desta extração — só ficou mais fácil de testar/documentar.
export function construirFiltroCandidatas(sistema: unknown, tela: unknown, gatilho: unknown, evento: unknown): object {
  const gatilhoStr = gatilho === 'apos_evento' ? 'apos_evento' : 'ao_abrir_tela'
  const gatilhoFilter =
    gatilhoStr === 'apos_evento' && evento
      ? { gatilho: 'apos_evento', evento: String(evento) }
      : { gatilho: 'ao_abrir_tela' }

  const modoFiltros: object[] = []
  if (tela) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: String(tela) })
  modoFiltros.push({ modo_identificacao: 'data_cy' })
  modoFiltros.push({ modo_identificacao: 'url_contem' })

  return {
    sistema: { equals: String(sistema), mode: 'insensitive' as const },
    ...gatilhoFilter,
    OR: modoFiltros,
  }
}

function isAlwaysShowUser(usuarioId?: string): boolean {
  if (!usuarioId) return false
  const raw = process.env.USERPULSE_ALWAYS_SHOW_USER_IDS || ''
  if (!raw.trim()) return false
  return raw.split(',').map(s => s.trim()).filter(Boolean).includes(usuarioId)
}

type HistoricoResult =
  | { bloqueado: false }
  | { bloqueado: true; motivo: string }

interface CampanhaReexibicao {
  politica_reexibicao: string
  reexibir_apos_dias: number | null
  intervalo_reexibicao_dias: number | null
  exige_confirmacao_leitura: boolean
  feedback_habilitado: boolean
}

interface HistoricoReexibicao {
  ultimaVisualizacao: Date | null
  ultimoFeedback: Date | null
  ultimaConfirmacao: Date | null
}

// Fonte única do filtro usado pelo gating de "campanha respondida"
// (reexibição) — só o feedback GERAL (nps/csat, resolvido por
// Campanha.tipo_avaliacao_feedback) conta; utilidade_destaque nunca
// participa aqui, nem bloqueia nem é bloqueado por nps/csat (regra de
// produto: são independentes). Reaproveitada por verificarHistorico
// (widget.ts, gating real do widget público) e pelo diagnóstico/simulação
// de elegibilidade em campanhas.ts, pra nunca divergir entre os dois.
// Função pura, testável sem Prisma real.
export function filtroFeedbackGeralReexibicao(
  campanhaId: string,
  usuarioId: string,
  tipoAvaliacaoFeedback: string
): { campanha_id: string; usuario_id: string; tipo_avaliacao: string } {
  return { campanha_id: campanhaId, usuario_id: usuarioId, tipo_avaliacao: tipoAvaliacaoFeedback }
}

// Qual evento serve de referência para a contagem de "reexibir após X dias".
// A contagem deve reiniciar apenas com uma resposta (feedback/NPS ou confirmação de leitura) —
// visualizar, fechar sem responder, clicar no CTA ou disparar um evento genérico não contam.
export type FonteReferenciaReexibicao = 'confirmacao' | 'feedback' | 'visualizacao'

export function fonteReferenciaReexibicao(campanha: {
  exige_confirmacao_leitura: boolean
  feedback_habilitado: boolean
}): FonteReferenciaReexibicao {
  if (campanha.exige_confirmacao_leitura) return 'confirmacao'
  if (campanha.feedback_habilitado) return 'feedback'
  // Campanha sem resposta/confirmação (ex.: comunicado informativo) — usa a última visualização.
  return 'visualizacao'
}

const MOTIVO_BASE_REEXIBICAO: Record<FonteReferenciaReexibicao, string> = {
  confirmacao: 'Campanha já confirmada.',
  feedback: 'Campanha já respondida.',
  visualizacao: 'Campanha já exibida.',
}

// Função pura: decide se a política "reexibir_apos_dias" bloqueia a exibição,
// dado a referência (data já resolvida pelo caller) e a data atual.
export function avaliarReexibicaoPorDias(
  dias: number | null,
  referencia: Date | null,
  agora: Date,
  fonte: FonteReferenciaReexibicao
): HistoricoResult {
  if (!dias || dias <= 0) return { bloqueado: false }
  if (!referencia) return { bloqueado: false }

  const diasDesde = Math.floor((agora.getTime() - referencia.getTime()) / 86400000)
  if (diasDesde < dias) {
    return {
      bloqueado: true,
      motivo: MOTIVO_BASE_REEXIBICAO[fonte] + ' Disponível novamente em ' + (dias - diasDesde) + ' dia(s).',
    }
  }
  return { bloqueado: false }
}

// Decisão autoritativa e pura das três políticas existentes. O campo
// intervalo_reexibicao_dias antecede reexibir_apos_dias; continua valendo
// como fallback para campanhas legadas que já o tinham preenchido.
export function avaliarPoliticaReexibicao(
  campanha: CampanhaReexibicao,
  historico: HistoricoReexibicao,
  agora: Date
): HistoricoResult {
  const policy = campanha.politica_reexibicao || 'uma_vez_apos_visualizacao'

  if (policy === 'uma_vez_apos_visualizacao') {
    if (historico.ultimaVisualizacao) return { bloqueado: true, motivo: 'Campanha já exibida para este usuário.' }
    if (campanha.exige_confirmacao_leitura && historico.ultimaConfirmacao) {
      return { bloqueado: true, motivo: 'Campanha já confirmada por este usuário.' }
    }
    if (!campanha.exige_confirmacao_leitura && historico.ultimoFeedback) {
      return { bloqueado: true, motivo: 'Campanha já respondida por este usuário.' }
    }
  }

  if (policy === 'ate_responder_ou_confirmar') {
    if (campanha.exige_confirmacao_leitura && historico.ultimaConfirmacao) {
      return { bloqueado: true, motivo: 'Campanha já confirmada por este usuário.' }
    }
    if (!campanha.exige_confirmacao_leitura && historico.ultimoFeedback) {
      return { bloqueado: true, motivo: 'Campanha já respondida por este usuário.' }
    }
  }

  if (policy === 'reexibir_apos_dias') {
    const dias = campanha.reexibir_apos_dias ?? campanha.intervalo_reexibicao_dias
    const fonte = fonteReferenciaReexibicao(campanha)
    const referencia = fonte === 'confirmacao'
      ? historico.ultimaConfirmacao
      : fonte === 'feedback'
        ? historico.ultimoFeedback
        : historico.ultimaVisualizacao
    return avaliarReexibicaoPorDias(dias, referencia, agora, fonte)
  }

  return { bloqueado: false }
}

async function verificarHistorico(
  campanha: {
    id: string
    politica_reexibicao: string
    reexibir_apos_dias: number | null
    intervalo_reexibicao_dias: number | null
    exige_confirmacao_leitura: boolean
    feedback_habilitado: boolean
    tipo_avaliacao_feedback: string
  },
  uidStr: string,
  agora: Date,
  opcoes: { ignorarVisualizacao?: boolean } = {}
): Promise<HistoricoResult> {
  // Gating de reexibição é só sobre o feedback GERAL da campanha (nps/csat,
  // resolvido por Campanha.tipo_avaliacao_feedback) — utilidade_destaque é
  // independente por definição (avaliar "essa melhoria foi útil?" num
  // destaque nunca conta como "respondeu a campanha", e nunca é bloqueado
  // por já ter respondido NPS/CSAT nem vice-versa). Ver validarAvaliacaoFeedback.
  const filtroFeedbackGeral = filtroFeedbackGeralReexibicao(campanha.id, uidStr, campanha.tipo_avaliacao_feedback)

  const [ultimaViz, ultimoFb, ultimaConf] = await Promise.all([
    prisma.eventoCampanha.findFirst({
      where: { campanha_id: campanha.id, usuario_id: uidStr, tipo_evento: 'visualizacao' },
      orderBy: { criado_em: 'desc' },
    }),
    prisma.feedback.findFirst({ where: filtroFeedbackGeral, orderBy: { criado_em: 'desc' } }),
    prisma.confirmacaoLeitura.findFirst({
      where: { campanha_id: campanha.id, usuario_id: uidStr },
      orderBy: { criado_em: 'desc' },
    }),
  ])

  return avaliarPoliticaReexibicao(campanha, {
    ultimaVisualizacao: opcoes.ignorarVisualizacao ? null : (ultimaViz?.criado_em ?? null),
    ultimoFeedback: ultimoFb?.criado_em ?? null,
    ultimaConfirmacao: ultimaConf?.criado_em ?? null,
  }, agora)
}

type ConclusaoResult = { bloqueado: false } | { bloqueado: true; eventoEm: Date }

async function verificarConclusaoGlobal(
  campanha: {
    sistema: string
    evento_conclusao: string | null
    segmentar_cliente_ids: string[]
    segmentar_unidade_ids: string[]
    segmentar_perfis: string[]
    segmentar_usuario_tipos: string[]
    segmentar_estados: string[]
  },
  uidStr: string,
  tenantId: string
): Promise<ConclusaoResult> {
  if (!campanha.evento_conclusao) return { bloqueado: false }
  // tenant_id aqui fecha a última colisão por "sistema" entre tenants (ver
  // comentário de EventoUsuario em schema.prisma) — sem isso, dois tenants
  // usando o mesmo "sistema"+usuario_id+evento_conclusao podiam concluir a
  // campanha um do outro.
  const eventos = await prisma.eventoUsuario.findMany({
    where: { tenant_id: tenantId, sistema: campanha.sistema, usuario_id: uidStr, evento: campanha.evento_conclusao },
    orderBy: { criado_em: 'desc' },
  })
  for (const ev of eventos) {
    const ok = (
      (campanha.segmentar_cliente_ids.length === 0 || (ev.cliente_id !== null && campanha.segmentar_cliente_ids.includes(ev.cliente_id))) &&
      (campanha.segmentar_unidade_ids.length === 0 || (ev.unidade_id !== null && campanha.segmentar_unidade_ids.includes(ev.unidade_id))) &&
      (campanha.segmentar_perfis.length === 0 || (ev.perfil !== null && campanha.segmentar_perfis.includes(ev.perfil))) &&
      (campanha.segmentar_usuario_tipos.length === 0 || (ev.usuario_tipo !== null && campanha.segmentar_usuario_tipos.includes(ev.usuario_tipo))) &&
      (campanha.segmentar_estados.length === 0 || (ev.estado !== null && campanha.segmentar_estados.includes(ev.estado)))
    )
    if (ok) return { bloqueado: true, eventoEm: ev.criado_em }
  }
  return { bloqueado: false }
}

export async function buscarCampanha(req: Request, res: Response) {
  try {
    const { public_key, slug, sistema, tela, usuario_id, evento, cliente_id, unidade_id, perfil, usuario_tipo, estado, dominio } = req.query

    if (!slug && (!sistema || !tela)) {
      return res.status(400).json({ erro: 'Informe slug ou sistema+tela.' })
    }

    // Fase 2 do widget multi-tenant: resolve o tenant por public_key (com
    // fallback temporário pro tenant Quark — ver resolverTenantPublico) e
    // escopa a busca por tenant_id, evitando colisão quando dois tenants
    // usam o mesmo "sistema"/slug. public_key inválida responde a MESMA
    // mensagem de "não encontrada" que qualquer outro motivo de 404 aqui —
    // nunca revela se a chave existe.
    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) {
      return res.status(404).json({ erro: 'Nenhuma campanha ativa encontrada.' })
    }

    const agora = new Date()
    const filtroData = {
      AND: [
        { OR: [{ data_inicio: null }, { data_inicio: { lte: agora } }] },
        { OR: [{ data_fim: null }, { data_fim: { gte: agora } }] },
      ],
    }

    const campanhaFilter = slug
      ? { slug: String(slug) }
      : evento
      ? { sistema: String(sistema), tela: String(tela), gatilho: 'apos_evento', evento: String(evento), modo_identificacao: 'sistema_tela' }
      : { sistema: String(sistema), tela: String(tela), gatilho: 'ao_abrir_tela', modo_identificacao: 'sistema_tela' }

    const campanha = await prisma.campanha.findFirst({
      where: {
        tenant_id: resolucao.tenantId,
        // Fase 1 dos 3 status — status é a fonte única de verdade de
        // elegibilidade pública; `ativo` (mantido só por compatibilidade de
        // deploy) nunca é lido aqui.
        status: 'ATIVA',
        ...campanhaFilter,
        ...filtroData,
      },
      orderBy: [
        { prioridade: 'desc' },
        { criado_em: 'desc' },
      ],
      // Múltiplos destaques (Fase 2) — só os itens ativos, na ordem
      // configurada; tenant_id de cada item é removido por ocultarTenantId
      // logo abaixo (recursivo, cobre objetos aninhados). Campos legados de
      // Campanha (data_cy/titulo/descricao/...) continuam na resposta —
      // servem de fallback pro widget quando `destaques` vier vazio (campanha
      // ainda não migrada).
      //
      // Múltiplos conteúdos (Etapa 2/widget Etapa 3) — mecanismo
      // independente de `destaques` acima, nunca misturar os dois. Sem
      // filtro de `ativo` (CampanhaConteudoItem não tem essa coluna — ver
      // schema.prisma, "remover" um conteúdo já é DELETE de verdade).
      // Faltava aqui: controllers/campanhas.ts (rotas administrativas) já
      // incluía `conteudos`, mas as rotas públicas do widget nunca foram
      // atualizadas — conteudoResolverItens (widget.js) sempre caía no
      // fallback legado por falta deste include, mesmo com itens reais
      // persistidos.
      include: {
        destaques: { where: { ativo: true }, orderBy: { ordem: 'asc' } },
        conteudos: { orderBy: { ordem: 'asc' } },
      },
    })

    if (!campanha) {
      return res.status(404).json({ erro: 'Nenhuma campanha ativa encontrada.' })
    }

    const ctx: SegCtx = {
      cliente_id: cliente_id ? String(cliente_id) : undefined,
      unidade_id: unidade_id ? String(unidade_id) : undefined,
      perfil: perfil ? String(perfil) : undefined,
      usuario_tipo: usuario_tipo ? String(usuario_tipo) : undefined,
      estado: estado ? String(estado) : undefined,
      dominio: dominio ? String(dominio) : undefined,
    }

    if (!passaSegmentacao(campanha, ctx)) {
      return res.status(404).json({ erro: 'Nenhuma campanha ativa encontrada.' })
    }

    const alwaysShow = usuario_id ? isAlwaysShowUser(String(usuario_id)) : false

    // Conclusao check always applies — not bypassed by always-show
    if (usuario_id && campanha.encerrar_apos_evento && campanha.evento_conclusao) {
      const conclusao = await verificarConclusaoGlobal(campanha, String(usuario_id), resolucao.tenantId)
      if (conclusao.bloqueado) {
        return res.status(404).json({ erro: 'Usuário já realizou o evento de conclusão desta campanha.' })
      }
    }

    if (usuario_id && !alwaysShow) {
      const resultado = await verificarHistorico(campanha, String(usuario_id), agora)
      if (resultado.bloqueado) {
        return res.status(404).json({ erro: resultado.motivo })
      }
    }

    res.json(ocultarTenantId(alwaysShow ? { ...campanha, always_show_user: true } : campanha))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanha.' })
  }
}

export async function buscarCandidatas(req: Request, res: Response) {
  try {
    const { public_key, sistema, tela, gatilho, evento, usuario_id, cliente_id, unidade_id, perfil, usuario_tipo, estado, dominio } = req.query

    if (!sistema) {
      return res.status(400).json({ erro: 'Informe sistema.' })
    }

    // Endpoint de "candidatas" — public_key inválida/ausente-sem-fallback
    // nunca é erro aqui, só significa "nenhuma candidata" (mesmo padrão de
    // resposta vazia que qualquer outro filtro sem resultado nesta rota).
    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.json([])

    const agora = new Date()
    const filtroData = {
      AND: [
        { OR: [{ data_inicio: null }, { data_inicio: { lte: agora } }] },
        { OR: [{ data_fim: null }, { data_fim: { gte: agora } }] },
      ],
    }

    const campanhas = await prisma.campanha.findMany({
      where: {
        tenant_id: resolucao.tenantId,
        // Fase 1 dos 3 status — ver comentário equivalente em buscarCampanha.
        status: 'ATIVA',
        ...construirFiltroCandidatas(sistema, tela, gatilho, evento),
        ...filtroData,
      },
      orderBy: [{ prioridade: 'desc' }, { criado_em: 'desc' }],
      // Ver comentário equivalente (destaques + conteudos) em buscarCampanha
      // logo acima.
      include: {
        destaques: { where: { ativo: true }, orderBy: { ordem: 'asc' } },
        conteudos: { orderBy: { ordem: 'asc' } },
      },
    })

    const ctx: SegCtx = {
      cliente_id: cliente_id ? String(cliente_id) : undefined,
      unidade_id: unidade_id ? String(unidade_id) : undefined,
      perfil: perfil ? String(perfil) : undefined,
      usuario_tipo: usuario_tipo ? String(usuario_tipo) : undefined,
      estado: estado ? String(estado) : undefined,
      dominio: dominio ? String(dominio) : undefined,
    }

    const segmentadas = campanhas.filter(c => passaSegmentacao(c, ctx))

    const alwaysShow = usuario_id ? isAlwaysShowUser(String(usuario_id)) : false

    if (!usuario_id || segmentadas.length === 0) {
      return res.json(ocultarTenantId(segmentadas))
    }

    const uidStr = String(usuario_id)

    // Step 1: filter conclusao — applies even to always-show users
    const semConclusao: typeof segmentadas = []
    for (const campanha of segmentadas) {
      if (campanha.encerrar_apos_evento && campanha.evento_conclusao) {
        const conclusao = await verificarConclusaoGlobal(campanha, uidStr, resolucao.tenantId)
        if (conclusao.bloqueado) continue
      }
      semConclusao.push(campanha)
    }

    if (alwaysShow) {
      return res.json(ocultarTenantId(semConclusao.map(c => ({ ...c, always_show_user: true }))))
    }

    // Step 2: filter by reexhibition policy
    const elegiveis: typeof segmentadas = []
    for (const campanha of semConclusao) {
      const resultado = await verificarHistorico(campanha, uidStr, agora)
      if (!resultado.bloqueado) {
        elegiveis.push(campanha)
      }
    }

    res.json(ocultarTenantId(elegiveis))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanhas candidatas.' })
  }
}

// Tipos de evento aceitos por /api/widget/evento. Os 2 primeiros já
// existiam (modal_automatica); os 2 últimos são específicos de
// destaque_elemento — o widget manda destaque_item_id junto (ver
// validarDestaqueItemEvento abaixo), nunca os outros dois formatos.
export const TIPOS_EVENTO_CAMPANHA = ['visualizacao', 'clique_cta', 'interacao_badge', 'dispensa']

// Decide se um destaque_item_id enviado no evento pode ser aceito — função
// pura (não toca no banco), testável sem DB/tenant de verdade. Quem chama
// busca o item só por id (sem escopar por campanha_id na query, de
// propósito — ver comentário em validarOwnershipDestaques, campanhas.ts,
// mesmo raciocínio): a comparação `itemEncontrado.campanha_id === campanhaId`
// AQUI é que garante ownership + isolamento de tenant (um item de outra
// campanha, mesmo de outro tenant, nunca tem campanha_id igual ao da
// campanha resolvida por public_key). destaque_item_id ausente/vazio é
// válido (eventos de modal_automatica nunca mandam) — só valida quando
// alguma coisa foi de fato enviada.
export function validarDestaqueItemEvento(
  destaqueItemIdBruto: unknown,
  itemEncontrado: { id: string; campanha_id: string } | null,
  campanhaId: string
): { erro: string | null; destaqueItemId: string | null } {
  if (destaqueItemIdBruto === undefined || destaqueItemIdBruto === null || destaqueItemIdBruto === '') {
    return { erro: null, destaqueItemId: null }
  }
  if (typeof destaqueItemIdBruto !== 'string') {
    return { erro: 'destaque_item_id inválido.', destaqueItemId: null }
  }
  if (!itemEncontrado || itemEncontrado.id !== destaqueItemIdBruto || itemEncontrado.campanha_id !== campanhaId) {
    return { erro: 'destaque_item_id não pertence a esta campanha.', destaqueItemId: null }
  }
  return { erro: null, destaqueItemId: destaqueItemIdBruto }
}

export async function registrarEvento(req: Request, res: Response) {
  try {
    const { public_key, campanha_id, tipo_evento, destaque_item_id, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!campanha_id) return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })

    if (!TIPOS_EVENTO_CAMPANHA.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_EVENTO_CAMPANHA.join(', ')}.` })
    }

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    // tenant_id do id resolvido precisa bater com o dono real da campanha —
    // sem isso, um campanha_id de outro tenant (vazado/adivinhado) poderia
    // registrar eventos nela usando a public_key errada.
    if (!campanha || campanha.tenant_id !== resolucao.tenantId) {
      return res.status(404).json({ erro: 'Campanha não encontrada.' })
    }

    // Busca só por id (sem where campanha_id) — ownership/isolamento de
    // tenant são decididos por validarDestaqueItemEvento, não pela query.
    const itemDestaque = destaque_item_id
      ? await prisma.campanhaDestaqueItem.findUnique({ where: { id: String(destaque_item_id) } })
      : null
    const { erro: erroItem, destaqueItemId } = validarDestaqueItemEvento(destaque_item_id, itemDestaque, campanha_id)
    if (erroItem) return res.status(400).json({ erro: erroItem })

    await prisma.eventoCampanha.create({
      data: {
        campanha_id,
        tipo_evento,
        destaque_item_id: destaqueItemId,
        usuario_id: usuario_id || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar evento.' })
  }
}

export async function registrarConfirmacao(req: Request, res: Response) {
  try {
    const { public_key, campanha_id, usuario_id, usuario_nome, usuario_email, contexto } = req.body

    if (!campanha_id) return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    if (!usuario_id) return res.status(400).json({ erro: 'usuario_id é obrigatório.' })

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha || campanha.tenant_id !== resolucao.tenantId) {
      return res.status(404).json({ erro: 'Campanha não encontrada.' })
    }
    if (!campanha.exige_confirmacao_leitura) {
      return res.status(400).json({ erro: 'Esta campanha não exige confirmação de leitura.' })
    }

    const confirmacao = await prisma.confirmacaoLeitura.create({
      data: {
        campanha_id,
        usuario_id: String(usuario_id),
        usuario_nome: usuario_nome || null,
        usuario_email: usuario_email || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json(confirmacao)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar confirmação.' })
  }
}

// Tipos de avaliação suportados por Feedback.tipo_avaliacao. nps/csat são o
// feedback GERAL da campanha (POST /api/widget/feedback, registrarFeedback,
// tipo sempre resolvido por Campanha.tipo_avaliacao_feedback).
// utilidade_destaque é a avaliação por CampanhaDestaqueItem ("Essa melhoria
// foi útil?", POST /api/widget/feedback/utilidade-destaque,
// registrarUtilidadeDestaque) — independente do feedback geral por design,
// nunca participa do gating de reexibição dele (ver
// filtroFeedbackGeralReexibicao).
export const TIPOS_AVALIACAO_FEEDBACK = ['nps', 'csat', 'utilidade_destaque'] as const

export interface AvaliacaoValidada {
  erro: string | null
  nota: number | null
  util: boolean | null
  destaqueItemId: string | null
}

// Regra pura e centralizada por tipo de avaliação — quem chama SEMPRE
// resolve `tipoAvaliacao` a partir de Campanha.tipo_avaliacao_feedback
// (feedback geral) ou de um tipo fixo (utilidade_destaque), nunca de um
// campo enviado pelo cliente; esta função só decide se o valor recebido é
// válido PRO tipo já resolvido, nunca decide o tipo em si. Cada tipo produz
// só os campos que faz sentido (nota XOR util, nunca os dois), garantindo
// que nps/csat nunca gravam util/destaque_item_id e que utilidade_destaque
// nunca grava nota — sem precisar de validação extra pra rejeitar campos
// "emprestados" do outro formato, porque eles simplesmente nunca são lidos
// fora do branch certo.
// destaqueItemEncontrado só é relevante (e obrigatório) em
// utilidade_destaque — mesmo padrão de ownership/isolamento de tenant que
// validarDestaqueItemEvento já usa pra eventos: busca por id sozinho, e a
// comparação campanha_id aqui é que garante que um item de outra campanha
// (ou de outro tenant) nunca é aceito.
export function validarAvaliacaoFeedback(
  tipoAvaliacao: string,
  dados: { nota?: unknown; util?: unknown; destaque_item_id?: unknown },
  destaqueItemEncontrado: { id: string; campanha_id: string } | null,
  campanhaId: string
): AvaliacaoValidada {
  if (tipoAvaliacao === 'nps' || tipoAvaliacao === 'csat') {
    const faixa = tipoAvaliacao === 'csat' ? { min: 1, max: 5 } : { min: 0, max: 10 }
    if (dados.nota === undefined || dados.nota === null) {
      return { erro: 'nota é obrigatória.', nota: null, util: null, destaqueItemId: null }
    }
    const notaNum = Number(dados.nota)
    if (!Number.isInteger(notaNum) || notaNum < faixa.min || notaNum > faixa.max) {
      return { erro: `nota deve ser um inteiro entre ${faixa.min} e ${faixa.max}.`, nota: null, util: null, destaqueItemId: null }
    }
    return { erro: null, nota: notaNum, util: null, destaqueItemId: null }
  }

  if (tipoAvaliacao === 'utilidade_destaque') {
    if (typeof dados.util !== 'boolean') {
      return { erro: 'util é obrigatório e deve ser um boolean.', nota: null, util: null, destaqueItemId: null }
    }
    const destaqueItemIdBruto = dados.destaque_item_id
    if (typeof destaqueItemIdBruto !== 'string' || !destaqueItemIdBruto) {
      return { erro: 'destaque_item_id é obrigatório.', nota: null, util: null, destaqueItemId: null }
    }
    if (!destaqueItemEncontrado || destaqueItemEncontrado.id !== destaqueItemIdBruto || destaqueItemEncontrado.campanha_id !== campanhaId) {
      return { erro: 'destaque_item_id não pertence a esta campanha.', nota: null, util: null, destaqueItemId: null }
    }
    return { erro: null, nota: null, util: dados.util, destaqueItemId: destaqueItemIdBruto }
  }

  return { erro: `tipo_avaliacao inválido: ${tipoAvaliacao}.`, nota: null, util: null, destaqueItemId: null }
}

export async function registrarFeedback(req: Request, res: Response) {
  try {
    const {
      public_key, campanha_id, nota, observacao,
      usuario_id, usuario_nome, usuario_email,
      sistema, tela, navegador, dispositivo, contexto,
    } = req.body

    if (!campanha_id) {
      return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    }

    if (!usuario_id) {
      return res.status(400).json({ erro: 'usuario_id é obrigatório.' })
    }

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) {
      return res.status(400).json({ erro: 'Campanha não encontrada.' })
    }

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha || campanha.tenant_id !== resolucao.tenantId) {
      return res.status(400).json({ erro: 'Campanha não encontrada.' })
    }

    // A escrita aplica a mesma regra autoritativa das candidatas: conhecer
    // campanha_id e usuario_id não permite antecipar uma nova resposta.
    if (!isAlwaysShowUser(String(usuario_id))) {
      // A visualização da exibição atual já foi registrada antes do submit e
      // não pode bloquear a primeira resposta legítima. Feedback/confirmação
      // persistidos continuam sendo considerados normalmente.
      const reexibicao = await verificarHistorico(campanha, String(usuario_id), new Date(), { ignorarVisualizacao: true })
      if (reexibicao.bloqueado) return res.status(409).json({ erro: reexibicao.motivo })
    }

    // Fonte da verdade do tipo de avaliação é sempre a campanha — nunca um
    // campo vindo do widget. Toda campanha existente (e toda nova, até a
    // fase de UI de seleção existir) resolve 'nps' pelo @default do schema +
    // backfill da migration, preservando 100% o comportamento atual.
    const tipoAvaliacao = campanha.tipo_avaliacao_feedback

    // Esta rota (POST /api/widget/feedback, feedback "geral" da campanha)
    // só cobre nps/csat por enquanto — utilidade_destaque ainda não tem
    // endpoint/UI própria, por isso destaqueItemEncontrado é sempre null
    // aqui (nunca chega no branch que precisaria dele).
    const { erro: erroAvaliacao, nota: notaValidada, util, destaqueItemId } = validarAvaliacaoFeedback(
      tipoAvaliacao,
      { nota },
      null,
      campanha_id
    )
    if (erroAvaliacao) return res.status(400).json({ erro: erroAvaliacao })

    if (campanha.observacao_obrigatoria && !observacao?.toString().trim()) {
      return res.status(400).json({ erro: 'Observação é obrigatória para esta campanha.' })
    }

    const feedback = await prisma.feedback.create({
      data: {
        campanha_id,
        tipo_avaliacao: tipoAvaliacao,
        nota: notaValidada,
        util,
        destaque_item_id: destaqueItemId,
        observacao: observacao?.toString().trim() || null,
        usuario_id: String(usuario_id),
        usuario_nome: usuario_nome || null,
        usuario_email: usuario_email || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json(feedback)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar feedback.' })
  }
}

// Fluxo dedicado de utilidade_destaque — separado de registrarFeedback de
// propósito (regra de produto: feedback geral da campanha e utilidade do
// destaque são independentes; Campanha.tipo_avaliacao_feedback só
// representa nps/csat, nunca utilidade_destaque). Backend fixa o tipo
// sempre como 'utilidade_destaque' aqui, nunca aceita um tipo vindo do
// cliente.
export async function registrarUtilidadeDestaque(req: Request, res: Response) {
  try {
    const {
      public_key, campanha_id, destaque_item_id, util, observacao,
      usuario_id, usuario_nome, usuario_email,
      sistema, tela, navegador, dispositivo, contexto,
    } = req.body

    if (!campanha_id) {
      return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    }

    if (!usuario_id) {
      return res.status(400).json({ erro: 'usuario_id é obrigatório.' })
    }

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) {
      return res.status(400).json({ erro: 'Campanha não encontrada.' })
    }

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha || campanha.tenant_id !== resolucao.tenantId) {
      return res.status(400).json({ erro: 'Campanha não encontrada.' })
    }

    // Busca só por id (sem where campanha_id) — ownership/isolamento de
    // tenant são decididos por validarAvaliacaoFeedback, mesmo padrão de
    // validarDestaqueItemEvento (registrarEvento acima).
    const itemDestaque = destaque_item_id
      ? await prisma.campanhaDestaqueItem.findUnique({ where: { id: String(destaque_item_id) } })
      : null

    const { erro: erroAvaliacao, util: utilValidado, destaqueItemId } = validarAvaliacaoFeedback(
      'utilidade_destaque',
      { util, destaque_item_id },
      itemDestaque,
      campanha_id
    )
    if (erroAvaliacao) return res.status(400).json({ erro: erroAvaliacao })

    const usuarioIdStr = String(usuario_id)
    const observacaoNormalizada = observacao?.toString().trim() || null

    // "Uma resposta atual" por campanha_id + destaque_item_id + usuario_id +
    // tipo_avaliacao (índice único, ver Feedback em schema.prisma) — um novo
    // envio do mesmo usuário pro mesmo item ATUALIZA a resposta existente em
    // vez de duplicar. upsert() compila pra um único INSERT ... ON CONFLICT
    // DO UPDATE atômico no Postgres — não é um findFirst + create/update
    // vulnerável a race entre dois envios concorrentes do mesmo usuário
    // (ex.: duplo clique, ou trocar Sim -> Não rapidamente).
    const feedback = await prisma.feedback.upsert({
      where: {
        campanha_id_destaque_item_id_usuario_id_tipo_avaliacao: {
          campanha_id,
          // Não-nulos aqui sempre: validarAvaliacaoFeedback já garantiu os
          // dois acima (erroAvaliacao teria retornado antes, se não).
          destaque_item_id: destaqueItemId as string,
          usuario_id: usuarioIdStr,
          tipo_avaliacao: 'utilidade_destaque',
        },
      },
      create: {
        campanha_id,
        tipo_avaliacao: 'utilidade_destaque',
        nota: null,
        util: utilValidado,
        destaque_item_id: destaqueItemId,
        observacao: observacaoNormalizada,
        usuario_id: usuarioIdStr,
        usuario_nome: usuario_nome || null,
        usuario_email: usuario_email || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
      update: {
        util: utilValidado,
        observacao: observacaoNormalizada,
        usuario_nome: usuario_nome || null,
        usuario_email: usuario_email || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json(feedback)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar utilidade do destaque.' })
  }
}

export async function registrarConclusaoEvento(req: Request, res: Response) {
  try {
    const { public_key, evento, sistema, usuario_id, contexto, dominio } = req.body

    if (!evento || !sistema || !usuario_id) {
      return res.status(400).json({ erro: 'evento, sistema e usuario_id são obrigatórios.' })
    }

    // Sem tenant_id aqui, a busca abaixo por "sistema" poderia concluir
    // campanhas de OUTRO tenant que usa o mesmo nome de sistema.
    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(201).json({ ok: true, campanhas_concluidas: 0 })

    const eventoStr = String(evento).trim()
    const sistemaStr = String(sistema).trim()
    const uidStr = String(usuario_id).trim()

    // Build segmentation context from the user's current session state
    const ctx: SegCtx = {
      cliente_id: contexto?.cliente_id ? String(contexto.cliente_id) : undefined,
      unidade_id: contexto?.unidade_id ? String(contexto.unidade_id) : undefined,
      perfil: contexto?.perfil ? String(contexto.perfil) : undefined,
      usuario_tipo: contexto?.usuario_tipo ? String(contexto.usuario_tipo) : undefined,
      estado: contexto?.estado ? String(contexto.estado) : undefined,
      dominio: dominio ? String(dominio) : (contexto?.dominio ? String(contexto.dominio) : undefined),
    }

    // Limitation: only campaigns active at the time of track() are concluded here.
    // Campaigns created after this event fire are not retroactively blocked.
    // Fase 1 dos 3 status — ver comentário equivalente em buscarCampanha.
    const campanhas = await prisma.campanha.findMany({
      where: { tenant_id: resolucao.tenantId, status: 'ATIVA', sistema: sistemaStr, encerrar_apos_evento: true, evento_conclusao: eventoStr },
      select: {
        id: true,
        segmentar_cliente_ids: true,
        segmentar_unidade_ids: true,
        segmentar_perfis: true,
        segmentar_usuario_tipos: true,
        segmentar_estados: true,
        segmentar_dominios: true,
      },
    })

    // Apply segmentation — only conclude campaigns that match the user's context
    const elegiveis = campanhas.filter(c => passaSegmentacao(c, ctx))

    for (const c of elegiveis) {
      const jaExiste = await prisma.eventoCampanha.findFirst({
        where: { campanha_id: c.id, usuario_id: uidStr, tipo_evento: 'conclusao' },
      })
      if (!jaExiste) {
        await prisma.eventoCampanha.create({
          data: {
            campanha_id: c.id,
            tipo_evento: 'conclusao',
            usuario_id: uidStr,
            sistema: sistemaStr,
          },
        })
      }
    }

    res.status(201).json({ ok: true, campanhas_concluidas: elegiveis.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar conclusão de evento.' })
  }
}

export async function registrarEventoUsuario(req: Request, res: Response) {
  try {
    const { public_key, evento, sistema, usuario_id, contexto,
      cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.body

    const eventoStr   = evento    ? String(evento).trim()    : ''
    const sistemaStr  = sistema   ? String(sistema).trim()   : ''
    const uidStr      = usuario_id ? String(usuario_id).trim() : ''

    if (!eventoStr || !sistemaStr || !uidStr) {
      return res.status(400).json({ erro: 'evento, sistema e usuario_id são obrigatórios.' })
    }

    // Fase 2 do widget multi-tenant: sem tenant_id aqui, este histórico
    // (lido por verificarConclusaoGlobal pra encerrar campanha após evento)
    // não distinguia dois tenants usando o mesmo "sistema" (ver comentário de
    // EventoUsuario em schema.prisma). public_key inválida/tenant bloqueado:
    // no-op silencioso — mesma resposta de sucesso de sempre, já que
    // track() no widget é fire-and-forget e nunca deve revelar se uma chave
    // existe.
    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(201).json({ ok: true })

    const ctx = (contexto && typeof contexto === 'object' && !Array.isArray(contexto))
      ? contexto as Record<string, unknown>
      : {}

    // Accept segmentation fields from direct body params or nested contexto object
    const resolve = (direct: unknown, key: string) =>
      direct ? String(direct) : (ctx[key] ? String(ctx[key]) : null)

    const clienteId  = resolve(cliente_id,  'cliente_id')
    const unidadeId  = resolve(unidade_id,  'unidade_id')
    const perfilStr  = resolve(perfil,       'perfil')
    const usuTipo    = resolve(usuario_tipo, 'usuario_tipo')
    const estadoStr  = resolve(estado,       'estado')

    // Deduplicate: skip if identical event was registered in the last 5 seconds
    // (escopado por tenant_id — dois tenants não devem deduplicar um evento
    // do outro).
    const cincoSegundosAtras = new Date(Date.now() - 5000)
    const jaExiste = await prisma.eventoUsuario.findFirst({
      where: {
        tenant_id: resolucao.tenantId,
        sistema: sistemaStr,
        usuario_id: uidStr,
        evento: eventoStr,
        cliente_id: clienteId,
        unidade_id: unidadeId,
        criado_em: { gte: cincoSegundosAtras },
      },
    })
    if (jaExiste) {
      return res.status(200).json({ ok: true, deduplicado: true })
    }

    await prisma.eventoUsuario.create({
      data: {
        tenant_id: resolucao.tenantId,
        sistema: sistemaStr,
        usuario_id: uidStr,
        evento: eventoStr,
        cliente_id: clienteId,
        unidade_id: unidadeId,
        perfil: perfilStr,
        usuario_tipo: usuTipo,
        estado: estadoStr,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar evento do usuário.' })
  }
}

// ─── Tours guiados ──────────────────────────────────────────────────────────

export async function buscarTour(req: Request, res: Response) {
  try {
    const { public_key, slug } = req.query
    if (!slug) return res.status(400).json({ erro: 'Informe slug.' })

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(404).json({ erro: 'Nenhum tour guiado ativo encontrado.' })

    // Tour.ativo controla só o uso autônomo (autoabertura/busca por slug) —
    // um tour usado apenas dentro de Jornada continua podendo ficar inativo
    // aqui (ver buscarJornadas, que embute o tour inteiro na etapa sem
    // passar por esta rota).
    const tour = await prisma.tourGuiado.findFirst({
      where: { tenant_id: resolucao.tenantId, slug: String(slug), ativo: true },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Nenhum tour guiado ativo encontrado.' })
    res.json(ocultarTenantId(tour))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tour guiado.' })
  }
}

// Aparência do widget (cor principal + logo do runtime de Tours) — pública,
// sem auth, mesmo padrão de buscarTour. Sempre 200, mesmo sem configuração
// pra esse sistema: o runtime trata { cor_principal: null, logo_url: null }
// como "sem configuração", caindo no fallback visual atual (nunca quebra um
// cliente que não configurou nada).
export async function buscarAparencia(req: Request, res: Response) {
  try {
    const { public_key, sistema } = req.query
    if (!sistema) return res.json({ cor_principal: null, logo_url: null })

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.json({ cor_principal: null, logo_url: null })

    const sistemaConfig = await prisma.sistema.findFirst({
      where: { tenant_id: resolucao.tenantId, identificador: String(sistema) },
    })
    const aparenciaEspecifica = sistemaConfig
      ? await prisma.aparenciaWidget.findUnique({
        where: { tenant_id_sistema_id: { tenant_id: resolucao.tenantId, sistema_id: sistemaConfig.id } },
      })
      : await prisma.aparenciaWidget.findUnique({
        where: { tenant_id_sistema: { tenant_id: resolucao.tenantId, sistema: String(sistema) } },
      })
    const aparenciaDefault = aparenciaEspecifica
      ? null
      : await prisma.aparenciaWidget.findFirst({ where: { tenant_id: resolucao.tenantId, sistema_id: null } })
    const aparencia = aparenciaEspecifica ?? aparenciaDefault
    res.json({
      cor_principal: aparencia?.cor_principal ?? null,
      logo_url: aparencia?.logo_url ?? null,
    })
  } catch {
    res.json({ cor_principal: null, logo_url: null })
  }
}

export async function buscarTourCandidatos(req: Request, res: Response) {
  try {
    const { public_key, sistema, tela, usuario_id } = req.query
    if (!sistema) return res.status(400).json({ erro: 'Informe sistema.' })

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.json([])

    // sistema_tela tours are filtered by tela server-side (tela deve corresponder).
    // data_cy e url_contem são sempre incluídos — o widget valida no client.
    // Segmentação por contexto (segmentacao_regras) é avaliada no client
    // (avaliarSegmentacaoTour em widget.js) — o campo já vem no tour completo,
    // sem filtro adicional aqui.
    const modoFiltros: object[] = []
    if (tela) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: String(tela) })
    modoFiltros.push({ modo_identificacao: 'data_cy' })
    modoFiltros.push({ modo_identificacao: 'url_contem' })

    const tours = await prisma.tourGuiado.findMany({
      where: { tenant_id: resolucao.tenantId, ativo: true, sistema: String(sistema), OR: modoFiltros },
      orderBy: [{ prioridade: 'desc' }, { criado_em: 'desc' }],
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })

    if (!usuario_id || tours.length === 0) {
      return res.json(ocultarTenantId(tours))
    }

    const uidStr = String(usuario_id)

    // Usuários de validação (mesma lista usada pelas campanhas) sempre veem o
    // tour de novo, mesmo já tendo concluído/pulado — usado para QA repetir o fluxo.
    if (isAlwaysShowUser(uidStr)) {
      return res.json(ocultarTenantId(tours.map(t => ({ ...t, always_show_user: true }))))
    }

    // Reexibição mínima (MVP): não reabrir automaticamente um tour que este
    // usuário já concluiu ou pulou. iniciarTour(slug) manual ignora este filtro
    // (busca o tour direto por slug, não passa por aqui).
    const jaVistos = await prisma.eventoTour.findMany({
      where: {
        usuario_id: uidStr,
        tour_id: { in: tours.map(t => t.id) },
        tipo_evento: { in: ['concluido', 'pulado'] },
      },
      select: { tour_id: true },
    })
    const vistos = new Set(jaVistos.map(e => e.tour_id))

    res.json(ocultarTenantId(tours.filter(t => !vistos.has(t.id))))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tours candidatos.' })
  }
}

export async function registrarEventoTour(req: Request, res: Response) {
  try {
    const { public_key, tour_id, tipo_evento, passo_ordem, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!tour_id) return res.status(400).json({ erro: 'tour_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })

    // feedback_tour: clique numa das opções da tela final (ver tourFeedback
    // em widget.js) — valor/label/emoji escolhidos vão dentro de contexto
    // (Json? já existente, sem migration nova).
    const TIPOS_VALIDOS = ['inicio', 'passo_visualizado', 'elemento_nao_encontrado', 'pulado', 'concluido', 'feedback_tour']
    if (!TIPOS_VALIDOS.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_VALIDOS.join(', ')}.` })
    }

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const tour = await prisma.tourGuiado.findUnique({ where: { id: tour_id } })
    if (!tour || tour.tenant_id !== resolucao.tenantId) {
      return res.status(404).json({ erro: 'Tour guiado não encontrado.' })
    }

    await prisma.eventoTour.create({
      data: {
        tour_id,
        tipo_evento,
        passo_ordem: passo_ordem != null ? Number(passo_ordem) : null,
        usuario_id: usuario_id || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar evento do tour.' })
  }
}

// ─── Jornadas (Onboarding Guiado) ───────────────────────────────────────────
// Diferente de campanhas/tours, Jornada não tem sistema/tela/gatilho — é uma
// central/checklist que o usuário abre manualmente (window.UserPulse.abrirJornadas()),
// nunca disparada automaticamente. Elegibilidade é só ativo + segmentação.
// Estrutura: Jornada -> BlocoJornada ("Pacote" na UI/widget) -> EtapaJornada.

const TIPOS_EVENTO_JORNADA = [
  'jornada_aberta', 'jornada_iniciada',
  'bloco_aberto', 'bloco_iniciado', 'bloco_concluido',
  'etapa_aberta', 'etapa_concluida', 'etapa_pulada',
  'jornada_concluida',
]

export async function buscarJornadas(req: Request, res: Response) {
  try {
    const { public_key, usuario_id, cliente_id, unidade_id, perfil, usuario_tipo, estado, dominio } = req.query

    // Antes da Fase 2, esta rota devolvia TODAS as jornadas ativas de TODOS os
    // tenants (Jornada não tem campo "sistema" — nunca teve filtro nenhum de
    // isolamento aqui). tenant_id via public_key fecha esse vazamento.
    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.json([])

    const jornadas = await prisma.jornada.findMany({
      where: { tenant_id: resolucao.tenantId, ativo: true },
      orderBy: { criado_em: 'desc' },
      include: {
        blocos: {
          orderBy: { ordem: 'asc' },
          include: {
            etapas: {
              orderBy: { ordem: 'asc' },
              include: {
                tour: { include: { passos: { orderBy: { ordem: 'asc' } } } },
                campanha: { select: { id: true, nome_interno: true, titulo: true, slug: true, ativo: true } },
              },
            },
          },
        },
      },
    })

    const ctx: SegCtx = {
      cliente_id: cliente_id ? String(cliente_id) : undefined,
      unidade_id: unidade_id ? String(unidade_id) : undefined,
      perfil: perfil ? String(perfil) : undefined,
      usuario_tipo: usuario_tipo ? String(usuario_tipo) : undefined,
      estado: estado ? String(estado) : undefined,
      dominio: dominio ? String(dominio) : undefined,
    }

    const elegiveis = jornadas.filter(j => passaSegmentacao(j, ctx))

    // Sem usuario_id não há como calcular progresso — tudo volta pendente (o
    // widget não registra eventos de progresso sem usuario_id).
    if (!usuario_id || elegiveis.length === 0) {
      return res.json(ocultarTenantId(elegiveis.map(j => ({
        ...j,
        blocos: j.blocos.map(b => ({
          ...b,
          etapas: b.etapas.map(e => ({ ...e, status: 'pendente' as const })),
          progresso: { concluido: false, etapas_concluidas: 0, etapas_total: b.etapas.length },
        })),
        progresso: { concluida: false, blocos_concluidos: 0, blocos_total: j.blocos.length },
      }))))
    }

    const uidStr = String(usuario_id)
    const jornadaIds = elegiveis.map(j => j.id)

    const eventos = await prisma.eventoJornada.findMany({
      where: {
        usuario_id: uidStr,
        jornada_id: { in: jornadaIds },
        tipo_evento: { in: ['etapa_concluida', 'etapa_pulada', 'bloco_concluido', 'jornada_concluida'] },
      },
    })

    const statusPorEtapa = new Map<string, 'concluida' | 'pulada'>()
    const blocosConcluidos = new Set<string>()
    const jornadasConcluidas = new Set<string>()
    for (const ev of eventos) {
      if (ev.tipo_evento === 'jornada_concluida') {
        jornadasConcluidas.add(ev.jornada_id)
        continue
      }
      if (ev.tipo_evento === 'bloco_concluido') {
        if (ev.bloco_id) blocosConcluidos.add(ev.bloco_id)
        continue
      }
      if (!ev.etapa_id) continue
      // "concluida" tem prioridade sobre "pulada", independente da ordem dos
      // eventos — uma vez concluída, não regride para pulada.
      const atual = statusPorEtapa.get(ev.etapa_id)
      if (atual !== 'concluida') {
        statusPorEtapa.set(ev.etapa_id, ev.tipo_evento === 'etapa_concluida' ? 'concluida' : 'pulada')
      }
    }

    const resultado = elegiveis.map(j => {
      const blocosComStatus = j.blocos.map(b => {
        const etapasComStatus = b.etapas.map(e => ({
          ...e,
          status: statusPorEtapa.get(e.id) ?? 'pendente' as const,
        }))
        const concluidas = etapasComStatus.filter(e => e.status === 'concluida').length
        const obrigatoriasPendentes = etapasComStatus.filter(e => e.obrigatoria && e.status !== 'concluida')
        // Bloco concluído: evento bloco_concluido já registrado OU (fallback,
        // caso o widget ainda não tenha tido chance de registrar) todas as
        // etapas obrigatórias já concluídas.
        const blocoConcluido = blocosConcluidos.has(b.id) || obrigatoriasPendentes.length === 0
        return {
          ...b,
          etapas: etapasComStatus,
          progresso: { concluido: blocoConcluido, etapas_concluidas: concluidas, etapas_total: etapasComStatus.length },
        }
      })

      const blocosObrigatoriosPendentes = blocosComStatus.filter(b => b.obrigatorio && !b.progresso.concluido)
      const jornadaConcluida = jornadasConcluidas.has(j.id) || blocosObrigatoriosPendentes.length === 0

      return {
        ...j,
        blocos: blocosComStatus,
        progresso: {
          concluida: jornadaConcluida,
          blocos_concluidos: blocosComStatus.filter(b => b.progresso.concluido).length,
          blocos_total: blocosComStatus.length,
        },
      }
    })

    res.json(ocultarTenantId(resultado))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar jornadas.' })
  }
}

export async function registrarEventoJornada(req: Request, res: Response) {
  try {
    const { public_key, jornada_id, bloco_id, etapa_id, tipo_evento, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!jornada_id) return res.status(400).json({ erro: 'jornada_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })
    if (!TIPOS_EVENTO_JORNADA.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_EVENTO_JORNADA.join(', ')}.` })
    }

    const resolucao = await resolverTenantPublico(public_key)
    if (!resolucao.ok) return res.status(404).json({ erro: 'Jornada não encontrada.' })

    const jornada = await prisma.jornada.findUnique({ where: { id: jornada_id } })
    if (!jornada || jornada.tenant_id !== resolucao.tenantId) {
      return res.status(404).json({ erro: 'Jornada não encontrada.' })
    }

    await prisma.eventoJornada.create({
      data: {
        jornada_id,
        bloco_id: bloco_id || null,
        etapa_id: etapa_id || null,
        tipo_evento,
        usuario_id: usuario_id || null,
        sistema: sistema || null,
        tela: tela || null,
        navegador: navegador || null,
        dispositivo: dispositivo || null,
        contexto: contexto ?? null,
      },
    })

    res.status(201).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao registrar evento da jornada.' })
  }
}

export async function atualizarTelefone(req: Request, res: Response) {
  try {
    const id = String(req.params.id)
    const { telefone_contato } = req.body

    const telefone = String(telefone_contato ?? '').trim()
    if (telefone.length > 20) {
      return res.status(400).json({ erro: 'Telefone deve ter no máximo 20 caracteres.' })
    }
    if (!telefone) {
      return res.status(400).json({ erro: 'telefone_contato é obrigatório.' })
    }

    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) return res.status(404).json({ erro: 'Feedback não encontrado.' })

    await prisma.feedback.update({
      where: { id },
      data: { telefone_contato: telefone },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao salvar telefone.' })
  }
}
