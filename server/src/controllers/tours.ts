import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  checarLimiteToursAtivos,
  deveChecarLimiteCadastro,
  motivoBloqueioAtivacao,
  motivoBloqueioEscrita,
  motivoRecursoNaoPermitido,
} from '../lib/tenantGuards'

const MODOS_IDENTIFICACAO = ['sistema_tela', 'data_cy', 'url_contem']
// 'area' reaproveita o mesmo mecanismo de localização de 'css' (o runtime do
// widget trata os dois de forma idêntica ao buscar o elemento — ver
// selecionarElementoPasso em widget.js) — a diferença é só semântica: o
// seletor aponta para um container/grupo (ex.: a barra de filtros inteira) em
// vez de um elemento único, e o spotlight destaca o container inteiro. Não
// exigiu migration: seletor_tipo já era uma coluna String livre.
const SELETOR_TIPOS = ['data_cy', 'id', 'css', 'area']
const TOOLTIP_POSICOES = ['auto', 'top', 'bottom', 'left', 'right']
const ACOES_AO_AVANCAR = ['apenas_avancar', 'clicar_elemento']
const MODOS_AVANCO_INTERACAO = ['manual', 'ao_clicar', 'ao_alterar_valor', 'ao_aparecer_elemento', 'ao_sumir_elemento']
const MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento']
// feedback_tour: clique numa das opções de feedback da tela final do Tour
// (ver tourFeedback em widget.js e registrarEventoTour no controller de
// widget) — mesma lista de tipos válidos usada lá, mantida em sincronia.
const TIPOS_EVENTO_TOUR = ['inicio', 'passo_visualizado', 'elemento_nao_encontrado', 'pulado', 'concluido', 'feedback_tour']

// Segmentação por contexto (MVP) — ver comentário de segmentacao_regras em
// schema.prisma e avaliarSegmentacaoTour em widget.js (avaliação de verdade
// acontece no client, com o contexto que o widget tem na hora; aqui só
// validamos o formato antes de persistir).
const CAMPOS_SEGMENTACAO = [
  'cliente_id', 'unidade_id', 'organizacao_id', 'clinica_id',
  'usuario_tipo', 'perfil', 'estado', 'usuario_id', 'usuario_email',
  'tela', 'sistema',
]
const OPERADORES_SEGMENTACAO = ['igual', 'diferente', 'contem', 'em_lista']

export interface RegraSegmentacaoInput {
  campo?: string
  operador?: string
  valor?: string
}

// null (ou lista vazia) = sem segmentação — preserva o comportamento atual de
// qualquer tour existente (todos os contextos elegíveis). Retorna null tanto
// para "não informado" quanto para "lista vazia informada", nunca [].
// Exportada (mesmo padrão de avaliarReexibicaoPorDias em widget.ts) para ser
// testada diretamente em tours.test.ts, sem precisar de servidor HTTP nem
// banco — é a única peça de lógica de segmentação que vive no backend (a
// avaliação de verdade, contra o contexto do usuário, acontece no client, em
// avaliarSegmentacaoTour dentro de widget.js).
export function validarSegmentacaoRegras(regras: unknown): { erro: string | null; lista: RegraSegmentacaoInput[] | null } {
  if (regras === undefined || regras === null) return { erro: null, lista: null }
  if (!Array.isArray(regras)) return { erro: 'segmentacao_regras deve ser uma lista de regras.', lista: null }
  if (regras.length === 0) return { erro: null, lista: null }
  const lista: RegraSegmentacaoInput[] = []
  for (const [i, r] of (regras as RegraSegmentacaoInput[]).entries()) {
    const campo = r?.campo?.trim()
    const operador = r?.operador?.trim()
    const valor = r?.valor?.trim()
    if (!campo || !CAMPOS_SEGMENTACAO.includes(campo)) {
      return { erro: `Regra de segmentação ${i + 1}: campo inválido.`, lista: null }
    }
    if (!operador || !OPERADORES_SEGMENTACAO.includes(operador)) {
      return { erro: `Regra de segmentação ${i + 1}: operador inválido.`, lista: null }
    }
    if (!valor) {
      return { erro: `Regra de segmentação ${i + 1}: valor é obrigatório.`, lista: null }
    }
    lista.push({ campo, operador, valor })
  }
  return { erro: null, lista }
}

interface PassoInput {
  titulo?: string
  descricao?: string
  seletor_tipo?: string
  seletor?: string
  tooltip_posicao?: string
  acao_ao_avancar?: string
  modo_avanco_interacao?: string
  seletor_confirmacao?: string
  // Agrupamento visual opcional do gravador de fluxo — texto livre, sem
  // validação (mesmo tratamento de descricao/seletor_confirmacao).
  secao?: string
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
    const existente = await prisma.tourGuiado.findFirst({
      where: { tenant_id: tenantId, slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
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

export interface FiltrosListaTours {
  busca?: string
  sistema?: string
  status?: string
  passos?: string
}

// Pura — monta só o where do Prisma a partir dos filtros já usados hoje na
// tela (busca por título/sistema/slug/tela, sistema exato do dropdown,
// status ativos/inativos das abas). Sem toque em Prisma/HTTP, testável direto
// (mesmo padrão de validarSegmentacaoRegras acima).
export function montarWhereListaTours(filtros: FiltrosListaTours): Prisma.TourGuiadoWhereInput {
  const where: Prisma.TourGuiadoWhereInput = {}
  if (filtros.status === 'ativos') where.ativo = true
  else if (filtros.status === 'inativos') where.ativo = false
  if (filtros.passos === 'com') where.passos = { some: {} }
  else if (filtros.passos === 'sem') where.passos = { none: {} }
  if (filtros.sistema?.trim()) where.sistema = filtros.sistema.trim()
  if (filtros.busca?.trim()) {
    const termo = filtros.busca.trim()
    where.OR = [
      { titulo: { contains: termo, mode: 'insensitive' } },
      { sistema: { contains: termo, mode: 'insensitive' } },
      { slug: { contains: termo, mode: 'insensitive' } },
      { tela: { contains: termo, mode: 'insensitive' } },
    ]
  }
  return where
}

const TOURS_PER_PAGE_PADRAO = 10
const TOURS_PER_PAGE_MAXIMO = 100

// Pura — mesmo padrão de clamp já usado em buscarDashboard (page mínimo 1,
// per_page entre 1 e 100), só que isolada aqui pra não precisar tocar em
// buscarDashboard/funil por causa desta feature.
export function normalizarPaginacaoTours(page: unknown, perPage: unknown): { page: number; perPage: number } {
  const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)
  const perPageNum = Math.min(TOURS_PER_PAGE_MAXIMO, Math.max(1, Math.trunc(Number(perPage)) || TOURS_PER_PAGE_PADRAO))
  return { page: pageNum, perPage: perPageNum }
}

type SortKeyListaTours = 'tour' | 'sistema' | 'status' | 'passos' | 'atualizado'

function montarOrderByListaTours(sortKey?: string, sortDirection?: string): Prisma.TourGuiadoOrderByWithRelationInput {
  const direction = sortDirection === 'asc' ? 'asc' : 'desc'
  switch (sortKey as SortKeyListaTours) {
    case 'tour': return { titulo: direction }
    case 'sistema': return { sistema: direction }
    case 'status': return { ativo: direction }
    case 'passos': return { passos: { _count: direction } }
    case 'atualizado': return { atualizado_em: direction }
    default: return { criado_em: 'desc' }
  }
}

export async function listar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const { busca, sistema, status, passos, page, pageSize, sortKey, sortDirection } = req.query as Record<string, string | undefined>
    const where = { ...montarWhereListaTours({ busca, sistema, status, passos }), tenant_id: tenantId }
    const orderBy = montarOrderByListaTours(sortKey, sortDirection)

    // Sem page/pageSize, devolve o array puro de sempre — compatibilidade com
    // quem já consome /tours sem paginação (web/src/pages/Dashboard.tsx e
    // web/src/pages/jornadas/Form.tsx usam a lista inteira pra montar
    // dropdown/seleção de tours e nunca são tocados por esta mudança).
    if (page == null && pageSize == null) {
      const tours = await prisma.tourGuiado.findMany({
        where,
        orderBy,
        include: { _count: { select: { passos: true } } },
      })
      return res.json(tours)
    }

    const { page: pageNum, perPage: perPageNum } = normalizarPaginacaoTours(page, pageSize)

    const [items, total, totalGeral, ativosGeral, inativosGeral, totalPassosGeral, sistemasRows] = await Promise.all([
      prisma.tourGuiado.findMany({
        where,
        orderBy,
        include: { _count: { select: { passos: true } } },
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
      }),
      // total considerando os filtros — usado pela paginação (total_pages).
      prisma.tourGuiado.count({ where }),
      // resumo/KPIs abaixo NUNCA consideram busca/sistema/status — mesmo
      // comportamento de antes (os cards de topo já mostravam os totais da
      // base inteira, independente dos filtros aplicados na tabela) — mas
      // sempre escopados ao tenant.
      prisma.tourGuiado.count({ where: { tenant_id: tenantId } }),
      prisma.tourGuiado.count({ where: { tenant_id: tenantId, ativo: true } }),
      prisma.tourGuiado.count({ where: { tenant_id: tenantId, ativo: false } }),
      prisma.tourPasso.count({ where: { tour: { tenant_id: tenantId } } }),
      prisma.tourGuiado.findMany({ where: { tenant_id: tenantId }, distinct: ['sistema'], select: { sistema: true }, orderBy: { sistema: 'asc' } }),
    ])

    res.json({
      items,
      total,
      page: pageNum,
      per_page: perPageNum,
      total_pages: Math.max(1, Math.ceil(total / perPageNum)),
      resumo: {
        total: totalGeral,
        ativos: ativosGeral,
        inativos: inativosGeral,
        total_passos: totalPassosGeral,
      },
      sistemas: sistemasRows.map(r => r.sistema),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar tours guiados.' })
  }
}

export async function buscarPorId(req: Request, res: Response) {
  try {
    const tour = await prisma.tourGuiado.findFirst({
      where: { id: req.params.id as string, tenant_id: req.adminUser!.tenant_id },
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
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })
    const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_tours')
    if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })

    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, ativo, passos, segmentacao_regras } = req.body

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

    if (ativoBool) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
    }
    // Fase 6D — em trial, o limite conta TOTAL cadastrado, então precisa
    // checar mesmo criando com ativo:false (ver deveChecarLimiteCadastro).
    if (deveChecarLimiteCadastro(ativoBool, tenant.plano)) {
      const limite = await checarLimiteToursAtivos(tenantId, tenant.plano)
      if (limite) return res.status(403).json({ erro: limite })
    }

    const { erro: erroPassos, lista: listaPassos } = validarPassos(passos, ativoBool)
    if (erroPassos) return res.status(400).json({ erro: erroPassos })

    const { erro: erroSegmentacao, lista: listaSegmentacao } = validarSegmentacaoRegras(segmentacao_regras)
    if (erroSegmentacao) return res.status(400).json({ erro: erroSegmentacao })

    const slug = await slugUnico(tenantId, gerarSlugBase(titulo))

    const tour = await prisma.tourGuiado.create({
      data: {
        tenant_id: tenantId,
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
        // Omitido (não Prisma.DbNull) quando não há regras — deixa a coluna
        // no default (NULL), igual a um tour criado antes desta feature existir.
        ...(listaSegmentacao && { segmentacao_regras: listaSegmentacao as unknown as Prisma.InputJsonValue }),
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
            secao: p.secao?.trim() || null,
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
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    const existente = await prisma.tourGuiado.findFirst({
      where: { id, tenant_id: tenantId },
      include: { passos: true },
    })
    if (!existente) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, ativo, passos, segmentacao_regras } = req.body

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

    // Só checa bloqueio/limite/recurso do plano quando a requisição está de
    // fato LIGANDO o tour (false -> true) — mesmo raciocínio de
    // campanhas.ts atualizar().
    const ativandoAgora = ativo !== undefined && Boolean(ativo) && !existente.ativo
    if (ativandoAgora) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
      const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_tours')
      if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })
      // excluirId: o próprio tour já existe (só está inativo) — não pode
      // contar contra si mesmo na contagem de trial (ver checarLimiteToursAtivos).
      const limite = await checarLimiteToursAtivos(tenantId, tenant.plano, existente.id)
      if (limite) return res.status(403).json({ erro: limite })
    }

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

    // undefined = campo não enviado, não mexe no que já está salvo (mesmo
    // padrão de titulo/descricao/etc. acima). Enviado (mesmo como null ou
    // []) = atualiza pra "sem segmentação" ou pra lista nova validada.
    let segmentacaoInformada = false
    let listaSegmentacao: RegraSegmentacaoInput[] | null = null
    if (segmentacao_regras !== undefined) {
      const { erro: erroSegmentacao, lista } = validarSegmentacaoRegras(segmentacao_regras)
      if (erroSegmentacao) return res.status(400).json({ erro: erroSegmentacao })
      segmentacaoInformada = true
      listaSegmentacao = lista
    }

    let slug = existente.slug
    if (titulo && titulo.trim() !== existente.titulo) {
      slug = await slugUnico(tenantId, gerarSlugBase(titulo.trim()), id)
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
          ...(segmentacaoInformada && { segmentacao_regras: (listaSegmentacao as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull }),
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
                secao: p.secao?.trim() || null,
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
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    const existente = await prisma.tourGuiado.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    // Exclusão de verdade (antes este endpoint só marcava ativo:false). Conta
    // eventos primeiro em vez de deixar o banco decidir via FK: assim o 409
    // não depende de nenhum P2003 alcançar o catch (guarda ainda abaixo, só
    // por segurança contra corrida com um evento criado entre esta contagem e
    // o delete). Passos são apagados explicitamente antes do tour — mesmo já
    // caindo em cascade pela migration, isso deixa a remoção de dependências
    // própria do tour explícita, sem depender só do comportamento do banco.
    // Etapas de jornada que referenciam este tour ficam com tour_id=null
    // (SetNull, decisão já tomada no schema) — não bloqueiam a remoção.
    const totalEventos = await prisma.eventoTour.count({ where: { tour_id: id } })
    if (totalEventos > 0) {
      return res.status(409).json({ erro: 'Não é possível remover porque já existem eventos vinculados. Inative este item.' })
    }

    await prisma.$transaction([
      prisma.tourPasso.deleteMany({ where: { tour_id: id } }),
      prisma.tourGuiado.delete({ where: { id } }),
    ])
    res.status(204).send()
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(409).json({ erro: 'Não é possível remover porque já existem eventos vinculados. Inative este item.' })
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao remover tour guiado.' })
  }
}

export async function duplicar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })
    const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_tours')
    if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })

    // Fase 6D — a cópia nasce sempre inativa (ver `ativo: false` abaixo), mas
    // em trial o limite conta TOTAL cadastrado: sem esta checagem, duplicar
    // seria um jeito de contornar o limite (nunca dispara o bloqueio de
    // "ativação", já que a cópia nunca nasce ativa). Planos pagos continuam
    // podendo duplicar livremente (deveChecarLimiteCadastro(false, plano)).
    if (deveChecarLimiteCadastro(false, tenant.plano)) {
      const limite = await checarLimiteToursAtivos(tenantId, tenant.plano)
      if (limite) return res.status(403).json({ erro: limite })
    }

    const id = req.params.id as string
    const original = await prisma.tourGuiado.findFirst({
      where: { id, tenant_id: tenantId },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!original) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const tituloCopia = `Cópia de ${original.titulo}`
    const slug = await slugUnico(tenantId, gerarSlugBase(tituloCopia))

    // Copia sistema/destino e passos do original. Fica inativo (rascunho) para
    // não publicar automaticamente, e não herda os EventoTour do original —
    // é um cadastro novo, sem histórico de exibição.
    const copia = await prisma.tourGuiado.create({
      data: {
        tenant_id: tenantId,
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
        ...(original.segmentacao_regras !== null && { segmentacao_regras: original.segmentacao_regras as Prisma.InputJsonValue }),
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
            secao: p.secao,
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
    const tour = await prisma.tourGuiado.findFirst({
      where: { id, tenant_id: req.adminUser!.tenant_id },
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
        segmentacao_regras: tour.segmentacao_regras,
        passos: tour.passos.map(p => ({
          titulo: p.titulo,
          descricao: p.descricao,
          seletor_tipo: p.seletor_tipo,
          seletor: p.seletor,
          tooltip_posicao: p.tooltip_posicao,
          acao_ao_avancar: p.acao_ao_avancar,
          modo_avanco_interacao: p.modo_avanco_interacao,
          seletor_confirmacao: p.seletor_confirmacao,
          secao: p.secao,
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
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })
    const bloqueioRecurso = motivoRecursoNaoPermitido(tenant.plano, 'permite_tours')
    if (bloqueioRecurso) return res.status(403).json({ erro: bloqueioRecurso })

    // Fase 6D — tour importado nasce sempre inativo (ver "ativo do JSON é
    // ignorado" mais abaixo), mas em trial o limite conta TOTAL cadastrado:
    // mesmo raciocínio de duplicar() acima, senão importar vira outro jeito
    // de contornar o limite.
    if (deveChecarLimiteCadastro(false, tenant.plano)) {
      const limite = await checarLimiteToursAtivos(tenantId, tenant.plano)
      if (limite) return res.status(403).json({ erro: limite })
    }

    // Aceita tanto o envelope completo ({ formato, tour }) quanto o objeto do
    // tour colado direto, sem envelope.
    const body = req.body ?? {}
    if (body.formato !== undefined && body.formato !== 'userpulse.tour.v1') {
      return res.status(400).json({ erro: `Formato não suportado: "${body.formato}".` })
    }
    const dados = (body.tour && typeof body.tour === 'object') ? body.tour : body

    const { titulo, descricao, sistema, modo_identificacao, tela, data_cy, url_contem, prioridade, passos, segmentacao_regras } = dados

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

    // Campo opcional — JSON exportado antes desta feature existir não tem
    // segmentacao_regras, e isso é válido (nasce sem segmentação).
    const { erro: erroSegmentacao, lista: listaSegmentacao } = validarSegmentacaoRegras(segmentacao_regras)
    if (erroSegmentacao) return res.status(400).json({ erro: `${erroSegmentacao} (JSON importado)` })

    const slug = await slugUnico(tenantId, gerarSlugBase(titulo))

    const tour = await prisma.tourGuiado.create({
      data: {
        tenant_id: tenantId,
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
        ...(listaSegmentacao && { segmentacao_regras: listaSegmentacao as unknown as Prisma.InputJsonValue }),
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
            secao: p.secao?.trim() || null,
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

export interface FunilPassoItem {
  passo_ordem: number
  passo_titulo: string
  visualizacoes: number
  elemento_nao_encontrado: number
  // null só no último passo — não existe "próximo passo" pra medir avanço.
  proximo_passo_visualizacoes: number | null
  // Estimativa, não avanço real: o widget não registra um evento de "saiu do
  // passo N pro passo N+1" — só passo_visualizado por passo e concluido no
  // fim. avancos_estimados assume que quem visualizou o próximo passo (ou,
  // no último passo, quem concluiu o tour) necessariamente avançou a partir
  // daqui, o que é razoável (não há como ver o passo seguinte sem passar por
  // este) mas ignora quem saiu e voltou depois por outro caminho. Sempre
  // limitado a no máximo `visualizacoes`, pra nunca sugerir mais de 100% de
  // continuidade.
  avancos_estimados: number
  abandonos_estimados: number
  // null quando visualizacoes=0 (sem base pra calcular percentual)
  taxa_continuidade: number | null
  taxa_queda: number | null
  ultimo_passo: boolean
}

// Agrega passo_visualizado/elemento_nao_encontrado (já contados por
// passo_ordem via groupBy) e concluidos (contagem já calculada pros cards)
// num funil por passo — função pura, sem Prisma/HTTP, pra poder ser testada
// direto (mesmo padrão de validarSegmentacaoRegras acima).
export function montarFunilPorPasso(
  passos: Array<{ ordem: number; titulo: string }>,
  visualizacoesPorPasso: Record<number, number>,
  naoEncontradoPorPasso: Record<number, number>,
  concluidos: number,
): FunilPassoItem[] {
  return passos.map((passo, i) => {
    const ultimo = i === passos.length - 1
    const visualizacoes = visualizacoesPorPasso[passo.ordem] ?? 0
    const elemento_nao_encontrado = naoEncontradoPorPasso[passo.ordem] ?? 0
    const proximoOrdem = ultimo ? null : passos[i + 1].ordem
    const proximo_passo_visualizacoes = proximoOrdem != null ? (visualizacoesPorPasso[proximoOrdem] ?? 0) : null

    const avancosBruto = ultimo ? concluidos : (proximo_passo_visualizacoes ?? 0)
    const avancos_estimados = Math.min(avancosBruto, visualizacoes)
    const abandonos_estimados = Math.max(visualizacoes - avancos_estimados, 0)

    const taxa_continuidade = visualizacoes > 0 ? Math.round((avancos_estimados / visualizacoes) * 1000) / 10 : null
    const taxa_queda = taxa_continuidade != null ? Math.round((100 - taxa_continuidade) * 10) / 10 : null

    return {
      passo_ordem: passo.ordem,
      passo_titulo: passo.titulo,
      visualizacoes,
      elemento_nao_encontrado,
      proximo_passo_visualizacoes,
      avancos_estimados,
      abandonos_estimados,
      taxa_continuidade,
      taxa_queda,
      ultimo_passo: ultimo,
    }
  })
}

export type CategoriaFeedbackTour = 'positivo' | 'neutro' | 'negativo'

export interface FeedbackPorValorItem {
  valor: string
  label: string
  emoji: string
  categoria: CategoriaFeedbackTour
  total: number
}

export interface ResumoFeedbackTour {
  total: number
  positivos: number
  neutros: number
  negativos: number
  por_valor: FeedbackPorValorItem[]
}

// Mesmos 3 valores/labels/emojis de TOUR_FEEDBACK_INFO em widget.js — mantidos
// em sincronia manualmente (não há módulo compartilhado entre widget e
// server). label/emoji vêm daqui, nunca do contexto bruto salvo no evento:
// o valor em si (feedback_valor) já valida contra essa lista fixa, então o
// rótulo exibido é sempre um destes 3, nunca texto arbitrário do evento.
const FEEDBACK_TOUR_INFO: Record<string, { label: string; emoji: string; categoria: CategoriaFeedbackTour }> = {
  muito_util: { label: 'Muito útil', emoji: '🤩', categoria: 'positivo' },
  ajudou: { label: 'Ajudou', emoji: '🙂', categoria: 'neutro' },
  nao_ajudou: { label: 'Não ajudou', emoji: '😕', categoria: 'negativo' },
}

// Agrega eventos feedback_tour (só o contexto de cada um) por feedback_valor
// — função pura, sem Prisma/HTTP. Só lê contexto.feedback_valor (nunca outro
// campo do contexto), e só conta: nunca devolve o contexto bruto nem qualquer
// dado de usuário/cliente/unidade que possa estar no mesmo evento.
export function montarResumoFeedback(eventos: Array<{ contexto: unknown }>): ResumoFeedbackTour {
  const contagem: Record<string, number> = {}
  for (const ev of eventos) {
    const contexto = (ev.contexto && typeof ev.contexto === 'object' && !Array.isArray(ev.contexto))
      ? ev.contexto as Record<string, unknown>
      : null
    const valor = contexto?.feedback_valor
    if (typeof valor !== 'string' || !FEEDBACK_TOUR_INFO[valor]) continue
    contagem[valor] = (contagem[valor] ?? 0) + 1
  }

  const por_valor: FeedbackPorValorItem[] = Object.keys(FEEDBACK_TOUR_INFO)
    .filter(valor => contagem[valor] > 0)
    .map(valor => ({ valor, total: contagem[valor], ...FEEDBACK_TOUR_INFO[valor] }))

  let positivos = 0
  let neutros = 0
  let negativos = 0
  for (const item of por_valor) {
    if (item.categoria === 'positivo') positivos += item.total
    else if (item.categoria === 'neutro') neutros += item.total
    else negativos += item.total
  }

  return { total: positivos + neutros + negativos, positivos, neutros, negativos, por_valor }
}

export async function buscarDashboard(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tour = await prisma.tourGuiado.findFirst({
      where: { id, tenant_id: req.adminUser!.tenant_id },
      include: { passos: { orderBy: { ordem: 'asc' } } },
    })
    if (!tour) return res.status(404).json({ erro: 'Tour guiado não encontrado.' })

    const {
      data_inicio, data_fim, tipo_evento, passo_id, passo_ordem, cliente, usuario, unidade, busca, page, per_page,
    } = req.query as Record<string, string | undefined>

    // Filtros comuns aos 4 cards E à lista de eventos: período, passo,
    // cliente, usuário, unidade. tipo_evento é aplicado só na lista de
    // eventos — os cards já são, cada um, uma contagem por tipo específico
    // (filtrar eles também por tipo_evento zeraria os outros 3 sem ganho).
    // Sem nenhum filtro informado, whereComum fica igual a { tour_id: id },
    // preservando o comportamento atual.
    const whereComum: Prisma.EventoTourWhereInput = { tour_id: id }

    if (data_inicio?.trim() || data_fim?.trim()) {
      const criadoEm: Prisma.DateTimeFilter = {}
      if (data_inicio?.trim()) {
        const inicio = new Date(data_inicio)
        if (!isNaN(inicio.getTime())) criadoEm.gte = inicio
      }
      if (data_fim?.trim()) {
        const fim = new Date(data_fim)
        if (!isNaN(fim.getTime())) {
          fim.setHours(23, 59, 59, 999) // inclui o dia inteiro informado em data_fim
          criadoEm.lte = fim
        }
      }
      if (Object.keys(criadoEm).length > 0) whereComum.criado_em = criadoEm
    }

    // passo_ordem tem prioridade — é o campo que o evento realmente grava.
    // passo_id (id de TourPasso) é aceito como alias mais amigável pro
    // frontend e é traduzido pra ordem via os passos já carregados do tour.
    let passoOrdemFiltro: number | null = null
    if (passo_ordem?.trim()) {
      const n = Number(passo_ordem)
      if (!isNaN(n)) passoOrdemFiltro = n
    } else if (passo_id?.trim()) {
      const passo = tour.passos.find(p => p.id === passo_id)
      if (passo) passoOrdemFiltro = passo.ordem
    }
    if (passoOrdemFiltro != null) whereComum.passo_ordem = passoOrdemFiltro

    // cliente/usuario/unidade não são colunas próprias — vivem dentro do JSON
    // "contexto" (mesmo enviado por UserPulse.updateContext/contextProvider),
    // com usuario_id também replicado como coluna própria. Cada filtro vira
    // um grupo OR (id exato OU nome/e-mail contendo o termo), combinados
    // com AND entre si.
    // "mode: insensitive" não é suportado pelo filtro de caminho JSON desta
    // versão do Prisma (só em colunas de texto normais, como usuario_id) —
    // a busca por nome/e-mail dentro de contexto (JSON) fica case-sensitive.
    const andExtra: Prisma.EventoTourWhereInput[] = []

    if (cliente?.trim()) {
      const termo = cliente.trim()
      andExtra.push({
        OR: [
          { contexto: { path: ['cliente_id'], equals: termo } },
          { contexto: { path: ['cliente_nome'], string_contains: termo } },
        ],
      })
    }

    if (usuario?.trim()) {
      const termo = usuario.trim()
      andExtra.push({
        OR: [
          { usuario_id: { contains: termo, mode: 'insensitive' } },
          { contexto: { path: ['usuario_nome'], string_contains: termo } },
          { contexto: { path: ['usuario_email'], string_contains: termo } },
        ],
      })
    }

    if (unidade?.trim()) {
      const termo = unidade.trim()
      andExtra.push({
        OR: [
          { contexto: { path: ['unidade_id'], equals: termo } },
          { contexto: { path: ['unidade_nome'], string_contains: termo } },
          { contexto: { path: ['clinica_id'], equals: termo } },
          { contexto: { path: ['clinica_nome'], string_contains: termo } },
        ],
      })
    }

    if (andExtra.length > 0) whereComum.AND = andExtra

    const whereEventos: Prisma.EventoTourWhereInput = { ...whereComum }
    if (tipo_evento?.trim() && tipo_evento !== 'todos' && TIPOS_EVENTO_TOUR.includes(tipo_evento)) {
      whereEventos.tipo_evento = tipo_evento
    }

    // Busca geral — só afeta a lista de eventos (mesmo critério de
    // tipo_evento acima), nunca os cards. Casa usuário/cliente/unidade (id ou
    // nome/e-mail), tipo de evento (valor ou rótulo em pt-BR) e título do
    // passo — tudo sem diferenciar maiúsculas/acentos.
    if (busca?.trim()) {
      const termo = busca.trim()
      // A classe do regex abaixo contém os caracteres literais U+0300–U+036F
      // (marcas diacríticas combinantes) — aparecem "vazios" no editor, mas
      // são exatamente os acentos que sobram depois de normalize('NFD').
      const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      const termoNormalizado = normalizar(termo)

      const LABELS_TIPO_EVENTO: Record<string, string> = {
        inicio: 'inicio',
        passo_visualizado: 'passo visualizado',
        elemento_nao_encontrado: 'elemento nao encontrado',
        pulado: 'pulado',
        concluido: 'concluido',
        feedback_tour: 'feedback tour',
      }
      const tiposCorrespondentes = TIPOS_EVENTO_TOUR.filter(t =>
        normalizar(t).includes(termoNormalizado) || normalizar(LABELS_TIPO_EVENTO[t]).includes(termoNormalizado)
      )
      const passosCorrespondentes = tour.passos
        .filter(p => normalizar(p.titulo).includes(termoNormalizado))
        .map(p => p.ordem)

      const orBusca: Prisma.EventoTourWhereInput[] = [
        { usuario_id: { contains: termo, mode: 'insensitive' } },
        { contexto: { path: ['usuario_nome'], string_contains: termo } },
        { contexto: { path: ['usuario_email'], string_contains: termo } },
        { contexto: { path: ['cliente_id'], string_contains: termo } },
        { contexto: { path: ['cliente_nome'], string_contains: termo } },
        { contexto: { path: ['unidade_id'], string_contains: termo } },
        { contexto: { path: ['unidade_nome'], string_contains: termo } },
        { contexto: { path: ['clinica_id'], string_contains: termo } },
        { contexto: { path: ['clinica_nome'], string_contains: termo } },
      ]
      if (tiposCorrespondentes.length > 0) orBusca.push({ tipo_evento: { in: tiposCorrespondentes } })
      if (passosCorrespondentes.length > 0) orBusca.push({ passo_ordem: { in: passosCorrespondentes } })

      whereEventos.AND = [...(Array.isArray(whereEventos.AND) ? whereEventos.AND : whereEventos.AND ? [whereEventos.AND] : []), { OR: orBusca }]
    }

    const PER_PAGE_PADRAO = 10
    const pageNum = Math.max(1, Math.trunc(Number(page)) || 1)
    const perPageNum = Math.min(100, Math.max(1, Math.trunc(Number(per_page)) || PER_PAGE_PADRAO))

    const [
      iniciados, concluidos, pulados, elementos_nao_encontrados, totalEventos, eventosRecentes,
      visualizacoesGroup, naoEncontradoGroup, feedbackEventos,
    ] = await Promise.all([
      prisma.eventoTour.count({ where: { ...whereComum, tipo_evento: 'inicio' } }),
      prisma.eventoTour.count({ where: { ...whereComum, tipo_evento: 'concluido' } }),
      prisma.eventoTour.count({ where: { ...whereComum, tipo_evento: 'pulado' } }),
      prisma.eventoTour.count({ where: { ...whereComum, tipo_evento: 'elemento_nao_encontrado' } }),
      // Total de eventos que casam com os filtros (incl. tipo_evento/busca),
      // sem paginação — usado pro contador do card e pro cálculo de páginas.
      // Os cards de métricas acima continuam considerando TODOS os dados
      // filtrados (nunca a página atual).
      prisma.eventoTour.count({ where: whereEventos }),
      prisma.eventoTour.findMany({
        where: whereEventos,
        orderBy: { criado_em: 'desc' },
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
      }),
      // Funil por passo — sempre sobre whereComum (mesmos filtros de
      // período/cliente/usuário/unidade dos cards, nunca a paginação/busca de
      // whereEventos), como qualquer contagem agregada desta rota.
      prisma.eventoTour.groupBy({
        by: ['passo_ordem'],
        where: { ...whereComum, tipo_evento: 'passo_visualizado' },
        _count: { _all: true },
      }),
      prisma.eventoTour.groupBy({
        by: ['passo_ordem'],
        where: { ...whereComum, tipo_evento: 'elemento_nao_encontrado' },
        _count: { _all: true },
      }),
      // Só o contexto (onde mora feedback_valor) — nunca usuario_id/demais
      // colunas do evento; montarResumoFeedback já ignora qualquer campo do
      // contexto além de feedback_valor.
      prisma.eventoTour.findMany({
        where: { ...whereComum, tipo_evento: 'feedback_tour' },
        select: { contexto: true },
      }),
    ])

    const visualizacoesPorPasso: Record<number, number> = {}
    for (const g of visualizacoesGroup) if (g.passo_ordem != null) visualizacoesPorPasso[g.passo_ordem] = g._count._all
    const naoEncontradoPorPasso: Record<number, number> = {}
    for (const g of naoEncontradoGroup) if (g.passo_ordem != null) naoEncontradoPorPasso[g.passo_ordem] = g._count._all

    const funil_por_passo = montarFunilPorPasso(tour.passos, visualizacoesPorPasso, naoEncontradoPorPasso, concluidos)
    const feedback = montarResumoFeedback(feedbackEventos)

    const total_pages = Math.max(1, Math.ceil(totalEventos / perPageNum))

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
      funil_por_passo,
      feedback,
      eventos_recentes,
      page: pageNum,
      per_page: perPageNum,
      total: totalEventos,
      total_pages,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar dashboard do tour guiado.' })
  }
}
