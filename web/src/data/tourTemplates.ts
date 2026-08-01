export interface TourTemplatePasso {
  titulo: string
  descricao: string
  tooltip_posicao: string
}

export interface TourTemplate {
  id: string
  nome: string
  descricao: string
  icon: string
  titulo_sugerido: string
  descricao_sugerida: string
  passos: TourTemplatePasso[]
}

// Modelos de tour guiado para acelerar o cadastro. Só preenchem título,
// descrição e passos base (com posição de tooltip sugerida) — seletor e
// tipo de seletor ficam em branco, pois dependem da tela real do sistema
// hospedeiro e precisam ser preenchidos/editados pelo usuário.
export const TOUR_TEMPLATES: TourTemplate[] = [
  {
    id: 'nova-funcionalidade',
    nome: 'Nova funcionalidade',
    descricao: 'Apresente um recurso recém-lançado e mostre como usá-lo pela primeira vez.',
    icon: 'auto_awesome',
    titulo_sugerido: 'Conheça a nova funcionalidade',
    descricao_sugerida: 'Tour rápido para apresentar o novo recurso e mostrar como começar a usá-lo.',
    passos: [
      { titulo: 'Aqui está a novidade', descricao: 'Destaque o botão, menu ou área onde a nova funcionalidade aparece.', tooltip_posicao: 'bottom' },
      { titulo: 'Para que serve', descricao: 'Explique em poucas palavras o problema que essa funcionalidade resolve.', tooltip_posicao: 'auto' },
      { titulo: 'Experimente agora', descricao: 'Convide o usuário a clicar e testar a funcionalidade pela primeira vez.', tooltip_posicao: 'auto' },
      { titulo: 'Pronto!', descricao: 'Finalize indicando onde encontrar mais informações ou ajuda, se precisar.', tooltip_posicao: 'top' },
    ],
  },
  {
    id: 'primeiro-acesso',
    nome: 'Primeiro acesso',
    descricao: 'Dê as boas-vindas a um novo usuário e apresente a navegação principal do sistema.',
    icon: 'waving_hand',
    titulo_sugerido: 'Bem-vindo! Vamos te mostrar o sistema',
    descricao_sugerida: 'Tour de boas-vindas para novos usuários conhecerem as principais áreas do sistema.',
    passos: [
      { titulo: 'Bem-vindo(a)!', descricao: 'Dê as boas-vindas e explique o que o usuário vai aprender neste tour.', tooltip_posicao: 'auto' },
      { titulo: 'Menu principal', descricao: 'Mostre onde fica a navegação principal e como acessar as demais áreas.', tooltip_posicao: 'right' },
      { titulo: 'Área mais usada', descricao: 'Destaque a funcionalidade ou tela que o usuário provavelmente vai usar primeiro.', tooltip_posicao: 'auto' },
      { titulo: 'Seu perfil', descricao: 'Mostre onde editar os dados da conta e as preferências.', tooltip_posicao: 'bottom' },
      { titulo: 'Precisa de ajuda?', descricao: 'Indique onde encontrar suporte, documentação ou este tour novamente.', tooltip_posicao: 'top' },
    ],
  },
  {
    id: 'fluxo-operacional',
    nome: 'Fluxo operacional',
    descricao: 'Guie o usuário passo a passo por uma tarefa do dia a dia, do início ao fim.',
    icon: 'checklist',
    titulo_sugerido: 'Como concluir esta tarefa',
    descricao_sugerida: 'Passo a passo de um fluxo operacional comum, do início até a conclusão.',
    passos: [
      { titulo: 'Onde começar', descricao: 'Mostre o botão ou link que dá início ao fluxo.', tooltip_posicao: 'bottom' },
      { titulo: 'Preencha os dados', descricao: 'Destaque o campo ou formulário que precisa ser preenchido.', tooltip_posicao: 'auto' },
      { titulo: 'Confirme a ação', descricao: 'Mostre o botão de confirmar, salvar ou avançar.', tooltip_posicao: 'auto' },
      { titulo: 'Tarefa concluída', descricao: 'Indique onde o usuário confirma que a tarefa foi concluída com sucesso.', tooltip_posicao: 'top' },
    ],
  },
  {
    id: 'configuracao',
    nome: 'Configuração',
    descricao: 'Explique uma tela de configurações e as opções mais importantes.',
    icon: 'settings',
    titulo_sugerido: 'Configurando o sistema',
    descricao_sugerida: 'Tour pela tela de configurações, destacando as opções mais importantes.',
    passos: [
      { titulo: 'Acesse as configurações', descricao: 'Mostre onde encontrar a tela de configurações.', tooltip_posicao: 'bottom' },
      { titulo: 'Principais opções', descricao: 'Destaque a seção ou aba mais importante para o usuário revisar.', tooltip_posicao: 'auto' },
      { titulo: 'Ajuste conforme necessário', descricao: 'Mostre um campo ou opção que costuma precisar de ajuste.', tooltip_posicao: 'auto' },
      { titulo: 'Salve as alterações', descricao: 'Indique o botão de salvar e reforce que é preciso confirmar as mudanças.', tooltip_posicao: 'top' },
    ],
  },
]
