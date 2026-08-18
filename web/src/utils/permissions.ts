import type { AdminUser, ModuloPainel, NivelAcessoModulo } from '../types'

// Fase 4 de permissões personalizadas — espelha as regras aplicadas de
// verdade no backend (ver server/src/lib/permissoesModulo.ts,
// nivelAcessoEfetivo), mas SEM recalcular a regra sozinho: user.
// permissoes_efetivas já vem pronto do backend em /auth/me (ver
// controllers/auth.ts, usuarioPublico) — inclusive já resolve SUPER_ADMIN
// (sempre GERENCIAR) e o caso sem personalização (padrão da role). O front
// só compara o nível já calculado, nunca decide autorização por conta
// própria. Só UX: qualquer chamada de API que escape destes controles de UI
// ainda é barrada no servidor.

const ORDEM_NIVEL: Record<NivelAcessoModulo, number> = { NENHUM: 0, VISUALIZAR: 1, GERENCIAR: 2 }

function nivel(user: AdminUser | null | undefined, modulo: ModuloPainel): NivelAcessoModulo {
  return user?.permissoes_efetivas[modulo] ?? 'NENHUM'
}

// VISUALIZAR (ou mais) -> aparece no menu, acessa a rota do módulo, lê os
// dados. NENHUM -> nem o menu nem a rota.
export function podeVisualizarModulo(user: AdminUser | null | undefined, modulo: ModuloPainel): boolean {
  return ORDEM_NIVEL[nivel(user, modulo)] >= ORDEM_NIVEL.VISUALIZAR
}

// GERENCIAR -> além de visualizar, cria/edita/ativa-inativa/duplica — a
// escrita comum do módulo. GERENCIAR já implica VISUALIZAR por construção
// (nunca precisa checar os dois separados pra liberar uma tela que só lê).
export function podeGerenciarModulo(user: AdminUser | null | undefined, modulo: ModuloPainel): boolean {
  return ORDEM_NIVEL[nivel(user, modulo)] >= ORDEM_NIVEL.GERENCIAR
}

// Exclusão de verdade (hard delete) e importação — mais restrito que a
// escrita comum: exige GERENCIAR efetivo E continua limitado ao teto
// administrativo da role (SUPER_ADMIN/ADMIN), mesmo com GERENCIAR
// personalizado (mesma regra de requireExclusaoOuImportacaoConteudo no
// backend, ver server/src/middleware/requireEscritaTenant.ts — permissão
// personalizada nunca eleva EDITOR/VIEWER acima do teto da própria role).
export function podeExcluirOuImportarModulo(user: AdminUser | null | undefined, modulo: ModuloPainel): boolean {
  return podeGerenciarModulo(user, modulo) && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN')
}

// ATENÇÃO: função LEGADA, mantida só pra Billing/Minha Assinatura
// (AvisoComercial.tsx, rota /minha-assinatura em App.tsx) — regra fechada
// da tarefa: "Billing/Minha Assinatura fica fora da nova permissão por
// módulo, mantém acesso conforme regra anterior". Nunca usar isto pras
// telas de Configurações (aparência/catálogo/sistemas/integração) — essas
// usam podeVisualizarModulo/podeGerenciarModulo com modulo='CONFIGURACOES'.
export function podeEscreverConfiguracao(role: AdminUser['role'] | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}
