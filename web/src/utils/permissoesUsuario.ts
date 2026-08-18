import type { AdminRole, ModuloPainel, NivelAcessoModulo, PermissoesUsuario } from '../types'

// Fase 3 de permissões personalizadas por usuário — lógica pura do modal
// "Personalizar permissões" (ver components/admin/PermissoesUsuarioModal.tsx
// e pages/admin/Tenants.tsx). Nada aqui decide autorização de verdade — o
// backend (server/src/lib/permissoesModulo.ts) é a única fonte de verdade;
// isto só monta/lê o formulário.

export const MODULOS_PAINEL: ModuloPainel[] = ['CAMPANHAS', 'TOURS', 'JORNADAS', 'CONFIGURACOES']

export const MODULO_LABEL: Record<ModuloPainel, string> = {
  CAMPANHAS: 'Campanhas',
  TOURS: 'Tours',
  JORNADAS: 'Jornadas',
  CONFIGURACOES: 'Configurações',
}

export const NIVEL_OPCOES: { value: NivelAcessoModulo; label: string }[] = [
  { value: 'NENHUM', label: 'Nenhum' },
  { value: 'VISUALIZAR', label: 'Visualizar' },
  { value: 'GERENCIAR', label: 'Gerenciar' },
]

export type MatrizPermissoes = Record<ModuloPainel, NivelAcessoModulo>

export interface FormPermissoes {
  personalizado: boolean
  matriz: MatrizPermissoes
}

// Espelha NIVEL_PADRAO_POR_ROLE em server/src/lib/permissoesModulo.ts —
// mesma fonte de verdade, duplicada de propósito (sem pacote compartilhado
// entre server/web, ver CLAUDE.md). Só usada como PONTO DE PARTIDA do
// formulário quando o usuário nunca teve nenhuma linha salva antes — o
// backend sempre recalcula/valida de novo no PUT, esta cópia nunca decide
// autorização sozinha.
const NIVEL_PADRAO_POR_ROLE: Record<ModuloPainel, Partial<Record<AdminRole, NivelAcessoModulo>>> = {
  CAMPANHAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  TOURS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  JORNADAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  // Ajuste pós-revisão (retrocompatibilidade da Fase 4): EDITOR/VIEWER são
  // NENHUM, não VISUALIZAR — antes da Fase 4 a rota de Configurações
  // inteira era ADMIN/SUPER_ADMIN-only, flag=false precisa preservar
  // exatamente isso.
  CONFIGURACOES: { ADMIN: 'GERENCIAR', EDITOR: 'NENHUM', VIEWER: 'NENHUM' },
}

// role -> matriz inicial (usada quando a personalização nunca foi salva
// pra este usuário nenhuma vez).
export function matrizInicialPorRole(role: AdminRole): MatrizPermissoes {
  const matriz = {} as MatrizPermissoes
  for (const modulo of MODULOS_PAINEL) {
    matriz[modulo] = NIVEL_PADRAO_POR_ROLE[modulo][role] ?? 'NENHUM'
  }
  return matriz
}

// GET .../permissoes -> formulário. Três casos (ver "Carregamento" na
// tarefa):
// 1. personalização já ativa -> usa permissoes_efetivas (sempre com valor
//    concreto nos 4 módulos, nunca precisa de fallback aqui);
// 2. inativa, mas com matriz salva anteriormente -> preserva essa matriz
//    (ausência de módulo na matriz salva = NENHUM, mesma regra do backend),
//    pronta pra eventual reativação sem redigitar nada;
// 3. inativa e nunca houve matriz salva -> pré-preenche equivalente à role atual.
export function formularioInicialDePermissoes(resposta: PermissoesUsuario): FormPermissoes {
  if (resposta.permissoes_personalizadas) {
    return { personalizado: true, matriz: { ...resposta.permissoes_efetivas } }
  }

  const houveMatrizSalva = MODULOS_PAINEL.some(modulo => resposta.permissoes_personalizadas_salvas[modulo] !== null)
  if (houveMatrizSalva) {
    const matriz = {} as MatrizPermissoes
    for (const modulo of MODULOS_PAINEL) {
      matriz[modulo] = resposta.permissoes_personalizadas_salvas[modulo] ?? 'NENHUM'
    }
    return { personalizado: false, matriz }
  }

  return { personalizado: false, matriz: matrizInicialPorRole(resposta.role) }
}

// Formulário -> payload do PUT. Sempre os 4 módulos explícitos, inclusive
// NENHUM (nunca omite um módulo pra "economizar payload") — o backend trata
// o payload como a matriz COMPLETA (substitui tudo, ver salvarPermissoes em
// adminTenantsPermissoes.ts), então omitir um módulo aqui equivaleria a
// apagá-lo, não a "deixar como estava".
export function montarPayloadPermissoes(matriz: MatrizPermissoes): { permissoes: { modulo: ModuloPainel; nivel: NivelAcessoModulo }[] } {
  return { permissoes: MODULOS_PAINEL.map(modulo => ({ modulo, nivel: matriz[modulo] })) }
}

// switch ativo -> PUT (salva a matriz); switch desativado -> DELETE (volta
// pra role, preservando a matriz salva no backend pra eventual reativação).
export function metodoParaSalvarPermissoes(personalizado: boolean): 'PUT' | 'DELETE' {
  return personalizado ? 'PUT' : 'DELETE'
}

// Espelha motivoBloqueioAlvoPermissoes em
// server/src/controllers/adminTenantsPermissoes.ts — SUPER_ADMIN nunca
// recebe personalização, então a ação nem aparece na linha (só UX, o
// backend já barra com 403 mesmo que alguém force a chamada).
export function podeReceberPersonalizacao(role: AdminRole): boolean {
  return role !== 'SUPER_ADMIN'
}

export function rotuloIndicadorPersonalizacao(personalizado: boolean): string | null {
  return personalizado ? 'PERSONALIZADO' : null
}
