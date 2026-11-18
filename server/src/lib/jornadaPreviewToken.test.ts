import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assinarTokenPreviewJornada, verificarTokenPreviewJornada } from './jornadaPreviewToken'

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'teste-preview-jornada-segredo'

test('token de preview usa audiência própria e valida o payload', () => {
  const token = assinarTokenPreviewJornada({ tenant_id: 'tenant-1', jornada_id: 'jornada-1', admin_user_id: 'admin-1', nonce: 'nonce-1' })
  const payload = verificarTokenPreviewJornada(token)
  assert.equal(payload?.tenant_id, 'tenant-1')
  assert.equal(payload?.jornada_id, 'jornada-1')
  assert.equal(verificarTokenPreviewJornada(`${token}.invalido`), null)
})
