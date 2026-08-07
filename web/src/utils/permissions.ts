import type { AdminRole } from '../types'

// Espelha as regras aplicadas de verdade no backend (ver
// server/src/middleware/requireEscritaTenant.ts) — o front só usa isso pra
// UX (esconder/desabilitar ações que o backend já bloqueia com 403), nunca é
// a fonte de verdade. Qualquer chamada de API que escape destes controles de
// UI ainda é barrada no servidor.
//
// "Conteúdo" = campanhas/tours/jornadas (criar, editar, ativar/inativar,
// duplicar) — ADMIN e EDITOR podem, VIEWER não. Note que "inativar" uma
// campanha usa esta permissão mesmo sendo uma chamada DELETE — o backend só
// marca ativo:false ali (ver comentário em server/src/routes/campanhas.ts),
// nunca é uma exclusão de verdade.
export function podeEscreverConteudo(role: AdminRole | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'EDITOR'
}

// Exclusão de verdade (tours/jornadas — hard delete) e importação de tours —
// só ADMIN, EDITOR não. Ver requireExclusaoOuImportacaoConteudo no backend.
export function podeExcluirOuImportarConteudo(role: AdminRole | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

// "Configuração" do tenant = aparência do widget e catálogo de telas — só
// ADMIN (e SUPER_ADMIN, que se comporta como ADMIN dentro do próprio
// tenant). EDITOR e VIEWER não.
export function podeEscreverConfiguracao(role: AdminRole | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}
