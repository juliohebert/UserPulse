// ─── Observação do NPS por categoria da nota ──────────────────────────────
// O concorrente permite configurar, por categoria da resposta NPS, se o
// campo de comentário aparece e qual mensagem exibir. Categorias fixas:
//   promotor  -> notas 9-10
//   neutro    -> notas 7-8
//   detrator  -> notas 0-6
//
// Persistido em Campanha.observacao_categorias (Json?). `null` (todo legado)
// = comportamento atual: campo sempre visível, placeholder padrão,
// observacao_obrigatoria global. Categoria ausente no objeto = mesmo
// fallback legado. Módulo puro (sem Prisma) — validação usada por
// campanhas.ts; o widget tem a sua própria cópia de categoriaDaNota/
// resolver (não há pacote compartilhado, ver CLAUDE.md).

export const CATEGORIAS_NPS = ['promotor', 'neutro', 'detrator'] as const
export type CategoriaNps = (typeof CATEGORIAS_NPS)[number]

export interface ObservacaoCategoriaConfig {
  habilitado: boolean
  mensagem: string
}
export type ObservacaoCategorias = Partial<Record<CategoriaNps, ObservacaoCategoriaConfig>>

// Teto defensivo pro texto (mesma ordem de grandeza de um placeholder longo).
export const MAX_MENSAGEM_OBSERVACAO = 280

export function categoriaDaNota(nota: number): CategoriaNps {
  if (nota >= 9) return 'promotor'
  if (nota >= 7) return 'neutro'
  return 'detrator'
}

// Normaliza/valida o valor vindo do corpo da requisição.
// - `undefined` -> { documento: undefined } (não escrever)
// - `null` / objeto vazio / sem categoria válida -> { documento: null } (limpa)
// - objeto -> mantém só as 3 chaves conhecidas, coage tipos, corta a mensagem
// - qualquer outra coisa (array, string, número) -> { erro }
export function validarObservacaoCategorias(
  bruto: unknown,
): { documento?: ObservacaoCategorias | null; erro?: string } {
  if (bruto === undefined) return { documento: undefined }
  if (bruto === null) return { documento: null }
  if (typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { erro: 'observacao_categorias deve ser um objeto por categoria (promotor/neutro/detrator).' }
  }

  const entrada = bruto as Record<string, unknown>
  const saida: ObservacaoCategorias = {}
  for (const cat of CATEGORIAS_NPS) {
    const v = entrada[cat]
    if (v === undefined || v === null) continue
    if (typeof v !== 'object' || Array.isArray(v)) {
      return { erro: `observacao_categorias.${cat} deve ser um objeto { habilitado, mensagem }.` }
    }
    const obj = v as Record<string, unknown>
    const mensagem = typeof obj.mensagem === 'string' ? obj.mensagem.trim().slice(0, MAX_MENSAGEM_OBSERVACAO) : ''
    saida[cat] = {
      // habilitado ausente = habilitado (mesmo default de hoje: campo aparece).
      habilitado: obj.habilitado === undefined ? true : Boolean(obj.habilitado),
      mensagem,
    }
  }

  return { documento: Object.keys(saida).length > 0 ? saida : null }
}

export interface ResolucaoObservacao {
  // true => sem config (ou categoria não configurada): comportamento atual —
  // campo sempre visível, placeholder padrão, observacao_obrigatoria global.
  legado: boolean
  // show/hide do campo (com config: false até a nota ser escolhida e quando
  // a categoria daquela nota está desabilitada).
  visivel: boolean
  mensagem: string | null
}

// Decisão de exibição do campo de observação para uma nota (mesma regra no
// widget.js: resolverObservacaoNps). `nota` null com config presente => campo
// escondido (aguardando a nota).
export function resolverObservacaoCategoria(
  cfg: ObservacaoCategorias | null | undefined,
  nota: number | null | undefined,
): ResolucaoObservacao {
  if (!cfg || typeof cfg !== 'object') return { legado: true, visivel: true, mensagem: null }
  if (nota === null || nota === undefined) return { legado: false, visivel: false, mensagem: null }
  const cat = cfg[categoriaDaNota(nota)]
  if (!cat || typeof cat !== 'object') return { legado: true, visivel: true, mensagem: null }
  if (cat.habilitado === false) return { legado: false, visivel: false, mensagem: null }
  return { legado: false, visivel: true, mensagem: typeof cat.mensagem === 'string' && cat.mensagem.trim() ? cat.mensagem : null }
}
