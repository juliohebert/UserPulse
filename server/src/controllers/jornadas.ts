import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { checarLimiteJornadasAtivas, deveChecarLimiteCadastro, motivoBloqueioAtivacao, motivoBloqueioEscrita, motivoRecursoNaoPermitido, planoEfetivoParaLimite } from '../lib/tenantGuards'

const TIPOS_ETAPA = ['tour', 'campanha', 'link']

interface EtapaInput {
  titulo?: string
  descricao?: string
  tipo?: string
  tour_id?: string
  campanha_id?: string
  url?: string
  texto_cta?: string
  abrir_nova_aba?: boolean
  obrigatoria?: boolean
}

interface BlocoInput {
  titulo?: string
  descricao?: string
  obrigatorio?: boolean
  ativo?: boolean
  etapas?: unknown
}

// Bloco já validado, com as etapas resolvidas (nome técnico: BlocoJornada;
// nome visual na UI/widget: "Pacote").
interface BlocoValidado {
  titulo: string
  descricao?: string
  obrigatorio?: boolean
  ativo?: boolean
  etapas: EtapaInput[]
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

async function slugUnico(tenantId: string, base: string, ignorarId?: string): Promise<string> {
  let slug = base
  let contador = 1
  while (true) {
    const existente = await prisma.jornada.findFirst({
      where: { tenant_id: tenantId, slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    })
    if (!existente) return slug
    slug = `${base}-${contador++}`
  }
}

// Cada etapa deve ter exatamente uma referência de conteúdo, de acordo com o
// tipo: tour_id (tipo tour), campanha_id (tipo campanha) ou url (tipo link) —
// nunca mais de uma preenchida. Validado aqui na aplicação; não há constraint
// de banco garantindo essa exclusividade (decisão do modelo aprovado).
function validarEtapas(etapas: unknown, prefixo: string): { erro: string | null; lista: EtapaInput[] } {
  if (etapas === undefined || etapas === null) return { erro: null, lista: [] }
  if (!Array.isArray(etapas)) {
    return { erro: `${prefixo}: etapas deve ser uma lista.`, lista: [] }
  }
  for (const [i, e] of (etapas as EtapaInput[]).entries()) {
    const rotulo = `${prefixo} - Etapa ${i + 1}`
    if (!e.titulo?.trim()) return { erro: `${rotulo}: título é obrigatório.`, lista: [] }
    if (!e.tipo || !TIPOS_ETAPA.includes(e.tipo)) {
      return { erro: `${rotulo}: tipo inválido. Use tour, campanha ou link.`, lista: [] }
    }
    const temTour = Boolean(e.tour_id?.trim())
    const temCampanha = Boolean(e.campanha_id?.trim())
    const temUrl = Boolean(e.url?.trim())

    if (e.tipo === 'tour') {
      if (!temTour) return { erro: `${rotulo}: tour_id é obrigatório para o tipo "tour".`, lista: [] }
      if (temCampanha || temUrl) return { erro: `${rotulo}: tipo "tour" não deve ter campanha_id/url preenchidos.`, lista: [] }
    } else if (e.tipo === 'campanha') {
      if (!temCampanha) return { erro: `${rotulo}: campanha_id é obrigatório para o tipo "campanha".`, lista: [] }
      if (temTour || temUrl) return { erro: `${rotulo}: tipo "campanha" não deve ter tour_id/url preenchidos.`, lista: [] }
    } else {
      // link
      if (!temUrl) return { erro: `${rotulo}: url é obrigatória para o tipo "link".`, lista: [] }
      if (temTour || temCampanha) return { erro: `${rotulo}: tipo "link" não deve ter tour_id/campanha_id preenchidos.`, lista: [] }
    }
  }
  return { erro: null, lista: etapas as EtapaInput[] }
}

// blocos é opcional no payload (undefined = "não mexer" no PUT); cada bloco
// exige título e suas próprias etapas são validadas com o mesmo validarEtapas.
function validarBlocos(blocos: unknown): { erro: string | null; lista: BlocoValidado[] } {
  if (blocos === undefined) return { erro: null, lista: [] }
  if (!Array.isArray(blocos)) {
    return { erro: 'blocos deve ser uma lista.', lista: [] }
  }
  const resultado: BlocoValidado[] = []
  for (const [i, b] of (blocos as BlocoInput[]).entries()) {
    const n = i + 1
    if (!b.titulo?.trim()) return { erro: `Pacote ${n}: título é obrigatório.`, lista: [] }
    const { erro: erroEtapas, lista: listaEtapas } = validarEtapas(b.etapas, `Pacote ${n}`)
    if (erroEtapas) return { erro: erroEtapas, lista: [] }
    // Pacote vazio (sem etapas) apareceria como "concluído" automaticamente no
    // widget (nenhuma etapa obrigatória pendente) — não é um estado válido.
    if (listaEtapas.length === 0) return { erro: `Pacote ${n}: adicione pelo menos uma etapa.`, lista: [] }
    resultado.push({
      titulo: b.titulo,
      descricao: b.descricao,
      obrigatorio: b.obrigatorio,
      ativo: b.ativo,
      etapas: listaEtapas,
    })
  }
  return { erro: null, lista: resultado }
}

function montarDadosEtapa(e: EtapaInput, ordem: number) {
  return {
    ordem,
    titulo: e.titulo!.trim(),
    descricao: e.descricao?.trim() || null,
    tipo: e.tipo!,
    tour_id: e.tipo === 'tour' ? e.tour_id!.trim() : null,
    campanha_id: e.tipo === 'campanha' ? e.campanha_id!.trim() : null,
    url: e.tipo === 'link' ? e.url!.trim() : null,
    texto_cta: e.tipo === 'link' ? (e.texto_cta?.trim() || 'Abrir') : null,
    abrir_nova_aba: e.tipo === 'link' ? (e.abrir_nova_aba !== undefined ? Boolean(e.abrir_nova_aba) : true) : true,
    obrigatoria: e.obrigatoria !== undefined ? Boolean(e.obrigatoria) : true,
  }
}

function montarDadosBloco(b: BlocoValidado, ordem: number) {
  return {
    ordem,
    titulo: b.titulo.trim(),
    descricao: b.descricao?.trim() || null,
    obrigatorio: b.obrigatorio !== undefined ? Boolean(b.obrigatorio) : true,
    ativo: b.ativo !== undefined ? Boolean(b.ativo) : true,
    etapas: {
      create: b.etapas.map((e, i) => montarDadosEtapa(e, i)),
    },
  }
}

// Inclui só campos básicos do Tour/Campanha referenciado.
// — o suficiente pro admin mostrar "aponta para: X" sem trazer o cadastro inteiro.
const INCLUDE_BLOCOS = {
  blocos: {
    orderBy: { ordem: 'asc' as const },
    include: {
      etapas: {
        orderBy: { ordem: 'asc' as const },
        include: {
          tour: { select: { id: true, titulo: true, slug: true } },
          campanha: { select: { id: true, titulo: true, slug: true, ativo: true } },
        },
      },
    },
  },
}

export async function listar(req: Request, res: Response) {
  try {
    const { busca, ativo } = req.query as Record<string, string | undefined>

    const where: Prisma.JornadaWhereInput = { tenant_id: req.adminUser!.tenant_id }
    if (ativo === 'true') where.ativo = true
    else if (ativo === 'false') where.ativo = false

    if (busca?.trim()) {
      const termo = busca.trim()
      where.OR = [
        { titulo: { contains: termo, mode: 'insensitive' } },
        { slug: { contains: termo, mode: 'insensitive' } },
      ]
    }

    // _count de blocos é direto (relação de 1º nível); total de etapas exige
    // somar o _count aninhado de cada bloco — ainda em uma única query.
    const jornadas = await prisma.jornada.findMany({
      where,
      orderBy: { criado_em: 'desc' },
      include: {
        blocos: { select: { _count: { select: { etapas: true } } } },
      },
    })

    const resultado = jornadas.map(j => {
      const totalEtapas = j.blocos.reduce((soma, b) => soma + b._count.etapas, 0)
      const { blocos, ...resto } = j
      return { ...resto, _count: { blocos: blocos.length, etapas: totalEtapas } }
    })

    res.json(resultado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar jornadas.' })
  }
}

export async function buscarPorId(req: Request, res: Response) {
  try {
    const jornada = await prisma.jornada.findFirst({
      where: { id: req.params.id as string, tenant_id: req.adminUser!.tenant_id },
      include: INCLUDE_BLOCOS,
    })
    if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada.' })
    res.json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar jornada.' })
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })
    const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_jornadas')
    if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })

    const { titulo, descricao, ativo, permitir_refazer, permitir_pacotes_fora_ordem, blocos } = req.body
    const {
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis,
      segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    if (!titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo é obrigatório.' })
    }

    const { erro: erroBlocos, lista: listaBlocos } = validarBlocos(blocos)
    if (erroBlocos) return res.status(400).json({ erro: erroBlocos })
    // Jornada sem nenhum pacote apareceria como "concluída" automaticamente no
    // widget (nenhum pacote obrigatório pendente) — não é um estado válido.
    if (listaBlocos.length === 0) {
      return res.status(400).json({ erro: 'A jornada precisa ter pelo menos um pacote.' })
    }

    const ativoBool = ativo !== undefined ? Boolean(ativo) : true
    if (ativoBool) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
    }
    // Fase 6D — em trial, o limite conta TOTAL cadastrado, então precisa
    // checar mesmo criando com ativo:false (ver deveChecarLimiteCadastro).
    if (deveChecarLimiteCadastro(ativoBool, tenant.plano)) {
      const limite = await checarLimiteJornadasAtivas(tenantId, planoEfetivoParaLimite(tenant))
      if (limite) return res.status(403).json({ erro: limite })
    }

    const slug = await slugUnico(tenantId, gerarSlugBase(titulo))

    const jornada = await prisma.jornada.create({
      data: {
        tenant_id: tenantId,
        slug,
        titulo: titulo.trim(),
        descricao: descricao?.trim() || null,
        ativo: ativoBool,
        permitir_refazer: permitir_refazer !== undefined ? Boolean(permitir_refazer) : false,
        permitir_pacotes_fora_ordem: permitir_pacotes_fora_ordem !== undefined ? Boolean(permitir_pacotes_fora_ordem) : true,
        segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [],
        segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [],
        segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [],
        segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [],
        segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [],
        blocos: {
          create: listaBlocos.map((b, i) => montarDadosBloco(b, i)),
        },
      },
      include: INCLUDE_BLOCOS,
    })

    res.status(201).json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar jornada.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    const existente = await prisma.jornada.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) return res.status(404).json({ erro: 'Jornada não encontrada.' })

    const { titulo, descricao, ativo, permitir_refazer, permitir_pacotes_fora_ordem, blocos } = req.body
    const {
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis,
      segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    if (titulo !== undefined && !titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo não pode ficar vazio.' })
    }

    // Só checa bloqueio quando a requisição está de fato LIGANDO a jornada
    // (false -> true) — mesmo raciocínio de campanhas.ts/tours.ts atualizar().
    const ativandoAgora = ativo !== undefined && Boolean(ativo) && !existente.ativo
    if (ativandoAgora) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
      const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_jornadas')
      if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })
      // excluirId: a própria jornada já existe (só está inativa) — não pode
      // contar contra si mesma na contagem de trial (ver checarLimiteJornadasAtivas).
      const limite = await checarLimiteJornadasAtivas(req.adminUser!.tenant_id, planoEfetivoParaLimite(tenant), existente.id)
      if (limite) return res.status(403).json({ erro: limite })
    }

    let listaBlocos: BlocoValidado[] | null = null
    if (blocos !== undefined) {
      const { erro: erroBlocos, lista } = validarBlocos(blocos)
      if (erroBlocos) return res.status(400).json({ erro: erroBlocos })
      // Só se aplica quando blocos é de fato reenviado (substituição) — se o
      // campo não vier no PUT, os pacotes existentes permanecem intocados.
      if (lista.length === 0) {
        return res.status(400).json({ erro: 'A jornada precisa ter pelo menos um pacote.' })
      }
      listaBlocos = lista
    }

    // Slug é gerado só no POST e nunca muda depois — estável pra não quebrar
    // referências/URLs internas e debug, mesmo que o título seja editado.
    const jornada = await prisma.$transaction(async tx => {
      if (listaBlocos) {
        // Apaga e recria — mesma estratégia simples/segura de sempre. Excluir
        // os blocos já remove as etapas dentro deles (onDelete: Cascade).
        await tx.blocoJornada.deleteMany({ where: { jornada_id: id } })
      }
      return tx.jornada.update({
        where: { id },
        data: {
          ...(titulo !== undefined && { titulo: titulo.trim() }),
          ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
          ...(ativo !== undefined && { ativo: Boolean(ativo) }),
          ...(permitir_refazer !== undefined && { permitir_refazer: Boolean(permitir_refazer) }),
          ...(permitir_pacotes_fora_ordem !== undefined && { permitir_pacotes_fora_ordem: Boolean(permitir_pacotes_fora_ordem) }),
          ...(segmentar_cliente_ids !== undefined && { segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [] }),
          ...(segmentar_unidade_ids !== undefined && { segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [] }),
          ...(segmentar_perfis !== undefined && { segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [] }),
          ...(segmentar_usuario_tipos !== undefined && { segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [] }),
          ...(segmentar_estados !== undefined && { segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [] }),
          ...(listaBlocos && {
            blocos: {
              create: listaBlocos.map((b, i) => montarDadosBloco(b, i)),
            },
          }),
        },
        include: INCLUDE_BLOCOS,
      })
    })

    res.json(jornada)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar jornada.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    const existente = await prisma.jornada.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) return res.status(404).json({ erro: 'Jornada não encontrada.' })

    // Exclusão de verdade. Blocos e etapas caem em cascade (migration);
    // eventos usam o comportamento padrão da FK (Restrict): se já existir
    // EventoJornada para esta jornada, a exclusão falha com P2003 abaixo.
    await prisma.jornada.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(409).json({ erro: 'Não é possível remover porque já existem eventos vinculados. Inative este item.' })
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover jornada.' })
  }
}
