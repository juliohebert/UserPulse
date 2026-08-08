// Planos comerciais padrão do UserPulse — pré-configurados pra facilitar
// venda e teste grátis (ver contexto da tarefa "planos comerciais padrão").
// Script próprio (não encadeado em seed.ts/seedAdmin.ts) seguindo o mesmo
// raciocínio de separação de responsabilidades já usado pelo projeto: roda
// só quando alguém chama explicitamente `npm run db:seed:planos`.
//
// slug é a chave de idempotência (upsert) — mesmo padrão já usado por
// prisma/seed.ts (campanha demo, upsert por slug) e pela migration que criou
// o plano "Interno (Quark)" (20260801120000_add_saas_multi_tenant, também
// via slug único). Rodar este script quantas vezes for preciso nunca
// duplica: sempre atualiza os 5 planos abaixo pros valores atuais aqui
// definidos, nunca cria um segundo registro pro mesmo slug.
//
// Nunca cria/edita nenhum Tenant, nem mexe em nome/descrição/preço/limites
// do plano "Interno (Quark)" (slug "interno-quark") — só garante que ele
// continue marcado interno=true/ativo=true (ver garantirPlanoInterno
// abaixo), além de fazer upsert dos 5 slugs comerciais.
//
// TODO(Asaas): quando a integração de cobrança automática existir, ela vai
// provavelmente precisar mapear cada plano daqui pra um plano/preço no
// Asaas (e passar a ler preco_mensal como referência, não fonte de
// verdade). Fora de escopo nesta tarefa — cobrança, gateway/checkout e
// bloqueio automático por inadimplência continuam 100% manuais (ver
// licença comercial em Tenant, ajustada à mão pelo super admin).
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const PLANOS_PADRAO: Prisma.PlanoUncheckedCreateInput[] = [
  {
    slug: 'teste-gratis',
    nome: 'Teste grátis',
    descricao: 'Período de teste grátis padrão oferecido a novos clientes.',
    preco_mensal: 0,
    limite_campanhas_ativas: 3,
    limite_tours_ativos: 1,
    limite_eventos_mes: 5000,
    limite_usuarios_admin: 1,
    permite_tours: true,
    permite_jornadas: false,
    permite_white_label: false,
    ativo: true,
    interno: false,
  },
  {
    slug: 'starter',
    nome: 'Starter',
    descricao: 'Plano de entrada para clientes pequenos.',
    preco_mensal: 149,
    limite_campanhas_ativas: 10,
    limite_tours_ativos: 3,
    limite_eventos_mes: 30000,
    limite_usuarios_admin: 2,
    permite_tours: true,
    permite_jornadas: false,
    permite_white_label: false,
    ativo: true,
    interno: false,
  },
  {
    slug: 'growth',
    nome: 'Growth',
    descricao: 'Plano intermediário, já com Jornadas liberadas.',
    preco_mensal: 349,
    limite_campanhas_ativas: 30,
    limite_tours_ativos: 10,
    limite_eventos_mes: 150000,
    limite_usuarios_admin: 5,
    permite_tours: true,
    permite_jornadas: true,
    permite_white_label: false,
    ativo: true,
    interno: false,
  },
  {
    slug: 'scale',
    nome: 'Scale',
    descricao: 'Plano para operações maiores, com White label liberado.',
    preco_mensal: 699,
    limite_campanhas_ativas: 100,
    limite_tours_ativos: 30,
    limite_eventos_mes: 500000,
    limite_usuarios_admin: 10,
    permite_tours: true,
    permite_jornadas: true,
    permite_white_label: true,
    ativo: true,
    interno: false,
  },
  {
    slug: 'enterprise',
    nome: 'Enterprise',
    // preco_mensal/limites null = "sob consulta"/sem limite — mesmo padrão
    // já usado pelo plano Interno (Quark); o schema já suporta (todos os
    // campos de limite e preco_mensal são opcionais), sem precisar de
    // nenhum valor "alto" artificial no lugar de ilimitado.
    descricao: 'Sob consulta — limites e preço negociados diretamente com o cliente.',
    preco_mensal: null,
    limite_campanhas_ativas: null,
    limite_tours_ativos: null,
    limite_eventos_mes: null,
    limite_usuarios_admin: null,
    permite_tours: true,
    permite_jornadas: true,
    permite_white_label: true,
    ativo: true,
    interno: false,
  },
]

// O plano "Interno (Quark)" já existe desde a migration
// 20260801120000_add_saas_multi_tenant (seed via SQL, id fixo) — nunca faz
// parte de PLANOS_PADRAO acima (não é um plano comercial). Esta função só
// garante interno=true/ativo=true nele, de forma idempotente; nunca mexe em
// nome/descrição/preço/limites (o `update` do upsert só toca os campos
// listados, os demais ficam como já estavam). O `create` aqui é só uma rede
// de segurança — na prática nunca roda, porque a migration já criou o
// registro antes deste script existir.
async function garantirPlanoInterno() {
  const salvo = await prisma.plano.upsert({
    where: { slug: 'interno-quark' },
    update: { interno: true, ativo: true },
    create: {
      slug: 'interno-quark',
      nome: 'Interno (Quark)',
      descricao: 'Plano interno sem limites de uso, para a própria Quark.',
      permite_tours: true,
      permite_jornadas: true,
      permite_white_label: true,
      ativo: true,
      interno: true,
    },
  })
  console.log(`✓ Plano interno confirmado: "${salvo.nome}" (${salvo.slug}) — ativo=${salvo.ativo}, interno=${salvo.interno}`)
}

async function main() {
  for (const plano of PLANOS_PADRAO) {
    const salvo = await prisma.plano.upsert({
      where: { slug: plano.slug },
      create: plano,
      update: plano,
    })
    console.log(`✓ Plano comercial: "${salvo.nome}" (${salvo.slug}) — id: ${salvo.id}`)
  }
  await garantirPlanoInterno()
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
