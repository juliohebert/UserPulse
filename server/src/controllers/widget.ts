import { Request, Response } from 'express'
import prisma from '../lib/prisma'

export async function buscarCampanha(req: Request, res: Response) {
  try {
    const { slug, sistema, tela, usuario_id, evento } = req.query

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
      ? { sistema: String(sistema), tela: String(tela), gatilho: 'apos_evento', evento: String(evento) }
      : { sistema: String(sistema), tela: String(tela), gatilho: 'ao_abrir_tela' }

    const campanha = await prisma.campanha.findFirst({
      where: {
        ativo: true,
        ...campanhaFilter,
        ...filtroData,
      },
      orderBy: [
        { prioridade: 'desc' },
        { ordem: 'asc' },
        { criado_em: 'desc' },
      ],
    })

    if (!campanha) {
      return res.status(404).json({ erro: 'Nenhuma campanha ativa encontrada.' })
    }

    if (usuario_id) {
      if (campanha.exige_confirmacao_leitura) {
        const jaConfirmou = await prisma.confirmacaoLeitura.findFirst({
          where: { campanha_id: campanha.id, usuario_id: String(usuario_id) },
        })
        if (jaConfirmou) {
          return res.status(404).json({ erro: 'Campanha já confirmada por este usuário.' })
        }
      } else {
        const ultimoFeedback = await prisma.feedback.findFirst({
          where: { campanha_id: campanha.id, usuario_id: String(usuario_id) },
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

    res.json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar campanha.' })
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
