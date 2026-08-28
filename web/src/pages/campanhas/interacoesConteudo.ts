// Rótulo da coluna/campo "Conteúdo" da seção "Interações" no dashboard de
// campanhas. Lógica pura (sem React/import.meta.env) — mesmo motivo de
// dashboardBlocos.ts: precisa ser testável com node:test sem montar o
// componente. `infoPorId` é derivado no componente a partir de
// data.desempenho_conteudos (conteudo_item_id -> { ordem, titulo }).

export interface ConteudoInfo {
  ordem: number
  titulo: string
}

// Regras (idênticas em desktop e mobile):
// - clique_cta com id resolvido em infoPorId -> "2 · Título"
// - clique_cta sem id, OU id não encontrado (conteúdo removido — FK
//   ON DELETE SET NULL já zerou o campo, mas cobre também qualquer
//   inconsistência) -> "Não identificado"
// - qualquer outro tipo de evento (visualizacao/dispensa/interacao_badge)
//   -> "—"
// Nunca agrupa/deduplica: recebe 1 evento por vez, cada linha da tabela
// chama esta função independentemente.
export function rotuloConteudoEvento(
  tipoEvento: string,
  conteudoItemId: string | null,
  infoPorId: Map<string, ConteudoInfo>
): string {
  if (tipoEvento !== 'clique_cta') return '—'
  if (!conteudoItemId) return 'Não identificado'
  const info = infoPorId.get(conteudoItemId)
  if (!info) return 'Não identificado'
  return `${info.ordem} · ${info.titulo}`
}

// true só quando o rótulo aponta pra um conteúdo real (define o estilo:
// texto normal x "text-outline italic" pros casos "—" e "Não identificado").
export function conteudoEventoIdentificado(
  tipoEvento: string,
  conteudoItemId: string | null,
  infoPorId: Map<string, ConteudoInfo>
): boolean {
  return tipoEvento === 'clique_cta' && !!conteudoItemId && infoPorId.has(conteudoItemId)
}
