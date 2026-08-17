import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EmailService } from './EmailService'
import type { EmailProvider, EmailMessage, EnviarOpcoes } from './EmailProvider'
import type { DadosBoasVindas } from './templates/boasVindas'

// Provider fake, sem tocar Resend/rede nenhuma (regra explícita da tarefa:
// "não chamar Resend real nos testes") — só grava o que recebeu, pra
// inspeção nas asserções abaixo.
class ProviderFake implements EmailProvider {
  chamadas: { mensagem: EmailMessage; opcoes: EnviarOpcoes | undefined }[] = []
  private readonly erro: Error | null

  constructor(erro: Error | null = null) {
    this.erro = erro
  }

  async enviar(mensagem: EmailMessage, opcoes?: EnviarOpcoes): Promise<void> {
    this.chamadas.push({ mensagem, opcoes })
    if (this.erro) throw this.erro
  }
}

const DADOS: DadosBoasVindas = {
  nomeResponsavel: 'Ana Silva',
  diasTrial: 21,
  limiteCampanhas: 10,
  limiteTours: 1,
  limiteJornadas: 1,
  urlProduto: 'https://app.userpulse.com.br',
}

describe('EmailService.enviarBoasVindas — provider configurado recebe o envio', () => {
  test('chama provider.enviar exatamente uma vez, com o e-mail montado pro destinatário certo', async () => {
    const provider = new ProviderFake()
    const service = new EmailService(provider)
    await service.enviarBoasVindas('ana@acme.com', DADOS)
    assert.equal(provider.chamadas.length, 1)
    assert.equal(provider.chamadas[0]!.mensagem.to, 'ana@acme.com')
    assert.match(provider.chamadas[0]!.mensagem.subject, /Bem-vindo ao UserPulse/)
  })

  test('dados reais do trial (dias/limites) chegam corretamente ao template recebido pelo provider', async () => {
    const provider = new ProviderFake()
    const service = new EmailService(provider)
    await service.enviarBoasVindas('ana@acme.com', { ...DADOS, diasTrial: 30, limiteCampanhas: 50, limiteTours: 5, limiteJornadas: 2 })
    const { mensagem } = provider.chamadas[0]!
    assert.match(mensagem.text, /30 dias/)
    assert.match(mensagem.text, /50 campanhas/)
    assert.match(mensagem.text, /5 tours guiados/)
    assert.match(mensagem.text, /2 jornadas/)
  })

  test('idempotencyKey passada em enviarBoasVindas chega ao provider sem alteração', async () => {
    const provider = new ProviderFake()
    const service = new EmailService(provider)
    await service.enviarBoasVindas('ana@acme.com', DADOS, { idempotencyKey: 'boas-vindas:usuario-123' })
    assert.equal(provider.chamadas[0]!.opcoes?.idempotencyKey, 'boas-vindas:usuario-123')
  })
})

describe('EmailService.enviarBoasVindas — falha do provider não é engolida (quem chama decide não deixar quebrar o fluxo)', () => {
  test('provider que rejeita faz enviarBoasVindas rejeitar também (propaga, nunca engole)', async () => {
    const provider = new ProviderFake(new Error('Resend indisponível'))
    const service = new EmailService(provider)
    await assert.rejects(() => service.enviarBoasVindas('ana@acme.com', DADOS), /Resend indisponível/)
  })
})

describe('EmailService.enviarBoasVindas — sem provider configurado (comportamento normal de dev)', () => {
  test('provider null resolve sem lançar (só loga, não finge que enviou)', async () => {
    const service = new EmailService(null)
    await assert.doesNotReject(() => service.enviarBoasVindas('ana@acme.com', DADOS))
  })
})

// Fase 6D (correção pós-revisão) — o scheduler de alertas de trial
// (services/trialAlertasScheduler.ts) precisa distinguir "sem provider" de
// "enviado com sucesso" pra nunca marcar um alerta como ENVIADO sem
// nenhum e-mail de verdade ter saído. providerConfigurado é a checagem
// síncrona que ele usa antes de chamar enviarAlertaTrial.
describe('EmailService.providerConfigurado', () => {
  test('false quando o provider é null', () => {
    assert.equal(new EmailService(null).providerConfigurado, false)
  })
  test('true quando há um provider configurado', () => {
    assert.equal(new EmailService(new ProviderFake()).providerConfigurado, true)
  })
})
