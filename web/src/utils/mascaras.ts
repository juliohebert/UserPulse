// Máscaras/validação dos campos de "Dados de cobrança" (Cobrança Asaas, ver
// Tenants.tsx) — todas funções puras (sem estado, sem side-effect), operam
// só sobre o valor de exibição do campo. O valor efetivamente salvo/enviado
// ao backend é sempre normalizado (ver normalizarCpfCnpj etc.) antes do
// submit — a máscara aqui é só apresentação.

function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

// CPF (até 11 dígitos): 000.000.000-00 — CNPJ (12 a 14 dígitos):
// 00.000.000/0000-00. Alterna sozinho conforme a quantidade de dígitos
// digitados, sempre recalculado a partir do valor bruto (nunca acumula
// pontuação duplicada).
export function formatarCpfCnpj(valorBruto: string): string {
  const digitos = apenasDigitos(valorBruto).slice(0, 14)
  if (digitos.length <= 11) {
    if (digitos.length > 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
    if (digitos.length > 6) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`
    if (digitos.length > 3) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`
    return digitos
  }
  if (digitos.length > 12) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
  if (digitos.length > 8) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8)}`
  if (digitos.length > 5) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5)}`
  return `${digitos.slice(0, 2)}.${digitos.slice(2)}`
}

// (00) 0000-0000 pra fixo (até 10 dígitos) ou (00) 00000-0000 pra celular
// (11 dígitos) — mesmo raciocínio de recalcular tudo a partir do bruto.
export function formatarTelefone(valorBruto: string): string {
  const digitos = apenasDigitos(valorBruto).slice(0, 11)
  if (digitos.length > 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  if (digitos.length > 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  if (digitos.length > 2) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length > 0) return `(${digitos}`
  return ''
}

export function formatarCep(valorBruto: string): string {
  const digitos = apenasDigitos(valorBruto).slice(0, 8)
  if (digitos.length > 5) return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
  return digitos
}

// Só letras A-Z, maiúsculas, no máximo 2 — usado tanto na máscara de
// exibição quanto na normalização enviada ao backend (não há diferença
// entre exibição e valor salvo pra este campo).
export function formatarEstado(valorBruto: string): string {
  return valorBruto.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
}

// ─── Normalização (valor efetivamente salvo/enviado, sem máscara) ─────────
// Espelha exatamente a normalização defensiva do backend (ver
// extrairDadosBilling em server/src/controllers/adminTenantsAsaas.ts) — o
// Asaas espera cpfCnpj/phone/postalCode só com dígitos, nunca com pontuação.

export const normalizarCpfCnpj = apenasDigitos
export const normalizarTelefone = apenasDigitos
export const normalizarCep = apenasDigitos

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase()
}

// Validação básica de formato — não pretende cobrir todo RFC 5322, só
// pegar erros óbvios de digitação (sem @, sem domínio) antes de mandar pro
// backend/Asaas.
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(valor: string): boolean {
  const v = valor.trim()
  return v === '' || REGEX_EMAIL.test(v)
}
