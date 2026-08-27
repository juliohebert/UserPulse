export interface Campanha {
  id: string
  slug: string
  nome_interno: string
  titulo: string
  // Eyebrow do modal por padrão; quando modo_exibicao === 'destaque_elemento'
  // (ver CampanhaForm.tsx) é reutilizado como texto do badge (ex. "Novo").
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
  // Fonte única de verdade do ciclo de vida (Fase 2 dos 3 status) — RASCUNHO
  // nunca foi publicada, ATIVA publicada e elegível, INATIVA já publicada e
  // desativada. "Agendada"/"Encerrada" NUNCA são status: são só uma leitura
  // de período (data_inicio/data_fim) calculada em cima de uma campanha
  // ATIVA — ver getStatus em pages/campanhas/campanhaForm.ts. O backend
  // ainda manda `ativo` (compat de deploy), mas nada no frontend lê mais
  // esse campo.
  status: CampanhaStatus
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
  // Fundação NPS/CSAT/utilidade_destaque (ver Feedback abaixo) — sempre
  // 'nps' por enquanto, nenhuma UI ainda escreve outro valor.
  tipo_avaliacao_feedback: string
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
  // Hostnames puros (sem protocolo/porta/path) — mesmo sistema rodando em
  // múltiplos domínios/subdomínios (ex.: QuarkClinic). Vazio = todos.
  segmentar_dominios: string[]
  criado_em: string
  atualizado_em: string
  _count?: { feedbacks: number }
  // Múltiplos destaques independentes (Fase 2 de destaque_elemento) — só
  // presente quando incluído pelo backend (buscarPorId/duplicar). Ausente
  // (undefined) não significa "sem destaques": ver rotina de fallback em
  // CampanhaForm.tsx (mesma lógica de destaqueElementoResolverItens em
  // widget.js) para campanhas antigas que ainda não têm nenhuma linha aqui.
  destaques?: CampanhaDestaqueItem[]
  // Etapa 7 — múltiplos conteúdos por campanha (carrossel SCROLL/SLIDES do
  // próprio modal). Mecanismo independente de `destaques`/destaque_elemento
  // acima — nunca misturar os dois. `modo_navegacao` sempre vem preenchido
  // pelo backend (default "SCROLL"); `conteudos` ausente/vazio não significa
  // "sem conteúdo": ver fallback em campanhaForm.utils.ts (hidratarFormState,
  // mesma lógica de conteudoResolverItens em widget.js) para campanhas
  // antigas que ainda não têm nenhuma linha aqui.
  modo_navegacao: string
  conteudos?: CampanhaConteudoItem[]
}

export interface CampanhaDestaqueItem {
  id: string
  campanha_id: string
  ordem: number
  data_cy: string
  texto_badge: string | null
  titulo: string
  descricao: string
  texto_botao: string | null
  url_botao: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

// Espelha CampanhaConteudoItem (server/prisma/schema.prisma) — sem `ativo`
// (decisão explícita da Etapa 1: "remover" um conteúdo é DELETE de verdade,
// nunca soft-delete, diferente de CampanhaDestaqueItem acima).
export interface CampanhaConteudoItem {
  id: string
  campanha_id: string
  ordem: number
  titulo: string
  descricao: string
  imagem_url: string | null
  video_url: string | null
  texto_botao: string | null
  url_botao: string | null
  criado_em: string
  atualizado_em: string
}

// Fundação NPS/CSAT/utilidade_destaque (ver server/prisma/schema.prisma).
// nota continua tipada como `number` (não `number | null`, embora a coluna
// no banco já seja opcional) porque este tipo hoje só reflete
// DashboardData.feedbacks_recentes, que o backend filtra por
// tipo_avaliacao === 'nps' (whereFeedbackNps em dashboard.ts) — nota nunca é
// null nesse conjunto. Isso muda no dia em que outro endpoint expuser
// Feedback de tipo csat/utilidade_destaque pro frontend.
export interface Feedback {
  id: string
  campanha_id: string
  tipo_avaliacao: string
  nota: number
  util: boolean | null
  destaque_item_id: string | null
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
  // Só presente pra eventos de destaque_elemento (Fase 3 de múltiplos
  // destaques) — null pros demais formatos e pra eventos legados
  // registrados antes desta fase existir.
  destaque_item_id: string | null
  sistema: string | null
  tela: string | null
  navegador: string | null
  dispositivo: string | null
  contexto: Record<string, string> | null
  criado_em: string
}

// Desempenho de 1 CampanhaDestaqueItem — inclui itens já removidos
// (ativo:false) pra preservar o histórico de eventos que apontam pra eles;
// o frontend usa `ativo` pra sinalizar "removido" em vez de escondê-los.
export interface DesempenhoDestaqueItem {
  destaque_item_id: string
  titulo: string
  ativo: boolean
  visualizacoes: number
  visualizacoes_unicas: number
  interacoes: number
  interacoes_unicas: number
  cliques_cta: number
  cliques_cta_unicos: number
  dispensas: number
  dispensas_unicas: number
  // Avaliações de utilidade ("Essa melhoria foi útil?") — avaliacoes sempre
  // = sim + nao. percentual_util é null (não 0) quando avaliacoes === 0.
  avaliacoes: number
  sim: number
  nao: number
  percentual_util: number | null
}

// Desempenho por conteúdo (CampanhaConteudoItem) — carrossel SCROLL/SLIDES do
// modal, mecanismo independente de DesempenhoDestaqueItem acima (nunca
// misturar os dois). V1 só cobre clique_cta: sem visualização por item, sem
// CTR por conteúdo. tem_cta = o conteúdo tem URL de CTA (o texto pode cair no
// default "Saiba mais"). Só não-vazio pra campanhas modo_exibicao !==
// 'destaque_elemento'; ver montarDesempenhoConteudos em
// server/src/controllers/dashboard.ts.
export interface DesempenhoConteudoItem {
  conteudo_item_id: string
  titulo: string
  ordem: number
  tem_cta: boolean
  cliques_cta: number
  cliques_cta_unicos: number
}

// Uma avaliação de utilidade de destaque ("Essa melhoria foi útil?") —
// sempre Feedback com tipo_avaliacao='utilidade_destaque' no backend, nunca
// misturado com NPS/CSAT (ver Feedback abaixo, que continua exclusivo de
// nps/csat neste frontend). nota nunca se aplica aqui (por isso nem entra
// no tipo); util é sempre true/false pra uma avaliação de verdade.
export interface AvaliacaoDestaqueItem {
  id: string
  destaque_item_id: string | null
  util: boolean | null
  observacao: string | null
  usuario_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  contexto: Record<string, string> | null
  criado_em: string
}

export interface DashboardData {
  campanha: Campanha
  periodo: { inicio: string | null; fim: string | null }
  comparacao: {
    visualizacoes: number
    respostas: number
    cliques_cta: number
    nps: number | null
    media: number | null
  } | null
  serie_diaria: Array<{ data: string; visualizacoes: number; respostas: number; cliques_cta: number }>
  serie_diaria_anterior: Array<{ data: string; visualizacoes: number; respostas: number; cliques_cta: number }>
  media: number | null
  total: number
  total_periodo: number
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
  // Só não-vazio pra campanhas modo_exibicao === 'destaque_elemento'.
  desempenho_destaques: DesempenhoDestaqueItem[]
  destaque_resumo_periodo: {
    interacoes: number
    dispensas: number
    avaliacoes: number
    sim: number
  }
  // Só não-vazio pra campanhas modo_exibicao !== 'destaque_elemento'.
  desempenho_conteudos: DesempenhoConteudoItem[]
  // Cliques no CTA sem conteúdo identificado (eventos antigos, fallback
  // legado do widget, ou conteúdo já removido). 0 pra destaque_elemento.
  cliques_cta_sem_conteudo: number
  quotes_nps: Feedback[]
  // Idem — só não-vazio pra campanhas modo_exibicao === 'destaque_elemento'.
  avaliacoes_destaques: AvaliacaoDestaqueItem[]
  avaliacoes_total: number
  avaliacoes_page: number
  avaliacoes_per_page: number
  respostas_page: number
  respostas_per_page: number
  eventos_total: number
  eventos_page: number
  eventos_per_page: number
  serie_impressao: Array<{ data: string; visualizacoes: number }>
  serie_impressao_anterior: Array<{ data: string; visualizacoes: number }>
  atividade_semana: Array<{ dia: number; visualizacoes: number }>
}

export interface TelaCatalogo {
  id: string
  sistema_id: string
  nome: string
  sistema: string
  sistemaConfig?: Sistema
  categoria: string
  modo_identificacao: string
  tela: string | null
  url_contem: string | null
  data_cy: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface Sistema {
  id: string
  nome: string
  slug: string
  descricao: string | null
  identificador: string
  url_base: string | null
  ativo: boolean
  padrao: boolean
  // Hostnames puros (sem protocolo/porta/path) onde este sistema roda — ex.:
  // QuarkClinic em vários subdomínios. Alimenta o multi-select de domínio em
  // Campanha/TourGuiado/Jornada; vazio = nenhum domínio cadastrado ainda.
  dominios: string[]
  criado_em: string
  atualizado_em: string
  _count?: { telas: number; aparencias: number }
}

export interface AparenciaWidget {
  id?: string
  sistema_id?: string | null
  sistema: string | null
  cor_principal: string | null
  logo_url: string | null
  criado_em?: string
  atualizado_em?: string
}

// Status persistido no backend (server/prisma/schema.prisma, enum
// CampanhaStatus) — nunca confundir com StatusCampanha abaixo, que é só uma
// lente de EXIBIÇÃO derivada disto + período (ver getStatus).
export type CampanhaStatus = 'RASCUNHO' | 'ATIVA' | 'INATIVA'

// Status de EXIBIÇÃO — 'rascunho'/'inativa' espelham 1:1 o status
// persistido; 'agendada'/'ativa'/'encerrada' só existem para uma campanha
// ATIVA e vêm da janela de período (data_inicio/data_fim), nunca são
// persistidos à parte. Ver getStatus em pages/campanhas/campanhaForm.ts.
export type StatusCampanha = 'rascunho' | 'ativa' | 'inativa' | 'agendada' | 'encerrada'

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
  | 'tela' | 'sistema' | 'dominio'

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
  tour?: { id: string; titulo: string; slug: string; ativo?: boolean; passos?: TourPasso[] } | null
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
  // Hostnames puros (sem protocolo/porta/path) — mesmo sistema rodando em
  // múltiplos domínios/subdomínios. Vazio = todos.
  segmentar_dominios: string[]
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
    nome_interno: string
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

// Mesmos 6 valores de SituacaoComercialTenant em
// server/src/lib/tenantGuards.ts (obterSituacaoComercialTenant) — já vem
// calculada em /auth/me, o front nunca recalcula essa regra (que é a mesma
// que decide bloqueio de escrita no backend), só decide como avisar em
// cima do valor (ver AvisoComercial.tsx).
export type SituacaoComercialTenant =
  | 'trial_ativo'
  | 'trial_vencido'
  | 'licenca_ativa'
  | 'licenca_vencida'
  | 'suspenso'
  | 'cancelado'

// Fase 6B — resposta pública de GET /auth/cadastro/config (ver
// server/src/controllers/auth.ts, cadastroConfig). Só o necessário pra
// montar a UX de /cadastro: nenhum id de plano, preço ou campo
// administrativo — nunca hardcodar estes valores no frontend.
export interface CadastroConfig {
  dias: number
  limite_campanhas_ativas: number | null
  limite_tours_ativos: number | null
  limite_jornadas_ativas: number | null
}

export interface PlanoResumo {
  id: string
  nome: string
  slug: string
  permite_tours: boolean
  permite_jornadas: boolean
  permite_white_label: boolean
  limite_campanhas_ativas: number | null
  limite_tours_ativos: number | null
  // Fase 6A (fundação do trial) — mesma convenção dos dois limites acima
  // (null = sem limite), agora pra jornadas.
  limite_jornadas_ativas: number | null
  limite_eventos_mes: number | null
  limite_usuarios_admin: number | null
  // Fase 6E — mesmo sinal usado pelo backend (checarLimite*Ativas em
  // server/src/lib/tenantGuards.ts) pra decidir se o limite conta TOTAL
  // cadastrado (trial) ou só ativos (pago) — nunca inferir isso a partir de
  // tenant.status/situacao_comercial no front (podem divergir, ver
  // server/src/controllers/auth.ts).
  eh_plano_trial: boolean
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
  licenca_fim: string | null
  situacao_comercial: SituacaoComercialTenant
  // Fase 6C — dias restantes de trial, já calculado pelo backend a partir
  // de trial_fim (ver server/src/lib/tenantGuards.ts, diasRestantesTrial) —
  // nunca recalcular esta conta no frontend. null quando trial_fim é null.
  trial_dias_restantes: number | null
  // Fase 7 — dias restantes da tolerância de inadimplência (assinatura paga
  // vencida), já calculado pelo backend a partir de licenca_fim (ver
  // diasRestantesTolerancia em tenantGuards.ts) — nunca recalcular no
  // frontend. null quando situacao_comercial não é 'licenca_vencida'.
  tolerancia_dias_restantes: number | null
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
  // Fase 4 de permissões personalizadas (ver server/src/controllers/auth.ts,
  // usuarioPublico) — permissoes_efetivas já vem calculada pelo backend
  // (mesma nivelAcessoEfetivo que autoriza de verdade nas rotas, ver
  // server/src/lib/permissoesModulo.ts); o front nunca recalcula essa regra
  // sozinho, só lê o valor (ver utils/permissoesEfetivas.ts). Presente pros
  // 4 módulos personalizáveis sempre, com ou sem permissoes_personalizadas.
  permissoes_personalizadas: boolean
  permissoes_efetivas: Record<ModuloPainel, NivelAcessoModulo>
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
  // Fase 6A (fundação do trial) — mesma convenção de limite_campanhas_ativas/
  // limite_tours_ativos (null = sem limite), agora pra jornadas (ver
  // checarLimiteJornadasAtivas em server/src/lib/tenantGuards.ts).
  limite_jornadas_ativas: number | null
  limite_eventos_mes: number | null
  limite_usuarios_admin: number | null
  permite_tours: boolean
  permite_jornadas: boolean
  permite_white_label: boolean
  ativo: boolean
  // Plano interno (hoje só "Interno (Quark)") — nunca oferecido no select
  // de plano do Cliente, nunca removível (ver server/src/controllers/
  // adminPlanos.ts, remover()).
  interno: boolean
  // Fase 8B — hierarquia explícita entre planos comerciais (upgrade/
  // downgrade), nunca inferida por preço. Obrigatório quando interno=false,
  // sempre null pra planos internos (ver validarCamposPlano em
  // server/src/controllers/adminPlanos.ts).
  nivel: number | null
  // Fase 6A (fundação do trial) — marca o plano usado como fonte de limites/
  // duração do cadastro self-service (ainda não implementado). Deve haver
  // exatamente 1 plano com eh_plano_trial=true (ver resolverPlanoTrial em
  // server/src/lib/tenantGuards.ts); trial_dias null usa o default de 14.
  eh_plano_trial: boolean
  trial_dias: number | null
  // Config da assinatura Asaas correspondente (fundação/sandbox, ver
  // server/src/services/asaasClient.ts). asaas_subscription_value serializa
  // como string via JSON (Prisma.Decimal.toJSON()), mesmo padrão de
  // preco_mensal acima.
  asaas_external_reference: string | null
  asaas_subscription_value: string | null
  asaas_billing_cycle: string | null
  criado_em: string
  atualizado_em: string
}

export interface AdminDoTenant {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  // Fase 1/3 de permissões personalizadas por usuário — ver
  // server/src/lib/permissoesModulo.ts e components/admin/PermissoesUsuarioModal.tsx.
  // true = permissões por módulo são autoritativas pra este usuário (a role
  // deixa de decidir sozinha); false = comportamento normal da role.
  permissoes_personalizadas: boolean
  criado_em: string
  atualizado_em: string
}

// Gestão de usuários self-service (ver server/src/controllers/usuarios.ts,
// montado em /api/usuarios) — ADMIN do próprio tenant convida/edita/remove
// acessos sem depender do SUPER_ADMIN. usuarios reaproveita o mesmo recorte
// de AdminDoTenant acima (mesmos campos devolvidos pelo backend); convites
// lista os REENVIÁVEIS (aceito_em/cancelado_em null, inclusive expirados —
// ver condicaoConviteReenviavel em server/src/lib/convites.ts) — `expirado`
// distingue os dois pra UI oferecer "Reenviar"; capacidade.usados conta
// ativos + convites PENDENTES (não expirados — ver contarUsoAcessos em
// tenantGuards.ts) — limite null = sem limite, mesma convenção do resto do
// projeto.
export interface ConvitePendente {
  id: string
  email: string
  role: AdminRole
  criado_em: string
  expires_at: string
  convidado_por_nome: string | null
  expirado: boolean
}

export interface UsuariosResposta {
  usuarios: AdminDoTenant[]
  convites: ConvitePendente[]
  capacidade: { usados: number; limite: number | null }
}

// Resposta de POST /usuarios/convites.
export interface ConviteCriado {
  id: string
  email: string
  role: AdminRole
  criado_em: string
  expires_at: string
}

// Resposta de GET /auth/convite/:token (tela pública /convite/:token, ver
// pages/AceitarConvite.tsx) — recorte mínimo, nunca id/tenant_id/token.
export interface ConviteInfo {
  tenantNome: string
  email: string
  role: AdminRole
}

// Fase 1/3 de permissões personalizadas por usuário — mesmos enums de
// server/prisma/schema.prisma (ModuloPainel/NivelAcessoModulo). Billing/
// Minha Assinatura nunca entra aqui (fica fora de CONFIGURACOES de
// propósito, ver server/src/routes/billing.ts).
export type ModuloPainel = 'CAMPANHAS' | 'TOURS' | 'JORNADAS' | 'CONFIGURACOES'
export type NivelAcessoModulo = 'NENHUM' | 'VISUALIZAR' | 'GERENCIAR'

// Resposta de GET/PUT/DELETE .../admins/:adminId/permissoes (ver
// server/src/controllers/adminTenantsPermissoes.ts, montarRespostaPermissoes).
// permissoes_efetivas reflete o que vale DE FATO agora (role OU matriz,
// dependendo de permissoes_personalizadas); permissoes_personalizadas_salvas
// mostra a matriz gravada mesmo quando a flag está desligada (null = módulo
// sem linha salva) — é o que permite reativar sem perder a configuração
// anterior (ver formularioInicialDePermissoes em utils/permissoesUsuario.ts).
export interface PermissoesUsuario {
  role: AdminRole
  permissoes_personalizadas: boolean
  permissoes_efetivas: Record<ModuloPainel, NivelAcessoModulo>
  permissoes_personalizadas_salvas: Record<ModuloPainel, NivelAcessoModulo | null>
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
  // Fase 6A (fundação do trial) — plano escolhido ao converter/trocar de
  // plano, ainda não pago (aplicado em plano_id só quando o webhook Asaas
  // confirmar o pagamento — ver server/prisma/schema.prisma). Nenhuma rota
  // desta fase escreve este campo ainda, sempre null na prática.
  plano_pendente_id: string | null
  // Vínculo com o Asaas (fundação/sandbox) — ver GET /admin/tenants/:id/asaas
  // e server/src/services/asaasClient.ts. asaas_status é só espelho pra
  // exibição, nunca usado no frontend pra decidir nada.
  asaas_customer_id: string | null
  asaas_subscription_id: string | null
  asaas_status: string | null
  asaas_ultima_sincronizacao: string | null
  criado_em: string
  atualizado_em: string
  _count: { admins: number }
}

// Dados de cobrança (Fase 2) — só alcançáveis dentro de Gestão SaaS
// (SUPER_ADMIN); nunca fazem parte de AdminUser/TenantResumo (o recorte
// devolvido em /auth/me pro próprio tenant logado, ver server/src/
// controllers/auth.ts). billing_cpf_cnpj é dado sensível, mas só exibido
// aqui, dentro do modal Cobrança Asaas.
export interface DadosCobrancaTenant {
  billing_nome_responsavel: string | null
  billing_email: string | null
  billing_cpf_cnpj: string | null
  billing_telefone: string | null
  billing_endereco: string | null
  billing_numero: string | null
  billing_complemento: string | null
  billing_bairro: string | null
  billing_cidade: string | null
  billing_estado: string | null
  billing_cep: string | null
}

export interface AsaasVinculoTenant extends DadosCobrancaTenant {
  asaas_customer_id: string | null
  asaas_subscription_id: string | null
  asaas_status: string | null
  asaas_ultima_sincronizacao: string | null
}

// Resposta de PUT .../asaas/billing — mesmos campos de AsaasVinculoTenant
// (menos os asaas_*, que esse endpoint não altera) mais o resultado
// best-effort da sincronização com o Asaas, se já existir customer vinculado.
export interface AtualizarCobrancaResposta extends DadosCobrancaTenant {
  asaas_sync_erro: string | null
}

// Um item do histórico de webhooks Asaas (ver GET .../asaas/events) — mesmo
// recorte do model AsaasWebhookEvent, sem o payload bruto nem o id interno
// (só o necessário pra listar no painel).
export interface AsaasEventoTenant {
  asaas_event_id: string | null
  evento: string
  payment_id: string | null
  subscription_id: string | null
  customer_id: string | null
  processado: boolean
  erro: string | null
  criado_em: string
  processado_em: string | null
}

// Uma cobrança da assinatura Asaas (Fase 3, ver GET .../asaas/payments) —
// já o recorte normalizado pelo backend (normalizarCobranca em
// adminTenantsAsaas.ts), nunca o objeto bruto do Asaas.
export interface CobrancaResumo {
  id: string
  status: string
  value: number
  dueDate: string
  paymentDate: string | null
  invoiceUrl: string | null
  billingType: string | null
  description: string | null
}

// Resposta de GET .../asaas/payments — hasMore indica cobranças além das
// retornadas (limite fixo no backend, sem paginação real nesta fase).
export interface CobrancasAsaasResposta {
  cobrancas: CobrancaResumo[]
  hasMore: boolean
}

// Fase 4 — diagnóstico de billing, read-only (ver GET .../asaas/diagnostico
// e calcularSituacaoAsaas em server/src/services/asaasClient.ts). Nunca
// altera Tenant.status/licença/plano — só exibição.
export type SituacaoAsaasDecisao = 'OK' | 'INADIMPLENTE' | 'ASSINATURA_INATIVA' | 'INDETERMINADO'

export interface DiagnosticoAsaasResposta {
  decisao: SituacaoAsaasDecisao
  motivo: string
  statusAssinatura: string | null
  quantidadeCobrancasVencidas: number
  consultadoEm: string
}

// Fase 5 — "Minha assinatura" self-service (ver GET /api/billing/situacao e
// controllers/billing.ts). Reaproveita o SituacaoComercialTenant já
// declarado acima (mesmo tipo que /auth/me devolve em tenant.situacao_comercial,
// ver AdminUser/AvisoComercial.tsx) — não duplicar.

// Correção de produto — billingType da cobrança em si (pode divergir da
// forma padrão da assinatura, ver SituacaoBillingResposta.formaPagamentoAssinatura
// abaixo). null quando o Asaas não devolveu o campo.
export type FormaPagamentoAsaas = 'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'UNDEFINED'

// Correção de produto — deixou de ser só "vencidas" (OVERDUE): agora inclui
// também PENDING (ainda dentro do vencimento), pra o cliente poder trocar a
// forma de pagamento de uma cobrança ANTES dela vencer, sem precisar ficar
// inadimplente primeiro. Nunca inclui cobrança avulsa (sem subscription,
// ver criarCobrancaAvulsaAsaas no upgrade) nem já paga (RECEIVED/CONFIRMED)
// — só o que ainda pode ser alterado (ver obterSituacao em
// controllers/billing.ts).
export type StatusCobrancaEmAberto = 'PENDING' | 'OVERDUE'

export interface CobrancaEmAbertoResumo {
  id: string
  value: number
  dueDate: string
  status: StatusCobrancaEmAberto
  billingType: FormaPagamentoAsaas | null
  invoiceUrl: string | null
}

// Nunca inclui asaas_customer_id/asaas_subscription_id — o cliente final não
// precisa desses IDs técnicos (ver regra da tarefa em obterSituacao,
// controllers/billing.ts). possuiAssinatura (booleano, não um ID) é o que
// decide se a UI oferece "Assinar" ou "Reativar"/cobranças vencidas.
export interface SituacaoBillingResposta {
  possuiAssinatura: boolean
  // id/nivel entraram na Fase 8B — nivel é a hierarquia EXPLÍCITA (nunca
  // preço, ver compararNivelPlanos no backend) usada pra classificar cada
  // plano de PlanoContratavel como upgrade/downgrade/sem troca.
  plano: { id: string; nome: string; nivel: number | null; valor: string | number | null; ciclo: string | null } | null
  // Fase 6B — presente só entre a escolha de um plano pago (POST
  // /billing/assinatura) e a confirmação do pagamento pelo webhook Asaas.
  // Nesse intervalo, `plano` acima continua sendo o plano ATUAL (ex.:
  // teste-gratis) — nunca troca antes da confirmação (ver plano_pendente_id
  // em server/prisma/schema.prisma).
  planoPendente: { nome: string; valor: string | number | null; ciclo: string | null } | null
  // Fase 8B — downgrade agendado, só presente quando o backend confirma
  // AGENDAMENTO COMPLETO (nunca um claim técnico incompleto em andamento,
  // ver downgradeAgendamentoCompleto/obterSituacao em controllers/billing.ts).
  // valorDestino é sempre o snapshot combinado no agendamento (downgrade_valor_destino),
  // nunca o preço atual de catálogo do plano futuro.
  downgradeAgendado: { plano: { id: string; nome: string }; efetivarEm: string; valorDestino: string | number | null } | null
  // Correção pós-homologação — planoPendente sozinho não distingue upgrade
  // (Fase 8A, cancelável via DELETE /billing/upgrade) de uma primeira
  // assinatura ainda não paga (nunca cancelável por essa rota). Só true
  // quando existe cobrança avulsa própria pra cancelar — nunca expõe o
  // payment id em si (ver obterSituacao em controllers/billing.ts).
  upgradePendenteCancelavel: boolean
  situacaoComercial: SituacaoComercialTenant
  situacaoAsaas: SituacaoAsaasDecisao
  motivoSituacaoAsaas: string
  proximaCobranca: string | null
  // Forma de pagamento PADRÃO da assinatura (rege as próximas renovações) —
  // nunca confundir com CobrancaEmAbertoResumo.billingType (de uma cobrança
  // específica, pode ter sido trocado pontualmente, ver POST
  // /billing/cobrancas/:id/pagar). null quando não há assinatura vinculada.
  formaPagamentoAssinatura: FormaPagamentoAsaas | null
  // Ordenadas por vencimento (mais próxima primeiro) — nunca presume qual é
  // "a cobrança do mês atual" quando há mais de uma PENDING.
  cobrancasEmAberto: CobrancaEmAbertoResumo[]
}

// Fase 6B — GET /billing/planos-disponiveis. Só planos comerciais
// contratáveis (nunca interno, nunca o de trial) — ver
// listarPlanosDisponiveis em controllers/billing.ts. valor/ciclo são o que
// é REALMENTE cobrado (asaas_subscription_value/asaas_billing_cycle), não
// preco_mensal (só informativo).
export interface PlanoContratavel {
  id: string
  nome: string
  descricao: string | null
  // Fase 8B — hierarquia EXPLÍCITA (nunca inferida por preço, ver
  // compararNivelPlanos no backend). null (plano sem nivel configurado)
  // nunca oferece troca self-service, nem upgrade nem downgrade.
  nivel: number | null
  valor: string | number | null
  ciclo: string | null
  limite_campanhas_ativas: number | null
  limite_tours_ativos: number | null
  limite_jornadas_ativas: number | null
  permite_tours: boolean
  permite_jornadas: boolean
  permite_white_label: boolean
}

export interface AssinaturaSelfServiceResposta {
  cobrancaDisponivel: boolean
  invoiceUrl: string | null
}

export interface PagarCobrancaResposta {
  invoiceUrl: string | null
}

// Fase 8A — upgrade self-service pra plano superior (tenant já pago). Nunca
// inclui preço calculado pelo frontend — valorProporcional/planoNovo.valor
// vêm sempre do backend (ver GET /billing/upgrade/preview e POST
// /billing/upgrade em controllers/billing.ts, validarECalcularUpgrade).
interface PlanoResumoUpgrade {
  id: string
  nome: string
  valor: string | number | null
  ciclo: string | null
}

// GET /billing/upgrade/preview — sem efeito colateral nenhum (nunca chama o
// Asaas, nunca escreve no banco), só pra mostrar o resumo antes de
// confirmar (plano atual, plano novo, valor proporcional do restante do
// ciclo, próximo ciclo com valor integral).
export interface UpgradePreviewResposta {
  planoAtual: PlanoResumoUpgrade | null
  planoNovo: PlanoResumoUpgrade
  valorProporcional: number
  diasRestantesCiclo: number
  cicloDias: number
}

// POST /billing/upgrade — mesmos campos da prévia, mais o link de
// pagamento da cobrança proporcional avulsa recém-criada. plano_id nunca é
// aplicado aqui: fica em plano_pendente_id até o webhook confirmar (ver
// SituacaoBillingResposta.planoPendente acima, reaproveitado tanto pro
// fluxo de contratação quanto pro de upgrade).
export interface UpgradeSolicitadoResposta {
  valorProporcional: number
  diasRestantesCiclo: number
  cicloDias: number
  invoiceUrl: string | null
  planoNovo: PlanoResumoUpgrade
}

// Fase 8B — downgrade agendado (efetivação só na data, via scheduler
// interno do backend — nunca imediata). Mesmo recorte mínimo do upgrade:
// nenhum id financeiro/técnico do claim, nenhum preço calculado aqui.
interface PlanoResumoDowngrade {
  id: string
  nome: string
}

export interface RecursoIncompativelDowngrade {
  recurso: string
  usoAtual: number
  limiteDestino: number
  excedente: number
}

// Só as 3 situações que o backend já distingue (identificarCobrancaProximoCiclo) —
// "ambigua"/"identificada com status != PENDING/OVERDUE" já vêm refletidas
// em podeSolicitar=false, o frontend nunca decide isso sozinho.
export type CobrancaProximoCicloDowngrade =
  | { situacao: 'identificada'; status: string; value: number; dueDate: string }
  | { situacao: 'ambigua'; quantidade: number }
  | { situacao: 'nao_encontrada' }

// GET /billing/downgrade/preview — sem efeito colateral nenhum (nunca
// chama o Asaas, nunca escreve no banco), mesmo padrão de
// UpgradePreviewResposta. valorAtualContratado vem do Asaas ao vivo;
// valorDestino do catálogo atual do plano escolhido (o valor só vira
// snapshot definitivo depois de POST /billing/downgrade confirmar — até
// lá, o preview sempre reflete o catálogo de agora). podeSolicitar já
// resume limites/cobrança anterior/cobrança ambígua — o frontend nunca
// recalcula essa decisão, só exibe.
export interface DowngradePreviewResposta {
  planoAtual: PlanoResumoDowngrade | null
  planoDestino: PlanoResumoDowngrade
  valorAtualContratado: number
  valorDestino: string | number | null
  efetivarEm: string
  limites: { compativel: boolean; detalhes: RecursoIncompativelDowngrade[] }
  cobrancaAnteriorBloqueio: string | null
  cobrancaProximoCiclo: CobrancaProximoCicloDowngrade
  podeSolicitar: boolean
}

// POST /billing/downgrade — nunca cria cobrança nem redireciona a lugar
// nenhum (diferente do upgrade): só agenda. valorDestino aqui já É o
// snapshot que vai reger a troca (congelado no claim), mesmo que o
// catálogo mude depois — ver bug corrigido em asaasClient.ts/billing.ts.
export interface DowngradeSolicitadoResposta {
  planoAtual: PlanoResumoDowngrade | null
  planoDestino: PlanoResumoDowngrade
  valorAtualContratado: number
  valorDestino: number
  efetivarEm: string
  downgradeAgendado: true
}

export interface TenantAdminDetail extends Omit<TenantAdminItem, '_count'> {
  admins: AdminDoTenant[]
}
