// ─── Regras de exibição de campanha (múltiplas telas/URLs) ─────────────────
// Antes uma campanha tinha UMA regra fixa nas colunas Campanha.
// modo_identificacao/tela/url_contem/data_cy. Agora pode ter N regras
// (tabela campanha_regras_exibicao) — a campanha é elegível se QUALQUER uma
// corresponder (OR). As colunas legadas da Campanha continuam preenchidas e
// espelham a regra `ordem: 0`, tanto pra fallback do widget quanto pra
// leitura de compatibilidade (grupoConcorrente, preview antigo, etc.).
//
// Módulo puro (sem Prisma) — reaproveitado por widget.ts (filtro de
// candidatas) e campanhas.ts (validação/persistência), testável direto.

export const MODOS_IDENTIFICACAO = ['sistema_tela', 'data_cy', 'url_contem'] as const
export type ModoIdentificacao = (typeof MODOS_IDENTIFICACAO)[number]

// Teto defensivo pra não deixar o payload crescer sem limite (cada regra
// vira 1 linha + 1 cláusula OR no widget). 20 é folgado pra qualquer uso real.
export const MAX_REGRAS_EXIBICAO = 20

export interface RegraExibicao {
  modo_identificacao: ModoIdentificacao
  tela: string | null
  url_contem: string | null
  data_cy: string | null
  ordem: number
}

// Campos legados da própria Campanha, usados como fallback quando o cliente
// não manda `regras_exibicao` (API antiga) e como origem da regra `ordem: 0`.
export interface RegraBaseCampanha {
  modo_identificacao?: string | null
  tela?: string | null
  url_contem?: string | null
  data_cy?: string | null
}

function limpar(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const t = valor.trim()
  return t === '' ? null : t
}

// Uma regra "crua" (do body ou dos campos legados) -> RegraExibicao
// canônica, ou null se inválida (modo desconhecido, ou sem o campo exigido
// pelo modo). `ordem` é atribuída pelo caller.
export function normalizarRegra(bruto: RegraBaseCampanha): Omit<RegraExibicao, 'ordem'> | null {
  const modo = limpar(bruto.modo_identificacao) ?? 'sistema_tela'
  if (!(MODOS_IDENTIFICACAO as readonly string[]).includes(modo)) return null

  const tela = limpar(bruto.tela)
  const url_contem = limpar(bruto.url_contem)
  const data_cy = limpar(bruto.data_cy)

  if (modo === 'sistema_tela') {
    // Mesma tolerância do controller legado: tela vazia vira "Geral".
    return { modo_identificacao: 'sistema_tela', tela: tela ?? 'Geral', url_contem: null, data_cy: null }
  }
  if (modo === 'url_contem') {
    if (!url_contem) return null
    return { modo_identificacao: 'url_contem', tela: null, url_contem, data_cy: null }
  }
  // data_cy
  if (!data_cy) return null
  return { modo_identificacao: 'data_cy', tela: null, url_contem: null, data_cy }
}

function chave(r: Omit<RegraExibicao, 'ordem'>): string {
  return `${r.modo_identificacao}|${r.tela ?? ''}|${r.url_contem ?? ''}|${r.data_cy ?? ''}`
}

// Normaliza a lista de regras vinda do body. Sempre devolve >= 1 regra:
// - `bruto` é um array não-vazio -> normaliza cada item, descarta inválidos,
//   deduplica, aplica o teto e reindexa `ordem`.
// - `bruto` ausente/vazio/sem itens válidos -> cai na regra única sintetizada
//   de `base` (campos legados da campanha) — é isso que preserva a API antiga.
// A regra em `ordem: 0` é a "base" (espelhada nas colunas da Campanha).
export function normalizarRegrasExibicao(bruto: unknown, base: RegraBaseCampanha): RegraExibicao[] {
  const candidatas: Array<Omit<RegraExibicao, 'ordem'>> = []
  if (Array.isArray(bruto)) {
    for (const item of bruto) {
      if (!item || typeof item !== 'object') continue
      const norm = normalizarRegra(item as RegraBaseCampanha)
      if (norm) candidatas.push(norm)
    }
  }

  let lista = candidatas
  if (lista.length === 0) {
    const daBase = normalizarRegra(base)
    lista = daBase ? [daBase] : [{ modo_identificacao: 'sistema_tela', tela: 'Geral', url_contem: null, data_cy: null }]
  }

  const vistas = new Set<string>()
  const unicas: Array<Omit<RegraExibicao, 'ordem'>> = []
  for (const r of lista) {
    const k = chave(r)
    if (vistas.has(k)) continue
    vistas.add(k)
    unicas.push(r)
    if (unicas.length >= MAX_REGRAS_EXIBICAO) break
  }

  return unicas.map((r, i) => ({ ...r, ordem: i }))
}

// A regra `ordem: 0` (ou a primeira) — usada pra manter as colunas legadas
// da Campanha em sincronia (fallback do widget, grupoConcorrente, preview).
export function regraBase(regras: RegraExibicao[]): RegraExibicao {
  return regras.find(r => r.ordem === 0) ?? regras[0]
}

// ─── Identidade de uma regra (escopo de exibição/reexibição) ──────────────
// A política de "mostrar uma vez" / reexibição é aplicada por CAMPANHA +
// REGRA (destino), não pela campanha inteira: dispensar/responder em
// /app/home não deve suprimir a campanha em /app/profissional-saude. Esta
// chave identifica a regra de forma estável (não depende do uuid da linha,
// que troca a cada save do form) — mesmo valor no widget.js
// (chaveRegraExibicao) e no servidor (verificarHistoricoPorRegra). Vazio /
// modo desconhecido -> null (a regra não participa do escopo por-regra e
// cai no histórico "sem regra").
export function chaveRegraExibicao(regra: { modo_identificacao?: string | null; tela?: string | null; url_contem?: string | null; data_cy?: string | null }): string | null {
  const modo = (regra.modo_identificacao || 'sistema_tela').trim()
  if (modo === 'sistema_tela') {
    const t = (regra.tela ?? '').trim()
    return t ? `st|${t}` : null
  }
  if (modo === 'url_contem') {
    const u = (regra.url_contem ?? '').trim()
    return u ? `uc|${u}` : null
  }
  if (modo === 'data_cy') {
    const d = (regra.data_cy ?? '').trim()
    return d ? `dc|${d}` : null
  }
  return null
}

// Fragmento Prisma pro filtro de GET /api/widget/candidatas: a campanha é
// candidata se TIVER ao menos uma regra compatível com a `tela` informada
// pelo widget (sistema_tela) OU uma regra data_cy/url_contem (sempre
// incluídas — o alvo não é a tela; o widget faz a checagem real no client,
// ver checkMode em widget.js). Espelha a lógica de checkMode, exceto a
// verificação client-side de DOM/URL.
export function filtroRegrasCandidatas(tela: unknown): { some: { OR: object[] } } {
  const modoFiltros: object[] = []
  if (tela) modoFiltros.push({ modo_identificacao: 'sistema_tela', tela: String(tela) })
  modoFiltros.push({ modo_identificacao: 'data_cy' })
  modoFiltros.push({ modo_identificacao: 'url_contem' })
  return { some: { OR: modoFiltros } }
}
