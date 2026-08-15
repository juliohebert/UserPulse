import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { checarLimiteCampanhasAtivas, deveChecarLimiteCadastro, motivoBloqueioAtivacao, motivoBloqueioEscrita, planoEfetivoParaLimite } from '../lib/tenantGuards'

// ─── Respostas helpers ────────────────────────────────────────────────────────

interface RespostaRow {
  id: string
  tipo: 'feedback' | 'confirmacao'
  data_hora: Date
  usuario_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  cliente_id: string | null
  cliente_nome: string | null
  unidade_id: string | null
  unidade_nome: string | null
  perfil: string | null
  usuario_tipo: string | null
  estado: string | null
  nota: number | null
  comentario: string | null
  telefone: string | null
  confirmacao_leitura: boolean
}

function ctxStr(ctx: unknown, key: string): string | null {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return null
  const v = (ctx as Record<string, unknown>)[key]
  if (v == null || v === '') return null
  return String(v)
}

function csvEscape(val: unknown): string {
  let s: string
  if (val == null) s = ''
  else if (val instanceof Date) {
    s = val.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } else {
    s = String(val)
  }
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

type RespostaFiltros = {
  data_inicio: string
  data_fim: string
  cliente_id: string
  cliente_nome: string
  unidade_id: string
  unidade_nome: string
  perfil: string
  usuario_tipo: string
  estado: string
  nota: string
  nps: string
  tem_telefone: string
  busca: string
}

function parseRespostaFiltros(q: Record<string, unknown>): RespostaFiltros {
  const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).trim() : '')
  return {
    data_inicio: s('data_inicio'),
    data_fim: s('data_fim'),
    cliente_id: s('cliente_id'),
    cliente_nome: s('cliente_nome'),
    unidade_id: s('unidade_id'),
    unidade_nome: s('unidade_nome'),
    perfil: s('perfil'),
    usuario_tipo: s('usuario_tipo'),
    estado: s('estado'),
    nota: s('nota'),
    nps: s('nps'),
    tem_telefone: s('tem_telefone'),
    busca: s('busca'),
  }
}

async function buscarRespostasRows(campanhaId: string, f: RespostaFiltros): Promise<RespostaRow[]> {
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (f.data_inicio) dateFilter.gte = new Date(f.data_inicio)
  if (f.data_fim) {
    const fim = new Date(f.data_fim)
    fim.setHours(23, 59, 59, 999)
    dateFilter.lte = fim
  }
  const hasDates = Object.keys(dateFilter).length > 0

  const [feedbacks, confirmacoes] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        campanha_id: campanhaId,
        ...(hasDates ? { criado_em: dateFilter } : {}),
        ...(f.nota !== '' && !isNaN(Number(f.nota)) ? { nota: Number(f.nota) } : {}),
      },
      orderBy: { criado_em: 'desc' },
    }),
    prisma.confirmacaoLeitura.findMany({
      where: {
        campanha_id: campanhaId,
        ...(hasDates ? { criado_em: dateFilter } : {}),
      },
      orderBy: { criado_em: 'desc' },
    }),
  ])

  const confirmacaoSet = new Set(confirmacoes.map(c => c.usuario_id).filter((v): v is string => !!v))
  const feedbackUsuarioIds = new Set(feedbacks.map(fb => fb.usuario_id).filter((v): v is string => !!v))

  const rows: RespostaRow[] = []

  for (const fb of feedbacks) {
    const ctx = fb.contexto
    const cli_id = ctxStr(ctx, 'cliente_id')
    const cli_nome = ctxStr(ctx, 'cliente_nome')
    const uni_id = ctxStr(ctx, 'unidade_id')
    const uni_nome = ctxStr(ctx, 'unidade_nome')
    const prf = ctxStr(ctx, 'Perfil')
    const usr_tipo = ctxStr(ctx, 'usuario_tipo')
    const est = ctxStr(ctx, 'Estado')

    if (f.cliente_id && cli_id !== f.cliente_id) continue
    if (f.cliente_nome && (cli_nome ?? '') !== f.cliente_nome) continue
    if (f.unidade_id && uni_id !== f.unidade_id) continue
    if (f.unidade_nome) {
      const uni_or_clinica = uni_nome ?? ctxStr(ctx, 'clinica_nome')
      if ((uni_or_clinica ?? '') !== f.unidade_nome) continue
    }
    if (f.perfil && prf !== f.perfil) continue
    if (f.usuario_tipo && usr_tipo !== f.usuario_tipo) continue
    if (f.estado && est !== f.estado) continue
    if (f.nps) {
      if (f.nps === 'Promotor' && fb.nota < 9) continue
      if (f.nps === 'Neutro' && (fb.nota < 7 || fb.nota > 8)) continue
      if (f.nps === 'Detrator' && fb.nota > 6) continue
    }
    if (f.tem_telefone === 'sim' && !fb.telefone_contato?.trim()) continue
    if (f.tem_telefone === 'nao' && !!fb.telefone_contato?.trim()) continue
    if (f.busca) {
      const q = f.busca.toLowerCase()
      const hay = [
        fb.usuario_nome, fb.usuario_email,
        ctxStr(ctx, 'usuario_nome'), ctxStr(ctx, 'usuario_email'),
        fb.observacao, fb.telefone_contato,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) continue
    }

    rows.push({
      id: fb.id,
      tipo: 'feedback',
      data_hora: fb.criado_em,
      usuario_id: fb.usuario_id,
      usuario_nome: fb.usuario_nome,
      usuario_email: fb.usuario_email,
      cliente_id: cli_id,
      cliente_nome: cli_nome,
      unidade_id: uni_id,
      unidade_nome: uni_nome,
      perfil: prf,
      usuario_tipo: usr_tipo,
      estado: est,
      nota: fb.nota,
      comentario: fb.observacao,
      telefone: fb.telefone_contato,
      confirmacao_leitura: fb.usuario_id ? confirmacaoSet.has(fb.usuario_id) : false,
    })
  }

  // Confirmacoes-only (users who confirmed but left no feedback) — skipped when nota filter active
  if (!f.nota) {
    for (const c of confirmacoes) {
      if (c.usuario_id && feedbackUsuarioIds.has(c.usuario_id)) continue

      const ctx = c.contexto
      const cli_id = ctxStr(ctx, 'cliente_id')
      const cli_nome = ctxStr(ctx, 'cliente_nome')
      const uni_id = ctxStr(ctx, 'unidade_id')
      const uni_nome = ctxStr(ctx, 'unidade_nome')
      const prf = ctxStr(ctx, 'Perfil')
      const usr_tipo = ctxStr(ctx, 'usuario_tipo')
      const est = ctxStr(ctx, 'Estado')

      if (f.cliente_id && cli_id !== f.cliente_id) continue
      if (f.cliente_nome && (cli_nome ?? '') !== f.cliente_nome) continue
      if (f.unidade_id && uni_id !== f.unidade_id) continue
      if (f.unidade_nome) {
        const uni_or_clinica = uni_nome ?? ctxStr(ctx, 'clinica_nome')
        if ((uni_or_clinica ?? '') !== f.unidade_nome) continue
      }
      if (f.perfil && prf !== f.perfil) continue
      if (f.usuario_tipo && usr_tipo !== f.usuario_tipo) continue
      if (f.estado && est !== f.estado) continue
      if (f.nps) continue           // confirmações não têm nota
      if (f.tem_telefone === 'sim') continue  // confirmações não têm telefone
      if (f.busca) {
        const q = f.busca.toLowerCase()
        const hay = [
          c.usuario_nome, c.usuario_email,
          ctxStr(ctx, 'usuario_nome'), ctxStr(ctx, 'usuario_email'),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) continue
      }

      rows.push({
        id: c.id,
        tipo: 'confirmacao',
        data_hora: c.criado_em,
        usuario_id: c.usuario_id,
        usuario_nome: c.usuario_nome,
        usuario_email: c.usuario_email,
        cliente_id: cli_id,
        cliente_nome: cli_nome,
        unidade_id: uni_id,
        unidade_nome: uni_nome,
        perfil: prf,
        usuario_tipo: usr_tipo,
        estado: est,
        nota: null,
        comentario: null,
        telefone: null,
        confirmacao_leitura: true,
      })
    }
  }

  rows.sort((a, b) => b.data_hora.getTime() - a.data_hora.getTime())
  return rows
}

export async function exportarRespostasCSV(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const campanha = await prisma.campanha.findFirst({
      where: { id, tenant_id: req.adminUser!.tenant_id },
      select: { id: true, titulo: true },
    })
    if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const filtros = parseRespostaFiltros(req.query as Record<string, unknown>)
    const respostas = await buscarRespostasRows(id, filtros)

    const COLS = [
      'Campanha', 'Data/Hora', 'Usuário ID', 'Usuário', 'E-mail',
      'Cliente ID', 'Cliente', 'Unidade ID', 'Unidade',
      'Perfil', 'Tipo de usuário', 'Estado',
      'Nota', 'Comentário', 'Telefone', 'Confirmação de leitura',
    ]
    const header = COLS.map(csvEscape).join(';')

    const linhas = respostas.map(r => [
      campanha.titulo,
      r.data_hora,
      r.usuario_id,
      r.usuario_nome,
      r.usuario_email,
      r.cliente_id,
      r.cliente_nome,
      r.unidade_id,
      r.unidade_nome,
      r.perfil,
      r.usuario_tipo,
      r.estado,
      r.nota,
      r.comentario,
      r.telefone,
      r.confirmacao_leitura ? 'Sim' : 'Não',
    ].map(csvEscape).join(';'))

    const csv = '﻿' + [header, ...linhas].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="respostas-${id}.csv"`)
    res.send(csv)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao exportar CSV.' })
  }
}

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

// destaque_elemento: `descricao` (nível Campanha) é só o espelho do 1º item
// (ver DestaqueItemInput) — cada item já valida seu PRÓPRIO título via
// validarDestaques, mas a descrição por item é opcional (o próprio widget
// tolera: destaqueElementoConteudo só renderiza o parágrafo se
// item.descricao existir). Se o item 1 tiver descrição vazia, o espelho não
// pode disparar "campo obrigatório" — por isso `descricao` sai da lista pra
// este formato, sem afetar titulo/tipo/sistema/data_cy nem os outros formatos.
function getCamposObrigatorios(modo: string, formatoExibicao?: string): string[] {
  const base = formatoExibicao === FORMATO_DESTAQUE_ELEMENTO
    ? CAMPOS_BASE.filter(c => c !== 'descricao')
    : [...CAMPOS_BASE]
  if (modo === 'data_cy') return [...base, 'data_cy']
  if (modo === 'url_contem') return [...base, 'url_contem']
  return [...base, 'tela']
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

const POLITICAS_VALIDAS = ['uma_vez_apos_visualizacao', 'ate_responder_ou_confirmar', 'reexibir_apos_dias'] as const
type PoliticaReexibicao = typeof POLITICAS_VALIDAS[number]

function validarPoliticaReexibicao(
  politica: string,
  reexibirDias: number | null | undefined,
  permitirFechar: boolean
): string | null {
  if (!POLITICAS_VALIDAS.includes(politica as PoliticaReexibicao)) {
    return `Política de reexibição inválida. Use: ${POLITICAS_VALIDAS.join(', ')}.`
  }
  if (politica === 'reexibir_apos_dias' && (!reexibirDias || Number(reexibirDias) <= 0)) {
    return 'Informe quantos dias antes de reexibir (campo "Reexibir após X dias").'
  }
  if (!permitirFechar && politica === 'uma_vez_apos_visualizacao') {
    return 'Campanhas obrigatórias (que não permitem fechar) não podem usar a política "Uma vez após visualização".'
  }
  return null
}

// ─── Formato "Destaque em elemento" (Fase 1 de adoção) ─────────────────────
// Reaproveita tipo/modo_exibicao/modo_identificacao/data_cy já existentes —
// nenhuma coluna nova. `subtitulo` passa a carregar o texto do badge (mesma
// natureza de conteúdo — um rótulo curto e destacado — já usada como
// "eyebrow" no modal) quando modo_exibicao === FORMATO_DESTAQUE_ELEMENTO.
export const FORMATO_DESTAQUE_ELEMENTO = 'destaque_elemento'

// data-cy nunca vira seletor CSS arbitrário: só aceita o charset típico de
// identificadores técnicos (letras, números, -, _, :, .), começando por
// letra/número/underscore — bloqueia aspas, colchetes e espaços que
// poderiam escapar do atributo `[data-cy="..."]` montado no widget.
const DATA_CY_REGEX = /^[A-Za-z0-9_][A-Za-z0-9_\-:.]{0,199}$/

export function normalizarDataCy(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function dataCyValido(valor: string): boolean {
  return DATA_CY_REGEX.test(valor)
}

// modoExibicao já deve vir resolvido (default 'modal_automatica' aplicado)
// e dataCyNormalizado já deve vir de normalizarDataCy — mantém a função pura
// e sem repetir a resolução de default em cada chamada.
export function validarFormatoDestaqueElemento(modoExibicao: string, dataCyNormalizado: string): string | null {
  if (modoExibicao !== FORMATO_DESTAQUE_ELEMENTO) return null
  if (!dataCyValido(dataCyNormalizado)) {
    return 'Para o formato "Destaque em elemento", informe um data-cy válido do elemento alvo (letras, números, "-", "_", ":" ou ".").'
  }
  return null
}

// Formato "destaque_elemento" sempre localiza o elemento por data-cy — força
// isso no servidor (nunca confia no modo_identificacao vindo do cliente),
// mesma lógica que o front já aplica ao selecionar o formato.
export function resolverModoIdentificacao(modoExibicao: string, modoIdentificacaoBruto: string): string {
  if (modoExibicao === FORMATO_DESTAQUE_ELEMENTO) return 'data_cy'
  return modoIdentificacaoBruto || 'sistema_tela'
}

// ─── Múltiplos destaques por campanha (Fase 2 de adoção) ───────────────────
// 1 campanha destaque_elemento passa a ter N CampanhaDestaqueItem
// independentes (ex.: filtro-status, filtro-profissional, filtro-convenio),
// cada um com seu próprio data-cy/badge/título/descrição/CTA. Os campos
// legados na própria Campanha (titulo/descricao/subtitulo/data_cy/
// texto_botao/url_botao) continuam existindo — nunca removidos — mas viram
// um ESPELHO somente-leitura do primeiro item (ordem 1), atualizado sempre
// que `destaques` é reenviado: serve de fallback pra qualquer leitura antiga
// que ainda não faz join em `destaques` (dashboards, exports) e satisfaz as
// colunas NOT NULL de Campanha sem pedir o mesmo dado duas vezes no form.
export interface DestaqueItemInput {
  id?: unknown
  data_cy?: unknown
  texto_badge?: unknown
  titulo?: unknown
  descricao?: unknown
  texto_botao?: unknown
  url_botao?: unknown
  ativo?: unknown
}

// Mesmo padrão de validarPassos (tours.ts): valida a lista inteira antes de
// tocar no banco, devolve o primeiro erro encontrado (com o índice 1-based
// pra aparecer certo na UI) e a lista tipada pra quem já validou não precisar
// re-checar. `ordem` nunca vem do cliente — é sempre a posição no array (ver
// criar/atualizar), então reordenar é só reenviar a lista na nova ordem. `id`
// (quando presente) só passa por checagem de formato aqui — pertencer à
// campanha/tenant certos é responsabilidade de validarOwnershipDestaques,
// que precisa da lista de ids já existentes (indisponível nesta função pura).
export function validarDestaques(destaques: unknown): { erro: string | null; lista: DestaqueItemInput[] } {
  if (!Array.isArray(destaques) || destaques.length === 0) {
    return { erro: 'Para o formato "Destaque em elemento", adicione ao menos 1 destaque.', lista: [] }
  }
  for (const [i, itemBruto] of destaques.entries()) {
    if (!itemBruto || typeof itemBruto !== 'object' || Array.isArray(itemBruto)) {
      return { erro: `Destaque ${i + 1}: dados inválidos.`, lista: [] }
    }
    const item = itemBruto as DestaqueItemInput
    if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) {
      return { erro: `Destaque ${i + 1}: id inválido.`, lista: [] }
    }
    if (!dataCyValido(normalizarDataCy(item.data_cy))) {
      return { erro: `Destaque ${i + 1}: informe um data-cy válido do elemento alvo (letras, números, "-", "_", ":" ou ".").`, lista: [] }
    }
    if (typeof item.titulo !== 'string' || !item.titulo.trim()) {
      return { erro: `Destaque ${i + 1}: título é obrigatório.`, lista: [] }
    }
  }
  return { erro: null, lista: destaques as DestaqueItemInput[] }
}

// Único ponto que decide se um `id` enviado pelo cliente pode ser usado pra
// UPDATE. `idsExistentes` sempre vem de uma consulta já escopada por
// tenant_id + campanha_id (ver `existente.destaques` em atualizar()) — então
// qualquer id fora desse conjunto pertence a outra campanha ou outro tenant e
// é rejeitado aqui, antes de qualquer escrita. Em criar() chama-se com
// idsExistentes=[] (campanha nova não tem itens prévios), o que rejeita
// automaticamente qualquer id "emprestado" enviado num payload de criação.
export function validarOwnershipDestaques(idsExistentes: string[], lista: DestaqueItemInput[]): string | null {
  const validos = new Set(idsExistentes)
  for (const [i, item] of lista.entries()) {
    if (typeof item.id === 'string' && item.id && !validos.has(item.id)) {
      return `Destaque ${i + 1}: item não pertence a esta campanha.`
    }
  }
  return null
}

// Sincronização por identidade (substitui o antigo delete+recreate total):
// item com `id` reconhecido -> UPDATE (preserva o id, só troca os campos e a
// ordem); item sem `id` -> CREATE; id que existia antes mas não veio mais na
// lista -> INATIVAÇÃO (ativo:false, nunca DELETE — preserva o histórico de
// eventos que apontam pra esse id). `ordem` é sempre a posição do item na
// lista recebida (1-based), então reordenar é só reenviar a lista na nova
// ordem mantendo os ids — nenhuma linha reordenada troca de id. Função pura:
// só decide o QUE fazer, quem chama é responsável por já ter validado
// ownership antes.
export interface SincronizacaoDestaques {
  paraCriar: Array<{ ordem: number; item: DestaqueItemInput }>
  paraAtualizar: Array<{ id: string; ordem: number; item: DestaqueItemInput }>
  idsParaRemover: string[]
}

export function sincronizarDestaques(idsExistentes: string[], novaLista: DestaqueItemInput[]): SincronizacaoDestaques {
  const idsMantidos = new Set<string>()
  const paraCriar: SincronizacaoDestaques['paraCriar'] = []
  const paraAtualizar: SincronizacaoDestaques['paraAtualizar'] = []
  novaLista.forEach((item, i) => {
    const ordem = i + 1
    const id = typeof item.id === 'string' && item.id ? item.id : null
    if (id) {
      idsMantidos.add(id)
      paraAtualizar.push({ id, ordem, item })
    } else {
      paraCriar.push({ ordem, item })
    }
  })
  const idsParaRemover = idsExistentes.filter(id => !idsMantidos.has(id))
  return { paraCriar, paraAtualizar, idsParaRemover }
}

function camposEditaveisDestaqueItem(item: DestaqueItemInput, ordem: number) {
  return {
    ordem,
    data_cy: normalizarDataCy(item.data_cy),
    texto_badge: typeof item.texto_badge === 'string' && item.texto_badge.trim() ? item.texto_badge.trim() : null,
    titulo: String(item.titulo).trim(),
    descricao: typeof item.descricao === 'string' ? item.descricao.trim() : '',
    texto_botao: typeof item.texto_botao === 'string' && item.texto_botao.trim() ? item.texto_botao.trim() : null,
    url_botao: typeof item.url_botao === 'string' && item.url_botao.trim() ? item.url_botao.trim() : null,
    ativo: item.ativo !== undefined ? Boolean(item.ativo) : true,
  }
}

// Prisma.campanhaDestaqueItem.create() nunca aceita tenant_id/campanha_id
// vindos do cliente — quem chama sempre passa o tenantId já validado
// (req.adminUser) e o campanha_id vem da própria relação aninhada
// (destaques: { create: [...] } dentro do create/update da Campanha), nunca
// de um id solto no corpo da requisição. É isso que torna impossível um item
// de outro tenant/campanha entrar aqui — não é uma checagem extra, é a
// própria forma da escrita.
export function paraCriacaoDestaqueItem(item: DestaqueItemInput, tenantId: string, ordem: number) {
  return { tenant_id: tenantId, ...camposEditaveisDestaqueItem(item, ordem) }
}

// Mesmos campos de paraCriacaoDestaqueItem, sem tenant_id (nunca muda num
// UPDATE) e sem id (o id vai no `where`, nunca no `data`, pra nunca ser
// possível uma escrita trocar o id de uma linha existente).
export function paraAtualizacaoDestaqueItem(item: DestaqueItemInput, ordem: number) {
  return camposEditaveisDestaqueItem(item, ordem)
}

function parseArray(v: unknown): string[] {
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(s => s.trim())
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

async function slugUnico(tenantId: string, base: string, ignorarId?: string): Promise<string> {
  let slug = base
  let contador = 1

  while (true) {
    const existente = await prisma.campanha.findFirst({
      where: { tenant_id: tenantId, slug, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
    })
    if (!existente) return slug
    slug = `${base}-${contador++}`
  }
}

export async function listar(req: Request, res: Response) {
  try {
    const campanhas = await prisma.campanha.findMany({
      where: { tenant_id: req.adminUser!.tenant_id },
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
    const campanha = await prisma.campanha.findFirst({
      where: { id: req.params.id as string, tenant_id: req.adminUser!.tenant_id },
      // destaques inativos (removidos da configuração, ver atualizar() —
      // viram ativo:false em vez de apagados, pra preservar o histórico de
      // eventos) nunca voltam a aparecer no formulário de edição — do ponto
      // de vista do admin, "remover e salvar" continua parecendo uma
      // remoção de verdade.
      include: { _count: { select: { feedbacks: true } }, destaques: { where: { ativo: true }, orderBy: { ordem: 'asc' } } },
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
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const modoExibicaoResolvido = String(req.body.modo_exibicao || 'modal_automatica').trim() || 'modal_automatica'

    let listaDestaques: DestaqueItemInput[] = []
    if (modoExibicaoResolvido === FORMATO_DESTAQUE_ELEMENTO) {
      const { erro: erroDestaques, lista } = validarDestaques(req.body.destaques)
      if (erroDestaques) return res.status(400).json({ erro: erroDestaques })
      // Campanha nova não tem itens prévios (idsExistentes=[]) — qualquer id
      // "emprestado" enviado num payload de criação é rejeitado aqui.
      const erroOwnership = validarOwnershipDestaques([], lista)
      if (erroOwnership) return res.status(400).json({ erro: erroOwnership })
      listaDestaques = lista
      // Campos legados de Campanha espelham o primeiro item — ver comentário
      // acima de DestaqueItemInput.
      const primeiro = listaDestaques[0]
      req.body.titulo = primeiro.titulo
      req.body.descricao = typeof primeiro.descricao === 'string' ? primeiro.descricao : ''
      req.body.subtitulo = typeof primeiro.texto_badge === 'string' ? primeiro.texto_badge : null
      req.body.data_cy = primeiro.data_cy
      req.body.texto_botao = typeof primeiro.texto_botao === 'string' ? primeiro.texto_botao : null
      req.body.url_botao = typeof primeiro.url_botao === 'string' ? primeiro.url_botao : null
    }

    const modo = resolverModoIdentificacao(modoExibicaoResolvido, String(req.body.modo_identificacao || '').trim())
    const faltando = getCamposObrigatorios(modo, modoExibicaoResolvido).filter(c => !req.body[c]?.toString().trim())
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      gatilho, evento, data_cy, url_contem,
      atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, permitir_fechar_modal, intervalo_reexibicao_dias,
      politica_reexibicao, reexibir_apos_dias,
      encerrar_apos_evento, evento_conclusao,
      categoria,
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis, segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    const dataCyNormalizado = normalizarDataCy(data_cy)

    const pfm = permitir_fechar_modal !== undefined ? Boolean(permitir_fechar_modal) : true
    const erroFechamento = validarFechamentoObrigatorio(
      pfm,
      feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : true,
      Boolean(exige_confirmacao_leitura)
    )
    if (erroFechamento) return res.status(400).json({ erro: erroFechamento })

    const politica = (politica_reexibicao?.trim() || 'uma_vez_apos_visualizacao') as string
    const diasReexibir = reexibir_apos_dias != null && reexibir_apos_dias !== '' ? Number(reexibir_apos_dias) : null
    const erroPolitica = validarPoliticaReexibicao(politica, diasReexibir, pfm)
    if (erroPolitica) return res.status(400).json({ erro: erroPolitica })

    const encerrarAposEvento = Boolean(encerrar_apos_evento)
    const eventoConclusao = evento_conclusao?.trim() || null
    if (encerrarAposEvento && !eventoConclusao) {
      return res.status(400).json({ erro: 'Informe o nome do evento de conclusão (evento_conclusao).' })
    }

    const ativoBool = ativo !== undefined ? Boolean(ativo) : true
    if (ativoBool) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
    }
    // Fase 6D — em trial, o limite conta TOTAL cadastrado, então precisa
    // checar mesmo criando com ativo:false (ver deveChecarLimiteCadastro).
    if (deveChecarLimiteCadastro(ativoBool, tenant.plano)) {
      const limite = await checarLimiteCampanhasAtivas(tenantId, planoEfetivoParaLimite(tenant))
      if (limite) return res.status(403).json({ erro: limite })
    }

    const slug = await slugUnico(tenantId, gerarSlugBase(titulo))

    const campanha = await prisma.campanha.create({
      data: {
        tenant_id: tenantId,
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
        modo_exibicao: modoExibicaoResolvido,
        gatilho: gatilho?.trim() || 'ao_abrir_tela',
        evento: evento?.trim() || null,
        modo_identificacao: modo,
        data_cy: dataCyNormalizado || null,
        url_contem: url_contem?.trim() || null,
        atraso_ms: atraso_ms !== undefined ? Number(atraso_ms) : 800,
        mostrar_uma_vez: Boolean(mostrar_uma_vez),
        prioridade: prioridade !== undefined ? Number(prioridade) : 0,
        ordem: ordem !== undefined ? Number(ordem) : 0,
        ativo: ativoBool,
        data_inicio: data_inicio ? new Date(data_inicio) : null,
        data_fim: data_fim ? new Date(data_fim) : null,
        pergunta_feedback: pergunta_feedback?.trim() || null,
        observacao_obrigatoria: Boolean(observacao_obrigatoria),
        exige_confirmacao_leitura: Boolean(exige_confirmacao_leitura),
        permitir_fechar_modal: pfm,
        intervalo_reexibicao_dias: intervalo_reexibicao_dias != null && intervalo_reexibicao_dias !== '' ? Number(intervalo_reexibicao_dias) : null,
        politica_reexibicao: politica,
        reexibir_apos_dias: diasReexibir,
        encerrar_apos_evento: encerrarAposEvento,
        evento_conclusao: eventoConclusao,
        categoria: categoria?.trim() || null,
        segmentar_cliente_ids: parseArray(segmentar_cliente_ids),
        segmentar_unidade_ids: parseArray(segmentar_unidade_ids),
        segmentar_perfis: parseArray(segmentar_perfis),
        segmentar_usuario_tipos: parseArray(segmentar_usuario_tipos),
        segmentar_estados: parseArray(segmentar_estados),
        ...(listaDestaques.length > 0 && {
          destaques: { create: listaDestaques.map((item, i) => paraCriacaoDestaqueItem(item, tenantId, i + 1)) },
        }),
      },
      include: { destaques: { orderBy: { ordem: 'asc' } } },
    })

    res.status(201).json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar campanha.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string

    // Só os destaques ATIVOS entram em idsExistentes/ownership abaixo — um
    // item já removido (ativo:false) não deve ficar sendo "reencontrado
    // como removido" (e regravado ativo:false de novo) a cada save só
    // porque o form nunca o reenvia (buscarPorId também não devolve
    // inativos, então o form nunca teria como reenviá-lo mesmo se quisesse).
    const existente = await prisma.campanha.findFirst({ where: { id, tenant_id: tenantId }, include: { destaques: { where: { ativo: true } } } })
    if (!existente) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    const modoExibicaoAtualizado = req.body.modo_exibicao !== undefined
      ? (String(req.body.modo_exibicao).trim() || 'modal_automatica')
      : existente.modo_exibicao

    // Lista só é não-nula quando `destaques` foi de fato reenviado — nesse
    // caso sincroniza por identidade (ver sincronizarDestaques): update dos
    // itens com id reconhecido, create dos sem id, delete só dos ids que
    // existiam antes e saíram da lista. Add/editar/reordenar nunca troca o id
    // de um item que permanece na lista. Também re-espelha os campos legados
    // a partir do novo primeiro item. Sem `destaques` no corpo (ex.: toggle
    // rápido de `ativo` na listagem), os itens existentes não são tocados —
    // só valida que já existe pelo menos 1 quando o formato é (ou está
    // virando) destaque_elemento.
    let listaDestaques: DestaqueItemInput[] | null = null
    let sincronizacao: SincronizacaoDestaques | null = null
    if (modoExibicaoAtualizado === FORMATO_DESTAQUE_ELEMENTO) {
      if (req.body.destaques !== undefined) {
        const { erro: erroDestaques, lista } = validarDestaques(req.body.destaques)
        if (erroDestaques) return res.status(400).json({ erro: erroDestaques })
        // idsExistentes vem de uma consulta já escopada por tenant_id (linha
        // acima, `existente`) — um id de outra campanha/tenant nunca aparece
        // aqui, então validarOwnershipDestaques rejeita com segurança.
        const idsExistentes = existente.destaques.map(d => d.id)
        const erroOwnership = validarOwnershipDestaques(idsExistentes, lista)
        if (erroOwnership) return res.status(400).json({ erro: erroOwnership })
        listaDestaques = lista
        sincronizacao = sincronizarDestaques(idsExistentes, lista)
        const primeiro = listaDestaques[0]
        req.body.titulo = primeiro.titulo
        req.body.descricao = typeof primeiro.descricao === 'string' ? primeiro.descricao : ''
        req.body.subtitulo = typeof primeiro.texto_badge === 'string' ? primeiro.texto_badge : null
        req.body.data_cy = primeiro.data_cy
        req.body.texto_botao = typeof primeiro.texto_botao === 'string' ? primeiro.texto_botao : null
        req.body.url_botao = typeof primeiro.url_botao === 'string' ? primeiro.url_botao : null
      } else if (existente.destaques.length === 0) {
        return res.status(400).json({ erro: 'Para o formato "Destaque em elemento", adicione ao menos 1 destaque.' })
      }
    }

    const modoAtualizado = resolverModoIdentificacao(modoExibicaoAtualizado, String(req.body.modo_identificacao ?? existente.modo_identificacao ?? '').trim())
    const vazios = getCamposObrigatorios(modoAtualizado, modoExibicaoAtualizado).filter(c => c in req.body && !req.body[c]?.toString().trim())
    if (vazios.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios não podem ficar vazios: ${vazios.join(', ')}.` })
    }

    const {
      titulo, subtitulo, descricao, tipo, sistema, tela,
      imagem_url, video_url, texto_botao, url_botao,
      feedback_habilitado,
      gatilho, evento, data_cy, url_contem,
      atraso_ms, mostrar_uma_vez, prioridade, ordem,
      ativo, data_inicio, data_fim, pergunta_feedback, observacao_obrigatoria,
      exige_confirmacao_leitura, permitir_fechar_modal, intervalo_reexibicao_dias,
      politica_reexibicao, reexibir_apos_dias,
      encerrar_apos_evento, evento_conclusao,
      categoria,
      segmentar_cliente_ids, segmentar_unidade_ids, segmentar_perfis, segmentar_usuario_tipos, segmentar_estados,
    } = req.body

    const dataCyNormalizado = data_cy !== undefined ? normalizarDataCy(data_cy) : normalizarDataCy(existente.data_cy)

    // Merge incoming values with existing to validate even on partial update
    const pfm = permitir_fechar_modal !== undefined ? Boolean(permitir_fechar_modal) : existente.permitir_fechar_modal
    const fh = feedback_habilitado !== undefined ? Boolean(feedback_habilitado) : existente.feedback_habilitado
    const ecl = exige_confirmacao_leitura !== undefined ? Boolean(exige_confirmacao_leitura) : existente.exige_confirmacao_leitura
    const erroFechamento = validarFechamentoObrigatorio(pfm, fh, ecl)
    if (erroFechamento) return res.status(400).json({ erro: erroFechamento })

    const politica = politica_reexibicao !== undefined
      ? (politica_reexibicao?.trim() || 'uma_vez_apos_visualizacao')
      : existente.politica_reexibicao
    const diasReexibir = reexibir_apos_dias !== undefined
      ? (reexibir_apos_dias != null && reexibir_apos_dias !== '' ? Number(reexibir_apos_dias) : null)
      : existente.reexibir_apos_dias
    const erroPolitica = validarPoliticaReexibicao(politica, diasReexibir, pfm)
    if (erroPolitica) return res.status(400).json({ erro: erroPolitica })

    const encerrarAposEvento = encerrar_apos_evento !== undefined
      ? Boolean(encerrar_apos_evento)
      : existente.encerrar_apos_evento
    const eventoConclusao = evento_conclusao !== undefined
      ? (evento_conclusao?.trim() || null)
      : existente.evento_conclusao
    if (encerrarAposEvento && !eventoConclusao) {
      return res.status(400).json({ erro: 'Informe o nome do evento de conclusão (evento_conclusao).' })
    }

    // Só checa bloqueio/limite quando a requisição está de fato LIGANDO a
    // campanha (false -> true) — reeditar uma campanha já ativa não deve
    // falhar por causa de um limite reduzido depois que ela já estava ativa.
    const ativandoAgora = ativo !== undefined && Boolean(ativo) && !existente.ativo
    if (ativandoAgora) {
      const bloqueioAtivacao = motivoBloqueioAtivacao(tenant)
      if (bloqueioAtivacao) return res.status(403).json({ erro: bloqueioAtivacao })
      // excluirId: a própria campanha já existe (só está inativa) — não pode
      // contar contra si mesma na contagem de trial (ver checarLimiteCampanhasAtivas).
      const limite = await checarLimiteCampanhasAtivas(tenantId, planoEfetivoParaLimite(tenant), existente.id)
      if (limite) return res.status(403).json({ erro: limite })
    }

    let slug = existente.slug
    if (titulo && titulo.trim() !== existente.titulo) {
      slug = await slugUnico(tenantId, gerarSlugBase(titulo.trim()), id)
    }

    // Nested write única (Prisma resolve create/update/updateMany da relação
    // dentro da mesma escrita atômica) — sincronização por identidade em vez
    // do antigo delete+recreate total: `update` preserva o id de cada linha
    // existente (só troca ordem/campos), `create` só roda pros itens sem id,
    // `updateMany` marca ativo:false só os ids que saíram da lista (nunca
    // DELETE — preserva a linha e o histórico de EventoCampanha.
    // destaque_item_id que apontar pra ela; buscarCampanha/buscarCandidatas
    // já filtram destaques por ativo:true, então o widget para de mostrar o
    // item imediatamente, igual a antes). Só roda quando `sincronizacao` não
    // é nula — do contrário os itens existentes ficam completamente intocados.
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
        ...(gatilho !== undefined && { gatilho: gatilho?.trim() || 'ao_abrir_tela' }),
        ...(evento !== undefined && { evento: evento?.trim() || null }),
        // modo_exibicao/modo_identificacao/data_cy são interdependentes (ver
        // resolverModoIdentificacao) — recalcula e grava os três juntos
        // sempre que qualquer um deles aparecer no corpo da requisição, pra
        // nunca persistir uma combinação inconsistente (ex.: modo_exibicao
        // destaque_elemento com modo_identificacao antigo sistema_tela).
        ...((req.body.modo_exibicao !== undefined || req.body.modo_identificacao !== undefined || data_cy !== undefined) && {
          modo_exibicao: modoExibicaoAtualizado,
          modo_identificacao: modoAtualizado,
          data_cy: dataCyNormalizado || null,
        }),
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
        ...(politica_reexibicao !== undefined && { politica_reexibicao: politica }),
        ...(reexibir_apos_dias !== undefined && { reexibir_apos_dias: diasReexibir }),
        ...(encerrar_apos_evento !== undefined && { encerrar_apos_evento: encerrarAposEvento }),
        ...(evento_conclusao !== undefined && { evento_conclusao: eventoConclusao }),
        ...(categoria !== undefined && { categoria: categoria?.trim() || null }),
        ...(segmentar_cliente_ids !== undefined && { segmentar_cliente_ids: parseArray(segmentar_cliente_ids) }),
        ...(segmentar_unidade_ids !== undefined && { segmentar_unidade_ids: parseArray(segmentar_unidade_ids) }),
        ...(segmentar_perfis !== undefined && { segmentar_perfis: parseArray(segmentar_perfis) }),
        ...(segmentar_usuario_tipos !== undefined && { segmentar_usuario_tipos: parseArray(segmentar_usuario_tipos) }),
        ...(segmentar_estados !== undefined && { segmentar_estados: parseArray(segmentar_estados) }),
        ...(sincronizacao && {
          destaques: {
            ...(sincronizacao.idsParaRemover.length > 0 && {
              updateMany: { where: { id: { in: sincronizacao.idsParaRemover } }, data: { ativo: false } },
            }),
            ...(sincronizacao.paraAtualizar.length > 0 && {
              update: sincronizacao.paraAtualizar.map(({ id, ordem, item }) => ({
                where: { id },
                data: paraAtualizacaoDestaqueItem(item, ordem),
              })),
            }),
            ...(sincronizacao.paraCriar.length > 0 && {
              create: sincronizacao.paraCriar.map(({ ordem, item }) => paraCriacaoDestaqueItem(item, tenantId, ordem)),
            }),
          },
        }),
      },
      include: { destaques: { orderBy: { ordem: 'asc' } } },
    })

    res.json(campanha)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar campanha.' })
  }
}

export async function remover(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    const existente = await prisma.campanha.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
    if (!existente) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    await prisma.campanha.update({ where: { id }, data: { ativo: false } })
    res.json({ mensagem: 'Campanha inativada com sucesso.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao inativar campanha.' })
  }
}

export async function duplicar(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenant = req.adminUser!.tenant

    const bloqueioEscrita = motivoBloqueioEscrita(tenant)
    if (bloqueioEscrita) return res.status(403).json({ erro: bloqueioEscrita })

    const id = req.params.id as string
    // Só os destaques ATIVOS — a cópia reflete o que está configurado hoje,
    // nunca itens já removidos (ativo:false) que só existem pra preservar
    // histórico de eventos da campanha original.
    const original = await prisma.campanha.findFirst({ where: { id, tenant_id: tenantId }, include: { destaques: { where: { ativo: true }, orderBy: { ordem: 'asc' } } } })
    if (!original) return res.status(404).json({ erro: 'Campanha não encontrada.' })

    // Fase 6D — a cópia nasce sempre inativa (ver `ativo: false` abaixo), mas
    // em trial o limite conta TOTAL cadastrado: sem esta checagem, duplicar
    // seria um jeito de contornar o limite (nunca dispara o bloqueio de
    // "ativação", já que a cópia nunca nasce ativa). Planos pagos continuam
    // podendo duplicar livremente (deveChecarLimiteCadastro(false, plano)).
    if (deveChecarLimiteCadastro(false, tenant.plano)) {
      const limite = await checarLimiteCampanhasAtivas(tenantId, planoEfetivoParaLimite(tenant))
      if (limite) return res.status(403).json({ erro: limite })
    }

    const tituloCopia = `Cópia de ${original.titulo}`
    const slug = await slugUnico(tenantId, gerarSlugBase(tituloCopia))

    // A cópia nasce inativa para não publicar automaticamente e não herda
    // feedbacks, eventos, confirmações nem etapas de jornada da campanha original.
    const copia = await prisma.campanha.create({
      data: {
        tenant_id: tenantId,
        slug,
        titulo: tituloCopia,
        subtitulo: original.subtitulo,
        descricao: original.descricao,
        tipo: original.tipo,
        sistema: original.sistema,
        tela: original.tela,
        imagem_url: original.imagem_url,
        video_url: original.video_url,
        texto_botao: original.texto_botao,
        url_botao: original.url_botao,
        feedback_habilitado: original.feedback_habilitado,
        modo_exibicao: original.modo_exibicao,
        gatilho: original.gatilho,
        evento: original.evento,
        modo_identificacao: original.modo_identificacao,
        data_cy: original.data_cy,
        url_contem: original.url_contem,
        atraso_ms: original.atraso_ms,
        mostrar_uma_vez: original.mostrar_uma_vez,
        prioridade: original.prioridade,
        ordem: original.ordem,
        ativo: false,
        data_inicio: original.data_inicio,
        data_fim: original.data_fim,
        pergunta_feedback: original.pergunta_feedback,
        observacao_obrigatoria: original.observacao_obrigatoria,
        exige_confirmacao_leitura: original.exige_confirmacao_leitura,
        permitir_fechar_modal: original.permitir_fechar_modal,
        intervalo_reexibicao_dias: original.intervalo_reexibicao_dias,
        politica_reexibicao: original.politica_reexibicao,
        reexibir_apos_dias: original.reexibir_apos_dias,
        encerrar_apos_evento: original.encerrar_apos_evento,
        evento_conclusao: original.evento_conclusao,
        categoria: original.categoria,
        segmentar_cliente_ids: original.segmentar_cliente_ids,
        segmentar_unidade_ids: original.segmentar_unidade_ids,
        segmentar_perfis: original.segmentar_perfis,
        segmentar_usuario_tipos: original.segmentar_usuario_tipos,
        segmentar_estados: original.segmentar_estados,
        ...(original.destaques.length > 0 && {
          destaques: {
            create: original.destaques.map(d => ({
              tenant_id: tenantId,
              ordem: d.ordem,
              data_cy: d.data_cy,
              texto_badge: d.texto_badge,
              titulo: d.titulo,
              descricao: d.descricao,
              texto_botao: d.texto_botao,
              url_botao: d.url_botao,
              ativo: d.ativo,
            })),
          },
        }),
      },
      include: { _count: { select: { feedbacks: true } }, destaques: { orderBy: { ordem: 'asc' } } },
    })

    res.status(201).json(copia)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao duplicar campanha.' })
  }
}

export async function testarElegibilidade(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { sistema, tela, url, usuario_id, evento, cliente_id, unidade_id, perfil, usuario_tipo, estado } = req.body

    const campanha = await prisma.campanha.findFirst({ where: { id, tenant_id: req.adminUser!.tenant_id } })
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

    // 7. Política de reexibição / histórico do usuário
    const uid = usuario_id ? String(usuario_id).trim() : ''
    const alwaysShow = uid ? isAlwaysShowUser(uid) : false
    const policy = campanha.politica_reexibicao || 'uma_vez_apos_visualizacao'

    const labelPolitica = {
      uma_vez_apos_visualizacao: 'Uma vez após visualização',
      ate_responder_ou_confirmar: 'Até responder/confirmar',
      reexibir_apos_dias: `Reexibir após ${campanha.reexibir_apos_dias ?? '?'} dias`,
    }[policy] ?? policy

    if (!uid) {
      ok('Política de reexibição', `Política: ${labelPolitica}. Nenhum usuário informado — verificação de histórico ignorada.`)
    } else if (alwaysShow) {
      ok('Política de reexibição', `Usuário "${uid}" está na lista always-show — bloqueios de histórico ignorados.`)
    } else {
      if (policy === 'uma_vez_apos_visualizacao') {
        const jaViu = await prisma.eventoCampanha.findFirst({
          where: { campanha_id: id, usuario_id: uid, tipo_evento: 'visualizacao' },
        })
        if (jaViu) {
          block('Política de reexibição', `Usuário "${uid}" já visualizou esta campanha.`, `Política: ${labelPolitica}`)
        } else if (campanha.exige_confirmacao_leitura) {
          const jaConf = await prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: id, usuario_id: uid } })
          if (jaConf) {
            block('Política de reexibição', `Usuário "${uid}" já confirmou leitura desta campanha.`, `Política: ${labelPolitica}`)
          } else {
            ok('Política de reexibição', `Usuário "${uid}" ainda não visualizou nem confirmou. Política: ${labelPolitica}.`)
          }
        } else {
          const uf = await prisma.feedback.findFirst({ where: { campanha_id: id, usuario_id: uid }, orderBy: { criado_em: 'desc' } })
          if (uf) {
            block('Política de reexibição', `Usuário "${uid}" já respondeu esta campanha.`, `Política: ${labelPolitica}`)
          } else {
            ok('Política de reexibição', `Usuário "${uid}" ainda não visualizou nem respondeu. Política: ${labelPolitica}.`)
          }
        }
      }

      if (policy === 'ate_responder_ou_confirmar') {
        if (campanha.exige_confirmacao_leitura) {
          const jaConf = await prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: id, usuario_id: uid } })
          if (jaConf) {
            block('Política de reexibição', `Usuário "${uid}" já confirmou leitura desta campanha.`, `Política: ${labelPolitica}`)
          } else {
            ok('Política de reexibição', `Usuário "${uid}" ainda não confirmou leitura. A campanha pode reaparecer. Política: ${labelPolitica}.`)
          }
        } else {
          const uf = await prisma.feedback.findFirst({ where: { campanha_id: id, usuario_id: uid }, orderBy: { criado_em: 'desc' } })
          if (uf) {
            block('Política de reexibição', `Usuário "${uid}" já respondeu esta campanha.`, `Política: ${labelPolitica}`)
          } else {
            ok('Política de reexibição', `Usuário "${uid}" ainda não respondeu. A campanha pode reaparecer. Política: ${labelPolitica}.`)
          }
        }
      }

      if (policy === 'reexibir_apos_dias') {
        const dias = campanha.reexibir_apos_dias
        if (!dias || dias <= 0) {
          warn('Política de reexibição', `Política "${labelPolitica}" configurada mas sem número de dias definido.`)
        } else {
          const [ultimaViz, ultimoFb, ultimaConf] = await Promise.all([
            prisma.eventoCampanha.findFirst({ where: { campanha_id: id, usuario_id: uid, tipo_evento: 'visualizacao' }, orderBy: { criado_em: 'desc' } }),
            prisma.feedback.findFirst({ where: { campanha_id: id, usuario_id: uid }, orderBy: { criado_em: 'desc' } }),
            prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: id, usuario_id: uid }, orderBy: { criado_em: 'desc' } }),
          ])
          const datas = [ultimaViz?.criado_em, ultimoFb?.criado_em, ultimaConf?.criado_em].filter((d): d is Date => !!d)
          if (datas.length === 0) {
            ok('Política de reexibição', `Usuário "${uid}" nunca interagiu com esta campanha. Política: ${labelPolitica}.`)
          } else {
            const maisRecente = new Date(Math.max(...datas.map(d => d.getTime())))
            const diasDesde = Math.floor((agora.getTime() - maisRecente.getTime()) / 86400000)
            const reabrir = new Date(maisRecente.getTime() + dias * 86400000)
            if (diasDesde < dias) {
              block(
                'Política de reexibição',
                `Usuário só poderá visualizar novamente após ${fmtDate(reabrir)}.`,
                `Última interação há ${diasDesde} dia(s). Faltam ${dias - diasDesde} dia(s). Política: ${labelPolitica}.`
              )
            } else {
              ok('Política de reexibição', `Última interação há ${diasDesde} dia(s). Intervalo de ${dias} dias já transcorreu. Política: ${labelPolitica}.`)
            }
          }
        }
      }
    }

    // 7.5 Evento de conclusão
    if (campanha.encerrar_apos_evento && campanha.evento_conclusao) {
      if (!uid) {
        ok('Evento de conclusão', `Evento "${campanha.evento_conclusao}" configurado. Nenhum usuário informado — verificação ignorada.`)
      } else {
        const evList = await prisma.eventoUsuario.findMany({
          where: { sistema: campanha.sistema, usuario_id: uid, evento: campanha.evento_conclusao },
          orderBy: { criado_em: 'desc' },
        })
        let conclusaoEm: Date | null = null
        for (const ev of evList) {
          const compat = (
            (campanha.segmentar_cliente_ids.length === 0 || (ev.cliente_id !== null && campanha.segmentar_cliente_ids.includes(ev.cliente_id))) &&
            (campanha.segmentar_unidade_ids.length === 0 || (ev.unidade_id !== null && campanha.segmentar_unidade_ids.includes(ev.unidade_id))) &&
            (campanha.segmentar_perfis.length === 0 || (ev.perfil !== null && campanha.segmentar_perfis.includes(ev.perfil))) &&
            (campanha.segmentar_usuario_tipos.length === 0 || (ev.usuario_tipo !== null && campanha.segmentar_usuario_tipos.includes(ev.usuario_tipo))) &&
            (campanha.segmentar_estados.length === 0 || (ev.estado !== null && campanha.segmentar_estados.includes(ev.estado)))
          )
          if (compat) { conclusaoEm = ev.criado_em; break }
        }
        if (conclusaoEm) {
          const fmtDt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          block('Evento de conclusão', `Usuário "${uid}" já realizou o evento "${campanha.evento_conclusao}". Bloqueado permanentemente.`, `Registrado em ${fmtDt(conclusaoEm)}.`)
        } else {
          ok('Evento de conclusão', `Usuário "${uid}" ainda não realizou o evento "${campanha.evento_conclusao}".`)
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
          tenant_id: campanha.tenant_id,
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

        // Quick user eligibility check for this competitor using the same policy logic
        let competitorBlocked = false

        // Conclusao check — applies even to always-show users
        if (uid && c.encerrar_apos_evento && c.evento_conclusao) {
          const evConc = await prisma.eventoUsuario.findMany({
            where: { sistema: c.sistema, usuario_id: uid, evento: c.evento_conclusao },
            orderBy: { criado_em: 'desc' },
          })
          const concluido = evConc.some(ev =>
            (c.segmentar_cliente_ids.length === 0 || (ev.cliente_id !== null && c.segmentar_cliente_ids.includes(ev.cliente_id))) &&
            (c.segmentar_unidade_ids.length === 0 || (ev.unidade_id !== null && c.segmentar_unidade_ids.includes(ev.unidade_id))) &&
            (c.segmentar_perfis.length === 0 || (ev.perfil !== null && c.segmentar_perfis.includes(ev.perfil))) &&
            (c.segmentar_usuario_tipos.length === 0 || (ev.usuario_tipo !== null && c.segmentar_usuario_tipos.includes(ev.usuario_tipo))) &&
            (c.segmentar_estados.length === 0 || (ev.estado !== null && c.segmentar_estados.includes(ev.estado)))
          )
          if (concluido) competitorBlocked = true
        }

        if (uid && !alwaysShow && !competitorBlocked) {
          const cPolicy = c.politica_reexibicao || 'uma_vez_apos_visualizacao'
          if (cPolicy === 'uma_vez_apos_visualizacao') {
            const jaViu = await prisma.eventoCampanha.findFirst({ where: { campanha_id: c.id, usuario_id: uid, tipo_evento: 'visualizacao' } })
            if (jaViu) competitorBlocked = true
            if (!competitorBlocked) {
              if (c.exige_confirmacao_leitura) {
                const jaConf = await prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: c.id, usuario_id: uid } })
                if (jaConf) competitorBlocked = true
              } else {
                const uf = await prisma.feedback.findFirst({ where: { campanha_id: c.id, usuario_id: uid }, orderBy: { criado_em: 'desc' } })
                if (uf) competitorBlocked = true
              }
            }
          } else if (cPolicy === 'ate_responder_ou_confirmar') {
            if (c.exige_confirmacao_leitura) {
              const jaConf = await prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: c.id, usuario_id: uid } })
              if (jaConf) competitorBlocked = true
            } else {
              const uf = await prisma.feedback.findFirst({ where: { campanha_id: c.id, usuario_id: uid }, orderBy: { criado_em: 'desc' } })
              if (uf) competitorBlocked = true
            }
          } else if (cPolicy === 'reexibir_apos_dias') {
            const dias = c.reexibir_apos_dias
            if (dias && dias > 0) {
              const [v, f, cf] = await Promise.all([
                prisma.eventoCampanha.findFirst({ where: { campanha_id: c.id, usuario_id: uid, tipo_evento: 'visualizacao' }, orderBy: { criado_em: 'desc' } }),
                prisma.feedback.findFirst({ where: { campanha_id: c.id, usuario_id: uid }, orderBy: { criado_em: 'desc' } }),
                prisma.confirmacaoLeitura.findFirst({ where: { campanha_id: c.id, usuario_id: uid }, orderBy: { criado_em: 'desc' } }),
              ])
              const datas = [v?.criado_em, f?.criado_em, cf?.criado_em].filter((d): d is Date => !!d)
              if (datas.length > 0) {
                const maisRecente = new Date(Math.max(...datas.map(d => d.getTime())))
                const diasDesde = Math.floor((agora.getTime() - maisRecente.getTime()) / 86400000)
                if (diasDesde < dias) competitorBlocked = true
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
