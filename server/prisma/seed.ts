import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type CampanhaSeed = {
  slug: string
  nome_interno: string
  titulo: string
  subtitulo?: string
  descricao: string
  tipo: string
  sistema: string
  tela: string
  texto_botao?: string
  url_botao?: string
  prioridade: number
  ativo: boolean
  feedback_habilitado?: boolean
  pergunta_feedback?: string
  exige_confirmacao_leitura?: boolean
  modo_exibicao?: string
  gatilho?: string
  modo_identificacao?: string
  url_contem?: string
}

type TourSeed = {
  slug: string
  titulo: string
  descricao: string
  sistema: string
  tela: string
  prioridade: number
  ativo: boolean
  passos: Array<{
    titulo: string
    descricao: string
    seletor_tipo: string
    seletor: string
    tooltip_posicao: string
  }>
}

type JornadaSeed = {
  slug: string
  titulo: string
  descricao: string
  ativo: boolean
  permitir_refazer?: boolean
  blocos: Array<{
    titulo: string
    descricao: string
    etapas: Array<{
      titulo: string
      descricao: string
      tipo: 'tour' | 'campanha' | 'link'
      refSlug?: string
      url?: string
      texto_cta?: string
    }>
  }>
}

type FeedbackSeed = {
  id: string
  campanhaSlug: string
  diasAtras: number
  nota: number
  observacao?: string
  usuario_id: string
  usuario_nome: string
  usuario_email: string
  sistema: string
  tela: string
  navegador: string
  dispositivo: string
  telefone_contato?: string
  contexto: Record<string, string>
}

type EventoCampanhaSeed = {
  id: string
  campanhaSlug: string
  diasAtras: number
  tipo_evento: string
  usuario_id: string
  sistema: string
  tela: string
  navegador: string
  dispositivo: string
  contexto: Record<string, string>
}

const campanhasSeed: CampanhaSeed[] = [
  {
    slug: 'quarkclinic-agenda-demo',
    nome_interno: 'QuarkClinic — novidades da agenda (demo)',
    titulo: 'Novidades do QuarkClinic',
    subtitulo: 'Confira o que chegou de novo na agenda',
    descricao:
      'Atualizamos a agenda com novas funcionalidades pensadas para o seu fluxo de trabalho:\n\n' +
      '• Confirmação automática de consultas\n' +
      '• Notificações por WhatsApp\n' +
      '• Relatório de ausências\n\n' +
      'Acesse e explore tudo que preparamos para você.',
    tipo: 'melhoria',
    sistema: 'QuarkClinic',
    tela: 'agenda',
    texto_botao: 'Ver novidades',
    url_botao: 'https://quarkclinic.com/novidades',
    prioridade: 1,
    ativo: true,
    pergunta_feedback: 'O que você achou das melhorias?',
  },
  {
    slug: 'quarkclinic-prontuario-novo',
    nome_interno: 'QuarkClinic — novo prontuário',
    titulo: 'Novo prontuário disponível',
    subtitulo: 'Registro clínico mais rápido e organizado',
    descricao: 'O prontuário ganhou uma experiência mais limpa para registrar evolução, anexos e condutas em menos cliques.',
    tipo: 'comunicado',
    sistema: 'QuarkClinic',
    tela: 'prontuario',
    texto_botao: 'Abrir prontuário',
    url_botao: '/app/prontuario',
    prioridade: 2,
    ativo: true,
    exige_confirmacao_leitura: true,
  },
  {
    slug: 'quarkclinic-pesquisa-atendimento',
    nome_interno: 'QuarkClinic — pesquisa de atendimento',
    titulo: 'Pesquisa rápida sobre atendimento',
    subtitulo: 'Ajude a melhorar o fluxo da recepção',
    descricao: 'Conte como está a experiência de atendimento e quais pontos podemos simplificar para sua equipe.',
    tipo: 'pesquisa',
    sistema: 'QuarkClinic',
    tela: 'atendimento',
    prioridade: 0,
    ativo: true,
    pergunta_feedback: 'Como você avalia o fluxo atual?',
  },
  {
    slug: 'quarkclinic-faturamento-recursos',
    nome_interno: 'QuarkClinic — recursos de faturamento',
    titulo: 'Melhorias no faturamento',
    subtitulo: 'Conciliação e repasses em destaque',
    descricao: 'Agora a tela de faturamento traz filtros por convênio, status de repasse e período de competência.',
    tipo: 'melhoria',
    sistema: 'QuarkClinic',
    tela: 'faturamento',
    texto_botao: 'Conhecer recursos',
    url_botao: '/app/faturamento',
    prioridade: 1,
    ativo: true,
  },
  {
    slug: 'quarkclinic-estoque-alerta',
    nome_interno: 'QuarkClinic — alerta de estoque mínimo',
    titulo: 'Alerta de estoque mínimo',
    subtitulo: 'Evite falta de materiais críticos',
    descricao: 'Configure alertas para materiais, medicamentos e insumos que exigem reposição antecipada.',
    tipo: 'comunicado',
    sistema: 'QuarkClinic',
    tela: 'estoque',
    prioridade: 0,
    ativo: true,
  },
  {
    slug: 'userpulse-onboarding-widget',
    nome_interno: 'UserPulse — checklist de implantação do widget',
    titulo: 'Checklist de implantação do widget',
    subtitulo: 'Confira os passos para publicar o UserPulse',
    descricao: 'Revise a instalação do script, public key, identificação de usuários e ambiente de homologação.',
    tipo: 'comunicado',
    sistema: 'UserPulse',
    tela: 'integracao',
    texto_botao: 'Abrir integração',
    url_botao: '/integracao',
    prioridade: 3,
    ativo: true,
    exige_confirmacao_leitura: true,
    modo_identificacao: 'url_contem',
    url_contem: '/integracao',
  },
  {
    slug: 'userpulse-feedback-campanhas',
    nome_interno: 'UserPulse — leitura de feedbacks de campanhas',
    titulo: 'Como ler feedbacks de campanhas',
    subtitulo: 'Notas, observações e oportunidades',
    descricao: 'Use os feedbacks para entender adoção, objeções e melhorias percebidas pelos usuários.',
    tipo: 'melhoria',
    sistema: 'UserPulse',
    tela: 'campanhas',
    prioridade: 0,
    ativo: false,
  },
  {
    slug: 'userpulse-pesquisa-produto',
    nome_interno: 'UserPulse — pesquisa de satisfação do produto',
    titulo: 'Pesquisa de satisfação do produto',
    subtitulo: 'Coleta genérica de percepção',
    descricao: 'Modelo de campanha para coletar opinião dos usuários após uma mudança importante no produto.',
    tipo: 'pesquisa',
    sistema: 'UserPulse',
    tela: 'dashboard',
    prioridade: 0,
    ativo: false,
    pergunta_feedback: 'O quanto essa mudança ajudou sua rotina?',
  },
]

const toursSeed: TourSeed[] = [
  {
    slug: 'agenda-primeira-consulta',
    titulo: 'Agendar primeira consulta',
    descricao: 'Fluxo básico para criar um agendamento na clínica.',
    sistema: 'QuarkClinic',
    tela: 'agenda',
    prioridade: 2,
    ativo: true,
    passos: [
      { titulo: 'Abra o calendário', descricao: 'Escolha o dia em que o paciente será atendido.', seletor_tipo: 'data_cy', seletor: 'agenda-calendario', tooltip_posicao: 'right' },
      { titulo: 'Clique em novo agendamento', descricao: 'Inicie o cadastro da consulta.', seletor_tipo: 'data_cy', seletor: 'agenda-novo', tooltip_posicao: 'bottom' },
      { titulo: 'Preencha os dados', descricao: 'Informe paciente, profissional, horário e convênio.', seletor_tipo: 'data_cy', seletor: 'agenda-formulario', tooltip_posicao: 'left' },
    ],
  },
  {
    slug: 'prontuario-evolucao',
    titulo: 'Registrar evolução no prontuário',
    descricao: 'Guia para registrar uma evolução clínica com segurança.',
    sistema: 'QuarkClinic',
    tela: 'prontuario',
    prioridade: 1,
    ativo: true,
    passos: [
      { titulo: 'Selecione o paciente', descricao: 'Confirme se o prontuário aberto é do paciente correto.', seletor_tipo: 'data_cy', seletor: 'prontuario-paciente', tooltip_posicao: 'bottom' },
      { titulo: 'Adicione evolução', descricao: 'Clique para iniciar um novo registro clínico.', seletor_tipo: 'data_cy', seletor: 'prontuario-nova-evolucao', tooltip_posicao: 'right' },
      { titulo: 'Salvar registro', descricao: 'Revise as informações antes de concluir.', seletor_tipo: 'data_cy', seletor: 'prontuario-salvar', tooltip_posicao: 'top' },
    ],
  },
  {
    slug: 'faturamento-conferencia',
    titulo: 'Conferir faturamento mensal',
    descricao: 'Passo a passo para revisar guias e repasses.',
    sistema: 'QuarkClinic',
    tela: 'faturamento',
    prioridade: 1,
    ativo: true,
    passos: [
      { titulo: 'Filtre o período', descricao: 'Selecione a competência desejada.', seletor_tipo: 'data_cy', seletor: 'faturamento-periodo', tooltip_posicao: 'bottom' },
      { titulo: 'Revise pendências', descricao: 'Verifique guias com inconsistências.', seletor_tipo: 'data_cy', seletor: 'faturamento-pendencias', tooltip_posicao: 'left' },
      { titulo: 'Exporte o relatório', descricao: 'Baixe o arquivo para conferência externa.', seletor_tipo: 'data_cy', seletor: 'faturamento-exportar', tooltip_posicao: 'top' },
    ],
  },
  {
    slug: 'userpulse-criar-campanha',
    titulo: 'Criar campanha no UserPulse',
    descricao: 'Tour introdutório para criar uma campanha simples.',
    sistema: 'UserPulse',
    tela: 'campanhas',
    prioridade: 3,
    ativo: true,
    passos: [
      { titulo: 'Clique em nova campanha', descricao: 'Abra o formulário de criação.', seletor_tipo: 'data_cy', seletor: 'campanhas-nova', tooltip_posicao: 'bottom' },
      { titulo: 'Defina o alvo', descricao: 'Escolha sistema, tela e modo de identificação.', seletor_tipo: 'data_cy', seletor: 'campanhas-destino', tooltip_posicao: 'right' },
      { titulo: 'Publique', descricao: 'Revise as opções e ative a campanha.', seletor_tipo: 'data_cy', seletor: 'campanhas-publicar', tooltip_posicao: 'top' },
    ],
  },
  {
    slug: 'userpulse-analisar-dashboard',
    titulo: 'Analisar dashboard de campanha',
    descricao: 'Entenda leituras, respostas e feedbacks coletados.',
    sistema: 'UserPulse',
    tela: 'dashboard',
    prioridade: 0,
    ativo: true,
    passos: [
      { titulo: 'Abra os indicadores', descricao: 'Veja alcance e interações principais.', seletor_tipo: 'data_cy', seletor: 'dashboard-indicadores', tooltip_posicao: 'bottom' },
      { titulo: 'Filtre feedbacks', descricao: 'Encontre comentários por nota, data ou usuário.', seletor_tipo: 'data_cy', seletor: 'dashboard-filtros', tooltip_posicao: 'right' },
    ],
  },
  {
    slug: 'estoque-cadastro-item',
    titulo: 'Cadastrar item de estoque',
    descricao: 'Fluxo de treinamento para adicionar novos materiais.',
    sistema: 'QuarkClinic',
    tela: 'estoque',
    prioridade: 0,
    ativo: false,
    passos: [
      { titulo: 'Novo item', descricao: 'Abra o cadastro de material.', seletor_tipo: 'data_cy', seletor: 'estoque-novo-item', tooltip_posicao: 'bottom' },
      { titulo: 'Informe dados básicos', descricao: 'Preencha nome, categoria e unidade de medida.', seletor_tipo: 'data_cy', seletor: 'estoque-dados-basicos', tooltip_posicao: 'right' },
    ],
  },
]

const jornadasSeed: JornadaSeed[] = [
  {
    slug: 'onboarding-recepcao',
    titulo: 'Onboarding da recepção',
    descricao: 'Trilha inicial para equipes que cuidam de agenda, atendimento e confirmação de consultas.',
    ativo: true,
    permitir_refazer: true,
    blocos: [
      {
        titulo: 'Primeiros passos',
        descricao: 'Conheça os fluxos essenciais para começar.',
        etapas: [
          { titulo: 'Ler novidades da agenda', descricao: 'Veja o comunicado principal da agenda.', tipo: 'campanha', refSlug: 'quarkclinic-agenda-demo' },
          { titulo: 'Fazer primeiro agendamento', descricao: 'Siga o tour de criação de consulta.', tipo: 'tour', refSlug: 'agenda-primeira-consulta' },
        ],
      },
      {
        titulo: 'Apoio operacional',
        descricao: 'Materiais para tirar dúvidas frequentes.',
        etapas: [
          { titulo: 'Central de ajuda', descricao: 'Abra a documentação de atendimento.', tipo: 'link', url: 'https://quarkclinic.com/ajuda/atendimento', texto_cta: 'Abrir ajuda' },
        ],
      },
    ],
  },
  {
    slug: 'onboarding-equipe-clinica',
    titulo: 'Onboarding da equipe clínica',
    descricao: 'Treinamento para profissionais que usam prontuário e evolução clínica.',
    ativo: true,
    blocos: [
      {
        titulo: 'Prontuário',
        descricao: 'Aprenda os fundamentos do registro clínico.',
        etapas: [
          { titulo: 'Conhecer novo prontuário', descricao: 'Leia o comunicado sobre a nova experiência.', tipo: 'campanha', refSlug: 'quarkclinic-prontuario-novo' },
          { titulo: 'Registrar evolução', descricao: 'Siga o tour de evolução clínica.', tipo: 'tour', refSlug: 'prontuario-evolucao' },
        ],
      },
    ],
  },
  {
    slug: 'implantacao-userpulse',
    titulo: 'Implantação do UserPulse',
    descricao: 'Checklist genérico para configurar widget, campanhas, tours e leitura de resultados.',
    ativo: true,
    permitir_refazer: true,
    blocos: [
      {
        titulo: 'Configuração',
        descricao: 'Prepare a integração técnica.',
        etapas: [
          { titulo: 'Conferir checklist do widget', descricao: 'Leia os requisitos de instalação.', tipo: 'campanha', refSlug: 'userpulse-onboarding-widget' },
          { titulo: 'Documentação de integração', descricao: 'Abra o guia técnico do widget.', tipo: 'link', url: 'https://docs.userpulse.local/integracao', texto_cta: 'Abrir docs' },
        ],
      },
      {
        titulo: 'Conteúdo',
        descricao: 'Crie e acompanhe seus primeiros conteúdos.',
        etapas: [
          { titulo: 'Criar campanha', descricao: 'Use o tour para publicar uma campanha.', tipo: 'tour', refSlug: 'userpulse-criar-campanha' },
          { titulo: 'Analisar dashboard', descricao: 'Veja como acompanhar feedbacks.', tipo: 'tour', refSlug: 'userpulse-analisar-dashboard' },
        ],
      },
    ],
  },
  {
    slug: 'treinamento-administrativo',
    titulo: 'Treinamento administrativo',
    descricao: 'Jornada para faturamento, estoque e rotinas administrativas.',
    ativo: false,
    blocos: [
      {
        titulo: 'Rotina mensal',
        descricao: 'Acompanhe os processos administrativos recorrentes.',
        etapas: [
          { titulo: 'Melhorias no faturamento', descricao: 'Leia o comunicado do módulo financeiro.', tipo: 'campanha', refSlug: 'quarkclinic-faturamento-recursos' },
          { titulo: 'Conferir faturamento', descricao: 'Siga o tour mensal de conferência.', tipo: 'tour', refSlug: 'faturamento-conferencia' },
          { titulo: 'Alerta de estoque', descricao: 'Veja como usar alertas de reposição.', tipo: 'campanha', refSlug: 'quarkclinic-estoque-alerta' },
        ],
      },
    ],
  },
]

const feedbacksManuaisSeed: FeedbackSeed[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    campanhaSlug: 'quarkclinic-agenda-demo',
    diasAtras: 1,
    nota: 5,
    observacao: 'A confirmação por WhatsApp reduziu bastante as ligações da recepção.',
    usuario_id: 'user-ana-recepcao',
    usuario_nome: 'Ana Recepção',
    usuario_email: 'ana.recepcao@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'agenda',
    navegador: 'Chrome',
    dispositivo: 'Desktop',
    telefone_contato: '+55 11 90000-1001',
    contexto: { cliente: 'Clínica Jardim', unidade: 'Matriz', perfil: 'Recepção', estado: 'SP' },
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    campanhaSlug: 'quarkclinic-agenda-demo',
    diasAtras: 2,
    nota: 4,
    observacao: 'Gostei dos filtros, mas queria salvar uma visualização padrão.',
    usuario_id: 'user-bruno-coord',
    usuario_nome: 'Bruno Coordenador',
    usuario_email: 'bruno.coord@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'agenda',
    navegador: 'Edge',
    dispositivo: 'Desktop',
    contexto: { cliente: 'Clínica Jardim', unidade: 'Matriz', perfil: 'Coordenação', estado: 'SP' },
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    campanhaSlug: 'quarkclinic-agenda-demo',
    diasAtras: 6,
    nota: 3,
    observacao: 'A agenda ficou melhor, mas o relatório de ausências ainda demora para carregar.',
    usuario_id: 'user-carla-recepcao',
    usuario_nome: 'Carla Atendimento',
    usuario_email: 'carla@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'agenda',
    navegador: 'Chrome',
    dispositivo: 'Notebook',
    contexto: { cliente: 'Quark Saúde', unidade: 'Zona Sul', perfil: 'Recepção', estado: 'RJ' },
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    campanhaSlug: 'quarkclinic-pesquisa-atendimento',
    diasAtras: 0,
    nota: 4,
    observacao: 'O fluxo está mais claro para encaixes, principalmente no período da manhã.',
    usuario_id: 'user-diego-atendimento',
    usuario_nome: 'Diego Atendimento',
    usuario_email: 'diego@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'atendimento',
    navegador: 'Chrome',
    dispositivo: 'Desktop',
    telefone_contato: '+55 21 90000-2002',
    contexto: { cliente: 'Quark Saúde', unidade: 'Centro', perfil: 'Atendimento', estado: 'RJ' },
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    campanhaSlug: 'quarkclinic-pesquisa-atendimento',
    diasAtras: 4,
    nota: 2,
    observacao: 'Ainda preciso abrir muitas telas para concluir um atendimento simples.',
    usuario_id: 'user-elisa-atendimento',
    usuario_nome: 'Elisa Atendimento',
    usuario_email: 'elisa@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'atendimento',
    navegador: 'Firefox',
    dispositivo: 'Desktop',
    contexto: { cliente: 'Clínica Norte', unidade: 'Unidade 2', perfil: 'Atendimento', estado: 'MG' },
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    campanhaSlug: 'quarkclinic-prontuario-novo',
    diasAtras: 3,
    nota: 5,
    observacao: 'Os anexos no prontuário facilitaram a revisão antes da consulta.',
    usuario_id: 'user-felipe-medico',
    usuario_nome: 'Dr. Felipe Moura',
    usuario_email: 'felipe@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'prontuario',
    navegador: 'Safari',
    dispositivo: 'MacBook',
    contexto: { cliente: 'Clínica Jardim', unidade: 'Matriz', perfil: 'Médico', estado: 'SP' },
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    campanhaSlug: 'quarkclinic-faturamento-recursos',
    diasAtras: 8,
    nota: 4,
    observacao: 'Filtro por convênio ajudou na conferência mensal.',
    usuario_id: 'user-gabi-financeiro',
    usuario_nome: 'Gabriela Financeiro',
    usuario_email: 'gabriela@quarkclinic.demo',
    sistema: 'QuarkClinic',
    tela: 'faturamento',
    navegador: 'Chrome',
    dispositivo: 'Desktop',
    contexto: { cliente: 'Quark Saúde', unidade: 'Centro', perfil: 'Financeiro', estado: 'RJ' },
  },
  {
    id: '10000000-0000-0000-0000-000000000008',
    campanhaSlug: 'userpulse-pesquisa-produto',
    diasAtras: 10,
    nota: 5,
    observacao: 'Os dashboards ficaram mais úteis para priorizar melhorias.',
    usuario_id: 'user-hugo-produto',
    usuario_nome: 'Hugo Produto',
    usuario_email: 'hugo@userpulse.demo',
    sistema: 'UserPulse',
    tela: 'dashboard',
    navegador: 'Chrome',
    dispositivo: 'Desktop',
    contexto: { cliente: 'Quark', unidade: 'Produto', perfil: 'Admin', estado: 'SP' },
  },
]

const usuariosDemo = [
  { id: 'ana-recepcao', nome: 'Ana Recepção', email: 'ana.recepcao@quarkclinic.demo', perfil: 'Recepção', estado: 'SP', unidade: 'Matriz', cliente: 'Clínica Jardim' },
  { id: 'bruno-coord', nome: 'Bruno Coordenador', email: 'bruno.coord@quarkclinic.demo', perfil: 'Coordenação', estado: 'SP', unidade: 'Matriz', cliente: 'Clínica Jardim' },
  { id: 'carla-atendimento', nome: 'Carla Atendimento', email: 'carla@quarkclinic.demo', perfil: 'Atendimento', estado: 'RJ', unidade: 'Zona Sul', cliente: 'Quark Saúde' },
  { id: 'diego-atendimento', nome: 'Diego Atendimento', email: 'diego@quarkclinic.demo', perfil: 'Atendimento', estado: 'RJ', unidade: 'Centro', cliente: 'Quark Saúde' },
  { id: 'elisa-atendimento', nome: 'Elisa Atendimento', email: 'elisa@quarkclinic.demo', perfil: 'Atendimento', estado: 'MG', unidade: 'Unidade 2', cliente: 'Clínica Norte' },
  { id: 'felipe-medico', nome: 'Dr. Felipe Moura', email: 'felipe@quarkclinic.demo', perfil: 'Médico', estado: 'SP', unidade: 'Matriz', cliente: 'Clínica Jardim' },
  { id: 'gabi-financeiro', nome: 'Gabriela Financeiro', email: 'gabriela@quarkclinic.demo', perfil: 'Financeiro', estado: 'RJ', unidade: 'Centro', cliente: 'Quark Saúde' },
  { id: 'hugo-produto', nome: 'Hugo Produto', email: 'hugo@userpulse.demo', perfil: 'Admin', estado: 'SP', unidade: 'Produto', cliente: 'Quark' },
]

const OBSERVACOES_DEMO = [
  'Ficou mais fácil entender o próximo passo do fluxo.',
  'A melhoria ajudou, mas ainda tenho dúvidas em alguns casos.',
  'Gostei da novidade e já comecei a usar com a equipe.',
  'O aviso apareceu no momento certo e economizou tempo.',
  'Preciso testar mais, mas a primeira impressão foi boa.',
  'A tela ficou mais clara para usuários novos.',
  'Seria útil ter um exemplo prático junto do aviso.',
  'A comunicação está objetiva e fácil de entender.',
]

function feedbackDemo(
  sequencia: number,
  campanhaSlug: string,
  total: number,
  sistema: string,
  tela: string,
  notaBase: number,
): FeedbackSeed[] {
  return Array.from({ length: total }, (_, index) => {
    const usuario = usuariosDemo[index % usuariosDemo.length]
    const nota = Math.max(1, Math.min(5, notaBase + ((index % 5) - 2)))
    const numero = sequencia + index
    return {
      id: `11000000-0000-0000-0000-${String(numero).padStart(12, '0')}`,
      campanhaSlug,
      diasAtras: index % 45,
      nota,
      observacao: index % 3 === 0 ? OBSERVACOES_DEMO[index % OBSERVACOES_DEMO.length] : undefined,
      usuario_id: `user-${usuario.id}-${index + 1}`,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      sistema,
      tela,
      navegador: index % 4 === 0 ? 'Safari' : index % 4 === 1 ? 'Edge' : 'Chrome',
      dispositivo: index % 5 === 0 ? 'Mobile' : index % 3 === 0 ? 'Notebook' : 'Desktop',
      telefone_contato: index % 7 === 0 ? `+55 11 9${String(10000000 + index).padStart(8, '0')}` : undefined,
      contexto: {
        cliente: usuario.cliente,
        unidade: usuario.unidade,
        perfil: usuario.perfil,
        estado: usuario.estado,
      },
    }
  })
}

const feedbacksGeradosSeed: FeedbackSeed[] = [
  ...feedbackDemo(1, 'quarkclinic-agenda-demo', 47, 'QuarkClinic', 'agenda', 4),
  ...feedbackDemo(101, 'quarkclinic-pesquisa-atendimento', 30, 'QuarkClinic', 'atendimento', 3),
  ...feedbackDemo(201, 'quarkclinic-faturamento-recursos', 23, 'QuarkClinic', 'faturamento', 4),
  ...feedbackDemo(301, 'quarkclinic-prontuario-novo', 17, 'QuarkClinic', 'prontuario', 5),
  ...feedbackDemo(401, 'userpulse-pesquisa-produto', 11, 'UserPulse', 'dashboard', 4),
]

const feedbacksSeed: FeedbackSeed[] = [...feedbacksManuaisSeed, ...feedbacksGeradosSeed]

const eventosCampanhaSeed: EventoCampanhaSeed[] = [
  ...feedbacksSeed.map((f, index) => ({
    id: `20000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    campanhaSlug: f.campanhaSlug,
    diasAtras: f.diasAtras,
    tipo_evento: 'feedback_enviado',
    usuario_id: f.usuario_id,
    sistema: f.sistema,
    tela: f.tela,
    navegador: f.navegador,
    dispositivo: f.dispositivo,
    contexto: f.contexto,
  })),
  ...[
    'quarkclinic-agenda-demo',
    'quarkclinic-agenda-demo',
    'quarkclinic-agenda-demo',
    'quarkclinic-pesquisa-atendimento',
    'quarkclinic-prontuario-novo',
    'quarkclinic-faturamento-recursos',
    'quarkclinic-estoque-alerta',
    'userpulse-onboarding-widget',
  ].map((campanhaSlug, index) => ({
    id: `20000000-0000-0000-0000-${String(index + 101).padStart(12, '0')}`,
    campanhaSlug,
    diasAtras: index + 1,
    tipo_evento: index % 3 === 0 ? 'visualizada' : index % 3 === 1 ? 'cta_clicado' : 'fechada',
    usuario_id: `user-demo-${index + 1}`,
    sistema: campanhaSlug.startsWith('userpulse') ? 'UserPulse' : 'QuarkClinic',
    tela: campanhaSlug.startsWith('userpulse') ? 'campanhas' : 'agenda',
    navegador: index % 2 === 0 ? 'Chrome' : 'Edge',
    dispositivo: index % 2 === 0 ? 'Desktop' : 'Notebook',
    contexto: { cliente: index % 2 === 0 ? 'Clínica Jardim' : 'Quark Saúde', perfil: index % 2 === 0 ? 'Recepção' : 'Admin' },
  })),
]

async function resolverTenant() {
  const slug = process.env.ADMIN_TENANT_SLUG?.trim().toLowerCase() || 'quark'
  const nome = process.env.ADMIN_TENANT_NOME?.trim() || 'Quark'
  const existente = await prisma.tenant.findUnique({ where: { slug } })
  if (existente) return existente

  const agora = new Date()
  const trialFim = new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000)
  return prisma.tenant.create({
    data: { nome, slug, status: 'TRIAL', trial_inicio: agora, trial_fim: trialFim },
  })
}

async function seedCampanhas(tenant_id: string) {
  const campanhas = new Map<string, { id: string }>()
  for (const item of campanhasSeed) {
    const data = {
      tenant_id,
      slug: item.slug,
      nome_interno: item.nome_interno,
      titulo: item.titulo,
      subtitulo: item.subtitulo,
      descricao: item.descricao,
      tipo: item.tipo,
      sistema: item.sistema,
      tela: item.tela,
      texto_botao: item.texto_botao,
      url_botao: item.url_botao,
      feedback_habilitado: item.feedback_habilitado ?? true,
      pergunta_feedback: item.pergunta_feedback,
      observacao_obrigatoria: false,
      modo_exibicao: item.modo_exibicao ?? 'modal_automatica',
      gatilho: item.gatilho ?? 'ao_abrir_tela',
      modo_identificacao: item.modo_identificacao ?? 'sistema_tela',
      url_contem: item.url_contem,
      atraso_ms: 800,
      mostrar_uma_vez: false,
      prioridade: item.prioridade,
      ordem: item.prioridade,
      ativo: item.ativo,
      exige_confirmacao_leitura: item.exige_confirmacao_leitura ?? false,
      permitir_fechar_modal: true,
    }
    const campanha = await prisma.campanha.upsert({
      where: { tenant_id_slug: { tenant_id, slug: item.slug } },
      create: data,
      update: data,
      select: { id: true },
    })
    campanhas.set(item.slug, campanha)
  }
  console.log(`✓ Campanhas seed: ${campanhas.size} registro(s)`)
  return campanhas
}

async function seedTours(tenant_id: string) {
  const tours = new Map<string, { id: string }>()
  for (const item of toursSeed) {
    const base = {
      tenant_id,
      slug: item.slug,
      titulo: item.titulo,
      descricao: item.descricao,
      sistema: item.sistema,
      tela: item.tela,
      modo_identificacao: 'sistema_tela',
      prioridade: item.prioridade,
      ativo: item.ativo,
    }
    const passos = item.passos.map((passo, index) => ({ ...passo, ordem: index + 1 }))
    const tour = await prisma.tourGuiado.upsert({
      where: { tenant_id_slug: { tenant_id, slug: item.slug } },
      create: { ...base, passos: { create: passos } },
      update: { ...base, passos: { deleteMany: {}, create: passos } },
      select: { id: true },
    })
    tours.set(item.slug, tour)
  }
  console.log(`✓ Tours seed: ${tours.size} registro(s)`)
  return tours
}

async function seedJornadas(
  tenant_id: string,
  campanhas: Map<string, { id: string }>,
  tours: Map<string, { id: string }>,
) {
  let total = 0
  for (const item of jornadasSeed) {
    const blocos = item.blocos.map((bloco, blocoIndex) => ({
      titulo: bloco.titulo,
      descricao: bloco.descricao,
      ordem: blocoIndex + 1,
      obrigatorio: true,
      ativo: true,
      etapas: {
        create: bloco.etapas.map((etapa, etapaIndex) => ({
          titulo: etapa.titulo,
          descricao: etapa.descricao,
          tipo: etapa.tipo,
          tour_id: etapa.tipo === 'tour' && etapa.refSlug ? tours.get(etapa.refSlug)?.id : undefined,
          campanha_id: etapa.tipo === 'campanha' && etapa.refSlug ? campanhas.get(etapa.refSlug)?.id : undefined,
          url: etapa.tipo === 'link' ? etapa.url : undefined,
          texto_cta: etapa.texto_cta ?? 'Abrir',
          abrir_nova_aba: etapa.tipo === 'link',
          ordem: etapaIndex + 1,
          obrigatoria: true,
        })),
      },
    }))
    await prisma.jornada.upsert({
      where: { tenant_id_slug: { tenant_id, slug: item.slug } },
      create: {
        tenant_id,
        slug: item.slug,
        titulo: item.titulo,
        descricao: item.descricao,
        ativo: item.ativo,
        permitir_refazer: item.permitir_refazer ?? false,
        permitir_pacotes_fora_ordem: true,
        blocos: { create: blocos },
      },
      update: {
        titulo: item.titulo,
        descricao: item.descricao,
        ativo: item.ativo,
        permitir_refazer: item.permitir_refazer ?? false,
        permitir_pacotes_fora_ordem: true,
        blocos: { deleteMany: {}, create: blocos },
      },
    })
    total += 1
  }
  console.log(`✓ Jornadas seed: ${total} registro(s)`)
}

function dataRelativa(diasAtras: number) {
  const data = new Date()
  data.setDate(data.getDate() - diasAtras)
  data.setHours(10 + (diasAtras % 8), 15, 0, 0)
  return data
}

async function seedInteracoesCampanhas(campanhas: Map<string, { id: string }>) {
  let feedbacks = 0
  for (const item of feedbacksSeed) {
    const campanha = campanhas.get(item.campanhaSlug)
    if (!campanha) continue
    await prisma.feedback.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        campanha_id: campanha.id,
        // Todo feedback seed é demo de NPS (0-10) — fundação
        // csat/utilidade_destaque ainda não tem dado de exemplo próprio.
        tipo_avaliacao: 'nps',
        nota: item.nota,
        observacao: item.observacao,
        usuario_id: item.usuario_id,
        usuario_nome: item.usuario_nome,
        usuario_email: item.usuario_email,
        sistema: item.sistema,
        tela: item.tela,
        navegador: item.navegador,
        dispositivo: item.dispositivo,
        contexto: item.contexto,
        telefone_contato: item.telefone_contato,
        criado_em: dataRelativa(item.diasAtras),
      },
      update: {
        campanha_id: campanha.id,
        tipo_avaliacao: 'nps',
        nota: item.nota,
        observacao: item.observacao,
        usuario_id: item.usuario_id,
        usuario_nome: item.usuario_nome,
        usuario_email: item.usuario_email,
        sistema: item.sistema,
        tela: item.tela,
        navegador: item.navegador,
        dispositivo: item.dispositivo,
        contexto: item.contexto,
        telefone_contato: item.telefone_contato,
        criado_em: dataRelativa(item.diasAtras),
      },
    })
    feedbacks += 1
  }

  let eventos = 0
  for (const item of eventosCampanhaSeed) {
    const campanha = campanhas.get(item.campanhaSlug)
    if (!campanha) continue
    await prisma.eventoCampanha.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        campanha_id: campanha.id,
        tipo_evento: item.tipo_evento,
        usuario_id: item.usuario_id,
        sistema: item.sistema,
        tela: item.tela,
        navegador: item.navegador,
        dispositivo: item.dispositivo,
        contexto: item.contexto,
        criado_em: dataRelativa(item.diasAtras),
      },
      update: {
        campanha_id: campanha.id,
        tipo_evento: item.tipo_evento,
        usuario_id: item.usuario_id,
        sistema: item.sistema,
        tela: item.tela,
        navegador: item.navegador,
        dispositivo: item.dispositivo,
        contexto: item.contexto,
        criado_em: dataRelativa(item.diasAtras),
      },
    })
    eventos += 1
  }

  console.log(`✓ Interações de campanhas seed: ${feedbacks} feedback(s), ${eventos} evento(s)`)
}

async function seedCatalogo(tenant_id: string) {
  const telas = [
    { nome: 'Agendamentos', sistema: 'QuarkClinic', categoria: 'Atendimento', url_contem: '/app/atendimento/agendamentos' },
    { nome: 'Prontuário', sistema: 'QuarkClinic', categoria: 'Clínico', url_contem: '/app/prontuario' },
    { nome: 'Faturamento', sistema: 'QuarkClinic', categoria: 'Financeiro', url_contem: '/app/faturamento' },
    { nome: 'Campanhas', sistema: 'UserPulse', categoria: 'Conteúdo', url_contem: '/campanhas' },
  ]

  for (const [index, tela] of telas.entries()) {
    const sistema = await prisma.sistema.upsert({
      where: { tenant_id_identificador: { tenant_id, identificador: tela.sistema } },
      create: {
        tenant_id,
        nome: tela.sistema,
        slug: tela.sistema.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        identificador: tela.sistema,
        ativo: true,
        padrao: index === 0,
      },
      update: {
        nome: tela.sistema,
        ativo: true,
      },
    })

    await prisma.telaCatalogo.upsert({
      where: { id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}` },
      create: {
        id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
        tenant: { connect: { id: tenant_id } },
        sistemaConfig: { connect: { id: sistema.id } },
        nome: tela.nome,
        sistema: tela.sistema,
        categoria: tela.categoria,
        modo_identificacao: 'url_contem',
        url_contem: tela.url_contem,
        ativo: true,
      },
      update: {
        tenant_id,
        sistema_id: sistema.id,
        nome: tela.nome,
        sistema: tela.sistema,
        categoria: tela.categoria,
        modo_identificacao: 'url_contem',
        url_contem: tela.url_contem,
        ativo: true,
      },
    })
  }
  console.log(`✓ Catálogo seed: ${telas.length} tela(s)`)
}

async function fixEncodingErrors() {
  // Records created via PowerShell Invoke-WebRequest (Windows-1252 body sent as UTF-8)
  // have U+FFFD replacement characters where accented letters should be.
  // These patterns match the broken variants but exclude already-correct values.
  const fixedCat = await prisma.$executeRaw`
    UPDATE telas_catalogo
    SET categoria = ${'Clínico'}
    WHERE categoria LIKE 'Cl%nico' AND categoria <> ${'Clínico'}
  `
  const fixedNome = await prisma.$executeRaw`
    UPDATE telas_catalogo
    SET nome = ${'Prontuário'}
    WHERE nome LIKE 'Prontu%rio' AND nome <> ${'Prontuário'}
  `
  if (fixedCat > 0) console.log(`✓ Encoding fix: ${fixedCat} categoria(s) → 'Clínico'`)
  if (fixedNome > 0) console.log(`✓ Encoding fix: ${fixedNome} nome(s) → 'Prontuário'`)
}

async function main() {
  const tenant = await resolverTenant()
  console.log(`✓ Tenant seed: ${tenant.nome} (${tenant.slug})`)
  const campanhas = await seedCampanhas(tenant.id)
  await seedInteracoesCampanhas(campanhas)
  const tours = await seedTours(tenant.id)
  await seedJornadas(tenant.id, campanhas, tours)
  await seedCatalogo(tenant.id)
  await fixEncodingErrors()
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
