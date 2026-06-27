import { Request, Response } from 'express'
import prisma from '../lib/prisma'

// ─── Eligibility test helpers ────────────────────────────────────────────────

type CriterioStatus = 'ok' | 'bloqueado' | 'aviso' | 'nao_aplicavel'

interface Criterio {
  nome: string
  status: CriterioStatus
  detalhe?: string
}

interface ResultadoElegibilidade {
  elegivel: boolean
  exibiria: boolean
  motivo: string
  criterios: Criterio[]
  campanha_concorrente: {
    id: string
    titulo: string
    prioridade: number
    motivo: string
  } | null
}

function isAlwaysShowUser(usuarioId: string): boolean {
  const raw = process.env.USERPULSE_ALWAYS_SHOW_USER_IDS || ''
  if (!raw.trim()) return false
  return raw.split(',').map(s => s.trim()).filter(Boolean).includes(usuarioId)
}

// Mirrors the url_contem matching logic in widget.js checkMode()
function matchesUrlContem(urlContem: string, testedUrl: string): boolean {
  let normalized = urlContem.trim()
  try { normalized = new URL(normalized).pathname } catch { /* keep as-is */ }

  if (!normalized.startsWith('/')) {
    return testedUrl.includes(normalized)
  }

  let testPathname: string
  try { testPathname = new URL(testedUrl).pathname } catch { testPathname = testedUrl }

  return testPathname === normalized || testPathname.startsWith(normalized + '/')
}

// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS_BASE = ['titulo', 'descricao', 'tipo', 'sistema'] as const

function getCamposObrigatorios(modo: string): string[] {
  if (modo === 'data_cy') return [...CAMPOS_BASE, 'data_cy']
  if (modo === 'url_contem') return [...CAMPOS_BASE, 'url_contem']
  return [...CAMPOS_BASE, 'tela']
}

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

function validarFechamentoObrigatorio(
  permitirFechar: boolean,
  feedbackHabilitado: boolean,
  exigeConfirmacao: boolean
): string | null {
  if (!permitirFechar && !feedbackHabilitado && !exigeConfirmacao) {
    return 'Para impedir o fechamento da modal, habilite feedback ou confirmação de leitura.'
  }
  return null
}

function parseArray(v: unknown): string[] {
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(s => s.trim())
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
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
    const modo = String(req.body.modo_identificacao || 'sistema_tela')
    const faltando = getCamposObrigatorios(modo).filter(c => !req.body[c]?.toString().trim())
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      modo_exibicao, gatilho, evento, modo_identificacao, data_cy, url_contem,
      atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, permitir_fechar_modal, intervalo_reexibicao_dias, categoria,
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis, segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    const pfm = permitir_fechar_modal !== undefined ? Boolean(permitir_fechar_modal) : true
    const erroFechamento = validarFechamentoObrigatorio(
      pfm,
      feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : true,
      Boolean(exige_confirmacao_leitura)
    )
    if (erroFechamento) return res.status(400).json({ erro: erroFechamento })

    const slug = await slugUnico(gerarSlugBase(titulo))

    const campanha = await prisma.campanha.create({
      data: {
        slug,
        titulo: titulo.trim(),
        subtitulo: subtitulo?.trim() || null,
        descricao: descricao.trim(),
        tipo: tipo.trim(),
        sistema: sistema.trim(),
        tela: tela?.trim() || '',
        imagem_url: imagem_url?.trim() || null,
        video_url: video_url?.trim() || null,
        texto_botao: texto_botao?.trim() || null,
        url_botao: url_botao?.trim() || null,
        feedback_habilitado: feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : true,
        modo_exibicao: modo_exibicao?.trim() || 'modal_automatica',
        gatilho: gatilho?.trim() || 'ao_abrir_tela',
        evento: evento?.trim() || null,
        modo_identificacao: modo_identificacao?.trim() || 'sistema_tela',
        data_cy: data_cy?.trim() || null,
        url_contem: url_contem?.trim() || null,
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
        permitir_fechar_modal: permitir_fechar_modal !== undefined ? Boolean(permitir_fechar_modal) : true,
        intervalo_reexibicao_dias: intervalo_reexibicao_dias != null && intervalo_reexibicao_dias !== '' ? Number(intervalo_reexibicao_dias) : null,
        categoria: categoria?.trim() || null,
        segmentar_cliente_ids: parseArray(segmentar_cliente_ids),
        segmentar_unidade_ids: parseArray(segmentar_unidade_ids),
        segmentar_perfis: parseArray(segmentar_perfis),
        segmentar_usuario_tipos: parseArray(segmentar_usuario_tipos),
        segmentar_estados: parseArray(segmentar_estados),
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

    const modoAtualizado = String(req.body.modo_identificacao ?? existente.modo_identificacao ?? 'sistema_tela')
    const vazios = getCamposObrigatorios(modoAtualizado).filter(c => c in req.body && !req.body[c]?.toString().trim())
    if (vazios.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios não podem ficar vazios: ${vazios.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      modo_exibicao, gatilho, evento, modo_identificacao, data_cy, url_contem,
      atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, permitir_fechar_modal, intervalo_reexibicao_dias, categoria,
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis, segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    // Merge incoming values with existing to validate even on partial update
    const pfm = permitir_fechar_modal !== undefined ? Boolean(permitir_fechar_modal) : existente.permitir_fechar_modal
    const fh = feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : existente.feedback_habilitado
    const ecl = exige_confirmacao_leitura !== undefined ? Boolean(exige_confirmacao_leitura) : existente.exige_confirmacao_leitura
    const erroFechamento = validarFechamentoObrigatorio(pfm, fh, ecl)
    if (erroFechamento) return res.status(400).json({ erro: erroFechamento })

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
        ...(tela !== undefined && { tela: tela?.trim() || '' }),
        ...(imagem_url !== undefined && { imagem_url: imagem_url?.trim() || null }),
        ...(video_url !== undefined && { video_url: video_url?.trim() || null }),
        ...(texto_botao !== undefined && { texto_botao: texto_botao?.trim() || null }),
        ...(url_botao !== undefined && { url_botao: url_botao?.trim() || null }),
        ...(feedback_habilitado !== undefined && { feedback_habilitado: Boolean(feedback_habilitado) }),
        ...(modo_exibicao !== undefined && { modo_exibicao: modo_exibicao?.trim() || 'modal_automatica' }),
        ...(gatilho !== undefined && { gatilho: gatilho?.trim() || 'ao_abrir_tela' }),
        ...(evento !== undefined && { evento: evento?.trim() || null }),
        ...(modo_identificacao !== undefined && { modo_identificacao: modo_identificacao?.trim() || 'sistema_tela' }),
        ...(data_cy !== undefined && { data_cy: data_cy?.trim() || null }),
        ...(url_contem !== undefined && { url_contem: url_contem?.trim() || null }),
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
        ...(permitir_fechar_modal !== undefined && { permitir_fechar_modal: Boolean(permitir_fechar_modal) }),
        ...(intervalo_reexibicao_dias !== undefined && {
          intervalo_reexibicao_dias: intervalo_reexibicao_dias != null && intervalo_reexibicao_dias !== '' ? Number(intervalo_reexibicao_dias) : null,
        }),
        ...(categoria !== undefined && { categoria: categoria?.trim() || null }),
        ...(segmentar_cliente_ids !== undefined && { segmentar_cliente_ids: parseArray(segmentar_cliente_ids) }),
        ...(segmentar_unidade_ids !== undefined && { segmentar_unidade_ids: parseArray(segmentar_unidade_ids) }),
        ...(segmentar_perfis !== undefined && { segmentar_perfis: parseArray(segmentar_perfis) }),
        ...(segmentar_usuario_tipos !== undefined && { segmentar_usuario_tipos: parseArray(segmentar_usuario_tipos) }),
        ...(segmentar_estados !== undefined && { segmentar_estados: parseArray(segmentar_estados) }),
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

    await prisma.campanha.update({ where: { id }, data: { ativo: false } })
    res.json({ mensagem: 'Campanha inativada com sucesso.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao inativar campanha.' })
  }
}

export async function testarElegibilidade(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { sistema, tela, url, usuario_id, evento, cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.body

    const campanha = await prisma.campanha.findUnique({ where: { id } })
    if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const criterios: Criterio[] = []
    let elegivel = true
    let firstBlock: string | null = null
    const agora = new Date()

    function block(nome: string, motivo: string, detalhe?: string) {
      criterios.push({ nome, status: 'bloqueado', detalhe: detalhe ?? motivo })
      if (!firstBlock) firstBlock = motivo
      elegivel = false
    }
    function ok(nome: string, detalhe?: string) {
      criterios.push({ nome, status: 'ok', detalhe })
    }
    function warn(nome: string, detalhe: string) {
      criterios.push({ nome, status: 'aviso', detalhe })
    }
    function fmtDate(d: Date) {
      return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    }

    // 1. Campanha ativa
    if (!campanha.ativo) {
      block('Campanha ativa', 'A campanha está inativa.')
    } else {
      ok('Campanha ativa')
    }

    // 2. Vigência
    if (campanha.data_inicio && agora < campanha.data_inicio) {
      block('Vigência', `Campanha ainda não iniciou. Início: ${fmtDate(campanha.data_inicio)}.`)
    } else if (campanha.data_fim && agora > campanha.data_fim) {
      block('Vigência', `Campanha encerrou em ${fmtDate(campanha.data_fim)}.`)
    } else {
      ok('Vigência', campanha.data_inicio || campanha.data_fim ? 'Dentro do período configurado.' : 'Sem restrição de período.')
    }

    // 3. Sistema
    const sistemaInf = sistema ? String(sistema).trim() : ''
    if (!sistemaInf) {
      warn('Sistema', `Nenhum sistema informado. A campanha é para "${campanha.sistema}".`)
    } else if (campanha.sistema !== sistemaInf) {
      block('Sistema', `Sistema "${sistemaInf}" não corresponde ao configurado "${campanha.sistema}".`)
    } else {
      ok('Sistema', campanha.sistema)
    }

    // 4. Modo de identificação
    const modo = campanha.modo_identificacao || 'sistema_tela'
    if (modo === 'sistema_tela') {
      const telaInf = tela ? String(tela).trim() : ''
      if (!telaInf) {
        warn('Tela', `A campanha usa tela "${campanha.tela}". Nenhuma tela foi informada.`)
      } else if (campanha.tela !== telaInf) {
        block('Tela', `Tela "${telaInf}" não corresponde à configurada "${campanha.tela}".`)
      } else {
        ok('Tela', campanha.tela)
      }
    } else if (modo === 'url_contem') {
      const urlInf = url ? String(url).trim() : ''
      if (!campanha.url_contem) {
        ok('URL', 'Nenhuma URL configurada na campanha.')
      } else if (!urlInf) {
        block('URL', `A campanha requer URL compatível com "${campanha.url_contem}". Nenhuma URL foi informada.`)
      } else if (!matchesUrlContem(campanha.url_contem, urlInf)) {
        block('URL', `"${urlInf}" não corresponde ao padrão "${campanha.url_contem}".`)
      } else {
        ok('URL', `"${urlInf}" corresponde ao padrão "${campanha.url_contem}".`)
      }
    } else if (modo === 'data_cy') {
      warn(
        'Seletor CSS (data-cy)',
        `A campanha usa data-cy="${campanha.data_cy}". A verificação depende do DOM do sistema integrado e não pode ser simulada aqui.`
      )
    }

    // 5. Gatilho e evento
    const gatilho = campanha.gatilho || 'ao_abrir_tela'
    if (gatilho === 'apos_evento') {
      const eventoInf = evento ? String(evento).trim() : ''
      if (!campanha.evento) {
        ok('Gatilho', 'Gatilho: após evento (sem evento específico configurado).')
      } else if (!eventoInf) {
        block('Gatilho/Evento', `A campanha dispara no evento "${campanha.evento}". Nenhum evento foi informado.`)
      } else if (eventoInf !== campanha.evento) {
        block('Gatilho/Evento', `Evento "${eventoInf}" não corresponde ao configurado "${campanha.evento}".`)
      } else {
        ok('Gatilho/Evento', `Evento "${campanha.evento}" corresponde.`)
      }
    } else {
      ok('Gatilho', 'Exibição ao abrir a tela.')
    }

    // 6. Segmentação por contexto
    const ctx = {
      cliente_id: cliente_id ? String(cliente_id).trim() : '',
      unidade_id: unidade_id ? String(unidade_id).trim() : '',
      perfil: perfil ? String(perfil).trim() : '',
      usuario_tipo: usuario_tipo ? String(usuario_tipo).trim() : '',
      estado: estado ? String(estado).trim() : '',
    }
    ;[
      { lista: campanha.segmentar_cliente_ids, valor: ctx.cliente_id, nome: 'Segmentação — cliente', chave: 'cliente_id' },
      { lista: campanha.segmentar_unidade_ids, valor: ctx.unidade_id, nome: 'Segmentação — unidade', chave: 'unidade_id' },
      { lista: campanha.segmentar_perfis, valor: ctx.perfil, nome: 'Segmentação — perfil', chave: 'Perfil' },
      { lista: campanha.segmentar_usuario_tipos, valor: ctx.usuario_tipo, nome: 'Segmentação — tipo de usuário', chave: 'usuario_tipo' },
      { lista: campanha.segmentar_estados, valor: ctx.estado, nome: 'Segmentação — estado', chave: 'Estado' },
    ].forEach(({ lista, valor, nome, chave }) => {
      if (lista.length === 0) {
        ok(nome, `Sem restrição de ${chave}.`)
      } else if (!valor) {
        block(nome, `Segmentação ativa por ${chave}, mas nenhum valor informado.`, `Lista: [${lista.join(', ')}]`)
      } else if (!lista.includes(valor)) {
        block(nome, `"${valor}" não está nos ${chave} permitidos.`, `Lista: [${lista.join(', ')}]`)
      } else {
        ok(nome, `"${valor}" está nos ${chave} permitidos.`)
      }
    })

    // 7. Histórico do usuário
    const uid = usuario_id ? String(usuario_id).trim() : ''
    const alwaysShow = uid ? isAlwaysShowUser(uid) : false

    if (!uid) {
      ok('Histórico', 'Nenhum usuário informado — verificação de histórico ignorada.')
    } else if (alwaysShow) {
      ok('Histórico', `Usuário "${uid}" está na lista always-show — bloqueios de histórico ignorados.`)
    } else {
      // mostrar_uma_vez: visualização bloqueia apenas em campanhas com permitir_fechar_modal
      if (campanha.mostrar_uma_vez) {
        if (campanha.permitir_fechar_modal) {
          const jaViu = await prisma.eventoCampanha.findFirst({
            where: { campanha_id: id, usuario_id: uid, tipo_evento: 'visualizacao' },
          })
          if (jaViu) {
            block('Exibição única', `Usuário "${uid}" já visualizou esta campanha (mostrar_uma_vez = true).`)
          } else {
            ok('Exibição única', `Usuário "${uid}" ainda não visualizou esta campanha.`)
          }
        } else {
          // Mandatory: visualização não bloqueia — só feedback/confirmação
          warn('Exibição única', 'Campanha obrigatória: visualização anterior não bloqueia a reexibição. Somente feedback ou confirmação bloqueiam.')
        }
      }

      // Confirmação de leitura OR feedback (exclusivos)
      if (campanha.exige_confirmacao_leitura) {
        const jaConfirmou = await prisma.confirmacaoLeitura.findFirst({
          where: { campanha_id: id, usuario_id: uid },
        })
        if (jaConfirmou) {
          block('Confirmação de leitura', `Usuário "${uid}" já confirmou leitura desta campanha.`)
        } else {
          ok('Confirmação de leitura', `Usuário "${uid}" ainda não confirmou leitura.`)
        }
      } else if (campanha.feedback_habilitado) {
        const ultimoFeedback = await prisma.feedback.findFirst({
          where: { campanha_id: id, usuario_id: uid },
          orderBy: { criado_em: 'desc' },
        })
        if (ultimoFeedback) {
          const intervalo = campanha.intervalo_reexibicao_dias
          if (intervalo === null || intervalo === undefined) {
            block('Histórico de resposta', `Usuário "${uid}" já respondeu esta campanha.`)
          } else {
            const diasDesde = Math.floor((agora.getTime() - ultimoFeedback.criado_em.getTime()) / 86400000)
            if (diasDesde < intervalo) {
              block('Intervalo de reexibição', `Respondeu há ${diasDesde} dia(s). Disponível em ${intervalo - diasDesde} dia(s).`)
            } else {
              ok('Intervalo de reexibição', `Respondeu há ${diasDesde} dia(s). Intervalo de ${intervalo} dias já transcorreu.`)
            }
          }
        } else {
          ok('Histórico de resposta', `Usuário "${uid}" ainda não respondeu esta campanha.`)
        }
      }
    }

    // 8. Prioridade (apenas se elegível até aqui)
    let campanhaConcorrente: ResultadoElegibilidade['campanha_concorrente'] = null

    if (elegivel) {
      const filtroData = {
        AND: [
          { OR: [{ data_inicio: null as Date | null }, { data_inicio: { lte: agora } }] },
          { OR: [{ data_fim: null as Date | null }, { data_fim: { gte: agora } }] },
        ],
      }

      const gatilhoFilter = gatilho === 'apos_evento' && campanha.evento
        ? { gatilho: 'apos_evento', evento: campanha.evento }
        : { gatilho: 'ao_abrir_tela' }

      const modoFiltros: object[] = []
      const telaStr = tela ? String(tela).trim() : campanha.tela
      if (telaStr) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: telaStr })
      modoFiltros.push({ modo_identificacao: 'data_cy' })
      modoFiltros.push({ modo_identificacao: 'url_contem' })

      const candidatos = await prisma.campanha.findMany({
        where: {
          ativo: true,
          sistema: campanha.sistema,
          id: { not: id },
          OR: modoFiltros,
          ...gatilhoFilter,
          ...filtroData,
        },
        orderBy: [{ prioridade: 'desc' }, { criado_em: 'desc' }],
      })

      // Filter by mode match (same logic as widget.js checkMode)
      const urlInf2 = url ? String(url).trim() : ''
      const competidores = candidatos.filter(c => {
        const modoC = c.modo_identificacao || 'sistema_tela'
        if (modoC === 'sistema_tela') return c.tela === telaStr
        if (modoC === 'url_contem') return !!c.url_contem && !!urlInf2 && matchesUrlContem(c.url_contem, urlInf2)
        return false // data_cy: can't verify remotely
      })

      // Find first competitor that ranks before ours AND is eligible for the user
      for (const c of competidores) {
        const ranksFirst = c.prioridade > campanha.prioridade
          || (c.prioridade === campanha.prioridade && c.criado_em > campanha.criado_em)
        if (!ranksFirst) continue

        // Quick user eligibility check for this competitor
        let competitorBlocked = false
        if (uid && !alwaysShow) {
          if (c.mostrar_uma_vez && c.permitir_fechar_modal) {
            const jaViu = await prisma.eventoCampanha.findFirst({
              where: { campanha_id: c.id, usuario_id: uid, tipo_evento: 'visualizacao' },
            })
            if (jaViu) competitorBlocked = true
          }
          if (!competitorBlocked) {
            if (c.exige_confirmacao_leitura) {
              const jaConf = await prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: c.id, usuario_id: uid } })
              if (jaConf) competitorBlocked = true
            } else {
              const uf = await prisma.feedback.findFirst({
                where: { campanha_id: c.id, usuario_id: uid },
                orderBy: { criado_em: 'desc' },
              })
              if (uf) {
                const intv = c.intervalo_reexibicao_dias
                if (intv === null || intv === undefined) {
                  competitorBlocked = true
                } else {
                  const dias = Math.floor((agora.getTime() - uf.criado_em.getTime()) / 86400000)
                  if (dias < intv) competitorBlocked = true
                }
              }
            }
          }
        }

        if (!competitorBlocked) {
          campanhaConcorrente = {
            id: c.id,
            titulo: c.titulo,
            prioridade: c.prioridade,
            motivo: `Prioridade ${c.prioridade} > ${campanha.prioridade}`,
          }
          break
        }
      }

      if (campanhaConcorrente) {
        warn('Prioridade', `A campanha "${campanhaConcorrente.titulo}" (prioridade ${campanhaConcorrente.prioridade}) será exibida primeiro. Esta campanha não seria a primeira exibida nesta visita.`)
      } else {
        ok('Prioridade', 'Nenhuma campanha concorrente com maior prioridade para este contexto.')
      }
    }

    const exibiria = elegivel && campanhaConcorrente === null

    const resultado: ResultadoElegibilidade = {
      elegivel,
      exibiria,
      motivo: firstBlock
        ?? (campanhaConcorrente
          ? `A campanha "${campanhaConcorrente.titulo}" seria exibida antes desta.`
          : 'Campanha elegível para exibição.'),
      criterios,
      campanha_concorrente: campanhaConcorrente,
    }

    res.json(resultado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao testar elegibilidade.' })
  }
}
