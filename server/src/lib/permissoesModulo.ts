import { AdminRole, ModuloPainel, NivelAcessoModulo } from '@prisma/client'

// Fase 1 de permissões personalizadas por usuário (ver CLAUDE.md/relatório da
// tarefa). Helper puro (sem Prisma/IO aqui) — quem monta o SujeitoPermissao é
// requireAdminAuth.ts, num único SELECT por request (ver comentário lá).
//
// Regras fechadas da tarefa:
// 1. SUPER_ADMIN é sempre GERENCIAR em qualquer módulo, independente de tudo
//    o mais (nunca lê permissoes_personalizadas nem a tabela de override).
// 2. permissoes_personalizadas=false => nível vem só da ROLE (tabela abaixo,
//    espelha EXATAMENTE os Sets de requireEscritaTenant.ts). Para
//    CAMPANHAS/TOURS/JORNADAS, a leitura já era aberta a qualquer papel
//    autenticado antes da Fase 1 (nunca houve guard de leitura). CONFIGURACOES
//    é a exceção: EDITOR/VIEWER são NENHUM aqui de propósito (ajuste pós-
//    revisão da Fase 4) — antes da Fase 4, a rota de Configurações inteira
//    era ADMIN/SUPER_ADMIN-only, inclusive leitura; flag=false precisa
//    preservar exatamente esse comportamento anterior.
// 3. permissoes_personalizadas=true => a ROLE deixa de importar (exceto
//    SUPER_ADMIN, regra 1): o nível efetivo vem só da linha de
//    AdminUserPermissao para aquele módulo.
// 4. Sem linha personalizada pro módulo => NENHUM (nunca herda de outro
//    módulo, nunca cai de volta pro padrão da role).
export interface PermissaoModuloLinha {
  modulo: ModuloPainel
  nivel: NivelAcessoModulo
}

export interface SujeitoPermissao {
  role: AdminRole
  permissoes_personalizadas: boolean
  permissoes: PermissaoModuloLinha[]
}

const ORDEM_NIVEL: Record<NivelAcessoModulo, number> = {
  NENHUM: 0,
  VISUALIZAR: 1,
  GERENCIAR: 2,
}

// Nível concedido por padrão a cada role, por módulo, quando
// permissoes_personalizadas=false. Não editar sem também revisar
// requireEscritaTenant.ts (PODE_ESCREVER_CONTEUDO/PODE_EXCLUIR_OU_
// IMPORTAR_CONTEUDO/PODE_ESCREVER_CONFIGURACAO) — são a mesma fonte de
// verdade, duplicada de propósito nesta fase (ver comentário lá sobre por
// que os middlewares antigos continuam existindo em vez de serem
// substituídos por esta tabela).
const NIVEL_PADRAO_POR_ROLE: Record<ModuloPainel, Partial<Record<AdminRole, NivelAcessoModulo>>> = {
  CAMPANHAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  TOURS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  JORNADAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
  // Ajuste pós-revisão (retrocompatibilidade da Fase 4): EDITOR/VIEWER são
  // NENHUM aqui, não VISUALIZAR — o comportamento ANTERIOR à Fase 4 pra
  // esses dois papéis era não acessar a tela de Configurações de jeito
  // nenhum (RequireEscritaConfiguracao.tsx bloqueava a rota inteira,
  // ADMIN/SUPER_ADMIN-only). flag=false precisa preservar exatamente isso —
  // só ADMIN/SUPER_ADMIN têm acesso por padrão. EDITOR/VIEWER só passam a
  // acessar Configurações se isso for concedido explicitamente por
  // permissão personalizada (permissoes_personalizadas=true).
  CONFIGURACOES: { ADMIN: 'GERENCIAR', EDITOR: 'NENHUM', VIEWER: 'NENHUM' },
}

export function nivelAcessoEfetivo(sujeito: SujeitoPermissao, modulo: ModuloPainel): NivelAcessoModulo {
  if (sujeito.role === 'SUPER_ADMIN') return 'GERENCIAR'

  if (!sujeito.permissoes_personalizadas) {
    return NIVEL_PADRAO_POR_ROLE[modulo][sujeito.role] ?? 'NENHUM'
  }

  const linha = sujeito.permissoes.find(p => p.modulo === modulo)
  return linha?.nivel ?? 'NENHUM'
}

// GERENCIAR implica VISUALIZAR por comparação ordinal — nunca precisa de
// caso especial pra isso.
export function possuiNivelMinimo(
  sujeito: SujeitoPermissao,
  modulo: ModuloPainel,
  minimo: NivelAcessoModulo
): boolean {
  return ORDEM_NIVEL[nivelAcessoEfetivo(sujeito, modulo)] >= ORDEM_NIVEL[minimo]
}
