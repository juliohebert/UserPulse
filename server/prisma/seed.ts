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

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
