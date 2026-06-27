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

    if (usuario_id && !alwaysShow) {
      const uidStr = String(usuario_id)

      // Mandatory campaign: visualização alone doesn't block — only response/confirmation does
      if (campanha.mostrar_uma_vez && campanha.permitir_fechar_modal) {
        const jaViu = await prisma.eventoCampanha.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr, tipo_evento: 'visualizacao' },
        })
        if (jaViu) {
          return res.status(404).json({ erro: 'Campanha já exibida para este usuário.' })
        }
      }

      if (campanha.exige_confirmacao_leitura) {
        const jaConfirmou = await prisma.confirmacaoLeitura.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr },
        })
        if (jaConfirmou) {
          return res.status(404).json({ erro: 'Campanha já confirmada por este usuário.' })
        }
      } else {
        const ultimoFeedback = await prisma.feedback.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr },
          orderBy: { criado_em: 'desc' },
        })
        if (ultimoFeedback) {
          const intervalo = campanha.intervalo_reexibicao_dias
          if (intervalo === null || intervalo === undefined) {
            return res.status(404).json({ erro: 'Campanha já respondida por este usuário.' })
          }
          const diasDesde = Math.floor(
            (agora.getTime() - ultimoFeedback.criado_em.getTime()) / (1000 * 60 * 60 * 24)
          )
          if (diasDesde < intervalo) {
            return res.status(404).json({ erro: 'Campanha já respondida. Disponível novamente em ' + (intervalo - diasDesde) + ' dia(s).' })
          }
        }
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

    if (!usuario_id || segmentadas.length === 0 || alwaysShow) {
      return res.json(alwaysShow ? segmentadas.map(c => ({ ...c, always_show_user: true })) : segmentadas)
    }

    const uidStr = String(usuario_id)
    const elegiveis: typeof segmentadas = []

    for (const campanha of segmentadas) {
      if (campanha.mostrar_uma_vez && campanha.permitir_fechar_modal) {
        const jaViu = await prisma.eventoCampanha.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr, tipo_evento: 'visualizacao' },
        })
        if (jaViu) continue
      }

      if (campanha.exige_confirmacao_leitura) {
        const jaConfirmou = await prisma.confirmacaoLeitura.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr },
        })
        if (jaConfirmou) continue
      } else {
        const ultimoFeedback = await prisma.feedback.findFirst({
          where: { campanha_id: campanha.id, usuario_id: uidStr },
          orderBy: { criado_em: 'desc' },
        })
        if (ultimoFeedback) {
          const intervalo = campanha.intervalo_reexibicao_dias
          if (intervalo === null || intervalo === undefined) continue
          const diasDesde = Math.floor(
            (agora.getTime() - ultimoFeedback.criado_em.getTime()) / (1000 * 60 * 60 * 24)
          )
          if (diasDesde < intervalo) continue
        }
      }

      elegiveis.push(campanha)
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
