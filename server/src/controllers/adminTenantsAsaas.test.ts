import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  extrairDadosBilling, dadosCobrancaAsaas, condicoesEventosAsaas, validarTenantParaSync,
  precisaBuscarCobrancas, normalizarCobranca, resolverBillingTypeGestaoSaas,
} from './adminTenantsAsaas'

// Fase 2 da integração Asaas (dados de cobrança/histórico/sync) — só funções
// puras (sem banco/rede), mesmo padrão de tenantGuards.test.ts. Os fluxos que
// realmente tocam Prisma/Asaas (salvar cobrança, listar eventos, sincronizar)
// são validados manualmente contra um servidor local, documentado no relatório
// de validação — não automatizados aqui, seguindo a convenção já estabelecida
// no projeto (ver CLAUDE.md, seção Tests).

describe('extrairDadosBilling — nunca loga nada (dado sensível: billing_cpf_cnpj)', () => {
  test('extrai só os campos billing_* presentes no body, com trim', () => {
    const dados = extrairDadosBilling({ billing_nome_responsavel: '  João  ', billing_cpf_cnpj: ' 12345678900 ' })
    assert.deepEqual(dados, { billing_nome_responsavel: 'João', billing_cpf_cnpj: '12345678900' })
  })

  test('campo ausente no body não entra no resultado (omitido, não vira null)', () => {
    const dados = extrairDadosBilling({ billing_email: 'a@b.com' })
    assert.equal('billing_cpf_cnpj' in dados, false)
  })

  test('string vazia ou só espaço vira null (limpa o campo)', () => {
    const dados = extrairDadosBilling({ billing_telefone: '   ' })
    assert.equal(dados.billing_telefone, null)
  })

  test('billing_cpf_cnpj: normalização defensiva remove pontuação e letras, guarda só dígitos', () => {
    assert.equal(extrairDadosBilling({ billing_cpf_cnpj: '123.456.789-00' }).billing_cpf_cnpj, '12345678900')
    assert.equal(extrairDadosBilling({ billing_cpf_cnpj: '12.345.678/0001-90' }).billing_cpf_cnpj, '12345678000190')
    assert.equal(extrairDadosBilling({ billing_cpf_cnpj: 'abc123def456' }).billing_cpf_cnpj, '123456')
  })

  test('billing_telefone: normalização defensiva remove pontuação, guarda só dígitos', () => {
    assert.equal(extrairDadosBilling({ billing_telefone: '(11) 98888-7777' }).billing_telefone, '11988887777')
  })

  test('billing_cep: normalização defensiva remove hífen, guarda só dígitos', () => {
    assert.equal(extrairDadosBilling({ billing_cep: '01000-000' }).billing_cep, '01000000')
  })

  test('billing_estado: normalização defensiva vira maiúsculo, só letras, no máximo 2', () => {
    assert.equal(extrairDadosBilling({ billing_estado: 'sp' }).billing_estado, 'SP')
    assert.equal(extrairDadosBilling({ billing_estado: ' rj ' }).billing_estado, 'RJ')
    assert.equal(extrairDadosBilling({ billing_estado: 'são paulo' }).billing_estado, 'SO')
  })

  test('billing_estado: só símbolos/números vira null (nada sobra depois de normalizar)', () => {
    assert.equal(extrairDadosBilling({ billing_estado: '123' }).billing_estado, null)
  })

  test('billing_email: normalização defensiva faz trim e lowercase', () => {
    assert.equal(extrairDadosBilling({ billing_email: '  Fulano@Exemplo.COM  ' }).billing_email, 'fulano@exemplo.com')
  })

  test('não escreve em console.* — nenhuma chamada de log recebe o cpf_cnpj (ou qualquer outro valor)', () => {
    const chamadas: unknown[] = []
    const originais = { log: console.log, error: console.error, warn: console.warn, info: console.info }
    console.log = (...args: unknown[]) => chamadas.push(args)
    console.error = (...args: unknown[]) => chamadas.push(args)
    console.warn = (...args: unknown[]) => chamadas.push(args)
    console.info = (...args: unknown[]) => chamadas.push(args)
    try {
      extrairDadosBilling({ billing_cpf_cnpj: '99988877766', billing_nome_responsavel: 'Segredo Testável' })
    } finally {
      console.log = originais.log
      console.error = originais.error
      console.warn = originais.warn
      console.info = originais.info
    }
    assert.equal(chamadas.length, 0)
  })
})

describe('dadosCobrancaAsaas', () => {
  const BASE = {
    nome: 'Tenant Teste',
    billing_nome_responsavel: null,
    billing_email: null,
    billing_cpf_cnpj: null,
    billing_telefone: null,
    billing_endereco: null,
    billing_numero: null,
    billing_complemento: null,
    billing_bairro: null,
    billing_cidade: null,
    billing_estado: null,
    billing_cep: null,
  }

  test('sem billing_cpf_cnpj, retorna null (não dá pra criar customer Asaas sem documento)', () => {
    assert.equal(dadosCobrancaAsaas(BASE), null)
  })

  test('com billing_cpf_cnpj, monta o objeto pro Asaas', () => {
    const resultado = dadosCobrancaAsaas({ ...BASE, billing_cpf_cnpj: '12345678900', billing_email: 'a@b.com' })
    assert.deepEqual(resultado, {
      nome: 'Tenant Teste',
      cpfCnpj: '12345678900',
      email: 'a@b.com',
      telefone: null,
      cep: null,
      endereco: null,
      numero: null,
      complemento: null,
      bairro: null,
    })
  })

  test('billing_nome_responsavel preenchido tem prioridade sobre o nome do tenant', () => {
    const resultado = dadosCobrancaAsaas({ ...BASE, billing_cpf_cnpj: '111', billing_nome_responsavel: 'Responsável' })
    assert.equal(resultado?.nome, 'Responsável')
  })

  test('cidade/estado nunca aparecem no objeto devolvido (Asaas resolve pelo CEP, ver comentário em asaasClient.ts)', () => {
    const resultado = dadosCobrancaAsaas({ ...BASE, billing_cpf_cnpj: '111', billing_cidade: 'São Paulo', billing_estado: 'SP' })
    assert.equal('cidade' in (resultado ?? {}), false)
    assert.equal('estado' in (resultado ?? {}), false)
  })
})

describe('condicoesEventosAsaas', () => {
  test('sem customer_id nem subscription_id, retorna array vazio', () => {
    assert.deepEqual(condicoesEventosAsaas({ asaas_customer_id: null, asaas_subscription_id: null }), [])
  })

  test('só com customer_id', () => {
    assert.deepEqual(condicoesEventosAsaas({ asaas_customer_id: 'cus_1', asaas_subscription_id: null }), [{ customer_id: 'cus_1' }])
  })

  test('só com subscription_id', () => {
    assert.deepEqual(condicoesEventosAsaas({ asaas_customer_id: null, asaas_subscription_id: 'sub_1' }), [{ subscription_id: 'sub_1' }])
  })

  test('com os dois, retorna as duas condições (OR)', () => {
    assert.deepEqual(
      condicoesEventosAsaas({ asaas_customer_id: 'cus_1', asaas_subscription_id: 'sub_1' }),
      [{ customer_id: 'cus_1' }, { subscription_id: 'sub_1' }]
    )
  })
})

describe('validarTenantParaSync', () => {
  test('sem asaas_subscription_id, retorna erro claro', () => {
    const erro = validarTenantParaSync({ asaas_subscription_id: null })
    assert.match(erro ?? '', /sem assinatura Asaas vinculada/i)
  })

  test('com asaas_subscription_id, libera (retorna null)', () => {
    assert.equal(validarTenantParaSync({ asaas_subscription_id: 'sub_1' }), null)
  })
})

// Fase 3 — seção "Cobranças" da assinatura (ver GET .../asaas/payments).

describe('precisaBuscarCobrancas — rota sem subscription_id', () => {
  test('sem asaas_subscription_id, não busca (lista vazia sem chamar o Asaas)', () => {
    assert.equal(precisaBuscarCobrancas({ asaas_subscription_id: null }), false)
  })

  test('com asaas_subscription_id, busca', () => {
    assert.equal(precisaBuscarCobrancas({ asaas_subscription_id: 'sub_1' }), true)
  })
})

describe('normalizarCobranca — normalização do retorno de cobranças', () => {
  test('extrai só os campos úteis pro painel', () => {
    const resumo = normalizarCobranca({
      id: 'pay_1',
      status: 'RECEIVED',
      value: 149.9,
      customer: 'cus_1',
      subscription: 'sub_1',
      dueDate: '2026-09-08',
      paymentDate: '2026-08-08',
      billingType: 'BOLETO',
      description: 'Assinatura mensal',
      invoiceUrl: 'https://sandbox.asaas.com/i/abc123',
      bankSlipUrl: 'https://sandbox.asaas.com/b/abc123',
    })
    assert.deepEqual(resumo, {
      id: 'pay_1',
      status: 'RECEIVED',
      value: 149.9,
      dueDate: '2026-09-08',
      paymentDate: '2026-08-08',
      invoiceUrl: 'https://sandbox.asaas.com/i/abc123',
      billingType: 'BOLETO',
      description: 'Assinatura mensal',
    })
  })

  test('sem paymentDate/billingType/description, vira null (nunca undefined)', () => {
    const resumo = normalizarCobranca({
      id: 'pay_2', status: 'PENDING', value: 50, customer: 'cus_1', subscription: null,
      dueDate: '2026-09-08', paymentDate: null,
    })
    assert.equal(resumo.paymentDate, null)
    assert.equal(resumo.billingType, null)
    assert.equal(resumo.description, null)
    assert.equal(resumo.invoiceUrl, null)
  })

  test('sem invoiceUrl, cai pro bankSlipUrl', () => {
    const resumo = normalizarCobranca({
      id: 'pay_3', status: 'PENDING', value: 50, customer: 'cus_1', subscription: null,
      dueDate: '2026-09-08', paymentDate: null, bankSlipUrl: 'https://sandbox.asaas.com/b/xyz',
    })
    assert.equal(resumo.invoiceUrl, 'https://sandbox.asaas.com/b/xyz')
  })
})

// Correção pós-revisão — Gestão SaaS não tinha como enviar billing_type (a
// tela de Tenants.tsx manda body vazio), então caía no default BOLETO do
// próprio criarAssinaturaAsaas — diferente do self-service, que já manda
// UNDEFINED (deixa o pagador escolher Pix/Cartão na página hospedada do
// Asaas). resolverBillingTypeGestaoSaas corrige só esse fluxo.
describe('resolverBillingTypeGestaoSaas — default UNDEFINED, preserva escolha explícita', () => {
  test('sem billing_type -> UNDEFINED (não mais BOLETO)', () => {
    assert.equal(resolverBillingTypeGestaoSaas(undefined), 'UNDEFINED')
  })

  test('CREDIT_CARD explícito -> preserva CREDIT_CARD', () => {
    assert.equal(resolverBillingTypeGestaoSaas('CREDIT_CARD'), 'CREDIT_CARD')
  })

  test('PIX explícito -> preserva PIX', () => {
    assert.equal(resolverBillingTypeGestaoSaas('PIX'), 'PIX')
  })

  test('BOLETO explícito -> preserva BOLETO', () => {
    assert.equal(resolverBillingTypeGestaoSaas('BOLETO'), 'BOLETO')
  })
})
