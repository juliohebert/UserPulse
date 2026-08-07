export interface Campanha {
  id: string
  slug: string
  titulo: string
  subtitulo: string | null
  descricao: string
  tipo: string
  sistema: string
  tela: string
  imagem_url: string | null
  video_url: string | null
  texto_botao: string | null
  url_botao: string | null
  feedback_habilitado: boolean
  modo_exibicao: string
  gatilho: string
  evento: string | null
  modo_identificacao: string
  data_cy: string | null
  url_contem: string | null
  atraso_ms: number
  mostrar_uma_vez: boolean
  prioridade: number
  ordem: number
  ativo: boolean
  data_inicio: string | null
  data_fim: string | null
  pergunta_feedback: string | null
  observacao_obrigatoria: boolean
  exige_confirmacao_leitura: boolean
  permitir_fechar_modal: boolean
  intervalo_reexibicao_dias: number | null
  politica_reexibicao: string
  reexibir_apos_dias: number | null
  encerrar_apos_evento: boolean
  evento_conclusao: string | null
  categoria: string | null
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
  criado_em: string
  atualizado_em: string
  _count?: { feedbacks: number }
}

export interface Feedback {
  id: string
  campanha_id: string
  nota: number
  observacao: string | null
  usuario_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  sistema: string | null
  tela: string | null
  navegador: string | null
  dispositivo: string | null
  telefone_contato: string | null
  contexto: Record<string, string> | null
  criado_em: string
}

export interface EventoCampanha {
  id: string
  campanha_id: string
  tipo_evento: string
  usuario_id: string | null
  sistema: string | null
  tela: string | null
  navegador: string | null
  dispositivo: string | null
  contexto: Record<string, string> | null
  criado_em: string
}

export interface DashboardData {
  campanha: Campanha
  media: number | null
  total: number
  distribuicao: Record<string, number>
  feedbacks_recentes: Feedback[]
  visualizacoes: number
  cliques_cta: number
  taxa_clique: number
  total_confirmacoes: number
  percentual_confirmacao: number
  eventos_recentes: EventoCampanha[]
  visualizacoes_unicas: number
  cliques_unicos: number
  respondentes_unicos: number
}

export interface TelaCatalogo {
  id: string
  nome: string
  sistema: string
  categoria: string
  modo_identificacao: string
  tela: string | null
  url_contem: string | null
  data_cy: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface AparenciaWidget {
  id?: string
  sistema: string
  cor_principal: string | null
  logo_url: string | null
  criado_em?: string
  atualizado_em?: string
}

export type StatusCampanha = 'ativa' | 'inativa' | 'agendada' | 'encerrada'

export interface TourPasso {
  id: string
  tour_id: string
  ordem: number
  titulo: string
  descricao: string | null
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
  acao_ao_avancar: string
  modo_avanco_interacao: string
  seletor_confirmacao: string | null
  secao: string | null
  criado_em: string
  atualizado_em: string
}

// Segmentação por contexto (MVP) — regras avaliadas pelo widget usando o
// contexto atual (init/updateContext). campo/operador seguem a mesma lista
// fixa validada no backend (ver CAMPOS_SEGMENTACAO/OPERADORES_SEGMENTACAO em
// server/src/controllers/tours.ts). Para 'em_lista', valor é uma lista
// separada por vírgula (ex.: "RN,SP,MG"), igual ao ChipInput de Campanha,
// só que como texto simples em vez de chips — decisão de MVP para não
// precisar de um componente por operador.
export type CampoSegmentacaoTour =
  | 'cliente_id' | 'unidade_id' | 'organizacao_id' | 'clinica_id'
  | 'usuario_tipo' | 'perfil' | 'estado' | 'usuario_id' | 'usuario_email'
  | 'tela' | 'sistema'

export type OperadorSegmentacaoTour = 'igual' | 'diferente' | 'contem' | 'em_lista'

export interface RegraSegmentacaoTour {
  campo: CampoSegmentacaoTour | ''
  operador: OperadorSegmentacaoTour
  valor: string
}

export interface TourGuiado {
  id: string
  slug: string
  titulo: string
  descricao: string | null
  sistema: string
  modo_identificacao: string
  tela: string | null
  data_cy: string | null
  url_contem: string | null
  prioridade: number
  ativo: boolean
  // null/ausente = sem segmentação (todos os contextos elegíveis, mesmo
  // comportamento de qualquer tour criado antes desta feature existir).
  segmentacao_regras: RegraSegmentacaoTour[] | null
  criado_em: string
  atualizado_em: string
  passos?: TourPasso[]
  _count?: { passos: number }
}

// GET /tours?page=&pageSize=&... — só quando page/pageSize são enviados (ver
// listar em server/src/controllers/tours.ts); sem esses parâmetros, a rota
// continua devolvendo TourGuiado[] puro (usado por web/src/pages/Dashboard.tsx
// e web/src/pages/jornadas/Form.tsx, que precisam da lista inteira sem
// paginação e não foram alterados por essa mudança).
export interface ResumoListaTours {
  // Totais SEM filtro nenhum (busca/sistema/status) — os KPIs da tela sempre
  // mostraram o total da base inteira, independente dos filtros da tabela.
  total: number
  ativos: number
  inativos: number
  total_passos: number
}

export interface TourGuiadoListaPaginada {
  items: TourGuiado[]
  // total já considerando os filtros aplicados — o que a paginação usa.
  total: number
  page: number
  per_page: number
  total_pages: number
  resumo: ResumoListaTours
  // Lista completa de sistemas distintos (sem filtro) — popula o dropdown.
  sistemas: string[]
}

export interface TourExportPasso {
  titulo: string
  descricao: string | null
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
  acao_ao_avancar: string
  modo_avanco_interacao: string
  seletor_confirmacao: string | null
  secao: string | null
}

export interface TourExportData {
  slug: string
  titulo: string
  descricao: string | null
  sistema: string
  modo_identificacao: string
  tela: string | null
  data_cy: string | null
  url_contem: string | null
  prioridade: number
  segmentacao_regras: RegraSegmentacaoTour[] | null
  passos: TourExportPasso[]
}

export interface TourExportEnvelope {
  formato: string
  exportado_em: string
  tour: TourExportData
}

export interface EventoTourDashboard {
  id: string
  tipo_evento: string
  passo_ordem: number | null
  passo_titulo: string | null
  usuario_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  cliente_id: string | null
  cliente_nome: string | null
  unidade_id: string | null
  unidade_nome: string | null
  criado_em: string
}

export interface FunilPassoItem {
  passo_ordem: number
  passo_titulo: string
  visualizacoes: number
  elemento_nao_encontrado: number
  // null só no último passo — não existe "próximo passo" pra medir avanço.
  proximo_passo_visualizacoes: number | null
  // Estimativa (ver comentário de montarFunilPorPasso em tours.ts): quem
  // visualizou o próximo passo (ou concluiu, no último) é contado como tendo
  // avançado a partir deste — nunca um avanço real medido evento a evento.
  avancos_estimados: number
  abandonos_estimados: number
  taxa_continuidade: number | null
  taxa_queda: number | null
  ultimo_passo: boolean
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

export interface TourDashboardData {
  tour: TourGuiado
  iniciados: number
  concluidos: number
  pulados: number
  elementos_nao_encontrados: number
  taxa_conclusao: number
  funil_por_passo: FunilPassoItem[]
  feedback: ResumoFeedbackTour
  eventos_recentes: EventoTourDashboard[]
  // Paginação da lista de eventos — os cards acima sempre consideram todos
  // os dados filtrados, independente da página atual.
  page: number
  per_page: number
  total: number
  total_pages: number
}

export type TipoEtapaJornada = 'tour' | 'campanha' | 'link'

export interface EtapaJornada {
  id: string
  bloco_id: string
  titulo: string
  descricao: string | null
  tipo: TipoEtapaJornada
  tour_id: string | null
  campanha_id: string | null
  url: string | null
  texto_cta: string | null
  abrir_nova_aba: boolean
  ordem: number
  obrigatoria: boolean
  criado_em: string
  atualizado_em: string
  tour?: { id: string; titulo: string; slug: string; ativo: boolean } | null
  campanha?: { id: string; titulo: string; slug: string; ativo: boolean } | null
  status?: 'pendente' | 'concluida' | 'pulada'
}

// Nome técnico: BlocoJornada. Nome visual na UI/widget: "Pacote".
export interface BlocoJornada {
  id: string
  jornada_id: string
  titulo: string
  descricao: string | null
  ordem: number
  obrigatorio: boolean
  ativo: boolean
  criado_em: string
  atualizado_em: string
  etapas?: EtapaJornada[]
  progresso?: { concluido: boolean; etapas_concluidas: number; etapas_total: number }
}

export interface Jornada {
  id: string
  slug: string
  titulo: string
  descricao: string | null
  ativo: boolean
  permitir_refazer: boolean
  permitir_pacotes_fora_ordem: boolean
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
  criado_em: string
  atualizado_em: string
  blocos?: BlocoJornada[]
  progresso?: { concluida: boolean; blocos_concluidos: number; blocos_total: number }
  _count?: { blocos: number; etapas: number }
}

export type CriterioStatus = 'ok' | 'bloqueado' | 'aviso' | 'nao_aplicavel'

export interface Criterio {
  nome: string
  status: CriterioStatus
  detalhe?: string
}

export interface ResultadoElegibilidade {
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

// Fundação SaaS multi-tenant — ver server/prisma/schema.prisma. Plano/Tenant
// aqui são o recorte público devolvido em /auth/login e /auth/me (ver
// tenantPublico em server/src/controllers/auth.ts), nunca o registro
// completo do banco.
export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED'
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface PlanoResumo {
  id: string
  nome: string
  slug: string
  permite_tours: boolean
  permite_jornadas: boolean
  permite_white_label: boolean
  limite_campanhas_ativas: number | null
  limite_tours_ativos: number | null
  limite_eventos_mes: number | null
  limite_usuarios_admin: number | null
}

export interface TenantResumo {
  id: string
  // Código sequencial comercial (1, 2, 3...) — só para suporte/vendas, nunca
  // uma chave técnica (id continua sendo o identificador usado em toda FK).
  codigo: number
  nome: string
  slug: string
  // Identificador público do tenant (Fase 2 do widget multi-tenant) — usado
  // no window.UserPulse.init({ public_key: ... }) do sistema integrado (ver
  // tela de Integração). Não é segredo, mas nunca confundir com o id (UUID
  // técnico) nem com codigo (uso comercial/suporte).
  public_key: string
  status: TenantStatus
  trial_fim: string | null
  plano: PlanoResumo | null
}

// Usuário admin autenticado — nunca inclui password_hash (o backend já nunca
// devolve esse campo, ver server/src/controllers/auth.ts).
export interface AdminUser {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  // Troca obrigatória de senha (ver server/src/controllers/auth.ts,
  // usuarioPublico) — senha_temporaria é o estado bruto, precisa_trocar_senha
  // é o mesmo valor com o nome que RequireSenhaAtualizada.tsx usa pra
  // decidir o redirect.
  senha_temporaria: boolean
  precisa_trocar_senha: boolean
  criado_em: string
  atualizado_em: string
  tenant: TenantResumo
}

// ─── Painel Super Admin (gerenciar Tenants/Planos/teste grátis) ────────────
// Só acessível por AdminUser.role === 'SUPER_ADMIN' (ver
// server/src/middleware/requireSuperAdmin.ts) — recorte "administrativo"
// completo do Plano/Tenant, diferente de PlanoResumo/TenantResumo acima (que
// são o recorte público devolvido em /auth/me pro próprio tenant logado).

// preco_mensal serializa como string via JSON (Prisma.Decimal.toJSON()),
// nunca number.
export interface PlanoAdmin {
  id: string
  nome: string
  slug: string
  descricao: string | null
  preco_mensal: string | null
  limite_campanhas_ativas: number | null
  limite_tours_ativos: number | null
  limite_eventos_mes: number | null
  limite_usuarios_admin: number | null
  permite_tours: boolean
  permite_jornadas: boolean
  permite_white_label: boolean
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface AdminDoTenant {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface TenantAdminItem {
  id: string
  codigo: number
  nome: string
  slug: string
  public_key: string
  status: TenantStatus
  trial_inicio: string | null
  trial_fim: string | null
  // Controle de licença paga — ajustado manualmente pelo super admin, sem
  // gateway/cobrança automática (ver server/prisma/schema.prisma).
  licenca_inicio: string | null
  licenca_fim: string | null
  proxima_cobranca: string | null
  ultimo_pagamento_em: string | null
  observacao_comercial: string | null
  plano_id: string | null
  plano: PlanoAdmin | null
  criado_em: string
  atualizado_em: string
  _count: { admins: number }
}

export interface TenantAdminDetail extends Omit<TenantAdminItem, '_count'> {
  admins: AdminDoTenant[]
}
