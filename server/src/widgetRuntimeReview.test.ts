import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const widgetPath = path.resolve(__dirname, '../../web/public/widget.js')
const loaderPath = path.resolve(__dirname, '../../web/public/widget-loader.js')

function elemento() {
  return {
    style: { overflow: '', setProperty() {}, removeProperty() {} },
    setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], innerHTML: '', className: '', id: '',
  }
}

test('loader é idempotente antes e depois de widget.js ficar pronto', () => {
  const scripts: any[] = []
  const document = {
    currentScript: { src: 'https://cdn.test/widget-loader.js' },
    getElementsByTagName: () => [document.currentScript],
    querySelector: (seletor: string) => seletor === 'script[data-userpulse-widget]' ? scripts[0] || null : null,
    createElement: () => ({ setAttribute() {}, src: '', async: false }),
    head: { appendChild(el: unknown) { scripts.push(el) } },
  }
  const window: any = {}
  const contexto = vm.createContext({ window, document, URL })
  const codigo = fs.readFileSync(loaderPath, 'utf8')

  vm.runInContext(codigo, contexto)
  vm.runInContext(codigo, contexto)
  assert.equal(scripts.length, 1)

  delete window.__userpulseLoaderInjected
  window.UserPulse._up_ready = true
  vm.runInContext(codigo, contexto)
  assert.equal(scripts.length, 1)
})

test('preview de Jornada bloqueia avaliações reais desde antes da resposta do snapshot', async () => {
  const chamadas: string[] = []
  const urlsSubstituidas: string[] = []
  const session = new Map<string, string>()
  const document: any = {
    currentScript: { src: 'https://cdn.test/widget.js' }, title: 'Host', readyState: 'complete',
    documentElement: elemento(), body: elemento(), head: elemento(),
    getElementById: () => null, createElement: elemento,
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  }
  const fetch = (url: string) => {
    chamadas.push(url)
    if (url.includes('/api/widget/jornadas/preview?')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ modo_teste: true, jornada: { id: 'j1', titulo: 'Teste', blocos: [], progresso: { concluida: false, blocos_concluidos: 0, blocos_total: 0 } } }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }
  const window: any = {
    location: { origin: 'https://host.test', href: 'https://host.test/app#/clientes/42?aba=dados&userpulse_jornada_preview=token', pathname: '/app', search: '', hash: '#/clientes/42?aba=dados&userpulse_jornada_preview=token', hostname: 'host.test' },
    history: { state: null, pushState() {}, replaceState(_state: unknown, _title: string, url: string) { urlsSubstituidas.push(url) } }, navigator: { userAgent: 'test' },
    sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => session.set(k, v), removeItem: (k: string) => session.delete(k) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, innerWidth: 1024, scrollTo() {}, pageYOffset: 0,
  }
  const contexto = vm.createContext({ window, document, history: window.history, fetch, console, URL, URLSearchParams, Date, Math })
  vm.runInContext(fs.readFileSync(widgetPath, 'utf8'), contexto)

  window.UserPulse.init({ sistema: 'erp', tela: 'home', usuario_id: 'u1' })
  window.UserPulse.track('evento_durante_preview')
  window.UserPulse.iniciarTour('tour-real')
  await new Promise(resolve => setTimeout(resolve, 10))

  assert.equal(chamadas.length, 1)
  assert.match(chamadas[0], /\/api\/widget\/jornadas\/preview\?token=token/)
  assert.deepEqual(urlsSubstituidas, ['https://host.test/app#/clientes/42?aba=dados'])
  assert.equal([...session.keys()].some(k => k === 'userpulse:tour_resume:v1'), false)
})

test('runtime mantém contratos de preview, contexto e conclusão autoritativa', () => {
  const codigo = fs.readFileSync(widgetPath, 'utf8')
  assert.match(codigo, /var contextoCapturado = contextoCampanhaAtual\(config, campanha, jornadaContexto\)/)
  assert.match(codigo, /if \(!respostaAutoritativa \|\| !respostaAutoritativa\.etapa_concluida\) return/)
  assert.doesNotMatch(codigo, /registrarEventoJornada\([^\n]+['"](?:bloco_concluido|jornada_concluida)['"]/)
  assert.match(codigo, /TOUR_PREVIEW_RESUME_STORAGE_KEY/)
  assert.match(codigo, /if \(jornadaState && jornadaState\.modoTeste\) return;/)
  assert.match(codigo, /content:"MODO TESTE"/)
  assert.match(codigo, /avaliarTourAutomatico\(config, 'evento'/)
  assert.match(codigo, /avaliarTourAutomatico\(config, 'botao_ajuda'/)
})
