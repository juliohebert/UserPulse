import fs from 'fs'

// Versão injetada em /widget-loader.js (__UP_VERSION__ -> /widget.js?v=<versao>)
// pra cache-busting do widget embarcável (ver server/src/index.ts e
// web/public/widget-loader.js). Precisa mudar em todo deploy que altere o
// widget e nunca variar por request — ver ordem de resolução abaixo.
//
// Bug de origem (ambiente Quark): WIDGET_VERSION nunca era setado no deploy
// (nem Dockerfile, nem pipeline — `kubectl set image` só troca a tag da
// imagem, não seta env var nenhuma), e `process.env.npm_package_version`
// nunca existe nesse container (CMD roda `node dist/index.js` direto, nunca
// via `npm run`/`npm start` — npm só injeta essa env var nos processos que
// ele mesmo spawna). O fallback caía sempre em Date.now(), fixado 1x por
// BOOT do processo (const de módulo) — não por deploy. Como o Kubernetes
// mantém pods antigos e novos respondendo simultaneamente durante o
// rollout, e cada pod tem seu próprio Date.now() de boot, o valor efetivo de
// ?v= não correlacionava com o código realmente em execução, permitindo que
// um cliente capturasse uma URL versionada apontando pra um pod antigo
// (código antigo) e a cacheasse como immutable por 1 ano.
//
// Correção genérica (esta lógica é agnóstica de COMO o arquivo é gerado —
// isso é responsabilidade específica de cada plataforma de deploy, ver
// comentário no Dockerfile do clinic): a plataforma de deploy pode gravar um
// arquivo `.widget-version` em algum caminho conhecido, com qualquer
// identificador determinístico e estável por build (ex.: hash de conteúdo
// do widget.js, SHA de commit) — lerWidgetVersionDoArquivo lê esse arquivo e
// o valor vira o fallback nº2, antes de npm_package_version.
export interface OpcoesResolverWidgetVersion {
  env: { WIDGET_VERSION?: string; npm_package_version?: string }
  lerArquivoVersion?: () => string | null
  agora?: () => number
}

export function resolverWidgetVersion(opcoes: OpcoesResolverWidgetVersion): string {
  const { env, lerArquivoVersion, agora } = opcoes
  return (
    env.WIDGET_VERSION ||
    lerArquivoVersion?.() ||
    env.npm_package_version ||
    String((agora ?? Date.now)())
  )
}

// Lê o arquivo de versão gravado pela plataforma de deploy em build-time
// (ver Dockerfile do clinic). Falha silenciosa (retorna null) quando o
// arquivo não existe — caso normal em dev local ou em qualquer deploy que
// não gere esse arquivo.
export function lerWidgetVersionDoArquivo(caminho: string): string | null {
  try {
    const conteudo = fs.readFileSync(caminho, 'utf8').trim()
    return conteudo || null
  } catch {
    return null
  }
}

export function injetarVersaoNoLoader(loaderTemplate: string, versao: string): string {
  return loaderTemplate.replace('__UP_VERSION__', versao)
}
