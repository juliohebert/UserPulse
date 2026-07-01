import { Request, Response } from 'express'
import prisma from '../lib/prisma'

const MODOS_IDENTIFICACAO = ['sistema_tela', 'data_cy', 'url_contem']
const SELETOR_TIPOS = ['data_cy', 'css']
const TOOLTIP_POSICOES = ['auto', 'top', 'bottom', 'left', 'right']
const ACOES_AO_AVANCAR = ['apenas_avancar', 'clicar_elemento']
const MODOS_AVANCO_INTERACAO = ['manual', 'ao_clicar', 'ao_alterar_valor', 'ao_aparecer_elemento', 'ao_sumir_elemento']
const MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento']

interface PassoInput {
  titulo?: string
  descricao?: string
  seletor_tipo?: string
  seletor?: string
  tooltip_posicao?: string
  acao_ao_avancar?: string
  modo_avanco_interacao?: string
  seletor_confirmacao?: string
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

async function slugUnico(base: string, ignorarId?: string): Promise<string> {
  let slug = base
  let contador = 1
  while (true) {
    const existente = await prisma.tourGuiado.findFirst({
      where: { slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    })
    if (!existente) return slug
    slug = `${base}-${contador++}`
  }
}

function getCamposObrigatorios(modo: string): string[] {
  if (modo === 'data_cy') return ['data_cy']
  if (modo === 'url_contem') return ['url_contem']
  return ['tela']
}

// Seletor só é obrigatório quando o tour vai ficar ativo — um rascunho (ex.:
// recém-criado a partir de um template) pode ser salvo com seletores vazios,
// mas não pode ser publicado (ativo: true) sem eles, já que o widget depende
// do seletor para localizar o elemento na tela.
function validarPassos(passos: unknown, exigirSeletor: boolean): { erro: string | null; lista: PassoInput[] } {
  if (!Array.isArray(passos) || passos.length === 0) {
    return { erro: 'O tour precisa ter ao menos um passo.', lista: [] }
  }
  for (const [i, p] of (passos as PassoInput[]).entries()) {
    if (!p.titulo?.trim()) return { erro: `Passo ${i + 1}: título é obrigatório.`, lista: [] }
    if (exigirSeletor && !p.seletor?.trim()) {
      return { erro: 'Para ativar o tour, todos os passos precisam ter um seletor/data-cy informado.', lista: [] }
    }
    if (p.seletor_tipo && !SELETOR_TIPOS.includes(p.seletor_tipo)) {
      return { erro: `Passo ${i + 1}: tipo de seletor inválido.`, lista: [] }
    }
    if (p.tooltip_posicao && !TOOLTIP_POSICOES.includes(p.tooltip_posicao)) {
      return { erro: `Passo ${i + 1}: posição de tooltip inválida.`, lista: [] }
    }
    if (p.acao_ao_avancar && !ACOES_AO_AVANCAR.includes(p.acao_ao_avancar)) {
      return { erro: `Passo ${i + 1}: ação ao avançar inválida.`, lista: [] }
    }
    if (p.modo_avanco_interacao && !MODOS_AVANCO_INTERACAO.includes(p.modo_avanco_interacao)) {
      return { erro: `Passo ${i + 1}: modo de avanço por interação inválido.`, lista: [] }
    }
    const modoAvanco = p.modo_avanco_interacao || 'manual'
    if (exigirSeletor && MODOS_AVANCO_COM_CONFIRMACAO.includes(modoAvanco) && !p.seletor_confirmacao?.trim()) {
      return { erro: `Passo ${i + 1}: informe o seletor de confirmação para o modo de avanço escolhido.`, lista: [] }
    }
  }
  return { erro: null, lista: passos as PassoInput[] }
}

export async function listar(_req: Request, res: Response) {
  try {
    const tours = await prisma.tourGuiado.findMany({
      orderBy: { criado_em: 'desc' },
      include: { _count: { select: { passos: true } } },
    })
    res.json(tours)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar tours guiados.' })
  }
}

export async function buscarPorId(req: Request, res: Response) {
  try {
    const tour = await prisma.tourGuiado.findUnique({
      where: { id: req.params.id as string },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })
    res.json(tour)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tour guiado.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, ativo, passos } = req.body

    if (!titulo?.trim() || !sistema?.trim()) {
      return res.status(400).json({ erro: 'titulo e sistema são obrigatórios.' })
    }
    const modo = (modo_identificacao?.trim() || 'sistema_tela') as string
    if (!MODOS_IDENTIFICACAO.includes(modo)) {
      return res.status(400).json({ erro: 'modo_identificacao inválido.' })
    }
    const faltando = getCamposObrigatorios(modo).filter(c => !req.body[c]?.toString().trim())
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}.` })
    }

    // Rascunho por padrão: um tour novo só fica ativo se o pedido pedir isso
    // explicitamente (o formulário admin já envia ativo: false por padrão).
    const ativoBool = ativo !== undefined ? Boolean(ativo) : false

    const { erro: erroPassos, lista: listaPassos } = validarPassos(passos, ativoBool)
    if (erroPassos) return res.status(400).json({ erro: erroPassos })

    const slug = await slugUnico(gerarSlugBase(titulo))

    const tour = await prisma.tourGuiado.create({
      data: {
        slug,
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        sistema: sistema.trim(),
        modo_identificacao: modo,
        tela: tela?.trim() || null,
        data_cy: data_cy?.trim() || null,
        url_contem: url_contem?.trim() || null,
        prioridade: prioridade !== undefined ? Number(prioridade) : 0,
        ativo: ativoBool,
        passos: {
          create: listaPassos.map((p, i) => ({
            ordem: i,
            titulo: p.titulo!.trim(),
            descricao: p.descricao?.trim() || null,
            seletor_tipo: p.seletor_tipo?.trim() || 'data_cy',
            seletor: p.seletor!.trim(),
            tooltip_posicao: p.tooltip_posicao?.trim() || 'auto',
            acao_ao_avancar: p.acao_ao_avancar?.trim() || 'apenas_avancar',
            modo_avanco_interacao: p.modo_avanco_interacao?.trim() || 'manual',
            seletor_confirmacao: p.seletor_confirmacao?.trim() || null,
          })),
        },
      },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })

    res.status(201).json(tour)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar tour guiado.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.tourGuiado.findUnique({
      where: { id },
      include: { passos: true },
    })
    if (!existente) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, ativo, passos } = req.body

    const modo = (modo_identificacao !== undefined ? modo_identificacao?.trim() : existente.modo_identificacao) as string
    if (!MODOS_IDENTIFICACAO.includes(modo)) {
      return res.status(400).json({ erro: 'modo_identificacao inválido.' })
    }
    const merged = { ...req.body, modo_identificacao: modo }
    const vazios = getCamposObrigatorios(modo).filter(c => c in req.body && !merged[c]?.toString().trim())
    if (vazios.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios não podem ficar vazios: ${vazios.join(', ')}.` })
    }

    const ativoEfetivo = ativo !== undefined ? Boolean(ativo) : existente.ativo

    let listaPassos: PassoInput[] | null = null
    if (passos !== undefined) {
      const { erro: erroPassos, lista } = validarPassos(passos, ativoEfetivo)
      if (erroPassos) return res.status(400).json({ erro: erroPassos })
      listaPassos = lista
    } else if (ativoEfetivo) {
      // Ativando sem reenviar os passos (ex.: toggle rápido na listagem) —
      // valida os passos já salvos, que são os que o widget vai usar.
      const semSeletor = existente.passos.some(p => !p.seletor?.trim())
      if (semSeletor) {
        return res.status(400).json({ erro: 'Para ativar o tour, todos os passos precisam ter um seletor/data-cy informado.' })
      }
    }

    let slug = existente.slug
    if (titulo && titulo.trim() !== existente.titulo) {
      slug = await slugUnico(gerarSlugBase(titulo.trim()), id)
    }

    const tour = await prisma.$transaction(async tx => {
      if (listaPassos) {
        await tx.tourPasso.deleteMany({ where: { tour_id: id } })
      }
      return tx.tourGuiado.update({
        where: { id },
        data: {
          ...(titulo !== undefined && { titulo: titulo.trim(), slug }),
          ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
          ...(sistema !== undefined && { sistema: sistema.trim() }),
          ...(modo_identificacao !== undefined && { modo_identificacao: modo }),
          ...(tela !== undefined && { tela: tela?.trim() || null }),
          ...(data_cy !== undefined && { data_cy: data_cy?.trim() || null }),
          ...(url_contem !== undefined && { url_contem: url_contem?.trim() || null }),
          ...(prioridade !== undefined && { prioridade: Number(prioridade) }),
          ...(ativo !== undefined && { ativo: Boolean(ativo) }),
          ...(listaPassos && {
            passos: {
              create: listaPassos.map((p, i) => ({
                ordem: i,
                titulo: p.titulo!.trim(),
                descricao: p.descricao?.trim() || null,
                seletor_tipo: p.seletor_tipo?.trim() || 'data_cy',
                seletor: p.seletor!.trim(),
                tooltip_posicao: p.tooltip_posicao?.trim() || 'auto',
                acao_ao_avancar: p.acao_ao_avancar?.trim() || 'apenas_avancar',
                modo_avanco_interacao: p.modo_avanco_interacao?.trim() || 'manual',
                seletor_confirmacao: p.seletor_confirmacao?.trim() || null,
              })),
            },
          }),
        },
        include: { passos: { orderBy: { ordem: 'asc' } } },
      })
    })

    res.json(tour)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar tour guiado.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const existente = await prisma.tourGuiado.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    await prisma.tourGuiado.update({ where: { id }, data: { ativo: false } })
    res.json({ mensagem: 'Tour guiado inativado com sucesso.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao inativar tour guiado.' })
  }
}

export async function duplicar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const original = await prisma.tourGuiado.findUnique({
      where: { id },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!original) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const tituloCopia = `Cópia de ${original.titulo}`
    const slug = await slugUnico(gerarSlugBase(tituloCopia))

    // Copia sistema/destino e passos do original. Fica inativo (rascunho) para
    // não publicar automaticamente, e não herda os EventoTour do original —
    // é um cadastro novo, sem histórico de exibição.
    const copia = await prisma.tourGuiado.create({
      data: {
        slug,
        titulo: tituloCopia,
        descricao: original.descricao,
        sistema: original.sistema,
        modo_identificacao: original.modo_identificacao,
        tela: original.tela,
        data_cy: original.data_cy,
        url_contem: original.url_contem,
        prioridade: original.prioridade,
        ativo: false,
        passos: {
          create: original.passos.map(p => ({
            ordem: p.ordem,
            titulo: p.titulo,
            descricao: p.descricao,
            seletor_tipo: p.seletor_tipo,
            seletor: p.seletor,
            tooltip_posicao: p.tooltip_posicao,
            acao_ao_avancar: p.acao_ao_avancar,
            modo_avanco_interacao: p.modo_avanco_interacao,
            seletor_confirmacao: p.seletor_confirmacao,
          })),
        },
      },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })

    res.status(201).json(copia)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao duplicar tour guiado.' })
  }
}

export async function exportar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tour = await prisma.tourGuiado.findUnique({
      where: { id },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    // Sem id, ativo, eventos ou datas internas — só o suficiente para recriar
    // o tour em outro lugar. slug vai só como referência (importar() ignora).
    res.json({
      formato: 'userpulse.tour.v1',
      exportado_em: new Date().toISOString(),
      tour: {
        slug: tour.slug,
        titulo: tour.titulo,
        descricao: tour.descricao,
        sistema: tour.sistema,
        modo_identificacao: tour.modo_identificacao,
        tela: tour.tela,
        data_cy: tour.data_cy,
        url_contem: tour.url_contem,
        prioridade: tour.prioridade,
        passos: tour.passos.map(p => ({
          titulo: p.titulo,
          descricao: p.descricao,
          seletor_tipo: p.seletor_tipo,
          seletor: p.seletor,
          tooltip_posicao: p.tooltip_posicao,
          acao_ao_avancar: p.acao_ao_avancar,
          modo_avanco_interacao: p.modo_avanco_interacao,
          seletor_confirmacao: p.seletor_confirmacao,
        })),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao exportar tour guiado.' })
  }
}

export async function importar(req: Request, res: Response) {
  try {
    // Aceita tanto o envelope completo ({ formato, tour }) quanto o objeto do
    // tour colado direto, sem envelope.
    const body = req.body ?? {}
    if (body.formato !== undefined && body.formato !== 'userpulse.tour.v1') {
      return res.status(400).json({ erro: `Formato não suportado: "${body.formato}".` })
    }
    const dados = (body.tour && typeof body.tour === 'object') ? body.tour : body

    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, passos } = dados

    if (!titulo?.trim() || !sistema?.trim()) {
      return res.status(400).json({ erro: 'titulo e sistema são obrigatórios no JSON importado.' })
    }
    const modo = (modo_identificacao?.trim() || 'sistema_tela') as string
    if (!MODOS_IDENTIFICACAO.includes(modo)) {
      return res.status(400).json({ erro: 'modo_identificacao inválido no JSON importado.' })
    }
    const faltando = getCamposObrigatorios(modo).filter(c => !dados[c]?.toString().trim())
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios faltando no JSON importado: ${faltando.join(', ')}.` })
    }

    // Reaproveita a mesma validação de passos — sempre como rascunho, então
    // seletor não é exigido (igual a aplicar um template). id/slug/ativo do
    // JSON são ignorados: o tour importado nasce sempre inativo, com slug
    // novo gerado a partir do título.
    const { erro: erroPassos, lista: listaPassos } = validarPassos(passos, false)
    if (erroPassos) return res.status(400).json({ erro: erroPassos })

    const slug = await slugUnico(gerarSlugBase(titulo))

    const tour = await prisma.tourGuiado.create({
      data: {
        slug,
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        sistema: sistema.trim(),
        modo_identificacao: modo,
        tela: tela?.trim() || null,
        data_cy: data_cy?.trim() || null,
        url_contem: url_contem?.trim() || null,
        prioridade: prioridade !== undefined ? Number(prioridade) : 0,
        ativo: false,
        passos: {
          create: listaPassos.map((p, i) => ({
            ordem: i,
            titulo: p.titulo!.trim(),
            descricao: p.descricao?.trim() || null,
            seletor_tipo: p.seletor_tipo?.trim() || 'data_cy',
            seletor: p.seletor?.trim() || '',
            tooltip_posicao: p.tooltip_posicao?.trim() || 'auto',
            acao_ao_avancar: p.acao_ao_avancar?.trim() || 'apenas_avancar',
            modo_avanco_interacao: p.modo_avanco_interacao?.trim() || 'manual',
            seletor_confirmacao: p.seletor_confirmacao?.trim() || null,
          })),
        },
      },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })

    res.status(201).json(tour)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao importar tour guiado.' })
  }
}

export async function buscarDashboard(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tour = await prisma.tourGuiado.findUnique({
      where: { id },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const [iniciados, concluidos, pulados, elementos_nao_encontrados, eventosRecentes] = await Promise.all([
      prisma.eventoTour.count({ where: { tour_id: id, tipo_evento: 'inicio' } }),
      prisma.eventoTour.count({ where: { tour_id: id, tipo_evento: 'concluido' } }),
      prisma.eventoTour.count({ where: { tour_id: id, tipo_evento: 'pulado' } }),
      prisma.eventoTour.count({ where: { tour_id: id, tipo_evento: 'elemento_nao_encontrado' } }),
      prisma.eventoTour.findMany({
        where: { tour_id: id },
        orderBy: { criado_em: 'desc' },
        take: 100,
      }),
    ])

    const taxa_conclusao = iniciados > 0
      ? Math.round((concluidos / iniciados) * 1000) / 10
      : 0

    // passo_titulo é derivado do passo ATUAL na ordem registrada — se o tour foi
    // editado depois do evento (passos reordenados/removidos), o título pode não
    // corresponder mais exatamente ao que o usuário viu no momento do evento.
    const strContexto = (v: unknown): string | null => {
      const s = v != null ? String(v).trim() : ''
      return s || null
    }

    const eventos_recentes = eventosRecentes.map(ev => {
      const contexto = (ev.contexto && typeof ev.contexto === 'object' && !Array.isArray(ev.contexto))
        ? ev.contexto as Record<string, unknown>
        : null
      return {
        id: ev.id,
        tipo_evento: ev.tipo_evento,
        passo_ordem: ev.passo_ordem,
        passo_titulo: ev.passo_ordem != null ? tour.passos[ev.passo_ordem]?.titulo ?? null : null,
        usuario_id: ev.usuario_id,
        usuario_nome: strContexto(contexto?.usuario_nome),
        usuario_email: strContexto(contexto?.usuario_email),
        cliente_id: strContexto(contexto?.cliente_id),
        cliente_nome: strContexto(contexto?.cliente_nome),
        // "unidade" e "clínica" são sinônimos usados por sistemas diferentes —
        // já resolvidos aqui para os campos normalizados unidade_id/unidade_nome.
        unidade_id: strContexto(contexto?.unidade_id) ?? strContexto(contexto?.clinica_id),
        unidade_nome: strContexto(contexto?.unidade_nome) ?? strContexto(contexto?.clinica_nome),
        criado_em: ev.criado_em,
      }
    })

    res.json({
      tour,
      iniciados,
      concluidos,
      pulados,
      elementos_nao_encontrados,
      taxa_conclusao,
      eventos_recentes,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard do tour guiado.' })
  }
}
