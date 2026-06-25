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
  intervalo_reexibicao_dias: number | null
  categoria: string | null
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
}

export type StatusCampanha = 'ativa' | 'inativa' | 'agendada' | 'encerrada'
