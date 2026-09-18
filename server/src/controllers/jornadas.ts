import { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { assinarTokenPreviewJornada, verificarTokenPreviewJornada, JORNADA_PREVIEW_TTL_SEGUNDOS } from '../lib/jornadaPreviewToken'
import prisma from '../lib/prisma'
import { checarLimiteJornadasAtivas, deveChecarLimiteCadastro, motivoBloqueioAtivacao, motivoBloqueioEscrita, motivoRecursoNaoPermitido, planoEfetivoParaLimite } from '../lib/tenantGuards'
import { normalizarDominio } from '../lib/dominio'
import { validarBooleanosEstritos } from '../lib/validacao'

const TIPOS_ETAPA = ['tour', 'campanha', 'link']

interface EtapaInput {
  id?: string
  titulo?: string
  descricao?: string
  tipo?: string
  tour_id?: string
  campanha_id?: string
  url?: string
  texto_cta?: string
  abrir_nova_aba?: boolean
  obrigatoria?: boolean
  ativo?: boolean
}

interface BlocoInput {
  id?: string
  titulo?: string
  descricao?: string
  obrigatorio?: boolean
  ativo?: boolean
  etapas?: unknown
}

// Bloco já validado, com as etapas resolvidas (nome técnico: BlocoJornada;
// nome visual na UI/widget: "Pacote").
interface BlocoValidado {
  id?: string
  titulo: string
  descricao?: string
  obrigatorio?: boolean
  ativo?: boolean
  etapas: EtapaInput[]
}

export function idsDuplicados(blocos: BlocoValidado[]): string | null {
  const idsBlocos = blocos.flatMap(b => b.id ? [b.id] : [])
  if (new Set(idsBlocos).size !== idsBlocos.length) return 'Há IDs de pacotes duplicados.'
  const idsEtapas = blocos.flatMap(b => b.etapas.flatMap(e => e.id ? [e.id] : []))
  if (new Set(idsEtapas).size !== idsEtapas.length) return 'Há IDs de etapas duplicados.'
  return null
}

export function campanhaExecutavelEmJornada(campanha: {
  feedback_habilitado: boolean
  exige_confirmacao_leitura: boolean
  url_botao: string | null
  conteudos: Array<{ url_botao: string | null }>
  destaques: Array<{ url_botao: string | null }>
}): boolean {
  return campanha.feedback_habilitado || campanha.exige_confirmacao_leitura || Boolean(
    campanha.url_botao?.trim()
    || campanha.conteudos.some(item => item.url_botao?.trim())
    || campanha.destaques.some(item => item.url_botao?.trim())
  )
}

// Exportada pra ser testada diretamente em jornadas.test.ts — mesma
// normalização de campanhas.ts/sistemas.ts (ver normalizarDominio em
// lib/dominio.ts). Nunca valida contra Sistema.dominios: um valor salvo aqui
// que não esteja mais no catálogo atual do Sistema continua sendo
// persistido/aceito sem filtro (drift histórico é responsabilidade da UI, ver
// comentário em jornadas/Form.tsx).
export function parseDominios(v: unknown): string[] {
  const lista = Array.isArray(v) ? (v as unknown[]).map(String) : []
  return lista.map(normalizarDominio).filter(Boolean)
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
  for (const [i, bruto] of (etapas as unknown[]).entries()) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { erro: `${prefixo} - Etapa ${i + 1}: configuração inválida.`, lista: [] }
    const e = bruto as EtapaInput
    const rotulo = `${prefixo} - Etapa ${i + 1}`
    for (const campo of ['abrir_nova_aba', 'obrigatoria', 'ativo'] as const) {
      if (e[campo] !== undefined && typeof e[campo] !== 'boolean') return { erro: `${rotulo}: ${campo} deve ser um booleano real (true ou false).`, lista: [] }
    }
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
  for (const [i, bruto] of (blocos as unknown[]).entries()) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { erro: `Pacote ${i + 1}: configuração inválida.`, lista: [] }
    const b = bruto as BlocoInput
    const n = i + 1
    for (const campo of ['obrigatorio', 'ativo'] as const) {
      if (b[campo] !== undefined && typeof b[campo] !== 'boolean') return { erro: `Pacote ${n}: ${campo} deve ser um booleano real (true ou false).`, lista: [] }
    }
    if (!b.titulo?.trim()) return { erro: `Pacote ${n}: título é obrigatório.`, lista: [] }
    const { erro: erroEtapas, lista: listaEtapas } = validarEtapas(b.etapas, `Pacote ${n}`)
    if (erroEtapas) return { erro: erroEtapas, lista: [] }
    // Pacote vazio (sem etapas) apareceria como "concluído" automaticamente no
    // widget (nenhuma etapa obrigatória pendente) — não é um estado válido.
    if (listaEtapas.length === 0) return { erro: `Pacote ${n}: adicione pelo menos uma etapa.`, lista: [] }
    resultado.push({
      id: typeof b.id === 'string' ? b.id : undefined,
      titulo: b.titulo,
      descricao: b.descricao,
      obrigatorio: b.obrigatorio,
      ativo: b.ativo,
      etapas: listaEtapas,
    })
  }
  return { erro: null, lista: resultado }
}

async function validarReferenciasConteudo(tenantId: string, blocos: BlocoValidado[], validarExecucao = false): Promise<string | null> {
  const tours = [...new Set(blocos.flatMap(b => b.etapas.filter(e => e.tipo === 'tour' && e.tour_id).map(e => e.tour_id as string)))]
  const campanhas = [...new Set(blocos.flatMap(b => b.etapas.filter(e => e.tipo === 'campanha' && e.campanha_id).map(e => e.campanha_id as string)))]
  const [toursEncontrados, campanhasEncontradas] = await Promise.all([
    tours.length ? prisma.tourGuiado.findMany({ where: { tenant_id: tenantId, id: { in: tours } }, select: { id: true, permite_jornada: true, passos: { select: { seletor: true } } } }) : [],
    campanhas.length ? prisma.campanha.findMany({
      where: { tenant_id: tenantId, id: { in: campanhas } },
      select: {
        id: true, ativo: true, status: true, feedback_habilitado: true,
        exige_confirmacao_leitura: true, url_botao: true,
        conteudos: { select: { url_botao: true } },
        destaques: { where: { ativo: true }, select: { url_botao: true } },
      },
    }) : [],
  ])
  const idsTours = new Set(toursEncontrados.map(t => t.id))
  const idsCampanhas = new Set(campanhasEncontradas.filter(c => campanhas.includes(c.id)).map(c => c.id))
  for (const [bi, bloco] of blocos.entries()) for (const [ei, etapa] of bloco.etapas.entries()) {
    const tour = etapa.tipo === 'tour' ? toursEncontrados.find(t => t.id === etapa.tour_id) : null
    if (etapa.tipo === 'tour' && (!idsTours.has(etapa.tour_id!) || !tour?.permite_jornada || (validarExecucao && (tour.passos.length === 0 || tour.passos.some(p => !p.seletor.trim()))))) return `Pacote ${bi + 1}, etapa ${ei + 1}: Tour não disponível ou sem seletores válidos.`
    const campanha = etapa.tipo === 'campanha' ? campanhasEncontradas.find(c => c.id === etapa.campanha_id) : null
    if (etapa.tipo === 'campanha' && (!idsCampanhas.has(etapa.campanha_id!) || (validarExecucao && (!campanha || !campanha.ativo || campanha.status !== 'ATIVA' || !campanhaExecutavelEmJornada(campanha))))) return `Pacote ${bi + 1}, etapa ${ei + 1}: Campanha não está ativa, não foi encontrada ou não possui ação de conclusão.`
  }
  return null
}

export function validarEventoJornadaEstrutura(input: {
  tipo_evento: string
  bloco_id?: string | null
  etapa_id?: string | null
  bloco?: { jornada_id: string } | null
  etapa?: { bloco_id: string } | null
}): string | null {
  const nivelJornada = ['jornada_aberta', 'jornada_iniciada', 'jornada_concluida'].includes(input.tipo_evento)
  const nivelBloco = ['bloco_aberto', 'bloco_iniciado', 'bloco_concluido'].includes(input.tipo_evento)
  const nivelEtapa = ['etapa_aberta', 'etapa_concluida', 'etapa_pulada'].includes(input.tipo_evento)
  if (nivelJornada && (input.bloco_id || input.etapa_id)) return 'Este evento não aceita bloco_id ou etapa_id.'
  if (nivelBloco && (!input.bloco_id || input.etapa_id)) return 'Este evento exige somente bloco_id.'
  if (nivelEtapa && (!input.bloco_id || !input.etapa_id)) return 'Este evento exige bloco_id e etapa_id.'
  if (!nivelJornada && !nivelBloco && !nivelEtapa) return 'Combinação de evento inválida.'
  if (input.bloco_id && (!input.bloco || input.bloco.jornada_id === '')) return 'Pacote não pertence à jornada.'
  if (input.etapa_id && (!input.etapa || input.etapa.bloco_id !== input.bloco_id)) return 'Etapa não pertence ao pacote informado.'
  return null
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
    abrir_nova_aba: e.tipo === 'link' ? (e.abrir_nova_aba !== undefined ? e.abrir_nova_aba : true) : true,
    obrigatoria: e.obrigatoria !== undefined ? e.obrigatoria : true,
    ativo: e.ativo !== undefined ? e.ativo : true,
  }
}

function montarDadosEtapaSemOrdem(e: EtapaInput, ordem: number) {
  const dados = montarDadosEtapa(e, ordem)
  return dados
}

function montarDadosBloco(b: BlocoValidado, ordem: number) {
  return {
    ordem,
    titulo: b.titulo.trim(),
    descricao: b.descricao?.trim() || null,
    obrigatorio: b.obrigatorio !== undefined ? b.obrigatorio : true,
    ativo: b.ativo !== undefined ? b.ativo : true,
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
          campanha: { select: { id: true, nome_interno: true, titulo: true, slug: true, ativo: true } },
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
    if (err instanceof Error && (err.message.includes('não pertence') || err.message.includes('não correspond'))) {
      return res.status(400).json({ erro: err.message })
    }
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

export async function emitirTokenPreview(req: Request, res: Response) {
  const jornada = await prisma.jornada.findFirst({
    where: { id: String(req.params.id), tenant_id: req.adminUser!.tenant_id },
    select: { id: true },
  })
  if (!jornada) return res.status(404).json({ erro: 'Jornada não encontrada.' })
  const token = assinarTokenPreviewJornada({
    tenant_id: req.adminUser!.tenant_id,
    jornada_id: jornada.id,
    admin_user_id: req.adminUser!.id,
    nonce: randomUUID(),
  })
  res.json({ token, jornada_id: jornada.id, expira_em: new Date(Date.now() + JORNADA_PREVIEW_TTL_SEGUNDOS * 1000).toISOString() })
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
      segmentar_usuario_tipos, segmentar_estados, segmentar_dominios,
    } = req.body

    const erroBooleanos = validarBooleanosEstritos(req.body, ['ativo', 'permitir_refazer', 'permitir_pacotes_fora_ordem'])
    if (erroBooleanos) return res.status(400).json({ erro: erroBooleanos })

    if (!titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo é obrigatório.' })
    }
    const ativoBool = ativo !== undefined ? ativo : false

    const { erro: erroBlocos, lista: listaBlocos } = validarBlocos(blocos)
    if (erroBlocos) return res.status(400).json({ erro: erroBlocos })
    const erroIds = idsDuplicados(listaBlocos)
    if (erroIds) return res.status(400).json({ erro: erroIds })
    // Jornada sem nenhum pacote apareceria como "concluída" automaticamente no
    // widget (nenhum pacote obrigatório pendente) — não é um estado válido.
    if (listaBlocos.length === 0) {
      return res.status(400).json({ erro: 'A jornada precisa ter pelo menos um pacote.' })
    }
    const erroReferencias = await validarReferenciasConteudo(tenantId, listaBlocos, ativoBool)
    if (erroReferencias) return res.status(400).json({ erro: erroReferencias })
    if (ativoBool && !listaBlocos.some(b => b.ativo !== false && b.etapas.some(e => e.ativo !== false))) {
      return res.status(400).json({ erro: 'Jornada ativa precisa de pelo menos um pacote e uma etapa ativos.' })
    }

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
        permitir_refazer: permitir_refazer !== undefined ? permitir_refazer : false,
        permitir_pacotes_fora_ordem: permitir_pacotes_fora_ordem !== undefined ? permitir_pacotes_fora_ordem : true,
        segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [],
        segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [],
        segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [],
        segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [],
        segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [],
        segmentar_dominios: parseDominios(segmentar_dominios),
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
      segmentar_usuario_tipos, segmentar_estados, segmentar_dominios,
    } = req.body

    const erroBooleanos = validarBooleanosEstritos(req.body, ['ativo', 'permitir_refazer', 'permitir_pacotes_fora_ordem'])
    if (erroBooleanos) return res.status(400).json({ erro: erroBooleanos })

    if (titulo !== undefined && !titulo?.trim()) {
      return res.status(400).json({ erro: 'titulo não pode ficar vazio.' })
    }

    // Só checa bloqueio quando a requisição está de fato LIGANDO a jornada
    // (false -> true) — mesmo raciocínio de campanhas.ts/tours.ts atualizar().
    const ativandoAgora = ativo === true && !existente.ativo
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
      const erroIds = idsDuplicados(listaBlocos)
      if (erroIds) return res.status(400).json({ erro: erroIds })
      const erroReferencias = await validarReferenciasConteudo(req.adminUser!.tenant_id, listaBlocos, ativo !== undefined ? ativo : existente.ativo)
      if (erroReferencias) return res.status(400).json({ erro: erroReferencias })
    }

    const ativoEfetivo = ativo !== undefined ? ativo : existente.ativo
    if (ativoEfetivo && listaBlocos && !listaBlocos.some(b => b.ativo !== false && b.etapas.some(e => e.ativo !== false))) {
      return res.status(400).json({ erro: 'Jornada ativa precisa de pelo menos um pacote e uma etapa ativos.' })
    }
    if (ativoEfetivo && !listaBlocos) {
      const persistidos = await prisma.blocoJornada.findMany({
        where: { jornada_id: id },
        orderBy: { ordem: 'asc' },
        include: { etapas: { orderBy: { ordem: 'asc' } } },
      })
      const validacao = validarBlocos(persistidos)
      if (validacao.erro) return res.status(400).json({ erro: validacao.erro })
      if (validacao.lista.length === 0) return res.status(400).json({ erro: 'A jornada precisa ter pelo menos um pacote.' })
       if (!validacao.lista.some(b => b.ativo !== false && b.etapas.some(e => e.ativo !== false))) return res.status(400).json({ erro: 'Jornada ativa precisa de pelo menos um pacote e uma etapa ativos.' })
      const erroReferencias = await validarReferenciasConteudo(req.adminUser!.tenant_id, validacao.lista, true)
      if (erroReferencias) return res.status(400).json({ erro: erroReferencias })
    }

    // Slug é gerado só no POST e nunca muda depois — estável pra não quebrar
    // referências/URLs internas e debug, mesmo que o título seja editado.
    const jornada = await prisma.$transaction(async tx => {
      if (listaBlocos) {
        const atuais = await tx.blocoJornada.findMany({ where: { jornada_id: id }, include: { etapas: true } })
        const idsBlocosAtuais = new Set(atuais.map(b => b.id))
        const idsBlocosEnviados = listaBlocos.filter(b => b.id).map(b => b.id as string)
        if (idsBlocosEnviados.some(blocoId => !idsBlocosAtuais.has(blocoId))) {
          throw new Error('Pacote não pertence à jornada informada.')
        }
        const idsEtapasAtuais = new Set(atuais.flatMap(b => b.etapas.map(e => e.id)))
        const idsEtapasEnviadas = listaBlocos.flatMap(b => b.etapas.filter(e => e.id).map(e => e.id as string))
        if (idsEtapasEnviadas.some(etapaId => !idsEtapasAtuais.has(etapaId))) {
          throw new Error('Etapa não pertence à jornada informada.')
        }
        await tx.etapaJornada.deleteMany({ where: { bloco: { jornada_id: id }, id: { notIn: idsEtapasEnviadas } } })
        await tx.blocoJornada.deleteMany({ where: { jornada_id: id, id: { notIn: idsBlocosEnviados } } })
        for (const [bi, bloco] of listaBlocos.entries()) {
          const dadosBloco = {
            ordem: bi,
            titulo: bloco.titulo.trim(),
            descricao: bloco.descricao?.trim() || null,
            obrigatorio: bloco.obrigatorio !== undefined ? bloco.obrigatorio : true,
            ativo: bloco.ativo !== undefined ? bloco.ativo : true,
          }
          const salvo = bloco.id
            ? await tx.blocoJornada.update({ where: { id: bloco.id }, data: dadosBloco })
            : await tx.blocoJornada.create({ data: { jornada_id: id, ...dadosBloco } })
          for (const [ei, etapa] of bloco.etapas.entries()) {
            const dadosEtapa = montarDadosEtapaSemOrdem(etapa, ei)
            if (etapa.id) await tx.etapaJornada.update({ where: { id: etapa.id }, data: { ...dadosEtapa, bloco_id: salvo.id } })
            else await tx.etapaJornada.create({ data: { bloco_id: salvo.id, ...dadosEtapa } })
          }
        }
      }
      return tx.jornada.update({
        where: { id },
        data: {
          ...(titulo !== undefined && { titulo: titulo.trim() }),
          ...(descricao !== undefined && { descricao: descricao?.trim() || null }),
          ...(ativo !== undefined && { ativo }),
          ...(permitir_refazer !== undefined && { permitir_refazer }),
          ...(permitir_pacotes_fora_ordem !== undefined && { permitir_pacotes_fora_ordem }),
          ...(segmentar_cliente_ids !== undefined && { segmentar_cliente_ids: Array.isArray(segmentar_cliente_ids) ? segmentar_cliente_ids : [] }),
          ...(segmentar_unidade_ids !== undefined && { segmentar_unidade_ids: Array.isArray(segmentar_unidade_ids) ? segmentar_unidade_ids : [] }),
          ...(segmentar_perfis !== undefined && { segmentar_perfis: Array.isArray(segmentar_perfis) ? segmentar_perfis : [] }),
          ...(segmentar_usuario_tipos !== undefined && { segmentar_usuario_tipos: Array.isArray(segmentar_usuario_tipos) ? segmentar_usuario_tipos : [] }),
          ...(segmentar_estados !== undefined && { segmentar_estados: Array.isArray(segmentar_estados) ? segmentar_estados : [] }),
          ...(segmentar_dominios !== undefined && { segmentar_dominios: parseDominios(segmentar_dominios) }),
        },
        include: INCLUDE_BLOCOS,
      })
    })

    res.json(jornada)
  } catch (err) {
    if (err instanceof Error && (err.message.includes('não pertence') || err.message.includes('não correspond'))) {
      return res.status(400).json({ erro: err.message })
    }
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
