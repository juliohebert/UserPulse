import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const slug = 'quarkclinic-agenda-demo'

  const data = {
    slug,
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
    feedback_habilitado: true,
    pergunta_feedback: 'O que você achou das melhorias?',
    observacao_obrigatoria: false,
    modo_exibicao: 'modal_automatica',
    gatilho: 'ao_abrir_tela',
    atraso_ms: 800,
    mostrar_uma_vez: false,
    prioridade: 1,
    ordem: 0,
    ativo: true,
  }

  const campanha = await prisma.campanha.upsert({
    where: { slug },
    create: data,
    update: data,
  })

  console.log(`✓ Campanha seed: "${campanha.titulo}" (${campanha.sistema}/${campanha.tela}) — id: ${campanha.id}`)
}

async function seedCatalogo() {
  const tela = await prisma.telaCatalogo.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      nome: 'Agendamentos',
      sistema: 'QuarkClinic',
      categoria: 'Atendimento',
      modo_identificacao: 'url_contem',
      url_contem: '/app/atendimento/agendamentos',
      ativo: true,
    },
    update: {},
  })
  console.log(`✓ Catálogo seed: "${tela.nome}" (${tela.sistema}) — id: ${tela.id}`)
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

main()
  .then(() => seedCatalogo())
  .then(() => fixEncodingErrors())
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
