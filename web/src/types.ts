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
  criado_em: string
  atualizado_em: string
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
  criado_em: string
  atualizado_em: string
  passos?: TourPasso[]
  _count?: { passos: number }
}

export interface TourExportPasso {
  titulo: string
  descricao: string | null
  seletor_tipo: string
  seletor: string
  tooltip_posicao: string
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

export interface TourDashboardData {
  tour: TourGuiado
  iniciados: number
  concluidos: number
  pulados: number
  elementos_nao_encontrados: number
  taxa_conclusao: number
  eventos_recentes: EventoTourDashboard[]
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
