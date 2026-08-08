import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type CampanhaSeed = {
  slug: string
  titulo: string
  subtitulo?: string
  descricao: string
  tipo: string
  sistema: string
  tela: string
  texto_botao?: string
  url_botao?: string
  categoria: string
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

const campanhasSeed: CampanhaSeed[] = [
  {
    slug: 'quarkclinic-agenda-demo',
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
    categoria: 'Melhoria',
    prioridade: 1,
    ativo: true,
    pergunta_feedback: 'O que você achou das melhorias?',
  },
  {
    slug: 'quarkclinic-prontuario-novo',
    titulo: 'Novo prontuário disponível',
    subtitulo: 'Registro clínico mais rápido e organizado',
    descricao: 'O prontuário ganhou uma experiência mais limpa para registrar evolução, anexos e condutas em menos cliques.',
    tipo: 'comunicado',
    sistema: 'QuarkClinic',
    tela: 'prontuario',
    texto_botao: 'Abrir prontuário',
    url_botao: '/app/prontuario',
    categoria: 'Novidade',
    prioridade: 2,
    ativo: true,
    exige_confirmacao_leitura: true,
  },
  {
    slug: 'quarkclinic-pesquisa-atendimento',
    titulo: 'Pesquisa rápida sobre atendimento',
    subtitulo: 'Ajude a melhorar o fluxo da recepção',
    descricao: 'Conte como está a experiência de atendimento e quais pontos podemos simplificar para sua equipe.',
    tipo: 'pesquisa',
    sistema: 'QuarkClinic',
    tela: 'atendimento',
    categoria: 'Pesquisa',
    prioridade: 0,
    ativo: true,
    pergunta_feedback: 'Como você avalia o fluxo atual?',
  },
  {
    slug: 'quarkclinic-faturamento-recursos',
    titulo: 'Melhorias no faturamento',
    subtitulo: 'Conciliação e repasses em destaque',
    descricao: 'Agora a tela de faturamento traz filtros por convênio, status de repasse e período de competência.',
    tipo: 'melhoria',
    sistema: 'QuarkClinic',
    tela: 'faturamento',
    texto_botao: 'Conhecer recursos',
    url_botao: '/app/faturamento',
    categoria: 'Melhoria',
    prioridade: 1,
    ativo: true,
  },
  {
    slug: 'quarkclinic-estoque-alerta',
    titulo: 'Alerta de estoque mínimo',
    subtitulo: 'Evite falta de materiais críticos',
    descricao: 'Configure alertas para materiais, medicamentos e insumos que exigem reposição antecipada.',
    tipo: 'comunicado',
    sistema: 'QuarkClinic',
    tela: 'estoque',
    categoria: 'Treinamento',
    prioridade: 0,
    ativo: true,
  },
  {
    slug: 'userpulse-onboarding-widget',
    titulo: 'Checklist de implantação do widget',
    subtitulo: 'Confira os passos para publicar o UserPulse',
    descricao: 'Revise a instalação do script, public key, identificação de usuários e ambiente de homologação.',
    tipo: 'comunicado',
    sistema: 'UserPulse',
    tela: 'integracao',
    texto_botao: 'Abrir integração',
    url_botao: '/integracao',
    categoria: 'Obrigatório',
    prioridade: 3,
    ativo: true,
    exige_confirmacao_leitura: true,
    modo_identificacao: 'url_contem',
    url_contem: '/integracao',
  },
  {
    slug: 'userpulse-feedback-campanhas',
    titulo: 'Como ler feedbacks de campanhas',
    subtitulo: 'Notas, observações e oportunidades',
    descricao: 'Use os feedbacks para entender adoção, objeções e melhorias percebidas pelos usuários.',
    tipo: 'melhoria',
    sistema: 'UserPulse',
    tela: 'campanhas',
    categoria: 'Treinamento',
    prioridade: 0,
    ativo: false,
  },
  {
    slug: 'userpulse-pesquisa-produto',
    titulo: 'Pesquisa de satisfação do produto',
    subtitulo: 'Coleta genérica de percepção',
    descricao: 'Modelo de campanha para coletar opinião dos usuários após uma mudança importante no produto.',
    tipo: 'pesquisa',
    sistema: 'UserPulse',
    tela: 'dashboard',
    categoria: 'Pesquisa',
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
      categoria: item.categoria,
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

async function seedCatalogo(tenant_id: string) {
  const telas = [
    { nome: 'Agendamentos', sistema: 'QuarkClinic', categoria: 'Atendimento', url_contem: '/app/atendimento/agendamentos' },
    { nome: 'Prontuário', sistema: 'QuarkClinic', categoria: 'Clínico', url_contem: '/app/prontuario' },
    { nome: 'Faturamento', sistema: 'QuarkClinic', categoria: 'Financeiro', url_contem: '/app/faturamento' },
    { nome: 'Campanhas', sistema: 'UserPulse', categoria: 'Conteúdo', url_contem: '/campanhas' },
  ]

  for (const [index, tela] of telas.entries()) {
    await prisma.telaCatalogo.upsert({
      where: { id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}` },
      create: {
        id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
        tenant_id,
        nome: tela.nome,
        sistema: tela.sistema,
        categoria: tela.categoria,
        modo_identificacao: 'url_contem',
        url_contem: tela.url_contem,
        ativo: true,
      },
      update: {
        tenant_id,
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
