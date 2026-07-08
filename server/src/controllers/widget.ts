import { Request, Response } from 'express'
import prisma from '../lib/prisma'

interface SegCtx {
  cliente_id?: string
  unidade_id?: string
  perfil?: string
  usuario_tipo?: string
  estado?: string
}

interface SegCampanha {
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
}

function passaSegmentacao(campanha: SegCampanha, ctx: SegCtx): boolean {
  const check = (lista: string[], valor?: string) => {
    if (lista.length === 0) return true
    if (!valor) return false
    return lista.includes(valor)
  }
  return (
    check(campanha.segmentar_cliente_ids, ctx.cliente_id) &&
    check(campanha.segmentar_unidade_ids, ctx.unidade_id) &&
    check(campanha.segmentar_perfis, ctx.perfil) &&
    check(campanha.segmentar_usuario_tipos, ctx.usuario_tipo) &&
    check(campanha.segmentar_estados, ctx.estado)
  )
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

async function verificarHistorico(
  campanha: {
    id: string
    politica_reexibicao: string
    reexibir_apos_dias: number | null
    exige_confirmacao_leitura: boolean
  },
  uidStr: string,
  agora: Date
): Promise<HistoricoResult> {
  const policy = campanha.politica_reexibicao || 'uma_vez_apos_visualizacao'

  if (policy === 'uma_vez_apos_visualizacao') {
    const jaViu = await prisma.eventoCampanha.findFirst({
      where: { campanha_id: campanha.id, usuario_id: uidStr, tipo_evento: 'visualizacao' },
    })
    if (jaViu) return { bloqueado: true, motivo: 'Campanha já exibida para este usuário.' }

    if (campanha.exige_confirmacao_leitura) {
      const jaConf = await prisma.confirmacaoLeitura.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
      })
      if (jaConf) return { bloqueado: true, motivo: 'Campanha já confirmada por este usuário.' }
    } else {
      const uf = await prisma.feedback.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
        orderBy: { criado_em: 'desc' },
      })
      if (uf) return { bloqueado: true, motivo: 'Campanha já respondida por este usuário.' }
    }
  }

  if (policy === 'ate_responder_ou_confirmar') {
    if (campanha.exige_confirmacao_leitura) {
      const jaConf = await prisma.confirmacaoLeitura.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
      })
      if (jaConf) return { bloqueado: true, motivo: 'Campanha já confirmada por este usuário.' }
    } else {
      const uf = await prisma.feedback.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
        orderBy: { criado_em: 'desc' },
      })
      if (uf) return { bloqueado: true, motivo: 'Campanha já respondida por este usuário.' }
    }
  }

  if (policy === 'reexibir_apos_dias') {
    const dias = campanha.reexibir_apos_dias
    if (!dias || dias <= 0) return { bloqueado: false }

    const [ultimaViz, ultimoFb, ultimaConf] = await Promise.all([
      prisma.eventoCampanha.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr, tipo_evento: 'visualizacao' },
        orderBy: { criado_em: 'desc' },
      }),
      prisma.feedback.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
        orderBy: { criado_em: 'desc' },
      }),
      prisma.confirmacaoLeitura.findFirst({
        where: { campanha_id: campanha.id, usuario_id: uidStr },
        orderBy: { criado_em: 'desc' },
      }),
    ])

    const datas = [ultimaViz?.criado_em, ultimoFb?.criado_em, ultimaConf?.criado_em].filter((d): d is Date => !!d)
    if (datas.length === 0) return { bloqueado: false }

    const maisRecente = new Date(Math.max(...datas.map(d => d.getTime())))
    const diasDesde = Math.floor((agora.getTime() - maisRecente.getTime()) / 86400000)
    if (diasDesde < dias) {
      return {
        bloqueado: true,
        motivo: 'Campanha já respondida. Disponível novamente em ' + (dias - diasDesde) + ' dia(s).',
      }
    }
  }

  return { bloqueado: false }
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
  uidStr: string
): Promise<ConclusaoResult> {
  if (!campanha.evento_conclusao) return { bloqueado: false }
  const eventos = await prisma.eventoUsuario.findMany({
    where: { sistema: campanha.sistema, usuario_id: uidStr, evento: campanha.evento_conclusao },
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
    const { slug, sistema, tela, usuario_id, evento, cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.query

    if (!slug && (!sistema || !tela)) {
      return res.status(400).json({ erro: 'Informe slug ou sistema+tela.' })
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
        ativo: true,
        ...campanhaFilter,
        ...filtroData,
      },
      orderBy: [
        { prioridade: 'desc' },
        { criado_em: 'desc' },
      ],
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
    }

    if (!passaSegmentacao(campanha, ctx)) {
      return res.status(404).json({ erro: 'Nenhuma campanha ativa encontrada.' })
    }

    const alwaysShow = usuario_id ? isAlwaysShowUser(String(usuario_id)) : false

    // Conclusao check always applies — not bypassed by always-show
    if (usuario_id && campanha.encerrar_apos_evento && campanha.evento_conclusao) {
      const conclusao = await verificarConclusaoGlobal(campanha, String(usuario_id))
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

    res.json(alwaysShow ? { ...campanha, always_show_user: true } : campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanha.' })
  }
}

export async function buscarCandidatas(req: Request, res: Response) {
  try {
    const { sistema, tela, gatilho, evento, usuario_id, cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.query

    if (!sistema) {
      return res.status(400).json({ erro: 'Informe sistema.' })
    }

    const agora = new Date()
    const filtroData = {
      AND: [
        { OR: [{ data_inicio: null }, { data_inicio: { lte: agora } }] },
        { OR: [{ data_fim: null }, { data_fim: { gte: agora } }] },
      ],
    }

    const gatilhoStr = gatilho === 'apos_evento' ? 'apos_evento' : 'ao_abrir_tela'
    const gatilhoFilter =
      gatilhoStr === 'apos_evento' && evento
        ? { gatilho: 'apos_evento', evento: String(evento) }
        : { gatilho: 'ao_abrir_tela' }

    // sistema_tela campaigns are filtered by tela server-side (tela must match).
    // data_cy and url_contem campaigns are always included — the widget validates client-side.
    const modoFiltros: object[] = []
    if (tela) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: String(tela) })
    modoFiltros.push({ modo_identificacao: 'data_cy' })
    modoFiltros.push({ modo_identificacao: 'url_contem' })

    const campanhas = await prisma.campanha.findMany({
      where: {
        ativo: true,
        sistema: String(sistema),
        ...gatilhoFilter,
        OR: modoFiltros,
        ...filtroData,
      },
      orderBy: [{ prioridade: 'desc' }, { criado_em: 'desc' }],
    })

    const ctx: SegCtx = {
      cliente_id: cliente_id ? String(cliente_id) : undefined,
      unidade_id: unidade_id ? String(unidade_id) : undefined,
      perfil: perfil ? String(perfil) : undefined,
      usuario_tipo: usuario_tipo ? String(usuario_tipo) : undefined,
      estado: estado ? String(estado) : undefined,
    }

    const segmentadas = campanhas.filter(c => passaSegmentacao(c, ctx))

    const alwaysShow = usuario_id ? isAlwaysShowUser(String(usuario_id)) : false

    if (!usuario_id || segmentadas.length === 0) {
      return res.json(segmentadas)
    }

    const uidStr = String(usuario_id)

    // Step 1: filter conclusao — applies even to always-show users
    const semConclusao: typeof segmentadas = []
    for (const campanha of segmentadas) {
      if (campanha.encerrar_apos_evento && campanha.evento_conclusao) {
        const conclusao = await verificarConclusaoGlobal(campanha, uidStr)
        if (conclusao.bloqueado) continue
      }
      semConclusao.push(campanha)
    }

    if (alwaysShow) {
      return res.json(semConclusao.map(c => ({ ...c, always_show_user: true })))
    }

    // Step 2: filter by reexhibition policy
    const elegiveis: typeof segmentadas = []
    for (const campanha of semConclusao) {
      const resultado = await verificarHistorico(campanha, uidStr, agora)
      if (!resultado.bloqueado) {
        elegiveis.push(campanha)
      }
    }

    res.json(elegiveis)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanhas candidatas.' })
  }
}

export async function registrarEvento(req: Request, res: Response) {
  try {
    const { campanha_id, tipo_evento, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!campanha_id) return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })

    const TIPOS_VALIDOS = ['visualizacao', 'clique_cta']
    if (!TIPOS_VALIDOS.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_VALIDOS.join(', ')}.` })
    }

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    await prisma.eventoCampanha.create({
      data: {
        campanha_id,
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
    res.status(500).json({ erro: 'Erro ao registrar evento.' })
  }
}

export async function registrarConfirmacao(req: Request, res: Response) {
  try {
    const { campanha_id, usuario_id, usuario_nome, usuario_email, contexto } = req.body

    if (!campanha_id) return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    if (!usuario_id) return res.status(400).json({ erro: 'usuario_id é obrigatório.' })

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' })
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

export async function registrarFeedback(req: Request, res: Response) {
  try {
    const {
      campanha_id, nota, observacao,
      usuario_id, usuario_nome, usuario_email,
      sistema, tela, navegador, dispositivo, contexto,
    } = req.body

    if (!campanha_id) {
      return res.status(400).json({ erro: 'campanha_id é obrigatório.' })
    }

    if (!usuario_id) {
      return res.status(400).json({ erro: 'usuario_id é obrigatório.' })
    }

    if (nota === undefined || nota === null) {
      return res.status(400).json({ erro: 'nota é obrigatória.' })
    }

    const notaNum = Number(nota)
    if (!Number.isInteger(notaNum) || notaNum < 0 || notaNum > 10) {
      return res.status(400).json({ erro: 'nota deve ser um inteiro entre 0 e 10.' })
    }

    const campanha = await prisma.campanha.findUnique({ where: { id: campanha_id } })
    if (!campanha) {
      return res.status(400).json({ erro: 'Campanha não encontrada.' })
    }

    if (campanha.observacao_obrigatoria && !observacao?.toString().trim()) {
      return res.status(400).json({ erro: 'Observação é obrigatória para esta campanha.' })
    }

    const feedback = await prisma.feedback.create({
      data: {
        campanha_id,
        nota: notaNum,
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

export async function registrarConclusaoEvento(req: Request, res: Response) {
  try {
    const { evento, sistema, usuario_id, contexto } = req.body

    if (!evento || !sistema || !usuario_id) {
      return res.status(400).json({ erro: 'evento, sistema e usuario_id são obrigatórios.' })
    }

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
    }

    // Limitation: only campaigns active at the time of track() are concluded here.
    // Campaigns created after this event fire are not retroactively blocked.
    const campanhas = await prisma.campanha.findMany({
      where: { ativo: true, sistema: sistemaStr, encerrar_apos_evento: true, evento_conclusao: eventoStr },
      select: {
        id: true,
        segmentar_cliente_ids: true,
        segmentar_unidade_ids: true,
        segmentar_perfis: true,
        segmentar_usuario_tipos: true,
        segmentar_estados: true,
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
    const { evento, sistema, usuario_id, contexto,
      cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.body

    const eventoStr   = evento    ? String(evento).trim()    : ''
    const sistemaStr  = sistema   ? String(sistema).trim()   : ''
    const uidStr      = usuario_id ? String(usuario_id).trim() : ''

    if (!eventoStr || !sistemaStr || !uidStr) {
      return res.status(400).json({ erro: 'evento, sistema e usuario_id são obrigatórios.' })
    }

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
    const cincoSegundosAtras = new Date(Date.now() - 5000)
    const jaExiste = await prisma.eventoUsuario.findFirst({
      where: {
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
    const { slug } = req.query
    if (!slug) return res.status(400).json({ erro: 'Informe slug.' })

    const tour = await prisma.tourGuiado.findFirst({
      where: { slug: String(slug), ativo: true },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Nenhum tour guiado ativo encontrado.' })
    res.json(tour)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tour guiado.' })
  }
}

export async function buscarTourCandidatos(req: Request, res: Response) {
  try {
    const { sistema, tela, usuario_id } = req.query
    if (!sistema) return res.status(400).json({ erro: 'Informe sistema.' })

    // sistema_tela tours are filtered by tela server-side (tela deve corresponder).
    // data_cy e url_contem são sempre incluídos — o widget valida no client.
    const modoFiltros: object[] = []
    if (tela) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: String(tela) })
    modoFiltros.push({ modo_identificacao: 'data_cy' })
    modoFiltros.push({ modo_identificacao: 'url_contem' })

    const tours = await prisma.tourGuiado.findMany({
      where: { ativo: true, sistema: String(sistema), OR: modoFiltros },
      orderBy: [{ prioridade: 'desc' }, { criado_em: 'desc' }],
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })

    if (!usuario_id || tours.length === 0) {
      return res.json(tours)
    }

    const uidStr = String(usuario_id)

    // Usuários de validação (mesma lista usada pelas campanhas) sempre veem o
    // tour de novo, mesmo já tendo concluído/pulado — usado para QA repetir o fluxo.
    if (isAlwaysShowUser(uidStr)) {
      return res.json(tours.map(t => ({ ...t, always_show_user: true })))
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

    res.json(tours.filter(t => !vistos.has(t.id)))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tours candidatos.' })
  }
}

export async function registrarEventoTour(req: Request, res: Response) {
  try {
    const { tour_id, tipo_evento, passo_ordem, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!tour_id) return res.status(400).json({ erro: 'tour_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })

    const TIPOS_VALIDOS = ['inicio', 'passo_visualizado', 'elemento_nao_encontrado', 'pulado', 'concluido']
    if (!TIPOS_VALIDOS.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_VALIDOS.join(', ')}.` })
    }

    const tour = await prisma.tourGuiado.findUnique({ where: { id: tour_id } })
    if (!tour) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

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
    const { usuario_id, cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.query

    const jornadas = await prisma.jornada.findMany({
      where: { ativo: true },
      orderBy: { criado_em: 'desc' },
      include: {
        blocos: {
          orderBy: { ordem: 'asc' },
          include: {
            etapas: {
              orderBy: { ordem: 'asc' },
              include: {
                tour: { select: { id: true, titulo: true, slug: true, ativo: true } },
                campanha: { select: { id: true, titulo: true, slug: true, ativo: true } },
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
    }

    const elegiveis = jornadas.filter(j => passaSegmentacao(j, ctx))

    // Sem usuario_id não há como calcular progresso — tudo volta pendente (o
    // widget não registra eventos de progresso sem usuario_id).
    if (!usuario_id || elegiveis.length === 0) {
      return res.json(elegiveis.map(j => ({
        ...j,
        blocos: j.blocos.map(b => ({
          ...b,
          etapas: b.etapas.map(e => ({ ...e, status: 'pendente' as const })),
          progresso: { concluido: false, etapas_concluidas: 0, etapas_total: b.etapas.length },
        })),
        progresso: { concluida: false, blocos_concluidos: 0, blocos_total: j.blocos.length },
      })))
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

    res.json(resultado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar jornadas.' })
  }
}

export async function registrarEventoJornada(req: Request, res: Response) {
  try {
    const { jornada_id, bloco_id, etapa_id, tipo_evento, usuario_id, sistema, tela, navegador, dispositivo, contexto } = req.body

    if (!jornada_id) return res.status(400).json({ erro: 'jornada_id é obrigatório.' })
    if (!tipo_evento) return res.status(400).json({ erro: 'tipo_evento é obrigatório.' })
    if (!TIPOS_EVENTO_JORNADA.includes(tipo_evento)) {
      return res.status(400).json({ erro: `tipo_evento inválido. Use: ${TIPOS_EVENTO_JORNADA.join(', ')}.` })
    }

    const jornada = await prisma.jornada.findUnique({ where: { id: jornada_id } })
    if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada.' })

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

// ─── Configuração global do widget ──────────────────────────────────────────
// Hoje só a posição do botão flutuante "Ajuda" — leitura pública (sem token),
// igual ao resto do /api/widget. Nunca cria a linha (isso é responsabilidade
// do admin em /api/configuracao-widget); se ainda não existir, cai no default
// já assumido pelo widget mesmo sem essa chamada retornar nada útil.
export async function buscarConfiguracaoWidget(_req: Request, res: Response) {
  try {
    const config = await prisma.configuracaoWidget.findUnique({ where: { id: 'singleton' } })
    res.json({ ajuda_fab_posicao: config?.ajuda_fab_posicao || 'inferior_direita' })
  } catch (err) {
    console.error(err)
    res.json({ ajuda_fab_posicao: 'inferior_direita' })
  }
}
