import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { montarTestEmbedUrl, resolverOrigemTestador } from './tourTestador'

describe('testador local de tours', () => {
  test('usa o servidor Express em desenvolvimento', () => {
    assert.equal(
      resolverOrigemTestador({ appOrigin: 'http://localhost:5173', dev: true }),
      'http://localhost:3333'
    )
  })

  test('inclui a public_key do tenant na URL', () => {
    assert.equal(
      montarTestEmbedUrl('http://localhost:3333', 'tour-demo', 'tenant-public-key'),
      'http://localhost:3333/test-embed.html?local=1&tour=tour-demo&public_key=tenant-public-key'
    )
  })
})
