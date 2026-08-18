import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolverWidgetVersion, lerWidgetVersionDoArquivo, injetarVersaoNoLoader } from './widgetVersion'

// Bug do ambiente Quark: WIDGET_VERSION nunca era setado no deploy, e
// npm_package_version nunca existe no container (Dockerfile roda `node`
// direto, sem passar por `npm run`/`npm start`) — o fallback caía sempre em
// Date.now(), fixado 1x por boot do processo, não por deploy. Estas suítes
// cobrem a ordem de resolução e a injeção no loader — ver comentário no topo
// de widgetVersion.ts pra causa raiz completa. O identificador em si (hash
// de conteúdo do widget.js, no Dockerfile do clinic — ver Dockerfile) é
// decisão de cada plataforma de deploy; esta lógica só precisa de uma
// string estável, não importa como foi gerada.

describe('resolverWidgetVersion — ordem de resolução', () => {
  test('WIDGET_VERSION explícito sempre vence, mesmo com arquivo e npm_package_version presentes', () => {
    const versao = resolverWidgetVersion({
      env: { WIDGET_VERSION: 'v-explicita', npm_package_version: '0.1.0' },
      lerArquivoVersion: () => 'hash-do-arquivo',
    })
    assert.equal(versao, 'v-explicita')
  })

  test('sem WIDGET_VERSION: usa o arquivo baked pelo Dockerfile (hash de conteúdo do widget.js) — a correção do bug', () => {
    const versao = resolverWidgetVersion({
      env: { npm_package_version: '0.1.0' },
      lerArquivoVersion: () => '8302c9b7cc87',
    })
    assert.equal(versao, '8302c9b7cc87')
  })

  test('sem WIDGET_VERSION e sem arquivo: cai pra npm_package_version (dev local via npm run/start)', () => {
    const versao = resolverWidgetVersion({
      env: { npm_package_version: '0.1.0' },
      lerArquivoVersion: () => null,
    })
    assert.equal(versao, '0.1.0')
  })

  test('sem WIDGET_VERSION, sem arquivo e sem npm_package_version: último recurso é um valor não-estático (Date.now())', () => {
    let chamadas = 0
    const relogio = () => { chamadas += 1; return 1000 + chamadas }
    const v1 = resolverWidgetVersion({ env: {}, lerArquivoVersion: () => null, agora: relogio })
    const v2 = resolverWidgetVersion({ env: {}, lerArquivoVersion: () => null, agora: relogio })
    // Nunca deve "grudar" num valor fixo hardcoded — cada chamada reflete o
    // relógio injetado (equivalente a Date.now() real em produção).
    assert.equal(v1, '1001')
    assert.equal(v2, '1002')
    assert.notEqual(v1, v2)
  })

  test('arquivo de versão presente evita cair no fallback estático de npm_package_version (o cenário real do Quark)', () => {
    // Sem isso, produção ficaria presa em "0.1.0" pra sempre (package.json
    // nunca é bumped por release neste projeto) — cache-busting nunca
    // aconteceria entre deploys reais.
    const versao = resolverWidgetVersion({
      env: { npm_package_version: '0.1.0' },
      lerArquivoVersion: () => 'hash-novo',
    })
    assert.notEqual(versao, '0.1.0')
    assert.equal(versao, 'hash-novo')
  })

  test('mesmo conteúdo de arquivo -> mesma versão resolvida em chamadas independentes (réplicas do mesmo deploy)', () => {
    const opcoes = { env: {}, lerArquivoVersion: () => '8302c9b7cc87' }
    assert.equal(resolverWidgetVersion(opcoes), resolverWidgetVersion(opcoes))
  })
})

describe('lerWidgetVersionDoArquivo', () => {
  test('lê e retorna o conteúdo do arquivo, sem espaços/quebras de linha nas pontas', () => {
    const arquivo = path.join(os.tmpdir(), `widget-version-${Date.now()}.txt`)
    fs.writeFileSync(arquivo, '  a1b2c3d\n')
    try {
      assert.equal(lerWidgetVersionDoArquivo(arquivo), 'a1b2c3d')
    } finally {
      fs.unlinkSync(arquivo)
    }
  })

  test('arquivo inexistente retorna null (nunca lança) — caso normal fora do Dockerfile do clinic', () => {
    const inexistente = path.join(os.tmpdir(), `widget-version-inexistente-${Date.now()}.txt`)
    assert.equal(lerWidgetVersionDoArquivo(inexistente), null)
  })

  test('arquivo vazio retorna null (não vira string vazia mascarando um valor "válido")', () => {
    const arquivo = path.join(os.tmpdir(), `widget-version-vazio-${Date.now()}.txt`)
    fs.writeFileSync(arquivo, '   \n')
    try {
      assert.equal(lerWidgetVersionDoArquivo(arquivo), null)
    } finally {
      fs.unlinkSync(arquivo)
    }
  })
})

describe('injetarVersaoNoLoader — widget-loader.js recebe URL versionada', () => {
  const template = "_el.src = _base + '/widget.js?v=__UP_VERSION__';"

  test('injeta a versão configurada no placeholder __UP_VERSION__', () => {
    const resultado = injetarVersaoNoLoader(template, '8302c9b7cc87')
    assert.equal(resultado, "_el.src = _base + '/widget.js?v=8302c9b7cc87';")
    assert.match(resultado, /\/widget\.js\?v=8302c9b7cc87/)
  })

  test('mesmo hash (widget.js sem alteração) -> mesma URL em chamadas independentes', () => {
    const deployA1 = injetarVersaoNoLoader(template, '8302c9b7cc87')
    const deployA2 = injetarVersaoNoLoader(template, '8302c9b7cc87')
    assert.equal(deployA1, deployA2)
  })

  test('hash diferente (widget.js alterado) -> URL obrigatoriamente diferente', () => {
    const deployA = injetarVersaoNoLoader(template, '8302c9b7cc87')
    const deployB = injetarVersaoNoLoader(template, 'f4e1a09d22b6')
    assert.notEqual(deployA, deployB)
    assert.match(deployA, /\/widget\.js\?v=8302c9b7cc87/)
    assert.match(deployB, /\/widget\.js\?v=f4e1a09d22b6/)
  })

  test('não altera o restante do template', () => {
    const maior = 'antes\n' + template + '\ndepois'
    const resultado = injetarVersaoNoLoader(maior, 'x1')
    assert.equal(resultado, 'antes\n' + "_el.src = _base + '/widget.js?v=x1';" + '\ndepois')
  })
})
