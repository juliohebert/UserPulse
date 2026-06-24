export interface CampanhaTemplate {
  id: string
  label: string
  icon: string
  descricaoBreve: string
  fields: {
    tipo: string
    titulo: string
    subtitulo: string
    descricao: string
    texto_botao: string
    url_botao: string
    pergunta_feedback: string
    feedback_habilitado: boolean
    categoria: string
  }
}

export const TEMPLATES: CampanhaTemplate[] = [
  {
    id: 'novidade',
    label: 'Novidade',
    icon: 'new_releases',
    descricaoBreve: 'Anuncie um novo recurso',
    fields: {
      tipo: 'comunicado',
      titulo: 'Novidade: [recurso] já disponível',
      subtitulo: 'Confira o que chegou de novo para você',
      descricao:
        'Temos uma novidade que vai facilitar o seu dia a dia!\n\nAgora você pode [descreva o recurso]. Acesse agora mesmo e explore todas as possibilidades.',
      texto_botao: 'Conhecer agora',
      url_botao: '',
      pergunta_feedback: 'O que você achou dessa novidade?',
      feedback_habilitado: true,
      categoria: 'Novidade',
    },
  },
  {
    id: 'release_note',
    label: 'Release Note',
    icon: 'update',
    descricaoBreve: 'Detalhe melhorias da versão',
    fields: {
      tipo: 'melhoria',
      titulo: 'Atualização v[x.x] — Confira as melhorias',
      subtitulo: 'Veja o que foi corrigido e aprimorado',
      descricao:
        'Lançamos uma nova versão com melhorias importantes:\n\n• [Melhoria 1]\n• [Melhoria 2]\n• [Correção de bug]\n\nObrigado pelo feedback que tornou tudo isso possível.',
      texto_botao: 'Ver release notes',
      url_botao: '',
      pergunta_feedback: 'Essa atualização atendeu suas expectativas?',
      feedback_habilitado: true,
      categoria: 'Melhoria',
    },
  },
  {
    id: 'comunicado',
    label: 'Comunicado',
    icon: 'campaign',
    descricaoBreve: 'Informe toda a base',
    fields: {
      tipo: 'comunicado',
      titulo: 'Comunicado importante',
      subtitulo: 'Informação para todos os usuários',
      descricao:
        'Gostaríamos de informar que [descreva o comunicado].\n\nEsta mudança entra em vigor em [data]. Em caso de dúvidas, entre em contato com o suporte.',
      texto_botao: '',
      url_botao: '',
      pergunta_feedback: 'Você entendeu este comunicado?',
      feedback_habilitado: false,
      categoria: 'Comunicado',
    },
  },
  {
    id: 'treinamento',
    label: 'Treinamento',
    icon: 'school',
    descricaoBreve: 'Capacite seus usuários',
    fields: {
      tipo: 'comunicado',
      titulo: 'Treinamento: aprenda a usar [recurso]',
      subtitulo: 'Material disponível para toda a equipe',
      descricao:
        'Preparamos um treinamento completo sobre [recurso].\n\nEm poucos minutos você estará pronto para aproveitar ao máximo. Acesse o material e tire suas dúvidas com a equipe.',
      texto_botao: 'Acessar treinamento',
      url_botao: '',
      pergunta_feedback: 'O treinamento foi útil para você?',
      feedback_habilitado: true,
      categoria: 'Treinamento',
    },
  },
  {
    id: 'pesquisa',
    label: 'Pesquisa',
    icon: 'quiz',
    descricaoBreve: 'Colete feedback estruturado',
    fields: {
      tipo: 'pesquisa',
      titulo: 'Sua opinião é importante',
      subtitulo: 'Responda nossa pesquisa rápida',
      descricao:
        'Queremos entender melhor a sua experiência. Esta pesquisa leva menos de 1 minuto e nos ajuda a melhorar continuamente.',
      texto_botao: '',
      url_botao: '',
      pergunta_feedback: 'Como você avalia sua experiência com o sistema?',
      feedback_habilitado: true,
      categoria: 'Pesquisa',
    },
  },
]
