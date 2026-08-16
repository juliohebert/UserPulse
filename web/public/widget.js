(function () {
  var WIDGET_ID = 'userpulse-widget-root';
  var STYLE_ID = 'userpulse-widget-style';
  var currentScript = document.currentScript;
  var scriptOrigin = currentScript && currentScript.src ? new URL(currentScript.src).origin : window.location.origin;
  var state = {
    config: null,
    campanha: null,
    root: null,
    open: false,
    nota: null,
    observacao: '',
    confirmacaoMarcada: false,
    submitting: false,
    submitted: false,
    error: '',
    timer: null,
    visualizacaoRegistrada: false,
    scrollY: 0,
    bodyOverflow: '',
    feedbackId: null,
    telefone: '',
    phoneSubmitting: false,
    phoneDone: false,
    phoneError: '',
    closeTimer: null,
  };

  var spaListenerBound = false;
  var lastUrl = '';
  var urlChangeTimer = null;
  var pendingContext = {};
  // Promise da última busca de aparência (setada em init(), reaproveitada por
  // toda a sessão da SPA — ver avaliarTourAutomatico/aguardarAparenciaEIniciarTour).
  // Como o host normalmente chama init() uma única vez e o resto da navegação
  // acontece via pushState/popstate (bindSpaListeners), essa promise já
  // resolvida funciona como cache: reavaliações disparadas por handleUrlChange
  // não geram um novo fetch nem um novo flash, só reaproveitam o resultado.
  var aparenciaPromise = null;

  // ─── Modo debug ───────────────────────────────────────────────────────────
  // Puramente observacional: nunca altera elegibilidade, exibição ou
  // comportamento do widget — só loga, no console, o que o runtime já
  // decidiu por conta própria. Ativado por ?userpulse_debug=1 na URL da
  // página host (checado uma vez aqui, no carregamento do script) ou a
  // qualquer momento via window.UserPulse.debug(). Nada é logado por padrão.
  var debugState = { enabled: false };
  try {
    debugState.enabled = /(?:^|[?&])userpulse_debug=1(?:&|$)/.test(window.location.search);
  } catch (_e) { /* window.location indisponível (ambiente não-browser) */ }

  // Chaves nunca logadas em claro — cobre senha/token/CPF/cartão mesmo em
  // campos futuros com nomes parecidos (ex.: senha_atual, auth_token).
  var DEBUG_CHAVE_SENSIVEL_RE = /senha|password|token|cpf|cart[aã]o|card|auth/i;
  var DEBUG_CHAVE_EMAIL_RE = /email/i;

  function debugMascarar(chave, valor) {
    if (typeof valor === 'string' && DEBUG_CHAVE_SENSIVEL_RE.test(chave)) return '[redacted]';
    if (typeof valor === 'string' && DEBUG_CHAVE_EMAIL_RE.test(chave) && valor.indexOf('@') !== -1) {
      var partes = valor.split('@');
      return (partes[0].charAt(0) || '*') + '***@' + partes[1];
    }
    return valor;
  }

  // Clone raso/recursivo só para exibição no console — nunca usado para
  // decidir nada, então um clone "sujeito a falha silenciosa" é aceitável.
  function debugSanitizar(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    try {
      var out = Array.isArray(obj) ? [] : {};
      for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        out[k] = (v && typeof v === 'object') ? debugSanitizar(v) : debugMascarar(k, v);
      }
      return out;
    } catch (_e) {
      return '[unavailable]';
    }
  }

  // Log estruturado opt-in. `detalhes` pode ser um objeto (console.table,
  // quando array) ou omitido. Nunca lança — um console.* indisponível ou um
  // dado não serializável não pode derrubar o runtime do widget.
  function debugLog(categoria, detalhes) {
    if (!debugState.enabled) return;
    try {
      var grupo = console.groupCollapsed ? 'groupCollapsed' : 'log';
      console[grupo]('[UserPulse debug] ' + categoria);
      if (detalhes !== undefined) {
        if (Array.isArray(detalhes) && console.table) console.table(detalhes);
        else console.log(detalhes);
      }
      if (console.groupEnd) console.groupEnd();
    } catch (_e) { /* console indisponível/instrumentado de forma inesperada — ignora */ }
  }

  function debugStatusUrl() {
    try {
      return {
        href: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      };
    } catch (_e) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function apiUrl(path) {
    return scriptOrigin + path;
  }

  // campanhaParam/configParam (opcionais) — os 4 call sites de
  // modal_automatica (scheduleAutoOpen, toggle, CTA, formulário de
  // telefone) continuam chamando só com tipoEvento, usando o singleton
  // state.campanha/state.config de sempre. destaque_elemento passa os 4
  // parâmetros explícitos (campanha/config/destaqueItemId vêm do fechamento
  // de destaqueElementoMontarItem, nunca do state singleton — cada
  // instância tem seu próprio item). Tudo dentro de try/catch: falha de
  // rastreamento (erro síncrono ou de rede via .catch) nunca pode quebrar o
  // site do cliente onde o widget está embarcado.
  function registrarEvento(tipoEvento, campanhaParam, configParam, destaqueItemId) {
    try {
      var campanha = campanhaParam || state.campanha;
      var config = configParam || state.config;
      if (!campanha || !config) return;
      fetch(apiUrl('/api/widget/evento'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          public_key: config.public_key || undefined,
          campanha_id: campanha.id,
          tipo_evento: tipoEvento,
          destaque_item_id: destaqueItemId || undefined,
          usuario_id: config.usuario_id || undefined,
          sistema: config.sistema || undefined,
          tela: config.tela || undefined,
          navegador: window.navigator.userAgent,
          dispositivo: getDevice(),
          contexto: config.contexto || undefined,
        }),
      }).catch(function () { /* fail silently */ });
    } catch (_e) { /* rastreamento nunca pode quebrar o site do cliente */ }
  }

  function getDevice() {
    var width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.up-widget-root{position:fixed;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#0b1c30}',
      '.up-widget-overlay{inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(11,28,48,.45)}',
      '.up-widget-root *{box-sizing:border-box}',
      '.up-fab{width:56px;height:56px;border:0;border-radius:999px;background:#0058be;color:#fff;box-shadow:0 18px 40px rgba(0,88,190,.28);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}',
      '.up-fab:hover{transform:translateY(-1px) scale(1.04);box-shadow:0 20px 44px rgba(0,88,190,.34)}',
      '.up-fab:active{transform:scale(.96)}',
      '.up-fab svg{width:24px;height:24px;fill:currentColor}',
      '.up-fab-close{background:#0b1c30;color:#f8f9ff}',
      '.up-modal{position:static;width:100%;max-width:560px;background:#fff;border:1px solid #c2c6d6;border-radius:16px;box-shadow:0 24px 70px rgba(11,28,48,.22);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 32px)}',
      '.up-modal-enter{animation:up-fade-in .2s ease-out}',
      // align-items:flex-start (era center) nas duas regras abaixo — com
      // .up-title agora permitindo quebra de linha (ver comentário logo
      // abaixo), um título de 2+ linhas deve alinhar o ícone ao topo da
      // primeira linha e manter o botão fechar encostado no topo direito,
      // em vez de tudo recentralizar verticalmente conforme o header cresce.
      '.up-modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(194,198,214,.45);flex-shrink:0}',
      '.up-brand{display:flex;align-items:flex-start;gap:10px;min-width:0}',
      // Fundo azul-claro + ícone azul (mesmo par de tokens já usado por
      // .up-tour-progress logo abaixo: --up-primary-soft pro fundo,
      // --up-primary pro texto/ícone) — mesmo estilo do círculo no preview
      // do Campanhas 2 (ícone campaign/rocket_launch/quiz sobre fundo suave
      // da cor do sistema, ver campanhas2/Index.tsx), não mais fundo sólido
      // + ícone branco.
      '.up-brand-icon{width:32px;height:32px;border-radius:999px;background:var(--up-primary-soft, rgba(0,88,190,.1));color:var(--up-primary, #0058be);display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
      // Sem esta regra, o <svg> de campaignIconName() (sem width/height nem
      // fill próprios, mesmo padrão de .up-fab svg/.up-close svg logo abaixo)
      // cai no tamanho padrão do navegador pra um <svg> só com viewBox (bem
      // maior que os 32px do círculo) e no fill preto padrão do SVG — o
      // ícone real do widget fica estourado, bem diferente do ícone de
      // 18px que o preview do Campanhas 2 mostra pro mesmo tipo
      // (iconeTipoCampanha, campanhas2/Index.tsx) — mesma regra de ícone
      // por tipo nos dois lados, só a exibição no widget que faltava.
      // `color` repetido aqui (já existe em .up-brand-icon, o pai) de
      // propósito: currentColor em `fill` resolve o `color` computado do
      // PRÓPRIO elemento — declarar os dois juntos na mesma regra evita
      // depender da herança de color atravessar corretamente do container
      // pro svg (qualquer regra/estilo do site hospedeiro que reset color
      // no meio do caminho não quebra o ícone).
      '.up-brand-icon svg{width:18px;height:18px;color:var(--up-primary, #0058be);fill:currentColor;flex-shrink:0}',
      // Sem white-space:nowrap/overflow:hidden/text-overflow:ellipsis — título
      // grande agora quebra linha em vez de truncar com "...", igual ao
      // preview do Campanhas 2 (CardEditavel/PreviewCampanhaModal, ver
      // campanhas2/Index.tsx). overflow-wrap:break-word só protege o caso de
      // uma palavra única maior que a largura disponível (ex.: sem espaços);
      // não afeta a quebra normal entre palavras.
      '.up-title{font-size:15px;line-height:21px;font-weight:800;color:#0b1c30;margin:0;overflow-wrap:break-word}',
      '.up-close{border:0;background:transparent;color:#727785;padding:4px;border-radius:8px;cursor:pointer;line-height:0;flex-shrink:0;display:flex;align-items:center;justify-content:center}',
      '.up-close:hover{background:#eff4ff;color:#0b1c30}',
      '.up-close svg{width:20px;height:20px;fill:currentColor;display:block;flex-shrink:0}',
      '.up-body{padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;min-height:0}',
      '.up-subtitle{margin:0;color:#0058be;font-size:13px;line-height:18px;font-weight:800}',
      '.up-description{margin:0;color:#424754;font-size:14px;line-height:21px}',
      '.up-feedback-section{display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid #e0e2ef}',
      '.up-question{margin:0;color:#0b1c30;font-size:15px;line-height:21px;font-weight:700}',
      '.up-media{width:100%;overflow:hidden;border-radius:12px;background:#eff4ff;border:1px solid rgba(194,198,214,.45)}',
      '.up-media[data-up-media="true"]{position:relative;height:0;padding-bottom:56.25%}',
      '.up-media[data-up-media="true"] iframe{position:absolute;top:0;left:0;width:100%;height:100%;display:block;border:0}',
      '.up-media img{display:block;width:100%;height:auto;object-fit:contain}',
      '.up-action{display:flex;width:100%;min-height:42px;align-items:center;justify-content:center;border:0;border-radius:12px;cursor:pointer;background:var(--up-primary, #6b38d4);color:#fff;text-decoration:none;font-size:12px;line-height:16px;font-weight:800;transition:opacity .15s ease,transform .15s ease}',
      '.up-action:hover{opacity:.92}',
      '.up-action:active{transform:scale(.98)}',
      '.up-scale{display:flex;gap:4px;width:100%}',
      '.up-score{flex:1;min-width:22px;height:34px;border-radius:8px;border:1px solid #c2c6d6;background:#fff;color:#424754;font-size:12px;font-weight:800;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}',
      '.up-score:hover{background:var(--up-primary-soft, #d8e2ff);border-color:var(--up-primary, #0058be);color:var(--up-primary, #0058be);transform:translateY(-1px)}',
      '.up-score-active{background:var(--up-primary, #0058be);border-color:var(--up-primary, #0058be);color:#fff}',
      '.up-scale-labels{display:flex;justify-content:space-between;margin-top:6px;color:#727785;font-size:10px;line-height:14px;font-weight:800;text-transform:uppercase}',
      '.up-textarea{width:100%;min-height:72px;resize:vertical;border:1px solid #c2c6d6;border-radius:12px;background:#f8f9ff;color:#0b1c30;padding:10px 12px;font:inherit;font-size:14px;line-height:20px;outline:none}',
      '.up-textarea:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16)}',
      '.up-required{margin:-8px 0 0;color:#ba1a1a;font-size:11px;line-height:16px}',
      '.up-error{margin:0;color:#ba1a1a;font-size:12px;line-height:16px}',
      '.up-confirm-check{display:flex;align-items:center;gap:10px;border:1px solid #c2c6d6;border-radius:12px;background:#f8f9ff;padding:10px 12px;color:#424754;font-size:13px;line-height:18px;font-weight:700}',
      '.up-confirm-check input{width:16px;height:16px;accent-color:var(--up-primary, #0058be);flex:0 0 auto}',
      '.up-submit{width:100%;height:42px;border:0;border-radius:12px;background:var(--up-primary, #0058be);color:#fff;font-size:12px;line-height:16px;font-weight:800;cursor:pointer;transition:opacity .15s ease,transform .15s ease}',
      '.up-submit:hover{opacity:.92}',
      '.up-submit:active{transform:scale(.98)}',
      '.up-submit:disabled{opacity:.42;cursor:not-allowed;transform:none}',
      '.up-thanks{padding:26px 22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;overflow-y:auto;flex:1;min-height:0}',
      '.up-check{width:62px;height:62px;border-radius:999px;background:rgba(0,105,71,.1);color:#006947;display:flex;align-items:center;justify-content:center}',
      '.up-thanks h4{margin:0;color:#0b1c30;font-size:20px;line-height:28px;font-weight:800}',
      '.up-thanks p{margin:0;color:#424754;font-size:14px;line-height:20px}',
      '.up-secondary{width:100%;height:40px;border:1px solid #c2c6d6;border-radius:12px;background:#fff;color:#424754;font-size:12px;font-weight:800;cursor:pointer}',
      '@keyframes up-fade-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}',
      '@media (max-width:600px){.up-widget-overlay{padding:8px}.up-modal{max-height:calc(100vh - 16px);border-radius:12px}.up-modal-header{padding:11px 14px}.up-body{padding:12px 14px 14px;gap:10px}.up-feedback-section{gap:8px;padding-top:10px}.up-scale{gap:2px}.up-score{height:28px;font-size:11px;min-width:20px}.up-textarea{min-height:60px}.up-thanks{padding:18px 14px;gap:8px}}',
      '@media (max-width:420px){.up-scale{flex-wrap:wrap;justify-content:center;gap:3px}.up-score{flex:0 0 calc(100%/6 - 3px);height:28px;font-size:10px}}',
      '.up-phone-section{display:flex;flex-direction:column;gap:10px;border-top:1px solid #e0e2ef;margin-top:4px;padding-top:14px}',
      '.up-phone-label{margin:0;color:#424754;font-size:13px;line-height:18px;font-weight:600;text-align:center}',
      '.up-phone-input{width:100%;border:1px solid #c2c6d6;border-radius:12px;background:#f8f9ff;color:#0b1c30;padding:10px 12px;font:inherit;font-size:14px;line-height:20px;outline:none}',
      '.up-phone-input:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16)}',
      '.up-phone-done{margin:0;color:#006947;font-size:13px;line-height:18px;font-weight:600;text-align:center}',
      '.up-tour-overlay{position:fixed;inset:0;z-index:2147483600;pointer-events:none}',
      // Sem isso, o runtime do tour (raiz própria, fora de .up-widget-root)
      // ficava no content-box padrão do navegador — padding/border somados
      // ao width declarado podiam empurrar o tooltip pra fora da viewport em
      // telas estreitas (a mesma causa da "faixa branca lateral" no mobile).
      '.up-tour-overlay, .up-tour-overlay *{box-sizing:border-box}',
      // Anel branco fino (separação nítida do elemento) + anel azul da marca
      // + brilho externo suave — no lugar do anel duplo "cru" de antes.
      // rgba(11,28,48,X) é o mesmo tom escuro já usado no resto do widget
      // (.up-rec-overlay/.up-widget-overlay), só um pouco mais opaco aqui
      // pra dar mais contraste ao spotlight. Estático de propósito (a
      // primeira versão pulsava, mas ficou cansativo num tour de vários
      // passos) — só o transition de posição/tamanho abaixo continua
      // responsável por qualquer movimento, no reposicionamento normal.
      '.up-tour-spotlight{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(11,28,48,.55),0 0 0 2px #fff,0 0 0 5px var(--up-primary, #0058be),0 0 16px 3px var(--up-primary-ring, rgba(0,88,190,.28));pointer-events:none;transition:top .2s ease,left .2s ease,width .2s ease,height .2s ease}',
      '.up-tour-tooltip{position:fixed;z-index:2147483601;width:300px;max-width:calc(100vw - 24px);background:#fff;border:1px solid rgba(194,198,214,.4);border-radius:20px;box-shadow:0 1px 2px rgba(11,28,48,.04),0 16px 36px -12px rgba(11,28,48,.22);padding:20px;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#0b1c30;animation:up-fade-in .18s ease-out}',
      // As telas centralizadas (intro/conclusão/aguardando/não encontrado/erro)
      // usam position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)
      // inline pra centralizar — mas a animação padrão acima (up-fade-in) anima
      // a própria propriedade transform só com scale(), sem a translação.
      // Durante os 180ms da animação, o valor animado de transform SUBSTITUI o
      // inline inteiro (não soma com ele), então o elemento renderizava sem o
      // translate(-50%,-50%) por um instante — aparecendo deslocado (metade da
      // largura/altura abaixo e à direita do centro) e só "pulando" pro lugar
      // certo quando a animação terminava e o inline voltava a valer. Esta
      // variante (aplicada só nessas 6 telas centralizadas, via classe extra
      // no markup) já inclui o translate em ambos os keyframes, então a
      // animação nunca diverge da posição final — sem afetar em nada o
      // tooltip normal dos passos (esse não usa translate pra se posicionar,
      // continua com a animação padrão de sempre).
      '.up-tour-tooltip-central{animation:up-tour-fade-in-central .18s ease-out}',
      '@keyframes up-tour-fade-in-central{from{opacity:0;transform:translate(-50%,-50%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
      '.up-tour-progress{display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;color:var(--up-primary, #0058be);text-transform:uppercase;letter-spacing:.03em;margin:0 0 9px;background:var(--up-primary-soft, rgba(0,88,190,.1));border-radius:999px;padding:2px 9px}',
      '.up-tour-title{font-size:17px;font-weight:800;color:#0b1c30;margin:0 0 8px;line-height:23px;letter-spacing:-.005em}',
      '.up-tour-desc{font-size:13.5px;line-height:21px;color:#4b5163;margin:0;overflow-wrap:break-word}',
      // ::before em vez de um ícone/marcador no markup — o mesmo <p> de
      // sempre, só com um indicador visual (bolinha pulsante) a mais.
      '.up-tour-hint{font-size:11px;font-weight:700;color:var(--up-primary, #0058be);margin-top:10px;display:flex;align-items:center}',
      '.up-tour-hint::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--up-primary, #0058be);margin-right:7px;flex-shrink:0;animation:up-tour-blink 1.4s ease-in-out infinite}',
      '@keyframes up-tour-blink{0%,100%{opacity:1}50%{opacity:.35}}',
      '.up-tour-warning{font-size:12px;line-height:17px;color:#ba1a1a;margin-top:12px;display:flex;gap:8px;align-items:flex-start;background:rgba(186,26,26,.07);border:1px solid rgba(186,26,26,.14);border-radius:10px;padding:10px 12px}',
      '.up-tour-warning svg{width:15px;height:15px;flex-shrink:0;margin-top:1px;fill:currentColor}',
      '.up-tour-loading{font-size:12px;line-height:17px;color:#5b6170;margin-top:12px;display:flex;gap:9px;align-items:center;background:#f4f6fb;border:1px solid rgba(194,198,214,.5);border-radius:10px;padding:10px 12px}',
      '.up-tour-spinner{width:13px;height:13px;flex-shrink:0;border-radius:50%;border:2px solid var(--up-primary-soft, rgba(0,88,190,.2));border-top-color:var(--up-primary, #0058be);animation:up-tour-spin .7s linear infinite}',
      '@keyframes up-tour-spin{to{transform:rotate(360deg)}}',
      '.up-tour-footer{display:flex;align-items:center;justify-content:space-between;margin-top:16px;gap:10px;flex-wrap:wrap}',
      '.up-tour-dots{display:flex;gap:6px;align-items:center}',
      '.up-tour-dot{width:6px;height:6px;border-radius:999px;background:#e3e7f2;flex-shrink:0;transition:width .2s ease,background-color .2s ease}',
      '.up-tour-dot-active{background:var(--up-primary, #0058be);width:18px;border-radius:4px}',
      '.up-tour-nav{display:flex;gap:8px}',
      // min-height garante uma área de toque decente em mobile mesmo com
      // texto curto (Voltar/Pular), sem exagerar na altura em telas normais.
      '.up-tour-btn{border:0;border-radius:10px;padding:9px 15px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;line-height:1;min-height:36px;transition:opacity .15s ease,transform .15s ease,box-shadow .15s ease,background-color .15s ease}',
      '.up-tour-btn:hover{opacity:.92;transform:translateY(-1px)}',
      '.up-tour-btn:active{transform:scale(.97) translateY(0)}',
      '.up-tour-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}',
      '.up-tour-btn:focus-visible{outline:2px solid var(--up-primary, #0058be);outline-offset:2px}',
      // Sombra própria no CTA principal — separa ele visualmente do
      // secundário/texto mesmo à distância, sem depender só da cor. Mais
      // discreta que a primeira versão (essa parecia "pesada" demais).
      '.up-tour-btn-primary{background:var(--up-primary, #0058be);color:#fff;box-shadow:0 4px 12px -3px var(--up-primary-ring, rgba(0,88,190,.45))}',
      '.up-tour-btn-primary:hover{box-shadow:0 6px 16px -3px var(--up-primary-ring, rgba(0,88,190,.5))}',
      '.up-tour-btn-secondary{background:#eff4ff;color:#0058be}',
      '.up-tour-btn-secondary:hover{background:#e2ecff}',
      // "Voltar" segue a identidade visual da Aparência do Widget (mesma cor
      // do CTA principal/badge/progresso) — as outras variantes de
      // .up-tour-btn-secondary (Pular este passo/Trocar elemento) continuam
      // com o tom neutro de sempre, de propósito: só o botão de navegação
      // "para trás" precisa acompanhar a cor principal. Fallback idêntico ao
      // valor hardcoded anterior (#eff4ff/#e2ecff), então sem Aparência
      // configurada o visual não muda em nada.
      '.up-tour-btn-secondary[data-up-tour-back]{background:var(--up-primary-soft, #eff4ff);color:var(--up-primary, #0058be)}',
      '.up-tour-btn-secondary[data-up-tour-back]:hover{background:var(--up-primary-soft, #e2ecff)}',
      '.up-tour-btn-text{background:transparent;color:#6b7180;padding:9px 6px}',
      '.up-tour-btn-text:hover{color:#0b1c30}',
      '.up-tour-close{position:absolute;top:12px;right:12px;border:0;background:transparent;color:#8b91a0;padding:6px;border-radius:8px;cursor:pointer;line-height:0}',
      '.up-tour-close:hover{background:#eff4ff;color:#0b1c30}',
      '.up-tour-close:focus-visible{outline:2px solid var(--up-primary, #0058be);outline-offset:2px}',
      '.up-tour-close svg{width:14px;height:14px;fill:currentColor;display:block}',
      // Footer empilhado (introdução / elemento não encontrado) — 3 ações
      // full-width em vez do par Voltar/Próximo lado a lado do footer padrão.
      '.up-tour-footer-stack{flex-direction:column;align-items:stretch;gap:8px}',
      '.up-tour-footer-stack .up-tour-btn{width:100%;text-align:center}',
      // Badge com ícone no topo da introdução/conclusão (referência visual:
      // docs/references/tour-runtime-stitch/, não commitado) — quadrado com
      // cantos arredondados e gradiente da própria marca, SVG inline (mesmo
      // sistema de ícones já usado no resto do widget, sem asset externo).
      // Modificador -sucesso só troca a cor pro tom de "concluído".
      '.up-tour-badge-icone{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--up-primary, #0058be),var(--up-primary-hover, #2b7bde));display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 8px 18px -8px var(--up-primary-ring, rgba(0,88,190,.45));overflow:hidden}',
      '.up-tour-badge-icone svg{width:28px;height:28px;fill:#fff;flex-shrink:0}',
      '.up-tour-badge-icone-sucesso{background:linear-gradient(135deg,#0a8a5c,#12b877);box-shadow:0 10px 22px -8px rgba(10,138,92,.5)}',
      // Variante com logo configurada (URL própria do cliente) — fundo claro
      // neutro em vez do gradiente da marca, já que a logo carrega sua
      // própria identidade visual; declarada DEPOIS de -sucesso de propósito
      // (mesma especificidade de seletor — a ordem no stylesheet decide, e
      // aqui a logo sempre deve vencer o verde de conclusão quando as duas
      // classes coexistem no mesmo badge). max-width/max-height (não
      // width/height:100%) deixam uma margem dentro do container fixo —
      // "nunca distorce, nunca estoura o container" mesmo com imagens de
      // proporção bem diferente de 1:1.
      '.up-tour-badge-icone-logo{background:#fff;border:1px solid rgba(194,198,214,.5);box-shadow:0 6px 18px -8px rgba(11,28,48,.25)}',
      '.up-tour-badge-logo{max-width:68%;max-height:68%;width:auto;height:auto;object-fit:contain;display:block}',
      '.up-tour-badge-fallback{width:100%;height:100%;align-items:center;justify-content:center}',
      // Introdução: as ações (Começar/Agora não/Não mostrar novamente) não
      // deveriam ter o mesmo peso visual — sem isso, "Agora não" competia com
      // o CTA principal. Seletor por data-attribute (já existente no
      // markup) pra afetar só a intro, sem mudar "Voltar/Pular/Encerrar" do
      // estado "elemento não encontrado", que usam as MESMAS classes
      // genéricas mas continuam precisando parecer ações reais, não um
      // dispensar sutil. Escopado com .up-tour-btn-secondary (não só o
      // data-attribute) porque o próprio X de fechar também usa
      // data-up-tour-intro-dispensar (mesma ação) — sem essa classe junto,
      // esta regra vazaria pro botão de fechar.
      '.up-tour-btn-secondary[data-up-tour-intro-dispensar]{background:transparent;color:#6b7180;border:0;box-shadow:none}',
      '.up-tour-btn-secondary[data-up-tour-intro-dispensar]:hover{background:#f4f6fb;color:#0b1c30}',
      // CTA com ícone (seta) — só a introdução usa ícone dentro do botão,
      // por isso o alinhamento flex é escopado ao data-attribute em vez de
      // ir pra .up-tour-btn-primary em geral (Concluir/Próximo continuam só
      // texto, sem precisar de nenhum ajuste).
      '[data-up-tour-intro-comecar]{display:inline-flex;align-items:center;justify-content:center;gap:6px}',
      '[data-up-tour-intro-comecar] svg{width:15px;height:15px;fill:currentColor}',
      // "Não mostrar novamente" virou uma opção separada, com divisória
      // própria (não mais um 3º botão empilhado) — checkbox decorativo via
      // ::before/span (nunca um <input> real: a ação já dispara e fecha o
      // tour num clique só, não existe um estado "marcado" persistente pra
      // refletir depois — ver tourPular()).
      '.up-tour-intro-opcional{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:16px;padding-top:16px;border:0;border-top:1px solid #edf0f7;background:transparent;color:#9298a6;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;transition:color .15s ease}',
      '.up-tour-intro-opcional:hover{color:#5b6170}',
      '.up-tour-intro-opcional-caixa{width:13px;height:13px;border-radius:4px;border:1.5px solid #c2c6d6;flex-shrink:0;transition:border-color .15s ease}',
      '.up-tour-intro-opcional:hover .up-tour-intro-opcional-caixa{border-color:#8b91a0}',
      '.up-tour-dots-intro{justify-content:center;margin:12px 0 2px}',
      '.up-tour-feedback{display:flex;gap:10px;justify-content:center;margin-top:16px}',
      '.up-tour-feedback-btn{border:1px solid rgba(194,198,214,.5);background:#f8f9ff;border-radius:14px;width:46px;height:46px;font-size:22px;line-height:1;cursor:pointer;transition:transform .15s ease,background .15s ease,border-color .15s ease;display:flex;align-items:center;justify-content:center}',
      '.up-tour-feedback-btn:hover{background:var(--up-primary-soft, #eff4ff);border-color:var(--up-primary, #0058be);transform:scale(1.08) translateY(-1px)}',
      '.up-tour-feedback-btn:active{transform:scale(.95)}',
      '.up-tour-feedback-btn:focus-visible{outline:2px solid var(--up-primary, #0058be);outline-offset:2px}',
      '@media (max-width:480px){.up-tour-tooltip{width:calc(100vw - 24px);padding:16px}}',
      // Telas bem estreitas: em vez de espremer Pular + Voltar + Próximo na
      // mesma linha (risco de quebrar/cortar texto), o par Voltar/Próximo
      // ocupa a linha toda dividido meio a meio, e Pular desce pra uma linha
      // própria, centralizado — sem precisar reordenar nada no HTML (mesmo
      // DOM de sempre, só a ordem visual via CSS).
      '@media (max-width:420px){.up-tour-footer{gap:8px}.up-tour-footer>.up-tour-btn-text{order:3;width:100%;text-align:center;padding:6px}.up-tour-nav{order:2;width:100%}.up-tour-nav .up-tour-btn{flex:1}}',
      // Barra flutuante — fundo sempre escuro de propósito (independente do
      // tema claro/escuro da página host), pra garantir contraste e leitura
      // em qualquer sistema onde o widget for embedado.
      '.up-rec-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483640;display:flex;align-items:center;gap:8px;background:#0b1c30;color:#f8f9ff;padding:9px 14px;border-radius:999px;box-shadow:0 18px 40px rgba(11,28,48,.35);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;font-size:13px;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}',
      '.up-rec-dot{width:8px;height:8px;border-radius:50%;background:#ff5252;flex-shrink:0;animation:up-rec-blink 1.2s ease-in-out infinite}',
      '@keyframes up-rec-blink{0%,100%{opacity:1}50%{opacity:.25}}',
      '.up-rec-label{font-weight:800;white-space:nowrap;letter-spacing:.01em}',
      // Contador como selo (fundo translúcido) — se destaca do "label" e do
      // "último passo" em vez de ser só mais um texto solto na mesma linha.
      '.up-rec-contador{white-space:nowrap;background:rgba(255,255,255,.14);border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700}',
      '.up-rec-ultimo{opacity:.65;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-size:12px}',
      '.up-rec-aviso{display:none;width:100%;flex-basis:100%;text-align:center;color:#ffd54f;font-weight:700;font-size:11px;margin-top:2px}',
      // Opção "Revisar passos em tempo real" — mesma linha cheia
      // (flex-basis:100%) que .up-rec-aviso/.up-rec-troca-info usam pra
      // quebrar dentro da barra flutuante sem depender de layout extra.
      '.up-rec-toggle{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:#f8f9ff;cursor:pointer;white-space:nowrap;flex-basis:100%;justify-content:center;opacity:.85}',
      '.up-rec-toggle:hover{opacity:1}',
      '.up-rec-toggle input{width:13px;height:13px;accent-color:#0058be;cursor:pointer;flex-shrink:0;margin:0}',
      '.up-rec-toggle-hint{flex-basis:100%;text-align:center;font-size:10px;font-style:italic;color:rgba(248,249,255,.65);line-height:1.35}',
      '.up-rec-aviso.up-rec-aviso-visivel{display:block}',
      // Barra principal — 3 linhas (status / ações / opção), mais estreita e
      // compacta que o pill de uma linha só usada por troca/localizar (essas
      // continuam com .up-rec-bar puro, sem nenhuma destas regras).
      // backdrop-filter é só reforço estético (efeito "vidro fosco") — sem
      // suporte, cai de volta pro fundo sólido de sempre, sem perda de
      // legibilidade nem de nenhuma outra funcionalidade.
      // border-radius bem menor que o .up-rec-bar padrão (pílula) — fica com
      // cara de toolbar retangular, não de "bolha" alta, mesmo com 3 linhas.
      '.up-rec-bar-principal{max-width:min(324px, calc(100vw - 24px));padding:6px 10px;gap:3px;font-size:11px;background:rgba(11,28,48,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:14px}',
      '.up-rec-bar-linha{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;flex-basis:100%}',
      '.up-rec-bar-linha-status .up-rec-ultimo{max-width:130px}',
      '.up-rec-bar-linha-acoes{gap:5px}',
      '.up-rec-bar-linha-acoes .up-rec-btn{padding:4px 8px;font-size:10.5px}',
      // Ícone + texto curto (Pausar/Desfazer/Cancelar) — nunca só ícone: com
      // texto sempre visível, não depende de title (evita o tooltip nativo
      // do navegador aparecendo por cima da toolbar ao passar o mouse).
      // Mesmo padding pros dois estados do botão principal (Pausar/
      // Continuar) — só o texto/cor mudam, a toolbar não "pula" de tamanho.
      '.up-rec-btn-bar{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:5px 8px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#f8f9ff;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer;transition:background .12s ease,transform .1s ease}',
      '.up-rec-btn-bar svg{width:12px;height:12px;fill:currentColor;display:block;flex-shrink:0}',
      '.up-rec-btn-bar:hover{background:rgba(255,255,255,.2)}',
      '.up-rec-btn-bar:active{transform:scale(.96)}',
      '.up-rec-btn-bar:disabled{opacity:.3;cursor:not-allowed;transform:none}',
      '.up-rec-btn-bar-danger{background:rgba(255,82,82,.16);color:#ffb4b4}',
      '.up-rec-btn-bar-danger:hover{background:rgba(255,82,82,.28)}',
      // Continuar (só quando pausado) ganha a cor primária — mesmo formato/
      // padding dos outros botões da fileira, só troca o fundo pra azul.
      '.up-rec-btn-bar.up-rec-btn-primary{background:#0058be;font-weight:800}',
      '.up-rec-btn-bar.up-rec-btn-primary:hover{background:#0058be;opacity:.9}',
      '.up-rec-bar-finalizar{display:inline-flex;align-items:center;gap:5px}',
      '.up-rec-bar-finalizar svg{width:13px;height:13px;fill:currentColor}',
      // Estado pausado: bolinha para de piscar e vira âmbar, rótulo do
      // status acompanha a cor — dá pra perceber o estado sem ler o texto
      // do botão Continuar.
      '.up-rec-bar-pausado .up-rec-dot{background:#ff9f43;animation:none}',
      '.up-rec-bar-pausado .up-rec-label{color:#ffc48a}',
      '.up-rec-bar-linha-opcao{gap:2px;margin-top:1px;padding-top:4px;border-top:1px solid rgba(255,255,255,.1)}',
      '.up-rec-bar-linha-opcao .up-rec-toggle{opacity:.9;font-size:11px}',
      '.up-rec-bar-linha-opcao .up-rec-toggle-hint{font-size:9.5px}',
      '.up-rec-troca-info{flex-basis:100%;text-align:center;opacity:.85;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}',
      '.up-rec-troca-status{flex-basis:100%;text-align:center;color:#ffd54f;font-weight:700;font-size:11px}',
      // Barra de troca: bolinha azul (não a vermelha piscante de "gravando")
      // e o título do passo como subtítulo próprio, deixando claro que essa
      // é uma ação pontual de seleção, não a gravação em si.
      '.up-rec-bar-troca .up-rec-dot{background:#4dabff;animation:none;box-shadow:0 0 0 3px rgba(77,171,255,.25)}',
      '.up-rec-troca-titulo-passo{flex-basis:100%;text-align:center;font-size:12px;font-weight:600;opacity:.92}',
      '.up-rec-destaque{position:fixed;z-index:2147483630;border-radius:10px;box-shadow:0 0 0 9999px rgba(11,28,48,.35),0 0 0 3px #0058be,0 0 0 5px rgba(0,88,190,.25);pointer-events:none;transition:top .15s ease,left .15s ease,width .15s ease,height .15s ease}',
      '.up-rec-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}',
      // Base pensada pro fundo ESCURO da barra flutuante (texto branco sobre
      // branco-translúcido). Nunca usar sozinha (só .up-rec-btn) em botões
      // dentro de modais de fundo BRANCO (.up-rec-modal) — fica texto branco
      // sobre fundo quase branco, efetivamente invisível. Modais claros devem
      // sempre combinar com .up-rec-btn-primary, .up-rec-btn-secondary ou
      // .up-rec-btn-danger.
      '.up-rec-btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-family:inherit;white-space:nowrap;opacity:1;visibility:visible;transition:background .15s ease,opacity .15s ease,transform .1s ease}',
      '.up-rec-btn:hover{background:rgba(255,255,255,.24)}',
      '.up-rec-btn:active{transform:scale(.97)}',
      '.up-rec-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}',
      // Ação principal (Gerar JSON, Copiar JSON, Copiar e abrir importação) —
      // mesmo azul primário e mesmo hover:opacity (não escurecer) usado nos
      // botões primários do admin (ex.: "Iniciar gravação"/"Adicionar passo").
      '.up-rec-btn-primary{background:#0058be;color:#fff}',
      '.up-rec-btn-primary:hover{background:#0058be;opacity:.9}',
      // Variante pra uso em modal de fundo branco (Copiar/Baixar/Fechar) —
      // mesmo esquema de cor já usado em .up-rec-btn-icone, legível sobre #fff.
      '.up-rec-btn-secondary{background:#eff4ff;color:#0058be}',
      '.up-rec-btn-secondary:hover{background:#dbe8ff}',
      // Estado "ligado" de um botão secundário com toggle (ex.: Analisar
      // passos enquanto a análise está visível) — mesmo tom do primário, pra
      // deixar claro que a ação já foi ativada.
      '.up-rec-btn-secondary-ativo{background:#0058be;color:#fff}',
      '.up-rec-btn-secondary-ativo:hover{background:#0058be;opacity:.9}',
      '.up-rec-btn-danger{background:rgba(255,82,82,.22);color:#fff}',
      '.up-rec-btn-danger:hover{background:rgba(255,82,82,.36)}',
      '.up-rec-overlay{position:fixed;inset:0;z-index:2147483650;display:flex;align-items:center;justify-content:center;background:rgba(11,28,48,.55);padding:16px}',
      '.up-rec-modal{width:100%;max-width:720px;max-height:calc(100vh - 32px);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(11,28,48,.3);padding:20px;display:flex;flex-direction:column;gap:10px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#0b1c30}',
      // Mini revisão pós-clique — mais estreito e compacto que o modal de
      // revisão final (só título/descrição/2 selects), pra ler como uma
      // interrupção rápida, não uma segunda tela cheia.
      '.up-rec-modal-mini{max-width:380px;gap:6px}',
      // Painel lateral "Passos capturados" (opcional, revisarTempoReal) — ao
      // contrário de .up-rec-overlay, NÃO cobre a tela inteira: fica ancorado
      // na borda direita, com largura fixa, pra não bloquear cliques no resto
      // da página (a gravação continua rodando por trás normalmente).
      // Altura: hug-content (nunca estica até o rodapé da viewport à toa,
      // evitando o vão vazio entre as ações do passo e "Finalizar e
      // revisar"), limitada por max-height — quando o conteúdo (lista de
      // passos + detalhe) excede isso, as regras de overflow-y:auto próprias
      // de .up-rec-lateral-lista/.up-rec-lateral-detalhe assumem o scroll
      // interno, mantendo cabeçalho e rodapé sempre visíveis.
      '.up-rec-lateral{position:fixed;top:16px;right:16px;max-height:calc(100vh - 32px);width:296px;max-width:calc(100vw - 32px);z-index:2147483620;background:#fff;border:1px solid rgba(194,198,214,.4);border-radius:16px;box-shadow:0 20px 55px rgba(11,28,48,.25);display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#0b1c30;overflow:hidden}',
      // Sem isso, itens do painel lateral usam o content-box padrão do
      // navegador — adicionar border-top ao item sob o cursor durante um
      // drag (.up-rec-lateral-item-dragover, mais abaixo) crescia a altura
      // dele em vez de só desenhar a borda, empurrando os itens seguintes
      // pra baixo a cada evento dragover. Isso deslocava em cascata qual
      // elemento ficava sob o cursor, fazendo o navegador perder o alvo
      // certo do arrasto sempre que a lista tinha itens suficientes pra
      // rolar (bug real, mais fácil de reproduzir com o agrupamento por
      // seção porque os cabeçalhos de grupo já deixam a lista mais perto do
      // limite de scroll com menos passos).
      '.up-rec-lateral, .up-rec-lateral *{box-sizing:border-box}',
      '.up-rec-lateral-cabecalho{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:9px 11px;background:linear-gradient(180deg,#f8faff,#fff);border-bottom:1px solid rgba(194,198,214,.5);flex-shrink:0}',
      '.up-rec-lateral-titulo{display:flex;align-items:center;gap:7px;min-width:0}',
      '.up-rec-lateral-titulo-dot{width:6px;height:6px;border-radius:50%;background:#0058be;flex-shrink:0}',
      '.up-rec-lateral-titulo-texto{font-size:11.5px;font-weight:800;white-space:nowrap;letter-spacing:.01em}',
      '.up-rec-lateral-contagem{font-size:10px;font-weight:800;color:#0058be;background:#eff4ff;border-radius:999px;padding:1px 8px;white-space:nowrap;flex-shrink:0}',
      // No cabeçalho especificamente, vira um selo circular sólido (em vez
      // do chip claro genérico) — mesmo peso visual de um contador "de
      // verdade", não só mais um texto ao lado do título.
      '.up-rec-lateral-cabecalho .up-rec-lateral-contagem{color:#fff;background:#0058be;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;border-radius:999px}',
      '.up-rec-lateral-cabecalho .up-rec-btn-icone{padding:3px 7px}',
      // Corpo: lista (altura fixa, rola sozinha se passar de ~5 itens) +
      // detalhe do passo selecionado (ocupa o resto, rola independente).
      '.up-rec-lateral-corpo{flex:1;min-height:0;display:flex;flex-direction:column}',
      '.up-rec-lateral-lista{flex-shrink:0;border-bottom:1px solid rgba(194,198,214,.4);max-height:168px;overflow-y:auto;display:flex;flex-direction:column;padding:4px 5px;background:#fbfcfe}',
      // Cabeçalho de grupo (ver recorderAgruparPassosPorSecao) — só aparece
      // quando há mais de uma seção em uso; texto pequeno, maiúsculo, sem
      // fundo, só pra escanear rápido onde cada grupo começa.
      '.up-rec-lateral-secao-titulo{font-size:8.5px;font-weight:800;color:#8a90a3;text-transform:uppercase;letter-spacing:.05em;padding:6px 6px 2px;margin-top:2px}',
      '.up-rec-lateral-secao-titulo:first-child{margin-top:0}',
      // Timeline: divisória fina entre passos (em vez de espaçamento com
      // fundo em cada item) — mais parecido com uma lista de eventos do que
      // com um formulário de linhas repetidas.
      '.up-rec-lateral-item{display:flex;align-items:flex-start;gap:7px;padding:6px 6px;cursor:pointer;text-align:left;border:0;border-left:3px solid transparent;border-bottom:1px solid rgba(194,198,214,.3);background:transparent;color:#0b1c30;width:100%;transition:background .12s ease}',
      '.up-rec-lateral-lista .up-rec-lateral-item:last-child{border-bottom:0}',
      '.up-rec-lateral-item:hover{background:#eef1f8}',
      // Arrastar pra reordenar (ver recorderPainelLateralOnDragStart/OnDragOver
      // /OnDrop) — o item arrastado fica meio transparente, e o item sob o
      // cursor ganha uma faixa azul no topo indicando onde vai entrar ao soltar.
      '.up-rec-lateral-item[draggable="true"]{cursor:grab}',
      '.up-rec-lateral-item-arrastando{opacity:.4}',
      '.up-rec-lateral-item-dragover{border-top:2px solid #0058be}',
      // Selecionado: faixa azul à esquerda + fundo suave em degradê + sombra
      // discreta, pra parecer um cartão "elevado", não só uma cor de fundo.
      '.up-rec-lateral-item-ativo{background:linear-gradient(90deg,#e4edff,#eef4ff);border-left-color:#0058be;box-shadow:0 1px 4px rgba(0,88,190,.12)}',
      '.up-rec-lateral-item-ativo .up-rec-lateral-item-resumo{font-weight:700;color:#0b1c30}',
      '.up-rec-lateral-item-ativo .up-rec-lateral-item-rotulo{color:#0058be}',
      '.up-rec-lateral-item-numero{width:16px;height:16px;flex-shrink:0;margin-top:1px;border-radius:999px;background:#eef1f8;color:#8a90a3;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;transition:background .12s ease,color .12s ease}',
      '.up-rec-lateral-item-ativo .up-rec-lateral-item-numero{background:#0058be;color:#fff}',
      // Coluna de texto — rótulo pequeno "Passo N" em cima, título do passo
      // embaixo (mesma hierarquia de duas linhas usada no resto do produto).
      '.up-rec-lateral-item-texto{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;overflow:hidden}',
      '.up-rec-lateral-item-rotulo{font-size:8.5px;font-weight:800;color:#a6acbb;text-transform:uppercase;letter-spacing:.04em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.up-rec-lateral-item-resumo{font-size:11.5px;line-height:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.up-rec-lateral-detalhe{flex:1;min-height:0;overflow-y:auto;padding:10px 11px;display:flex;flex-direction:column;gap:2px}',
      '.up-rec-lateral-detalhe-vazio{padding:22px 14px;font-size:11.5px;color:#8a90a3;text-align:center;line-height:1.5}',
      // Overrides compactos dos campos compartilhados (input/textarea/label/
      // grid) só DENTRO do painel lateral — a revisão final e o mini painel
      // pós-clique continuam com o tamanho padrão de sempre.
      '.up-rec-lateral .up-rec-revisao-label-principal{font-size:9.5px;margin-top:4px}',
      '.up-rec-lateral .up-rec-input{padding:5px 7px;font-size:12px;margin-top:2px}',
      '.up-rec-lateral .up-rec-textarea-sm{padding:5px 7px;font-size:12px;min-height:32px;margin-top:2px}',
      // Select precisa de uma regra própria aqui: ".up-rec-lateral
      // .up-rec-input" (2 classes) tem mais especificidade que "select.
      // up-rec-input" (elemento+classe) e estava zerando o padding-right
      // reservado pra seta customizada — o texto ficava colado/cortado
      // embaixo dela. Essa regra (elemento+2 classes) volta a vencer.
      '.up-rec-lateral select.up-rec-input{padding:5px 24px 5px 7px;font-size:11.5px;margin-top:2px}',
      '.up-rec-lateral .up-rec-revisao-grid{gap:6px;margin-top:5px}',
      '.up-rec-lateral .up-rec-revisao-label{font-size:9px;margin-top:2px}',
      // Preview do tooltip, mais enxuto aqui do que na revisão final/mini painel.
      '.up-rec-lateral-preview-wrap .up-rec-preview{margin-top:0;margin-bottom:8px}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-label{font-size:9px;letter-spacing:.04em}',
      // Balão sólido azul com "rabinho" apontando pro elemento — mais perto
      // de como o tooltip aparece de verdade no runtime do tour (mockup
      // ilustrativo, sem nenhuma relação com o overlay real) do que um card
      // branco genérico. Só dentro do painel lateral.
      '.up-rec-lateral-preview-wrap .up-rec-preview-tooltip{position:relative;padding:9px 11px 12px;max-width:100%;border:0;border-radius:10px;background:#0058be;box-shadow:0 6px 16px rgba(0,88,190,.3)}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-tooltip::after{content:"";position:absolute;left:18px;bottom:-6px;width:12px;height:12px;background:#0058be;clip-path:polygon(0 0,100% 0,0 100%);border-radius:0 0 0 3px}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-progress{color:rgba(255,255,255,.75);font-size:9px;margin-bottom:2px}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-titulo{color:#fff;font-size:12px;margin-bottom:2px;line-height:15px}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-titulo.up-rec-preview-vazio{color:rgba(255,255,255,.6)}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-desc{color:rgba(255,255,255,.92);font-size:11px;line-height:14px}',
      '.up-rec-lateral-preview-wrap .up-rec-preview-desc.up-rec-preview-vazio{color:rgba(255,255,255,.6)}',
      // Ações secundárias (Localizar/Trocar/Remover) — uma linha compacta de
      // botões estreitos com texto curto, em vez de 3 botões largos com texto
      // completo (a descrição completa vira o title, no hover).
      '.up-rec-lateral-acoes{display:flex;gap:5px;margin-top:7px}',
      '.up-rec-lateral-acoes .up-rec-btn-icone{flex:1;text-align:center;padding:5px 4px;font-size:10px;border:1px solid transparent}',
      '.up-rec-lateral-acoes .up-rec-btn-icone-acento{border-color:rgba(0,88,190,.15)}',
      // "Testar passo" fica numa linha própria (largura cheia), separado dos
      // 3 botões estreitos acima — testar é uma ação mais "pesada" (abre uma
      // prévia de verdade) que merece mais destaque que Localizar/Trocar/Remover.
      '.up-rec-lateral-testar{display:block;width:100%;text-align:center;margin-top:6px;padding:6px 8px;font-size:11px;border:1px solid rgba(0,88,190,.15)}',
      // Coluna: link discreto "Ver como usuário final" em cima, linha de
      // botões principais embaixo — evita espremer um 3º botão na mesma
      // linha de Pré-visualizar/Finalizar (fica só mais um link, não compete
      // visualmente com os CTAs de verdade).
      '.up-rec-lateral-rodape{display:flex;flex-direction:column;gap:6px;padding:8px 11px;border-top:1px solid rgba(194,198,214,.5);flex-shrink:0;background:#fff}',
      '.up-rec-lateral-rodape-principal{display:flex;gap:8px}',
      '.up-rec-lateral-preview-final{background:transparent;border:0;color:#0058be;font-size:10.5px;font-weight:700;text-decoration:underline;text-align:center;padding:1px;cursor:pointer;width:100%}',
      '.up-rec-lateral-preview-final:hover{opacity:.75}',
      // "Pré-visualizar" divide o rodapé com o CTA principal (mesma largura
      // via flex:1) — usa o estilo "acento" já usado em Localizar/Trocar,
      // pra ficar claro que é uma ação secundária frente a "Finalizar e revisar".
      '.up-rec-lateral-rodape-principal .up-rec-btn-icone{flex:1;text-align:center;padding:7px 8px;font-size:11.5px}',
      // CTA final evidente (continua sólida, azul, full-width) mas sem o
      // gradiente/sombra "glossy" da rodada anterior — fica claro que é a
      // ação principal do painel sem competir visualmente com o resto.
      '.up-rec-lateral-rodape-principal .up-rec-btn{flex:1;border-radius:9px;padding:7px 10px;font-size:11.5px;font-weight:700;background:#0058be;color:#fff}',
      '.up-rec-lateral-rodape-principal .up-rec-btn:hover{background:#0058be;opacity:.9}',
      '.up-rec-lateral-rodape-principal .up-rec-btn:disabled{background:#eceff5;color:#a6acbb;opacity:1}',
      // Pill recolhida — só ícone + contador, clicável pra reabrir o painel.
      // touch-action:none evita o navegador competir com o arrasto em telas
      // touch (scroll da página no lugar de mover o pill); user-select:none
      // evita selecionar o texto "Passos capturados" ao arrastar rápido.
      '.up-rec-lateral-pill{position:fixed;top:16px;right:16px;z-index:2147483620;display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#132844,#0b1c30);color:#f8f9ff;padding:9px 14px;border-radius:999px;box-shadow:0 16px 36px rgba(11,28,48,.4),0 0 0 1px rgba(255,255,255,.06) inset;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;font-size:12px;font-weight:700;cursor:grab;border:0;touch-action:none;user-select:none;transition:box-shadow .15s ease}',
      '.up-rec-lateral-pill-dot{width:6px;height:6px;border-radius:50%;background:#4dabff;flex-shrink:0;box-shadow:0 0 0 3px rgba(77,171,255,.2)}',
      // Pill durante uma troca (ver recorderRenderPainelLateral) — âmbar em
      // vez de azul, mesmo padrão de cor de "ação pendente" já usado em
      // avisos do gravador, pra diferenciar de relance do estado normal.
      '.up-rec-lateral-pill-trocando .up-rec-lateral-pill-dot{background:#ffb020;box-shadow:0 0 0 3px rgba(255,176,32,.25)}',
      '.up-rec-lateral-pill:active{cursor:grabbing;box-shadow:0 8px 22px rgba(11,28,48,.4),0 0 0 1px rgba(255,255,255,.06) inset}',
      '.up-rec-lateral-pill:hover{opacity:.95}',
      '@media (max-width:600px){.up-rec-lateral{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px)}}',
      '@media (max-width:480px){.up-rec-overlay{padding:8px}.up-rec-modal{max-height:calc(100vh - 16px);border-radius:12px;padding:14px;gap:8px}}',
      '.up-rec-modal-title{font-size:16px;font-weight:800;margin:0;flex-shrink:0}',
      '.up-rec-modal-sub{font-size:12px;color:#424754;margin:0;flex-shrink:0}',
      // flex:1 (com flex-basis generoso) + min-height:0 deixa o textarea ser
      // o único elemento que cresce/encolhe pra caber no max-height do modal
      // — sem isso, um JSON longo empurrava o rodapé de botões pra fora da
      // área visível. resize:none (em vez de vertical) evita que o usuário
      // arraste o textarea além dos limites do modal e quebre o layout —
      // mesma convenção do campo "Importar JSON" no admin (resize-none).
      '.up-rec-textarea{flex:1 1 380px;min-height:0;border:1px solid #c2c6d6;border-radius:10px;padding:12px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:none;background:#f8f9ff;color:#0b1c30;overflow:auto;outline:none;transition:border-color .15s ease,box-shadow .15s ease}',
      '.up-rec-textarea:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16);background:#fff}',
      // flex-shrink:0 garante que o rodapé (Copiar/Baixar/Fechar) nunca seja
      // espremido a ponto de sumir — sempre visível no rodapé do modal, sem
      // depender de scroll (usado tanto no painel final quanto na revisão).
      // position:relative + z-index garante que fique acima da área do JSON.
      '.up-rec-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex-shrink:0;width:100%;position:relative;z-index:1}',
      // Rodapé de modal (Fechar/Gerar JSON, Cancelar, Copiar/Baixar) — mais
      // próximo do padrão de modal do sistema: retângulo com radius menor
      // (não pill) e um pouco mais de respiro, em vez do botão compacto/pill
      // usado na barra flutuante escura.
      '.up-rec-modal-actions .up-rec-btn{border-radius:10px;padding:8px 16px;font-size:13px}',
      // Rodapé da revisão final, só: divisória sutil separando do conteúdo
      // rolável acima (nunca é coberto — flex-shrink:0 já garantia isso) e
      // botões um pouco mais compactos/alinhados que o padrão genérico.
      '.up-rec-modal-revisao .up-rec-modal-actions{border-top:1px solid rgba(194,198,214,.5);padding-top:10px;gap:6px}',
      '.up-rec-modal-revisao .up-rec-modal-actions .up-rec-btn{padding:7px 14px;font-size:12.5px}',
      // Cabeçalho do modal de revisão (título + subtítulo) — separado da
      // barra de ações e da lista rolável por uma borda sutil, igual ao
      // cabeçalho de modal do sistema (ex.: Catálogo de Telas).
      // Modal de revisão final — mais compacta/limpa que o padrão genérico
      // (.up-rec-modal), sem afetar os outros modais (escolha de seletor,
      // painel final, mini revisão pós-clique) que continuam com o padrão.
      '.up-rec-modal-revisao{padding:16px;gap:8px}',
      '.up-rec-revisao-cabecalho{display:flex;flex-direction:column;gap:3px;padding-bottom:8px;border-bottom:1px solid rgba(194,198,214,.5);flex-shrink:0}',
      '.up-rec-modal-revisao .up-rec-modal-title{font-size:14px;font-weight:700}',
      '.up-rec-modal-revisao .up-rec-modal-sub{font-size:11px}',
      '.up-rec-revisao-topo{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}',
      '.up-rec-revisao-contagem{font-size:10.5px;font-weight:800;color:#0058be;background:#eff4ff;border-radius:999px;padding:2px 9px;white-space:nowrap;flex-shrink:0}',
      // Pequena barra de ações acima da lista de passos — "Analisar passos"
      // vive aqui, não solto entre o subtítulo e a lista.
      '.up-rec-revisao-toolbar{display:flex;align-items:center;padding-bottom:6px;border-bottom:1px solid rgba(194,198,214,.4);flex-shrink:0}',
      // Única área com scroll interno do modal — cabeçalho e rodapé (ações)
      // ficam de fora, sempre visíveis (flex-shrink:0 neles).
      '.up-rec-revisao-lista{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px}',
      // Card do passo mais leve: menos padding, fundo quase neutro (o azul
      // ficou só no número/seleção, não no card inteiro).
      '.up-rec-revisao-item{border:1px solid #c2c6d6;border-radius:10px;padding:9px 10px;display:flex;flex-direction:column;gap:5px;background:#fbfcfe}',
      '.up-rec-revisao-header{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.up-rec-revisao-header-titulo{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}',
      // Círculo numerado discreto — só identifica a ordem, sem competir com
      // o título do passo (up-rec-revisao-resumo), que agora é o texto de
      // maior destaque no cabeçalho.
      '.up-rec-revisao-numero{width:16px;height:16px;flex-shrink:0;border-radius:999px;background:#eef1f8;color:#8a90a3;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800}',
      '.up-rec-revisao-ordem{font-weight:600;font-size:10px;color:#8a90a3;flex-shrink:0;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em}',
      '.up-rec-revisao-resumo{font-size:12.5px;font-weight:700;color:#0b1c30;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.up-rec-revisao-acoes{display:flex;gap:3px;flex-wrap:wrap;flex-shrink:0}',
      // Neutro por padrão (mover/duplicar) — mesmo esquema do admin
      // (text-on-surface-variant hover:bg-surface-container-high): discreto em
      // repouso, só ganha fundo no hover.
      '.up-rec-btn-icone{border:0;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;background:transparent;color:#424754;font-family:inherit;transition:background .15s ease,color .15s ease}',
      '.up-rec-btn-icone:hover{background:#dce9ff;color:#0b1c30}',
      '.up-rec-btn-icone:disabled{opacity:.3;cursor:not-allowed}',
      // Destaque (Trocar elemento, ações rápidas de sugestão, Analisar
      // passos) — mesmo tom primário usado nas ações "copiar seletor"/"copiar
      // comando" do admin (hover:text-primary), só que já colorido em repouso
      // pra convidar o clique, já que aqui é a ação principal do botão.
      // Fundo sempre visível (não só no hover) — precisa ler como botão de
      // verdade, não como link textual, já que aqui é a ação principal do
      // botão (Trocar elemento, ações rápidas de sugestão).
      '.up-rec-btn-icone-acento{background:#eff4ff;color:#0058be}',
      '.up-rec-btn-icone-acento:hover{background:#dbe8ff}',
      // Quadrado, só ícone (mover para cima/baixo) — borda sutil sempre
      // visível (pra ler como botão de ação, não só um caractere solto),
      // hover mais escuro, opacity:30% quando desabilitado (mesmo padrão dos
      // botões equivalentes do admin).
      '.up-rec-btn-icone-quadrado{width:26px;height:26px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;box-sizing:border-box;border:1px solid #dde1ee}',
      '.up-rec-btn-icone-quadrado:hover{border-color:#a8adbd}',
      '.up-rec-btn-icone-quadrado:disabled{opacity:.3;border-color:#edeef5}',
      // Remover — fundo vermelho bem claro + borda discreta sempre visíveis
      // (pra ler como ação de perigo de verdade, não como link), mais forte
      // no hover.
      '.up-rec-btn-icone.up-rec-btn-danger{background:rgba(186,26,26,.06);border:1px solid rgba(186,26,26,.25);color:#ba1a1a;box-sizing:border-box}',
      '.up-rec-btn-icone.up-rec-btn-danger:hover{background:#ffdad6;border-color:#ba1a1a}',
      // Título/descrição são os campos principais — rótulo normal (não
      // maiúsculo/técnico), pra se destacar da seção de configuração abaixo.
      '.up-rec-revisao-principal{display:flex;flex-direction:column;gap:2px}',
      '.up-rec-revisao-label-principal{font-size:11px;font-weight:800;color:#424754;margin-top:6px}',
      '.up-rec-revisao-label{font-size:10px;font-weight:700;color:#8a90a3;text-transform:uppercase;letter-spacing:.03em;display:block;margin-top:4px}',
      // Campos mais compactos e consistentes, só dentro da revisão final —
      // input/textarea/label/grid são reaproveitados pelo mini painel
      // pós-clique e pelo painel lateral, que já têm seus próprios overrides
      // (ou o padrão de sempre) e não devem mudar de tamanho aqui.
      '.up-rec-modal-revisao .up-rec-input{padding:6px 9px;font-size:12.5px;margin-top:2px}',
      '.up-rec-modal-revisao .up-rec-textarea-sm{padding:6px 9px;font-size:12.5px;min-height:38px;margin-top:2px}',
      '.up-rec-modal-revisao .up-rec-revisao-label-principal{font-size:10px;margin-top:5px}',
      '.up-rec-modal-revisao .up-rec-revisao-label{font-size:9.5px;margin-top:3px}',
      '.up-rec-modal-revisao .up-rec-revisao-grid{gap:7px}',
      // Mesmo esquema de borda/foco dos inputs do admin (border-outline-variant,
      // focus:ring-primary) — só compacto o bastante pra caber vários campos
      // por card sem esticar o modal.
      '.up-rec-input{width:100%;border:1px solid #c2c6d6;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;color:#0b1c30;background:#f8f9ff;margin-top:3px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}',
      '.up-rec-input:hover{border-color:#a8adbd}',
      '.up-rec-input:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16);background:#fff}',
      // Select nativo (mini painel/painel lateral — "Posição do tooltip",
      // "Como avançar") continua sendo um <select> de verdade (sem componente
      // novo); só desenha uma seta própria (mesma cor/estilo do resto do
      // gravador) no lugar do ícone padrão do navegador, que costuma destoar.
      'select.up-rec-input{appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer;padding-right:26px;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\'><path d=\'M5.5 8L10 12.5L14.5 8\' stroke=\'%23727785\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>");background-repeat:no-repeat;background-position:right 8px center;background-size:14px}',
      '.up-rec-textarea-sm{width:100%;border:1px solid #c2c6d6;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;color:#0b1c30;background:#f8f9ff;resize:vertical;min-height:44px;margin-top:3px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}',
      '.up-rec-textarea-sm:hover{border-color:#a8adbd}',
      '.up-rec-textarea-sm:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16);background:#fff}',
      // Select customizado — o <select> de verdade fica só como ponte de
      // dados/eventos (nunca visível/clicável); botão+dropdown abaixo são o
      // que o usuário realmente vê e usa, com a mesma aparência dos campos
      // do sistema (borda outline-variant, foco azul primário).
      '.up-rec-customselect{position:relative;width:100%;margin-top:3px}',
      '.up-rec-select-nativo{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;opacity:0;pointer-events:none}',
      '.up-rec-cs-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid #c2c6d6;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;color:#0b1c30;background:#fff;cursor:pointer;outline:none;transition:border-color .15s ease,box-shadow .15s ease}',
      '.up-rec-cs-trigger:hover{border-color:#a8adbd}',
      '.up-rec-cs-trigger[aria-expanded="true"]{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16)}',
      '.up-rec-cs-valor{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}',
      '.up-rec-cs-seta{flex-shrink:0;font-size:10px;color:#727785;transition:transform .15s ease}',
      '.up-rec-cs-trigger[aria-expanded="true"] .up-rec-cs-seta{transform:rotate(180deg)}',
      // Dropdown próprio — fundo branco, borda e sombra (não é o menu nativo
      // do navegador). max-height+overflow evita que uma lista de opções
      // muito longa estoure o modal.
      '.up-rec-cs-dropdown{position:absolute;z-index:20;top:calc(100% + 4px);left:0;width:100%;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #c2c6d6;border-radius:10px;box-shadow:0 12px 28px rgba(11,28,48,.18);padding:4px}',
      '.up-rec-cs-opcao{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;background:transparent;border-radius:6px;padding:6px 8px;font-size:12.5px;font-family:inherit;color:#0b1c30;text-align:left;cursor:pointer}',
      '.up-rec-cs-opcao:hover{background:#eff4ff}',
      '.up-rec-cs-opcao-selecionada{background:rgba(0,88,190,.1);color:#0058be;font-weight:700}',
      '.up-rec-cs-opcao-label{overflow:hidden;text-overflow:ellipsis}',
      '.up-rec-cs-check{visibility:hidden;flex-shrink:0;color:#0058be;font-size:12px}',
      '.up-rec-cs-opcao-selecionada .up-rec-cs-check{visibility:visible}',
      // Seção "Configuração do passo" — agrupada visualmente à parte (fundo
      // discreto), separando o que é técnico (seletor/comportamento) do que é
      // conteúdo principal (título/descrição) editado acima.
      '.up-rec-revisao-config{background:#fff;border:1px solid rgba(194,198,214,.5);border-radius:8px;padding:7px 9px;margin-top:4px}',
      '.up-rec-revisao-config-titulo{font-size:9.5px;font-weight:800;color:#8a90a3;text-transform:uppercase;letter-spacing:.04em;margin:0 0 2px}',
      '.up-rec-revisao-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      // Seletor: chip de leitura (não deve parecer um input editável).
      '.up-rec-revisao-codigo{display:inline-flex;max-width:100%;font:10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#eef1f8;border:1px solid #dde1ee;border-radius:6px;padding:3px 7px;color:#425066;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}',
      // Localizar/Trocar agrupados numa linha compacta, em vez de dois botões
      // largos com texto completo (a descrição completa vira o title, no hover).
      '.up-rec-revisao-seletor-acoes{display:flex;gap:4px;margin-top:4px}',
      '.up-rec-revisao-seletor-acoes .up-rec-btn-icone{flex:1;text-align:center;padding:4px 6px;font-size:10.5px}',
      // Preview separado do resto por uma divisória sutil (sem virar mais um
      // card cheio, que pesaria visualmente) — mais enxuto que na revisão
      // padrão de sempre, só aqui dentro da revisão final.
      '.up-rec-revisao-preview-wrap{margin-top:2px;padding-top:7px;border-top:1px dashed rgba(194,198,214,.6)}',
      '.up-rec-modal-revisao .up-rec-preview{margin-top:0}',
      '.up-rec-modal-revisao .up-rec-preview-tooltip{padding:7px 9px;box-shadow:none}',
      '.up-rec-modal-revisao .up-rec-preview-progress{font-size:9px;margin-bottom:2px}',
      '.up-rec-modal-revisao .up-rec-preview-titulo{font-size:12px;margin-bottom:2px;line-height:15px}',
      '.up-rec-modal-revisao .up-rec-preview-desc{font-size:11px;line-height:14px}',
      // Alertas discretos (obrigatórios pro importador) — chips compactos lado
      // a lado em vez de lista empilhada, pra ocupar menos espaço vertical no
      // card. Marcador "▲" reforça que é algo a corrigir, não só uma dica.
      '.up-rec-revisao-alertas{list-style:none;margin:5px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:3px}',
      '.up-rec-revisao-alertas li{font-size:10px;line-height:1.3;color:#e65100;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:2px 6px}',
      '.up-rec-revisao-alertas li::before{content:"\\25B2";font-size:6.5px;margin-right:3px;vertical-align:middle}',
      // Preview do tooltip — mockup estático (não é o overlay real do tour),
      // só pra o usuário ter noção de como título/descrição vão aparecer.
      // Atualizado ao vivo por recorderRevisaoOnInput (mesmo texto, sem
      // reabrir a lista inteira).
      '.up-rec-preview{margin-top:6px}',
      '.up-rec-preview-label{font-size:10px;font-weight:800;color:#8a90a3;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}',
      '.up-rec-preview-tooltip{border:1px solid #c2c6d6;border-radius:10px;background:#fff;padding:10px 12px;max-width:280px}',
      '.up-rec-preview-progress{font-size:10px;font-weight:800;color:#0058be;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}',
      '.up-rec-preview-titulo{font-size:13px;font-weight:800;color:#0b1c30;margin:0 0 4px;line-height:17px}',
      '.up-rec-preview-titulo.up-rec-preview-vazio{color:#8a90a3;font-style:italic;font-weight:600}',
      '.up-rec-preview-desc{font-size:12px;line-height:16px;color:#424754;margin:0}',
      '.up-rec-preview-desc.up-rec-preview-vazio{color:#8a90a3;font-style:italic}',
      '@media (max-width:480px){.up-rec-revisao-grid{grid-template-columns:1fr}}',
      // Botão "Analisar passos" (topo do painel de revisão) e as sugestões
      // discretas por passo — visualmente distintas dos alertas (tom azul,
      // marcador redondo em vez de triângulo), já que são opcionais/
      // informativas (qualidade/duplicidade), nunca bloqueiam gerar JSON.
      // Estado reforçado por cor (secundário quando desligado, preenchido de
      // azul quando ligado — .up-rec-btn-secondary-ativo) e pelo texto do
      // botão, que já alterna entre "Analisar passos"/"Ocultar análise".
      '.up-rec-sugestoes{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}',
      '.up-rec-sugestao-item{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;line-height:1.3;color:#0058be;background:#eff4ff;border-radius:6px;padding:4px 8px}',
      '.up-rec-sugestao-texto{flex:1}',
      '.up-rec-sugestao-texto::before{content:"\\25CF";font-size:7px;margin-right:5px;vertical-align:middle;opacity:.7}',
      // Bloco "Detectar lista dinâmica" no painel lateral (ver
      // recorderHtmlSugestaoListaDinamica) — mesma linguagem visual do
      // cartão de sugestões acima (azul informativo), com aviso em âmbar
      // (mesmo tom de .up-rec-revisao-alertas) quando o seletor é o
      // fallback genérico, não um data-cy indexado.
      '.up-rec-lista-dinamica{margin-top:8px}',
      '.up-rec-lista-dinamica-card{margin-top:6px;background:#eff4ff;border:1px solid rgba(0,88,190,.15);border-radius:8px;padding:8px}',
      '.up-rec-lista-dinamica-titulo{margin:0;font-size:11px;font-weight:700;color:#0058be}',
      '.up-rec-lista-dinamica-linha{margin:4px 0 0;font-size:10.5px;line-height:1.4;color:#0058be;word-break:break-all}',
      '.up-rec-lista-dinamica-linha code{background:rgba(0,88,190,.1);border-radius:4px;padding:1px 4px}',
      // Selo de estabilidade (ver RECORDER_ESTABILIDADE_ALTA/MEDIA/BAIXA) —
      // verde pra data-cy (alta), âmbar pra role semântico (média) e laranja
      // mais forte pra classe de biblioteca (baixa, mesmo tom de aviso já
      // usado pra "seletor frágil" em outros pontos do gravador).
      '.up-rec-lista-dinamica-badge{display:inline-block;margin-top:4px;font-size:9.5px;font-weight:700;line-height:1.3;border-radius:10px;padding:1px 7px}',
      '.up-rec-lista-dinamica-badge-alta{background:rgba(21,128,61,.12);color:#15803d}',
      '.up-rec-lista-dinamica-badge-media{background:rgba(180,83,9,.12);color:#b45309}',
      '.up-rec-lista-dinamica-badge-baixa{background:rgba(230,81,0,.12);color:#e65100}',
      '.up-rec-lista-dinamica-aviso{margin:4px 0 0;font-size:10px;line-height:1.3;color:#e65100}',
      '.up-rec-lista-dinamica-acoes{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}',
      '.up-rec-lista-dinamica-acoes .up-rec-btn-icone{padding:4px 8px;font-size:10px;border:1px solid rgba(0,88,190,.15)}',
      // Mini painel "Escolha o seletor deste passo" (troca de elemento).
      '.up-rec-modal-escolha{max-width:520px}',
      '.up-rec-escolha-lista{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px}',
      '.up-rec-escolha-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e0e2ef;border-left-width:3px;border-radius:10px;background:#fff;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:border-color .15s ease,background .15s ease}',
      '.up-rec-escolha-item:hover{border-color:#0058be;background:#f6f9ff}',
      // Borda esquerda mais grossa reforça a qualidade por cor mesmo antes de
      // ler o texto do badge — mesmos tons usados no badge ao lado.
      '.up-rec-escolha-item-recomendado{border-left-color:#006947}',
      '.up-rec-escolha-item-bom{border-left-color:#0058be}',
      '.up-rec-escolha-item-fragil{border-left-color:#e65100}',
      // Roxo — mesmo tom já usado em .up-action (destino padrão de campanha)
      // — reservado só pra sugestão de "Área", pra ficar visualmente distinto
      // das 3 qualidades de seletor único acima (não é "melhor" nem "pior"
      // que elas, é um modo de alvo diferente).
      '.up-rec-escolha-item-area{border-left-color:#6b38d4}',
      // Badge fixo "Elemento"/"Área" — categoria de alto nível do candidato,
      // separado do rótulo específico (id, name, container pai...) ao lado.
      '.up-rec-escolha-categoria{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 6px;border-radius:5px;white-space:nowrap;flex-shrink:0}',
      '.up-rec-categoria-elemento{background:rgba(66,71,84,.08);color:#424754}',
      '.up-rec-categoria-area{background:rgba(107,56,212,.12);color:#6b38d4}',
      '.up-rec-escolha-tipo{font-size:11px;font-weight:800;color:#424754;flex-shrink:0;min-width:64px}',
      '.up-rec-escolha-codigo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#eef1f8;border:1px solid #dde1ee;border-radius:6px;padding:3px 7px;color:#425066}',
      '.up-rec-escolha-qtd{font-size:10px;color:#7c8595;white-space:nowrap;flex-shrink:0}',
      '.up-rec-escolha-qualidade{font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap;flex-shrink:0}',
      '.up-rec-qualidade-recomendado{background:rgba(0,105,71,.1);color:#006947}',
      '.up-rec-qualidade-bom{background:rgba(0,88,190,.1);color:#0058be}',
      '.up-rec-qualidade-fragil{background:rgba(230,81,0,.12);color:#e65100}',
      '.up-rec-qualidade-area{background:rgba(107,56,212,.12);color:#6b38d4}',
      // Onboarding Guiado (Jornadas) — painel lateral simples + botão flutuante.
      // z-index bem alto e específico pro painel/FAB (maior que o do próprio
      // botão, garantindo que o painel sempre fique por cima dele caso os
      // dois coexistam) — sem isso, ficavam sem z-index nenhum (auto) e
      // qualquer widget de terceiro com z-index mais alto (ex.: botão
      // flutuante do Movidesk usado pelo Clinic) cobria os dois por cima.
      '.up-jorn-painel{position:fixed;top:0;right:0;bottom:0;width:360px;max-width:92vw;z-index:2147483640;background:#fff;border-left:1px solid #e0e2ef;box-shadow:-12px 0 32px rgba(11,28,48,.14);display:flex;flex-direction:column}',
      '.up-jorn-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(194,198,214,.45);flex-shrink:0}',
      '.up-jorn-header-titulo{margin:0;font-size:16px;font-weight:800;color:#0b1c30}',
      '.up-jorn-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px}',
      '.up-jorn-secao{display:flex;flex-direction:column;gap:14px}',
      '.up-jorn-secao-titulo{margin:0;font-size:11px;font-weight:800;color:#8a90a3;text-transform:uppercase;letter-spacing:.04em}',
      '.up-jorn-busca{position:relative;flex-shrink:0}',
      '.up-jorn-busca svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;fill:#8a90a3;pointer-events:none}',
      '.up-jorn-busca-input{width:100%;height:36px;padding:0 12px 0 32px;border:1px solid #e0e2ef;border-radius:10px;font-family:inherit;font-size:12.5px;color:#0b1c30;background:#f8f9ff;outline:none;transition:border-color .15s ease}',
      '.up-jorn-busca-input:focus{border-color:#0058be;background:#fff}',
      '.up-jorn-busca-input::placeholder{color:#8a90a3}',
      '.up-jorn-busca-resultados{display:flex;flex-direction:column;gap:8px}',
      '.up-jorn-busca-resultado{display:flex;flex-direction:column;gap:2px;padding:12px;border:1px solid #e0e2ef;border-radius:12px;background:#fff;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:border-color .15s ease,background .15s ease}',
      '.up-jorn-busca-resultado:hover{border-color:#0058be;background:#f6f9ff}',
      '.up-jorn-busca-resultado:disabled{opacity:.55;cursor:not-allowed}',
      '.up-jorn-busca-resultado-caminho{font-size:13px;font-weight:700;color:#0b1c30}',
      '.up-jorn-busca-resultado-etapa{font-size:11.5px;color:#727785}',
      '.up-jorn-card{border:1px solid #e0e2ef;border-radius:14px;padding:14px;background:#f8f9ff}',
      '.up-jorn-card-titulo{margin:0 0 4px;font-size:14px;font-weight:800;color:#0b1c30}',
      '.up-jorn-card-desc{margin:0 0 10px;font-size:12.5px;line-height:1.4;color:#424754}',
      '.up-jorn-continuar{border:1px solid #bcd6f7;border-radius:14px;padding:12px 14px;background:#eef5ff;margin-bottom:12px}',
      '.up-jorn-continuar-titulo{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:11px;font-weight:800;color:#0058be;text-transform:uppercase;letter-spacing:.02em}',
      '.up-jorn-continuar-titulo svg{width:13px;height:13px;fill:currentColor}',
      '.up-jorn-continuar-linha{margin:0 0 3px;font-size:12.5px;color:#0b1c30;line-height:1.4}',
      '.up-jorn-continuar-linha strong{font-weight:700}',
      '.up-jorn-continuar-btn{margin-top:8px;width:100%;padding:9px 14px;border:0;border-radius:10px;background:#0058be;color:#fff;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;transition:opacity .15s ease}',
      '.up-jorn-continuar-btn:hover{opacity:.9}',
      '.up-jorn-progresso{margin-bottom:10px}',
      '.up-jorn-progresso-barra{height:6px;border-radius:999px;background:#e0e2ef;overflow:hidden;margin-bottom:5px}',
      '.up-jorn-progresso-fill{height:100%;background:#0058be;border-radius:999px;transition:width .25s ease}',
      '.up-jorn-progresso-texto{font-size:11px;font-weight:700;color:#727785}',
      '.up-jorn-etapas{display:flex;flex-direction:column;gap:8px}',
      '.up-jorn-etapa{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e0e2ef;border-radius:12px;background:#fff;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:border-color .15s ease,background .15s ease}',
      '.up-jorn-etapa:hover{border-color:#0058be;background:#f6f9ff}',
      '.up-jorn-etapa:disabled{opacity:.55;cursor:not-allowed}',
      '.up-jorn-etapa-concluida{border-color:rgba(0,105,71,.35);background:#f2faf6}',
      // Concluída não é "indisponível" (opacidade/not-allowed do disabled
      // genérico acima) — é um estado positivo, então some com o esmaecimento
      // e usa cursor default em vez de not-allowed.
      '.up-jorn-etapa-concluida:disabled{opacity:1;cursor:default}',
      '.up-jorn-etapa-num{flex-shrink:0;width:22px;height:22px;border-radius:999px;background:#eff4ff;color:#0058be;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}',
      '.up-jorn-etapa-check{flex-shrink:0;width:22px;height:22px;border-radius:999px;background:#006947;color:#fff;display:flex;align-items:center;justify-content:center}',
      '.up-jorn-etapa-check svg{width:13px;height:13px;fill:currentColor}',
      '.up-jorn-etapa-corpo{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.up-jorn-etapa-titulo{font-size:13px;font-weight:700;color:#0b1c30}',
      '.up-jorn-etapa-desc{font-size:11.5px;color:#424754;line-height:1.35}',
      '.up-jorn-etapa-tipo{font-size:10px;font-weight:700;color:#8a90a3;text-transform:uppercase;letter-spacing:.02em}',
      // Estrutura em 2 níveis: jornada (título/descrição/progresso geral) lista
      // seus pacotes (BlocoJornada); cada pacote abre pra sua própria lista de
      // etapas (reaproveita .up-jorn-etapas/.up-jorn-etapa já existentes).
      '.up-jorn-jornada + .up-jorn-jornada{margin-top:18px;padding-top:18px;border-top:1px solid #e0e2ef}',
      '.up-jorn-jornada-concluida{display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:12px;font-weight:800;color:#006947}',
      '.up-jorn-jornada-concluida svg{width:14px;height:14px;fill:currentColor}',
      '.up-jorn-pacotes{display:flex;flex-direction:column;gap:8px}',
      '.up-jorn-pacote{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid #e0e2ef;border-radius:12px;background:#fff;cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:border-color .15s ease,background .15s ease}',
      '.up-jorn-pacote:hover{border-color:#0058be;background:#f6f9ff}',
      '.up-jorn-pacote:disabled{opacity:.55;cursor:not-allowed}',
      '.up-jorn-pacote-concluido{border-color:rgba(0,105,71,.35);background:#f2faf6}',
      '.up-jorn-pacote-corpo{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}',
      '.up-jorn-pacote-topo{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.up-jorn-pacote-titulo{font-size:13px;font-weight:700;color:#0b1c30}',
      '.up-jorn-pacote-status{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}',
      '.up-jorn-pacote-status-dot{width:6px;height:6px;border-radius:999px;flex-shrink:0}',
      '.up-jorn-pacote-status-nao-iniciado{color:#8a90a3}',
      '.up-jorn-pacote-status-nao-iniciado .up-jorn-pacote-status-dot{background:#8a90a3}',
      '.up-jorn-pacote-status-andamento{color:#0058be}',
      '.up-jorn-pacote-status-andamento .up-jorn-pacote-status-dot{background:#0058be}',
      '.up-jorn-pacote-status-concluido{color:#006947}',
      '.up-jorn-pacote-status-concluido .up-jorn-pacote-status-dot{background:#006947}',
      '.up-jorn-pacote-status-bloqueado{color:#e65100}',
      '.up-jorn-pacote-status-bloqueado .up-jorn-pacote-status-dot{background:#e65100}',
      '.up-jorn-pacote-desc{font-size:11.5px;color:#424754;line-height:1.35}',
      '.up-jorn-pacote-cta{flex-shrink:0;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:800;color:#0058be;white-space:nowrap}',
      '.up-jorn-pacote-cta-concluido{color:#006947}',
      '.up-jorn-pacote-cta-bloqueado{color:#8a90a3}',
      '.up-jorn-pacote-cta svg{width:13px;height:13px;fill:currentColor}',
      '.up-jorn-etapas-header{margin-bottom:10px}',
      '.up-jorn-voltar{display:flex;align-items:center;gap:5px;background:transparent;border:0;padding:0;margin-bottom:10px;font-family:inherit;font-size:12px;font-weight:700;color:#0058be;cursor:pointer}',
      '.up-jorn-voltar:hover{text-decoration:underline}',
      '.up-jorn-voltar svg{width:14px;height:14px;fill:currentColor}',
      '.up-jorn-vazio{padding:32px 16px;text-align:center}',
      '.up-jorn-vazio-texto{margin:0;font-size:13px;color:#727785}',
      // bottom:88px (em vez de 24px) evita empilhar em cima de um botão
      // flutuante que o próprio host já tenha no canto inferior direito (ex.:
      // Clinic/Movidesk) — dá espaço suficiente pros dois convivere sem se
      // sobrepor visualmente.
      '.up-jorn-fab{position:fixed;bottom:88px;right:24px;z-index:2147483630;pointer-events:auto;height:44px;padding:0 18px 0 14px;border:0;border-radius:999px;background:#0058be;color:#fff;box-shadow:0 14px 32px rgba(0,88,190,.28);display:flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:800;transition:transform .18s ease,box-shadow .18s ease}',
      '.up-jorn-fab:hover{transform:translateY(-1px);box-shadow:0 18px 38px rgba(0,88,190,.34)}',
      '.up-jorn-fab svg{width:18px;height:18px;fill:currentColor}',
      '.up-jorn-aviso{position:fixed;bottom:24px;right:24px;max-width:260px;padding:10px 14px;border-radius:10px;background:#0b1c30;color:#fff;font-family:inherit;font-size:12.5px;font-weight:600;line-height:1.4;box-shadow:0 14px 32px rgba(11,28,48,.28);z-index:2147483620}',
      '@media (max-width:480px){.up-jorn-painel{width:100vw;max-width:100vw}}',
      // Destaque em elemento — badge/beacon ancorado num elemento da página
      // (via data-cy) + tooltip contextual. Mesma linguagem visual do
      // tooltip de Tour (.up-tour-tooltip: cartão branco, rounded, sombra),
      // mas z-index abaixo do Tour (2147483600+) — nunca compete com um tour
      // ativo (agendarDestaqueElemento já nem monta se tourState.ativo).
      // Posição (top/left) é calculada em JS por destaqueElementoCalcularPosicao
      // (fora/acima ou fora/abaixo do alvo, nunca sobre ele) — sem transform de
      // centralização aqui: root já nasce com o canto exato do badge.
      '.up-destaque-root{position:fixed;z-index:2147483200;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif}',
      '.up-destaque-badge{position:relative;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--up-primary, #0058be);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;cursor:pointer;border:2px solid #fff;box-shadow:0 6px 16px rgba(11,28,48,.28)}',
      // Beacon fica FORA do badge (irmão, position:absolute) no gap entre
      // badge e alvo — acima do badge quando o badge está abaixo do alvo,
      // abaixo do badge quando o badge está acima (data-up-pos no root).
      // `left` NÃO é fixo em 50% aqui — é calculado em JS por
      // destaqueElementoCalcularBeacon a cada reposição, pra sempre apontar
      // pro alvo mesmo quando o clamp de viewport desloca o badge pro lado
      // (comum em telas estreitas).
      '.up-destaque-beacon{position:absolute;transform:translateX(-50%);display:inline-flex;width:8px;height:8px;flex-shrink:0;pointer-events:none}',
      '.up-destaque-root[data-up-pos="acima"] .up-destaque-beacon{top:100%;margin-top:2px}',
      '.up-destaque-root[data-up-pos="abaixo"] .up-destaque-beacon{bottom:100%;margin-bottom:2px}',
      '.up-destaque-beacon::before{content:"";position:absolute;inset:0;border-radius:999px;background:var(--up-primary, #0058be);opacity:.6;animation:up-destaque-ping 1.6s cubic-bezier(0,0,.2,1) infinite}',
      '.up-destaque-beacon::after{content:"";position:relative;display:block;width:8px;height:8px;border-radius:999px;background:var(--up-primary, #0058be);border:2px solid #fff}',
      '@keyframes up-destaque-ping{0%{transform:scale(1);opacity:.85}75%,100%{transform:scale(2.4);opacity:0}}',
      // position:fixed (não absolute) — top/left são calculados em JS por
      // destaqueElementoCalcularPosicaoTooltip a cada render/scroll/resize,
      // pra nunca cobrir o alvo (abaixo/acima/lateral conforme espaço
      // disponível). Mesmo padrão de .up-tour-tooltip (posição via JS).
      '.up-destaque-tooltip{position:fixed;width:260px;max-width:calc(100vw - 24px);background:#fff;border:1px solid rgba(194,198,214,.4);border-radius:16px;box-shadow:0 1px 2px rgba(11,28,48,.04),0 16px 36px -12px rgba(11,28,48,.22);padding:16px;color:#0b1c30;animation:up-fade-in .16s ease-out}',
      '.up-destaque-close{position:absolute;top:10px;right:10px;width:22px;height:22px;border:0;border-radius:999px;background:transparent;color:#727785;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.up-destaque-close svg{width:14px;height:14px;fill:currentColor}',
      '.up-destaque-close:hover{background:#f1f3fa}',
      '.up-destaque-titulo{margin:0 22px 4px 0;font-size:13.5px;font-weight:800;line-height:1.35;color:#0b1c30}',
      '.up-destaque-descricao{margin:0;font-size:12.5px;line-height:1.45;color:#4a5164}',
      '.up-destaque-cta{display:inline-flex;align-items:center;justify-content:center;height:34px;margin-top:12px;padding:0 16px;border:0;border-radius:999px;background:var(--up-primary, #0058be);color:#fff;font-size:12px;font-weight:800;cursor:pointer}',
      // Avaliação de utilidade do destaque ("Essa melhoria foi útil?") —
      // separador sutil (mesma cor de borda do card) pra distinguir da
      // descrição/CTA acima sem pesar visualmente.
      '.up-destaque-util{margin-top:12px;padding-top:12px;border-top:1px solid rgba(194,198,214,.4)}',
      '.up-destaque-util-label{margin:0 0 8px;font-size:12px;font-weight:700;line-height:1.4;color:#0b1c30}',
      '.up-destaque-util-botoes{display:flex;gap:8px}',
      '.up-destaque-util-btn{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:1px solid rgba(194,198,214,.5);border-radius:999px;background:#f8f9ff;color:#4a5164;font-size:12px;font-weight:700;cursor:pointer;transition:transform .15s ease,background .15s ease,border-color .15s ease}',
      '.up-destaque-util-btn:hover{border-color:var(--up-primary, #0058be)}',
      '.up-destaque-util-btn:active{transform:scale(.96)}',
      '.up-destaque-util-btn-ativo{background:var(--up-primary-soft, #eff4ff);border-color:var(--up-primary, #0058be);color:var(--up-primary, #0058be)}',
      '.up-destaque-util-comentario{margin-top:10px}',
      '.up-destaque-util-comentario .up-textarea{min-height:56px;font-size:12.5px}',
      '.up-destaque-util-ok{margin:6px 0 0;color:#1e8e5a;font-size:11.5px;line-height:15px}',
      '.up-destaque-util-comentario .up-submit{height:34px;margin-top:8px;font-size:11.5px}',
    ].join('');
    document.head.appendChild(style);
  }

  function icon(name) {
    if (name === 'close') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.3-6.29 1.41 1.41Z"/></svg>';
    }
    if (name === 'check') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.55 17.65-5.2-5.2 1.4-1.4 3.8 3.8 8.7-8.7 1.4 1.4-10.1 10.1Z"/></svg>';
    }
    if (name === 'sparkle') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Zm7.5 11 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9 .9-2.6Z"/></svg>';
    }
    if (name === 'arrow_forward') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.6 10.6 6l4.9 4.9H4v2h11.5L10.6 18l1.4 1.4 7.4-7.4Z"/></svg>';
    }
    if (name === 'pause') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>';
    }
    if (name === 'play') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>';
    }
    if (name === 'undo') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8Z"/></svg>';
    }
    if (name === 'route') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4z"/></svg>';
    }
    if (name === 'arrow_back') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20Z"/></svg>';
    }
    if (name === 'search') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"/></svg>';
    }
    if (name === 'campaign') {
      // Path oficial do Material Symbols Outlined "campaign" (24px), igual
      // ao que campanhas2/Index.tsx exibe via material-symbols-outlined
      // (ICONES_TIPO_CAMPANHA/iconeTipoCampanha) — copiado de
      // github.com/google/material-design-icons,
      // symbols/web/campaign/materialsymbolsoutlined/campaign_24px.svg.
      // viewBox próprio (0 -960 960 960, convenção do Material Symbols,
      // diferente do 0 0 24 24 usado pelos outros ícones deste arquivo) —
      // funciona igual, o <svg> escala pro tamanho definido em CSS
      // (.up-brand-icon svg) independente do viewBox interno.
      return '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M720-440v-80h160v80H720Zm48 280-128-96 48-64 128 96-48 64Zm-80-480-48-64 128-96 48 64-128 96ZM200-200v-160h-40q-33 0-56.5-23.5T80-440v-80q0-33 23.5-56.5T160-600h160l200-120v480L320-360h-40v160h-80Zm240-182v-196l-98 58H160v80h182l98 58Zm120 36v-268q27 24 43.5 58.5T620-480q0 41-16.5 75.5T560-346ZM300-480Z"/></svg>';
    }
    if (name === 'rocket_launch') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3.2.4 5.6 1.8 7.2 4.2-1.4.2-2.8.7-4.1 1.5l1.2 1.2c.8-.4 1.6-.7 2.5-.8.3 1 .4 2 .4 3.2 0 3.3-1.2 6.5-3.4 9.5l-4.4-4.4-3.2 3.2H4.4v-3.8l3.2-3.2-4.4-4.4C6.2 5.9 9.1 2.8 12 2Zm.7 3.1c-1.8.5-3.8 2.2-5.9 5l7.1 7.1c2.8-2.1 4.5-4.7 4.9-7.7-2.6.4-4.8 1.8-6.7 4.1L10.6 12c1.7-2.1 3.7-3.7 6-4.8-1-1-2.3-1.7-3.9-2.1ZM5.8 16.2v1.9h1.9l2.3-2.3-1.9-1.9-2.3 2.3Z"/></svg>';
    }
    if (name === 'quiz') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 0 1 7 7c0 2.8-1.6 5.2-4 6.3V21H9v-4.7A7 7 0 0 1 12 3Zm0 2a5 5 0 0 0-1.6 9.7l.6.2V19h2v-4.1l.6-.2A5 5 0 0 0 12 5Zm-1 9h2v2h-2v-2Zm1-7c1.7 0 3 1.1 3 2.6 0 1-.5 1.7-1.4 2.3l-.7.5V13H11v-1.5l1.4-1c.5-.4.6-.6.6-.9 0-.4-.4-.7-1-.7-.7 0-1.1.4-1.2 1.1H9c.2-1.8 1.4-3 3-3Z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2Zm0 13.85L7.3 15H20V6H4v11.85Z"/></svg>';
  }

  function campaignIconName(campanha) {
    var tipo = campanha && campanha.tipo ? String(campanha.tipo) : '';
    if (tipo === 'melhoria') return 'rocket_launch';
    if (tipo === 'pesquisa') return 'quiz';
    return 'campaign';
  }

  function renderScale() {
    var buttons = [];
    for (var i = 0; i <= 10; i += 1) {
      buttons.push(
        '<button type="button" class="up-score ' + (state.nota === i ? 'up-score-active' : '') + '" data-up-score="' + i + '">' + i + '</button>'
      );
    }
    return '<div><div class="up-scale">' + buttons.join('') + '</div><div class="up-scale-labels"><span>Ruim</span><span>Excelente</span></div></div>';
  }

  function renderModal(animate) {
    var campanha = state.campanha;
    if (!state.open) return '';
    var modalClass = 'up-modal' + (animate ? ' up-modal-enter' : '');

    if (state.submitted) {
      var phoneSection = '';
      if (state.feedbackId && !campanha.exige_confirmacao_leitura) {
        if (state.phoneDone) {
          phoneSection = '<p class="up-phone-done">Telefone salvo!</p>';
        } else {
          phoneSection = [
            '<div class="up-phone-section">',
            '<p class="up-phone-label">Quer deixar seu telefone para contato?</p>',
            '<input type="tel" inputmode="numeric" class="up-phone-input" data-up-telefone="true"',
            ' placeholder="(84) 99999-9999" maxlength="15"',
            ' value="' + escapeHtml(state.telefone) + '"',
            (state.phoneSubmitting ? ' disabled' : '') + '>',
            state.phoneError ? '<p class="up-error">' + escapeHtml(state.phoneError) + '</p>' : '',
            '<button type="button" class="up-submit" data-up-telefone-submit="true"',
            (!state.telefone.trim() || state.phoneSubmitting ? ' disabled' : '') + '>',
            state.phoneSubmitting ? 'Salvando…' : 'Enviar',
            '</button>',
            '</div>',
          ].join('');
        }
      }
      return [
        '<div class="' + modalClass + '" role="dialog" aria-modal="true" aria-label="Feedback enviado">',
        '<div class="up-thanks">',
        '<div class="up-check">' + icon('check') + '</div>',
        '<h4>Obrigado!</h4>',
        '<p>Seu feedback foi registrado e nos ajudara a melhorar.</p>',
        phoneSection,
        '<button type="button" class="up-secondary" data-up-close="true">Fechar</button>',
        '</div>',
        '</div>',
      ].join('');
    }

    var question = campanha.pergunta_feedback || 'Como podemos melhorar?';
    var description = campanha.descricao || '';
    var media = '';
    var action = '';
    var feedback = '';

    if (campanha.video_url) {
      media = '<div class="up-media" data-up-media="true"><iframe src="' + escapeHtml(campanha.video_url) + '" title="Video da campanha" tabindex="-1" loading="lazy" allowfullscreen></iframe></div>';
    } else if (campanha.imagem_url) {
      media = '<div class="up-media"><img src="' + escapeHtml(campanha.imagem_url) + '" alt=""></div>';
    }

    if (campanha.texto_botao && campanha.url_botao) {
      action = '<button type="button" class="up-action" data-up-cta="true" data-up-url="' + escapeHtml(campanha.url_botao) + '">' + escapeHtml(campanha.texto_botao) + '</button>';
    }

    if (campanha.exige_confirmacao_leitura) {
      feedback = [
        '<div class="up-feedback-section">',
        state.error ? '<p class="up-error">' + escapeHtml(state.error) + '</p>' : '',
        '<label class="up-confirm-check"><input type="checkbox" data-up-confirm-check="true"' + (state.confirmacaoMarcada ? ' checked' : '') + '>Confirmo que li esta comunicação</label>',
        '<button type="button" class="up-submit" data-up-confirm="true"' + (!state.confirmacaoMarcada || state.submitting ? ' disabled' : '') + '>',
        state.submitting ? 'Aguarde…' : 'Li e entendi',
        '</button>',
        '</div>',
      ].join('');
    } else if (campanha.feedback_habilitado !== false) {
      feedback = [
        '<div class="up-feedback-section">',
        '<p class="up-question">' + escapeHtml(question) + '</p>',
        renderScale(),
        '<div>',
        '<textarea class="up-textarea" data-up-observacao="true" placeholder="' + (campanha.observacao_obrigatoria ? 'Obrigatorio: escreva sua observacao...' : 'Observacao (opcional)') + '">' + escapeHtml(state.observacao) + '</textarea>',
        '</div>',
        campanha.observacao_obrigatoria ? '<p class="up-required">Observacao obrigatoria</p>' : '',
        state.error ? '<p class="up-error">' + escapeHtml(state.error) + '</p>' : '',
        '<button type="button" class="up-submit" data-up-submit="true" ' + (state.nota === null || state.submitting ? 'disabled' : '') + '>' + (state.submitting ? 'Enviando...' : 'Enviar Feedback') + '</button>',
        '</div>',
      ].join('');
    }

    return [
      '<div class="' + modalClass + '" role="dialog" aria-modal="true" aria-label="' + escapeHtml(campanha.titulo) + '">',
      '<div class="up-modal-header">',
      '<div class="up-brand"><div class="up-brand-icon">' + icon(campaignIconName(campanha)) + '</div><p class="up-title">' + escapeHtml(campanha.titulo) + '</p></div>',
      campanha.permitir_fechar_modal !== false ? '<button type="button" class="up-close" aria-label="Fechar campanha" title="Fechar" data-up-toggle="true">' + icon('close') + '</button>' : '',
      '</div>',
      '<div class="up-body">',
      campanha.subtitulo ? '<p class="up-subtitle">' + escapeHtml(campanha.subtitulo) + '</p>' : '',
      media,
      description ? '<p class="up-description">' + escapeHtml(description) + '</p>' : '',
      action,
      feedback,
      '</div>',
      '</div>',
    ].join('');
  }

  function render() {
    if (!state.root || !state.campanha) return;
    var wasOverlay = state.root.className.indexOf('up-widget-overlay') !== -1;
    var isOpening = state.open && !wasOverlay;
    var isClosing = !state.open && wasOverlay;

    if (isOpening) {
      state.scrollY = window.pageYOffset || 0;
      state.bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    if (isClosing) {
      document.body.style.overflow = state.bodyOverflow;
      window.scrollTo(0, state.scrollY);
    }

    if (state.open) {
      state.root.className = 'up-widget-root up-widget-overlay';
    } else {
      state.root.className = 'up-widget-root';
    }
    state.root.innerHTML = renderModal(isOpening);

    // Campanha abriu ou fechou de verdade (não só re-renderizou por causa de
    // nota/observação mudando) — reavalia se o FAB "Ajuda" deve aparecer.
    if (isOpening || isClosing) jornadaReavaliarFab();
  }

  function updateScaleUI() {
    if (!state.root) return;
    var scoreButtons = state.root.querySelectorAll('[data-up-score]');
    for (var i = 0; i < scoreButtons.length; i++) {
      var btn = scoreButtons[i];
      var score = Number(btn.getAttribute('data-up-score'));
      btn.className = 'up-score' + (score === state.nota ? ' up-score-active' : '');
    }
    var submitBtn = state.root.querySelector('[data-up-submit]');
    if (submitBtn) submitBtn.disabled = state.nota === null;
    var errorEl = state.root.querySelector('.up-error');
    if (errorEl) errorEl.textContent = '';
  }

  // itemId opcional (destaque_elemento com múltiplos itens — Fase 2): cada
  // item tem sua própria chave (campanha_id + item + contexto + usuário),
  // então interagir com o destaque A nunca marca B/C como visto. Omitido
  // (undefined/null), a chave fica IDÊNTICA à de antes — modal_automatica
  // nunca passa itemId, e o fallback de destaque_elemento sem `destaques[]`
  // (pseudo-item legado, ver destaqueElementoResolverItens) também não, de
  // propósito: preserva a MESMA chave que já existia antes de existir
  // `destaques`, então quem já tinha dispensado o destaque legado continua
  // sem vê-lo de novo depois desta atualização.
  function shownKey(campanha, config, itemId) {
    var ctx = config.slug || (config.sistema + ':' + config.tela);
    var uid = config.usuario_id ? ':u:' + config.usuario_id : '';
    var sufixoItem = itemId ? (':item:' + itemId) : '';
    return 'userpulse:shown:' + campanha.id + ':' + ctx + uid + sufixoItem;
  }

  function wasShown(campanha, config, itemId) {
    if (!campanha.mostrar_uma_vez) return false;
    if (campanha.always_show_user) return false;
    if (!campanha.permitir_fechar_modal) return false;
    try {
      return window.localStorage.getItem(shownKey(campanha, config, itemId)) === '1';
    } catch (_err) {
      return false;
    }
  }

  function markShown(campanha, config, itemId) {
    if (!campanha.mostrar_uma_vez) return;
    if (campanha.always_show_user) return;
    if (!campanha.permitir_fechar_modal) return;
    try {
      window.localStorage.setItem(shownKey(campanha, config, itemId), '1');
    } catch (_err) {}
  }

  function shouldAutoOpen(campanha) {
    return (campanha.modo_exibicao || 'modal_automatica') === 'modal_automatica'
      && (campanha.gatilho || 'ao_abrir_tela') === 'ao_abrir_tela';
  }

  function scheduleAutoOpen(campanha, config) {
    // "Destaque em elemento" nunca abre como modal — é um badge/beacon
    // ancorado num elemento da página. Delega pro fluxo próprio; os 4 pontos
    // de seleção de campanha (slug, candidatas ao_abrir_tela, track x2) já
    // chamam scheduleAutoOpen pra qualquer campanha selecionada, então
    // ramificar aqui evita duplicar a lógica de agendamento/atraso em cada
    // um deles.
    if ((campanha.modo_exibicao || 'modal_automatica') === FORMATO_DESTAQUE_ELEMENTO) {
      agendarDestaqueElemento(campanha, config);
      return;
    }
    if (!shouldAutoOpen(campanha) || wasShown(campanha, config)) return;
    var delay = Number.isFinite(Number(campanha.atraso_ms)) ? Math.max(0, Number(campanha.atraso_ms)) : 800;
    state.timer = window.setTimeout(function () {
      // Um tour (retomado após reload/navegação ou automático) já pode ter
      // ocupado a tela nesse meio-tempo — não compete por cima dele.
      if (tourState.ativo) return;
      state.open = true;
      markShown(campanha, config);
      if (!state.visualizacaoRegistrada) {
        state.visualizacaoRegistrada = true;
        registrarEvento('visualizacao');
      }
      render();
    }, delay);
  }

  // ─── Destaque em elemento (Fase 1 de adoção de funcionalidades) ───────────
  // Formato leve: localiza um elemento por data-cy, ancora um badge/beacon
  // nele e, ao clicar, abre um tooltip contextual (título/descrição/CTA
  // opcional/fechar). Nunca quebra a página quando o elemento não existe, e
  // nunca renderiza por cima de um tour ativo. Sem evento de utilização/
  // feedback pós-uso nesta fase (isso é Fase 2, medido por evento real via
  // track()) — reaproveita a MESMA infra de wasShown/markShown (localStorage)
  // do modal, mas com um gatilho diferente: markShown só roda numa interação
  // explícita (clicar no badge, no CTA, ou dispensar), nunca só por ter
  // renderizado — ver comentário em destaqueElementoMontar.
  var FORMATO_DESTAQUE_ELEMENTO = 'destaque_elemento';
  var DATA_CY_SEGURO_REGEX = /^[A-Za-z0-9_][A-Za-z0-9_\-:.]{0,199}$/;

  // Nunca interpola data-cy cru num seletor CSS — usa CSS.escape quando
  // disponível (escapa aspas/colchetes de verdade) e, como rede de
  // segurança adicional, só aceita o mesmo charset validado no servidor
  // (ver dataCyValido em server/src/controllers/campanhas.ts) antes mesmo
  // de tentar montar o seletor.
  function destaqueElementoSeletorSeguro(dataCyBruto) {
    if (typeof dataCyBruto !== 'string') return null;
    var dataCy = dataCyBruto.trim();
    if (!dataCy || !DATA_CY_SEGURO_REGEX.test(dataCy)) return null;
    var valor = (typeof window.CSS !== 'undefined' && typeof window.CSS.escape === 'function')
      ? window.CSS.escape(dataCy)
      : dataCy;
    return '[data-cy="' + valor + '"]';
  }

  // `item` é um CampanhaDestaqueItem (ou o pseudo-item legado montado por
  // destaqueElementoResolverItens) — só precisa de `.data_cy`. A checagem de
  // modo_exibicao acontece antes, em destaqueElementoResolverItens, não aqui.
  function destaqueElementoLocalizarAlvo(item) {
    if (!item) return null;
    var seletor = destaqueElementoSeletorSeguro(item.data_cy);
    if (!seletor) return null;
    try {
      return document.querySelector(seletor);
    } catch (_e) {
      return null;
    }
  }

  // Uma instância por destaque MONTADO (elemento encontrado na página) — 0 a
  // N ao mesmo tempo, uma por CampanhaDestaqueItem independente. Substitui o
  // antigo destaqueElementoState singular (Fase 1, só suportava 1 destaque
  // por campanha).
  var destaqueElementoInstancias = [];

  function destaqueElementoDesmontarInstancia(instancia) {
    if (!instancia || instancia.desmontada) return;
    instancia.desmontada = true;
    destaqueElementoUtilCancelarAutoClose(instancia);
    if (instancia.reposicionar) {
      window.removeEventListener('scroll', instancia.reposicionar, true);
      window.removeEventListener('resize', instancia.reposicionar);
    }
    if (instancia.resizeObserver) instancia.resizeObserver.disconnect();
    if (instancia.mutationObserver) instancia.mutationObserver.disconnect();
    if (instancia.layoutShiftObserver) instancia.layoutShiftObserver.disconnect();
    if (instancia.root && instancia.root.parentNode) instancia.root.parentNode.removeChild(instancia.root);
    var indice = destaqueElementoInstancias.indexOf(instancia);
    if (indice !== -1) destaqueElementoInstancias.splice(indice, 1);
  }

  // Desmonta TODOS os destaques montados no momento — chamado antes de
  // montar uma nova seleção de campanha (nunca deixa destaques de uma
  // campanha anterior sobrepostos aos da campanha recém-selecionada).
  function destaqueElementoDesmontarTodos() {
    var todas = destaqueElementoInstancias.slice();
    for (var i = 0; i < todas.length; i++) destaqueElementoDesmontarInstancia(todas[i]);
  }

  // Função pura: calcula onde o badge deve ficar em relação ao alvo, sempre
  // FORA da caixa do alvo (nunca sobrepondo a área clicável). Preferência:
  // acima, alinhado pela direita, com `gap` de folga; se não houver espaço
  // acima usa abaixo; sempre clampado dentro da viewport horizontalmente.
  // Sem acesso a DOM/window — só aritmética, testável em node:test puro.
  function destaqueElementoCalcularPosicao(alvoRect, badgeSize, viewport, opts) {
    var gap = (opts && typeof opts.gap === 'number') ? opts.gap : 8;
    var margem = (opts && typeof opts.margem === 'number') ? opts.margem : 8;
    var badgeW = badgeSize.width;
    var badgeH = badgeSize.height;

    var posicao = 'acima';
    var top = alvoRect.top - gap - badgeH;
    if (top < margem) {
      posicao = 'abaixo';
      top = alvoRect.bottom + gap;
    }

    var left = alvoRect.right - badgeW;
    var maxLeft = viewport.width - badgeW - margem;
    if (left > maxLeft) left = maxLeft;
    if (left < margem) left = margem;

    return { top: top, left: left, posicao: posicao };
  }

  // Função pura: calcula onde o tooltip deve ficar quando o destaque é
  // aberto. Regra obrigatória: nunca intersecta o retângulo do alvo (o badge
  // já garante isso pra si mesmo — aqui é só o tooltip). Ordem de
  // preferência: abaixo do alvo, depois acima, depois lateral direita,
  // depois lateral esquerda; cada candidato só é aceito se couber inteiro na
  // viewport (com `margem` de folga) — do contrário tenta o próximo. Como
  // abaixo/acima/direita/esquerda são sempre construídos com uma folga
  // (`gap`) a partir do retângulo do alvo, a não-interseção é garantida por
  // construção, não checada a posteriori. Alinhamento horizontal (abaixo/
  // acima) e vertical (laterais) tenta ficar centralizado no badge/alvo pra
  // preservar a associação visual, clampando na viewport quando preciso.
  // Sem acesso a DOM/window — só aritmética, testável em node:test puro.
  function destaqueElementoCalcularPosicaoTooltip(alvoRect, badgeRect, tooltipSize, viewport, opts) {
    var gap = (opts && typeof opts.gap === 'number') ? opts.gap : 8;
    var margem = (opts && typeof opts.margem === 'number') ? opts.margem : 8;
    var w = tooltipSize.width;
    var h = tooltipSize.height;

    function clampHorizontal(left) {
      var maxLeft = viewport.width - w - margem;
      if (left > maxLeft) left = maxLeft;
      if (left < margem) left = margem;
      return left;
    }
    function clampVertical(top) {
      var maxTop = viewport.height - h - margem;
      if (top > maxTop) top = maxTop;
      if (top < margem) top = margem;
      return top;
    }

    var leftCentralizadoNoBadge = badgeRect.left + badgeRect.width / 2 - w / 2;

    var topAbaixo = alvoRect.bottom + gap;
    if (topAbaixo + h <= viewport.height - margem) {
      return { top: topAbaixo, left: clampHorizontal(leftCentralizadoNoBadge), posicao: 'abaixo' };
    }

    var topAcima = alvoRect.top - gap - h;
    if (topAcima >= margem) {
      return { top: topAcima, left: clampHorizontal(leftCentralizadoNoBadge), posicao: 'acima' };
    }

    var topCentralizadoNoAlvo = clampVertical(alvoRect.top + alvoRect.height / 2 - h / 2);

    var leftDireita = alvoRect.right + gap;
    if (leftDireita + w <= viewport.width - margem) {
      return { top: topCentralizadoNoAlvo, left: leftDireita, posicao: 'direita' };
    }

    var leftEsquerda = alvoRect.left - gap - w;
    if (leftEsquerda >= margem) {
      return { top: topCentralizadoNoAlvo, left: leftEsquerda, posicao: 'esquerda' };
    }

    // Nenhuma direção coube inteira na viewport (ex.: alvo enorme ocupando a
    // tela). Prioridade é nunca cobrir o alvo — mantém abaixo (sem
    // interseção por construção) mesmo que ultrapasse a viewport, em vez de
    // clampar por cima do alvo.
    return { top: topAbaixo, left: clampHorizontal(leftCentralizadoNoBadge), posicao: 'abaixo' };
  }

  // Função pura: calcula onde o beacon (ponto conector) deve ficar dentro da
  // largura do badge. NUNCA assume que o centro do badge corresponde ao
  // alvo — em viewports estreitas o clamp horizontal de
  // destaqueElementoCalcularPosicao pode empurrar o badge pra longe do seu
  // alinhamento preferencial (direita do alvo), e um beacon fixo no centro
  // do badge acabaria apontando pro lugar errado. Em vez disso, projeta o
  // centro horizontal do alvo dentro da largura do badge (clampado nas
  // bordas do próprio badge quando o alvo está fora dessa faixa) — o beacon
  // sempre aponta pro ponto do badge mais próximo do alvo real. Retorna um
  // offset em px relativo à borda esquerda do badge (== borda esquerda do
  // root, já que o badge é o único conteúdo em fluxo do root). Sem acesso a
  // DOM/window — só aritmética, testável em node:test puro.
  function destaqueElementoCalcularBeacon(alvoRect, badgeRect) {
    var alvoCentroX = alvoRect.left + alvoRect.width / 2;
    var left = alvoCentroX - badgeRect.left;
    if (left < 0) left = 0;
    if (left > badgeRect.width) left = badgeRect.width;
    return { left: left };
  }

  // Função pura: diz se dois retângulos (getBoundingClientRect-like) são
  // iguais nas 4 bordas. Usada pela estabilização pós-mount (ver
  // destaqueElementoEstabilizar) pra decidir se o alvo se moveu entre dois
  // frames — nunca compara width/height porque isso já é coberto pelo
  // ResizeObserver; aqui o interesse é justamente o caso que o
  // ResizeObserver NÃO cobre: o alvo muda de POSIÇÃO (reflow de algo acima
  // dele) sem mudar de TAMANHO. `null`/`undefined` só são iguais um ao
  // outro. Sem acesso a DOM/window — testável em node:test puro.
  function destaqueElementoRectsIguais(a, b) {
    if (!a || !b) return a === b;
    return a.top === b.top && a.left === b.left && a.right === b.right && a.bottom === b.bottom;
  }

  var DESTAQUE_ESTABILIZACAO_FRAMES_ESTAVEIS = 3;
  var DESTAQUE_ESTABILIZACAO_MAX_MS = 1000;

  // Estabilização pós-mount: cobre o reflow tardio (mais comum em mobile —
  // menu responsivo, banner, imagem sem dimensão reservada) que MUDA A
  // POSIÇÃO do alvo sem mudar seu TAMANHO — cenário que o ResizeObserver do
  // alvo estruturalmente não detecta (ele só dispara em mudança de
  // tamanho da própria caixa observada, nunca só de posição — é assim que a
  // API funciona, não uma lacuna desta página específica). Mede o rect do
  // alvo a cada requestAnimationFrame; se mudou desde o frame anterior,
  // reposiciona (badge/beacon/tooltip, via destaqueElementoReposicionar) e
  // zera o contador de frames estáveis; encerra sozinha depois de
  // DESTAQUE_ESTABILIZACAO_FRAMES_ESTAVEIS frames CONSECUTIVOS sem mudança,
  // ou depois de DESTAQUE_ESTABILIZACAO_MAX_MS (~1s) no total, o que vier
  // primeiro — nunca vira polling permanente. Depois disso só scroll/
  // resize/ResizeObserver continuam cobrindo reposições.
  function destaqueElementoEstabilizar(instancia) {
    var alvo = instancia.alvo;
    var framesEstaveis = 0;
    var inicio = Date.now();
    var rectAnterior = alvo.getBoundingClientRect();

    function passo() {
      // Desmontado (fechado, elemento sumiu, campanha trocada) nesse
      // meio-tempo — encerra sem reagendar mais frames.
      if (instancia.desmontada) return;
      var rectAtual = alvo.getBoundingClientRect();
      if (!destaqueElementoRectsIguais(rectAnterior, rectAtual)) {
        framesEstaveis = 0;
        rectAnterior = rectAtual;
        destaqueElementoReposicionar(instancia);
      } else {
        framesEstaveis++;
      }
      if (framesEstaveis >= DESTAQUE_ESTABILIZACAO_FRAMES_ESTAVEIS) return;
      if (Date.now() - inicio >= DESTAQUE_ESTABILIZACAO_MAX_MS) return;
      window.requestAnimationFrame(passo);
    }

    window.requestAnimationFrame(passo);
  }

  // Qualquer timeout finito na estabilização inicial continua sujeito ao
  // mesmo bug: um reflow que só assenta DEPOIS da janela de ~1s (confirmado
  // em mobile real — conteúdo acima do alvo crescendo por API lenta,
  // hidratação em etapas, troca de fonte) nunca é pego, porque nada mais
  // reagenda o monitor. Em vez de aumentar o timeout (só empurra o mesmo
  // problema pra mais tarde), REARMAMOS um novo burst de estabilização toda
  // vez que algo capaz de mudar o layout acontece enquanto o destaque está
  // montado — sem virar polling permanente, porque só reage a sinais reais
  // (mutation/fonte/layout-shift), nunca fica checando sozinho.
  //
  // destaqueElementoAgendarReacao agenda NO MÁXIMO uma reação por frame —
  // várias mutations/sinais no mesmo frame colapsam numa única chamada de
  // reposicionar()+estabilizar(), porque a flag `reacaoAgendada` bloqueia
  // agendar de novo enquanto já existe um rAF pendente.
  function destaqueElementoAgendarReacao(instancia) {
    if (instancia.desmontada || instancia.reacaoAgendada) return;
    instancia.reacaoAgendada = true;
    window.requestAnimationFrame(function () {
      instancia.reacaoAgendada = false;
      if (instancia.desmontada) return;
      destaqueElementoReposicionar(instancia);
      destaqueElementoEstabilizar(instancia);
    });
  }

  // Função pura: diz se TODAS as mutations da lista aconteceram dentro do
  // próprio root do destaque (badge/beacon/tooltip, ou atributos do root
  // como data-up-pos/style que destaqueElementoReposicionar seta). Essas são
  // auto-causadas pelo próprio widget — reagir a elas criaria um loop
  // (mutation -> reposiciona -> muda style/atributo -> nova mutation -> ...).
  // Só uma mutation fora do root já é motivo suficiente pra reagir. Recebe
  // `root` (com um .contains()) e a lista de mutations (cada uma só precisa
  // de `.target`) — sem acessar estado de instância/rAF, testável isolada.
  function destaqueElementoMutacoesApenasNoRoot(root, mutationsList) {
    for (var i = 0; i < mutationsList.length; i++) {
      if (!root.contains(mutationsList[i].target)) return false;
    }
    return true;
  }

  // MutationObserver no <body> inteiro (childList+subtree+attributes) — é
  // proposital ser amplo: o reflow que desloca o alvo pode vir de QUALQUER
  // elemento acima dele na página (banner, menu, imagem carregando), não só
  // de um contêiner previsível. O custo fica sob controle porque: (1) só
  // registra mutations, não recalcula layout nenhum; (2) destaqueElementoAgendarReacao
  // coalesce tudo numa reação por frame; (3) mutations de dentro do próprio
  // root nunca chegam a agendar nada. Feature-detectado — sem
  // MutationObserver, esse sinal simplesmente não existe (scroll/resize/
  // ResizeObserver/estabilização inicial continuam funcionando).
  function destaqueElementoCriarObservadorMutacoes(instancia) {
    if (typeof window.MutationObserver !== 'function') return null;
    var observer = new window.MutationObserver(function (mutationsList) {
      if (destaqueElementoMutacoesApenasNoRoot(instancia.root, mutationsList)) return;
      destaqueElementoAgendarReacao(instancia);
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    } catch (_e) {
      return null;
    }
    return observer;
  }

  // window.innerWidth/innerHeight incluem a faixa da scrollbar — confirmado
  // em mobile real: innerWidth=390 vs visualViewport.width=375 (~15px de
  // diferença). Não é a causa do deslocamento vertical reportado, mas é a
  // fonte correta pro clamp horizontal: visualViewport é o retângulo que o
  // usuário realmente vê. Preferência: visualViewport > clientWidth/Height
  // (também exclui scrollbar) > innerWidth/innerHeight (último recurso).
  function destaqueElementoObterViewport() {
    if (window.visualViewport) {
      return { width: window.visualViewport.width, height: window.visualViewport.height };
    }
    if (document.documentElement) {
      return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function destaqueElementoReposicionar(instancia) {
    if (!instancia || !instancia.root || !instancia.alvo) return;
    // SPA pode remover o elemento do DOM depois de montado (navegação,
    // re-render) — desmonta só ESTA instância sem quebrar a página, em vez
    // de deixar o badge flutuando "no ar" sobre um alvo que não existe mais.
    // Os outros destaques da mesma campanha continuam intactos.
    if (!document.body.contains(instancia.alvo)) {
      destaqueElementoDesmontarInstancia(instancia);
      return;
    }
    var badgeEl = instancia.root.querySelector('.up-destaque-badge');
    if (!badgeEl) return;
    var rect = instancia.alvo.getBoundingClientRect();
    var badgeSize = { width: badgeEl.offsetWidth, height: badgeEl.offsetHeight };
    var viewport = destaqueElementoObterViewport();
    var pos = destaqueElementoCalcularPosicao(rect, badgeSize, viewport);
    instancia.root.style.top = pos.top + 'px';
    instancia.root.style.left = pos.left + 'px';
    instancia.root.setAttribute('data-up-pos', pos.posicao);

    // badgeRect é medido DEPOIS de aplicar top/left acima — reflete a
    // posição final já clampada, não a preferencial. É a partir dela (não
    // do badgeSize genérico) que beacon e tooltip calculam onde ficar.
    var badgeRect = badgeEl.getBoundingClientRect();

    var beaconEl = instancia.root.querySelector('.up-destaque-beacon');
    if (beaconEl) {
      var posBeacon = destaqueElementoCalcularBeacon(rect, badgeRect);
      beaconEl.style.left = posBeacon.left + 'px';
    }

    var tooltipEl = instancia.root.querySelector('.up-destaque-tooltip');
    if (tooltipEl) {
      var tooltipSize = { width: tooltipEl.offsetWidth, height: tooltipEl.offsetHeight };
      var posTooltip = destaqueElementoCalcularPosicaoTooltip(rect, badgeRect, tooltipSize, viewport);
      tooltipEl.style.top = posTooltip.top + 'px';
      tooltipEl.style.left = posTooltip.left + 'px';
    }
  }

  // Avaliação "Essa melhoria foi útil?" (utilidade_destaque) — só faz
  // sentido pra um item real (item.id truthy). O pseudo-item legado
  // (id:null, campanha destaque_elemento ainda sem `destaques[]`, ver
  // destaqueElementoResolverItens) nunca tem destaque_item_id válido pro
  // backend validar, então nunca mostra esta seção. UX em 2 passos: clicar
  // Sim/Não já registra a escolha (otimista, silencioso — mesmo padrão de
  // registrarEvento/tourFeedback), depois revela um comentário opcional com
  // envio próprio (com loading/erro visíveis, mesmo padrão do feedback geral).
  function destaqueElementoUtilConteudo(utilidade) {
    if (!utilidade) return '';
    // comentarioEnviado === true só depois do envio VISÍVEL do comentário ter
    // sucesso (nunca do clique silencioso em Sim/Não) — substitui a seção
    // inteira por um agradecimento breve; destaqueElementoUtilAgendarFechamento
    // já fechou (ou vai fechar) o tooltip sozinho pouco depois, então não faz
    // sentido continuar mostrando os botões Sim/Não/comentário aqui.
    if (utilidade.comentarioEnviado) {
      return '<div class="up-destaque-util"><p class="up-destaque-util-ok">Obrigado pelo feedback!</p></div>';
    }
    var escolha = utilidade.escolha;
    var partes = ['<div class="up-destaque-util">'];
    if (escolha === null) {
      partes.push('<p class="up-destaque-util-label">Essa melhoria foi útil?</p>');
    }
    partes.push(
      '<div class="up-destaque-util-botoes">',
      '<button type="button" class="up-destaque-util-btn' + (escolha === true ? ' up-destaque-util-btn-ativo' : '') + '" data-up-util-sim="true" aria-pressed="' + (escolha === true ? 'true' : 'false') + '">👍 Sim</button>',
      '<button type="button" class="up-destaque-util-btn' + (escolha === false ? ' up-destaque-util-btn-ativo' : '') + '" data-up-util-nao="true" aria-pressed="' + (escolha === false ? 'true' : 'false') + '">👎 Não</button>',
      '</div>'
    );
    if (escolha !== null) {
      partes.push(
        '<div class="up-destaque-util-comentario">',
        '<p class="up-destaque-util-label">Quer contar mais? (opcional)</p>',
        '<textarea class="up-textarea" data-up-util-comentario="true" placeholder="Comentário opcional">' + escapeHtml(utilidade.comentario || '') + '</textarea>',
        utilidade.erro ? '<p class="up-error">' + escapeHtml(utilidade.erro) + '</p>' : '',
        '<button type="button" class="up-submit" data-up-util-enviar-comentario="true"' + (utilidade.enviando ? ' disabled' : '') + '>' + (utilidade.enviando ? 'Enviando...' : 'Enviar') + '</button>',
        '</div>'
      );
    }
    partes.push('</div>');
    return partes.join('');
  }

  // Envia a avaliação de utilidade do destaque (Sim/Não + comentário
  // opcional). `comFeedbackVisivel` diferencia os 2 pontos de chamada:
  // - false: clique inicial em Sim/Não — otimista/silencioso, mesmo
  //   princípio de registrarEvento (falha de rede nunca aparece pro usuário,
  //   nunca quebra o resto do widget).
  // - true: clique em "Enviar" do comentário — mostra loading/erro visíveis
  //   (mesmo padrão de submitFeedback/up-error), porque foi uma ação
  //   explícita de formulário.
  // Tudo dentro de try/catch, igual registrarEvento: erro síncrono ou de
  // rede nunca pode quebrar o site do cliente onde o widget está embarcado.
  function enviarUtilidadeDestaque(instancia, util, comentario, comFeedbackVisivel) {
    try {
      var campanha = instancia.campanha;
      var config = instancia.config;
      var item = instancia.item;
      if (!campanha || !config || !item || !item.id) return;
      // Sem usuario_id o backend rejeita (mesma exigência de
      // registrarFeedback) — nunca manda a requisição à toa. A escolha local
      // (otimista) já foi aplicada por quem chamou, então a UI não trava.
      if (!config.usuario_id) return;

      if (comFeedbackVisivel) {
        instancia.utilidade.enviando = true;
        instancia.utilidade.erro = null;
        destaqueElementoRender(instancia);
      }

      fetch(apiUrl('/api/widget/feedback/utilidade-destaque'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          public_key: config.public_key || undefined,
          campanha_id: campanha.id,
          destaque_item_id: item.id,
          util: util,
          observacao: comentario || undefined,
          usuario_id: config.usuario_id,
          usuario_nome: config.usuario_nome || undefined,
          usuario_email: config.usuario_email || undefined,
          sistema: config.sistema || undefined,
          tela: config.tela || undefined,
          navegador: window.navigator.userAgent,
          dispositivo: getDevice(),
          contexto: config.contexto || undefined,
        }),
      }).then(function (resp) {
        if (instancia.desmontada || !comFeedbackVisivel) return;
        instancia.utilidade.enviando = false;
        if (resp && resp.ok) {
          instancia.utilidade.comentarioEnviado = true;
          instancia.utilidade.erro = null;
          destaqueElementoRender(instancia);
          // Sucesso do comentário: mostra "Obrigado pelo feedback!" por um
          // instante e fecha só o tooltip sozinho (nunca a instância inteira,
          // nunca dispensa — ver destaqueElementoUtilAgendarFechamento).
          destaqueElementoUtilAgendarFechamento(instancia);
        } else {
          instancia.utilidade.erro = 'Não foi possível enviar. Tente novamente.';
          destaqueElementoRender(instancia);
        }
      }).catch(function () {
        if (instancia.desmontada || !comFeedbackVisivel) return;
        instancia.utilidade.enviando = false;
        instancia.utilidade.erro = 'Não foi possível enviar. Tente novamente.';
        destaqueElementoRender(instancia);
      });
    } catch (_e) {
      if (comFeedbackVisivel && instancia && instancia.utilidade) {
        instancia.utilidade.enviando = false;
        instancia.utilidade.erro = 'Não foi possível enviar. Tente novamente.';
      }
    }
  }

  var UTIL_AUTO_CLOSE_MS = 2000;

  function destaqueElementoUtilCancelarAutoClose(instancia) {
    if (instancia && instancia.utilAutoCloseTimer) {
      window.clearTimeout(instancia.utilAutoCloseTimer);
      instancia.utilAutoCloseTimer = null;
    }
  }

  // Fecha só o TOOLTIP (aberto:false) depois de um comentário de utilidade
  // enviado com sucesso — nunca desmonta a instância (badge continua na
  // página, reabrível) e nunca chama markShown/registrarEvento('dispensa',
  // ...): esse evento é exclusivo do fechamento explícito pelo usuário (botão
  // X, ver o listener de clique). "Até interagir" não é afetado — avaliar
  // utilidade nunca marcou o item como visto, e continua não marcando aqui.
  function destaqueElementoUtilAgendarFechamento(instancia) {
    destaqueElementoUtilCancelarAutoClose(instancia);
    instancia.utilAutoCloseTimer = window.setTimeout(function () {
      instancia.utilAutoCloseTimer = null;
      if (instancia.desmontada) return;
      instancia.aberto = false;
      destaqueElementoRender(instancia);
    }, UTIL_AUTO_CLOSE_MS);
  }

  // `item` é um CampanhaDestaqueItem (ou o pseudo-item legado) — cada
  // instância renderiza o SEU próprio item, independente dos outros.
  function destaqueElementoConteudo(item, aberto, utilidade) {
    var badgeTexto = (item.texto_badge && String(item.texto_badge).trim()) || 'Novo';
    var temCta = Boolean(item.texto_botao && item.url_botao);
    var partes = [
      '<span class="up-destaque-badge" data-up-destaque-toggle="true" role="button" tabindex="0" aria-expanded="' + (aberto ? 'true' : 'false') + '" aria-label="' + escapeHtml(badgeTexto) + '">',
      escapeHtml(badgeTexto),
      '</span>',
      '<span class="up-destaque-beacon" aria-hidden="true"></span>',
    ];
    if (aberto) {
      partes.push(
        '<div class="up-destaque-tooltip" role="dialog" aria-label="' + escapeHtml(item.titulo || '') + '">',
        '<button type="button" class="up-destaque-close" data-up-destaque-close="true" aria-label="Fechar">' + icon('close') + '</button>',
        '<p class="up-destaque-titulo">' + escapeHtml(item.titulo || '') + '</p>',
        item.descricao ? '<p class="up-destaque-descricao">' + escapeHtml(item.descricao) + '</p>' : '',
        temCta ? '<button type="button" class="up-destaque-cta" data-up-destaque-cta="true" data-up-url="' + escapeHtml(item.url_botao) + '">' + escapeHtml(item.texto_botao) + '</button>' : '',
        item.id ? destaqueElementoUtilConteudo(utilidade) : '',
        '</div>'
      );
    }
    return partes.join('');
  }

  function destaqueElementoRender(instancia) {
    if (!instancia.root) return;
    instancia.root.innerHTML = destaqueElementoConteudo(instancia.item, instancia.aberto, instancia.utilidade);
    destaqueElementoReposicionar(instancia);
  }

  // Monta UMA instância independente pra `item` (já com o alvo localizado).
  // Cada instância tem seu próprio root/listeners/observers — fechar ou
  // interagir com uma nunca afeta as outras.
  function destaqueElementoMontarItem(campanha, config, item, alvo) {
    var root = document.createElement('div');
    root.className = 'up-destaque-root';
    document.body.appendChild(root);

    var instancia = {
      root: root,
      campanha: campanha,
      config: config,
      item: item,
      alvo: alvo,
      aberto: false,
      reposicionar: null,
      resizeObserver: null,
      mutationObserver: null,
      layoutShiftObserver: null,
      reacaoAgendada: false,
      desmontada: false,
      // Avaliação de utilidade deste item ("Essa melhoria foi útil?") —
      // independente de state.nota (feedback geral) e de qualquer outra
      // instância (cada destaque tem a sua própria escolha/comentário).
      utilidade: { escolha: null, comentario: '', enviando: false, erro: null, comentarioEnviado: false },
      // Timer do fechamento automático do tooltip após um comentário de
      // utilidade enviado com sucesso — ver destaqueElementoUtilAgendarFechamento.
      utilAutoCloseTimer: null,
    };
    instancia.reposicionar = function () { destaqueElementoReposicionar(instancia); };
    destaqueElementoInstancias.push(instancia);

    window.addEventListener('scroll', instancia.reposicionar, true);
    window.addEventListener('resize', instancia.reposicionar);

    // ResizeObserver no ALVO (não polling) — cobre o caso de o próprio alvo
    // mudar de TAMANHO sem disparar scroll/resize da window (ex.: texto do
    // botão quebra em 2 linhas num viewport estreito, alterando a altura do
    // alvo depois do mount). Feature-detectado — navegador sem suporte
    // simplesmente não reposiciona nesse cenário específico, sem quebrar o
    // resto (scroll/resize continuam cobrindo os outros casos).
    // NÃO cobre o alvo mudar só de POSIÇÃO com o mesmo tamanho (reflow de
    // algo acima dele) — é assim que a API funciona, por design. Esse caso é
    // coberto por destaqueElementoEstabilizar logo abaixo.
    if (typeof window.ResizeObserver === 'function') {
      var resizeObserver = new window.ResizeObserver(function () {
        destaqueElementoReposicionar(instancia);
      });
      resizeObserver.observe(alvo);
      instancia.resizeObserver = resizeObserver;
    }

    // Cobre reflow tardio que só muda a POSIÇÃO do alvo, mesmo depois da
    // estabilização inicial já ter encerrado — ver destaqueElementoAgendarReacao.
    instancia.mutationObserver = destaqueElementoCriarObservadorMutacoes(instancia);

    // Troca de fonte web costuma re-layoutar texto (e tudo abaixo dele) só
    // depois de várias centenas de ms — bem depois da estabilização inicial.
    // document.fonts.ready é uma Promise que resolve UMA vez; não precisa de
    // disconnect (destaqueElementoAgendarReacao já ignora sozinha se tiver
    // desmontado nesse meio-tempo).
    // Feature-detectado — sem Fonts API, esse sinal simplesmente não existe.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        destaqueElementoAgendarReacao(instancia);
      });
    }

    // Layout Shift (Web Vitals/CLS) — sinal ADICIONAL opcional, nunca do que
    // o funcionamento depende (suporte varia muito entre navegadores, ex.:
    // Safari não tem 'layout-shift'). observe() com um entry type não
    // suportado lança síncrono — por isso o try/catch, não só o
    // typeof PerformanceObserver.
    if (typeof window.PerformanceObserver === 'function') {
      try {
        var layoutShiftObserver = new window.PerformanceObserver(function () {
          destaqueElementoAgendarReacao(instancia);
        });
        layoutShiftObserver.observe({ type: 'layout-shift', buffered: false });
        instancia.layoutShiftObserver = layoutShiftObserver;
      } catch (_e) { /* 'layout-shift' não suportado neste navegador — sinal opcional, ignora */ }
    }

    root.addEventListener('click', function (event) {
      var target = event.target;
      var closeEl = target.closest && target.closest('[data-up-destaque-close]');
      var toggleEl = target.closest && target.closest('[data-up-destaque-toggle]');
      var ctaEl = target.closest && target.closest('[data-up-destaque-cta]');
      // "Visto" pra destaque_elemento é uma INTERAÇÃO explícita (clicar no
      // badge, no CTA ou dispensar) — nunca só a renderização. Diferente do
      // modal, onde markShown roda ao abrir (ver scheduleAutoOpen): aqui o
      // usuário pode ver o badge e ignorá-lo (ex.: está no meio de outra
      // tarefa) sem que isso conte como "já viu a novidade" — ela deve
      // continuar aparecendo até uma dessas 3 ações acontecer. `item.id`
      // (null pro pseudo-item legado) escopa a marcação a ESTE destaque —
      // interagir aqui nunca marca/esconde os outros itens da campanha.
      if (closeEl) {
        markShown(campanha, config, item.id);
        registrarEvento('dispensa', campanha, config, item.id);
        destaqueElementoDesmontarInstancia(instancia);
        return;
      }
      if (ctaEl) {
        markShown(campanha, config, item.id);
        registrarEvento('clique_cta', campanha, config, item.id);
        var url = ctaEl.getAttribute('data-up-url');
        if (url) window.open(url, '_blank', 'noopener');
        return;
      }
      if (toggleEl) {
        markShown(campanha, config, item.id);
        registrarEvento('interacao_badge', campanha, config, item.id);
        instancia.aberto = !instancia.aberto;
        destaqueElementoRender(instancia);
        return;
      }

      var utilSimEl = target.closest && target.closest('[data-up-util-sim]');
      var utilNaoEl = target.closest && target.closest('[data-up-util-nao]');
      var utilEnviarEl = target.closest && target.closest('[data-up-util-enviar-comentario]');

      // Avaliação de utilidade do destaque — independente de
      // badge/CTA/dispensa acima (não chama markShown nem registrarEvento;
      // é um fluxo de persistência próprio, ver enviarUtilidadeDestaque).
      if (utilSimEl || utilNaoEl) {
        if (instancia.utilidade.enviando) return;
        destaqueElementoUtilCancelarAutoClose(instancia);
        var novaEscolha = !!utilSimEl;
        instancia.utilidade.escolha = novaEscolha;
        instancia.utilidade.erro = null;
        instancia.utilidade.comentarioEnviado = false;
        destaqueElementoRender(instancia);
        enviarUtilidadeDestaque(instancia, novaEscolha, null, false);
        return;
      }
      if (utilEnviarEl) {
        if (instancia.utilidade.escolha === null || instancia.utilidade.enviando) return;
        enviarUtilidadeDestaque(instancia, instancia.utilidade.escolha, instancia.utilidade.comentario, true);
      }
    });

    // Delegado (não re-renderiza a cada tecla, mesmo padrão de
    // data-up-observacao no modal principal) — re-render destruiria o
    // innerHTML e quebraria o foco/cursor do textarea a cada caractere
    // digitado.
    root.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.matches && target.matches('[data-up-util-comentario]')) {
        instancia.utilidade.comentario = target.value;
        instancia.utilidade.comentarioEnviado = false;
      }
    });

    // Duplo requestAnimationFrame antes da primeira medição/posicionamento:
    // garante que o navegador concluiu pelo menos um ciclo de layout+paint
    // depois do mount antes de ler getBoundingClientRect/offsetWidth. Sem
    // isso, medir no mesmo tick do mount pode capturar um layout ainda
    // instável (fonte web carregando, imagem sem dimensão reservada, menu
    // responsivo mobile ainda recalculando) — mais comum em mobile, onde a
    // página tende a ter mais reflows tardios que o desktop. Um único rAF
    // roda antes do próximo paint; o segundo garante que esse paint já
    // aconteceu. Sem custo perceptível (~1 frame, ~16ms).
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        // Pode ter sido desmontada (fechada, elemento sumiu) nesse meio
        // tempo — nunca opera sobre uma instância que não existe mais.
        if (instancia.desmontada) return;
        destaqueElementoRender(instancia);
        // "visualizacao" só aqui — no primeiro render de verdade da
        // instância (badge já visível na tela), nunca nos re-renders
        // disparados por destaqueElementoRender dentro do toggle (abrir/
        // fechar o tooltip não é uma nova visualização do badge).
        registrarEvento('visualizacao', campanha, config, item.id);
        // Cobre reflow tardio que só muda a POSIÇÃO do alvo (não o
        // tamanho) — o ResizeObserver acima não pega esse caso. Curta,
        // se auto-encerra (ver destaqueElementoEstabilizar).
        destaqueElementoEstabilizar(instancia);
      });
    });

    return instancia;
  }

  // Compat: uso antigo (Fase 1) com (campanha, config, alvo) direto — monta
  // UMA instância usando os campos legados da própria campanha como um
  // pseudo-item (id:null, mesmo shape do fallback em
  // destaqueElementoResolverItens). O runtime real (agendarDestaqueElemento)
  // sempre passa por destaqueElementoMontarTodos; esta função existe pra não
  // quebrar quem já chamava a API antiga (ver
  // server/src/widgetDestaqueElemento.test.ts).
  function destaqueElementoMontar(campanha, config, alvo) {
    destaqueElementoDesmontarTodos();
    return destaqueElementoMontarItem(campanha, config, {
      id: null,
      data_cy: campanha.data_cy,
      texto_badge: campanha.subtitulo,
      titulo: campanha.titulo,
      descricao: campanha.descricao,
      texto_botao: campanha.texto_botao,
      url_botao: campanha.url_botao,
    }, alvo);
  }

  // Função pura: resolve a lista de itens a montar pra uma campanha
  // destaque_elemento. `destaques` (Fase 2, N itens independentes) tem
  // prioridade; sem nenhum item ali (campanha antiga que ainda não passou
  // pelo backfill, ou resposta em cache de antes de `destaques` existir),
  // cai pro fallback legado: um único pseudo-item (id:null, pra usar a MESMA
  // chave de shownKey que já existia — ver comentário em shownKey) montado a
  // partir dos campos antigos da própria Campanha. Sem acesso a DOM/window —
  // testável em node:test puro.
  function destaqueElementoResolverItens(campanha) {
    if (!campanha) return [];
    if (Array.isArray(campanha.destaques) && campanha.destaques.length > 0) {
      return campanha.destaques;
    }
    if ((campanha.modo_exibicao || '') !== FORMATO_DESTAQUE_ELEMENTO) return [];
    if (!campanha.data_cy) return [];
    return [{
      id: null,
      data_cy: campanha.data_cy,
      texto_badge: campanha.subtitulo,
      titulo: campanha.titulo,
      descricao: campanha.descricao,
      texto_botao: campanha.texto_botao,
      url_botao: campanha.url_botao,
    }];
  }

  // Monta TODOS os destaques elegíveis da campanha — um alvo ausente ou já
  // "visto" (Até interagir) nunca bloqueia os demais, cada item é resolvido
  // de forma independente. Desmonta qualquer destaque de uma seleção de
  // campanha anterior antes de montar os novos.
  function destaqueElementoMontarTodos(campanha, config) {
    destaqueElementoDesmontarTodos();
    var itens = destaqueElementoResolverItens(campanha);
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      if (item.ativo === false) continue;
      if (wasShown(campanha, config, item.id)) continue;
      var alvo = destaqueElementoLocalizarAlvo(item);
      // Elemento não encontrado — nunca quebra a página, nunca mostra
      // destaque incorreto; simplesmente não monta ESTE item (os outros
      // continuam sendo processados normalmente).
      if (!alvo) continue;
      destaqueElementoMontarItem(campanha, config, item, alvo);
    }
  }

  // Mesmo padrão de tourGetTestClickListener: devolve só o listener de
  // clique religado no root de UMA instância (por padrão a primeira — índice
  // 0, mesma que os testes da Fase 1 já esperavam), sem expor
  // destaqueElementoInstancias (ou qualquer outro estado) em _internal.
  // `.listeners` é uma propriedade do elemento FAKE usado só pelo harness de
  // teste (vm) — um DOM real não tem isso, então este helper nunca resolve
  // nada fora do harness. Usado por server/src/widgetDestaqueElemento.test.ts
  // pra simular clique real no badge/CTA/fechar sem chamar a lógica de
  // marcação como função solta.
  function destaqueElementoGetTestClickListener(indice) {
    var instancia = destaqueElementoInstancias[indice || 0];
    var root = instancia && instancia.root;
    return (root && root.listeners && root.listeners.click && root.listeners.click[0]) || null;
  }

  // Mesmo padrão de destaqueElementoGetTestClickListener, pro listener
  // 'input' (comentário opcional de utilidade_destaque) — usado por
  // server/src/widgetDestaqueElemento.test.ts pra simular digitação no
  // textarea sem tocar em instancia.utilidade diretamente como estado solto.
  function destaqueElementoGetTestInputListener(indice) {
    var instancia = destaqueElementoInstancias[indice || 0];
    var root = instancia && instancia.root;
    return (root && root.listeners && root.listeners.input && root.listeners.input[0]) || null;
  }

  // Mesmo padrão dos 2 acima — expõe só instancia.utilidade (escolha/
  // comentario/enviando/erro/comentarioEnviado) pra inspeção em teste, sem
  // expor destaqueElementoInstancias inteiro. Usado por
  // server/src/widgetDestaqueElemento.test.ts pra confirmar que uma falha de
  // envio reseta `enviando` (permite tentar de novo) sem depender de
  // inspecionar o HTML renderizado.
  function destaqueElementoGetTestUtilidadeState(indice) {
    var instancia = destaqueElementoInstancias[indice || 0];
    return (instancia && instancia.utilidade) || null;
  }

  // Mesmo padrão — expõe só instancia.aberto, pra confirmar em teste que o
  // fechamento automático após um comentário de utilidade enviado com
  // sucesso (ver destaqueElementoUtilAgendarFechamento) realmente fecha o
  // tooltip, sem depender de inspecionar o HTML renderizado.
  function destaqueElementoGetTestAberto(indice) {
    var instancia = destaqueElementoInstancias[indice || 0];
    return instancia ? instancia.aberto : null;
  }

  function agendarDestaqueElemento(campanha, config) {
    if ((campanha.gatilho || 'ao_abrir_tela') !== 'ao_abrir_tela') return;
    var delay = Number.isFinite(Number(campanha.atraso_ms)) ? Math.max(0, Number(campanha.atraso_ms)) : 800;
    state.timer = window.setTimeout(function () {
      if (tourState.ativo) return;
      destaqueElementoMontarTodos(campanha, config);
    }, delay);
  }

  var AUTO_CLOSE_MS = 2500;

  function doClose() {
    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }
    if (!state.open) return;
    state.open = false;
    state.submitted = false;
    state.nota = null;
    state.observacao = '';
    state.confirmacaoMarcada = false;
    state.error = '';
    render();
  }

  function scheduleAutoClose(delayMs) {
    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }
    state.closeTimer = window.setTimeout(function () {
      state.closeTimer = null;
      doClose();
    }, delayMs != null ? delayMs : AUTO_CLOSE_MS);
  }

  function bindEvents() {
    if (!state.root) return;

    // Impede que eventos de ponteiro dentro do widget propaguem para a página hospedeira.
    state.root.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    state.root.addEventListener('mousedown',   function (e) { e.stopPropagation(); });
    state.root.addEventListener('mouseup',     function (e) { e.stopPropagation(); });
    state.root.addEventListener('touchstart',  function (e) { e.stopPropagation(); });
    state.root.addEventListener('touchend',    function (e) { e.stopPropagation(); });
    state.root.addEventListener('wheel',       function (e) { e.stopPropagation(); });

    // O body já está com overflow:hidden enquanto a modal está aberta, mas como fallback:
    // se o browser tentou focar o iframe e provocar scroll, restauramos a posição salva.
    state.root.addEventListener('focusin', function () {
      window.requestAnimationFrame(function () {
        window.scrollTo(0, state.scrollY);
      });
    });

    state.root.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('[data-up-toggle]')) {
        event.preventDefault();
        event.stopPropagation();
        state.open = !state.open;
        if (state.open && !state.visualizacaoRegistrada) {
          state.visualizacaoRegistrada = true;
          registrarEvento('visualizacao');
        }
        state.error = '';
        render();
        return;
      }

      if (target.closest('[data-up-close]')) {
        event.preventDefault();
        event.stopPropagation();
        doClose();
        return;
      }

      var scoreButton = target.closest('[data-up-score]');
      if (scoreButton) {
        event.preventDefault();
        event.stopPropagation();
        state.nota = Number(scoreButton.getAttribute('data-up-score'));
        state.error = '';
        updateScaleUI();
        return;
      }

      var ctaButton = target.closest('[data-up-cta]');
      if (ctaButton) {
        event.preventDefault();
        event.stopPropagation();
        var ctaUrl = ctaButton.getAttribute('data-up-url');
        if (ctaUrl) window.open(ctaUrl, '_blank', 'noopener');
        registrarEvento('clique_cta');
        return;
      }

      if (target.closest('[data-up-confirm]')) {
        event.preventDefault();
        event.stopPropagation();
        submitConfirmacao();
        return;
      }

      if (target.closest('[data-up-telefone-submit]')) {
        event.preventDefault();
        event.stopPropagation();
        submitTelefone();
        return;
      }

      if (target.closest('[data-up-submit]')) {
        event.preventDefault();
        event.stopPropagation();
        submitFeedback();
      }
    });

    state.root.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.matches && target.matches('[data-up-observacao]')) {
        state.observacao = target.value;
      }
      if (target && target.matches && target.matches('[data-up-telefone]')) {
        if (state.closeTimer) {
          window.clearTimeout(state.closeTimer);
          state.closeTimer = null;
        }
        var masked = maskPhone(target.value);
        target.value = masked;
        state.telefone = masked;
        var btn = state.root.querySelector('[data-up-telefone-submit]');
        if (btn) btn.disabled = !masked.trim();
      }
    });

    state.root.addEventListener('change', function (event) {
      var target = event.target;
      if (target && target.matches && target.matches('[data-up-confirm-check]')) {
        state.confirmacaoMarcada = !!target.checked;
        state.error = '';
        var btn = state.root.querySelector('[data-up-confirm]');
        if (btn) btn.disabled = !state.confirmacaoMarcada || state.submitting;
      }
    });
  }

  function resetRoot() {
    var oldRoot = document.getElementById(WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    state.root = document.createElement('div');
    state.root.id = WIDGET_ID;
    state.root.className = 'up-widget-root';
    document.body.appendChild(state.root);
    bindEvents();
  }

  var CONTEXT_KEYS = [
    'cliente_id', 'cliente_nome', 'unidade_id', 'unidade_nome',
    'usuario_tipo', 'organizacao_id', 'clinica_id', 'Estado', 'Perfil',
    'usuario_nome', 'usuario_email',
    'usuario_local_id', 'cliente_local_id', 'unidade_local_id',
    'organizacao_nome', 'clinica_nome',
  ];

  function normalizeConfig(config) {
    var c = config || {};
    var contexto = {};
    for (var i = 0; i < CONTEXT_KEYS.length; i++) {
      var k = CONTEXT_KEYS[i];
      if (c[k] != null && c[k] !== '') contexto[k] = String(c[k]);
    }
    // public_key: identificador público do tenant (Fase 2 do widget
    // multi-tenant) — aceita tanto public_key (convenção do projeto, igual
    // usuario_id/usuario_nome) quanto publicKey (camelCase), pra não exigir
    // um nome exato de quem já tenha copiado de outro exemplo.
    var publicKey = c.public_key || c.publicKey;
    return {
      public_key: publicKey ? String(publicKey) : '',
      slug: c.slug ? String(c.slug) : '',
      sistema: c.sistema ? String(c.sistema) : '',
      tela: c.tela ? String(c.tela) : '',
      usuario_id: c.usuario_id ? String(c.usuario_id) : '',
      usuario_nome: c.usuario_nome ? String(c.usuario_nome) : '',
      usuario_email: c.usuario_email ? String(c.usuario_email) : '',
      contexto: Object.keys(contexto).length ? contexto : null,
      contextProvider: typeof c.contextProvider === 'function' ? c.contextProvider : null,
    };
  }

  // Anexa public_key (se configurado) a uma query string de rota pública do
  // widget — lido de state.config em vez de receber como parâmetro pra não
  // precisar mudar a assinatura de toda função que já monta uma URLSearchParams
  // sem receber o config inteiro (fetchCandidatas, fetchTour, etc.), mesmo
  // padrão já usado por registrarEvento() (topo do arquivo) pra outros campos.
  function appendPublicKey(params) {
    if (state.config && state.config.public_key) params.set('public_key', state.config.public_key);
  }

  // Consulta o contextProvider (se configurado) e faz merge no contexto atual.
  // Chamado antes de cada avaliação de campanha para garantir contexto atualizado em SPAs.
  function resolveContexto() {
    var config = state.config;
    if (!config) return null;
    var provider = config.contextProvider;
    if (provider && typeof provider === 'function') {
      try {
        var resultado = provider();
        if (resultado && typeof resultado === 'object') {
          config.contexto = Object.assign({}, config.contexto || {}, resultado);
        }
      } catch (_e) { /* provider falhou — mantém contexto anterior */ }
    }
    return config.contexto;
  }

  function fetchCampaign(config) {
    var params = new URLSearchParams();
    if (config.slug) {
      params.set('slug', config.slug);
    } else {
      params.set('sistema', config.sistema);
      params.set('tela', config.tela);
    }
    if (config.usuario_id) params.set('usuario_id', config.usuario_id);
    appendContexto(params, config.contexto);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/campanha?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Nao foi possivel carregar a campanha.');
      return response.json();
    });
  }

  function appendContexto(params, contexto) {
    if (!contexto) return;
    if (contexto.cliente_id) params.set('cliente_id', contexto.cliente_id);
    if (contexto.unidade_id) params.set('unidade_id', contexto.unidade_id);
    if (contexto.Perfil) params.set('perfil', contexto.Perfil);
    if (contexto.usuario_tipo) params.set('usuario_tipo', contexto.usuario_tipo);
    if (contexto.Estado) params.set('estado', contexto.Estado);
  }

  function fetchCandidatas(sistema, tela, gatilho, eventoNome, usuario_id, contexto) {
    var params = new URLSearchParams();
    params.set('sistema', sistema);
    if (tela) params.set('tela', tela);
    if (gatilho) params.set('gatilho', gatilho);
    if (eventoNome) params.set('evento', String(eventoNome));
    if (usuario_id) params.set('usuario_id', usuario_id);
    appendContexto(params, contexto);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/candidatas?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return [];
      return response.json();
    });
  }

  function checkMode(campanha, config) {
    var modo = campanha.modo_identificacao || 'sistema_tela';
    if (modo === 'sistema_tela') {
      return campanha.tela === config.tela;
    }
    if (modo === 'data_cy') {
      var seletor = campanha.data_cy;
      if (!seletor) return false;
      try {
        return Boolean(document.querySelector('[data-cy="' + seletor + '"]'));
      } catch (_e) {
        return false;
      }
    }
    if (modo === 'url_contem') {
      var val = campanha.url_contem;
      if (!val) return false;
      var normalized = val.trim();
      try { normalized = new URL(normalized).pathname; } catch (_) {}
      if (normalized.charAt(0) !== '/') {
        return window.location.href.indexOf(normalized) !== -1;
      }
      var p = window.location.pathname;
      return p === normalized || p.startsWith(normalized + '/');
    }
    return false;
  }

  // ─── Segmentação de Tours por contexto (MVP) ───────────────────────────────
  // Só Tours usam isso — Campanha/Jornada já têm sua própria segmentação por
  // listas fixas (segmentar_cliente_ids etc.), avaliada no servidor, e nada
  // aqui mexe nelas. Resolve o valor atual de um "campo" a partir do config
  // já normalizado (init/updateContext) — mesmos nomes de campo aceitos e
  // validados no admin/backend (ver CAMPOS_SEGMENTACAO em
  // server/src/controllers/tours.ts).
  function tourSegmentacaoResolverCampo(campo, config) {
    switch (campo) {
      case 'usuario_id': return config.usuario_id || null;
      case 'usuario_email': return config.usuario_email || null;
      case 'sistema': return config.sistema || null;
      case 'tela': return config.tela || null;
      case 'cliente_id': return (config.contexto && config.contexto.cliente_id) || null;
      case 'unidade_id': return (config.contexto && config.contexto.unidade_id) || null;
      case 'organizacao_id': return (config.contexto && config.contexto.organizacao_id) || null;
      case 'clinica_id': return (config.contexto && config.contexto.clinica_id) || null;
      case 'usuario_tipo': return (config.contexto && config.contexto.usuario_tipo) || null;
      // Perfil/Estado — mesma grafia (maiúscula) usada pelo init()/CONTEXT_KEYS.
      case 'perfil': return (config.contexto && config.contexto.Perfil) || null;
      case 'estado': return (config.contexto && config.contexto.Estado) || null;
      default: return null;
    }
  }

  // Uma única regra: campo/operador/valor. Nunca lança — regra malformada
  // (campo desconhecido, operador desconhecido) conta como "não bateu" em vez
  // de derrubar a avaliação do tour inteiro.
  function tourSegmentacaoAvaliarRegra(regra, config) {
    var valorRecebido = tourSegmentacaoResolverCampo(regra.campo, config);
    var valorEsperado = regra.valor;
    var ok;
    if (regra.operador === 'igual') {
      ok = valorRecebido !== null && valorRecebido === valorEsperado;
    } else if (regra.operador === 'diferente') {
      // Contexto ausente é, por definição, diferente de qualquer valor
      // esperado — não é um caso especial, é a mesma comparação de sempre.
      ok = valorRecebido !== valorEsperado;
    } else if (regra.operador === 'contem') {
      ok = valorRecebido !== null && String(valorRecebido).indexOf(valorEsperado) !== -1;
    } else if (regra.operador === 'em_lista') {
      var lista = String(valorEsperado || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      ok = valorRecebido !== null && lista.indexOf(valorRecebido) !== -1;
    } else {
      ok = false;
    }
    return { ok: ok, valorRecebido: valorRecebido };
  }

  // Todas as regras precisam bater (AND) — sem regras (null/[]) é sempre
  // elegível, exatamente o comportamento de um tour antes desta feature
  // existir. Retorna motivo pronto pro modo debug, sem nunca expor valor
  // completo de campo sensível (reaproveita debugMascarar, mesma máscara
  // usada pra config/contexto no resto do modo debug).
  function avaliarSegmentacaoTour(tour, config) {
    var regras = tour.segmentacao_regras;
    if (!Array.isArray(regras) || regras.length === 0) {
      return { ok: true, motivo: 'sem_segmentacao', regraFalhou: null };
    }
    for (var i = 0; i < regras.length; i++) {
      var regra = regras[i];
      var resultado = tourSegmentacaoAvaliarRegra(regra, config);
      if (!resultado.ok) {
        return {
          ok: false,
          motivo: 'bloqueado',
          regraFalhou: {
            campo: regra.campo,
            operador: regra.operador,
            valor_esperado: debugMascarar(regra.campo, regra.valor),
            valor_recebido: debugMascarar(regra.campo, resultado.valorRecebido),
          },
        };
      }
    }
    return { ok: true, motivo: 'atendida', regraFalhou: null };
  }

  function submitFeedback() {
    var campanha = state.campanha;
    var config = state.config;
    if (!campanha || !config || state.nota === null || state.submitting) return;
    if (campanha.feedback_habilitado === false) return;

    if (!config.usuario_id) {
      state.submitted = true;
      render();
      return;
    }

    if (campanha.observacao_obrigatoria && !state.observacao.trim()) {
      state.error = 'A observacao e obrigatoria para esta campanha.';
      render();
      return;
    }

    state.submitting = true;
    state.error = '';
    if (state.root) {
      var btn = state.root.querySelector('[data-up-submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      var errEl = state.root.querySelector('.up-error');
      if (errEl) errEl.textContent = '';
    }

    fetch(apiUrl('/api/widget/feedback'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        public_key: config.public_key || undefined,
        campanha_id: campanha.id,
        nota: state.nota,
        observacao: state.observacao || undefined,
        usuario_id: config.usuario_id,
        usuario_nome: config.usuario_nome || undefined,
        usuario_email: config.usuario_email || undefined,
        sistema: config.sistema || undefined,
        tela: config.tela || undefined,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
        contexto: config.contexto || undefined,
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            var message = 'Erro ao enviar feedback.';
            try {
              message = JSON.parse(text).erro || message;
            } catch (_err) {}
            throw new Error(message);
          });
        }
        return response.json();
      })
      .then(function (data) {
        state.submitted = true;
        state.feedbackId = (data && data.id) ? data.id : null;
      })
      .catch(function (error) {
        state.error = error && error.message ? error.message : 'Erro ao enviar feedback.';
      })
      .finally(function () {
        state.submitting = false;
        render();
      });
  }

  function submitConfirmacao() {
    var campanha = state.campanha;
    var config = state.config;
    if (!campanha || !config || state.submitting) return;

    if (!state.confirmacaoMarcada) {
      state.error = 'Marque a confirmacao de leitura para continuar.';
      render();
      return;
    }

    if (!config.usuario_id) {
      state.submitted = true;
      render();
      return;
    }

    state.submitting = true;
    state.error = '';
    if (state.root) {
      var btn = state.root.querySelector('[data-up-confirm]');
      if (btn) { btn.disabled = true; btn.textContent = 'Aguarde…'; }
      var errEl = state.root.querySelector('.up-error');
      if (errEl) errEl.textContent = '';
    }

    fetch(apiUrl('/api/widget/confirmacao'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        public_key: config.public_key || undefined,
        campanha_id: campanha.id,
        usuario_id: config.usuario_id,
        usuario_nome: config.usuario_nome || undefined,
        usuario_email: config.usuario_email || undefined,
        contexto: config.contexto || undefined,
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            var message = 'Erro ao confirmar leitura.';
            try { message = JSON.parse(text).erro || message; } catch (_err) {}
            throw new Error(message);
          });
        }
        return response.json();
      })
      .then(function () {
        state.submitted = true;
      })
      .catch(function (error) {
        state.error = error && error.message ? error.message : 'Erro ao confirmar leitura.';
      })
      .finally(function () {
        state.submitting = false;
        render();
      });
  }

  function maskPhone(raw) {
    var d = raw.replace(/\D/g, '').slice(0, 11);
    var n = d.length;
    if (n === 0) return '';
    if (n <= 2) return '(' + d;
    if (n <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (n <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function submitTelefone() {
    if (!state.feedbackId || state.phoneSubmitting || state.phoneDone) return;
    var telefone = state.telefone.trim();
    if (!telefone) return;

    state.phoneSubmitting = true;
    state.phoneError = '';
    if (state.root) {
      var phoneInput = state.root.querySelector('[data-up-telefone]');
      if (phoneInput) phoneInput.disabled = true;
      var btn = state.root.querySelector('[data-up-telefone-submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
      var errEl = state.root.querySelector('.up-error');
      if (errEl) errEl.textContent = '';
    }

    fetch(apiUrl('/api/widget/feedback/' + state.feedbackId + '/telefone'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ telefone_contato: telefone }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            var message = 'Erro ao salvar telefone.';
            try { message = JSON.parse(text).erro || message; } catch (_e) {}
            throw new Error(message);
          });
        }
        return response.json();
      })
      .then(function () {
        state.phoneDone = true;
        scheduleAutoClose(2000);
      })
      .catch(function (err) {
        state.phoneError = err && err.message ? err.message : 'Erro ao salvar telefone.';
      })
      .finally(function () {
        state.phoneSubmitting = false;
        render();
      });
  }

  function init(config) {
    // Restaurar overflow do body caso a modal estivesse aberta ao re-inicializar
    document.body.style.overflow = state.bodyOverflow || '';

    var normalized = normalizeConfig(config || {});
    if (Object.keys(pendingContext).length) {
      normalized.contexto = Object.assign({}, normalized.contexto || {}, pendingContext);
      pendingContext = {};
    }
    state.config = normalized;
    debugLog('Widget carregado / init()', {
      config: debugSanitizar(normalized),
      url: debugStatusUrl(),
    });
    // Fase 2 do widget multi-tenant: sem public_key, o backend cai num
    // fallback temporário pro tenant Quark (ver resolverTenantPublico no
    // servidor) — funciona hoje, mas deixará de existir quando public_key
    // virar obrigatória para tenants novos. Só um aviso de debug (nunca
    // bloqueia o init) — visível só com window.UserPulse.debug(true).
    if (!normalized.public_key) {
      debugLog('public_key ausente em init() — usando fallback temporário pro tenant Quark. Defina { public_key: "..." } antes que isso deixe de funcionar.', {});
    }
    iniciarGravadorSeNecessario();
    iniciarPreviewSeNecessario();
    state.campanha = null;
    state.open = false;
    state.nota = null;
    state.observacao = '';
    state.confirmacaoMarcada = false;
    state.submitting = false;
    state.submitted = false;
    state.error = '';
    state.visualizacaoRegistrada = false;
    state.feedbackId = null;
    state.telefone = '';
    state.phoneSubmitting = false;
    state.phoneDone = false;
    state.phoneError = '';
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }

    var oldRoot = document.getElementById(WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    if (!normalized.slug && !normalized.sistema) return;

    // Cancel any pending URL-change evaluation and capture the current URL
    // so the next real navigation triggers handleUrlChange correctly.
    if (urlChangeTimer) { window.clearTimeout(urlChangeTimer); urlChangeTimer = null; }
    lastUrl = window.location.href;
    bindSpaListeners();

    ensureStyles();

    // Aparência do widget (cor principal + logo do tour) — a busca em si roda
    // em paralelo com tudo abaixo (nunca bloqueia o fetch de campanha/tour
    // candidatos), mas o PRIMEIRO RENDER de um tour automático espera
    // aparenciaPromise resolver antes de chamar iniciarTour() (ver
    // aguardarAparenciaEIniciarTour) — sem isso, o tour podia renderizar a
    // intro com o visual padrão e só trocar pra cor/logo configurados um
    // instante depois (flash). fetchAparenciaComTimeout garante um teto de
    // espera (aparenciaPromise nunca trava além de APARENCIA_TIMEOUT_MS).
    //
    // Isso NÃO descarta uma resposta lenta que chega depois do timeout: se
    // aparenciaFetch.expirouAntesDaResposta() for true quando o fetch de
    // verdade (aparenciaFetch.real) finalmente resolver, ainda aplica a
    // cor/logo corretos (e re-renderiza, se a intro do tour ainda estiver na
    // tela) — melhor uma correção tardia do que ficar preso no fallback
    // padrão pro resto da sessão só porque a rede estava lenta uma vez.
    function aplicarEAtualizarAparencia(aparencia, origemDebug) {
      tourState.aparencia = aparencia;
      aplicarAparenciaCss(aparencia);
      if (debugState.enabled) {
        debugLog('Aparência (' + origemDebug + ')', {
          // fetchAparencia() trata erro de rede/parse do mesmo jeito que "sem
          // configuração salva" (ambos caem em cor_principal/logo_url nulos) —
          // não dá pra distinguir os dois casos aqui, só relatar o resultado.
          status: aparencia && aparencia.cor_principal ? 'carregada' : 'fallback (sem cor_principal configurada, ou erro de rede/parse)',
          cor_principal: (aparencia && aparencia.cor_principal) || null,
          logo_url: (aparencia && aparencia.logo_url) || null,
        });
      }
      if (tourState.ativo && tourState.tela === 'intro') renderTour();
    }
    if (debugState.enabled && !normalized.sistema) {
      debugLog('Aparência', { status: 'não buscada — init() sem "sistema" (modo slug)' });
    }
    var aparenciaFetch = normalized.sistema ? fetchAparenciaComTimeout(normalized.sistema) : null;
    aparenciaPromise = aparenciaFetch
      ? aparenciaFetch.pronta.then(function (aparencia) {
          var origemDebug = aparenciaFetch.veioDoCacheLocal()
            ? 'cache local aplicado imediatamente, confirmando em segundo plano'
            : (aparenciaFetch.duracaoMs() === null ? 'timeout, aplicando fallback provisório' : 'resposta a tempo');
          aplicarEAtualizarAparencia(aparencia, origemDebug);
          return aparencia;
        })
      : Promise.resolve(null);
    if (aparenciaFetch) {
      // Encadeado depois de aparenciaPromise (não direto em
      // aparenciaFetch.real) de propósito: no caminho sem cache com resposta
      // rápida, `pronta` e `real` resolvem quase no mesmo instante — anexar
      // os dois handlers direto em promises "irmãs" deixa a ordem de
      // execução das microtasks correr o risco de comparar aqui embaixo
      // ANTES de aplicarEAtualizarAparencia() (disparado pelo .then() de
      // aparenciaPromise) ter atualizado tourState.aparencia, gerando uma
      // "correção tardia" falsa mesmo sem nada de errado. Esperar
      // aparenciaPromise primeiro garante que a aplicação "pronta" (cache ou
      // timeout) já rodou antes desta comparação.
      aparenciaPromise.then(function () {
        return aparenciaFetch.real;
      }).then(function (aparenciaReal) {
        // fetchAparencia() devolve null tanto pra "sem configuração salva"
        // quanto pra falha de rede/parse (ver comentário nela) — só o
        // segundo caso chega aqui como null de verdade, já que o endpoint
        // sempre responde 200 com objeto (mesmo com campos nulos) quando não
        // há aparência configurada. Por isso `aparenciaReal &&` abaixo: uma
        // falha pontual nunca deve APAGAR um cache local válido que já está
        // na tela, só uma resposta de verdade (sucesso, mesmo que "vazia")
        // pode corrigir o que foi aplicado.
        var corrigiu = Boolean(aparenciaReal) && !aparenciaValoresIguais(aparenciaReal, tourState.aparencia);
        // Sempre loga a duração real da requisição (independente de ter
        // disparado correção visual ou não) — é o dado que falta hoje pra
        // saber se /api/widget/aparencia está genuinamente lento ou se foi
        // só uma variação pontual.
        if (debugState.enabled) {
          debugLog('Aparência — requisição real concluída', {
            duracao_ms: aparenciaFetch.duracaoMs(),
            demorou_mais_que_o_timeout: aparenciaFetch.demorouMaisQueOTimeout(),
            veio_do_cache_local: aparenciaFetch.veioDoCacheLocal(),
            corrigiu_o_que_estava_aplicado: corrigiu,
          });
        }
        // Só reaplica/re-renderiza se o valor de verdade for diferente do que
        // já está na tela — com cache local, na prática o valor "provisório"
        // já bate quase sempre, e recarregar o tooltip do tour de novo com o
        // MESMO visual seria um flash desnecessário, não uma correção.
        if (corrigiu) {
          aplicarEAtualizarAparencia(aparenciaReal, 'correção tardia após timeout');
        }
      });
    }

    // Prioridade sobre campanha e tour automático — se havia uma continuação
    // salva (reload completo de página no meio de um passo que navega), ela
    // precisa resolver primeiro. Campanha e tour automático abrem/iniciam de
    // forma assíncrona (fetch + scheduleAutoOpen com atraso) — se rodassem em
    // paralelo com a retomada, uma campanha elegível podia abrir por cima do
    // tour ainda retomando (scheduleAutoOpen só checa tourState.ativo no
    // instante em que o próprio timer dela dispara, não sabe esperar uma
    // retomada em andamento) — daí o "modal inicial abre de novo"/"tour some"
    // intermitente relatado. Botando os dois aqui dentro, só rodam depois da
    // retomada estar decidida (tourState.ativo já correto de um jeito ou de
    // outro).
    tourRetomarSeHouver(function () {
      if (normalized.slug) {
        resolveContexto(); // atualiza normalized.contexto via provider, se existir
        fetchCampaign(normalized)
          .then(function (campanha) {
            if (debugState.enabled) {
              debugLog('Campanha por slug', {
                slug: normalized.slug,
                resultado: campanha ? 'encontrada, agendando exibição' : 'não encontrada / inativa para este slug',
              });
            }
            if (!campanha) return;
            state.campanha = campanha;
            resetRoot();
            render();
            scheduleAutoOpen(campanha, normalized);
          })
          .catch(function () {});
      } else {
        var contextoInit = resolveContexto();
        fetchCandidatas(normalized.sistema, normalized.tela, 'ao_abrir_tela', null, normalized.usuario_id, contextoInit)
          .then(function (candidatos) {
            var linhasDebug = [];
            var selecionada = null;
            for (var i = 0; i < candidatos.length; i++) {
              var c = candidatos[i];
              var okModo = checkMode(c, normalized);
              var jaVista = okModo && wasShown(c, normalized);
              if (debugState.enabled) {
                linhasDebug.push({
                  id: c.id,
                  titulo: c.titulo || c.slug || null,
                  modo_identificacao: c.modo_identificacao || 'sistema_tela',
                  motivo: !okModo ? 'bloqueada: modo_identificacao não corresponde' : (jaVista ? 'bloqueada: já visto (localStorage)' : (selecionada ? 'elegível, porém outra já selecionada' : 'selecionada')),
                });
              }
              if (!okModo) continue;
              if (jaVista) continue;
              if (!selecionada) selecionada = c;
            }
            if (debugState.enabled) debugLog('Campanhas candidatas (' + (normalized.tela || 'ao_abrir_tela') + ')', linhasDebug);
            if (selecionada) {
              state.campanha = selecionada;
              resetRoot();
              render();
              scheduleAutoOpen(selecionada, normalized);
            }
          })
          .catch(function () {});
      }
      if (normalized.sistema) avaliarTourAutomatico(normalized);
    });

    // Jornadas nunca disparam sozinhas — só reavalia se o botão flutuante deve
    // aparecer (não reabre o painel, mesmo que estivesse aberto antes do init()).
    fecharJornadaPainel();
    avaliarJornadasParaBotao(normalized);
  }

  function track(eventoNome, metadataOpcional) {
    if (!state.config || !eventoNome) return;
    var config = state.config;
    if (!config.sistema) return;

    // Resolve context first — shared between conclusao POST and fetchCandidatas
    var contextoTrack = resolveContexto();

    // Register event in global user history — enables retroactive blocking for
    // campaigns created after this event fires.
    if (config.usuario_id) {
      fetch(apiUrl('/api/widget/eventos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          public_key: config.public_key || undefined,
          evento: eventoNome,
          sistema: config.sistema,
          usuario_id: config.usuario_id,
          contexto: contextoTrack,
        }),
      }).catch(function () { /* fail silently */ });
    }

    fetchCandidatas(config.sistema, config.tela, 'apos_evento', eventoNome, config.usuario_id, contextoTrack)
      .then(function (candidatos) {
        var exibida = false;
        var linhasDebug = [];
        for (var i = 0; i < candidatos.length; i++) {
          var campanha = candidatos[i];
          var okModo = checkMode(campanha, config);
          var jaVisto = okModo && wasShown(campanha, config);
          if (debugState.enabled) {
            linhasDebug.push({
              id: campanha.id,
              titulo: campanha.titulo || campanha.slug || null,
              modo_identificacao: campanha.modo_identificacao || 'sistema_tela',
              motivo: !okModo ? 'bloqueada: modo_identificacao não corresponde' : (jaVisto ? 'bloqueada: já visto (localStorage)' : (exibida ? 'elegível, porém outra já selecionada' : 'selecionada')),
            });
          }
          if (!okModo) continue;
          if (jaVisto) continue;
          if (exibida) continue;
          exibida = true;

          if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }

          // Merge optional metadata into init contexto for this session.
          // Creates a new config object — never mutates the original so subsequent
          // track() calls without metadata still use the clean init contexto.
          if (metadataOpcional && typeof metadataOpcional === 'object') {
            var merged = Object.assign({}, config.contexto || {}, metadataOpcional);
            state.config = Object.assign({}, config, { contexto: merged });
          }

          state.campanha = campanha;
          state.open = false;
          state.nota = null;
          state.observacao = '';
          state.confirmacaoMarcada = false;
          state.submitting = false;
          state.submitted = false;
          state.error = '';
          state.visualizacaoRegistrada = false;
          state.feedbackId = null;
          state.telefone = '';
          state.phoneSubmitting = false;
          state.phoneDone = false;
          state.phoneError = '';
          ensureStyles();
          resetRoot();
          state.open = true;
          markShown(campanha, config);
          state.visualizacaoRegistrada = true;
          registrarEvento('visualizacao');
          render();
          break;
        }
        if (debugState.enabled) debugLog('Campanhas candidatas (apos_evento: ' + eventoNome + ')', linhasDebug);
      })
      .catch(function () { /* fail silently */ });
  }

  function evaluateUrlCampaigns() {
    var config = state.config;
    if (!config || !config.sistema) return;
    if (state.open) return;

    var contextoUrl = resolveContexto();
    fetchCandidatas(config.sistema, '', 'ao_abrir_tela', null, config.usuario_id, contextoUrl)
      .then(function (candidatos) {
        var linhasDebug = [];
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          var modo = c.modo_identificacao || 'sistema_tela';
          if (modo !== 'url_contem') {
            if (debugState.enabled) linhasDebug.push({ id: c.id, titulo: c.titulo || c.slug || null, modo_identificacao: modo, motivo: 'ignorada: só avalia modo url_contem aqui' });
            continue;
          }
          var okModo = checkMode(c, config);
          var jaVisto = okModo && wasShown(c, config);
          if (debugState.enabled) {
            linhasDebug.push({
              id: c.id,
              titulo: c.titulo || c.slug || null,
              modo_identificacao: modo,
              motivo: !okModo ? 'bloqueada: url_contem não corresponde' : (jaVisto ? 'bloqueada: já visto (localStorage)' : 'selecionada'),
            });
          }
          if (!okModo) continue;
          if (jaVisto) continue;

          if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }

          state.campanha = c;
          state.open = false;
          state.nota = null;
          state.observacao = '';
          state.confirmacaoMarcada = false;
          state.submitting = false;
          state.submitted = false;
          state.error = '';
          state.visualizacaoRegistrada = false;
          state.feedbackId = null;
          state.telefone = '';
          state.phoneSubmitting = false;
          state.phoneDone = false;
          state.phoneError = '';

          ensureStyles();
          resetRoot();
          scheduleAutoOpen(c, config);
          break;
        }
        if (debugState.enabled) debugLog('Campanhas candidatas (url_contem)', linhasDebug);
      })
      .catch(function () {});
  }

  // Reavalia candidatas com o config/contexto atual (todos os modos).
  // Usado por updateContext e pode ser chamado quando o contexto muda sem reload.
  function evaluateCampaigns() {
    var config = state.config;
    if (!config || !config.sistema) return;
    if (state.open) return;
    var contexto = resolveContexto();
    fetchCandidatas(config.sistema, config.tela, 'ao_abrir_tela', null, config.usuario_id, contexto)
      .then(function (candidatos) {
        if (state.open) return;
        var linhasDebug = [];
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          var okModo = checkMode(c, config);
          var jaVisto = okModo && wasShown(c, config);
          if (debugState.enabled) {
            linhasDebug.push({
              id: c.id,
              titulo: c.titulo || c.slug || null,
              modo_identificacao: c.modo_identificacao || 'sistema_tela',
              motivo: !okModo ? 'bloqueada: modo_identificacao não corresponde' : (jaVisto ? 'bloqueada: já visto (localStorage)' : 'selecionada'),
            });
          }
          if (!okModo) continue;
          if (jaVisto) continue;
          if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
          state.campanha = c;
          state.open = false;
          state.nota = null;
          state.observacao = '';
          state.confirmacaoMarcada = false;
          state.submitting = false;
          state.submitted = false;
          state.error = '';
          state.visualizacaoRegistrada = false;
          state.feedbackId = null;
          state.telefone = '';
          state.phoneSubmitting = false;
          state.phoneDone = false;
          state.phoneError = '';
          ensureStyles();
          resetRoot();
          scheduleAutoOpen(c, config);
          break;
        }
        if (debugState.enabled) debugLog('Campanhas candidatas (updateContext/evaluateCampaigns, tela: ' + config.tela + ')', linhasDebug);
      })
      .catch(function () {});
  }

  // ─── SPA Context Updates ──────────────────────────────────────────────────
  // Em SPAs que trocam cliente/unidade/perfil sem recarregar a página, chame:
  //   window.UserPulse.updateContext({ cliente_id: '123', unidade_id: '456' })
  // Ou defina contextProvider no init() para ser consultado antes de cada avaliação:
  //   UserPulse.init({ ..., contextProvider: function() { return { cliente_id: getCurrentClient() } } })
  // A segmentação por cliente/unidade depende do contexto atualizado pelo sistema integrado.
  function updateContext(novoContexto) {
    if (!novoContexto || typeof novoContexto !== 'object') return;
    if (!state.config) {
      pendingContext = Object.assign({}, pendingContext, novoContexto);
      return;
    }
    state.config.contexto = Object.assign({}, state.config.contexto || {}, novoContexto);
    evaluateCampaigns();
    // updateContext() é o jeito "leve" de atualizar contexto sem chamar
    // init() de novo (ex.: usuario_id só ficou disponível depois do mount
    // inicial) — sem isso, a elegibilidade da Jornada nunca era reavaliada
    // por esse caminho, e o FAB "Ajuda" podia ficar preso no valor da
    // primeira checagem pra sempre.
    jornadaReavaliarAposNavegacao();
    // Reavalia tour automático com o contexto novo — sem isso, um tour com
    // segmentação (ver avaliarSegmentacaoTour) só passava a considerar o
    // contexto atualizado no próximo reload de página completo ou próxima
    // navegação SPA (handleUrlChange), nunca só por causa de um
    // updateContext() isolado. avaliarTourAutomatico já se protege sozinha
    // contra reabrir/duplicar (tourState.ativo, jornadaState.aberto), mesmo
    // comportamento de sempre.
    if (state.config.sistema) avaliarTourAutomatico(state.config);
  }

  // Ver tourState.avancoResolvidoEm — janela depois de um passo resolver (ou
  // o tour concluir) durante a qual handleUrlChange() ignora navegação em vez
  // de tentar retomar ou finalizar. Cobre o delay de renderTour() adiado em
  // irParaPasso() (320ms) com folga, absorvendo pushStates/replaceStates
  // secundários que a mesma transição de SPA às vezes dispara (router
  // normalizando a URL, redirect interno etc.) sem tratá-los como um novo
  // sinal de retomada — evitava pular um passo inteiro (ver bug de avanço
  // duplo: passo com clicar_elemento navega, o avanço agendado já resolve
  // pro passo seguinte e salva a continuação preventiva DO PASSO DEPOIS
  // DESSE, e um pushState tardio da mesma navegação lia essa continuação já
  // atualizada e retomava direto nele, pulando o passo intermediário).
  var TOUR_SPA_ASSENTAMENTO_MS = 500;

  function handleUrlChange() {
    var currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    var urlAnterior = lastUrl;
    lastUrl = currentUrl;
    if (urlChangeTimer) { window.clearTimeout(urlChangeTimer); urlChangeTimer = null; }
    urlChangeTimer = window.setTimeout(function () {
      urlChangeTimer = null;
      if (debugState.enabled) {
        debugLog('SPA — navegação detectada', {
          url_anterior: urlAnterior,
          url_atual: debugStatusUrl(),
          tour_ativo_no_momento: tourState.ativo,
        });
      }
      // Numa SPA, o usuário pode navegar pra outra tela sem fechar a campanha
      // explicitamente (sem clicar no X) — o modal (position:fixed, cobre a
      // tela toda) não tem nenhuma outra forma de saber que a navegação
      // aconteceu, então state.open ficava preso em true pra sempre.
      // jornadaPodeAbrirCentral() então continuava bloqueando o FAB "Ajuda"
      // mesmo em telas sem nenhuma campanha realmente visível. Mesma lógica
      // pro tour: se ficou ativo e o usuário navegou pra longe dele, encerra.
      if (state.open) doClose();
      // suprimirAbandonoNavegacao: navegação causada pelo próprio clique
      // sintético de um passo "clicar_elemento" (tourProximo()) ou por
      // modo_avanco_interacao != manual (agendarAvancoInteracao) não conta como
      // abandono — sem essa checagem, essa navegação encerrava o tour sozinho
      // antes do avanço para o próximo passo sequer acontecer.
      var emAssentamento = tourState.avancoResolvidoEm &&
        (Date.now() - tourState.avancoResolvidoEm < TOUR_SPA_ASSENTAMENTO_MS);
      if (debugState.enabled && tourState.ativo) {
        debugLog('SPA — decisão sobre tour ativo', {
          suprimir_abandono_navegacao: tourState.suprimirAbandonoNavegacao,
          em_assentamento: Boolean(emAssentamento),
          motivo: tourState.suprimirAbandonoNavegacao ? 'ignorado: navegação causada pelo próprio avanço do tour'
            : (emAssentamento ? 'ignorado: dentro da janela de assentamento pós-avanço' : 'será avaliado como possível abandono/retomada'),
        });
      }
      if (tourState.ativo && !tourState.suprimirAbandonoNavegacao && !emAssentamento) {
        // Passo com acao_ao_avancar/modo_avanco_interacao default (o caso mais
        // comum) nunca passa por suprimirAbandonoNavegacao — o usuário clica
        // direto no elemento real destacado, e SE isso navegar via SPA
        // (pushState, sem reload completo), chegamos aqui com o tour ainda
        // ativo em memória. Antes disso finalizava incondicionalmente,
        // apagando a continuação que irParaPasso() tinha acabado de salvar
        // preventivamente (ver tourSalvarContinuacao ali) — o tour sumia e
        // nunca retomava no próximo passo. Agora, antes de desistir, confere
        // se existe uma continuação válida pra ESSE MESMO tour: se houver,
        // trata como retomada (sem apagar sessionStorage, sem finalizarTour)
        // em vez de abandono.
        var retomadaSpa = tourContinuacaoValidaParaSpa();
        if (retomadaSpa) {
          if (retomadaSpa.concluir) {
            tourState.indice = tourState.tour.passos.length - 1;
            tourConcluir();
          } else {
            // irParaPasso() já tem sua própria espera/retry pro elemento
            // aparecer (localizarComRetry) — cobre o "aguardar rota/DOM
            // estabilizar" sem precisar de nenhum delay extra aqui. Só limpa
            // a continuação quando resolver de verdade (achado ou fallback
            // "não encontrado"), nunca antes.
            irParaPasso(retomadaSpa.indice);
          }
        } else {
          finalizarTour('navegacao_url');
        }
      }
      evaluateUrlCampaigns();
      jornadaReavaliarAposNavegacao();
      // Reavalia tour automático (ex.: configurado por "Caminho da URL")
      // depois de uma navegação SPA — sem isso, um tour cuja condição só
      // passa a bater com a URL nova nunca era oferecido até um reload
      // completo de página (que é o único outro lugar que chama
      // avaliarTourAutomatico, dentro de init()). avaliarTourAutomatico já
      // se protege sozinha contra reabrir/duplicar (tourState.ativo,
      // jornadaState.aberto, tourWasShown/dedupe do backend), igual ao
      // comportamento de sempre num reload.
      if (state.config && state.config.sistema) avaliarTourAutomatico(state.config);
    }, 200);
  }

  // SPA pode navegar de uma tela sem contexto de usuário válido (login,
  // escolha de clínica) pra dentro do sistema sem recarregar a página nem
  // chamar init() de novo — reavalia o FAB "Ajuda" nesse momento. Se o
  // contexto virou inválido, só esconde na hora (sem fetch); se ficou válido,
  // busca elegibilidade de novo (pode ter mudado desde a última checagem).
  function jornadaReavaliarAposNavegacao() {
    var config = state.config;
    if (!config) return;
    if (!jornadaContextoValido()) {
      // Invalida qualquer busca de elegibilidade ainda em andamento — se ela
      // chegar depois, não pode reaproveitar um resultado que já era antigo
      // no momento em que o contexto ficou inválido.
      jornadaElegibilidadeToken++;
      renderJornadaFab(jornadaState.fabDisponivel);
      return;
    }
    avaliarJornadasParaBotao(config);
  }

  function bindSpaListeners() {
    if (spaListenerBound) return;
    spaListenerBound = true;

    var origPushState = history.pushState;
    var origReplaceState = history.replaceState;

    history.pushState = function () {
      origPushState.apply(this, arguments);
      handleUrlChange();
    };
    history.replaceState = function () {
      origReplaceState.apply(this, arguments);
      handleUrlChange();
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
  }

  // ─── Tours guiados ────────────────────────────────────────────────────────

  var TOUR_WIDGET_ID = 'userpulse-tour-root';
  // Espera até ~18s pelo elemento do passo (16 tentativas, backoff progressivo
  // — ver tourIntervaloRetry) antes de cair no fallback "elemento não
  // encontrado". Backoff em vez de intervalo fixo: resolve rápido o caso comum
  // (elemento já existe ou aparece em poucos ms) sem desperdiçar tentativas, e
  // ainda assim aguenta navegação/carregamento bem mais lento do que os ~5s
  // fixos de antes — importante logo após um reload completo de página (ver
  // tourRetomarSeHouver), onde o app real pode levar um tempo variável pra
  // hidratar até revelar o elemento do passo retomado.
  var TOUR_RETRY_MAX = 16;
  var TOUR_RETRY_INTERVAL_MS = 250; // usado só pelo poll de ao_aparecer_elemento/ao_sumir_elemento (bindInteracao) — intervalo fixo faz sentido ali, é uma espera por mudança de estado, não por DOM recém-carregado estabilizar
  // Rechecagens curtas agendadas a cada evento de input/change/keyup e a cada
  // mutação sem sucesso imediato (ver tourAgendarRecheckCurto) — cobrem o
  // intervalo entre o debounce de uma tela de busca/reflow terminar e o item
  // da lista realmente virar visível (rect não-zero), sem esperar o próximo
  // retry do backoff acima (que pode levar até ~1.5s no pior caso).
  var TOUR_RECHECK_CURTO_MS = [50, 150, 300];
  // Por quanto tempo, depois do elemento de um passo ser destacado, o
  // runtime continua vigiando mutação de DOM/input/change/keyup pra
  // reposicionar o highlight (ver tourIniciarVigiaPosicionamento) — cobre
  // reflow tardio: campos que terminam de aparecer/animar um pouco depois
  // do passo já estar em tela (ex.: escolhas anteriores revelando novos
  // campos de formulário). Scroll/resize continuam cobertos o tempo todo,
  // sem esse limite, por bindTourReposHandlers (já global pra sessão
  // inteira do tour).
  var TOUR_VIGIA_JANELA_MS = 4000;

  function tourIntervaloRetry(tentativa) {
    var base = 200;
    var fator = 1.4;
    var maximo = 1500;
    return Math.min(base * Math.pow(fator, tentativa), maximo);
  }

  var tourState = {
    tour: null,
    // { cor_principal, logo_url } vindo de GET /api/widget/aparencia (ver
    // fetchAparencia/init) — null até resolver (ou se o sistema não tiver
    // nenhuma configuração salva). Nunca bloqueia a renderização: enquanto
    // null, badges/botões caem no fallback visual hardcoded de sempre (ver
    // aplicarAparenciaCss/tourBadgeIcone).
    aparencia: null,
    indice: 0,
    root: null,
    elementoAtual: null,
    naoEncontrado: false,
    // URL (window.location.href) onde cada índice de passo foi efetivamente
    // buscado da última vez, indexado por número (ver irParaPasso) — nunca
    // apagado quando ausente, só quando o tour reinicia (finalizarTour).
    // Usado por tourVoltar() pra saber se o passo anterior fica noutra
    // página/tela e precisa navegar antes de procurar o seletor (ver
    // tourVoltarNavegar). Índices nunca visitados nesta sessão (ex.: tour
    // retomado direto num passo do meio após reload) simplesmente não têm
    // entrada — tratado como "sem URL conhecida", mesmo comportamento de
    // antes desta função existir.
    urlPorPasso: {},
    // Timer do fallback de tourVoltarNavegar() — ver TOUR_VOLTAR_FALLBACK_MS.
    // Também funciona como guarda contra clicar "Voltar" várias vezes
    // enquanto uma navegação já está em andamento (mesmo padrão de
    // nextClickTimer).
    voltarFallbackTimer: null,
    buscaTimer: null,
    // MutationObserver ativo durante uma busca de elemento (localizarComRetry)
    // — detecta o elemento chegando ao DOM antes do próximo retry agendado,
    // resolvendo mais rápido no caso comum. Desconectado por limparBuscaTimer()
    // junto com o timer, pra nunca sobrar observando o DOM à toa depois que a
    // busca termina (achou, esgotou o retry, ou foi cancelada).
    buscaObserver: null,
    // Listener de input/change/keyup ativo durante uma busca de elemento
    // (localizarComRetry) — cobre o caso de passo anterior ser um campo de
    // busca cuja lista de resultados é renderizada de forma assíncrona
    // (debounce da própria tela) logo após o usuário digitar: reavalia o
    // seletor do próximo passo a cada tecla/alteração, sem esperar o próximo
    // retry agendado nem depender só do MutationObserver (que não cobre, por
    // ex., o item ainda existir no DOM mas trocar de estado antes do reflow
    // reportar um tamanho válido). Desconectado por limparBuscaTimer() junto
    // com o timer e o observer.
    buscaInteracaoHandler: null,
    // Timers/frames de rechecagem curta (requestAnimationFrame + setTimeout
    // 50/150/300ms — ver TOUR_RECHECK_CURTO_MS/tourAgendarRecheckCurto)
    // agendados pelo listener de input/change/keyup e pelo MutationObserver
    // quando nenhum dos dois acha o elemento na hora — cobre listas
    // dinâmicas com debounce/reflow que só terminam de assentar um pouco
    // depois do evento/mutação. Cada item é { tipo: 'raf'|'timeout', id };
    // limparBuscaTimer() cancela todos e zera o array, então nunca sobra
    // timer/frame "zumbi" rodando depois que a busca termina.
    buscaExtraTimers: [],
    // MutationObserver ativo por um curto período depois do elemento do
    // passo atual ser destacado (ver tourIniciarVigiaPosicionamento) —
    // diferente de buscaObserver (que só existe enquanto o elemento AINDA
    // não foi achado), este vigia o elemento JÁ achado, pra reposicionar o
    // highlight se o layout ao redor dele mudar (novos campos aparecendo,
    // reflow) depois do passo já estar em tela. Desconectado por
    // tourLimparVigiaPosicionamento(), chamado ao trocar de passo e ao
    // encerrar/concluir o tour.
    vigiaObserver: null,
    // Mesmo propósito de vigiaObserver, via input/change/keyup delegado em
    // document — cobre reflow que não passa por mutação observável a tempo
    // (ou que só se estabiliza de fato depois de uma interação seguinte).
    vigiaInteracaoHandler: null,
    // Timer que desliga a vigilância acima depois de TOUR_VIGIA_JANELA_MS —
    // evita manter observer/listener ativos indefinidamente enquanto o
    // passo fica em tela (scroll/resize continuam cobertos à parte, sem
    // esse limite, por bindTourReposHandlers).
    vigiaJanelaTimer: null,
    // Timers/frames de rechecagem curta (mesmo padrão de buscaExtraTimers)
    // usados pela vigilância de reposicionamento acima — cada item é
    // { tipo: 'raf'|'timeout', id }; tourLimparVigiaPosicionamento() cancela
    // todos e zera o array.
    vigiaExtraTimers: [],
    // requestAnimationFrame pendente de tourAgendarRecomputoVigia() — no
    // máximo 1 recálculo de posição agendado por vez, não importa quantas
    // mutações/eventos de input/change/keyup cheguem antes dele disparar
    // (todos colapsam num recálculo só, no próximo frame). Cancelado por
    // tourLimparVigiaPosicionamento().
    vigiaFrameId: null,
    // Último rect efetivamente usado pra desenhar o passo atual — permite
    // tourRecomputarPosicaoAtual() pular renderTour() quando o elemento é o
    // mesmo e a posição não mudou de forma perceptível (ver
    // tourRectMudouSignificativamente), evitando redesenhar (e, por
    // consequência, gerar mais mutação de DOM) sem necessidade. Zerado toda
    // vez que a vigilância de um passo novo começa (tourLimparVigiaPosicionamento).
    vigiaUltimoRect: null,
    // Índice do passo pro qual o DOM atual (spotlight/#up-tour-tooltip-el) foi
    // de fato construído pela última vez via renderTourInterno() — usado só
    // por tourAtualizarPosicaoDOM() pra nunca confundir "reposicionar o
    // mesmo passo" com "root antigo, de um passo anterior, que por
    // coincidência ainda tem os mesmos seletores" (spotlight/tooltip têm a
    // mesma estrutura em qualquer passo normal). -1 = nenhum passo normal
    // renderizado ainda (ou o último render foi de outro estado: intro,
    // aguardando, não encontrado, concluído) — força renderTour() completo.
    vigiaRootIndice: -1,
    reposTimer: null,
    ativo: false,
    interacaoCleanup: null,
    interacaoTimer: null,
    nextClickTimer: null,
    // tela: null (fluxo normal de passos) | 'intro' | 'concluido' — telas que
    // não dependem de um elemento no DOM, renderizadas antes/depois dos passos.
    tela: null,
    feedbackEscolhido: null,
    fimTimer: null,
    // true só durante "Pré-visualizar tour" do gravador (ver
    // recorderPreVisualizarTour) — nesse modo, registrarEventoTour/
    // tourMarkShown viram no-op (nenhum evento real/marcação de "já visto" é
    // gerado por uma prévia). Resetado pra false em finalizarTour().
    preview: false,
    // true só durante "Pré-visualizar como usuário final" (ver
    // recorderPreVisualizarComoUsuarioFinal) — esconde "Trocar elemento
    // deste passo" no estado "Elemento não encontrado", deixando a prévia
    // idêntica ao que o usuário final vê. Resetado pra false em finalizarTour(),
    // junto com preview.
    previewModoUsuarioFinal: false,
    // true entre um avanço de passo causado por clique/interação real (clique
    // sintético de "clicar_elemento" em tourProximo(), ou qualquer
    // modo_avanco_interacao não-manual em agendarAvancoInteracao()) e a busca
    // do próximo passo ser resolvida (elemento achado ou "não encontrado"
    // depois de esgotar os retries) — ver irParaPasso()/handleUrlChange().
    // Esses cliques/interações costumam navegar de tela (é o próprio
    // propósito deles), e sem essa flag o handleUrlChange() tratava essa
    // navegação como abandono do tour e chamava finalizarTour() no meio da
    // transição, cancelando o avanço agendado e encerrando o tour sem nenhum
    // aviso — tanto no runtime real quanto na prévia do gravador (mesmo
    // código pros dois).
    suprimirAbandonoNavegacao: false,
    // Timestamp (Date.now()) de quando o passo atual acabou de resolver
    // (achado ou "não encontrado") ou o tour concluiu — ver irParaPasso()/
    // tourConcluir() e o uso em handleUrlChange(). Cobre uma janela curta
    // logo DEPOIS da resolução, além de suprimirAbandonoNavegacao (que só
    // cobre ATÉ a resolução): uma navegação SPA disparada por um clique
    // pode gerar mais de um pushState (o próprio router normalizando a URL,
    // redirect interno etc.) — o primeiro já é resolvido corretamente pelo
    // avanço em andamento, mas um segundo pushState um pouco depois podia
    // chegar em handleUrlChange() já com suprimirAbandonoNavegacao=false
    // (resolução já tinha zerado) e a continuação já reescrita pro PRÓXIMO
    // passo (salva preventivamente assim que o passo atual renderiza) —
    // handleUrlChange tratava isso como um novo sinal de retomada e pulava
    // um passo inteiro. Ver TOUR_SPA_ASSENTAMENTO_MS.
    avancoResolvidoEm: 0,
    // { jornadaId, blocoId, etapaId, contextoExtra } quando este tour foi
    // iniciado a partir de uma etapa de Jornada (ver jornadaEtapaClicar) —
    // null em qualquer outro caso (automático, manual via API, prévia do
    // gravador). Só usado por tourConcluir() pra marcar a etapa da Jornada
    // como concluída exatamente quando o tour é concluído de verdade, nunca
    // antes (ver comentário em jornadaEtapaClicar sobre o MVP anterior, que
    // marcava concluído já ao iniciar). Resetado em finalizarTour() e
    // consumido (setado null de volta) em tourConcluir().
    jornadaContexto: null,
  };

  function fetchTour(slug) {
    var params = new URLSearchParams();
    params.set('slug', slug);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/tour?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    });
  }

  // Aparência (cor principal + logo) é opcional e por sistema — endpoint
  // sempre responde 200 com { cor_principal: null, logo_url: null } quando
  // não há configuração salva (ver buscarAparencia no backend), então aqui
  // basta tratar falha de rede/parse como "sem aparência" (nunca bloqueia o
  // tour por causa disso).
  function fetchAparencia(sistema) {
    var params = new URLSearchParams();
    params.set('sistema', sistema);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/aparencia?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).catch(function () { return null; });
  }

  // Cache local (localStorage) do último valor conhecido de aparência por
  // sistema — só uma otimização de exibição, nunca a fonte de verdade (a
  // requisição de verdade sempre roda em paralelo pra confirmar/corrigir,
  // ver fetchAparenciaComTimeout). Existe pra reduzir o "flash" quando
  // /api/widget/aparencia demora mais que APARENCIA_TIMEOUT_MS: em vez de
  // esperar o timeout inteiro e mostrar as cores padrão primeiro pra depois
  // corrigir, quem já visitou antes aplica o último valor conhecido quase
  // instantaneamente.
  var APARENCIA_CACHE_PREFIX = 'userpulse:aparencia:';

  function lerAparenciaCache(sistema) {
    try {
      var raw = window.localStorage.getItem(APARENCIA_CACHE_PREFIX + sistema);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return { cor_principal: parsed.cor_principal || null, logo_url: parsed.logo_url || null };
    } catch (_e) {
      return null;
    }
  }

  function salvarAparenciaCache(sistema, aparencia) {
    try {
      window.localStorage.setItem(APARENCIA_CACHE_PREFIX + sistema, JSON.stringify({
        cor_principal: (aparencia && aparencia.cor_principal) || null,
        logo_url: (aparencia && aparencia.logo_url) || null,
      }));
    } catch (_e) { /* localStorage indisponível/cheio — cache é só otimização, nunca obrigatório */ }
  }

  function aparenciaValoresIguais(a, b) {
    var corA = (a && a.cor_principal) || null;
    var corB = (b && b.cor_principal) || null;
    var logoA = (a && a.logo_url) || null;
    var logoB = (b && b.logo_url) || null;
    return corA === corB && logoA === logoB;
  }

  // Resolve `pronta` com o que houver disponível mais rápido pra exibir,
  // sem nunca esperar a rede indefinidamente:
  //   - com cache local: aplica ele NA HORA (Promise.resolve, sem corrida
  //     nenhuma) — decidido assim de propósito, e não com um
  //     Promise.race([real, cache]) tipo o caminho sem cache abaixo, porque
  //     uma falha rápida de rede (fetchAparencia resolve com null em poucos
  //     ms num erro) podia "vencer" a corrida e aplicar o fallback padrão
  //     por cima de um cache válido só por coincidência de timing.
  //   - sem cache (ex.: primeira visita a este sistema neste navegador):
  //     mesmo comportamento de sempre — espera até APARENCIA_TIMEOUT_MS pela
  //     resposta de verdade antes de desistir e liberar com null (fallback).
  //
  // IMPORTANTE: nenhum dos dois caminhos descarta a resposta real. `real`
  // sempre resolve com o resultado de verdade da API (sucesso ou null em
  // caso de erro/timeout), mesmo que isso aconteça depois de `pronta` — ver
  // uso em init(), que usa isso pra confirmar/corrigir cor/logo depois (e
  // salvar/atualizar o cache local pra próxima visita).
  var APARENCIA_TIMEOUT_MS = 1200;
  function fetchAparenciaComTimeout(sistema) {
    var cacheLocal = lerAparenciaCache(sistema);
    var inicioMs = Date.now();
    var duracaoMs = null;
    var realPromise = fetchAparencia(sistema).then(function (aparencia) {
      duracaoMs = Date.now() - inicioMs;
      if (aparencia) salvarAparenciaCache(sistema, aparencia);
      return aparencia;
    });

    var prontaPromise;
    if (cacheLocal) {
      prontaPromise = Promise.resolve(cacheLocal);
    } else {
      prontaPromise = new Promise(function (resolve) {
        var timer = window.setTimeout(function () { resolve(null); }, APARENCIA_TIMEOUT_MS);
        realPromise.then(function (aparencia) {
          window.clearTimeout(timer);
          resolve(aparencia);
        });
      });
    }

    return {
      pronta: prontaPromise,
      real: realPromise,
      veioDoCacheLocal: function () { return Boolean(cacheLocal); },
      duracaoMs: function () { return duracaoMs; },
      demorouMaisQueOTimeout: function () { return duracaoMs != null && duracaoMs > APARENCIA_TIMEOUT_MS; },
    };
  }

  function hexParaRgbTour(hex) {
    var limpo = String(hex || '').replace('#', '');
    if (limpo.length === 3) limpo = limpo.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(limpo, 16);
    if (isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function corMisturarComBranco(hex, pct) {
    var rgb = hexParaRgbTour(hex);
    if (!rgb) return hex;
    var r = Math.round(rgb.r + (255 - rgb.r) * pct);
    var g = Math.round(rgb.g + (255 - rgb.g) * pct);
    var b = Math.round(rgb.b + (255 - rgb.b) * pct);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function corRgbaTour(hex, alpha) {
    var rgb = hexParaRgbTour(hex);
    if (!rgb) return null;
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  // Aplica (ou limpa) as 4 custom properties consumidas pelo CSS de
  // ensureStyles() — sempre em document.documentElement, nunca no root do
  // overlay do tour (esse é destruído/recriado a cada renderTour(), o
  // documentElement não). cor_principal ausente/inválida = removeProperty,
  // que faz os var(--up-primary, #0058be) do CSS caírem de volta no
  // fallback hardcoded — mesmo visual de sempre pra quem não configurou nada.
  function aplicarAparenciaCss(aparencia) {
    var root = document.documentElement;
    var hex = aparencia && aparencia.cor_principal;
    var rgb = hex ? hexParaRgbTour(hex) : null;
    if (!rgb) {
      root.style.removeProperty('--up-primary');
      root.style.removeProperty('--up-primary-hover');
      root.style.removeProperty('--up-primary-soft');
      root.style.removeProperty('--up-primary-ring');
      return;
    }
    root.style.setProperty('--up-primary', hex);
    root.style.setProperty('--up-primary-hover', corMisturarComBranco(hex, 0.22));
    root.style.setProperty('--up-primary-soft', corRgbaTour(hex, 0.1));
    root.style.setProperty('--up-primary-ring', corRgbaTour(hex, 0.4));
  }

  // Badge do topo da intro/conclusão do tour: usa a logo configurada quando
  // houver, com fallback automático (onerror) pro ícone padrão — nunca
  // deixa a introdução sem badge nenhum por causa de uma URL quebrada.
  // classList.remove garante que o fallback também reverte o fundo branco
  // (up-tour-badge-icone-logo) de volta pro gradiente padrão, senão o ícone
  // (SVG branco) ficaria invisível sobre fundo branco.
  function tourBadgeIcone(iconeFallback) {
    var logo = tourState.aparencia && tourState.aparencia.logo_url;
    if (!logo) return icon(iconeFallback);
    return '<img src="' + escapeHtml(logo) + '" alt="" class="up-tour-badge-logo" ' +
      'onerror="this.style.display=\'none\';var b=this.parentElement;if(b)b.classList.remove(\'up-tour-badge-icone-logo\');' +
      'var f=this.nextElementSibling;if(f)f.style.display=\'flex\'" />' +
      '<span class="up-tour-badge-fallback" style="display:none">' + icon(iconeFallback) + '</span>';
  }

  function tourBadgeClasse() {
    return (tourState.aparencia && tourState.aparencia.logo_url) ? ' up-tour-badge-icone-logo' : '';
  }

  function fetchTourCandidatos(sistema, tela, usuario_id, contexto) {
    var params = new URLSearchParams();
    params.set('sistema', sistema);
    if (tela) params.set('tela', tela);
    if (usuario_id) params.set('usuario_id', usuario_id);
    appendContexto(params, contexto);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/tour/candidatas?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return [];
      return response.json();
    });
  }

  // Reexibição: quando há usuario_id, o servidor é a fonte da verdade — já filtra
  // tours concluídos/pulados em buscarTourCandidatos, e libera de volta para
  // usuários de validação (USERPULSE_ALWAYS_SHOW_USER_IDS), igual às campanhas.
  // O localStorage só entra como fallback quando NÃO há usuario_id (o servidor
  // não tem como identificar o usuário para fazer esse dedupe).
  function tourShownKey(tour) {
    return 'userpulse:tour:' + tour.id;
  }

  function tourWasShown(tour) {
    try {
      return window.localStorage.getItem(tourShownKey(tour)) === '1';
    } catch (_err) {
      return false;
    }
  }

  function tourMarkShown(tour) {
    if (tourState.preview) return; // prévia do gravador nunca marca "já visto" no navegador real
    try {
      window.localStorage.setItem(tourShownKey(tour), '1');
    } catch (_err) {}
  }

  // contextoExtra (opcional) — mesclado por cima de config.contexto só nesta
  // chamada (nunca muda config.contexto em si), pra eventos que precisam
  // carregar um dado próprio além do contexto padrão do widget — ver
  // tourFeedback (feedback_valor/feedback_label/feedback_emoji). Nunca dado
  // sensível: só rótulos fixos escolhidos no próprio código do widget.
  function registrarEventoTour(tipoEvento, passoOrdem, contextoExtra) {
    var tour = tourState.tour;
    var config = state.config;
    if (!tour || !config || tourState.preview) return; // prévia do gravador nunca gera evento real
    var contexto = contextoExtra
      ? Object.assign({}, config.contexto || {}, contextoExtra)
      : (config.contexto || undefined);
    fetch(apiUrl('/api/widget/tour/evento'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        public_key: config.public_key || undefined,
        tour_id: tour.id,
        tipo_evento: tipoEvento,
        passo_ordem: passoOrdem != null ? passoOrdem : undefined,
        usuario_id: config.usuario_id || undefined,
        sistema: config.sistema || undefined,
        tela: config.tela || undefined,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
        contexto: contexto,
      }),
    }).catch(function () { /* fail silently */ });
  }

  // Aceita tanto o valor cru ("meu-valor") quanto colado por engano no formato
  // de seletor de atributo completo ("[data-cy=\"meu-valor\"]" ou com aspas
  // simples) — normaliza pro valor cru antes de montar a busca de verdade.
  function tourNormalizarDataCy(bruto) {
    var valor = String(bruto == null ? '' : bruto).trim();
    var m = /^\[data-cy=(["'])(.*)\1\]$/.exec(valor);
    return m ? m[2] : valor;
  }

  // Aceita "meu-id" ou "#meu-id".
  function tourNormalizarId(bruto) {
    var valor = String(bruto == null ? '' : bruto).trim();
    return valor.charAt(0) === '#' ? valor.slice(1) : valor;
  }

  // Elemento existe no DOM mas está oculto/inativo (display:none,
  // visibility:hidden, disabled, aria-disabled) — trata como ainda-não-
  // encontrado/não-candidato, pra dar tempo do host revelá-lo (ex.: outro
  // passo do tour abriu um painel, um botão que só habilita depois de um
  // campo válido) antes de cair no estado de erro ou de destacar algo que o
  // usuário não consegue de fato usar. Genérico — não depende de nenhum
  // seletor/atributo específico de sistema.
  function tourElementoVisivelEInterativo(el) {
    if (!el) return false;
    try {
      if (el.hasAttribute && el.hasAttribute('disabled')) return false;
      if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return false;
      var estilo = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (estilo && (estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.visibility === 'collapse')) return false;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    } catch (_e) {
      return false;
    }
  }

  // Dado um NodeList/array de candidatos pro mesmo seletor (caso comum de
  // seletor CSS por prefixo de atributo, que pode casar com vários itens de
  // uma lista), escolhe o primeiro que estiver visível/interativo em vez de
  // simplesmente pegar o primeiro em ordem de documento (que
  // document.querySelector já fazia) — evita travar em "elemento não
  // encontrado" só porque o primeiro match é um placeholder/skeleton oculto
  // ou um item ainda desabilitado, quando já existe um candidato válido mais
  // à frente na mesma lista.
  function tourEscolherMelhorCandidato(lista) {
    for (var i = 0; i < lista.length; i++) {
      if (tourElementoVisivelEInterativo(lista[i])) return lista[i];
    }
    return null;
  }

  function selecionarElementoPasso(passo) {
    try {
      var el;
      // 'area' (destaque de grupo/container, ex.: a barra de filtros inteira)
      // usa exatamente a mesma busca de 'css': o seletor identifica o
      // container a destacar, e querySelectorAll+tourEscolherMelhorCandidato
      // já lida bem com isso — spotlight/tooltip não precisam saber a
      // diferença, os dois só operam sobre o rect do elemento retornado aqui
      // (maior ou menor, tanto faz).
      if (passo.seletor_tipo === 'css' || passo.seletor_tipo === 'area') {
        el = tourEscolherMelhorCandidato(document.querySelectorAll(passo.seletor));
      } else if (passo.seletor_tipo === 'id') {
        var idNormalizado = tourNormalizarId(passo.seletor);
        var elId = idNormalizado ? document.getElementById(idNormalizado) : null;
        el = tourElementoVisivelEInterativo(elId) ? elId : null;
      } else {
        // 'data_cy' (default/legado) — cobre também qualquer valor antigo já
        // salvo sem tipo definido. Mesmo tratamento de múltiplos candidatos do
        // 'css' acima: normalmente um data-cy exato é único na tela, mas nada
        // impede o host repetir o mesmo valor em mais de um lugar (ex.: versão
        // mobile/desktop do mesmo componente) — nesse caso, prefere o
        // candidato visível/interativo em vez do primeiro em ordem de DOM.
        var dataCyNormalizado = tourNormalizarDataCy(passo.seletor);
        el = dataCyNormalizado
          ? tourEscolherMelhorCandidato(document.querySelectorAll('[data-cy="' + dataCyNormalizado.replace(/"/g, '\\"') + '"]'))
          : null;
      }
      return el || null;
    } catch (_e) {
      return null;
    }
  }

  // Uso exclusivo do modo debug: diferencia "não existe no DOM" de "existe
  // mas está oculto/desabilitado" para o passo do tour atual — nunca chamado
  // pelo fluxo real de resolução de passo (irParaPasso/localizarComRetry),
  // só para diagnóstico. Duplica a busca crua de selecionarElementoPasso de
  // propósito, em vez de reaproveitá-la, pra não arriscar mudar o
  // comportamento de tourEscolherMelhorCandidato/tourElementoVisivelEInterativo
  // usados no caminho real.
  function debugStatusSeletorPasso(passo) {
    try {
      var candidatos;
      if (passo.seletor_tipo === 'css' || passo.seletor_tipo === 'area') {
        candidatos = document.querySelectorAll(passo.seletor);
      } else if (passo.seletor_tipo === 'id') {
        var idNormalizado = tourNormalizarId(passo.seletor);
        var elId = idNormalizado ? document.getElementById(idNormalizado) : null;
        candidatos = elId ? [elId] : [];
      } else {
        var dataCyNormalizado = tourNormalizarDataCy(passo.seletor);
        candidatos = dataCyNormalizado
          ? document.querySelectorAll('[data-cy="' + dataCyNormalizado.replace(/"/g, '\\"') + '"]')
          : [];
      }
      if (!candidatos || candidatos.length === 0) return 'nao_encontrado_no_dom';
      for (var i = 0; i < candidatos.length; i++) {
        if (tourElementoVisivelEInterativo(candidatos[i])) return 'encontrado_e_visivel';
      }
      return 'encontrado_porem_invisivel_ou_desabilitado';
    } catch (_e) {
      return 'erro_ao_avaliar_seletor';
    }
  }

  // Remove uma entrada já disparada de tourState.buscaExtraTimers (limpeza
  // "ao vivo", pra não deixar o array crescer sem necessidade durante uma
  // digitação longa) — limparBuscaTimer() ainda cobre cancelar as que não
  // chegaram a disparar.
  function tourRemoverBuscaExtraTimer(tipo, id) {
    var lista = tourState.buscaExtraTimers;
    for (var i = lista.length - 1; i >= 0; i--) {
      if (lista[i].tipo === tipo && lista[i].id === id) { lista.splice(i, 1); break; }
    }
  }

  // Agenda 1 requestAnimationFrame + setTimeouts em TOUR_RECHECK_CURTO_MS pra
  // reavaliar o seletor do passo — chamado tanto pelo listener de
  // input/change/keyup quanto pelo MutationObserver (ver localizarComRetry)
  // quando a checagem imediata de nenhum dos dois acha o elemento. Cobre o
  // intervalo entre o evento/mutação acontecer e a lista dinâmica realmente
  // terminar de assentar (debounce da tela de busca, reflow, animação de
  // entrada) — sem essas rechecagens curtas, esse intervalo só seria coberto
  // pelo próximo retry do backoff (tourIntervaloRetry), que pode levar até
  // ~1.5s no pior caso. Só resolve se achar; senão os retries/observer/
  // listener normais continuam até TOUR_RETRY_MAX. Todo id agendado aqui vai
  // pra tourState.buscaExtraTimers — limparBuscaTimer() cancela todos.
  function tourAgendarRecheckCurto(passo, cb) {
    function checar() {
      var achado = selecionarElementoPasso(passo);
      if (achado) { limparBuscaTimer(); cb(achado); }
    }
    if (window.requestAnimationFrame) {
      try {
        var rafId = window.requestAnimationFrame(function () {
          tourRemoverBuscaExtraTimer('raf', rafId);
          checar();
        });
        tourState.buscaExtraTimers.push({ tipo: 'raf', id: rafId });
      } catch (_e) { /* ambiente sem rAF de verdade — segue só com os setTimeout abaixo */ }
    }
    for (var i = 0; i < TOUR_RECHECK_CURTO_MS.length; i++) {
      (function (ms) {
        var timeoutId = window.setTimeout(function () {
          tourRemoverBuscaExtraTimer('timeout', timeoutId);
          checar();
        }, ms);
        tourState.buscaExtraTimers.push({ tipo: 'timeout', id: timeoutId });
      })(TOUR_RECHECK_CURTO_MS[i]);
    }
  }

  // Verifica se um nó é (ou está dentro d)o próprio overlay do tour
  // (TOUR_WIDGET_ID) — usado pra filtrar mutações que os MutationObserver de
  // busca/vigilância captam por causa do PRÓPRIO renderTour() (remoção/
  // recriação do overlay, mudança de estilo do tooltip/spotlight etc.).
  // Sem esse filtro, observar document.body com subtree:true inclui o
  // overlay que o próprio runtime desenha — cada renderTour() dispara o
  // observer de novo, que (se reagir chamando renderTour() outra vez) entra
  // em loop de alta frequência, travando a aba. Genérico: só depende do id
  // que o próprio widget já usa pro seu root, sem nenhuma referência a
  // sistema/campo específico.
  function tourNoPertenceAoOverlay(node) {
    if (!node) return false;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    if (el.id === TOUR_WIDGET_ID) return true;
    try { return Boolean(el.closest && el.closest('#' + TOUR_WIDGET_ID)); } catch (_e) { return false; }
  }

  // true quando TODAS as mutações de um lote do MutationObserver pertencem
  // ao próprio overlay do tour (ver tourNoPertenceAoOverlay) — nesse caso o
  // lote inteiro é ruído do nosso próprio render, não uma mudança real na
  // tela do host, e deve ser ignorado. Basta um único nó fora do overlay no
  // mesmo lote (mutação real do host) pra ele deixar de ser ignorado.
  function tourMutacoesSaoSoDoOverlay(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'childList') {
        var nos = [];
        for (var a = 0; a < m.addedNodes.length; a++) nos.push(m.addedNodes[a]);
        for (var r = 0; r < m.removedNodes.length; r++) nos.push(m.removedNodes[r]);
        if (nos.length === 0) { if (!tourNoPertenceAoOverlay(m.target)) return false; continue; }
        for (var n = 0; n < nos.length; n++) {
          if (!tourNoPertenceAoOverlay(nos[n])) return false;
        }
        continue;
      }
      // 'attributes' — único outro tipo configurado nos observe() abaixo.
      if (!tourNoPertenceAoOverlay(m.target)) return false;
    }
    return true;
  }

  function localizarComRetry(passo, tentativa, cb) {
    var el = selecionarElementoPasso(passo);
    if (el) { limparBuscaTimer(); cb(el); return; }
    if (tentativa >= TOUR_RETRY_MAX) { limparBuscaTimer(); cb(null); return; }
    // Primeira tentativa falhou — troca o tooltip do passo anterior (que ainda
    // estaria na tela) pelo estado discreto "Aguardando", em vez de deixá-lo
    // parado ali até a busca resolver. Só dispara uma vez por passo (tentativa
    // 0): no caso comum em que o elemento já existe, cb(el) acima resolve
    // antes de chegar aqui e esse estado nunca aparece.
    if (tentativa === 0) renderTour();

    // Documento ainda carregando (script rodou antes do DOM terminar de
    // parsear, comum logo após um reload) — não consome uma tentativa do
    // orçamento de retry por isso; só espera um instante curto e tenta de
    // novo no mesmo índice, até o carregamento inicial terminar de verdade.
    if (document.readyState === 'loading') {
      tourState.buscaTimer = window.setTimeout(function () {
        localizarComRetry(passo, tentativa, cb);
      }, 100);
      return;
    }

    // MutationObserver: resolve assim que o elemento chegar ao DOM, sem
    // esperar o próximo retry agendado (útil pra rotas/paineis que demoram
    // exatamente entre dois intervalos de backoff) — só um observer por
    // sessão de busca, reaproveitado entre as chamadas recursivas seguintes
    // (não recriado a cada tentativa); limparBuscaTimer() desconecta.
    if (!tourState.buscaObserver && window.MutationObserver) {
      try {
        tourState.buscaObserver = new MutationObserver(function (mutations) {
          // Ignora lotes de mutação que são só o próprio overlay do tour se
          // (re)desenhando (ex.: o estado "Aguardando" renderizado acima) —
          // nunca uma mudança real no host, então não vale reavaliar nada.
          if (tourMutacoesSaoSoDoOverlay(mutations)) return;
          var achado = selecionarElementoPasso(passo);
          if (achado) { limparBuscaTimer(); cb(achado); return; }
          // Mutação aconteceu mas o elemento ainda não passa no check de
          // visibilidade (rect zerado) — comum quando o item entra no DOM
          // antes do reflow/animação de entrada assentar. Agenda rechecagens
          // curtas em vez de só esperar a próxima mutação ou o retry do
          // backoff (ver tourAgendarRecheckCurto).
          tourAgendarRecheckCurto(passo, cb);
        });
        tourState.buscaObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      } catch (_e) {
        tourState.buscaObserver = null;
      }
    }

    // input/change/keyup: reavalia o seletor do próximo passo assim que o
    // usuário digita/altera algo no elemento anterior (ex.: campo de busca
    // cujo passo seguinte aponta pra um item de lista que só existe depois
    // da digitação) — mesmo padrão do MutationObserver acima (só resolve se
    // achar; senão continua até o próximo retry agendado ou o timeout de
    // TOUR_RETRY_MAX), só que reagindo à interação em si, não à mutação do
    // DOM — cobre elementos que já existem mas ainda não passam no check de
    // visibilidade (ver selecionarElementoPasso) no instante exato da
    // mutação. Delegado em document (capture) porque o elemento que dispara
    // o evento (o campo do passo anterior) não é o elemento sendo buscado
    // aqui, e um listener por sessão de busca é suficiente (mesma
    // justificativa do observer único acima).
    if (!tourState.buscaInteracaoHandler) {
      var handlerBuscaInteracao = function () {
        var achado = selecionarElementoPasso(passo);
        if (achado) { limparBuscaTimer(); cb(achado); return; }
        // Ainda não achou no instante do evento — o valor acabou de mudar,
        // então a lista dinâmica (se depender de debounce da própria tela)
        // pode aparecer só um pouco depois; agenda rechecagens curtas em vez
        // de esperar só o próximo retry do backoff.
        tourAgendarRecheckCurto(passo, cb);
      };
      try {
        document.addEventListener('input', handlerBuscaInteracao, true);
        document.addEventListener('change', handlerBuscaInteracao, true);
        document.addEventListener('keyup', handlerBuscaInteracao, true);
        tourState.buscaInteracaoHandler = handlerBuscaInteracao;
      } catch (_e) {
        tourState.buscaInteracaoHandler = null;
      }
    }

    tourState.buscaTimer = window.setTimeout(function () {
      localizarComRetry(passo, tentativa + 1, cb);
    }, tourIntervaloRetry(tentativa));
  }

  function limparBuscaTimer() {
    if (tourState.buscaTimer) {
      window.clearTimeout(tourState.buscaTimer);
      tourState.buscaTimer = null;
    }
    if (tourState.buscaObserver) {
      try { tourState.buscaObserver.disconnect(); } catch (_e) {}
      tourState.buscaObserver = null;
    }
    if (tourState.buscaInteracaoHandler) {
      try {
        document.removeEventListener('input', tourState.buscaInteracaoHandler, true);
        document.removeEventListener('change', tourState.buscaInteracaoHandler, true);
        document.removeEventListener('keyup', tourState.buscaInteracaoHandler, true);
      } catch (_e) {}
      tourState.buscaInteracaoHandler = null;
    }
    if (tourState.buscaExtraTimers.length) {
      for (var i = 0; i < tourState.buscaExtraTimers.length; i++) {
        var item = tourState.buscaExtraTimers[i];
        try {
          if (item.tipo === 'raf' && window.cancelAnimationFrame) window.cancelAnimationFrame(item.id);
          else window.clearTimeout(item.id);
        } catch (_e) {}
      }
      tourState.buscaExtraTimers = [];
    }
  }

  // Cancela toda a vigilância de reposicionamento do passo atual (observer,
  // listener de interação, timers/frames de rechecagem curta e o timer da
  // janela) — chamada ao trocar de passo (irParaPasso, antes de resolver o
  // próximo) e ao encerrar/concluir o tour (finalizarTour/tourConcluir), pra
  // nunca sobrar observer/listener/timer vigiando o elemento de um passo que
  // já ficou pra trás.
  function tourLimparVigiaPosicionamento() {
    if (tourState.vigiaJanelaTimer) {
      window.clearTimeout(tourState.vigiaJanelaTimer);
      tourState.vigiaJanelaTimer = null;
    }
    if (tourState.vigiaObserver) {
      try { tourState.vigiaObserver.disconnect(); } catch (_e) {}
      tourState.vigiaObserver = null;
    }
    if (tourState.vigiaInteracaoHandler) {
      try {
        document.removeEventListener('input', tourState.vigiaInteracaoHandler, true);
        document.removeEventListener('change', tourState.vigiaInteracaoHandler, true);
        document.removeEventListener('keyup', tourState.vigiaInteracaoHandler, true);
      } catch (_e) {}
      tourState.vigiaInteracaoHandler = null;
    }
    if (tourState.vigiaExtraTimers.length) {
      for (var i = 0; i < tourState.vigiaExtraTimers.length; i++) {
        var item = tourState.vigiaExtraTimers[i];
        try {
          if (item.tipo === 'raf' && window.cancelAnimationFrame) window.cancelAnimationFrame(item.id);
          else window.clearTimeout(item.id);
        } catch (_e) {}
      }
      tourState.vigiaExtraTimers = [];
    }
    if (tourState.vigiaFrameId != null) {
      try { if (window.cancelAnimationFrame) window.cancelAnimationFrame(tourState.vigiaFrameId); } catch (_e) {}
      tourState.vigiaFrameId = null;
    }
    tourState.vigiaUltimoRect = null;
  }

  // Diferença mínima (px) pra considerar que o rect "mudou de verdade" —
  // abaixo disso é ruído de subpixel/arredondamento entre leituras
  // consecutivas de getBoundingClientRect(), não vale redesenhar por isso.
  var TOUR_RECT_EPSILON_PX = 1;

  function tourRectMudouSignificativamente(a, b) {
    if (!a || !b) return true;
    return Math.abs(a.top - b.top) > TOUR_RECT_EPSILON_PX ||
      Math.abs(a.left - b.left) > TOUR_RECT_EPSILON_PX ||
      Math.abs(a.width - b.width) > TOUR_RECT_EPSILON_PX ||
      Math.abs(a.height - b.height) > TOUR_RECT_EPSILON_PX;
  }

  // Reavalia o elemento do passo ATUAL (já destacado, diferente de
  // localizarComRetry/selecionarElementoPasso quando ainda procurando) e
  // reposiciona o highlight — chamada pela vigilância de
  // tourIniciarVigiaPosicionamento (mutação/input/change/keyup/rechecagens
  // curtas) e por reposicionarTour (scroll/resize, já existente). Revalida
  // contra o seletor do passo em vez de só reler o rect do elemento salvo,
  // pra cobrir tanto reflow simples (mesmo nó, só mudou de posição) quanto
  // remount (nó antigo trocado por um novo do mesmo seletor — comum em
  // formulários reativos quando novos campos aparecem acima/abaixo do alvo):
  // nesse segundo caso, o rect do nó antigo (agora destacado do DOM) não
  // serve de nada, então rebindar pro nó novo é necessário pra highlight e
  // avanço por clique/interação continuarem funcionando. Se o elemento e a
  // posição não mudaram de verdade (ver tourRectMudouSignificativamente),
  // pula renderTour() — nunca redesenha à toa.
  // Atualiza só a posição do spotlight/tooltip do passo JÁ renderizado (top/
  // left/width/height via style, direto nos nós existentes) — usada por
  // reposicionamentos que não mudam de passo nem de tela (vigilância de
  // mutação/interação, scroll, resize). Nunca toca innerHTML/recria nó
  // nenhum, então a animação de entrada do tooltip (up-fade-in, ver
  // ensureStyles) não reinicia. Antes disso existir, qualquer reposição —
  // inclusive uma mudança de 1px no rect do alvo durante uma tela se
  // estabilizando (ex.: campo de busca com resultado dinâmico) — chamava
  // renderTour() inteiro: remove o root, recria do zero, reaplica a
  // animação — o tooltip literalmente desaparecia e reaparecia (flicker)
  // toda vez que o alvo se mexia um pouco, mesmo sem trocar de passo.
  // Retorna false (sinal pra quem chamou cair no renderTour() completo) só
  // quando o DOM atual não está no estado "passo normal" pra começo de
  // conversa — spotlight/tooltip do passo só existem nesse estado; qualquer
  // troca real de tela (entrar num passo pela primeira vez, ir pra
  // intro/concluído/não-encontrado) continua indo por renderTour() como
  // sempre, com a animação normal.
  //
  // Checar só a PRESENÇA de .up-tour-spotlight/#up-tour-tooltip-el não
  // bastava: irParaPasso() nunca chama renderTour() diretamente ao entrar
  // num passo novo (o comentário logo abaixo dele explica — a própria
  // vigilância dispara o primeiro render de verdade). Isso significa que,
  // ao trocar de Passo 1 pra Passo 2, tourState.root ainda É o root do
  // Passo 1 (com spotlight/tooltip válidos, só que com o CONTEÚDO do passo
  // errado) no instante em que a vigilância do Passo 2 dispara — sem essa
  // checagem de índice, a troca de passo virava só uma "reposição" do card
  // antigo, atualizando a posição mas nunca o título/descrição/progresso, e
  // o passo ficava travado (Próximo parecia não fazer nada). vigiaRootIndice
  // só é setado quando o DOM atual foi de fato construído pra este índice
  // (ver renderTourInterno) — só aí a reposição em vez de reconstrução é segura.
  function tourAtualizarPosicaoDOM(rect, passo) {
    if (!tourState.root || tourState.vigiaRootIndice !== tourState.indice) return false;
    var spotlight = tourState.root.querySelector('.up-tour-spotlight');
    var tooltipEl = tourState.root.querySelector('#up-tour-tooltip-el');
    if (!spotlight || !tooltipEl) return false;
    spotlight.style.top = (rect.top - 4) + 'px';
    spotlight.style.left = (rect.left - 4) + 'px';
    spotlight.style.width = (rect.width + 8) + 'px';
    spotlight.style.height = (rect.height + 8) + 'px';
    var pos = calcularPosicaoTooltip(rect, passo.tooltip_posicao || 'auto', 300, tooltipEl.offsetHeight || 200);
    tooltipEl.style.top = pos.top + 'px';
    tooltipEl.style.left = pos.left + 'px';
    return true;
  }

  function tourRecomputarPosicaoAtual() {
    if (!tourState.ativo || tourState.naoEncontrado || !tourState.tour || !tourState.elementoAtual) return;
    var passo = tourState.tour.passos[tourState.indice];
    if (!passo) return;
    var revalidado = selecionarElementoPasso(passo);
    // Alvo não achado neste ciclo (pode ser uma mutação totalmente alheia ao
    // passo, ou um instante intermediário do reflow) — não derruba o passo
    // por isso; localizarComRetry/irParaPasso já é o único fluxo responsável
    // por decidir "elemento não encontrado" de verdade, na troca de passo.
    if (!revalidado) return;
    var trocouElemento = revalidado !== tourState.elementoAtual;
    if (trocouElemento) {
      limparInteracao();
      tourState.elementoAtual = revalidado;
      bindInteracao(revalidado, passo);
    }
    var rectNovo = revalidado.getBoundingClientRect();
    // Mesmo elemento e posição/tamanho praticamente iguais ao último render
    // — nada mudou de verdade, então não desenha de novo (evita trabalho à
    // toa e, por consequência, gerar mais mutação de DOM sem necessidade).
    if (!trocouElemento && !tourRectMudouSignificativamente(rectNovo, tourState.vigiaUltimoRect)) return;
    tourState.vigiaUltimoRect = rectNovo;
    if (!tourAtualizarPosicaoDOM(rectNovo, passo)) renderTour();
  }

  // Agenda no máximo 1 tourRecomputarPosicaoAtual() por frame — usado pelo
  // MutationObserver e pelo listener de input/change/keyup da vigilância
  // (tourIniciarVigiaPosicionamento), que podem disparar várias vezes em
  // sequência rápida (vários registros no mesmo lote de mutação, várias
  // teclas seguidas). Chamadas extras enquanto já existe um recálculo
  // pendente pro próximo frame são ignoradas — todas colapsam num recálculo
  // só, nunca empilham. Sem requestAnimationFrame disponível, recalcula na
  // hora (mesmo fallback síncrono usado em outros pontos da vigilância).
  function tourAgendarRecomputoVigia() {
    if (tourState.vigiaFrameId != null) return;
    if (!window.requestAnimationFrame) { tourRecomputarPosicaoAtual(); return; }
    tourState.vigiaFrameId = window.requestAnimationFrame(function () {
      tourState.vigiaFrameId = null;
      tourRecomputarPosicaoAtual();
    });
  }

  // Agenda 1 requestAnimationFrame + setTimeouts em TOUR_RECHECK_CURTO_MS
  // chamando tourRecomputarPosicaoAtual — mesmo padrão de
  // tourAgendarRecheckCurto (busca), só que pra reposicionamento do elemento
  // já achado. Cobre o intervalo entre o passo ser destacado/uma mutação
  // acontecer e o layout realmente terminar de assentar.
  function tourAgendarVigiaCurta() {
    if (window.requestAnimationFrame) {
      try {
        var rafId = window.requestAnimationFrame(function () {
          tourRemoverVigiaExtraTimer('raf', rafId);
          tourRecomputarPosicaoAtual();
        });
        tourState.vigiaExtraTimers.push({ tipo: 'raf', id: rafId });
      } catch (_e) { /* ambiente sem rAF de verdade — segue só com os setTimeout abaixo */ }
    }
    for (var i = 0; i < TOUR_RECHECK_CURTO_MS.length; i++) {
      (function (ms) {
        var timeoutId = window.setTimeout(function () {
          tourRemoverVigiaExtraTimer('timeout', timeoutId);
          tourRecomputarPosicaoAtual();
        }, ms);
        tourState.vigiaExtraTimers.push({ tipo: 'timeout', id: timeoutId });
      })(TOUR_RECHECK_CURTO_MS[i]);
    }
  }

  // Remove uma entrada já disparada de tourState.vigiaExtraTimers — mesmo
  // motivo de tourRemoverBuscaExtraTimer (não deixar o array crescer à toa).
  function tourRemoverVigiaExtraTimer(tipo, id) {
    var lista = tourState.vigiaExtraTimers;
    for (var i = lista.length - 1; i >= 0; i--) {
      if (lista[i].tipo === tipo && lista[i].id === id) { lista.splice(i, 1); break; }
    }
  }

  // Chamada assim que o elemento de um passo é encontrado (irParaPasso) —
  // rola até ele só se necessário (já visível na viewport não precisa de
  // scroll/animação nenhuma), depois estabiliza o highlight: agenda
  // rechecagens curtas (rAF + TOUR_RECHECK_CURTO_MS) que recalculam o rect
  // real em vez de reaproveitar o rect capturado antes do scroll/reflow
  // acontecer, e liga uma vigilância por TOUR_VIGIA_JANELA_MS (mutação de
  // DOM + input/change/keyup) pra continuar reposicionando se o layout ao
  // redor mudar um pouco depois (ex.: mais campos aparecendo). Scroll/resize
  // continuam cobertos à parte, sem esse limite, por bindTourReposHandlers.
  function tourIniciarVigiaPosicionamento(el) {
    try {
      var rectAtual = el.getBoundingClientRect();
      var dentroDaViewport = rectAtual.top >= 0 && rectAtual.left >= 0 &&
        rectAtual.bottom <= window.innerHeight && rectAtual.right <= window.innerWidth;
      if (!dentroDaViewport) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (_e) {}

    tourAgendarVigiaCurta();

    if (window.MutationObserver) {
      try {
        tourState.vigiaObserver = new MutationObserver(function (mutations) {
          // Ignora lotes que são só o próprio overlay do tour se
          // (re)desenhando (spotlight/tooltip do renderTour() anterior) —
          // sem isso, observar document.body inclui o nosso próprio overlay
          // e cada renderTour() reagendaria outro recálculo, entrando em
          // loop de alta frequência (ver tourMutacoesSaoSoDoOverlay).
          if (tourMutacoesSaoSoDoOverlay(mutations)) return;
          tourAgendarRecomputoVigia();
        });
        tourState.vigiaObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      } catch (_e) {
        tourState.vigiaObserver = null;
      }
    }

    var handlerVigiaInteracao = function () { tourAgendarRecomputoVigia(); };
    try {
      document.addEventListener('input', handlerVigiaInteracao, true);
      document.addEventListener('change', handlerVigiaInteracao, true);
      document.addEventListener('keyup', handlerVigiaInteracao, true);
      tourState.vigiaInteracaoHandler = handlerVigiaInteracao;
    } catch (_e) {
      tourState.vigiaInteracaoHandler = null;
    }

    tourState.vigiaJanelaTimer = window.setTimeout(function () {
      tourState.vigiaJanelaTimer = null;
      tourLimparVigiaPosicionamento();
    }, TOUR_VIGIA_JANELA_MS);
  }

  // Margem mínima entre o tooltip e a borda da viewport — nunca menos que
  // isso, pra nunca deixar o tooltip colado ou cortado na borda da tela.
  var TOUR_TOOLTIP_MARGEM_VIEWPORT = 12;

  function clampPos(pos, w, h) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var m = TOUR_TOOLTIP_MARGEM_VIEWPORT;
    return {
      top: Math.min(Math.max(pos.top, m), Math.max(m, vh - h - m)),
      left: Math.min(Math.max(pos.left, m), Math.max(m, vw - w - m)),
    };
  }

  function calcularPosicaoTooltip(rect, posicaoDesejada, tooltipW, tooltipH) {
    var margin = 16; // distância do tooltip até a borda do elemento (não confundir com a margem de viewport acima)
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var m = TOUR_TOOLTIP_MARGEM_VIEWPORT;
    var positions = {
      top: { top: rect.top - tooltipH - margin, left: rect.left + rect.width / 2 - tooltipW / 2 },
      bottom: { top: rect.bottom + margin, left: rect.left + rect.width / 2 - tooltipW / 2 },
      left: { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left - tooltipW - margin },
      right: { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.right + margin },
    };
    function fits(pos) {
      return pos.top >= m && pos.left >= m && pos.top + tooltipH <= vh - m && pos.left + tooltipW <= vw - m;
    }
    // Ordem de fallback pedida: cada posição preferida tenta primeiro seu
    // "oposto" (mesmo eixo), depois as duas do outro eixo.
    var ordem;
    if (posicaoDesejada === 'top') ordem = ['top', 'bottom', 'right', 'left'];
    else if (posicaoDesejada === 'left') ordem = ['left', 'right', 'bottom', 'top'];
    else if (posicaoDesejada === 'right') ordem = ['right', 'left', 'bottom', 'top'];
    else if (posicaoDesejada === 'bottom') ordem = ['bottom', 'top', 'right', 'left'];
    else ordem = ['bottom', 'top', 'right', 'left']; // 'auto'

    for (var i = 0; i < ordem.length; i++) {
      if (fits(positions[ordem[i]])) return clampPos(positions[ordem[i]], tooltipW, tooltipH);
    }

    // Nenhuma das 4 posições coube sem cortar (ex.: elemento num canto da
    // tela). Em vez de simplesmente usar a preferida (ordem[0]) e sofrer um
    // clamp que pode empurrar o tooltip longe do elemento, escolhe entre as 4
    // a que exige o MENOR ajuste pra caber — fica o mais próximo possível do
    // elemento em vez de "pular" pra um canto qualquer da tela.
    var melhor = null;
    var menorAjuste = Infinity;
    for (var j = 0; j < ordem.length; j++) {
      var candidata = positions[ordem[j]];
      var clampada = clampPos(candidata, tooltipW, tooltipH);
      var ajuste = Math.abs(clampada.top - candidata.top) + Math.abs(clampada.left - candidata.left);
      if (ajuste < menorAjuste) {
        menorAjuste = ajuste;
        melhor = clampada;
      }
    }
    return melhor;
  }

  // Ações dedicadas (Tentar novamente / Pular este passo / Encerrar tour) em
  // vez do footer genérico — aqui não há elemento real pra "Voltar"/"Próximo"
  // clicarem contra, então cada ação mapeia num verbo específico pra esse
  // estado. "Pular este passo" já resolve o caso de ser o último passo
  // (conclui em vez de tentar avançar) — ver tourPularPasso.
  // Na prévia comum do gravador (preview=true, previewModoUsuarioFinal=false),
  // "Encerrar tour" vira "Voltar à revisão" — reflete melhor o que a ação
  // realmente faz nesse contexto (recorderRestaurarAposPreview reabre o
  // painel lateral, não é o fim de uma experiência real de usuário). Em
  // "Pré-visualizar como usuário final" mantém "Encerrar tour" de propósito,
  // igual ao runtime real — é o objetivo desse modo (ver
  // recorderPreVisualizarComoUsuarioFinal).
  function tourRotuloEncerrar() {
    return (tourState.preview && !tourState.previewModoUsuarioFinal) ? 'Voltar à revisão' : 'Encerrar tour';
  }

  function renderTourNaoEncontrado() {
    var passo = tourState.tour.passos[tourState.indice];
    var total = tourState.tour.passos.length;
    var rotuloEncerrar = tourRotuloEncerrar();
    return [
      '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="' + rotuloEncerrar + '">' + icon('close') + '</button>',
      '<p class="up-tour-progress">Passo ' + (tourState.indice + 1) + ' de ' + total + '</p>',
      '<p class="up-tour-title">Elemento não encontrado</p>',
      passo.titulo ? '<p class="up-tour-desc" style="font-weight:700;color:#0b1c30">' + escapeHtml(passo.titulo) + '</p>' : '',
      passo.descricao ? '<p class="up-tour-desc">' + escapeHtml(passo.descricao) + '</p>' : '',
      '<div class="up-tour-warning">' + icon('close') + '<span>Elemento não encontrado nesta tela. Ele pode estar oculto, ter mudado ou estar em outra página.</span></div>',
      '<div class="up-tour-footer up-tour-footer-stack">',
      '<button type="button" class="up-tour-btn up-tour-btn-primary" data-up-tour-retry="true">Tentar novamente</button>',
      '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-back="true"' + (tourState.indice === 0 ? ' disabled' : '') + '>Voltar</button>',
      // Só na prévia do gravador (tourState.preview) e fora do modo "usuário
      // final" (tourState.previewModoUsuarioFinal) — no tour real não faz
      // sentido nem existe recorderIniciarTrocaElemento pra chamar (ver
      // tourTrocarPassoAtual), e na prévia "como usuário final" o objetivo é
      // justamente não mostrar nenhum controle do gravador. Nos demais casos,
      // deixa o usuário corrigir o seletor na hora, em vez de precisar
      // encerrar a prévia, achar o passo no painel lateral e clicar Trocar
      // manualmente.
      (tourState.preview && !tourState.previewModoUsuarioFinal
        ? '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-trocar-passo="true">Trocar elemento deste passo</button>'
        : ''),
      '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-skip-passo="true">Pular este passo</button>',
      '<button type="button" class="up-tour-btn up-tour-btn-text" data-up-tour-skip="true">' + rotuloEncerrar + '</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Estado discreto exibido enquanto localizarComRetry ainda está tentando achar
  // o elemento do passo atual (não é erro ainda — só decorre até TOUR_RETRY_MAX
  // tentativas). Mantém título/descrição do passo e o footer completo (Pular/
  // Voltar/Concluir-Próximo) para não travar o usuário durante a espera.
  function renderTourAguardando() {
    var passo = tourState.tour.passos[tourState.indice];
    var total = tourState.tour.passos.length;
    var ultimo = tourState.indice === total - 1;
    return [
      '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="Pular tour">' + icon('close') + '</button>',
      '<p class="up-tour-progress">Passo ' + (tourState.indice + 1) + ' de ' + total + '</p>',
      '<p class="up-tour-title">' + escapeHtml(passo.titulo) + '</p>',
      passo.descricao ? '<p class="up-tour-desc">' + escapeHtml(passo.descricao) + '</p>' : '',
      '<div class="up-tour-loading"><span class="up-tour-spinner"></span><span>Aguardando próximo elemento...</span></div>',
      tourFooter(total, ultimo),
      '</div>',
    ].join('');
  }

  function tourFooter(total, ultimo) {
    return [
      '<div class="up-tour-footer">',
      '<button type="button" class="up-tour-btn up-tour-btn-text" data-up-tour-skip="true">Pular</button>',
      '<div class="up-tour-nav">',
      '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-back="true"' + (tourState.indice === 0 ? ' disabled' : '') + '>Voltar</button>',
      ultimo
        ? '<button type="button" class="up-tour-btn up-tour-btn-primary" data-up-tour-finish="true">Concluir</button>'
        : '<button type="button" class="up-tour-btn up-tour-btn-primary" data-up-tour-next="true">Próximo</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Tela de introdução, exibida antes do passo 0 (iniciarTour só monta essa
  // tela; o passo 0 só é buscado/exibido depois de "Começar tour" — ver
  // tourIntroComecar). "Não mostrar novamente" reaproveita tourPular() —
  // mesmo efeito de registrar 'pulado' e marcar localStorage que o botão
  // Pular já usa em qualquer outro ponto do tour.
  function renderTourIntro() {
    var tour = tourState.tour;
    var total = tour.passos.length;
    // Descrição cadastrada no tour (campo já existente, mesmo usado no
    // admin) explica o que será apresentado; sem ela, cai na mensagem
    // genérica de sempre.
    var descricao = tour.descricao && tour.descricao.trim()
      ? tour.descricao.trim()
      : 'Vamos te guiar por este recurso em ' + total + ' passo' + (total === 1 ? '' : 's') + '.';
    // Prévia do progresso (primeiro marcador em destaque) — decorativa, os
    // mesmos indicadores já usados nos passos (.up-tour-dots/.up-tour-dot),
    // só pra dar uma noção de "quantos passos" antes de começar. Não lê nem
    // altera tourState.indice (o tour ainda nem começou de fato).
    var dots = [];
    for (var i = 0; i < total; i++) {
      dots.push('<span class="up-tour-dot' + (i === 0 ? ' up-tour-dot-active' : '') + '"></span>');
    }
    return [
      '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">',
      '<button type="button" class="up-tour-close" data-up-tour-intro-dispensar="true" aria-label="Fechar">' + icon('close') + '</button>',
      '<div class="up-tour-badge-icone' + tourBadgeClasse() + '">' + tourBadgeIcone('sparkle') + '</div>',
      '<p class="up-tour-title">' + escapeHtml(tour.titulo || 'Novo tour guiado') + '</p>',
      '<p class="up-tour-desc">' + escapeHtml(descricao) + '</p>',
      (total > 1 ? '<div class="up-tour-dots up-tour-dots-intro">' + dots.join('') + '</div>' : ''),
      '<div class="up-tour-footer up-tour-footer-stack">',
      '<button type="button" class="up-tour-btn up-tour-btn-primary" data-up-tour-intro-comecar="true">Começar tour' + icon('arrow_forward') + '</button>',
      '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-intro-dispensar="true">Agora não</button>',
      '</div>',
      '<button type="button" class="up-tour-intro-opcional" data-up-tour-intro-nunca-mais="true"><span class="up-tour-intro-opcional-caixa"></span>Não mostrar novamente</button>',
      '</div>',
    ].join('');
  }

  // Tela final, exibida depois do último passo (tourConcluir monta essa tela
  // em vez de encerrar na hora — ver tourConcluir). O feedback é registrado
  // como evento 'feedback_tour' ao clicar (ver tourFeedback) — esta função só
  // decide o que mostrar (botões ou "obrigado"), nunca registra nada sozinha.
  function renderTourFim() {
    if (tourState.feedbackEscolhido) {
      return [
        '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">',
        '<p class="up-tour-title">Obrigado pelo feedback!</p>',
        '<p class="up-tour-desc">Isso nos ajuda a melhorar este tour.</p>',
        '</div>',
      ].join('');
    }
    return [
      '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">',
      '<button type="button" class="up-tour-close" data-up-tour-fim-fechar="true" aria-label="Fechar">' + icon('close') + '</button>',
      '<div class="up-tour-badge-icone up-tour-badge-icone-sucesso' + tourBadgeClasse() + '">' + tourBadgeIcone('check') + '</div>',
      '<p class="up-tour-title">Tour concluído</p>',
      '<p class="up-tour-desc">Esse tour foi útil pra você?</p>',
      '<div class="up-tour-feedback">',
      '<button type="button" class="up-tour-feedback-btn" data-up-tour-feedback="nao_ajudou" aria-label="Não ajudou">😕</button>',
      '<button type="button" class="up-tour-feedback-btn" data-up-tour-feedback="ajudou" aria-label="Ajudou">🙂</button>',
      '<button type="button" class="up-tour-feedback-btn" data-up-tour-feedback="muito_util" aria-label="Muito útil">🤩</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Nunca deixa uma exceção no meio da renderização (seletor/DOM do host se
  // comportando de forma inesperada, cálculo de posição, etc.) resultar num
  // tour que "só some": o root antigo já foi removido antes de qualquer
  // cálculo arriscado (ver renderTourInterno), então sem essa proteção uma
  // exceção ali deixava a tela sem overlay nenhum, sem fallback, sem erro
  // visível pro usuário — só um erro no console que ninguém via.
  function renderTour() {
    if (!tourState.ativo || !tourState.tour) return;
    try {
      renderTourInterno();
    } catch (erro) {
      renderTourErroFallback();
    }
  }

  // Tela de fallback pra quando a renderização normal falha de forma
  // inesperada (regra obrigatória: nunca sumir silenciosamente) — só depende
  // do essencial (tourState.ativo/tour), nada específico de um passo, pra não
  // arriscar falhar ela mesma pelo mesmo motivo que already falhou antes.
  function renderTourErroFallback() {
    if (!tourState.ativo) return;
    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();
    var root = document.createElement('div');
    root.id = TOUR_WIDGET_ID;
    root.className = 'up-tour-overlay';
    tourState.root = root;
    root.innerHTML = [
      '<div class="up-tour-tooltip up-tour-tooltip-central" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="Encerrar tour">' + icon('close') + '</button>',
      '<p class="up-tour-title">Não foi possível continuar o tour</p>',
      '<div class="up-tour-warning">' + icon('close') + '<span>Ocorreu um problema inesperado ao exibir este passo.</span></div>',
      '<div class="up-tour-footer up-tour-footer-stack">',
      '<button type="button" class="up-tour-btn up-tour-btn-secondary" data-up-tour-skip-passo="true">Pular este passo</button>',
      '<button type="button" class="up-tour-btn up-tour-btn-text" data-up-tour-skip="true">Encerrar tour</button>',
      '</div>',
      '</div>',
    ].join('');
    try {
      document.body.appendChild(root);
      bindTourEvents();
    } catch (_e) { /* mesmo isso falhando, não há mais nada seguro a tentar aqui */ }
  }

  // Texto do aviso de avanço por interação (passo.modo_avanco_interacao),
  // exibido só no passo em si — nunca muda a estrutura do passo, só qual
  // frase é mostrada. "ao_alterar_valor" é preenchimento de campo, não
  // clique, então precisa de um texto diferente (senão instrui o usuário a
  // clicar num input de busca/texto, o que não é o que avança o passo).
  // "ao_aparecer_elemento"/"ao_sumir_elemento" dependem de uma mudança
  // indireta na tela (não uma ação direta no elemento destacado) — nenhum
  // texto genérico descreveria isso sem confundir, então ficam sem aviso
  // (igual a "manual": só o botão Próximo/Voltar mesmo).
  function tourHintTexto(passo) {
    var modo = passo.modo_avanco_interacao;
    if (modo === 'ao_alterar_valor') return 'Preencha o campo destacado para continuar.';
    if (modo === 'ao_clicar') return 'Clique no elemento destacado para continuar.';
    return '';
  }

  function renderTourInterno() {
    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    var root = document.createElement('div');
    root.id = TOUR_WIDGET_ID;
    root.className = 'up-tour-overlay';
    tourState.root = root;
    // Todo renderTourInterno() constrói um DOM novo — o marcador só volta a
    // apontar pra um índice de verdade (ver tourAtualizarPosicaoDOM) se a
    // ramificação "passo normal" abaixo rodar até o fim; qualquer outro
    // estado (intro/concluído/aguardando/não encontrado) sai com -1.
    tourState.vigiaRootIndice = -1;

    if (tourState.tela === 'intro') {
      root.innerHTML = renderTourIntro();
      document.body.appendChild(root);
      bindTourEvents();
      return;
    }

    if (tourState.tela === 'concluido') {
      root.innerHTML = renderTourFim();
      document.body.appendChild(root);
      bindTourEvents();
      return;
    }

    if (tourState.naoEncontrado) {
      root.innerHTML = renderTourNaoEncontrado();
      document.body.appendChild(root);
      bindTourEvents();
      return;
    }

    if (!tourState.elementoAtual) {
      root.innerHTML = renderTourAguardando();
      document.body.appendChild(root);
      bindTourEvents();
      return;
    }

    var rect = tourState.elementoAtual.getBoundingClientRect();
    var passo = tourState.tour.passos[tourState.indice];
    var total = tourState.tour.passos.length;
    var ultimo = tourState.indice === total - 1;
    var dots = [];
    for (var i = 0; i < total; i++) {
      dots.push('<span class="up-tour-dot' + (i === tourState.indice ? ' up-tour-dot-active' : '') + '"></span>');
    }

    var tooltipW = 300;
    var tooltipH = 200; // estimativa; reposicionado após medir o elemento real
    var pos = calcularPosicaoTooltip(rect, passo.tooltip_posicao || 'auto', tooltipW, tooltipH);

    root.innerHTML = [
      '<div class="up-tour-spotlight" style="top:' + (rect.top - 4) + 'px;left:' + (rect.left - 4) + 'px;width:' + (rect.width + 8) + 'px;height:' + (rect.height + 8) + 'px"></div>',
      '<div class="up-tour-tooltip" id="up-tour-tooltip-el" style="top:' + pos.top + 'px;left:' + pos.left + 'px">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="Pular tour">' + icon('close') + '</button>',
      '<p class="up-tour-progress">Passo ' + (tourState.indice + 1) + ' de ' + total + '</p>',
      '<p class="up-tour-title">' + escapeHtml(passo.titulo) + '</p>',
      passo.descricao ? '<p class="up-tour-desc">' + escapeHtml(passo.descricao) + '</p>' : '',
      // Passo configurado pra avançar por interação — avisa que clicar em
      // "Próximo" não é o único jeito de continuar (texto varia por modo, ver
      // tourHintTexto); Pular/Fechar continuam disponíveis no footer normal.
      tourHintTexto(passo) ? '<p class="up-tour-hint">' + tourHintTexto(passo) + '</p>' : '',
      '<div class="up-tour-dots" style="margin-top:10px">' + dots.join('') + '</div>',
      tourFooter(total, ultimo),
      '</div>',
    ].join('');

    document.body.appendChild(root);
    bindTourEvents();
    tourState.vigiaRootIndice = tourState.indice;

    // Reposiciona com a altura real do tooltip (a estimativa acima evita flash fora da tela)
    var tooltipEl = root.querySelector('#up-tour-tooltip-el');
    if (tooltipEl) {
      var realH = tooltipEl.offsetHeight;
      if (Math.abs(realH - tooltipH) > 4) {
        var pos2 = calcularPosicaoTooltip(rect, passo.tooltip_posicao || 'auto', tooltipW, realH);
        tooltipEl.style.top = pos2.top + 'px';
        tooltipEl.style.left = pos2.left + 'px';
      }
    }
  }

  function reposicionarTour() {
    if (!tourState.ativo || tourState.naoEncontrado || !tourState.elementoAtual) return;
    window.requestAnimationFrame(function () {
      if (!tourState.ativo || tourState.naoEncontrado || !tourState.elementoAtual) return;
      var passo = tourState.tour && tourState.tour.passos[tourState.indice];
      // Mesma lógica de tourRecomputarPosicaoAtual: scroll/resize só reposiciona
      // o spotlight/tooltip já em tela, sem recriar DOM nem reiniciar a
      // animação de entrada — só cai no renderTour() completo se o passo não
      // estiver mais no estado "normal" renderizado (ex.: DOM ainda não tinha
      // o passo montado por algum outro motivo).
      if (!passo || !tourAtualizarPosicaoDOM(tourState.elementoAtual.getBoundingClientRect(), passo)) renderTour();
    });
  }

  var tourReposHandlersBound = false;
  function bindTourReposHandlers() {
    if (tourReposHandlersBound) return;
    tourReposHandlersBound = true;
    window.addEventListener('scroll', reposicionarTour, true);
    window.addEventListener('resize', reposicionarTour);
  }
  function unbindTourReposHandlers() {
    if (!tourReposHandlersBound) return;
    tourReposHandlersBound = false;
    window.removeEventListener('scroll', reposicionarTour, true);
    window.removeEventListener('resize', reposicionarTour);
  }

  function tourKeydown(event) {
    if (event.key !== 'Escape') return;
    if (tourState.tela === 'intro') { tourIntroDispensar(); return; }
    if (tourState.tela === 'concluido') { finalizarTour('escape_tela_concluido'); return; }
    tourPular();
  }

  function bindTourEvents() {
    if (!tourState.root) return;
    tourState.root.addEventListener('click', function (event) {
      // Sem isso, o clique nos próprios botões do widget (Começar tour,
      // Próximo, Voltar etc.) borbulha até document/host — em hosts com
      // listener de clique global (ex.: roteador de SPA interceptando
      // cliques em document), isso podia disparar uma navegação real da
      // aplicação por baixo do overlay, derrubando tourState inteiro (tela
      // branca durante o reload) e fazendo o widget reavaliar do zero ao
      // reinicializar — reabrindo a introdução em vez de continuar no passo
      // já resolvido. Mesmo padrão já usado no click handler do widget de
      // campanhas (ver state.root acima). Só stopPropagation, sem
      // preventDefault incondicional: os botões individuais abaixo já
      // chamam preventDefault() quando fazem sentido, sem mudar nenhum
      // outro comportamento.
      event.stopPropagation();
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-up-tour-back]')) { event.preventDefault(); tourVoltar(); return; }
      if (target.closest('[data-up-tour-next]')) { event.preventDefault(); tourProximo(); return; }
      if (target.closest('[data-up-tour-finish]')) { event.preventDefault(); tourConcluir(); return; }
      if (target.closest('[data-up-tour-skip]')) { event.preventDefault(); tourPular(); return; }
      if (target.closest('[data-up-tour-skip-passo]')) { event.preventDefault(); tourPularPasso(); return; }
      if (target.closest('[data-up-tour-retry]')) { event.preventDefault(); tourTentarNovamente(); return; }
      if (target.closest('[data-up-tour-trocar-passo]')) { event.preventDefault(); tourTrocarPassoAtual(); return; }
      if (target.closest('[data-up-tour-intro-comecar]')) { event.preventDefault(); tourIntroComecar(); return; }
      if (target.closest('[data-up-tour-intro-dispensar]')) { event.preventDefault(); tourIntroDispensar(); return; }
      if (target.closest('[data-up-tour-intro-nunca-mais]')) { event.preventDefault(); tourPular(); return; }
      if (target.closest('[data-up-tour-fim-fechar]')) { event.preventDefault(); finalizarTour('usuario_fechou_tela_fim'); return; }
      var feedbackEl = target.closest('[data-up-tour-feedback]');
      if (feedbackEl) { event.preventDefault(); tourFeedback(feedbackEl.getAttribute('data-up-tour-feedback')); return; }
    });
  }

  // Avanço automático por interação com o próprio elemento destacado (além dos
  // botões Próximo/Voltar) — controlado por passo.modo_avanco_interacao.
  // "manual" (default) não liga listener nenhum: só o botão Próximo avança.
  // Os listeners nunca chamam preventDefault/stopPropagation — a interação
  // original da aplicação acontece normalmente, e só depois de um pequeno
  // delay o tour avança (ou conclui, no último passo).
  var TOUR_INTERACAO_DELAY_MS = 250;

  // ─── Retomada de tour após reload completo de página ──────────────────────
  // Um passo com acao_ao_avancar="clicar_elemento" ou modo_avanco_interacao
  // não-manual pode clicar num link real (ex.: item de menu de uma SPA) que
  // navega via reload de página inteira, não via pushState/SPA — nesse caso
  // TODO o estado em memória do tour (tourState) é perdido, e a proteção
  // suprimirAbandonoNavegacao (que só existe em memória) não ajuda em nada.
  // Por isso, além dela, salva uma "continuação" em sessionStorage bem antes
  // do clique acontecer — mesmo padrão já usado por RECORDER_STORAGE_KEY
  // (recorderPersistir) para sobreviver a reload de página. Se a navegação
  // era só SPA (sem reload), irParaPasso()/tourConcluir() já limpam essa
  // continuação normalmente no mesmo ciclo — ela só sobra em sessionStorage
  // pra ser lida de fato quando o reload de fato interrompeu o JS no meio.
  var TOUR_RESUME_STORAGE_KEY = 'userpulse:tour_resume:v1';
  // Generoso o bastante pra cobrir uma navegação/carregamento lento de SPA,
  // mas curto o bastante pra nunca retomar algo que o usuário claramente já
  // abandonou (aba fechada e reaberta bem depois, por exemplo).
  var TOUR_RESUME_EXPIRY_MS = 60000;

  // Identifica de forma única qual sessão de tour está ativa agora — usado
  // tanto pra decidir o que persistir (tourSalvarContinuacao) quanto, na
  // retomada, como reconstituir o mesmo tipo de sessão (ver
  // tourRetomarSeHouver). 'jornada' tem prioridade sobre só "preview" porque
  // uma prévia nunca tem jornadaContexto (mutuamente exclusivos por natureza:
  // jornadaContexto só é setado por jornadaEtapaClicar/iniciarTourPublico,
  // nunca por recorderIniciarPreview).
  function tourModoAtual() {
    if (tourState.jornadaContexto) return 'jornada';
    if (tourState.preview) return tourState.previewModoUsuarioFinal ? 'preview_usuario' : 'preview_revisao';
    return 'runtime';
  }

  // Persiste pra QUALQUER sessão de tour (runtime, jornada e também prévia do
  // gravador) — prévia usa tourInline (o tour montado em memória, sem slug
  // real) em vez de tourSlug, e guarda previewContexto (mapeamento de índice
  // usado por "Trocar elemento") pra restaurar a prévia coerentemente depois
  // de uma navegação/reload, em vez de deixar a barra/painel do gravador
  // (que tem sua própria persistência independente, sem noção de "estava numa
  // prévia") reaparecerem misturados com o que sobrou da prévia — ver
  // tourRetomarSeHouver.
  function tourSalvarContinuacao(indiceProximo, concluir) {
    if (!tourState.tour) return;
    try {
      var modo = tourModoAtual();
      window.sessionStorage.setItem(TOUR_RESUME_STORAGE_KEY, JSON.stringify({
        v: 1,
        modo: modo,
        tourSlug: tourState.tour.slug || null,
        tourInline: tourState.tour.slug ? null : tourState.tour,
        previewContexto: tourState.preview ? { previewIndices: recorderState.previewIndices || null } : null,
        indiceProximo: concluir ? null : indiceProximo,
        concluir: Boolean(concluir),
        jornadaContexto: tourState.jornadaContexto || null,
        savedAt: Date.now(),
        // 'pendente' até tourRetomarSeHouver() começar a processar essa
        // continuação (ver lá, onde vira 'retomando') — aqui é sempre uma
        // continuação nova, recém salva antes do clique arriscado acontecer.
        status: 'pendente',
      }));
    } catch (_e) { /* sessionStorage indisponível (modo privado, quota etc.) — sem retomada possível, sem quebrar nada */ }
  }

  function tourLimparContinuacao() {
    try {
      window.sessionStorage.removeItem(TOUR_RESUME_STORAGE_KEY);
    } catch (_e) {}
  }

  // Só pro caminho de navegação SPA (handleUrlChange) — diferente de
  // tourRetomarSeHouver() (que roda depois de um reload completo, sem
  // tourState vivo, e por isso precisa buscar o tour de novo), aqui o tour
  // JÁ está ativo em memória (o JS nunca foi destruído): pushState não mata
  // nada. Então em vez de reler/refetchar, só confirma que a continuação
  // salva em sessionStorage corresponde ao MESMO tour que já está rodando —
  // sinal de que essa navegação foi causada pelo próprio passo do tour
  // (usuário clicou direto no elemento destacado, sem passar por
  // tourProximo()/agendarAvancoInteracao(), que são os únicos lugares que
  // setam suprimirAbandonoNavegacao=true). Retorna null se não houver
  // correspondência válida (aí handleUrlChange trata como abandono de
  // verdade, igual antes).
  function tourContinuacaoValidaParaSpa() {
    if (!tourState.ativo || !tourState.tour) return null;
    var bruto;
    try { bruto = window.sessionStorage.getItem(TOUR_RESUME_STORAGE_KEY); } catch (_e) { return null; }
    if (!bruto) return null;
    var dados;
    try { dados = JSON.parse(bruto); } catch (_e) { return null; }
    if (!dados || typeof dados !== 'object' || !dados.savedAt || Date.now() - dados.savedAt > TOUR_RESUME_EXPIRY_MS) return null;
    if (dados.modo !== tourModoAtual()) return null;
    if (dados.modo === 'runtime' || dados.modo === 'jornada') {
      if (!dados.tourSlug || dados.tourSlug !== tourState.tour.slug) return null;
    } else if (!tourState.preview) {
      return null;
    }
    if (dados.concluir) return { concluir: true };
    var indice = dados.indiceProximo;
    if (typeof indice !== 'number' || indice < 0 || indice >= tourState.tour.passos.length) return null;
    return { concluir: false, indice: indice };
  }

  // Garante jornadaState.jornadas carregado antes de concluir um tour retomado
  // vinculado a uma etapa de Jornada — depois de um reload completo essa lista
  // está vazia (só é populada quando o usuário abre o painel da Central via
  // abrirJornadasPublico()), e sem isso jornadaMarcarConcluida() não acharia a
  // jornada/bloco/etapa pra marcar. Sempre busca de novo (não confia em
  // jornadaState.jornadas já ter algo) — é um caminho raro, correção importa
  // mais que evitar uma requisição extra aqui.
  function jornadaCarregarParaResumo(callback) {
    var config = state.config;
    if (!config) { callback(); return; }
    var contexto = resolveContexto();
    fetchJornadas(config.sistema, config.tela, config.usuario_id, contexto).then(function (jornadas) {
      jornadaState.jornadas = (jornadas || []).map(function (j) {
        j._concluidaRegistrada = Boolean(j.progresso && j.progresso.concluida);
        return j;
      });
      callback();
    }).catch(function () { callback(); });
  }

  // Tenta buscar o tour por slug com backoff até o prazo (mesmo prazo de
  // expiração da sessão de retomada, dados.savedAt + TOUR_RESUME_EXPIRY_MS)
  // se esgotar — logo após um reload, a rede/API pode não estar pronta no 1º
  // instante; uma falha isolada aqui não pode custar a retomada inteira (ver
  // "manter sessão e tentar novamente até expirar" / "nunca sumir
  // silenciosamente"). Antes desistia depois de só 4 tentativas (~1.4s no
  // total) — bem antes da sessão realmente expirar.
  function fetchTourComRetry(slug, tentativa, callback, prazoLimite) {
    fetchTour(slug).then(function (tour) {
      if (tour) { callback(tour); return; }
      if (Date.now() >= prazoLimite) { callback(null); return; }
      window.setTimeout(function () { fetchTourComRetry(slug, tentativa + 1, callback, prazoLimite); }, tourIntervaloRetry(tentativa));
    }).catch(function () {
      if (Date.now() >= prazoLimite) { callback(null); return; }
      window.setTimeout(function () { fetchTourComRetry(slug, tentativa + 1, callback, prazoLimite); }, tourIntervaloRetry(tentativa));
    });
  }

  // Chamado no início de init(), antes de avaliar campanha/tour automático
  // (pra evitar disputa por iniciar/abrir algo ao mesmo tempo — ver chamada
  // em init()). callback() sempre é chamado, com ou sem retomada bem-sucedida.
  //
  // Importante: NÃO apaga a continuação ao ler — só marca status='retomando'
  // e regrava. Se outro reload/navegação interromper antes do próximo passo
  // resolver (achado, fallback "não encontrado", concluído ou encerrado), a
  // MESMA continuação sobrevive pra essa próxima carga tentar de novo, em vez
  // de se perder pra sempre logo na 1ª tentativa. A limpeza de fato só
  // acontece nos pontos que representam um desses desfechos reais:
  // irParaPasso() (achou ou "não encontrado"), tourConcluir(), finalizarTour()
  // — e aqui mesmo, só nos casos de dado irrecuperável (expirado, corrompido,
  // sem tour pra retomar, índice inválido).
  function tourRetomarSeHouver(callback) {
    var bruto;
    try { bruto = window.sessionStorage.getItem(TOUR_RESUME_STORAGE_KEY); } catch (_e) { callback(); return; }
    if (!bruto) { callback(); return; }
    var dados;
    try { dados = JSON.parse(bruto); } catch (_e) { tourLimparContinuacao(); callback(); return; }
    if (!dados || typeof dados !== 'object' || !dados.savedAt || Date.now() - dados.savedAt > TOUR_RESUME_EXPIRY_MS) {
      tourLimparContinuacao();
      callback();
      return;
    }
    var modo = dados.modo || (dados.tourSlug ? 'runtime' : null);
    var jornadaContexto = dados.jornadaContexto || null;

    // Prévia do gravador (usuário final ou revisão) — tour vem inline
    // (tourInline), nunca por slug. Sempre esconde barra/painel do gravador
    // antes de retomar: recorderRetomarDeSessao() (chamado antes, em
    // iniciarGravadorSeNecessario) não tem noção de "estava numa prévia" e
    // pode ter acabado de reexibi-los — sem isso, ficariam misturados com a
    // prévia retomada (mesmo critério de recorderIniciarPreview, que já
    // esconde os dois ao iniciar/retomar qualquer prévia).
    if (modo === 'preview_usuario' || modo === 'preview_revisao') {
      var tourPreview = dados.tourInline;
      if (!tourPreview || !tourPreview.passos || tourPreview.passos.length === 0) { tourLimparContinuacao(); callback(); return; }
      var barPreview = document.getElementById(RECORDER_BAR_ID);
      if (barPreview) barPreview.style.display = 'none';
      recorderFecharPainelLateral();
      if (dados.previewContexto && dados.previewContexto.previewIndices) {
        recorderState.previewIndices = dados.previewContexto.previewIndices;
      }
      dados.status = 'retomando';
      try { window.sessionStorage.setItem(TOUR_RESUME_STORAGE_KEY, JSON.stringify(dados)); } catch (_e) {}
      if (dados.concluir) {
        finalizarTour('retomada_preview_concluir');
        tourState.tour = tourPreview;
        tourState.ativo = true;
        tourState.preview = true;
        tourState.previewModoUsuarioFinal = modo === 'preview_usuario';
        tourState.indice = tourPreview.passos.length - 1;
        tourConcluir();
        callback();
        return;
      }
      var indicePreview = dados.indiceProximo;
      if (typeof indicePreview !== 'number' || indicePreview < 0 || indicePreview >= tourPreview.passos.length) {
        tourLimparContinuacao();
        callback();
        return;
      }
      iniciarTour(tourPreview, true, true, modo === 'preview_usuario', null, indicePreview, true);
      callback();
      return;
    }

    if (!dados.tourSlug) { tourLimparContinuacao(); callback(); return; }

    dados.status = 'retomando';
    try { window.sessionStorage.setItem(TOUR_RESUME_STORAGE_KEY, JSON.stringify(dados)); } catch (_e) {}

    function prosseguir(tour) {
      if (!tour || !tour.passos || tour.passos.length === 0) { tourLimparContinuacao(); callback(); return; }
      if (dados.concluir) {
        // Monta só o mínimo de tourState necessário e vai direto pra
        // tourConcluir() — passar por iniciarTour()+irParaPasso() aqui só
        // pra descartar o resultado logo em seguida renderizaria o último
        // passo destacado por um instante à toa antes da tela de conclusão.
        // tourConcluir() já limpa a continuação (ver sua implementação).
        finalizarTour('retomada_apos_reload_concluir');
        tourState.tour = tour;
        tourState.ativo = true;
        tourState.indice = tour.passos.length - 1;
        tourState.jornadaContexto = jornadaContexto;
        tourConcluir();
        callback();
        return;
      }
      var indice = dados.indiceProximo;
      if (typeof indice !== 'number' || indice < 0 || indice >= tour.passos.length) { tourLimparContinuacao(); callback(); return; }
      // iniciarTour()->irParaPasso() limpa a continuação assim que o passo
      // resolver (achado ou "não encontrado") — não antes. preservarContinuacao=
      // true impede que a própria chamada a finalizarTour() dentro de
      // iniciarTour() (limpeza de um tour anterior, se houver) apague a sessão
      // prematuramente, antes desse desfecho real acontecer.
      iniciarTour(tour, true, false, false, jornadaContexto, indice, true);
      callback();
    }

    function comTourResolvido(tour) {
      // jornadaContexto presente vale tanto pro caso "concluir" quanto pro
      // caso "retomou no meio e vai concluir mais adiante, sem outro reload"
      // — nos dois, jornadaState.jornadas precisa estar carregado quando
      // tourConcluir() rodar, seja agora ou mais tarde.
      if (jornadaContexto) {
        jornadaCarregarParaResumo(function () { prosseguir(tour); });
      } else {
        prosseguir(tour);
      }
    }

    fetchTourComRetry(dados.tourSlug, 0, function (tour) {
      if (!tour) {
        // Esgotou o prazo (até a expiração da própria sessão) sem conseguir
        // buscar o tour — desfecho real, mas não "sumir silenciosamente":
        // mostra o mesmo fallback de erro genérico antes de limpar. tourPular()/
        // tourPularPasso() (únicos botões desse fallback) já lidam com
        // tourState.tour ainda null com segurança.
        tourState.ativo = true;
        tourState.tour = null;
        renderTourErroFallback();
        tourLimparContinuacao();
        callback();
        return;
      }
      comTourResolvido(tour);
    }, dados.savedAt + TOUR_RESUME_EXPIRY_MS);
  }

  function isEditableTarget(el) {
    if (!el) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (el.closest) {
      try {
        return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
      } catch (_e) {
        return false;
      }
    }
    return false;
  }

  // Combobox/listbox (autocompletes custom) — clicar neles normalmente só abre
  // a lista; não deve contar como "clicou para avançar" no modo ao_clicar.
  function isComboboxTarget(el) {
    if (!el) return false;
    try {
      var role = el.getAttribute && el.getAttribute('role');
      if (role === 'combobox' || role === 'listbox') return true;
      if (el.closest) return Boolean(el.closest('[role="combobox"],[role="listbox"]'));
    } catch (_e) {}
    return false;
  }

  function valorPreenchido(el) {
    if (!el) return false;
    if (el.value !== undefined) return String(el.value).trim() !== '';
    var texto = el.textContent;
    return Boolean(texto && texto.trim());
  }

  // Cancela o listener/observador de interação do passo atual e qualquer
  // avanço já agendado por ele. Chamado sempre que o passo muda (irParaPasso,
  // inclusive via Voltar) ou o tour termina — sem isso, um listener/timer
  // "zumbi" do passo anterior podia disparar um avanço fora de hora.
  function limparInteracao() {
    if (tourState.interacaoCleanup) {
      tourState.interacaoCleanup();
      tourState.interacaoCleanup = null;
    }
    if (tourState.interacaoTimer) {
      window.clearTimeout(tourState.interacaoTimer);
      tourState.interacaoTimer = null;
    }
  }

  // Avanço agendado pelo botão Próximo quando o passo usa acao_ao_avancar =
  // "clicar_elemento" (ver tourProximo). Mesmo motivo de limpeza do timer
  // acima: sem cancelar ao trocar de passo/encerrar o tour, um "Próximo"
  // clicado logo antes de Voltar/Pular/Concluir podia disparar o avanço
  // agendado depois, no passo errado.
  var TOUR_NEXT_CLICK_DELAY_MS = 250;

  function limparNextClickTimer() {
    if (tourState.nextClickTimer) {
      window.clearTimeout(tourState.nextClickTimer);
      tourState.nextClickTimer = null;
    }
  }

  // Espera até esse tanto por um popstate (ver tourVoltarNavegar/history.back())
  // antes de desistir de navegar e tentar localizar o passo anterior na
  // própria página atual mesmo assim — cobre o caso raro de não haver
  // entrada anterior no histórico (ou a SPA ignorar o evento). Não é uma
  // espera pelo ELEMENTO aparecer (localizarComRetry, chamado depois, já tem
  // seu próprio backoff de até ~18s pra isso) — só pela navegação em si
  // começar a acontecer.
  var TOUR_VOLTAR_FALLBACK_MS = 1500;

  function limparVoltarFallback() {
    if (tourState.voltarFallbackTimer) {
      window.clearTimeout(tourState.voltarFallbackTimer);
      tourState.voltarFallbackTimer = null;
    }
  }

  // Agenda o avanço do passo atual — usado por todos os modos de
  // modo_avanco_interacao. Vai direto para irParaPasso/tourConcluir (não passa
  // por tourProximo) porque o usuário já completou a interação real com o
  // elemento; se passasse por tourProximo, um passo com acao_ao_avancar =
  // "clicar_elemento" acabaria disparando um SEGUNDO clique sintético
  // desnecessário em cima da interação que o próprio usuário acabou de fazer.
  // reagendar=true reinicia a contagem a cada chamada (debounce de verdade) —
  // usado por "input" em ao_alterar_valor, pra não avançar no meio da digitação.
  // Sem reagendar (default), só a primeira chamada agenda; chamadas seguintes
  // enquanto já há um avanço pendente são ignoradas (clique/change/poll disparam
  // uma vez só, não precisam reiniciar a contagem).
  function agendarAvancoInteracao(el, reagendar) {
    if (tourState.interacaoTimer) {
      if (!reagendar) return;
      window.clearTimeout(tourState.interacaoTimer);
    }
    // A interação que dispara esse avanço (ex.: modo_avanco_interacao =
    // "ao_clicar") pode navegar de tela, igual ao clique sintético de
    // tourProximo() — mesma proteção contra handleUrlChange() encerrar o tour
    // no meio da transição (ver comentário na declaração de tourState), e
    // mesma continuação salva em sessionStorage pro caso de reload completo
    // de página (ver tourSalvarContinuacao).
    tourState.suprimirAbandonoNavegacao = true;
    var ultimoAoAgendar = tourState.indice === tourState.tour.passos.length - 1;
    tourSalvarContinuacao(ultimoAoAgendar ? null : tourState.indice + 1, ultimoAoAgendar);
    tourState.interacaoTimer = window.setTimeout(function () {
      tourState.interacaoTimer = null;
      if (!tourState.ativo || tourState.elementoAtual !== el) { tourState.suprimirAbandonoNavegacao = false; return; }
      // Blindagem: mesmo motivo de irParaPasso()/renderTour() — uma exceção
      // aqui não pode deixar o tour num estado sem overlay e sem fallback.
      try {
        var ultimo = tourState.indice === tourState.tour.passos.length - 1;
        if (ultimo) tourConcluir(); else irParaPasso(tourState.indice + 1);
      } catch (erro) {
        renderTourErroFallback();
      }
    }, TOUR_INTERACAO_DELAY_MS);
  }

  // Liga o listener/observador correspondente a passo.modo_avanco_interacao no
  // elemento do passo atual. Guarda em tourState.interacaoCleanup a função que
  // desfaz o que foi ligado — limparInteracao() chama isso ao trocar de passo.
  function bindInteracao(el, passo) {
    var modo = passo.modo_avanco_interacao || 'manual';

    if (modo === 'ao_clicar') {
      if (isEditableTarget(el) || isComboboxTarget(el)) return; // não faz sentido nesses elementos — ver ao_alterar_valor
      var handlerClique = function (event) {
        if (isEditableTarget(event.target) || isComboboxTarget(event.target)) return;
        agendarAvancoInteracao(el);
      };
      el.addEventListener('click', handlerClique);
      tourState.interacaoCleanup = function () {
        el.removeEventListener('click', handlerClique);
      };
      return;
    }

    if (modo === 'ao_alterar_valor') {
      // "change" (seleção confirmada/blur) sempre avança; "input" só avança
      // quando já há valor preenchido, para não disparar a cada tecla digitada
      // antes do usuário terminar.
      var handlerValor = function (event) {
        if (event.type === 'change') { agendarAvancoInteracao(el); return; }
        // "input" dispara a cada tecla — reagenda (debounce) pra só avançar
        // quando o usuário parar de digitar com o campo preenchido. Se o campo
        // voltar a ficar vazio (ex.: apagou tudo), cancela o avanço pendente.
        if (valorPreenchido(event.target)) {
          agendarAvancoInteracao(el, true);
        } else if (tourState.interacaoTimer) {
          window.clearTimeout(tourState.interacaoTimer);
          tourState.interacaoTimer = null;
        }
      };
      el.addEventListener('input', handlerValor);
      el.addEventListener('change', handlerValor);
      tourState.interacaoCleanup = function () {
        el.removeEventListener('input', handlerValor);
        el.removeEventListener('change', handlerValor);
      };
      return;
    }

    if (modo === 'ao_aparecer_elemento') {
      var seletorAparecer = passo.seletor_confirmacao;
      if (!seletorAparecer) return; // sem seletor configurado — só o botão Próximo avança
      var pollAparecer = window.setInterval(function () {
        var encontrado;
        try { encontrado = document.querySelector(seletorAparecer); } catch (_e) { encontrado = null; }
        if (encontrado) agendarAvancoInteracao(el);
      }, TOUR_RETRY_INTERVAL_MS);
      tourState.interacaoCleanup = function () {
        window.clearInterval(pollAparecer);
      };
      return;
    }

    if (modo === 'ao_sumir_elemento') {
      var seletorSumir = passo.seletor_confirmacao;
      if (!seletorSumir) return; // sem seletor configurado — só o botão Próximo avança
      var jaViuElemento = false;
      var pollSumir = window.setInterval(function () {
        var existe;
        try { existe = Boolean(document.querySelector(seletorSumir)); } catch (_e) { existe = false; }
        if (existe) { jaViuElemento = true; return; }
        if (jaViuElemento) agendarAvancoInteracao(el);
      }, TOUR_RETRY_INTERVAL_MS);
      tourState.interacaoCleanup = function () {
        window.clearInterval(pollSumir);
      };
      return;
    }

    // modo === 'manual' (ou desconhecido/legado) — nenhum listener; só o botão
    // Próximo avança este passo.
  }

  function irParaPasso(indice) {
    limparBuscaTimer();
    limparInteracao();
    limparNextClickTimer();
    limparVoltarFallback();
    // Cancela a vigilância de reposicionamento do passo anterior (se havia)
    // ANTES de resolver o novo — nunca reaproveita observer/listener/timer
    // (nem, por consequência, rect/target visual) de um passo que já ficou
    // pra trás.
    tourLimparVigiaPosicionamento();
    tourState.indice = indice;
    tourState.naoEncontrado = false;
    tourState.elementoAtual = null;
    // Registra em que URL este passo está sendo buscado AGORA — usado só por
    // tourVoltar() num passo futuro, pra saber se precisa navegar de volta
    // pra cá. Sobrescreve sempre (não só na primeira vez): se o passo for
    // revisitado numa URL diferente da anterior, a mais recente é a correta.
    try { tourState.urlPorPasso[indice] = window.location.href; } catch (_e) {}

    var passo = tourState.tour.passos[indice];
    if (!passo) { finalizarTour('passo_invalido_no_indice_' + indice); return; }

    localizarComRetry(passo, 0, function (el) {
      // A partir daqui o próximo passo já foi resolvido (achado ou "não
      // encontrado") — a navegação que o clique sintético de tourProximo()
      // possa ter causado já cumpriu seu papel, então navegações daqui pra
      // frente voltam a ser um sinal normal de abandono do tour. Isso só roda
      // se NÃO houve reload de página no meio (senão o JS teria sido
      // interrompido antes de chegar aqui) — ou seja, a continuação salva
      // antes do clique não foi necessária e pode ser descartada.
      tourState.suprimirAbandonoNavegacao = false;
      tourState.avancoResolvidoEm = Date.now();
      tourLimparContinuacao();
      if (!tourState.ativo) return; // tour foi encerrado enquanto buscava
      if (debugState.enabled) {
        debugLog('Tour — passo ' + indice, {
          seletor_tipo: passo.seletor_tipo || 'data_cy',
          seletor: passo.seletor,
          status: el ? 'encontrado_e_visivel' : debugStatusSeletorPasso(passo),
        });
      }
      // Blindagem: qualquer exceção daqui em diante (bindInteracao, DOM do
      // host se comportando de forma inesperada etc.) não pode deixar o tour
      // travado num estado sem overlay — cai no mesmo fallback de erro que
      // renderTour() usa pra falhas na própria renderização.
      try {
        if (!el) {
          tourState.naoEncontrado = true;
          registrarEventoTour('elemento_nao_encontrado', indice);
          renderTour();
          return;
        }
        tourState.elementoAtual = el;
        bindInteracao(el, passo);
        registrarEventoTour('passo_visualizado', indice);
        // Salva a continuação preventivamente, assim que o passo é destacado
        // com sucesso — ANTES de qualquer clique acontecer, e sem depender de
        // nenhum handler de clique/interação. O elemento destacado costuma
        // ser um link/botão real do host: se o usuário clicar nele
        // diretamente (em vez de "Próximo", e mesmo sem modo_avanco_interacao
        // configurado), o navegador navega e nosso JS nunca chega a rodar
        // tourProximo()/agendarAvancoInteracao() — sem isso, a continuação
        // nunca seria salva a tempo do reload/navegação acontecer. Os pontos
        // que já salvam no clique (tourProximo/agendarAvancoInteracao)
        // continuam existindo — eles reescrevem savedAt mais perto do
        // clique de verdade, então essa cópia preventiva não precisa cobrir
        // uma janela de expiração maior do que já é (TOUR_RESUME_EXPIRY_MS).
        var totalPassosAtual = tourState.tour.passos.length;
        var ultimoPassoAtual = indice === totalPassosAtual - 1;
        tourSalvarContinuacao(ultimoPassoAtual ? null : indice + 1, ultimoPassoAtual);
        // Rola até o elemento só se necessário e estabiliza o highlight com
        // rechecagens curtas (rAF + timeouts) em vez de um delay fixo — evita
        // desenhar spotlight/tooltip com o rect capturado antes do
        // scroll/reflow terminar de assentar. A própria vigilância já
        // dispara o primeiro render real (via rAF), então não precisa de
        // outra chamada de renderTour() aqui (ver tourIniciarVigiaPosicionamento).
        tourIniciarVigiaPosicionamento(el);
      } catch (erro) {
        renderTourErroFallback();
      }
    });
  }

  // Botão "Próximo": por padrão só avança (acao_ao_avancar = "apenas_avancar").
  // Se o passo estiver configurado com "clicar_elemento", primeiro dispara um
  // clique real no elemento destacado (sem preventDefault/stopPropagation —
  // o clique se comporta como se o próprio usuário tivesse clicado) e só
  // avança depois de um pequeno delay, dando tempo do host reagir ao clique
  // (abrir painel, navegar, etc.) antes do próximo passo tentar localizar seu
  // elemento. Não clica em campos editáveis, e um clique agendado pendente
  // bloqueia novos cliques em "Próximo" (evita duplo clique disparando dois
  // cliques no elemento).
  function tourProximo() {
    if (tourState.nextClickTimer) return;
    var total = tourState.tour.passos.length;
    if (tourState.indice >= total - 1) return;
    var indiceProximo = tourState.indice + 1;

    // Passo atual sem elemento localizado ("Elemento não encontrado") — avança
    // direto pro próximo passo, sem clicar em nada e sem depender de
    // acao_ao_avancar/modo_avanco_interacao (não há elemento real pra clicar
    // ou observar). Explícito aqui em vez de confiar em tourState.elementoAtual
    // ser null nesse estado — protege esse comportamento de mudanças futuras.
    if (tourState.naoEncontrado) { irParaPasso(indiceProximo); return; }

    var passo = tourState.tour.passos[tourState.indice];
    var el = tourState.elementoAtual;

    if (passo && passo.acao_ao_avancar === 'clicar_elemento' && el && !isEditableTarget(el)) {
      // O elemento pode ter listener/observador de modo_avanco_interacao ligado
      // (ex.: ao_clicar); remove antes do clique sintético para não agendar um
      // segundo avanço concorrente a partir do mesmo clique.
      limparInteracao();
      // Esse clique pode navegar de tela — suprime o auto-encerramento do
      // tour por navegação (handleUrlChange) até irParaPasso() resolver o
      // próximo passo (ver comentário na declaração de tourState acima), e
      // salva uma continuação em sessionStorage pro caso de ser um reload
      // completo de página, não apenas SPA (ver tourSalvarContinuacao).
      tourState.suprimirAbandonoNavegacao = true;
      tourSalvarContinuacao(indiceProximo, false);
      try { el.click(); } catch (_e) {}
      tourState.nextClickTimer = window.setTimeout(function () {
        tourState.nextClickTimer = null;
        if (!tourState.ativo) return;
        try {
          irParaPasso(indiceProximo);
        } catch (erro) {
          renderTourErroFallback();
        }
      }, TOUR_NEXT_CLICK_DELAY_MS);
      return;
    }

    irParaPasso(indiceProximo);
  }

  // Tour multipágina: o passo anterior pode ter sido encontrado numa URL
  // diferente da atual (ver gravação em irParaPasso). Nesse caso, só voltar
  // o índice (comportamento antigo) não adianta — o seletor não existe na
  // página atual. Se soubermos a URL de lá, navega pra ela primeiro (ver
  // tourVoltarNavegar); sem URL conhecida ou na mesma página, comportamento
  // idêntico a antes desta função existir.
  function tourVoltar() {
    if (tourState.indice <= 0) return;
    var indiceAlvo = tourState.indice - 1;
    var urlRegistrada = tourState.urlPorPasso[indiceAlvo] || null;
    var urlAtual = window.location.href;
    var precisaNavegar = Boolean(urlRegistrada) && urlRegistrada !== urlAtual;

    if (debugState.enabled) {
      debugLog('Tour — clique em Voltar', {
        passo_atual: tourState.indice,
        passo_anterior: indiceAlvo,
        url_atual: debugStatusUrl(),
        url_esperada_passo_anterior: urlRegistrada,
        vai_navegar: precisaNavegar,
      });
    }

    if (!precisaNavegar) {
      irParaPasso(indiceAlvo);
      return;
    }
    tourVoltarNavegar(indiceAlvo);
  }

  // Navega de volta pra URL onde o passo indiceAlvo foi encontrado da última
  // vez, e só então tenta localizá-lo — reaproveita o MESMO mecanismo já
  // usado pra sobreviver à navegação de "Próximo" (tourSalvarContinuacao +
  // tourContinuacaoValidaParaSpa, consumida em handleUrlChange), só que
  // apontando pra um índice ANTERIOR em vez do próximo. history.back() (não
  // pushState/location.href) de propósito: é a única forma de "desfazer"
  // uma navegação que funciona igual não importa o roteador (React
  // Router/Angular/etc. todos reagem a popstate, é o próprio botão Voltar
  // do navegador) e nunca cria entrada nova no histórico.
  function tourVoltarNavegar(indiceAlvo) {
    // Já há uma navegação de Voltar em andamento — ignora cliques extras em
    // vez de empilhar múltiplos history.back() (cada um voltaria uma entrada
    // a mais do que o pretendido).
    if (tourState.voltarFallbackTimer) return;

    // Garante que a flag está limpa (não deveria haver nenhuma navegação de
    // avanço pendente nesse momento, mas se houver, uma sobra de
    // suprimirAbandonoNavegacao=true faria handleUrlChange pular o bloco
    // inteiro — inclusive a retomada via tourContinuacaoValidaParaSpa que
    // acabamos de agendar abaixo).
    tourState.suprimirAbandonoNavegacao = false;
    tourSalvarContinuacao(indiceAlvo, false);

    try {
      window.history.back();
    } catch (_e) {
      // Ambiente sem history navegável (raríssimo) — desiste de navegar e
      // cai no fallback de sempre (busca na página atual).
      tourLimparContinuacao();
      irParaPasso(indiceAlvo);
      return;
    }

    // Fallback: se popstate não disparar (sem entrada anterior no
    // histórico) ou handleUrlChange não resolver por qualquer outro motivo
    // dentro do prazo, desiste de esperar e tenta localizar o passo na
    // página em que estivermos agora mesmo — nunca fica travado esperando
    // indefinidamente, e nunca vira um loop (é um timer único, não
    // reagendado por si mesmo).
    tourState.voltarFallbackTimer = window.setTimeout(function () {
      tourState.voltarFallbackTimer = null;
      if (!tourState.ativo) return; // usuário fechou/pulou o tour enquanto esperava — não reabre sozinho
      if (tourState.indice === indiceAlvo) return; // handleUrlChange já resolveu
      if (debugState.enabled) {
        debugLog('Tour — Voltar: navegação não ocorreu a tempo, buscando na página atual', {
          passo_anterior: indiceAlvo,
          url_atual: debugStatusUrl(),
        });
      }
      tourLimparContinuacao();
      irParaPasso(indiceAlvo);
    }, TOUR_VOLTAR_FALLBACK_MS);
  }

  function tourPular() {
    registrarEventoTour('pulado', tourState.indice);
    if (tourState.tour && (!state.config || !state.config.usuario_id)) tourMarkShown(tourState.tour);
    finalizarTour('usuario_pulou');
  }

  // "Pular este passo" no estado de elemento não encontrado — avança para o
  // próximo passo (ou conclui, se for o último) sem encerrar o tour inteiro
  // como tourPular() faz. Não passa por tourProximo() porque não há elemento
  // real nesse estado para os fluxos de acao_ao_avancar/clique sintético.
  function tourPularPasso() {
    // Sem tour carregado (fallback de "não foi possível retomar", exibido
    // quando fetchTourComRetry esgota o prazo em tourRetomarSeHouver) não há
    // passo nenhum pra pular ou concluir — só encerra.
    if (!tourState.tour) { finalizarTour('tour_nao_carregado'); return; }
    var total = tourState.tour.passos.length;
    if (tourState.indice >= total - 1) { tourConcluir(); return; }
    irParaPasso(tourState.indice + 1);
  }

  // "Tentar novamente" no estado de elemento não encontrado — repete a busca
  // do passo atual do zero (mesmo fluxo/retries de irParaPasso), sem avançar
  // índice. Útil quando o host revela o elemento depois (painel que abre,
  // navegação manual do usuário até a tela certa etc.).
  function tourTentarNovamente() {
    irParaPasso(tourState.indice);
  }

  // "Trocar elemento deste passo", só disponível no estado "elemento não
  // encontrado" durante uma prévia do gravador (ver tourState.preview e
  // recorderPreVisualizarTour) — nunca aparece no tour real (renderTourNaoEncontrado
  // só inclui o botão quando tourState.preview é true). Fecha a prévia
  // (finalizarTour() já restaura a barra/painel do gravador, escondidos
  // durante a prévia — ver recorderRestaurarAposPreview) e entra direto no
  // fluxo de "Trocar" do passo que falhou, com origem 'painel-lateral' — ao
  // confirmar um novo seletor, recorderFinalizarTrocaElemento() volta pro
  // painel lateral com esse mesmo passo selecionado, sem abrir revisão final
  // nem gerar JSON (mesma garantia já validada pro fluxo normal de Trocar).
  function tourTrocarPassoAtual() {
    if (!tourState.preview) return;
    // tourState.indice é o índice DENTRO do tour temporário da prévia (0, 1,
    // 2… ou sempre 0 numa prévia de "Testar passo", já que só tem 1 item) —
    // recorderState.previewIndices traduz de volta pro índice real em
    // recorderState.passos (ver recorderIniciarPreview).
    var indices = recorderState.previewIndices;
    var indiceReal = (indices && indices[tourState.indice] != null) ? indices[tourState.indice] : tourState.indice;
    finalizarTour('trocar_elemento_previa');
    recorderIniciarTrocaElemento(indiceReal, 'painel-lateral');
  }

  function limparFimTimer() {
    if (tourState.fimTimer) {
      window.clearTimeout(tourState.fimTimer);
      tourState.fimTimer = null;
    }
  }

  // Feedback da tela final — mostra um "obrigado" rápido e fecha sozinho.
  // Registrado como evento 'feedback_tour' (ver registrarEventoTour), com o
  // valor/label/emoji escolhidos dentro de contexto (EventoTour.contexto já é
  // Json? livre no schema — nenhuma migration nova). Mesmos guards de
  // registrarEventoTour se aplicam sozinhos aqui (nunca em preview, nunca sem
  // tour/config, nunca quebra a experiência se a chamada falhar).
  var TOUR_FEEDBACK_AUTOFECHAR_MS = 1400;

  var TOUR_FEEDBACK_INFO = {
    nao_ajudou: { label: 'Não ajudou', emoji: '😕' },
    ajudou: { label: 'Ajudou', emoji: '🙂' },
    muito_util: { label: 'Muito útil', emoji: '🤩' },
  };

  function tourFeedback(valor) {
    if (!valor) return;
    // Guarda contra clique duplicado/repetido no mesmo fim de tour — os
    // botões de feedback já somem da tela assim que feedbackEscolhido vira
    // truthy (ver renderTourFim), mas essa checagem evita reenviar o evento
    // mesmo numa chamada dupla que chegue aqui antes do próximo render.
    if (tourState.feedbackEscolhido) return;
    tourState.feedbackEscolhido = valor;
    var info = TOUR_FEEDBACK_INFO[valor] || {};
    registrarEventoTour('feedback_tour', tourState.indice, {
      feedback_valor: valor,
      feedback_label: info.label || valor,
      feedback_emoji: info.emoji || null,
    });
    renderTour();
    limparFimTimer();
    tourState.fimTimer = window.setTimeout(finalizarTour, TOUR_FEEDBACK_AUTOFECHAR_MS);
  }

  // ─── Helpers de teste (harness/vm) ─────────────────────────────────────
  // Nunca usados em produção — existem só pra widgetTourFeedback.test.ts,
  // widgetTourVoltar.test.ts e widgetRecorderPause.test.ts montarem cenário
  // e inspecionarem resultado sem depender de window.UserPulse._internal.
  // tourState (removido de propósito: expunha o objeto inteiro por
  // referência — tour/passos, aparencia, urlPorPasso etc. — pro domínio do
  // cliente conseguir ler E alterar). Cada helper abaixo só lê/escreve um
  // subconjunto mínimo e nomeado; nenhum devolve tourState.tour/aparencia
  // inteiros, config/contexto do host, nem o objeto tourState em si.

  // Snapshot mínimo (mesmo padrão de recorderGetTestSnapshot) — nunca
  // tourState/config/contexto/tour/passos inteiros, só o suficiente pra
  // validar feedback final e a decisão de tourVoltar.
  function tourGetTestSnapshot() {
    return {
      ativo: tourState.ativo,
      preview: tourState.preview,
      feedbackEscolhido: tourState.feedbackEscolhido,
      indice: tourState.indice,
      voltarFallbackTimerAtivo: tourState.voltarFallbackTimer != null,
    };
  }

  // Snapshot derivado do tour ativo — só titulo/contagem/seletorTipos (nunca
  // seletor de verdade, id, descrição ou o array de passos em si). Usado só
  // por widgetRecorderPause.test.ts pra validar que iniciarPreviewSeNecessario
  // montou o tour temporário certo a partir dos passos colados.
  function tourGetTestStepSnapshot() {
    var passos = (tourState.tour && tourState.tour.passos) || [];
    return {
      tourTitulo: tourState.tour ? tourState.tour.titulo : null,
      totalPassos: passos.length,
      seletorTipos: passos.map(function (p) { return p.seletor_tipo; }),
    };
  }

  // Campos que o setter de teste abaixo tem permissão de escrever — lista
  // fechada de propósito: nunca deixa um teste (ou script no domínio do
  // cliente, já que isso só existe pra harness mesmo) injetar campo
  // arbitrário em tourState por essa via.
  var TOUR_TEST_STATE_CAMPOS_PERMITIDOS = ['ativo', 'tour', 'indice', 'tela', 'feedbackEscolhido', 'preview', 'urlPorPasso'];

  // Setter controlado pra montar cenário de teste (ex.: "tour ativo, no
  // passo 1, tela final") sem expor tourState por referência — copia só os
  // campos da lista acima, nunca o objeto inteiro nem aceita chave fora dela.
  function tourSetTestState(parcial) {
    if (!parcial) return;
    for (var i = 0; i < TOUR_TEST_STATE_CAMPOS_PERMITIDOS.length; i++) {
      var campo = TOUR_TEST_STATE_CAMPOS_PERMITIDOS[i];
      if (Object.prototype.hasOwnProperty.call(parcial, campo)) tourState[campo] = parcial[campo];
    }
  }

  // Devolve só o listener de clique religado por bindTourEvents no root
  // atual (chamado depois de renderTour()) — usado pra simular um clique
  // real no botão de feedback sem expor tourState.root (ou qualquer outro
  // campo) em _internal. `.listeners` é uma propriedade do elemento FAKE
  // usado só pelo harness de teste (vm) — um DOM real não tem isso, então
  // este helper nunca resolve nada fora do harness.
  function tourGetTestClickListener() {
    var root = tourState.root;
    return (root && root.listeners && root.listeners.click && root.listeners.click[0]) || null;
  }

  // Ao concluir o último passo, mostra a tela final (com feedback opcional)
  // em vez de encerrar na hora — finalizarTour() só roda quando o usuário
  // fecha essa tela (botão fechar, Esc ou o auto-fechar após o feedback).
  function tourConcluir() {
    registrarEventoTour('concluido', tourState.indice);
    if (tourState.tour && (!state.config || !state.config.usuario_id)) tourMarkShown(tourState.tour);
    limparBuscaTimer();
    limparInteracao();
    limparNextClickTimer();
    tourLimparVigiaPosicionamento();
    unbindTourReposHandlers();
    tourState.elementoAtual = null;
    tourState.naoEncontrado = false;
    tourState.tela = 'concluido';
    tourState.feedbackEscolhido = null;
    tourState.suprimirAbandonoNavegacao = false;
    tourState.avancoResolvidoEm = Date.now();
    tourLimparContinuacao();
    // Tour iniciado por uma etapa de Jornada — só agora, com o tour realmente
    // concluído (não ao meramente iniciar), a etapa é marcada concluída. Ver
    // jornadaEtapaClicar e a declaração de jornadaContexto em tourState.
    if (tourState.jornadaContexto) {
      var jc = tourState.jornadaContexto;
      tourState.jornadaContexto = null;
      var jornadaC = jornadaEncontrar(jc.jornadaId);
      var blocoC = jornadaEncontrarBloco(jornadaC, jc.blocoId);
      var etapaC = jornadaEncontrarEtapa(blocoC, jc.etapaId);
      if (jornadaC && blocoC && etapaC) jornadaMarcarConcluida(jornadaC, blocoC, etapaC, jc.contextoExtra);
    }
    renderTour();
  }

  // motivo (obrigatório em espírito, opcional em runtime): string curta e
  // estável identificando por que o tour terminou (ex.: "usuario_pulou",
  // "navegacao_url") — não é usada em nenhuma lógica hoje, só documenta a
  // intenção de cada chamada (todo call site interno passa um motivo
  // explícito) pra facilitar diagnosticar um tour que termina de forma
  // inesperada, sem precisar reinstrumentar o código depois. Nunca quebra se
  // algum ponto futuro esquecer de passar.
  //
  // preservarContinuacao (opcional): quando true, pula a limpeza da sessão de
  // retomada abaixo. Existe só pra iniciarTour() poder chamar finalizarTour()
  // (limpando DOM/listeners de um tour anterior, se houver) sem apagar a
  // continuação que tourRetomarSeHouver() acabou de reescrever como
  // 'retomando' — ver iniciarTour() e o bug que isso causava: a sessão sumia
  // do sessionStorage assim que a retomada começava, antes de qualquer
  // desfecho real (passo achado, fallback, conclusão ou abandono).
  function finalizarTour(motivo, preservarContinuacao) {
    limparBuscaTimer();
    limparInteracao();
    limparNextClickTimer();
    limparVoltarFallback();
    limparFimTimer();
    tourLimparVigiaPosicionamento();
    unbindTourReposHandlers();
    document.removeEventListener('keydown', tourKeydown);
    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();
    tourState.ativo = false;
    tourState.tour = null;
    tourState.root = null;
    tourState.elementoAtual = null;
    tourState.naoEncontrado = false;
    tourState.tela = null;
    tourState.feedbackEscolhido = null;
    tourState.suprimirAbandonoNavegacao = false;
    tourState.avancoResolvidoEm = 0;
    // Fechar/pular/concluir o tour aqui (não em iniciarTour(), que também
    // passa por finalizarTour() pra limpar uma sessão anterior) já cobre os
    // dois casos que importam: encerrar de vez OU zerar antes do tour
    // seguinte começar do zero — nunca faz sentido carregar URLs de passos
    // de uma sessão pra outra.
    tourState.urlPorPasso = {};
    // Cobre o caso raro de abandonar o tour (Encerrar/Pular) bem na janela
    // entre um clique que salvou continuação e ela ser consumida — sem isso,
    // uma retomada indevida poderia disparar num carregamento de página
    // totalmente não relacionado, bem mais tarde.
    if (!preservarContinuacao) tourLimparContinuacao();
    // Tour encerrado por qualquer motivo que não seja tourConcluir() (pulado,
    // fechado, abandonado por navegação genuína) — nunca marca a etapa da
    // Jornada como concluída (tourConcluir() já consome e zera isso sozinho
    // quando o tour termina de verdade).
    tourState.jornadaContexto = null;
    if (tourState.preview) {
      tourState.preview = false;
      tourState.previewModoUsuarioFinal = false;
      recorderRestaurarAposPreview();
    }
    // Tour encerrado (concluído, pulado ou fechado) — reavalia se o FAB
    // "Ajuda" deve voltar a aparecer agora que ele não está mais ocupando a tela.
    jornadaReavaliarFab();
  }

  // "Começar tour" na introdução — só agora o tour é considerado iniciado de
  // fato: evento 'inicio', reposicionamento e busca do passo 0 só disparam
  // aqui, não em iniciarTour() (que só monta a introdução).
  function tourIntroComecar() {
    tourState.tela = null;
    registrarEventoTour('inicio', 0);
    bindTourReposHandlers();
    irParaPasso(0);
  }

  // "Agora não" — só fecha a introdução, sem registrar nada. Diferente de
  // "Não mostrar novamente" (que reaproveita tourPular()), este tour pode
  // voltar a ser avaliado/oferecido numa próxima navegação normalmente.
  function tourIntroDispensar() {
    finalizarTour('intro_dispensada');
  }

  // pularIntro (opcional, default false) — usado só por recorderTestarPasso
  // (ver mais abaixo): pula a tela de introdução e vai direto pro passo 0,
  // já que "testar só este passo" não precisa de uma tela de boas-vindas no
  // meio. preview (opcional, default false) — marca a sessão como prévia do
  // gravador (ver recorderIniciarPreview); precisa ser setado AQUI, logo após
  // a limpeza de finalizarTour() e ANTES de qualquer coisa que possa disparar
  // um evento (irParaPasso quando pularIntro=true chama registrarEventoTour
  // de forma síncrona se o elemento já existir na tela — setar tourState.preview
  // só depois de iniciarTour() retornar, como antes, deixava esse evento
  // escapar sem a marcação de prévia ainda ativa). modoUsuarioFinal (opcional,
  // default false) — usado só por recorderPreVisualizarComoUsuarioFinal:
  // esconde "Trocar elemento deste passo" no estado "Elemento não encontrado"
  // (ver renderTourNaoEncontrado), a única peça de UI do gravador que
  // aparece dentro do próprio overlay do tour (bar/painel já ficam
  // escondidos em qualquer prévia). O disparo real do tour
  // (iniciarTourPublico/avaliarTourAutomatico) nunca passa esses argumentos,
  // então continua com introdução normal e preview/modoUsuarioFinal=false.
  // indiceInicial (opcional, default 0) — usado só por tourRetomarSeHouver()
  // pra retomar diretamente num passo específico depois de um reload
  // completo de página, sem passar pelos passos anteriores de novo. Só tem
  // efeito com pularIntro=true (senão a tela de introdução sempre entra
  // pelo passo 0 mesmo).
  // preservarContinuacaoAoIniciar (opcional) — repassado pra finalizarTour()
  // abaixo. Só true quando chamado por tourRetomarSeHouver(): nesse caso a
  // sessão de retomada já foi regravada como 'retomando' e só deve ser
  // limpa quando irParaPasso() de fato resolver o próximo passo (achado ou
  // "não encontrado") — nunca antes, por causa desta limpeza automática de
  // "tour anterior" que finalizarTour() sempre faz aqui.
  function iniciarTour(tour, pularIntro, preview, modoUsuarioFinal, jornadaContexto, indiceInicial, preservarContinuacaoAoIniciar) {
    if (!tour || !tour.passos || tour.passos.length === 0) return;
    finalizarTour('novo_tour_iniciado', preservarContinuacaoAoIniciar);
    ensureStyles();
    tourState.tour = tour;
    tourState.ativo = true;
    tourState.preview = Boolean(preview);
    tourState.previewModoUsuarioFinal = Boolean(modoUsuarioFinal);
    // Setado depois de finalizarTour() acima de propósito — ele zera
    // jornadaContexto (limpeza do tour anterior), e esse aqui é do tour que
    // está começando agora.
    tourState.jornadaContexto = jornadaContexto || null;
    // finalizarTour() acima já reavaliou o FAB com ativo=false (pra limpar um
    // tour anterior, se houver) — agora que o tour novo está de fato ativo,
    // reavalia de novo pra escondê-lo enquanto ele ocupa a tela.
    jornadaReavaliarFab();
    document.addEventListener('keydown', tourKeydown);
    if (pularIntro) {
      bindTourReposHandlers();
      irParaPasso(indiceInicial || 0);
      return;
    }
    tourState.tela = 'intro';
    renderTour();
  }

  // Avalia automaticamente, no init() e a cada reavaliação de SPA (ver
  // handleUrlChange), se há um tour guiado elegível para o contexto atual
  // (mesmo princípio do checkMode usado para campanhas).
  function avaliarTourAutomatico(config) {
    // Central de ajuda aberta não pode ser coberta por um tour automático —
    // o usuário abriu ela de propósito, então não compete por cima.
    if (tourState.ativo || jornadaState.aberto || !config.sistema) {
      if (debugState.enabled) {
        debugLog('Tour automático — avaliação pulada', {
          motivo: tourState.ativo ? 'já há um tour ativo' : (jornadaState.aberto ? 'Central de Jornadas aberta' : 'config sem "sistema"'),
        });
      }
      return;
    }
    fetchTourCandidatos(config.sistema, config.tela, config.usuario_id, config.contexto)
      .then(function (candidatos) {
        if (tourState.ativo || jornadaState.aberto) return;
        var selecionado = null;
        var linhas = [];
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          var okModo = checkMode(c, config);
          var seg = avaliarSegmentacaoTour(c, config);
          // Com usuario_id, confia no backend (já fez dedupe/reexibição). Sem
          // usuario_id, o servidor não tem como identificar o usuário — cai
          // no fallback localStorage.
          var jaVisto = !config.usuario_id && tourWasShown(c);
          if (debugState.enabled) {
            var motivo;
            if (!okModo) motivo = 'bloqueado: modo_identificacao não corresponde';
            else if (!seg.ok) motivo = 'bloqueado por segmentação';
            else if (jaVisto) motivo = 'bloqueado: já visto (localStorage)';
            else motivo = selecionado ? 'elegível, porém outro tour de maior prioridade já selecionado' : 'selecionado';
            linhas.push({
              id: c.id,
              titulo: c.titulo || null,
              modo_identificacao: c.modo_identificacao || 'sistema_tela',
              segmentacao: seg.motivo,
              regra_que_falhou: seg.regraFalhou,
              motivo: motivo,
            });
          }
          if (!okModo || !seg.ok || jaVisto) continue;
          if (!selecionado) selecionado = c;
        }
        if (debugState.enabled) debugLog('Tour automático — candidatos (' + config.tela + ')', linhas);
        if (selecionado) aguardarAparenciaEIniciarTour(selecionado);
      })
      .catch(function () { /* fail silently */ });
  }

  // Adia iniciarTour() até a aparência (cor/logo) do sistema atual estar
  // resolvida (ou desistir pelo timeout de fetchAparenciaComTimeout) — sem
  // isso, a intro do tour renderizava primeiro com o visual padrão e só
  // trocava pra cor/logo configurados quando a resposta chegasse (flash).
  // Roda em paralelo com o fetch de candidatos em avaliarTourAutomatico (não
  // soma os dois tempos de espera): na prática, na maioria das navegações
  // essa promise já está resolvida (aparenciaPromise é setada uma vez em
  // init() e reaproveitada por toda a sessão da SPA), então isso resolve no
  // mesmo tick, sem atraso perceptível.
  function aguardarAparenciaEIniciarTour(tour) {
    var promise = aparenciaPromise || Promise.resolve(null);
    promise.then(function () {
      // Reconfere depois da espera: outro tour pode ter iniciado, ou a
      // Central de Ajuda pode ter sido aberta, nesse meio-tempo.
      if (tourState.ativo || jornadaState.aberto) return;
      iniciarTour(tour);
    });
  }

  // ─── Gravador de fluxo (MVP) ──────────────────────────────────────────────
  // Ativado quando a URL da página tem ?userpulse_recorder=1 (aberta pelo
  // admin em /tours/gravador). Roda inteiramente no host, sem extensão de
  // navegador nem comunicação entre abas: captura cliques/preenchimentos em
  // tempo real e, ao finalizar, o próprio widget mostra o JSON
  // userpulse.tour.v1 pronto pra copiar/baixar — o usuário importa depois
  // pelo fluxo de "Importar JSON" já existente em /tours, sem nenhuma mudança
  // no backend/importador.
  //
  // Privacidade: nunca lê/guarda o valor de nenhum campo (só reage aos
  // eventos input/change pra saber QUE houve preenchimento); ignora
  // completamente campos que pareçam senha/CPF/e-mail/telefone/cartão; nunca
  // tira screenshot.

  var RECORDER_BAR_ID = 'userpulse-recorder-bar';
  var RECORDER_PAINEL_ID = 'userpulse-recorder-painel';
  var RECORDER_TROCA_BAR_ID = 'userpulse-recorder-troca-bar';
  var RECORDER_LOCALIZAR_BAR_ID = 'userpulse-recorder-localizar-bar';
  var RECORDER_MINI_REVISAO_ID = 'userpulse-recorder-mini-revisao';
  var RECORDER_PAINEL_LATERAL_ID = 'userpulse-recorder-painel-lateral';
  var RECORDER_INPUT_DEBOUNCE_MS = 500;
  var RECORDER_CLIQUE_DEDUPE_MS = 600;
  var RECORDER_URL_POLL_MS = 500;
  var RECORDER_STORAGE_KEY = 'userpulse:recorder:v1';

  var recorderState = {
    ativo: false,
    pausado: false,
    passos: [],
    navegacoes: [],
    meta: null,
    // null (padrão) = gravador aberto pra um Tour novo (TourGravador.tsx) ou
    // sem contexto especial. 'editar_tour_existente' = aberto via "Editar
    // fluxo no sistema" de um Tour já existente (Form.tsx, up_rec_context na
    // URL) — só ajusta textos/CTA do painel final (recorderRenderPainelFinal);
    // nunca decide nada de captura, persistência ou dado em si.
    contexto: null,
    ultimoEl: null,
    ultimoElTimestamp: 0,
    ultimaUrl: '',
    inputTimers: null,
    elParaIndice: null,
    urlPollTimer: null,
    pausadoAntesRevisao: false,
    // Índice do passo em edição via "Trocar elemento" na revisão — null
    // quando não está nesse modo. Nunca persistido: é um estado efêmero de UI,
    // não um dado do tour (se a página recarregar no meio, a troca é
    // simplesmente abandonada sem alterar o passo).
    trocaIndice: null,
    // De onde "Trocar elemento" foi disparado — 'revisao' (revisão final,
    // comportamento original) ou 'painel-lateral'. Define pra onde voltar ao
    // aplicar/cancelar a troca (recorderAplicarNovoSeletor e os cancelamentos
    // em recorderCancelarTroca/recorderMostrarEscolhaSeletor): 'revisao' volta
    // pra recorderRenderRevisao(), 'painel-lateral' volta pro próprio painel
    // lateral com o mesmo passo selecionado, sem nunca abrir a revisão final.
    // Também efêmero, mesmo motivo de trocaIndice.
    trocaOrigem: null,
    // Mapeia o índice do passo DENTRO do tour temporário de prévia (0, 1, 2…)
    // pro índice REAL em recorderState.passos — necessário porque
    // "Testar passo" monta um tour de um item só (sempre índice 0 na prévia,
    // mas o passo testado pode ser qualquer um dos reais). "Pré-visualizar
    // tour" usa o mapeamento identidade (todos os passos, na mesma ordem).
    // Lido só por tourTrocarPassoAtual, pra saber qual passo real trocar.
    // Efêmero (nunca persistido), como trocaIndice/trocaOrigem.
    previewIndices: null,
    // Liga/desliga a exibição das sugestões do "Analisar passos" — também
    // efêmero (não persistido), só controla se o bloco de sugestões aparece.
    analiseAtiva: false,
    // Desativado por padrão — captura rápida continua sendo o comportamento
    // padrão. Quando true, cada passo capturado abre um mini painel de
    // revisão antes de voltar a capturar (ver recorderAbrirMiniRevisao).
    // Persistido (sobrevive a reload) igual a pausado/meta/passos, ao
    // contrário de trocaIndice/analiseAtiva (efêmeros de UI).
    revisarCadaPasso: false,
    // Desativado por padrão — painel lateral "Passos capturados" (ver
    // recorderRenderPainelLateral). Diferente de revisarCadaPasso: não pausa
    // a captura, só mantém um painel não-bloqueante sincronizado. Persistido
    // igual a revisarCadaPasso.
    revisarTempoReal: false,
    // Efêmeros de UI do painel lateral (não persistidos) — recolhido/
    // expandido e qual passo está selecionado pra edição no painel.
    painelLateralAberto: true,
    painelLateralIndiceSelecionado: null,
    // Pra onde a barra "Localizar na tela" deve voltar ao fechar — 'revisao'
    // (padrão, comportamento já existente) ou 'painel-lateral' (novo).
    localizarOrigem: null,
    // Estado de pausado antes de entrar em "Trocar elemento" — permite essa
    // ação ser disparada tanto de dentro da revisão final (já pausada) quanto
    // do painel lateral (captura ainda ativa), restaurando o estado correto
    // ao sair (ver recorderIniciarTrocaElemento/recorderPararEscutaTroca).
    pausadoAntesTroca: false,
    // Sugestão de seletor pra lista/dropdown/autocomplete dinâmica detectada
    // depois de capturar um passo (ver recorderObservarListaDinamica) — null
    // quando nada foi detectado ainda. { indice, seletor, generico,
    // estabilidade }: indice é o passo a que a sugestão se refere (só
    // exibida no painel lateral quando esse é o passo selecionado);
    // generico=true quando não achou data-cy indexado e caiu num dos
    // fallbacks CSS conhecidos (ver RECORDER_FALLBACK_LISTA_DINAMICA);
    // estabilidade é RECORDER_ESTABILIDADE_ALTA/MEDIA/BAIXA, exibida na UI
    // pra deixar claro o nível de confiança do seletor sugerido. Nunca
    // aplicada sozinha — só oferecida como ação no painel lateral.
    // Efêmera (não persistida), como trocaIndice/analiseAtiva.
    sugestaoListaDinamica: null,
    // MutationObserver + timer da detecção de lista dinâmica em andamento
    // (ver recorderObservarListaDinamica/recorderPararDeteccaoListaDinamica)
    // — só uma detecção ativa por vez; capturar um novo passo cancela a
    // anterior. Desconectados também ao parar a captura (recorderPararCaptura).
    listaDinamicaObserver: null,
    listaDinamicaTimer: null,
  };

  // Opções editáveis na revisão — mesmos valores aceitos pelo backend/admin
  // (server/src/controllers/tours.ts), mantidos em sincronia manualmente já
  // que o widget não importa nada do admin.
  var RECORDER_TOOLTIP_POSICOES = [
    { value: 'auto', label: 'Automática' },
    { value: 'top', label: 'Acima' },
    { value: 'bottom', label: 'Abaixo' },
    { value: 'left', label: 'Esquerda' },
    { value: 'right', label: 'Direita' },
  ];
  // Labels curtos de propósito — o select nativo (painel lateral) não tem
  // espaço pra frases longas sem cortar texto ou ficar apertado. O
  // significado completo de cada modo continua explicado no title do select
  // (ver recorderSimpleSelectHtml) — só o rótulo visível encolheu, value e
  // comportamento (bindInteracao no runtime do tour) não mudaram.
  var RECORDER_MODOS_AVANCO = [
    { value: 'manual', label: 'Botão Próximo' },
    { value: 'ao_clicar', label: 'Clique no elemento' },
    { value: 'ao_alterar_valor', label: 'Preencher valor' },
    { value: 'ao_aparecer_elemento', label: 'Elemento aparecer' },
    { value: 'ao_sumir_elemento', label: 'Elemento sumir' },
  ];
  var RECORDER_ACOES_AO_AVANCAR = [
    { value: 'apenas_avancar', label: 'Apenas avançar' },
    { value: 'clicar_elemento', label: 'Clicar no elemento destacado e avançar' },
  ];
  var RECORDER_MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento'];
  // Explicação completa de cada modo — vira title (tooltip nativo, sem
  // ocupar espaço visível) no select nativo do painel lateral/mini painel,
  // já que o rótulo visível agora é curto demais pra carregar todo o
  // contexto sozinho.
  var RECORDER_MODOS_AVANCO_TITULO = {
    manual: 'Manual — só avança pelo botão Próximo',
    ao_clicar: 'Avança quando o usuário clica no elemento destacado',
    ao_alterar_valor: 'Avança quando o usuário preenche ou altera o valor do campo',
    ao_aparecer_elemento: 'Avança quando outro elemento aparece na tela',
    ao_sumir_elemento: 'Avança quando outro elemento some da tela',
  };

  // ─── Detecção de lista/dropdown/autocomplete dinâmica ─────────────────────
  // Ajuda a configurar passos que dependem de uma lista que só aparece depois
  // de interagir com o campo do passo anterior (busca, autocomplete, select
  // customizado) — sem o usuário precisar abrir o DevTools pra descobrir o
  // seletor manualmente. Tudo aqui é estrutural (nomes de atributo/role
  // genéricos de convenções de automação e bibliotecas de UI populares),
  // nunca depende de nome de campo/sistema específico.

  // Por quanto tempo, depois de capturar um passo, o gravador continua
  // observando o DOM à procura de uma lista/dropdown relacionada (ver
  // recorderObservarListaDinamica) — cobre autocompletes que abrem só depois
  // de uma resposta assíncrona (debounce de busca), não só synchronous.
  var RECORDER_LISTA_DINAMICA_JANELA_MS = 4000;

  // Camadas de estabilidade da sugestão — quanto mais um seletor depende de
  // convenção de automação (data-cy) em vez de detalhe de implementação
  // (classe de uma lib de UI, que muda entre versões/temas), mais estável
  // ele é a longo prazo. Usado só pra classificar/exibir a sugestão pro
  // usuário decidir (nunca muda qual seletor é escolhido em si — a ORDEM de
  // tentativa já reflete essa mesma prioridade).
  var RECORDER_ESTABILIDADE_ALTA = 'alta';
  var RECORDER_ESTABILIDADE_MEDIA = 'media';
  var RECORDER_ESTABILIDADE_BAIXA = 'baixa';
  var RECORDER_ESTABILIDADE_LABEL = {
    alta: 'Alta estabilidade',
    media: 'Média estabilidade',
    baixa: 'Baixa estabilidade',
  };

  // Combinações concretas de container+item conhecidas de bibliotecas de UI
  // populares (Angular CDK Overlay, Ant Design, NG-ZORRO) — tentadas nesta
  // ordem quando nenhum item com data-cy indexado é encontrado (ver
  // recorderEscanearListaDinamica). Role semântico (ARIA) vem antes de
  // classe de biblioteca: [role="option"]/[role="menuitem"] tendem a
  // sobreviver a upgrades/troca de tema da lib, enquanto uma classe como
  // .ant-select-dropdown-menu-item é um detalhe de implementação que pode
  // mudar. Cada entrada já é um seletor CSS completo, pronto pra usar;
  // nenhuma delas depende de id (esses são gerados dinamicamente pelo
  // framework — ver recorderEhIdOverlayDinamico) nem de nome de campo/
  // sistema específico.
  var RECORDER_FALLBACK_LISTA_DINAMICA = [
    { seletor: '.cdk-overlay-container [role="option"]', estabilidade: RECORDER_ESTABILIDADE_MEDIA },
    { seletor: '.cdk-overlay-container [role="menuitem"]', estabilidade: RECORDER_ESTABILIDADE_MEDIA },
    { seletor: '.cdk-overlay-container .ant-select-dropdown-menu-item', estabilidade: RECORDER_ESTABILIDADE_BAIXA },
    { seletor: '.ant-select-dropdown .ant-select-dropdown-menu-item', estabilidade: RECORDER_ESTABILIDADE_BAIXA },
    { seletor: '.cdk-overlay-container nz-auto-option', estabilidade: RECORDER_ESTABILIDADE_BAIXA },
    { seletor: '.cdk-overlay-container nz-option-item', estabilidade: RECORDER_ESTABILIDADE_BAIXA },
  ];
  // Mesmos seletores de item de RECORDER_FALLBACK_LISTA_DINAMICA, mas
  // "soltos" (sem prefixo de container) — usados por recorderEhItemDropdown
  // pra reconhecer se UM elemento específico é um item de lista/dropdown
  // dinâmica (ao contrário da lista acima, que busca no documento inteiro).
  var RECORDER_SELETORES_ITEM_DROPDOWN = [
    '.ant-select-dropdown-menu-item',
    '[role="option"]',
    '[role="menuitem"]',
    'nz-auto-option',
    'nz-option-item',
  ];
  // Containers/wrappers de overlay do próprio framework — nunca são "o
  // elemento clicado" de verdade, mesmo que a subida por ancestrais
  // (recorderLocalizarAlvoRelevante) passe por eles: são só o mecanismo de
  // posicionamento/empilhamento do dropdown, não um item de lista real (ver
  // recorderEhContainerOverlayFramework).
  var RECORDER_SELETORES_CONTAINER_OVERLAY_FRAMEWORK = [
    '.cdk-overlay-pane',
    '.cdk-global-overlay-wrapper',
    '.ant-select-dropdown',
  ];
  // Regiões típicas de dropdown/lista/autocomplete dinâmica — só um data-cy
  // indexado DENTRO de uma dessas (ou que seja, ele mesmo, um dos seletores
  // abaixo) conta como candidato a lista dinâmica com só 1 item visível já
  // bastando como evidência (ver recorderCandidatoValidoParaListaDinamica).
  // Fora daqui, precisa de outra evidência (vários irmãos com o mesmo
  // prefixo) pra não confundir a busca ampla por [data-cy] no documento
  // inteiro com listas ESTÁTICAS da própria aplicação (menu, sidebar) que
  // também usam data-cy indexado por convenção, mas não têm nada a ver com
  // o passo que acabou de ser gravado.
  var RECORDER_SELETORES_REGIAO_LISTA_DINAMICA = [
    '.cdk-overlay-container',
    '.ant-select-dropdown',
    'nz-auto-option',
    'nz-option-item',
    '[role="option"]',
    '[role="menuitem"]',
    '.ant-select-dropdown-menu-item',
  ];
  // Landmarks estruturais de navegação/layout fixo — regra puramente
  // estrutural (tags/roles HTML padrão, nenhum nome de componente/sistema),
  // usada só pra DESCARTAR um candidato de data-cy indexado que não está
  // dentro de nenhuma região de lista dinâmica conhecida acima (ver
  // recorderCandidatoValidoParaListaDinamica) — evita sugerir item de
  // menu/sidebar/header/topbar como se fosse a lista que acabou de abrir.
  var RECORDER_SELETORES_NAVEGACAO_FIXA = [
    'nav', 'header', 'aside', '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  ];

  function recorderEmRegiaoListaDinamica(el) {
    try { return Boolean(el.closest && el.closest(RECORDER_SELETORES_REGIAO_LISTA_DINAMICA.join(','))); } catch (_e) { return false; }
  }

  function recorderEmNavegacaoFixa(el) {
    try { return Boolean(el.closest && el.closest(RECORDER_SELETORES_NAVEGACAO_FIXA.join(','))); } catch (_e) { return false; }
  }

  // true quando existe pelo menos mais um elemento visível na tela com o
  // MESMO prefixo indexado de data-cy que "el" (ex.: junto de
  // "paciente-option-0" também existe "paciente-option-1" visível) —
  // evidência estrutural de que isto é de fato uma LISTA (vários itens
  // irmãos), não um único elemento indexado isolado. Genérico: não depende
  // do valor do prefixo em si, só de haver mais de um item.
  function recorderTemIrmaoComMesmoPrefixo(prefixo, elIgnorar) {
    var seletor;
    try { seletor = '[data-cy^="' + recorderCssEscapeAtributo(prefixo) + '"]'; } catch (_e) { return false; }
    var achados;
    try { achados = document.querySelectorAll(seletor); } catch (_e) { return false; }
    for (var i = 0; i < achados.length; i++) {
      if (achados[i] === elIgnorar) continue;
      if (tourElementoVisivelEInterativo(achados[i])) return true;
    }
    return false;
  }

  // Só aceita um elemento com data-cy indexado como candidato de verdade a
  // lista dinâmica quando há evidência real (ver ajuste #7): dentro de uma
  // região de dropdown/lista/autocomplete conhecida (1 item já basta), OU
  // fora de navegação/layout fixo E com pelo menos mais um irmão visível
  // compartilhando o mesmo prefixo (cobre listas customizadas, sem nenhuma
  // das bibliotecas de UI conhecidas). Sem nenhuma das duas evidências, não
  // é candidato — evita o falso positivo de itens de menu/sidebar/header
  // que também usam data-cy indexado, mas não são a lista do passo atual.
  function recorderCandidatoValidoParaListaDinamica(el, prefixo) {
    if (recorderEmRegiaoListaDinamica(el)) return true;
    if (recorderEmNavegacaoFixa(el)) return false;
    return recorderTemIrmaoComMesmoPrefixo(prefixo, el);
  }

  // Primeiro seletor por prefixo de data-cy indexado válido (ver
  // recorderCandidatoValidoParaListaDinamica) entre uma lista de candidatos
  // — reaproveitado tanto pelo escaneamento geral do documento
  // (recorderEscanearListaDinamica) quanto pela checagem priorizada de nós
  // recém-inseridos por uma mutação (ver recorderObservarListaDinamica).
  function recorderMelhorCandidatoDataCyIndexado(candidatos) {
    for (var c = 0; c < candidatos.length; c++) {
      var el = candidatos[c];
      if (!tourElementoVisivelEInterativo(el)) continue;
      var prefixo = recorderPrefixoDataCyIndexado(el.getAttribute('data-cy'));
      if (!prefixo) continue;
      if (!recorderCandidatoValidoParaListaDinamica(el, prefixo)) continue;
      return '[data-cy^="' + recorderCssEscapeAtributo(prefixo) + '"]';
    }
    return null;
  }

  // Candidatos com data-cy dentro de um nó específico (ele mesmo + seus
  // descendentes) — usado pra priorizar nós recém-inseridos por uma mutação
  // (ver recorderObservarListaDinamica/recorderMelhorCandidatoDataCyIndexado)
  // em vez de escanear o documento inteiro de novo a cada mutação.
  function recorderCandidatosDataCyEm(no) {
    var candidatos = [];
    if (!no || no.nodeType !== 1) return candidatos;
    try { if (no.matches && no.matches('[data-cy]')) candidatos.push(no); } catch (_e) {}
    try {
      var achados = no.querySelectorAll('[data-cy]');
      for (var i = 0; i < achados.length; i++) candidatos.push(achados[i]);
    } catch (_e) {}
    return candidatos;
  }

  // Mensagem mais clara que "elemento não encontrado" pra quando o passo
  // aponta pra um item de lista/dropdown/autocomplete temporário — esses só
  // existem no DOM enquanto a lista está aberta, então "não encontrado"
  // sozinho é confuso (parece seletor quebrado, quando na verdade é
  // esperado não achar nada com a lista fechada). Usada em qualquer lugar
  // do gravador que mostra esse aviso (ver recorderSeletorPareceItemListaDinamica).
  var RECORDER_MSG_ELEMENTO_TEMPORARIO_LISTA = 'Elemento temporário de lista/dropdown. Ele só aparece quando a lista está aberta.';

  // true quando o seletor de um passo aponta pra um item de lista/dropdown/
  // autocomplete dinâmica — mesmo com a lista fechada (sem elemento nenhum
  // na tela pra checar agora), dá pra reconhecer isso pelo PADRÃO do próprio
  // seletor guardado: [data-cy^="prefixo-"] (sugestão indexada por
  // prefixo), um data-cy exato que também parece indexado (ex.: capturado
  // direto de um item clicado, sem passar pela sugestão), ou um dos
  // seletores CSS concretos conhecidos de RECORDER_FALLBACK_LISTA_DINAMICA/
  // RECORDER_SELETORES_ITEM_DROPDOWN. Puramente estrutural — nenhum nome de
  // campo/sistema específico.
  function recorderSeletorPareceItemListaDinamica(passo) {
    if (!passo || !passo.seletor) return false;
    if (passo.seletor_tipo === 'data_cy') return Boolean(recorderPrefixoDataCyIndexado(passo.seletor));
    if (passo.seletor_tipo !== 'css') return false;
    var seletor = passo.seletor;
    if (/^\[data-cy\^=/.test(seletor)) return true;
    for (var i = 0; i < RECORDER_FALLBACK_LISTA_DINAMICA.length; i++) {
      if (seletor === RECORDER_FALLBACK_LISTA_DINAMICA[i].seletor) return true;
    }
    for (var j = 0; j < RECORDER_SELETORES_ITEM_DROPDOWN.length; j++) {
      if (seletor.indexOf(RECORDER_SELETORES_ITEM_DROPDOWN[j]) !== -1) return true;
    }
    return false;
  }

  // Extrai o prefixo de um data-cy indexado (ex.: "algo-item-0" vira
  // "algo-item-"), removendo só o índice numérico final e preservando o
  // separador antes dele — regra puramente estrutural (nenhuma lista de
  // nomes de campo conhecidos), então funciona pra qualquer convenção do
  // tipo "prefixo-N", em qualquer sistema integrado. Retorna null quando o
  // valor não termina em dígito (não é indexado, não há prefixo a sugerir).
  function recorderPrefixoDataCyIndexado(valor) {
    var m = /^(.*[^0-9])[0-9]+$/.exec(String(valor == null ? '' : valor));
    return m ? m[1] : null;
  }

  // Ids gerados dinamicamente pelo Angular CDK Overlay pra cada painel que
  // abre (autocomplete, select, dropdown, modal) — ex.: "cdk-overlay-3" —
  // mudam a cada abertura/sessão/ordem de interação, então nunca são
  // estáveis o bastante pra virar um seletor de automação, mesmo que
  // pareçam "únicos" no momento da gravação. Usado como guarda tanto na
  // detecção de lista dinâmica (que nunca usa id — RECORDER_FALLBACK_LISTA_DINAMICA
  // só tem seletores de classe/role) quanto na geração geral de seletor
  // (recorderGerarSeletor/recorderAncoraAncestral), pra nunca capturar um id
  // assim como seletor principal de um passo, mesmo clicando direto no item.
  function recorderEhIdOverlayDinamico(valor) {
    return /^cdk-overlay-\d+$/i.test(String(valor == null ? '' : valor).trim());
  }

  // true quando o elemento é um item de lista/dropdown/autocomplete
  // conhecido (Ant Design, NG-ZORRO, roles ARIA de menu/option) — usado por
  // recorderElementoRelevante (reconhece o item como alvo válido de um
  // passo, mesmo sem tag/role "clássico" de botão/link) e por
  // recorderGerarSeletor/recorderGerarTitulo (escolhem o fallback e o título
  // certos pra esse tipo de elemento). Puramente estrutural — nenhum nome de
  // campo/sistema específico.
  function recorderEhItemDropdown(el) {
    if (!el || !el.matches) return false;
    for (var i = 0; i < RECORDER_SELETORES_ITEM_DROPDOWN.length; i++) {
      try { if (el.matches(RECORDER_SELETORES_ITEM_DROPDOWN[i])) return true; } catch (_e) {}
    }
    return false;
  }

  // true quando o elemento é um container/wrapper de overlay do próprio
  // framework (painel do Angular CDK — id dinâmico OU as classes fixas dele
  // — ou o wrapper do Ant Design) — nunca deve virar "o alvo relevante" de
  // um clique (ver recorderElementoRelevante), mesmo tendo id/aria-label:
  // é só o mecanismo de posicionamento do dropdown, não um item real.
  function recorderEhContainerOverlayFramework(el) {
    if (!el) return false;
    if (el.id && recorderEhIdOverlayDinamico(el.id)) return true;
    if (!el.matches) return false;
    for (var i = 0; i < RECORDER_SELETORES_CONTAINER_OVERLAY_FRAMEWORK.length; i++) {
      try { if (el.matches(RECORDER_SELETORES_CONTAINER_OVERLAY_FRAMEWORK[i])) return true; } catch (_e) {}
    }
    return false;
  }

  // Primeira entrada de RECORDER_FALLBACK_LISTA_DINAMICA que tem pelo menos
  // um item visível/interativo na tela agora, ou null se nenhuma bater —
  // reaproveitado tanto por recorderEscanearListaDinamica (detecção
  // proativa via o botão "Detectar lista dinâmica") quanto por
  // recorderGerarSeletor (fallback ao capturar um clique direto num item de
  // dropdown sem data-cy, sem precisar passar pelo botão). Retorna a entrada
  // inteira ({ seletor, estabilidade }), não só a string do seletor — quem
  // só precisa do seletor lê ".seletor" do retorno.
  function recorderMelhorSeletorFallbackLista() {
    for (var f = 0; f < RECORDER_FALLBACK_LISTA_DINAMICA.length; f++) {
      var entrada = RECORDER_FALLBACK_LISTA_DINAMICA[f];
      var itens;
      try { itens = document.querySelectorAll(entrada.seletor); } catch (_e) { continue; }
      for (var it = 0; it < itens.length; it++) {
        if (tourElementoVisivelEInterativo(itens[it])) return entrada;
      }
    }
    return null;
  }

  // Escaneia o DOM ATUAL (não espera nenhuma mutação) à procura de uma
  // lista/dropdown/autocomplete visível — usado tanto pela detecção
  // automática (logo após capturar um passo) quanto pelo botão manual
  // "Detectar lista dinâmica", justamente pra cobrir o caso de a lista já
  // estar aberta na tela ANTES de pedir a detecção (ver
  // recorderObservarListaDinamica). data-cy indexado tem prioridade (vira
  // seletor por prefixo, o mais estável) — mas só quando validado como
  // candidato de verdade a lista dinâmica (dentro de uma região de
  // dropdown/overlay conhecida, ou com irmãos visíveis de mesmo prefixo
  // fora de navegação/layout fixo — ver recorderCandidatoValidoParaListaDinamica).
  // Isso evita o falso positivo de achar QUALQUER data-cy indexado no
  // documento inteiro, mesmo vindo de menu/sidebar/header estático. Na
  // ausência de um data-cy válido, cai num dos fallbacks CSS concretos e
  // conhecidos de RECORDER_FALLBACK_LISTA_DINAMICA (média/baixa
  // estabilidade, sinalizada pro usuário decidir). Retorna
  // { seletor, seletor_tipo, generico, estabilidade } ou null se nada for
  // achado — data-cy indexado é sempre RECORDER_ESTABILIDADE_ALTA.
  function recorderEscanearListaDinamica() {
    var achadosDataCy;
    try { achadosDataCy = document.querySelectorAll('[data-cy]'); } catch (_e) { achadosDataCy = []; }
    var seletorDataCy = recorderMelhorCandidatoDataCyIndexado(achadosDataCy);
    if (seletorDataCy) {
      return { seletor: seletorDataCy, seletor_tipo: 'css', generico: false, estabilidade: RECORDER_ESTABILIDADE_ALTA };
    }
    var fallback = recorderMelhorSeletorFallbackLista();
    if (fallback) {
      return { seletor: fallback.seletor, seletor_tipo: 'css', generico: true, estabilidade: fallback.estabilidade };
    }
    return null;
  }

  // Copia texto pra área de transferência — mesma técnica (Clipboard API com
  // fallback pra execCommand via textarea temporário) já usada pelo "Copiar
  // JSON" da revisão final, só que autocontida (não depende de um textarea
  // já visível na tela), pra reaproveitar em "Copiar seletor".
  function recorderCopiarTexto(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).catch(function () {});
        return;
      }
    } catch (_e) {}
    try {
      var temp = document.createElement('textarea');
      temp.value = texto;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    } catch (_e) {}
  }

  function recorderPararDeteccaoListaDinamica() {
    if (recorderState.listaDinamicaTimer) {
      window.clearTimeout(recorderState.listaDinamicaTimer);
      recorderState.listaDinamicaTimer = null;
    }
    if (recorderState.listaDinamicaObserver) {
      try { recorderState.listaDinamicaObserver.disconnect(); } catch (_e) {}
      recorderState.listaDinamicaObserver = null;
    }
  }

  // Detecta a lista/dropdown/autocomplete relacionada ao passo indicePasso —
  // chamado logo após capturar um passo (ver recorderRegistrarPasso) ou
  // manualmente via o botão "Detectar lista dinâmica" no painel lateral. Só
  // uma detecção ativa por vez (uma nova cancela a anterior). Primeiro
  // escaneia o DOM JÁ ABERTO na hora (cobre o caso comum de o usuário abrir
  // a lista manualmente antes de clicar em "Detectar"); se nada for achado
  // na hora, continua observando por RECORDER_LISTA_DINAMICA_JANELA_MS à
  // procura de uma que apareça depois (autocompletes com resposta
  // assíncrona). Ao achar um candidato, guarda a sugestão em
  // recorderState.sugestaoListaDinamica — nunca aplica nada sozinho, só fica
  // disponível pro usuário agir no painel lateral (ver
  // recorderHtmlSugestaoListaDinamica).
  function recorderObservarListaDinamica(indicePasso) {
    recorderPararDeteccaoListaDinamica();
    function finalizarComSugestao(sugestao) {
      recorderPararDeteccaoListaDinamica();
      recorderState.sugestaoListaDinamica = {
        indice: indicePasso,
        seletor: sugestao.seletor,
        seletor_tipo: sugestao.seletor_tipo,
        generico: sugestao.generico,
        estabilidade: sugestao.estabilidade,
      };
      // Só re-renderiza agora se o passo detectado ainda é o selecionado no
      // painel — evita reflow indevido se o usuário já mudou de seleção
      // enquanto a detecção rodava em background; a sugestão fica guardada e
      // aparece normalmente quando ele voltar a selecionar esse passo.
      if (recorderState.painelLateralIndiceSelecionado === indicePasso) recorderRenderPainelLateral();
    }

    var jaAberto = recorderEscanearListaDinamica();
    if (jaAberto) { finalizarComSugestao(jaAberto); return; }

    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        if (added.length === 0) continue;
        // Prioriza os nós recém-inseridos por ESTA mutação (o que acabou de
        // aparecer por causa da interação do usuário) antes de cair no
        // escaneamento geral do documento — mais preciso (evita pegar um
        // data-cy indexado que já estava na tela o tempo todo, tipo
        // menu/sidebar) e mais rápido.
        for (var a = 0; a < added.length; a++) {
          var seletorNo = recorderMelhorCandidatoDataCyIndexado(recorderCandidatosDataCyEm(added[a]));
          if (seletorNo) {
            finalizarComSugestao({ seletor: seletorNo, seletor_tipo: 'css', generico: false, estabilidade: RECORDER_ESTABILIDADE_ALTA });
            return;
          }
        }
        // Nada nos nós recém-inseridos — tenta o escaneamento geral (cobre
        // o fallback CSS genérico e mutações que só revelaram/mudaram
        // atributos de um item já existente, sem inserir nó novo com o
        // data-cy em si). Continua protegido pela mesma validação de região/
        // irmãos (ver recorderEscanearListaDinamica).
        var achado = recorderEscanearListaDinamica();
        if (achado) { finalizarComSugestao(achado); return; }
      }
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (_e) {
      return;
    }
    recorderState.listaDinamicaObserver = observer;
    recorderState.listaDinamicaTimer = window.setTimeout(recorderPararDeteccaoListaDinamica, RECORDER_LISTA_DINAMICA_JANELA_MS);
  }

  // Persistência em sessionStorage — sobrevive a reload/navegação de página
  // inteira na mesma aba (o que uma SPA sem reload já não precisa, resolvido
  // à parte pelo poll de URL). Só grava o que é serializável e faz sentido
  // atravessar um reload: ativo/pausado/meta/passos/navegações. Nunca grava
  // referências a elementos do DOM (inputTimers/elParaIndice/ultimoEl) — não
  // sobreviveriam a um reload de qualquer forma, então são sempre zerados de
  // novo ao (re)iniciar a captura, na página nova.
  function recorderPersistir() {
    try {
      if (!recorderState.ativo) {
        window.sessionStorage.removeItem(RECORDER_STORAGE_KEY);
        return;
      }
      var dados = {
        ativo: true,
        pausado: recorderState.pausado,
        meta: recorderState.meta,
        contexto: recorderState.contexto,
        passos: recorderState.passos,
        navegacoes: recorderState.navegacoes,
        revisarCadaPasso: recorderState.revisarCadaPasso,
        revisarTempoReal: recorderState.revisarTempoReal,
      };
      window.sessionStorage.setItem(RECORDER_STORAGE_KEY, JSON.stringify(dados));
    } catch (_e) { /* sessionStorage indisponível (modo privado, quota etc.) — segue só em memória */ }
  }

  function recorderLimparPersistencia() {
    try { window.sessionStorage.removeItem(RECORDER_STORAGE_KEY); } catch (_e) {}
  }

  function recorderCarregarPersistido() {
    try {
      var bruto = window.sessionStorage.getItem(RECORDER_STORAGE_KEY);
      if (!bruto) return null;
      var dados = JSON.parse(bruto);
      if (!dados || !dados.ativo) return null;
      return dados;
    } catch (_e) {
      return null;
    }
  }

  // Cobre TODA a UI própria do gravador: barra principal, painel (revisão,
  // final ou escolha de seletor — reaproveitam o mesmo container) e a barra
  // de "Trocar elemento". Usado tanto na captura normal quanto na captura de
  // troca de elemento, pra nunca tratar um clique na própria UI do gravador
  // como interação com a tela do host.
  function recorderElementoNaBarra(el) {
    if (!el || !el.closest) return false;
    try {
      return Boolean(el.closest('#' + RECORDER_BAR_ID + ', #' + RECORDER_PAINEL_ID + ', #' + RECORDER_TROCA_BAR_ID + ', #' + RECORDER_LOCALIZAR_BAR_ID + ', #' + RECORDER_MINI_REVISAO_ID + ', #' + RECORDER_PAINEL_LATERAL_ID));
    } catch (_e) {
      return false;
    }
  }

  // Heurística por atributos do próprio elemento — nunca pelo valor digitado
  // (que este gravador nunca lê). Cobre os casos citados: senha, CPF, e-mail,
  // telefone, cartão. Propositalmente ampla — prefere ignorar demais a
  // capturar de menos nesse tipo de campo.
  var REGEX_CAMPO_SENSIVEL_GRAVADOR = /senha|password|cpf|cnpj|e-?mail|telefone|phone|celular|cart[aã]o|\bcvv\b|\bcvc\b|token|secret/i;

  function recorderCampoSensivel(el) {
    if (!el) return false;
    var tipo = ((el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
    if (tipo === 'password') return true;
    var autocomplete = ((el.getAttribute && el.getAttribute('autocomplete')) || '').toLowerCase();
    if (autocomplete.indexOf('cc-') === 0 || autocomplete === 'current-password' || autocomplete === 'new-password') return true;
    var pistas = [
      el.getAttribute && el.getAttribute('data-cy'),
      el.id,
      el.getAttribute && el.getAttribute('name'),
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('placeholder'),
    ].filter(Boolean).join(' ');
    return REGEX_CAMPO_SENSIVEL_GRAVADOR.test(pistas);
  }

  function recorderCssEscapeSimples(valor) {
    return String(valor).replace(/([ #.:[\]"'>+~^$|=(),])/g, '\\$1');
  }

  // Nomes de classe conhecidos por serem gerados/instáveis entre builds ou
  // puramente de biblioteca/framework (Angular, ng-zorro/Ant Design, CSS-in-JS
  // etc.) — nunca identificam o elemento em si, então nunca são usados no
  // seletor de fallback, mesmo quando são a única classe presente.
  var RECORDER_CLASSES_FRAGEIS = /^(ng-|ant-|css-|sc-|jsx-|emotion-|Mui[A-Z])/;

  function recorderClasseEstavel(el) {
    if (!el.className || typeof el.className !== 'string') return '';
    var classes = el.className.trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < classes.length; i++) {
      if (!RECORDER_CLASSES_FRAGEIS.test(classes[i])) return classes[i];
    }
    return '';
  }

  // Fallback quando não há data-cy/id/name/aria-label/href: tag + classe
  // estável (pula classes conhecidas como frágeis — ver
  // RECORDER_CLASSES_FRAGEIS) + posição entre irmãos do mesmo tipo, só o
  // suficiente pra desambiguar — de propósito simples (não é um gerador de
  // caminho CSS único robusto). Último recurso da cadeia de prioridade — ver
  // recorderGerarSeletor.
  function recorderSeletorFallback(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : 'div';
    var classe = recorderClasseEstavel(el);
    var base = classe ? tag + '.' + recorderCssEscapeSimples(classe) : tag;
    var pai = el.parentElement;
    if (pai) {
      var irmaos = [];
      for (var i = 0; i < pai.children.length; i++) {
        if (pai.children[i].tagName === el.tagName) irmaos.push(pai.children[i]);
      }
      if (irmaos.length > 1) {
        base += ':nth-of-type(' + (irmaos.indexOf(el) + 1) + ')';
      }
    }
    return base;
  }

  // Ordem de preferência: data-cy/data-testid/data-test/data-qa → id → aria-
  // label (+ role, se houver) → name → href interno (só <a>) → CSS estrutural
  // como último recurso (marcado fragil:true — ver recorderRegistrarPasso,
  // usado só pra avisar na UI do gravador, nunca bloqueia a captura).
  function recorderGerarSeletor(el) {
    try {
      var dataCy = el.getAttribute && el.getAttribute('data-cy');
      if (dataCy) return { seletor_tipo: 'data_cy', seletor: dataCy };

      // Convenções equivalentes de outros frameworks/times de teste — mesmo
      // princípio do data-cy (atributo dedicado a automação, não muda com
      // redesign visual), só com nomes diferentes.
      var attrsAlternativos = ['data-testid', 'data-test', 'data-qa'];
      for (var i = 0; i < attrsAlternativos.length; i++) {
        var valorAlt = el.getAttribute && el.getAttribute(attrsAlternativos[i]);
        if (valorAlt) {
          return { seletor_tipo: 'css', seletor: '[' + attrsAlternativos[i] + '="' + recorderCssEscapeAtributo(valorAlt) + '"]' };
        }
      }

      // Ids gerados dinamicamente por overlays de framework (ver
      // recorderEhIdOverlayDinamico) mudam a cada abertura/sessão — nunca
      // viram o seletor principal de um passo, mesmo clicando direto no
      // elemento; cai pras próximas prioridades (aria-label/name/href/
      // estrutural) como se o elemento não tivesse id nenhum.
      if (el.id && !recorderEhIdOverlayDinamico(el.id)) return { seletor_tipo: 'id', seletor: el.id };

      var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
      if (ariaLabel) {
        var role = el.getAttribute && el.getAttribute('role');
        var seletorAria = role
          ? '[role="' + recorderCssEscapeAtributo(role) + '"][aria-label="' + recorderCssEscapeAtributo(ariaLabel) + '"]'
          : '[aria-label="' + recorderCssEscapeAtributo(ariaLabel) + '"]';
        return { seletor_tipo: 'css', seletor: seletorAria };
      }

      var name = el.getAttribute && el.getAttribute('name');
      if (name) {
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        return { seletor_tipo: 'css', seletor: tag + '[name="' + recorderCssEscapeAtributo(name) + '"]' };
      }

      // Link com destino interno (mesma origem ou caminho relativo) — o href
      // tende a ser bem mais estável que classes/estrutura, mesmo sem
      // data-cy/id/name (comum em menus/navegação de SPA).
      var tagLower = el.tagName ? el.tagName.toLowerCase() : '';
      if (tagLower === 'a' && el.getAttribute) {
        var href = el.getAttribute('href');
        if (href && (href.charAt(0) === '/' || href.indexOf(window.location.origin) === 0)) {
          var caminho = href.indexOf(window.location.origin) === 0 ? href.slice(window.location.origin.length) : href;
          return { seletor_tipo: 'css', seletor: 'a[href="' + recorderCssEscapeAtributo(caminho) + '"]' };
        }
      }

      // Item de lista/dropdown/autocomplete conhecido, sem nenhum dos
      // identificadores acima (ex.: item do Ant Design sem data-cy) — usa o
      // mesmo fallback CSS concreto e conhecido da detecção de lista
      // dinâmica (ver RECORDER_FALLBACK_LISTA_DINAMICA/
      // recorderMelhorSeletorFallbackLista) em vez de cair direto no
      // fallback estrutural genérico (tag+classe+nth-of-type), que tende a
      // ser mais frágil e mais confuso pra esse tipo de elemento.
      if (recorderEhItemDropdown(el)) {
        var fallbackListaItem = recorderMelhorSeletorFallbackLista();
        if (fallbackListaItem) {
          return { seletor_tipo: 'css', seletor: fallbackListaItem.seletor, fragil: true };
        }
      }

      return { seletor_tipo: 'css', seletor: recorderSeletorFallback(el), fragil: true };
    } catch (_e) {
      return { seletor_tipo: 'css', seletor: el.tagName ? el.tagName.toLowerCase() : '*', fragil: true };
    }
  }

  // Lista de candidatos pra "Trocar elemento" na revisão — mesma ordem de
  // preferência de recorderGerarSeletor, mas retorna TODAS as opções
  // disponíveis (não só a melhor) pra o usuário escolher, cada uma validada
  // de verdade contra a página (document.querySelectorAll) — a qualidade não
  // é mais um rótulo fixo por tipo de atributo, e sim o resultado real da
  // busca: 1 match = bom, mais de 1 = frágil, seletor inválido = descartado.
  //
  // Compatibilidade: 'data_cy' (valor bruto, sem montar CSS), 'css' (qualquer
  // outro candidato, sempre um seletor CSS de verdade, nunca dependente de
  // texto — CSS não seleciona por conteúdo textual) e 'area' (mesmo formato
  // de seletor do 'css', mas o alvo é um container/grupo — ver candidato
  // "Área" gerado em recorderGerarCandidatosSeletor).
  var RECORDER_TIPOS_SELETOR_VALIDOS = ['data_cy', 'css', 'area'];

  // Escaping seguro pra valores usados DENTRO de um seletor de atributo entre
  // aspas (ex.: [name="valor"]) — diferente de recorderCssEscapeSimples, que
  // escapa caracteres especiais de CSS fora de aspas (ex.: #id). Aqui só
  // precisa escapar barra invertida e a própria aspa que delimita a string
  // (a ordem importa: escapa a barra invertida primeiro).
  function recorderCssEscapeAtributo(valor) {
    return String(valor).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  // Quantos elementos um seletor CSS bate na página agora — usado tanto pra
  // decidir a qualidade (1=bom, >1=frágil) quanto pra descartar seletor
  // inválido (querySelectorAll lança exceção pra sintaxe malformada).
  // Retorna -1 nesse caso, nunca deixa a exceção escapar pra quem chamou.
  function recorderValidarSeletorCss(seletor) {
    try {
      return document.querySelectorAll(seletor).length;
    } catch (_e) {
      return -1;
    }
  }

  // Ids/tags de containers-raiz conhecidos que nunca fazem sentido como
  // âncora de "Área" — costumam envolver a aplicação inteira (ex.: <app-root>
  // do Angular, <main> semântico, #root do React), não um grupo específico
  // de campos. Comparação de id é case-insensitive porque frameworks variam
  // a caixa (ex.: "App" vs "app-root").
  var RECORDER_IDS_RAIZ_INADEQUADOS = /^(app-root|app|root|main|application|__next)$/i;
  var RECORDER_TAGS_RAIZ_INADEQUADAS = { MAIN: true, HTML: true, BODY: true };

  // Um ancestral que cobre quase a viewport inteira (largura E altura) não é
  // um "grupo" útil pra destacar — é a página toda. Limiar de 90% em vez de
  // 100% pra cobrir containers com scroll/overflow que arredondam o rect.
  function recorderContainerEnorme(el) {
    try {
      var r = el.getBoundingClientRect();
      var larguraJanela = window.innerWidth;
      var alturaJanela = window.innerHeight;
      if (!larguraJanela || !alturaJanela) return false;
      return r.width >= larguraJanela * 0.9 && r.height >= alturaJanela * 0.9;
    } catch (_e) {
      return false;
    }
  }

  function recorderAncoraInadequada(el) {
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (RECORDER_TAGS_RAIZ_INADEQUADAS[tag]) return true;
    if (el.id && RECORDER_IDS_RAIZ_INADEQUADOS.test(el.id)) return true;
    return recorderContainerEnorme(el);
  }

  // Sobe no máximo 5 níveis a partir do pai do elemento clicado procurando um
  // ancestral "estável" (data-cy > id > aria-label > role > classe estável,
  // nessa ordem de prioridade) pra qualificar seletores ambíguos e sugerir
  // "Área" — nunca usa <html>/<body>/<main>, containers-raiz conhecidos
  // (ver RECORDER_IDS_RAIZ_INADEQUADOS) ou um container que cobre quase toda
  // a viewport (ver recorderContainerEnorme) como âncora, mesmo dentro do
  // limite de níveis: continua subindo em vez de parar neles.
  function recorderAncoraAncestral(el) {
    var atual = el.parentElement;
    var niveis = 0;
    while (atual && niveis < 5) {
      var inadequado = atual === document.body || atual === document.documentElement || recorderAncoraInadequada(atual);
      if (!inadequado) {
        var dataCy = atual.getAttribute && atual.getAttribute('data-cy');
        if (dataCy) return '[data-cy="' + recorderCssEscapeAtributo(dataCy) + '"]';
        // Mesma guarda de recorderGerarSeletor — nunca usa um id de overlay
        // dinâmico (ex.: um ancestral que por acaso é o painel de overlay do
        // framework) como âncora; continua procurando aria-label/role/classe.
        if (atual.id && !recorderEhIdOverlayDinamico(atual.id)) return '#' + recorderCssEscapeSimples(atual.id);
        var ariaLabel = atual.getAttribute && atual.getAttribute('aria-label');
        if (ariaLabel) return '[aria-label="' + recorderCssEscapeAtributo(ariaLabel) + '"]';
        var role = atual.getAttribute && atual.getAttribute('role');
        if (role) return '[role="' + recorderCssEscapeAtributo(role) + '"]';
        // Último recurso antes de subir mais um nível: uma classe própria
        // não gerada por framework (ver RECORDER_CLASSES_FRAGEIS) — só
        // qualifica como âncora se a busca a seguir (recorderGerarCandidatosSeletor)
        // confirmar que ela resolve pra um único elemento na página.
        var classeEstavel = recorderClasseEstavel(atual);
        if (classeEstavel) return '.' + recorderCssEscapeSimples(classeEstavel);
      }
      atual = atual.parentElement;
      niveis++;
    }
    return null;
  }

  // Fragmentos de seletor CSS baseados só nos atributos do próprio elemento
  // clicado (sem ancestral ainda) — cada um validado individualmente depois.
  // Bare (ex.: [name="x"]) e qualificado por tag (ex.: input[name="x"]) são
  // gerados como candidatos separados: a validação real decide qual é único.
  function recorderFragmentosLocais(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    var fragmentos = [];

    if (el.id) fragmentos.push({ rotulo: 'id', seletor: '#' + recorderCssEscapeSimples(el.id) });

    var name = el.getAttribute && el.getAttribute('name');
    if (name) {
      fragmentos.push({ rotulo: 'name', seletor: '[name="' + recorderCssEscapeAtributo(name) + '"]' });
      fragmentos.push({ rotulo: 'tag+name', seletor: tag + '[name="' + recorderCssEscapeAtributo(name) + '"]' });
    }

    var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (ariaLabel) {
      fragmentos.push({ rotulo: 'aria-label', seletor: '[aria-label="' + recorderCssEscapeAtributo(ariaLabel) + '"]' });
      fragmentos.push({ rotulo: 'tag+aria-label', seletor: tag + '[aria-label="' + recorderCssEscapeAtributo(ariaLabel) + '"]' });
    }

    var title = el.getAttribute && el.getAttribute('title');
    if (title) {
      fragmentos.push({ rotulo: 'title', seletor: '[title="' + recorderCssEscapeAtributo(title) + '"]' });
      fragmentos.push({ rotulo: 'tag+title', seletor: tag + '[title="' + recorderCssEscapeAtributo(title) + '"]' });
    }

    var role = el.getAttribute && el.getAttribute('role');
    if (role) {
      fragmentos.push({ rotulo: 'role', seletor: '[role="' + recorderCssEscapeAtributo(role) + '"]' });
      fragmentos.push({ rotulo: 'tag+role', seletor: tag + '[role="' + recorderCssEscapeAtributo(role) + '"]' });
    }

    var tipo = el.getAttribute && el.getAttribute('type');
    if (tipo) fragmentos.push({ rotulo: 'tag+type', seletor: tag + '[type="' + recorderCssEscapeAtributo(tipo) + '"]' });

    return fragmentos;
  }

  function recorderGerarCandidatosSeletor(el) {
    var candidatos = [];
    // Calculado uma vez, fora do if/else de baixo — reaproveitado tanto pra
    // qualificar seletores CSS ambíguos (ramo 'else' de sempre) quanto pra
    // sugerir "Área" logo abaixo, que precisa dele mesmo quando o elemento
    // clicado já tem data-cy próprio (ramo 'if').
    var ancora = null;
    try { ancora = recorderAncoraAncestral(el); } catch (_e) { ancora = null; }
    try {
      var dataCy = el.getAttribute && el.getAttribute('data-cy');
      if (dataCy) {
        // data-cy é prioridade máxima — não precisa de alternativas CSS.
        candidatos.push({ rotulo: 'data-cy', seletor_tipo: 'data_cy', seletor: dataCy, qualidade: 'recomendado', quantidade: null });
      } else {
        var fragmentos = recorderFragmentosLocais(el);

        fragmentos.forEach(function (frag) {
          var qtd = recorderValidarSeletorCss(frag.seletor);
          if (qtd <= 0) return; // invalido (-1) ou não bate nem no próprio elemento (0) — descarta

          if (qtd === 1) {
            candidatos.push({ rotulo: frag.rotulo, seletor_tipo: 'css', seletor: frag.seletor, qualidade: 'bom', quantidade: qtd });
            return;
          }

          // Ambíguo isolado (qtd > 1) — só recorre ao ancestral quando ele
          // realmente resolve a ambiguidade (fica único com ele).
          if (ancora) {
            var seletorAncorado = ancora + ' ' + frag.seletor;
            var qtdAncorado = recorderValidarSeletorCss(seletorAncorado);
            if (qtdAncorado === 1) {
              candidatos.push({ rotulo: 'ancestral + ' + frag.rotulo, seletor_tipo: 'css', seletor: seletorAncorado, qualidade: 'bom', quantidade: qtdAncorado });
              return;
            }
          }

          candidatos.push({ rotulo: frag.rotulo, seletor_tipo: 'css', seletor: frag.seletor, qualidade: 'fragil', quantidade: qtd });
        });

        var fallback = recorderSeletorFallback(el);
        var qtdFallback = recorderValidarSeletorCss(fallback);
        candidatos.push({ rotulo: 'CSS (fallback)', seletor_tipo: 'css', seletor: fallback, qualidade: 'fragil', quantidade: qtdFallback > 0 ? qtdFallback : null });
      }
    } catch (_e) {
      candidatos.push({ rotulo: 'CSS (fallback)', seletor_tipo: 'css', seletor: el.tagName ? el.tagName.toLowerCase() : '*', qualidade: 'fragil', quantidade: null });
    }

    // Sugestão de "Área" — destaca o container pai em vez do elemento clicado
    // sozinho. Útil quando o passo é sobre um GRUPO (ex.: "Use os filtros da
    // agenda" destacando clínica+convênio+especialidade juntos), não sobre um
    // campo isolado. Só sugere quando o ancestral resolve pra um único
    // elemento na tela — um seletor de área ambíguo destacaria o container
    // errado (ou vários) sem nenhum aviso pro usuário do tour.
    if (ancora) {
      var qtdArea = recorderValidarSeletorCss(ancora);
      if (qtdArea === 1) {
        candidatos.push({ rotulo: 'container pai', seletor_tipo: 'area', seletor: ancora, qualidade: 'area', quantidade: qtdArea });
      }
    }

    // Categoria de alto nível pra rotular cada candidato na UI de escolha
    // (ver recorderHtmlEscolhaSeletor) — só existem essas duas: 'area' é o
    // container pai gerado acima, todo o resto é sempre o próprio elemento
    // clicado, qualquer que seja o atributo usado pra localizá-lo.
    candidatos.forEach(function (c) { c.categoria = c.seletor_tipo === 'area' ? 'area' : 'elemento'; });

    var ORDEM_QUALIDADE = { recomendado: 0, bom: 1, fragil: 2, area: 3 };
    candidatos.sort(function (a, b) { return ORDEM_QUALIDADE[a.qualidade] - ORDEM_QUALIDADE[b.qualidade]; });
    return candidatos;
  }

  // botão/link/menu → ao_clicar; input/textarea/select e autocomplete/combobox
  // /search/dropdown (por role ou por nome) → ao_alterar_valor; item de
  // lista/dropdown/autocomplete (ex.: <li class="ant-select-dropdown-menu-item">)
  // → ao_clicar, SEMPRE — checado antes da heurística de pistas abaixo, que
  // testa a própria classe do elemento por "dropdown" e classificaria
  // erradamente um ITEM da lista (não o campo que abre) como "Preencher
  // valor" (sua classe geralmente contém a palavra "dropdown" também). Um
  // item de lista não tem valor nenhum pra preencher — a única interação
  // que faz sentido nele é clique (ver recorderEhItemDropdown).
  function recorderInferirModo(el) {
    if (recorderEhItemDropdown(el)) return 'ao_clicar';
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'ao_alterar_valor';
    var role = el.getAttribute && el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return 'ao_alterar_valor';
    var pistas = [
      el.getAttribute && el.getAttribute('data-cy'),
      el.id,
      (el.className && typeof el.className === 'string') ? el.className : '',
    ].filter(Boolean).join(' ');
    if (/autocomplete|combobox|search|busca|dropdown/i.test(pistas)) return 'ao_alterar_valor';
    return 'ao_clicar';
  }

  // Acima disso, o texto de um item de lista/dropdown provavelmente não é
  // mais o rótulo de UM item só (ex.: o alvo capturado acabou sendo um
  // container com vários itens dentro, cujo textContent concatena o texto
  // de todos eles) — o título genérico curto é mais seguro que expor esse
  // texto bruto truncado no meio de uma palavra.
  var RECORDER_TITULO_ITEM_LISTA_MAX = 40;

  // Título específico pra item de lista/dropdown (ver recorderEhItemDropdown)
  // — "Selecionar <texto do item>" quando o texto é curto o bastante pra ser
  // razoavelmente o rótulo de um item só; "Selecionar item da lista" como
  // fallback curto e genérico caso contrário (sem texto, ou texto longo
  // demais pra ser um item único). Nunca concatena o texto de vários itens.
  function recorderGerarTituloItemLista(el) {
    var texto = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (texto && texto.length <= RECORDER_TITULO_ITEM_LISTA_MAX) return 'Selecionar ' + texto;
    return 'Selecionar item da lista';
  }

  // Só usa texto/atributos estáticos da própria UI (rótulo do botão, placeholder,
  // name) — nunca o valor digitado pelo usuário.
  function recorderGerarTitulo(el) {
    // Item de lista/dropdown tem uma regra própria e mais curta (ver
    // recorderGerarTituloItemLista) — checado antes do texto genérico
    // abaixo, que não tem limite de tamanho pensado pra esse caso.
    if (recorderEhItemDropdown(el)) return recorderGerarTituloItemLista(el);
    var texto = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (texto) return texto.length > 60 ? texto.slice(0, 57) + '...' : texto;
    var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    var placeholder = el.getAttribute && el.getAttribute('placeholder');
    if (placeholder) return 'Preencha: ' + placeholder;
    var name = el.getAttribute && el.getAttribute('name');
    if (name) return 'Campo: ' + name;
    return 'Interaja com ' + (el.tagName ? el.tagName.toLowerCase() : 'elemento');
  }

  // ─── Sugestões simples de descrição (sem IA externa) ──────────────────────
  // Heurística por palavra-chave nos mesmos atributos estáticos já usados
  // pra gerar seletor/título (data-cy, id, classe, aria-label, placeholder) —
  // nunca lê texto digitado pelo usuário. Só preenche um ponto de partida
  // pro admin editar depois (ver uso em recorderRegistrarPasso/
  // recorderAplicarNovoSeletor, que nunca sobrescrevem descrição já
  // preenchida) — não pretende ser a frase final do passo.
  var RECORDER_SUGESTAO_FILTRO = /filtro|filter/i;
  var RECORDER_SUGESTAO_BUSCA = /busca|pesquis|search/i;
  var RECORDER_SUGESTAO_BOTAO = /bot[aã]o|button|\bbtn\b|a[cç][aã]o|salvar|confirmar|enviar|executar/i;

  function recorderSugerirDescricao(el, categoria) {
    var pistas = [
      el.getAttribute && el.getAttribute('data-cy'),
      el.id,
      (el.className && typeof el.className === 'string') ? el.className : '',
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('placeholder'),
    ].filter(Boolean).join(' ');

    // Filtro/busca valem tanto pro elemento único quanto pra área que os
    // envolve (ex.: "Área (contém este elemento)" ancorada num container de
    // filtros) — checados antes da checagem de categoria.
    if (RECORDER_SUGESTAO_FILTRO.test(pistas)) return 'Use os filtros';
    if (RECORDER_SUGESTAO_BUSCA.test(pistas)) return 'Pesquise registros';
    if (categoria === 'area') return 'Conheça esta área';
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'BUTTON' || RECORDER_SUGESTAO_BOTAO.test(pistas)) return 'Execute a ação';
    return '';
  }

  // Resumo curto do passo (só o título, truncado) — usado na barra pra
  // mostrar "o último passo capturado" sem expor nada além do que já é
  // texto estático da própria UI do host (nunca valor digitado).
  function recorderResumoPasso(p) {
    var titulo = (p.titulo || '').trim();
    if (titulo.length > 40) titulo = titulo.slice(0, 37) + '...';
    return titulo || '(sem título)';
  }

  // Mesma ideia, usado no cabeçalho do card na revisão — mas sem o fallback
  // "(sem título)": ali o alerta de "título vazio" já cobre esse caso, então
  // aqui simplesmente não mostra nada quando não há título ("se existir").
  function recorderResumoTituloRevisao(p) {
    var titulo = (p.titulo || '').trim();
    if (!titulo) return '';
    return titulo.length > 46 ? titulo.slice(0, 43) + '...' : titulo;
  }

  function recorderAtualizarBarra() {
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (!bar) return;
    var contador = bar.querySelector('[data-up-rec-contador]');
    if (contador) {
      var n = recorderState.passos.length;
      contador.textContent = n + ' passo' + (n === 1 ? '' : 's');
    }
    var ultimoEl = bar.querySelector('[data-up-rec-ultimo]');
    if (ultimoEl) {
      var ultimoPasso = recorderState.passos[recorderState.passos.length - 1];
      ultimoEl.textContent = ultimoPasso ? ('· Último: ' + recorderResumoPasso(ultimoPasso)) : '';
    }
    // Estado pausado precisa ficar óbvio de relance (bolinha/rótulo mudam de
    // cor — CSS via .up-rec-bar-pausado) e o botão Pausar/Continuar precisa
    // virar a ação em destaque (ícone+texto+cor primária) quando pausado.
    // Texto sempre visível nos botões (nunca só title) — evita o tooltip
    // nativo do navegador aparecendo por cima da toolbar ao passar o mouse.
    // Só a barra flutuante (sempre no rodapé, nunca centralizada) indica o
    // estado pausado — sem card/overlay extra no centro da tela, que só
    // atrapalharia a navegação no sistema hospedeiro sem agregar informação
    // que a barra já não mostrasse.
    bar.classList.toggle('up-rec-bar-pausado', recorderState.pausado);
    var labelEl = bar.querySelector('[data-up-rec-status-label]');
    if (labelEl) labelEl.textContent = recorderState.pausado ? 'Pausado' : 'Gravando Tour';
    var botaoPausa = bar.querySelector('[data-up-rec-pause]');
    if (botaoPausa) {
      botaoPausa.classList.toggle('up-rec-btn-primary', recorderState.pausado);
      botaoPausa.innerHTML = recorderState.pausado
        ? (icon('play') + '<span>Continuar</span>')
        : (icon('pause') + '<span>Pausar</span>');
    }
    var botaoDesfazer = bar.querySelector('[data-up-rec-undo]');
    if (botaoDesfazer) botaoDesfazer.disabled = recorderState.passos.length === 0;
  }

  // Aviso discreto e temporário na própria barra flutuante (ex.: tentar
  // finalizar sem nenhum passo capturado) — some sozinho depois de alguns
  // segundos. Cancela qualquer aviso anterior ainda visível antes de mostrar
  // um novo, pra não sobrepor mensagens.
  var RECORDER_AVISO_BARRA_MS = 4000;
  var recorderAvisoBarraTimer = null;

  function recorderMostrarAvisoBarra(texto) {
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (!bar) return;
    var aviso = bar.querySelector('[data-up-rec-aviso]');
    if (!aviso) return;
    if (recorderAvisoBarraTimer) window.clearTimeout(recorderAvisoBarraTimer);
    aviso.textContent = texto;
    aviso.classList.add('up-rec-aviso-visivel');
    recorderAvisoBarraTimer = window.setTimeout(function () {
      recorderAvisoBarraTimer = null;
      aviso.classList.remove('up-rec-aviso-visivel');
      aviso.textContent = '';
    }, RECORDER_AVISO_BARRA_MS);
  }

  function recorderRegistrarPasso(el, modo) {
    var sel = recorderGerarSeletor(el);
    var passo = {
      titulo: recorderGerarTitulo(el),
      // Ponto de partida simples (ver recorderSugerirDescricao) — o admin
      // sempre pode editar/apagar na revisão; nunca é a frase final.
      descricao: recorderSugerirDescricao(el, 'elemento'),
      seletor_tipo: sel.seletor_tipo,
      seletor: sel.seletor,
      tooltip_posicao: 'auto',
      // Item de lista/dropdown/autocomplete: clicar no elemento destacado é
      // o único jeito de avançar por ele de verdade (não há "Próximo"
      // clicável de outra forma, já que o próprio item some assim que a
      // lista fecha) — mesmo padrão usado por "Criar próximo passo" na
      // sugestão de lista dinâmica (ver recorderEhItemDropdown).
      acao_ao_avancar: recorderEhItemDropdown(el) ? 'clicar_elemento' : 'apenas_avancar',
      modo_avanco_interacao: modo,
      seletor_confirmacao: null,
      // Agrupamento visual opcional no painel lateral (ver
      // recorderAgruparPassosPorSecao) — nunca preenchido automaticamente,
      // só pelo campo "Seção" no detalhe do passo.
      secao: '',
    };
    recorderState.passos.push(passo);
    recorderState.elParaIndice.set(el, recorderState.passos.length - 1);
    recorderAtualizarBarra();
    recorderPersistir();
    // Passo acabou de ser capturado num input/select/elemento clicável —
    // observa por alguns segundos se uma lista/dropdown/autocomplete
    // relacionada aparece na tela, pra sugerir o seletor do próximo passo
    // sem o usuário precisar descobrir manualmente no DevTools (ver
    // recorderObservarListaDinamica). Nunca aplica nada sozinho.
    recorderObservarListaDinamica(recorderState.passos.length - 1);
    // Aviso na hora, quando recorderGerarSeletor() não achou nada melhor que
    // o fallback estrutural (tag+classe+nth-of-type) — dá a chance de ajustar
    // o seletor manualmente (painel lateral) ou pelo "Trocar elemento" antes
    // de seguir gravando. Não bloqueia a captura, só avisa.
    if (sel.fragil) {
      recorderMostrarAvisoBarra('Seletor frágil capturado para "' + passo.titulo + '" — considere ajustar manualmente.');
    }
    // Opcional (desativado por padrão) — painel lateral não-bloqueante:
    // o passo recém capturado fica selecionado automaticamente. Não pausa a
    // captura — o usuário continua clicando normalmente.
    if (recorderState.revisarTempoReal) {
      recorderState.painelLateralIndiceSelecionado = recorderState.passos.length - 1;
      recorderRenderPainelLateral();
    }
    // Opcional (desativado por padrão) — mini revisão logo após o clique. Só
    // dispara quando o usuário ligou a opção na barra; captura rápida
    // continua sendo o comportamento padrão.
    if (recorderState.revisarCadaPasso) {
      recorderAbrirMiniRevisao(recorderState.passos.length - 1);
    }
  }

  // ─── Mini revisão pós-clique (opcional) ───────────────────────────────────
  // Só título/descrição/posição do tooltip/modo de avanço — de propósito bem
  // mais enxuta que o painel de revisão final (sem alertas/sugestões/trocar
  // elemento), pra não virar uma segunda tela pesada a cada clique. Reaproveita
  // recorderHtmlPreview (mesmo mockup da revisão final) sem duplicar nada.

  // attrNome parametrizado pra reaproveitar tanto no mini painel
  // (data-miniv-campo) quanto no painel lateral (data-lat-campo) sem duplicar
  // a função — só muda qual atributo o listener delegado de cada painel lê.
  // titulos (opcional, ex.: RECORDER_MODOS_AVANCO_TITULO) vira o title de
  // cada <option> e do próprio <select> (reflete a opção selecionada) —
  // explica a opção sem aumentar a altura do campo.
  function recorderSimpleSelectHtml(attrNome, campo, valorAtual, opcoes, titulos) {
    var options = opcoes.map(function (o) {
      var titulo = titulos && titulos[o.value];
      return '<option value="' + escapeHtml(o.value) + '"' + (o.value === valorAtual ? ' selected' : '') + (titulo ? ' title="' + escapeHtml(titulo) + '"' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    var tituloAtual = titulos && titulos[valorAtual];
    return '<select class="up-rec-input" ' + attrNome + '="' + campo + '"' + (tituloAtual ? ' title="' + escapeHtml(tituloAtual) + '"' : '') + '>' + options + '</select>';
  }

  function recorderHtmlMiniRevisao(passo, indice, total) {
    return [
      '<div class="up-rec-modal up-rec-modal-mini">',
      '<p class="up-rec-modal-title">Passo capturado</p>',
      '<p class="up-rec-modal-sub">Revise este passo antes de continuar gravando — ou desative "Revisar cada passo após o clique" na barra pra pular esta etapa.</p>',
      recorderHtmlPreview(passo, indice, total),
      '<label class="up-rec-revisao-label-principal">Título</label>',
      '<input type="text" class="up-rec-input" data-miniv-campo="titulo" value="' + escapeHtml(passo.titulo || '') + '">',
      '<label class="up-rec-revisao-label-principal">Descrição</label>',
      '<textarea class="up-rec-textarea-sm" data-miniv-campo="descricao">' + escapeHtml(passo.descricao || '') + '</textarea>',
      '<div class="up-rec-revisao-grid" style="margin-top:2px">',
      '<div><span class="up-rec-revisao-label">Posição do tooltip</span>' + recorderSimpleSelectHtml('data-miniv-campo', 'tooltip_posicao', passo.tooltip_posicao, RECORDER_TOOLTIP_POSICOES) + '</div>',
      '<div><span class="up-rec-revisao-label">Como avançar</span>' + recorderSimpleSelectHtml('data-miniv-campo', 'modo_avanco_interacao', passo.modo_avanco_interacao, RECORDER_MODOS_AVANCO, RECORDER_MODOS_AVANCO_TITULO) + '</div>',
      '</div>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="up-rec-btn up-rec-btn-danger" data-miniv-ignorar>Ignorar este clique</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-miniv-finalizar>Finalizar gravação</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-miniv-salvar>Salvar e continuar</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Pausa a captura enquanto o mini painel está aberto. Não precisa lembrar
  // um "pausado anterior" pra restaurar (diferente da revisão final): só
  // chega aqui vindo de recorderRegistrarPasso, que só roda quando NÃO
  // estava pausado — recorderCapturarClique/Valor já não registram passo
  // nenhum com recorderState.pausado true.
  function recorderAbrirMiniRevisao(indice) {
    var passo = recorderState.passos[indice];
    if (!passo) return;
    recorderState.pausado = true;

    var existente = document.getElementById(RECORDER_MINI_REVISAO_ID);
    if (existente) existente.remove();

    var root = document.createElement('div');
    root.id = RECORDER_MINI_REVISAO_ID;
    root.className = 'up-rec-overlay';
    root.innerHTML = recorderHtmlMiniRevisao(passo, indice, recorderState.passos.length);
    document.body.appendChild(root);

    root.addEventListener('input', function (event) { recorderMiniRevisaoOnInput(event, indice); });
    root.addEventListener('change', function (event) { recorderMiniRevisaoOnInput(event, indice); });
    root.addEventListener('click', function (event) { recorderMiniRevisaoOnClick(event, indice); });
  }

  function recorderMiniRevisaoOnInput(event, indice) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;
    var campo = alvo.getAttribute('data-miniv-campo');
    if (!campo) return;
    var passo = recorderState.passos[indice];
    if (!passo) return;
    passo[campo] = alvo.value;
    recorderPersistir();

    // Title do select acompanha a opção escolhida — o rótulo visível é
    // curto de propósito, a explicação completa só aparece no hover.
    if (campo === 'modo_avanco_interacao' && RECORDER_MODOS_AVANCO_TITULO[alvo.value]) {
      alvo.title = RECORDER_MODOS_AVANCO_TITULO[alvo.value];
    }

    if (campo !== 'titulo' && campo !== 'descricao') return;
    var root = document.getElementById(RECORDER_MINI_REVISAO_ID);
    if (!root) return;
    if (campo === 'titulo') {
      var previewTitulo = root.querySelector('[data-rev-preview-titulo="' + indice + '"]');
      if (previewTitulo) {
        var semTitulo = !passo.titulo || !passo.titulo.trim();
        previewTitulo.textContent = semTitulo ? 'Título do passo' : passo.titulo;
        previewTitulo.classList.toggle('up-rec-preview-vazio', semTitulo);
      }
    } else {
      var previewDesc = root.querySelector('[data-rev-preview-desc="' + indice + '"]');
      if (previewDesc) {
        var semDescricao = !passo.descricao || !String(passo.descricao).trim();
        previewDesc.textContent = semDescricao ? 'Descrição do passo (opcional)' : passo.descricao;
        previewDesc.classList.toggle('up-rec-preview-vazio', semDescricao);
      }
    }
  }

  function recorderFecharMiniRevisao() {
    var root = document.getElementById(RECORDER_MINI_REVISAO_ID);
    if (root) root.remove();
  }

  function recorderMiniRevisaoOnClick(event, indice) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;

    if (alvo.closest('[data-miniv-salvar]')) {
      recorderFecharMiniRevisao();
      recorderState.pausado = false;
      recorderAtualizarBarra();
      // Se o painel lateral também estiver ativo (as duas opções não são
      // excludentes), reflete o passo salvo por lá também.
      if (recorderState.revisarTempoReal) {
        recorderState.painelLateralIndiceSelecionado = indice;
        recorderRenderPainelLateral();
      }
      return;
    }

    if (alvo.closest('[data-miniv-ignorar]')) {
      recorderState.passos.splice(indice, 1);
      recorderPersistir();
      recorderFecharMiniRevisao();
      recorderState.pausado = false;
      recorderAtualizarBarra();
      if (recorderState.revisarTempoReal) {
        recorderState.painelLateralIndiceSelecionado = recorderState.passos.length ? recorderState.passos.length - 1 : null;
        recorderRenderPainelLateral();
      }
      return;
    }

    if (alvo.closest('[data-miniv-finalizar]')) {
      recorderFecharMiniRevisao();
      recorderFinalizar(); // já cuida de pausar, fechar o painel lateral e abrir a revisão final
      return;
    }
  }

  // ─── Painel lateral "Passos capturados" (revisarTempoReal, opcional) ─────
  // Não pausa a captura — usuário continua clicando normalmente enquanto o
  // painel mostra/edita os passos já capturados. Recolhível (vira uma pill
  // com contador) e sempre lê/escreve direto em recorderState.passos, então
  // nunca fica "fora de sincronia" com o que a gravação já capturou.

  function recorderHtmlPainelLateralItem(p, i, ativo) {
    return [
      // draggable=true habilita reordenar por arrastar (ver recorderPainelLateralOnDragStart
      // e cia.) — o botão continua funcionando por clique normalmente
      // (dragstart só dispara com um gesto de arrasto de verdade, nunca num
      // clique simples).
      '<button type="button" class="up-rec-lateral-item' + (ativo ? ' up-rec-lateral-item-ativo' : '') + '" data-lat-selecionar data-lat-index="' + i + '" draggable="true" title="Clique para editar — arraste para reordenar">',
      '<span class="up-rec-lateral-item-numero">' + (i + 1) + '</span>',
      '<span class="up-rec-lateral-item-texto">',
      '<span class="up-rec-lateral-item-rotulo">Passo ' + (i + 1) + (ativo ? ' · editando' : '') + '</span>',
      '<span class="up-rec-lateral-item-resumo">' + escapeHtml(recorderResumoPasso(p)) + '</span>',
      '</span>',
      '</button>',
    ].join('');
  }

  // ─── Alerta de seletor frágil (painel lateral) ─────────────────────────
  // Heurística por texto do seletor — nunca bloqueia salvar/usar o passo, só
  // avisa. Só se aplica a seletor_tipo=css: data-cy é sempre considerado
  // estável (é o próprio propósito do atributo), então nunca entra aqui.
  var RECORDER_FRAGIL_NTH_REGEX = /:nth-child\(|:nth-of-type\(/i;
  // Classes que "cheiram" a geradas por build tool (css-in-js, CSS modules —
  // ex.: css-1a2b3c, sc-AxjAm, styles_button__x7Ff2) ou puramente estruturais/
  // genéricas sem nenhum significado semântico próprio (container, wrapper…).
  var RECORDER_FRAGIL_CLASSE_REGEX = /\.(css|sc|jsx|module)-[a-z0-9]+/i;
  var RECORDER_FRAGIL_CLASSE_GENERICA_REGEX = /\.(container|wrapper|content|inner|outer|row|col|item|box|list|group|panel|section|card|main|body)\d*\b/i;
  var RECORDER_FRAGIL_CLASSE_HASH_REGEX = /\.[a-zA-Z]+_[a-z0-9]{5,}\b/;

  function recorderSeletorEhFragil(passo) {
    if (!passo || passo.seletor_tipo !== 'css' || !passo.seletor || !passo.seletor.trim()) return false;
    var seletor = passo.seletor.trim();
    if (RECORDER_FRAGIL_NTH_REGEX.test(seletor)) return true;
    if (RECORDER_FRAGIL_CLASSE_REGEX.test(seletor) || RECORDER_FRAGIL_CLASSE_HASH_REGEX.test(seletor)) return true;
    // Caminho longo com vários ">" — estrutura profunda, quebra fácil com
    // qualquer mudança de markup.
    if ((seletor.match(/>/g) || []).length >= 2) return true;
    // Classe genérica (container/wrapper/...) sem nenhum id/atributo que
    // ancore num identificador estável junto — sozinha, é muito rasa.
    if (RECORDER_FRAGIL_CLASSE_GENERICA_REGEX.test(seletor) && !/[#\[]/.test(seletor)) return true;
    // Muito dependente de estrutura: 3+ elementos encadeados (com/sem ">"),
    // sem id nem atributo nenhum pra ancorar.
    var partes = seletor.split(/\s*>\s*|\s+/).filter(Boolean);
    if (partes.length >= 3 && !/[#\[]/.test(seletor)) return true;
    return false;
  }

  // Reaproveita recorderGerarCandidatosSeletor (mesmo gerador usado ao
  // capturar/trocar um elemento) contra o elemento ATUAL do passo — se achar
  // uma opção melhor que a em uso (recomendado/bom, e realmente diferente),
  // sugere. Só visual: nunca aplica sozinho.
  function recorderSugerirSeletorAlternativo(passo, elementoAtual) {
    if (!elementoAtual) return null;
    var candidatos = recorderGerarCandidatosSeletor(elementoAtual);
    if (!candidatos.length) return null;
    var melhor = candidatos[0]; // já vem ordenado: recomendado > bom > frágil
    if (melhor.qualidade === 'fragil') return null;
    if (melhor.seletor_tipo === passo.seletor_tipo && melhor.seletor === passo.seletor) return null;
    return recorderFormatarSeletorAtual({ seletor_tipo: melhor.seletor_tipo, seletor: melhor.seletor });
  }

  function recorderHtmlAlertaSeletorFragil(passo, elementoAtual) {
    if (!recorderSeletorEhFragil(passo)) return '';
    var alternativa = recorderSugerirSeletorAlternativo(passo, elementoAtual);
    return [
      '<p style="margin:4px 0 0"><span style="display:inline-block;font-size:10px;line-height:1.3;color:#e65100;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:2px 6px">Seletor frágil. Prefira data-cy, id ou aria-label.</span></p>',
      (alternativa
        ? '<p style="margin:2px 0 0"><span style="display:inline-block;font-size:10px;line-height:1.3;color:#0058be;background:#eff4ff;border:1px solid rgba(0,88,190,.15);border-radius:6px;padding:2px 6px">Alternativa sugerida: <code>' + escapeHtml(alternativa) + '</code></span></p>'
        : ''),
    ].join('');
  }

  // Bloco "Lista dinâmica detectada" no painel lateral — botão pra disparar
  // a detecção sob demanda (além da automática logo após capturar o passo,
  // ver recorderObservarListaDinamica) e, quando há sugestão pendente PRA
  // ESTE passo, o cartão com o seletor sugerido e as ações disponíveis.
  // Nunca aplica o seletor sozinho — cada ação exige um clique explícito.
  function recorderHtmlSugestaoListaDinamica(indice) {
    var sugestao = recorderState.sugestaoListaDinamica;
    var temSugestao = sugestao && sugestao.indice === indice;
    return [
      '<div class="up-rec-lista-dinamica">',
      '<button type="button" class="up-rec-btn-icone" data-lat-detectar-lista title="Interaja com o campo deste passo na tela real (clique, digite) e clique aqui — observa a tela por alguns segundos à procura de uma lista/dropdown/autocomplete que apareça">Detectar lista dinâmica</button>',
      (temSugestao ? [
        '<div class="up-rec-lista-dinamica-card">',
        '<p class="up-rec-lista-dinamica-titulo">Lista dinâmica detectada</p>',
        '<p class="up-rec-lista-dinamica-linha">Seletor sugerido: <code>' + escapeHtml(sugestao.seletor) + '</code></p>',
        '<span class="up-rec-lista-dinamica-badge up-rec-lista-dinamica-badge-' + escapeHtml(sugestao.estabilidade) + '">' +
          escapeHtml(RECORDER_ESTABILIDADE_LABEL[sugestao.estabilidade] || '') + '</span>',
        (sugestao.generico
          ? '<p class="up-rec-lista-dinamica-aviso">Seletor sem data-cy. Para maior estabilidade, adicione data-cy nos itens da lista.</p>'
          : ''),
        '<div class="up-rec-lista-dinamica-acoes">',
        '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-lat-lista-usar-confirmacao title="Usa este seletor como confirmação de que a lista apareceu — o passo passa a avançar automaticamente quando ela surgir">Usar como confirmação</button>',
        '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-lat-lista-novo-passo title="Cria um novo passo logo em seguida, já com este seletor, pra destacar/clicar num item da lista">Criar próximo passo</button>',
        '<button type="button" class="up-rec-btn-icone" data-lat-lista-copiar title="Copia o seletor sugerido">Copiar</button>',
        '</div>',
        '</div>',
      ].join('') : ''),
      '</div>',
    ].join('');
  }

  function recorderHtmlPainelLateralDetalhe(passo, indice, total) {
    var elementoAtual = null;
    try { elementoAtual = selecionarElementoPasso(passo); } catch (_e) { elementoAtual = null; }
    return [
      '<div class="up-rec-lateral-preview-wrap">' + recorderHtmlPreview(passo, indice, total) + '</div>',
      (elementoAtual ? '' : '<p style="margin:4px 0 0"><span style="display:inline-block;font-size:10px;line-height:1.3;color:#e65100;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:2px 6px">' + (recorderSeletorPareceItemListaDinamica(passo) ? RECORDER_MSG_ELEMENTO_TEMPORARIO_LISTA : 'Elemento não encontrado na tela atual.') + '</span></p>'),
      recorderHtmlAlertaSeletorFragil(passo, elementoAtual),
      recorderHtmlSugestaoListaDinamica(indice),
      '<label class="up-rec-revisao-label-principal">Título</label>',
      '<input type="text" class="up-rec-input" data-lat-campo="titulo" value="' + escapeHtml(passo.titulo || '') + '">',
      '<label class="up-rec-revisao-label-principal">Descrição</label>',
      '<textarea class="up-rec-textarea-sm" data-lat-campo="descricao">' + escapeHtml(passo.descricao || '') + '</textarea>',
      // Agrupamento visual opcional na lista (ver recorderAgruparPassosPorSecao)
      // — nunca obrigatório; passos sem seção caem em "Sem seção" na lista.
      '<label class="up-rec-revisao-label-principal">Seção <span style="font-weight:400;opacity:.65">(opcional)</span></label>',
      '<input type="text" class="up-rec-input" data-lat-campo="secao" placeholder="Ex: Login, Cadastro…" value="' + escapeHtml(passo.secao || '') + '">',
      '<div class="up-rec-revisao-grid">',
      '<div><span class="up-rec-revisao-label">Posição do tooltip</span>' + recorderSimpleSelectHtml('data-lat-campo', 'tooltip_posicao', passo.tooltip_posicao, RECORDER_TOOLTIP_POSICOES) + '</div>',
      '<div><span class="up-rec-revisao-label">Como avançar</span>' + recorderSimpleSelectHtml('data-lat-campo', 'modo_avanco_interacao', passo.modo_avanco_interacao, RECORDER_MODOS_AVANCO, RECORDER_MODOS_AVANCO_TITULO) + '</div>',
      '</div>',
      '<div class="up-rec-lateral-acoes">',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-lat-localizar title="Localizar na tela: destaca este elemento na página real">Localizar</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-lat-trocar title="Trocar elemento: clique de novo no elemento certo na tela real">Trocar</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-danger" data-lat-remover title="Remover este passo">Remover</button>',
      '</div>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento up-rec-lateral-testar" data-lat-testar-passo title="Testar só este passo, sem finalizar a gravação">Testar passo</button>',
    ].join('');
  }

  // Agrupamento visual, não estrutural: recorderState.passos continua um
  // array plano (é o que drag-and-drop reordena e o que vira o JSON final,
  // na mesma ordem) — só a MONTAGEM do HTML da lista organiza os itens por
  // "secao". Grupos aparecem na ordem da primeira ocorrência de cada nome
  // (passos sem secao caem em "Sem seção", tratada como um nome de grupo
  // normal). Cada item mantém seu índice REAL do array (data-lat-index),
  // então selecionar/arrastar/editar continuam funcionando exatamente igual,
  // só a apresentação muda.
  function recorderAgruparPassosPorSecao(passos) {
    var grupos = [];
    var posicaoPorNome = {};
    passos.forEach(function (p, i) {
      var nome = (p.secao && p.secao.trim()) || 'Sem seção';
      if (!(nome in posicaoPorNome)) {
        posicaoPorNome[nome] = grupos.length;
        grupos.push({ nome: nome, indices: [] });
      }
      grupos[posicaoPorNome[nome]].indices.push(i);
    });
    return grupos;
  }

  function recorderHtmlListaPassos(passos, indiceSelecionado) {
    var grupos = recorderAgruparPassosPorSecao(passos);
    // Só mostra o rótulo da seção quando há mais de um grupo — ninguém usou
    // o campo "Seção" ainda (ou todo mundo usou o mesmo valor) não deve
    // ganhar ruído visual extra na lista.
    var mostrarRotulos = grupos.length > 1;
    return grupos.map(function (g) {
      var itensHtml = g.indices.map(function (i) {
        return recorderHtmlPainelLateralItem(passos[i], i, i === indiceSelecionado);
      }).join('');
      var rotulo = mostrarRotulos
        ? '<div class="up-rec-lateral-secao-titulo">' + escapeHtml(g.nome) + '</div>'
        : '';
      return rotulo + itensHtml;
    }).join('');
  }

  function recorderHtmlPainelLateral() {
    var passos = recorderState.passos;
    var indice = recorderState.painelLateralIndiceSelecionado;
    var passo = indice != null ? passos[indice] : null;
    var itens = recorderHtmlListaPassos(passos, indice);

    return [
      '<div class="up-rec-lateral-cabecalho">',
      '<div class="up-rec-lateral-titulo">',
      '<span class="up-rec-lateral-titulo-dot"></span>',
      '<span class="up-rec-lateral-titulo-texto">Passos capturados</span>',
      '<span class="up-rec-lateral-contagem">' + passos.length + '</span>',
      '</div>',
      '<button type="button" class="up-rec-btn-icone" data-lat-recolher title="Recolher painel">&minus;</button>',
      '</div>',
      '<div class="up-rec-lateral-corpo">',
      (passos.length
        ? '<div class="up-rec-lateral-lista">' + itens + '</div>'
        : ''),
      '<div class="up-rec-lateral-detalhe">',
      (passo
        ? recorderHtmlPainelLateralDetalhe(passo, indice, passos.length)
        : '<p class="up-rec-lateral-detalhe-vazio">Nenhum passo capturado ainda. Interaja com a tela do sistema pra começar.</p>'),
      '</div>',
      '</div>',
      '<div class="up-rec-lateral-rodape">',
      '<button type="button" class="up-rec-lateral-preview-final" data-lat-preview-final title="Prévia limpa, idêntica ao que o usuário final vê — sem nenhum controle do gravador na tela">Pré-visualizar como usuário final</button>',
      '<div class="up-rec-lateral-rodape-principal">',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-lat-preview title="Pré-visualizar o tour com os passos atuais, sem finalizar a gravação">Pré-visualizar</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-lat-finalizar' + (passos.length === 0 ? ' disabled' : '') + '>Finalizar e revisar</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Posição do pill minimizado (e, ao reabrir, do próprio painel) — só em
  // memória, não precisa sobreviver a reload. null até o primeiro arrasto:
  // enquanto isso, cada estado usa a posição padrão de sempre (CSS).
  var recorderLateralPosicao = null;

  function recorderClampPosicaoLateral(top, left, largura, altura) {
    var margem = 8;
    var maxTop = Math.max(margem, window.innerHeight - altura - margem);
    var maxLeft = Math.max(margem, window.innerWidth - largura - margem);
    return {
      top: Math.min(Math.max(top, margem), maxTop),
      left: Math.min(Math.max(left, margem), maxLeft),
    };
  }

  function recorderAplicarPosicaoLateral(el) {
    if (!recorderLateralPosicao) return;
    var rect = el.getBoundingClientRect();
    var pos = recorderClampPosicaoLateral(recorderLateralPosicao.top, recorderLateralPosicao.left, rect.width, rect.height);
    el.style.top = pos.top + 'px';
    el.style.left = pos.left + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  // Arrastar o pill minimizado — Pointer Events cobrem mouse/touch/caneta
  // com a mesma API. Só passa a mover de verdade depois de confirmar
  // deslocamento real (RECORDER_ARRASTO_LIMIAR_PX): abaixo disso continua
  // sendo tratado como clique simples (reabrir o painel), não arrasto.
  // Roda inteiramente em listeners do próprio elemento — nunca no capture
  // de clique do gravador (document), então nunca vira passo do tour (o
  // painel lateral já é excluído disso por recorderElementoNaBarra de qualquer forma).
  var RECORDER_ARRASTO_LIMIAR_PX = 4;

  function recorderLigarArrastoPill(el) {
    var arrastando = false;
    var arrastou = false;
    var offsetX = 0;
    var offsetY = 0;

    el.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      arrastando = true;
      arrastou = false;
      var rect = el.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      try { el.setPointerCapture(event.pointerId); } catch (_e) {}
    });

    el.addEventListener('pointermove', function (event) {
      if (!arrastando) return;
      var rect = el.getBoundingClientRect();
      var novoTop = event.clientY - offsetY;
      var novoLeft = event.clientX - offsetX;
      if (!arrastou && (Math.abs(novoLeft - rect.left) > RECORDER_ARRASTO_LIMIAR_PX || Math.abs(novoTop - rect.top) > RECORDER_ARRASTO_LIMIAR_PX)) {
        arrastou = true;
      }
      if (!arrastou) return;
      var pos = recorderClampPosicaoLateral(novoTop, novoLeft, rect.width, rect.height);
      el.style.top = pos.top + 'px';
      el.style.left = pos.left + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      recorderLateralPosicao = pos;
    });

    function finalizarArrasto(event) {
      if (!arrastando) return;
      arrastando = false;
      try { el.releasePointerCapture(event.pointerId); } catch (_e) {}
    }
    el.addEventListener('pointerup', finalizarArrasto);
    el.addEventListener('pointercancel', finalizarArrasto);

    // Clique simples (sem arrasto) reabre o painel — clique que terminou um
    // arrasto real é ignorado aqui (não deve expandir o painel sozinho).
    el.addEventListener('click', function (event) {
      if (arrastou) {
        event.preventDefault();
        event.stopPropagation();
        arrastou = false;
        return;
      }
      recorderState.painelLateralAberto = true;
      recorderRenderPainelLateral();
    });
  }

  function recorderRenderPainelLateral() {
    var existente = document.getElementById(RECORDER_PAINEL_LATERAL_ID);
    if (existente) existente.remove();
    if (!recorderState.revisarTempoReal) return;

    var root = document.createElement('div');
    root.id = RECORDER_PAINEL_LATERAL_ID;

    if (!recorderState.painelLateralAberto) {
      // Recolhido durante uma troca (recorderIniciarTrocaElemento com origem
      // 'painel-lateral') — destaca qual passo está em modo troca em vez do
      // texto genérico "Passos capturados", já que o painel completo (com a
      // lista) não está visível pra mostrar isso de outro jeito.
      var emTroca = recorderState.trocaIndice != null;
      root.className = emTroca ? 'up-rec-lateral-pill up-rec-lateral-pill-trocando' : 'up-rec-lateral-pill';
      root.setAttribute('title', emTroca
        ? 'Selecionando novo elemento — clique pra ver os passos capturados'
        : 'Arraste para mover — clique para reabrir o painel de passos capturados');
      root.innerHTML = emTroca
        ? '<span class="up-rec-lateral-pill-dot"></span>Trocando — Passo ' + (recorderState.trocaIndice + 1)
        : '<span class="up-rec-lateral-pill-dot"></span>Passos capturados <span class="up-rec-lateral-contagem">' + recorderState.passos.length + '</span>';
      document.body.appendChild(root);
      recorderAplicarPosicaoLateral(root);
      recorderLigarArrastoPill(root);
      return;
    }

    root.className = 'up-rec-lateral';
    root.innerHTML = recorderHtmlPainelLateral();
    document.body.appendChild(root);
    recorderAplicarPosicaoLateral(root); // abre a partir de onde o pill foi arrastado, se aplicável

    root.addEventListener('input', recorderPainelLateralOnInput);
    root.addEventListener('change', recorderPainelLateralOnInput);
    root.addEventListener('click', recorderPainelLateralOnClick);
    root.addEventListener('dragstart', recorderPainelLateralOnDragStart);
    root.addEventListener('dragover', recorderPainelLateralOnDragOver);
    root.addEventListener('drop', recorderPainelLateralOnDrop);
    root.addEventListener('dragend', recorderPainelLateralOnDragEnd);
  }

  function recorderFecharPainelLateral() {
    var root = document.getElementById(RECORDER_PAINEL_LATERAL_ID);
    if (root) root.remove();
  }

  // ─── Reordenar passos por arrastar (painel lateral) ────────────────────
  // Delegação de eventos nativa de drag-and-drop (dragstart/dragover/drop),
  // ligada no root do painel lateral em recorderRenderPainelLateral — cada
  // re-render (reordenar, selecionar, editar campo…) recria o root e
  // religa os listeners, então nunca sobra referência de root antigo.
  var recorderDragState = { indiceOrigem: null };

  function recorderPainelLateralOnDragStart(event) {
    var item = event.target.closest('[data-lat-selecionar]');
    if (!item) return;
    recorderDragState.indiceOrigem = Number(item.getAttribute('data-lat-index'));
    item.classList.add('up-rec-lateral-item-arrastando');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', String(recorderDragState.indiceOrigem)); } catch (_e) {}
    }
  }

  function recorderPainelLateralOnDragOver(event) {
    if (recorderDragState.indiceOrigem == null) return;
    var item = event.target.closest('[data-lat-selecionar]');
    if (!item) return;
    event.preventDefault(); // obrigatório pro navegador permitir o drop aqui
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    var lista = item.parentElement;
    if (lista) {
      var itens = lista.querySelectorAll('[data-lat-selecionar]');
      for (var i = 0; i < itens.length; i++) itens[i].classList.remove('up-rec-lateral-item-dragover');
    }
    item.classList.add('up-rec-lateral-item-dragover');
  }

  function recorderLimparEstadoDrag() {
    recorderDragState.indiceOrigem = null;
    var marcados = document.querySelectorAll('.up-rec-lateral-item-dragover, .up-rec-lateral-item-arrastando');
    for (var i = 0; i < marcados.length; i++) {
      marcados[i].classList.remove('up-rec-lateral-item-dragover', 'up-rec-lateral-item-arrastando');
    }
  }

  function recorderPainelLateralOnDrop(event) {
    var indiceOrigem = recorderDragState.indiceOrigem;
    var item = event.target.closest('[data-lat-selecionar]');
    if (indiceOrigem == null || !item) { recorderLimparEstadoDrag(); return; }
    event.preventDefault();
    var indiceDestino = Number(item.getAttribute('data-lat-index'));
    recorderLimparEstadoDrag();
    recorderReordenarPassos(indiceOrigem, indiceDestino);
  }

  function recorderPainelLateralOnDragEnd() {
    recorderLimparEstadoDrag();
  }

  // Move o passo de indiceOrigem pra indiceDestino em recorderState.passos.
  // Mantém o passo que estava selecionado continuando selecionado depois —
  // guarda a REFERÊNCIA do objeto (não o índice) antes de mexer no array,
  // já que o índice do passo selecionado pode mudar mesmo quando ele não é
  // o que foi arrastado (ex.: arrastar o passo 1 pro fim empurra todo mundo
  // uma posição pra trás).
  function recorderReordenarPassos(indiceOrigem, indiceDestino) {
    var passos = recorderState.passos;
    if (indiceOrigem === indiceDestino) return;
    if (indiceOrigem < 0 || indiceOrigem >= passos.length) return;
    if (indiceDestino < 0 || indiceDestino >= passos.length) return;

    var passoSelecionado = recorderState.painelLateralIndiceSelecionado != null
      ? passos[recorderState.painelLateralIndiceSelecionado]
      : null;

    var passoMovido = passos.splice(indiceOrigem, 1)[0];
    passos.splice(indiceDestino, 0, passoMovido);

    if (passoSelecionado) {
      recorderState.painelLateralIndiceSelecionado = passos.indexOf(passoSelecionado);
    }

    recorderPersistir();
    recorderAtualizarBarra();
    recorderRenderPainelLateral();
  }

  // Pré-visualização do tour com os passos atuais (capturados/editados),
  // sem finalizar a gravação, gerar JSON ou limpar recorderState — reaproveita
  // o runtime real do tour (iniciarTour) pra usar título/descrição/posição do
  // tooltip/modo de avanço exatamente como o usuário final veria. tourState.preview
  // marca a sessão como prévia: registrarEventoTour/tourMarkShown não fazem
  // nada enquanto ativo (ver definições), então nenhum evento de analytics ou
  // marcação de "já visto" é gerado por uma prévia. finalizarTour() já reseta
  // esse marcador ao encerrar (Concluir, Pular, Esc, fechar a tela final),
  // então o usuário volta pro painel lateral automaticamente — ele nunca foi
  // escondido (só fica visualmente atrás do overlay do tour, que tem z-index
  // menor que o painel/barra do gravador).
  // Converte um passo de recorderState.passos pro formato aceito por
  // tourState.tour.passos (iniciarTour) — mesmos campos, sem id/ordem, que
  // não existem/fazem sentido numa prévia.
  function recorderMapPassoParaPreview(p) {
    return {
      titulo: p.titulo,
      descricao: p.descricao,
      seletor_tipo: p.seletor_tipo,
      seletor: p.seletor,
      tooltip_posicao: p.tooltip_posicao,
      acao_ao_avancar: p.acao_ao_avancar,
      modo_avanco_interacao: p.modo_avanco_interacao,
      seletor_confirmacao: p.seletor_confirmacao,
    };
  }

  // Setup compartilhado entre "Pré-visualizar tour" (todos os passos) e
  // "Testar passo" (um só) — esconde a barra/painel do gravador (nunca
  // removidos do estado, só do DOM; recorderRestaurarAposPreview reabre
  // quando finalizarTour() roda), guarda o mapeamento índice-da-prévia →
  // índice real (previewIndices, usado por tourTrocarPassoAtual) e inicia o
  // tour já marcado como prévia (preview=true em iniciarTour — precisa ser
  // exatamente ali, não depois, senão pularIntro=true dispararia
  // registrarEventoTour de dentro de irParaPasso ainda sem a marcação).
  function recorderIniciarPreview(tourPreview, indicesReais, pularIntro, modoUsuarioFinal) {
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (bar) bar.style.display = 'none';
    recorderFecharPainelLateral();
    recorderState.previewIndices = indicesReais;
    iniciarTour(tourPreview, pularIntro, true, modoUsuarioFinal);
  }

  function recorderPreVisualizarTour() {
    if (recorderState.passos.length === 0) {
      recorderMostrarAvisoBarra('Adicione ao menos um passo para pré-visualizar.');
      return;
    }
    var meta = recorderState.meta || {};
    var tourPreview = {
      id: null,
      titulo: meta.titulo || 'Pré-visualização do tour',
      descricao: meta.descricao || '',
      passos: recorderState.passos.map(recorderMapPassoParaPreview),
    };
    var indices = recorderState.passos.map(function (_, i) { return i; });
    recorderIniciarPreview(tourPreview, indices);
  }

  // "Pré-visualizar como usuário final" — mesmo tour completo de
  // recorderPreVisualizarTour, mas em tourState.previewModoUsuarioFinal=true:
  // renderTourNaoEncontrado esconde "Trocar elemento deste passo" nesse modo
  // (única peça de UI do gravador que aparecia dentro do próprio overlay do
  // tour — bar/painel já ficam escondidos em qualquer prévia, ver
  // recorderIniciarPreview). Fica assim visualmente idêntico ao que o
  // usuário final realmente vê. "Pré-visualizar" comum continua existindo
  // pra quem quer corrigir um passo na hora, sem trocar de tela.
  function recorderPreVisualizarComoUsuarioFinal() {
    if (recorderState.passos.length === 0) {
      recorderMostrarAvisoBarra('Adicione ao menos um passo para pré-visualizar.');
      return;
    }
    var meta = recorderState.meta || {};
    var tourPreview = {
      id: null,
      titulo: meta.titulo || 'Pré-visualização do tour',
      descricao: meta.descricao || '',
      passos: recorderState.passos.map(recorderMapPassoParaPreview),
    };
    var indices = recorderState.passos.map(function (_, i) { return i; });
    recorderIniciarPreview(tourPreview, indices, false, true);
  }

  // "Testar passo" (painel lateral, passo selecionado) — mesma prévia real
  // do tour, mas com um único passo. Pula a tela de introdução (pularIntro=true
  // em recorderIniciarPreview) — testar um passo só não precisa de boas-vindas.
  // Se o elemento não for encontrado, cai no mesmo estado "Elemento não
  // encontrado" de sempre (renderTourNaoEncontrado), com "Trocar elemento
  // deste passo" disponível (tourState.preview) — tourTrocarPassoAtual usa
  // previewIndices pra saber que o índice 0 da prévia é, na verdade,
  // recorderState.passos[indice] real.
  function recorderTestarPasso(indice) {
    var passo = recorderState.passos[indice];
    if (!passo) return;
    var meta = recorderState.meta || {};
    var tourPreview = {
      id: null,
      titulo: passo.titulo || meta.titulo || 'Testar passo',
      descricao: passo.descricao || '',
      passos: [recorderMapPassoParaPreview(passo)],
    };
    recorderIniciarPreview(tourPreview, [indice], true);
  }

  // Chamado por finalizarTour() quando a sessão que terminou era uma prévia
  // (ver recorderPreVisualizarTour) — reexibe a barra flutuante e o painel
  // lateral escondidos antes de iniciar a prévia. recorderState nunca foi
  // alterado durante a prévia, então o painel volta exatamente como estava
  // (mesma seleção, mesmos passos).
  function recorderRestaurarAposPreview() {
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (bar) bar.style.display = '';
    if (recorderState.revisarTempoReal) recorderRenderPainelLateral();
  }

  function recorderPainelLateralOnInput(event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;
    var campo = alvo.getAttribute('data-lat-campo');
    if (!campo) return;
    var indice = recorderState.painelLateralIndiceSelecionado;
    var passo = indice != null ? recorderState.passos[indice] : null;
    if (!passo) return;
    passo[campo] = alvo.value;
    recorderPersistir();

    // Title do select acompanha a opção escolhida — o rótulo visível é
    // curto de propósito, a explicação completa só aparece no hover.
    if (campo === 'modo_avanco_interacao' && RECORDER_MODOS_AVANCO_TITULO[alvo.value]) {
      alvo.title = RECORDER_MODOS_AVANCO_TITULO[alvo.value];
    }

    // Resumo na lista + preview no detalhe — atualizados no lugar, sem
    // re-renderizar o painel inteiro (perderia foco/cursor do usuário).
    if (campo === 'titulo') {
      var itemResumo = document.querySelector('#' + RECORDER_PAINEL_LATERAL_ID + ' [data-lat-index="' + indice + '"] .up-rec-lateral-item-resumo');
      if (itemResumo) itemResumo.textContent = recorderResumoPasso(passo);

      var previewTitulo = document.querySelector('[data-rev-preview-titulo="' + indice + '"]');
      if (previewTitulo) {
        var semTitulo = !passo.titulo || !passo.titulo.trim();
        previewTitulo.textContent = semTitulo ? 'Título do passo' : passo.titulo;
        previewTitulo.classList.toggle('up-rec-preview-vazio', semTitulo);
      }
    }
    if (campo === 'descricao') {
      var previewDesc = document.querySelector('[data-rev-preview-desc="' + indice + '"]');
      if (previewDesc) {
        var semDescricao = !passo.descricao || !String(passo.descricao).trim();
        previewDesc.textContent = semDescricao ? 'Descrição do passo (opcional)' : passo.descricao;
        previewDesc.classList.toggle('up-rec-preview-vazio', semDescricao);
      }
    }
    // "Seção" reagrupa a lista inteira (recorderAgruparPassosPorSecao) — só
    // no "change" (blur/Enter), nunca no "input" a cada tecla, senão a lista
    // reordenaria/re-renderizaria no meio da digitação e tiraria o foco do
    // campo. Re-render completo é seguro aqui porque o campo já perdeu o
    // foco quando "change" dispara.
    if (campo === 'secao' && event.type === 'change') {
      recorderRenderPainelLateral();
    }
  }

  function recorderPainelLateralOnClick(event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;

    if (alvo.closest('[data-lat-recolher]')) {
      recorderState.painelLateralAberto = false;
      recorderRenderPainelLateral();
      return;
    }

    var btnSelecionar = alvo.closest('[data-lat-selecionar]');
    if (btnSelecionar) {
      recorderState.painelLateralIndiceSelecionado = Number(btnSelecionar.getAttribute('data-lat-index'));
      recorderRenderPainelLateral();
      return;
    }

    if (alvo.closest('[data-lat-remover]')) {
      var idxRem = recorderState.painelLateralIndiceSelecionado;
      if (idxRem == null) return;
      recorderState.passos.splice(idxRem, 1);
      recorderState.painelLateralIndiceSelecionado = recorderState.passos.length ? Math.min(idxRem, recorderState.passos.length - 1) : null;
      recorderPersistir();
      recorderAtualizarBarra();
      recorderRenderPainelLateral();
      return;
    }

    if (alvo.closest('[data-lat-localizar]')) {
      var idxLoc = recorderState.painelLateralIndiceSelecionado;
      if (idxLoc == null) return;
      recorderLocalizarElemento(idxLoc, 'painel-lateral');
      return;
    }

    if (alvo.closest('[data-lat-trocar]')) {
      var idxTro = recorderState.painelLateralIndiceSelecionado;
      if (idxTro == null) return;
      recorderIniciarTrocaElemento(idxTro, 'painel-lateral');
      return;
    }

    if (alvo.closest('[data-lat-testar-passo]')) {
      var idxTeste = recorderState.painelLateralIndiceSelecionado;
      if (idxTeste == null) return;
      recorderTestarPasso(idxTeste);
      return;
    }

    if (alvo.closest('[data-lat-detectar-lista]')) {
      var idxDetectar = recorderState.painelLateralIndiceSelecionado;
      if (idxDetectar == null) return;
      recorderObservarListaDinamica(idxDetectar);
      recorderMostrarAvisoBarra('Observando a tela por alguns segundos — interaja com o campo deste passo pra abrir a lista/dropdown.');
      return;
    }

    if (alvo.closest('[data-lat-lista-usar-confirmacao]')) {
      var idxConf = recorderState.painelLateralIndiceSelecionado;
      var sugConf = recorderState.sugestaoListaDinamica;
      if (idxConf == null || !sugConf || sugConf.indice !== idxConf) return;
      var passoConf = recorderState.passos[idxConf];
      if (!passoConf) return;
      passoConf.seletor_confirmacao = sugConf.seletor;
      // Sem um modo_avanco_interacao que use seletor_confirmacao, o campo
      // fica preenchido mas sem efeito nenhum no runtime (ver
      // RECORDER_MODOS_AVANCO_COM_CONFIRMACAO) — "ao_aparecer_elemento" é o
      // padrão que corresponde a "avança quando esta lista aparecer".
      if (RECORDER_MODOS_AVANCO_COM_CONFIRMACAO.indexOf(passoConf.modo_avanco_interacao) === -1) {
        passoConf.modo_avanco_interacao = 'ao_aparecer_elemento';
      }
      recorderPersistir();
      recorderRenderPainelLateral();
      return;
    }

    if (alvo.closest('[data-lat-lista-novo-passo]')) {
      var idxNovo = recorderState.painelLateralIndiceSelecionado;
      var sugNovo = recorderState.sugestaoListaDinamica;
      if (idxNovo == null || !sugNovo || sugNovo.indice !== idxNovo) return;
      var passoOrigemNovo = recorderState.passos[idxNovo];
      if (!passoOrigemNovo) return;
      var novoPasso = {
        titulo: 'Selecionar item da lista',
        descricao: '',
        seletor_tipo: sugNovo.seletor_tipo,
        seletor: sugNovo.seletor,
        tooltip_posicao: 'auto',
        // O item real só existe depois da lista abrir — faz sentido este
        // passo avançar quando o usuário clica nele (modo_avanco_interacao)
        // e, se avançado pelo botão Próximo em vez de um clique direto,
        // simular esse clique no elemento destacado antes de seguir
        // (acao_ao_avancar) — mesmo padrão já usado por outros passos
        // "clicar num elemento real" do gravador.
        acao_ao_avancar: 'clicar_elemento',
        modo_avanco_interacao: 'ao_clicar',
        seletor_confirmacao: null,
        secao: passoOrigemNovo.secao || '',
      };
      recorderState.passos.splice(idxNovo + 1, 0, novoPasso);
      recorderState.painelLateralIndiceSelecionado = idxNovo + 1;
      recorderPersistir();
      recorderAtualizarBarra();
      recorderRenderPainelLateral();
      return;
    }

    if (alvo.closest('[data-lat-lista-copiar]')) {
      var sugCopiar = recorderState.sugestaoListaDinamica;
      if (!sugCopiar) return;
      recorderCopiarTexto(sugCopiar.seletor);
      recorderMostrarAvisoBarra('Seletor copiado.');
      return;
    }

    if (alvo.closest('[data-lat-preview]')) {
      recorderPreVisualizarTour();
      return;
    }

    if (alvo.closest('[data-lat-preview-final]')) {
      recorderPreVisualizarComoUsuarioFinal();
      return;
    }

    if (alvo.closest('[data-lat-finalizar]')) {
      if (recorderState.passos.length === 0) return;
      recorderFinalizar(); // já remove o painel lateral e abre a revisão final
      return;
    }
  }

  // ─── Relevância do clique ──────────────────────────────────────────────
  // Nem todo clique deve virar passo — clicar em fundo, texto solto ou
  // container genérico não é uma interação real que faça sentido guiar
  // depois. Só considera alvo válido tags/roles interativos ou um elemento
  // com identificador estável (data-cy/data-testid/id/aria-label).
  var RECORDER_TAGS_RELEVANTES = ['button', 'a', 'input', 'select', 'textarea', 'label'];
  var RECORDER_ROLES_RELEVANTES = ['button', 'link', 'tab', 'menuitem', 'checkbox'];
  // Landmarks estruturais — nunca viram passo, mesmo que por acaso tenham
  // id/aria-label (clicar "no body"/"na main" não é uma ação real do usuário).
  var RECORDER_TAGS_NUNCA_RELEVANTES = ['body', 'html', 'main', 'section'];

  function recorderElementoRelevante(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (RECORDER_TAGS_NUNCA_RELEVANTES.indexOf(tag) !== -1) return false;
    // Container/wrapper de overlay do próprio framework (painel do CDK, seu
    // id dinâmico, wrapper do Ant Design) — nunca é o alvo relevante, mesmo
    // tendo id: é só o mecanismo de posicionamento do dropdown por baixo, e
    // capturá-lo produz um passo ruim (seletor instável, título com o texto
    // de TODOS os itens concatenados). Verificado antes de qualquer outro
    // critério, inclusive antes de tags/roles "clássicos" — um elemento
    // desses nunca deveria ser considerado relevante por nenhum motivo.
    if (recorderEhContainerOverlayFramework(el)) return false;
    if (RECORDER_TAGS_RELEVANTES.indexOf(tag) !== -1) return true;
    var role = el.getAttribute && el.getAttribute('role');
    if (role && RECORDER_ROLES_RELEVANTES.indexOf(role) !== -1) return true;
    if (el.getAttribute && (el.getAttribute('data-cy') || el.getAttribute('data-testid') || el.getAttribute('aria-label'))) return true;
    // Item de lista/dropdown/autocomplete conhecido (ex.: <li
    // class="ant-select-dropdown-menu-item">) — reconhecido como alvo válido
    // mesmo sem tag/role "clássico" de botão/link, pra não deixar a subida
    // por ancestrais continuar até um wrapper qualquer (ver
    // recorderLocalizarAlvoRelevante/recorderEhItemDropdown).
    if (recorderEhItemDropdown(el)) return true;
    if (el.id) return true;
    return false;
  }

  // Sobe do elemento clicado até achar o ancestral relevante mais próximo
  // (ou o próprio alvo, se já for relevante) — clicar num <span> genérico
  // dentro de um <button data-cy="..."> deve capturar o botão, não o span.
  // Para em qualquer landmark estrutural (body/html/main/section) sem achar
  // nada — retorna null, e o clique é ignorado.
  function recorderLocalizarAlvoRelevante(el) {
    var atual = el;
    while (atual && atual.nodeType === 1) {
      var tag = atual.tagName ? atual.tagName.toLowerCase() : '';
      if (RECORDER_TAGS_NUNCA_RELEVANTES.indexOf(tag) !== -1) return null;
      if (recorderElementoRelevante(atual)) return atual;
      atual = atual.parentElement;
    }
    return null;
  }

  // Cliques disparam ao_clicar; nunca chama preventDefault/stopPropagation —
  // a interação real do usuário com o sistema acontece normalmente.
  function recorderCapturarClique(event) {
    if (!recorderState.ativo || recorderState.pausado) return;
    if (tourState.ativo) return; // pré-visualização (ver recorderPreVisualizarTour) em andamento — nunca vira passo novo
    var el = event.target;
    if (!(el instanceof Element) || recorderElementoNaBarra(el)) return;
    if (isEditableTarget(el)) return; // esses vão por input/change, não por clique

    var alvo = recorderLocalizarAlvoRelevante(el);
    if (!alvo) {
      recorderMostrarAvisoBarra('Clique em um botão, campo ou elemento identificável para capturar um passo.');
      return;
    }
    if (recorderCampoSensivel(alvo)) return;

    var agora = Date.now();
    if (recorderState.ultimoEl === alvo && (agora - recorderState.ultimoElTimestamp) < RECORDER_CLIQUE_DEDUPE_MS) return; // duplo clique acidental
    recorderState.ultimoEl = alvo;
    recorderState.ultimoElTimestamp = agora;
    recorderRegistrarPasso(alvo, recorderInferirModo(alvo));
  }

  // input/change disparam ao_alterar_valor. Nunca lê event.target.value — só
  // usa o evento como sinal de "houve preenchimento". "input" tem debounce
  // (não captura a cada tecla); "change" já é uma confirmação (seleção/blur),
  // captura na hora. Ambos só geram UM passo por elemento nesta sessão de
  // gravação (elParaIndice evita duplicar a cada nova tecla/seleção).
  function recorderCapturarValor(event) {
    if (!recorderState.ativo || recorderState.pausado) return;
    if (tourState.ativo) return; // pré-visualização (ver recorderPreVisualizarTour) em andamento — nunca vira passo novo
    var el = event.target;
    if (!(el instanceof Element) || recorderElementoNaBarra(el)) return;
    if (recorderCampoSensivel(el)) return;

    if (event.type === 'change') {
      if (recorderState.inputTimers.has(el)) {
        window.clearTimeout(recorderState.inputTimers.get(el));
        recorderState.inputTimers.delete(el);
      }
      if (!recorderState.elParaIndice.has(el)) recorderRegistrarPasso(el, recorderInferirModo(el));
      return;
    }

    if (recorderState.inputTimers.has(el)) window.clearTimeout(recorderState.inputTimers.get(el));
    var timer = window.setTimeout(function () {
      recorderState.inputTimers.delete(el);
      // Reconfere ativo/pausado: o timer é assíncrono e a gravação pode ter
      // sido finalizada/cancelada/pausada enquanto o usuário ainda digitava.
      if (!recorderState.ativo || recorderState.pausado) return;
      if (!recorderState.elParaIndice.has(el)) recorderRegistrarPasso(el, recorderInferirModo(el));
    }, RECORDER_INPUT_DEBOUNCE_MS);
    recorderState.inputTimers.set(el, timer);
  }

  function recorderDesfazerUltimo() {
    if (recorderState.passos.length === 0) return;
    recorderState.passos.pop();
    // Mesmo ajuste de seleção do botão "Remover passo" do painel lateral
    // (data-lat-remover): só corrige o índice selecionado se ele deixou de
    // existir — se o selecionado era um passo anterior, continua como está.
    if (recorderState.painelLateralIndiceSelecionado != null && recorderState.painelLateralIndiceSelecionado >= recorderState.passos.length) {
      recorderState.painelLateralIndiceSelecionado = recorderState.passos.length ? recorderState.passos.length - 1 : null;
    }
    recorderAtualizarBarra();
    recorderPersistir();
    recorderRenderPainelLateral(); // sem efeito se revisarTempoReal estiver desligado
  }

  function recorderPausarOuContinuar() {
    recorderState.pausado = !recorderState.pausado;
    recorderAtualizarBarra();
    recorderPersistir();
  }

  // ─── Suporte a teste (window.UserPulse._internal) ─────────────────────────
  // Nunca chamadas pelo runtime real — só existem pra
  // server/src/widgetRecorderPause.test.ts conseguir exercitar os guards de
  // captura/pausa sem depender de query params de URL nem dos efeitos
  // colaterais de iniciarGravadorSeNecessario (render da barra, persistência,
  // injeção de CSS). recorderState em si NUNCA é exposto em _internal — só
  // estas duas funções, pra não vazar títulos/seletores/descrições/contexto
  // dos passos já capturados pro browser do cliente (mesmo widget público).

  // Estado mínimo pra recorderCapturarClique/recorderCapturarValor terem o
  // que testar (ativo=true é obrigatório — sem isso os guards de captura já
  // retornam cedo demais pra distinguir "ignorado por estar pausado" de
  // "ignorado por nunca ter iniciado").
  function recorderPrepararTesteCaptura() {
    recorderState.ativo = true;
    recorderState.pausado = false;
    recorderState.passos = [];
    recorderState.elParaIndice = new WeakMap();
    recorderState.inputTimers = new WeakMap();
    recorderState.ultimoEl = null;
    recorderState.ultimoElTimestamp = 0;
  }

  // Snapshot deliberadamente mínimo: só contagem de passos, nunca a lista em
  // si (título/seletor/descrição/seletor_confirmacao/secao de cada um).
  function recorderGetTestSnapshot() {
    return {
      ativo: recorderState.ativo,
      pausado: recorderState.pausado,
      totalPassos: recorderState.passos.length,
      // null ou 'editar_tour_existente' — nunca id/token/dado do tour em si,
      // só o rótulo que controla texto do painel final (ver
      // recorderTextosPainelFinal).
      contexto: recorderState.contexto,
    };
  }

  // Só informativo (mostrado no painel final) — trocas de URL em SPA (via
  // pushState/replaceState/hash) não viram passo com seletor, já que não há
  // elemento associado; o tour gerado usa url_contem da página em que a
  // gravação começou. Não repatcha history (já é feito por bindSpaListeners
  // pra outro fim) — poll simples evita qualquer conflito entre os dois.
  function recorderIniciarPollUrl() {
    recorderState.ultimaUrl = window.location.href;
    recorderState.urlPollTimer = window.setInterval(function () {
      if (!recorderState.ativo || recorderState.pausado) return;
      if (window.location.href !== recorderState.ultimaUrl) {
        recorderState.ultimaUrl = window.location.href;
        recorderState.navegacoes.push(window.location.pathname);
        recorderPersistir();
      }
    }, RECORDER_URL_POLL_MS);
  }

  function recorderMontarJson() {
    var meta = recorderState.meta;
    return {
      formato: 'userpulse.tour.v1',
      exportado_em: new Date().toISOString(),
      tour: {
        titulo: meta.titulo || 'Tour gravado',
        descricao: meta.descricao || null,
        sistema: meta.sistema || '',
        modo_identificacao: 'url_contem',
        tela: null,
        data_cy: null,
        url_contem: meta.url_contem || '',
        prioridade: meta.prioridade || 0,
        passos: recorderState.passos.map(function (p) {
          return {
            titulo: p.titulo,
            descricao: p.descricao || null,
            seletor_tipo: p.seletor_tipo,
            seletor: p.seletor,
            tooltip_posicao: p.tooltip_posicao,
            acao_ao_avancar: p.acao_ao_avancar,
            modo_avanco_interacao: p.modo_avanco_interacao,
            seletor_confirmacao: (p.seletor_confirmacao && String(p.seletor_confirmacao).trim()) || null,
            secao: (p.secao && String(p.secao).trim()) || null,
          };
        }),
      },
    };
  }

  function recorderPararCaptura() {
    document.removeEventListener('click', recorderCapturarClique, true);
    document.removeEventListener('input', recorderCapturarValor, true);
    document.removeEventListener('change', recorderCapturarValor, true);
    if (recorderState.urlPollTimer) {
      window.clearInterval(recorderState.urlPollTimer);
      recorderState.urlPollTimer = null;
    }
    recorderPararDeteccaoListaDinamica();
  }

  // Botão "Finalizar" da barra: NÃO gera o JSON de imediato — abre o painel de
  // revisão pra editar/reordenar/remover passos antes. A gravação continua
  // "ativa" (sessionStorage intacto) nesse meio-tempo; só é limpa de fato em
  // recorderGerarJsonFinal(). Pausa a captura enquanto revisa (além disso,
  // cliques/edições dentro do próprio painel já são ignorados por
  // recorderElementoNaBarra, que também cobre o RECORDER_PAINEL_ID).
  function recorderFinalizar() {
    if (recorderState.passos.length === 0) {
      recorderMostrarAvisoBarra('Nenhum passo foi capturado ainda. Interaja com a tela antes de finalizar a gravação.');
      return;
    }
    recorderState.pausadoAntesRevisao = recorderState.pausado;
    recorderState.pausado = true;
    recorderPersistir();
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (bar) bar.remove();
    recorderFecharPainelLateral(); // se estava aberto (revisarTempoReal), a revisão final assume o lugar dele
    recorderRenderRevisao();
  }

  // Descarta a gravação inteira — remove a barra, limpa o sessionStorage e os
  // passos em memória, e não gera nenhum JSON (ao contrário de Finalizar).
  function recorderCancelar() {
    if (!window.confirm('Cancelar a gravação e descartar os passos capturados?')) return;
    recorderState.ativo = false;
    recorderState.passos = [];
    recorderState.navegacoes = [];
    recorderPararCaptura();
    recorderLimparPersistencia();
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (bar) bar.remove();
    var painel = document.getElementById(RECORDER_PAINEL_ID);
    if (painel) painel.remove();
    recorderFecharPainelLateral();
  }

  // ─── Painel de revisão (antes de gerar o JSON) ────────────────────────────

  function recorderAlertasPasso(p) {
    var alertas = [];
    if (!p.titulo || !p.titulo.trim()) alertas.push('Título vazio — preencha antes de importar.');
    if (!p.descricao || !String(p.descricao).trim()) alertas.push('Descrição vazia — opcional, mas ajuda o usuário a entender o passo.');
    if (p.seletor_tipo === 'css') alertas.push('Seletor CSS pode ser frágil. Prefira data-cy quando possível.');
    if (RECORDER_MODOS_AVANCO_COM_CONFIRMACAO.indexOf(p.modo_avanco_interacao) !== -1 && (!p.seletor_confirmacao || !String(p.seletor_confirmacao).trim())) {
      alertas.push('Informe o seletor de confirmação para este modo funcionar corretamente.');
    }
    // Elemento pode não existir mais nesta tela (navegou, painel fechou etc.)
    // — só avisa, nunca bloqueia edição/remoção/reordenação do passo. Mesma
    // lógica de localização do runtime do tour (selecionarElementoPasso),
    // chamada aqui só para leitura.
    var elementoAtual = null;
    try { elementoAtual = selecionarElementoPasso(p); } catch (_e) { elementoAtual = null; }
    if (!elementoAtual) {
      alertas.push(recorderSeletorPareceItemListaDinamica(p)
        ? RECORDER_MSG_ELEMENTO_TEMPORARIO_LISTA + ' Você ainda pode editar este passo normalmente.'
        : 'Elemento não encontrado na tela atual — pode estar oculto, ter sido removido ou você pode estar em outra página. Você ainda pode editar este passo normalmente.');
    }
    return alertas;
  }

  function recorderHtmlAlertas(p) {
    var alertas = recorderAlertasPasso(p);
    if (alertas.length === 0) return '';
    return '<ul class="up-rec-revisao-alertas">' + alertas.map(function (a) {
      return '<li>' + escapeHtml(a) + '</li>';
    }).join('') + '</ul>';
  }

  // ─── "Analisar passos" — assistente de limpeza opcional na revisão ────────
  // Diferente dos alertas (sempre visíveis, focados em campos obrigatórios
  // pro importador), essas sugestões só aparecem quando o usuário pede
  // ("Analisar passos") e cobrem qualidade/duplicação/coerência de modo de
  // avanço — nunca bloqueiam gerar JSON, só orientam.

  // Título vazio OU um dos textos que o próprio gravador gera automaticamente
  // quando não achou nada melhor (recorderGerarTitulo) — sinal de que o
  // usuário provavelmente não revisou esse título ainda.
  function recorderTituloGenerico(titulo) {
    if (!titulo || !titulo.trim()) return true;
    return /^(Interaja com |Preencha: |Campo: )/.test(titulo.trim());
  }

  // Heurísticas por texto (seletor + título do PASSO já salvo) — não dependem
  // do elemento estar presente na tela agora (ao contrário de recorderInferirModo,
  // que só roda no momento da captura, com o elemento real em mãos).
  var REGEX_SUGESTAO_PARECE_CAMPO = /^(?:input|textarea|select)\b|\binput\b|\bcampo\b|autocomplete|combobox|search|busca|dropdown/i;
  var REGEX_SUGESTAO_PARECE_BOTAO = /^(?:button|a)\b|\bbotao\b|\bbutton\b|\blink\b|\bsalvar\b|\bconfirmar\b|\benviar\b|\bsubmit\b|\back(?:a|ã)o\b/i;

  function recorderSugestaoPareceCampo(passo) {
    var alvo = (passo.seletor || '') + ' ' + (passo.titulo || '');
    return REGEX_SUGESTAO_PARECE_CAMPO.test(alvo);
  }

  function recorderSugestaoPareceBotao(passo) {
    var alvo = (passo.seletor || '') + ' ' + (passo.titulo || '');
    return REGEX_SUGESTAO_PARECE_BOTAO.test(alvo);
  }

  // Cada sugestão: { texto, acao (opcional — chave de recorderAplicarAcaoRapida),
  // acaoRotulo (texto do botão de ação rápida) }.
  function recorderSugestoesPasso(passos, indice) {
    var passo = passos[indice];
    var sugestoes = [];
    if (!passo) return sugestoes;

    if (passo.seletor_tipo === 'css') {
      sugestoes.push({
        texto: 'Este passo usa seletor CSS. Prefira data-cy quando possível.',
        acao: 'trocar_elemento', acaoRotulo: 'Trocar elemento',
      });
    }

    if (recorderTituloGenerico(passo.titulo)) {
      sugestoes.push({ texto: 'Revise o título deste passo.' });
    }

    if (!passo.descricao || !String(passo.descricao).trim()) {
      sugestoes.push({ texto: 'Adicione uma descrição para orientar o usuário.' });
    }

    var anterior = indice > 0 ? passos[indice - 1] : null;
    if (anterior && passo.seletor && anterior.seletor === passo.seletor && anterior.seletor_tipo === passo.seletor_tipo) {
      sugestoes.push({
        texto: 'Este passo parece duplicado do anterior.',
        acao: 'remover', acaoRotulo: 'Remover este passo',
      });
    }

    if (passo.modo_avanco_interacao === 'ao_clicar' && recorderSugestaoPareceCampo(passo)) {
      sugestoes.push({
        texto: 'Este elemento parece um campo. Prefira avanço ao alterar valor.',
        acao: 'ao_alterar_valor', acaoRotulo: 'Usar ao alterar valor',
      });
    }

    if (passo.modo_avanco_interacao === 'manual' && recorderSugestaoPareceBotao(passo)) {
      sugestoes.push({
        texto: 'Este passo pode avançar automaticamente ao clicar.',
        acao: 'ao_clicar', acaoRotulo: 'Usar ao clicar',
      });
    }

    if (passo.acao_ao_avancar === 'clicar_elemento' && passo.modo_avanco_interacao === 'ao_clicar') {
      sugestoes.push({
        texto: 'Este passo possui dois comportamentos de clique. Confirme se ambos são necessários.',
        acao: 'manual', acaoRotulo: 'Usar manual',
      });
    }

    return sugestoes;
  }

  function recorderHtmlSugestoes(passos, indice) {
    if (!recorderState.analiseAtiva) return '';
    var sugestoes = recorderSugestoesPasso(passos, indice);
    if (sugestoes.length === 0) return '';
    return '<ul class="up-rec-sugestoes">' + sugestoes.map(function (s) {
      return [
        '<li class="up-rec-sugestao-item">',
        '<span class="up-rec-sugestao-texto">' + escapeHtml(s.texto) + '</span>',
        (s.acao ? '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-rev-acao-rapida="' + s.acao + '" data-rev-index="' + indice + '">' + escapeHtml(s.acaoRotulo) + '</button>' : ''),
        '</li>',
      ].join('');
    }).join('') + '</ul>';
  }

  // Aplica uma ação rápida de uma sugestão. "trocar_elemento" reaproveita o
  // fluxo já existente de Trocar elemento; as demais mexem só no passo e
  // re-renderizam a revisão inteira (o que já recalcula alertas/sugestões).
  function recorderAplicarAcaoRapida(acao, indice) {
    if (acao === 'trocar_elemento') {
      recorderIniciarTrocaElemento(indice);
      return;
    }
    var passo = recorderState.passos[indice];
    if (!passo) return;

    if (acao === 'remover') {
      recorderState.passos.splice(indice, 1);
      recorderPersistir();
      recorderRenderRevisao();
      return;
    }

    if (acao === 'ao_clicar' || acao === 'ao_alterar_valor' || acao === 'manual') {
      passo.modo_avanco_interacao = acao;
      recorderPersistir();
      recorderRenderRevisao();
      return;
    }
  }

  // Campo "Seletor de confirmação" — só aparece quando o modo de avanço
  // escolhido precisa dele (ao_aparecer_elemento/ao_sumir_elemento). Trocar o
  // modo pra outro valor só oculta esse bloco (recorderRevisaoOnInput
  // re-renderiza só esse wrapper) — nunca apaga passo.seletor_confirmacao, que
  // continua lá se o usuário voltar a escolher um desses dois modos depois.
  function recorderHtmlConfirmacao(p, i) {
    if (RECORDER_MODOS_AVANCO_COM_CONFIRMACAO.indexOf(p.modo_avanco_interacao) === -1) return '';
    return [
      '<label class="up-rec-revisao-label">Seletor de confirmação</label>',
      '<input type="text" class="up-rec-input" data-rev-campo="seletor_confirmacao" data-rev-index="' + i + '" value="' + escapeHtml(p.seletor_confirmacao || '') + '" placeholder="Seletor CSS — ex: .dropdown-aberto ou [data-cy=overlay]">',
    ].join('');
  }

  // Select customizado (aparência igual aos campos do sistema, sem o menu
  // nativo do navegador) — mantém um <select> de verdade escondido
  // (.up-rec-select-nativo) com os MESMOS data-rev-campo/data-rev-index de
  // antes, só pra continuar disparando 'change' e passar pelo
  // recorderRevisaoOnInput sem duplicar nenhuma lógica de atualização/
  // persistência/JSON. O usuário só vê e interage com o botão+dropdown.
  function recorderSelectHtml(campo, indice, valorAtual, opcoes) {
    var opcaoAtual = null;
    for (var i = 0; i < opcoes.length; i++) {
      if (opcoes[i].value === valorAtual) { opcaoAtual = opcoes[i]; break; }
    }

    var options = opcoes.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === valorAtual ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('');

    var itensDropdown = opcoes.map(function (o) {
      var selecionado = o.value === valorAtual;
      return [
        '<button type="button" class="up-rec-cs-opcao' + (selecionado ? ' up-rec-cs-opcao-selecionada' : '') + '" data-cs-opcao data-value="' + escapeHtml(o.value) + '" role="option" aria-selected="' + selecionado + '">',
        '<span class="up-rec-cs-opcao-label">' + escapeHtml(o.label) + '</span>',
        '<span class="up-rec-cs-check" aria-hidden="true">&#10003;</span>',
        '</button>',
      ].join('');
    }).join('');

    return [
      '<div class="up-rec-customselect" data-cs-wrap>',
      '<select class="up-rec-select-nativo" data-rev-campo="' + campo + '" data-rev-index="' + indice + '" tabindex="-1" aria-hidden="true">' + options + '</select>',
      '<button type="button" class="up-rec-cs-trigger" data-cs-trigger aria-haspopup="listbox" aria-expanded="false">',
      '<span class="up-rec-cs-valor">' + escapeHtml(opcaoAtual ? opcaoAtual.label : '') + '</span>',
      '<span class="up-rec-cs-seta" aria-hidden="true">&#9662;</span>',
      '</button>',
      '<div class="up-rec-cs-dropdown" data-cs-dropdown role="listbox" hidden>' + itensDropdown + '</div>',
      '</div>',
    ].join('');
  }

  // Mockup estático do tooltip real do tour (mesmas classes/rótulos usados em
  // renderTour) — só ilustrativo, não executa nada. Título/descrição vazios
  // mostram um placeholder em itálico, igual ao preview de passo do admin.
  function recorderHtmlPreview(p, i, total) {
    var semTitulo = !p.titulo || !p.titulo.trim();
    var semDescricao = !p.descricao || !String(p.descricao).trim();
    return [
      '<div class="up-rec-preview">',
      '<p class="up-rec-preview-label">Preview do tooltip</p>',
      '<div class="up-rec-preview-tooltip">',
      '<p class="up-rec-preview-progress">Passo ' + (i + 1) + ' de ' + total + '</p>',
      '<p class="up-rec-preview-titulo' + (semTitulo ? ' up-rec-preview-vazio' : '') + '" data-rev-preview-titulo="' + i + '">' + escapeHtml(semTitulo ? 'Título do passo' : p.titulo) + '</p>',
      '<p class="up-rec-preview-desc' + (semDescricao ? ' up-rec-preview-vazio' : '') + '" data-rev-preview-desc="' + i + '">' + escapeHtml(semDescricao ? 'Descrição do passo (opcional)' : p.descricao) + '</p>',
      '</div>',
      '</div>',
    ].join('');
  }

  function recorderHtmlRevisaoItem(p, i, total, passos) {
    var resumo = recorderResumoTituloRevisao(p);
    return [
      '<div class="up-rec-revisao-item">',
      '<div class="up-rec-revisao-header">',
      '<div class="up-rec-revisao-header-titulo">',
      '<span class="up-rec-revisao-numero">' + (i + 1) + '</span>',
      '<span class="up-rec-revisao-ordem">Passo ' + (i + 1) + '</span>',
      '<span class="up-rec-revisao-resumo" data-rev-resumo="' + i + '">' + (resumo ? '— ' + escapeHtml(resumo) : '') + '</span>',
      '</div>',
      '<div class="up-rec-revisao-acoes">',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-quadrado" data-rev-subir data-rev-index="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Mover para cima">&uarr;</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-quadrado" data-rev-descer data-rev-index="' + i + '"' + (i === total - 1 ? ' disabled' : '') + ' title="Mover para baixo">&darr;</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-danger" data-rev-remover data-rev-index="' + i + '" title="Remover passo">Remover</button>',
      '</div>',
      '</div>',
      '<div class="up-rec-revisao-principal">',
      '<label class="up-rec-revisao-label-principal">Título</label>',
      '<input type="text" class="up-rec-input" data-rev-campo="titulo" data-rev-index="' + i + '" value="' + escapeHtml(p.titulo || '') + '">',
      '<label class="up-rec-revisao-label-principal">Descrição</label>',
      '<textarea class="up-rec-textarea-sm" data-rev-campo="descricao" data-rev-index="' + i + '">' + escapeHtml(p.descricao || '') + '</textarea>',
      '</div>',
      '<div class="up-rec-revisao-preview-wrap">' + recorderHtmlPreview(p, i, total) + '</div>',
      '<div class="up-rec-revisao-config">',
      '<p class="up-rec-revisao-config-titulo">Configuração do passo</p>',
      '<div class="up-rec-revisao-grid">',
      '<div>',
      '<span class="up-rec-revisao-label">Seletor</span>',
      '<code class="up-rec-revisao-codigo" title="' + escapeHtml(p.seletor) + '">' + escapeHtml(p.seletor_tipo) + ': ' + escapeHtml(p.seletor) + '</code>',
      '<div class="up-rec-revisao-seletor-acoes">',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-rev-localizar data-rev-index="' + i + '" title="Localizar na tela: destaca este elemento na página real">Localizar</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-icone-acento" data-rev-trocar data-rev-index="' + i + '" title="Trocar elemento: clique de novo no elemento certo na tela real">Trocar</button>',
      '</div>',
      '</div>',
      '<div><span class="up-rec-revisao-label">Posição do tooltip</span>' + recorderSelectHtml('tooltip_posicao', i, p.tooltip_posicao, RECORDER_TOOLTIP_POSICOES) + '</div>',
      '<div><span class="up-rec-revisao-label">Como avançar</span>' + recorderSelectHtml('modo_avanco_interacao', i, p.modo_avanco_interacao, RECORDER_MODOS_AVANCO) + '</div>',
      '<div><span class="up-rec-revisao-label">Ação ao clicar em Próximo</span>' + recorderSelectHtml('acao_ao_avancar', i, p.acao_ao_avancar, RECORDER_ACOES_AO_AVANCAR) + '</div>',
      '</div>',
      '<div class="up-rec-confirmacao-wrap" data-rev-confirmacao-wrap="' + i + '">' + recorderHtmlConfirmacao(p, i) + '</div>',
      '</div>',
      '<div class="up-rec-alertas-wrap" data-rev-alertas="' + i + '">' + recorderHtmlAlertas(p) + '</div>',
      '<div class="up-rec-sugestoes-wrap" data-rev-sugestoes="' + i + '">' + recorderHtmlSugestoes(passos, i) + '</div>',
      '</div>',
    ].join('');
  }

  function recorderHtmlRevisao() {
    var passos = recorderState.passos;
    var vazio = passos.length === 0;
    var itens = passos.map(function (p, i) { return recorderHtmlRevisaoItem(p, i, passos.length, passos); }).join('');
    return [
      '<div class="up-rec-modal up-rec-modal-revisao">',
      '<div class="up-rec-revisao-cabecalho">',
      '<div class="up-rec-revisao-topo">',
      '<h3 class="up-rec-modal-title">Revisar passos</h3>',
      '<span class="up-rec-revisao-contagem">' + passos.length + ' passo' + (passos.length === 1 ? '' : 's') + '</span>',
      '</div>',
      '<p class="up-rec-modal-sub">Ajuste título, descrição e comportamento de cada passo antes de gerar o JSON.</p>',
      '</div>',
      (vazio ? '' : [
        '<div class="up-rec-revisao-toolbar">',
        '<button type="button" class="up-rec-btn up-rec-btn-secondary up-rec-analisar-btn' + (recorderState.analiseAtiva ? ' up-rec-btn-secondary-ativo' : '') + '" data-rev-analisar>' + (recorderState.analiseAtiva ? 'Ocultar análise' : 'Analisar passos') + '</button>',
        '</div>',
      ].join('')),
      '<div class="up-rec-revisao-lista">',
      (vazio ? '<p class="up-rec-modal-sub">Capture pelo menos um passo para gerar o JSON.</p>' : itens),
      '</div>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-rev-fechar>Fechar</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-rev-gerar' + (vazio ? ' disabled title="Capture pelo menos um passo para gerar o JSON."' : '') + '>Gerar JSON</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Fecha o painel de revisão SEM finalizar — não é destrutivo: restaura o
  // estado de pausa anterior, mantém passos/sessionStorage intactos e volta a
  // mostrar a barra flutuante, pra não deixar o usuário "preso" caso tenha
  // clicado em Finalizar querendo só dar uma olhada. Cancelar a gravação
  // inteira continua sendo só o botão "Cancelar" da barra.
  function recorderFecharRevisao() {
    var painel = document.getElementById(RECORDER_PAINEL_ID);
    if (painel) painel.remove();
    recorderState.pausado = Boolean(recorderState.pausadoAntesRevisao);
    recorderPersistir();
    recorderRenderBarra();
    if (recorderState.revisarTempoReal) recorderRenderPainelLateral(); // reabre o painel lateral, se ainda ligado
  }

  // Botão "Gerar JSON" da revisão — esse sim finaliza de verdade: para a
  // captura, limpa o sessionStorage (a sessão só é limpa aqui ou ao
  // Cancelar) e mostra o painel com o JSON pronto pra copiar/baixar, já
  // refletindo qualquer edição feita na revisão.
  function recorderGerarJsonFinal() {
    var painel = document.getElementById(RECORDER_PAINEL_ID);
    if (painel) painel.remove();
    recorderState.ativo = false;
    recorderPararCaptura();
    recorderLimparPersistencia();
    recorderRenderPainelFinal();
  }

  function recorderRevisaoOnInput(event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;
    var campo = alvo.getAttribute('data-rev-campo');
    if (!campo) return;
    var indice = Number(alvo.getAttribute('data-rev-index'));
    var passo = recorderState.passos[indice];
    if (!passo) return;
    passo[campo] = alvo.value;
    recorderPersistir();

    // Mudou o modo de avanço — mostra/oculta o campo "Seletor de confirmação"
    // (só esse wrapper é re-renderizado; passo.seletor_confirmacao em si nunca
    // é apagado aqui, só deixa de aparecer quando o modo não precisa dele).
    if (campo === 'modo_avanco_interacao') {
      var wrapConf = document.querySelector('[data-rev-confirmacao-wrap="' + indice + '"]');
      if (wrapConf) wrapConf.innerHTML = recorderHtmlConfirmacao(passo, indice);
    }

    // Título mudou — atualiza só o resumo no cabeçalho do card (texto, sem
    // re-renderizar o campo de título em si).
    if (campo === 'titulo') {
      var resumoEl = document.querySelector('[data-rev-resumo="' + indice + '"]');
      if (resumoEl) {
        var resumo = recorderResumoTituloRevisao(passo);
        resumoEl.textContent = resumo ? '— ' + resumo : '';
      }
    }

    // Preview do tooltip — mesmo texto ao vivo, sem re-renderizar o card.
    if (campo === 'titulo') {
      var previewTitulo = document.querySelector('[data-rev-preview-titulo="' + indice + '"]');
      if (previewTitulo) {
        var semTitulo = !passo.titulo || !passo.titulo.trim();
        previewTitulo.textContent = semTitulo ? 'Título do passo' : passo.titulo;
        previewTitulo.classList.toggle('up-rec-preview-vazio', semTitulo);
      }
    }
    if (campo === 'descricao') {
      var previewDesc = document.querySelector('[data-rev-preview-desc="' + indice + '"]');
      if (previewDesc) {
        var semDescricao = !passo.descricao || !String(passo.descricao).trim();
        previewDesc.textContent = semDescricao ? 'Descrição do passo (opcional)' : passo.descricao;
        previewDesc.classList.toggle('up-rec-preview-vazio', semDescricao);
      }
    }

    // Título/descrição/modo/seletor de confirmação afetam os alertas exibidos
    // — atualiza só o bloco de alertas dessa linha (sem re-renderizar campos
    // de texto, que perderiam o foco/cursor do usuário no meio da digitação).
    if (campo === 'titulo' || campo === 'descricao' || campo === 'modo_avanco_interacao' || campo === 'seletor_confirmacao') {
      var wrap = document.querySelector('[data-rev-alertas="' + indice + '"]');
      if (wrap) wrap.innerHTML = recorderHtmlAlertas(passo);
    }

    // Mesma ideia pras sugestões do "Analisar passos" — o conjunto de campos
    // que influencia é um pouco diferente (inclui acao_ao_avancar, não inclui
    // seletor_confirmacao). Só recalcula o texto se a análise estiver ativa;
    // recorderHtmlSugestoes já retorna vazio quando não está.
    if (campo === 'titulo' || campo === 'descricao' || campo === 'modo_avanco_interacao' || campo === 'acao_ao_avancar') {
      var wrapSug = document.querySelector('[data-rev-sugestoes="' + indice + '"]');
      if (wrapSug) wrapSug.innerHTML = recorderHtmlSugestoes(recorderState.passos, indice);
    }
  }

  // Fecha qualquer dropdown de select customizado aberto no painel de
  // revisão — usado tanto pelo "clique fora" quanto antes de abrir um outro
  // (só um aberto por vez).
  function recorderFecharTodosDropdownsSelect() {
    var root = document.getElementById(RECORDER_PAINEL_ID);
    if (!root) return;
    var dropdowns = root.querySelectorAll('[data-cs-dropdown]');
    for (var i = 0; i < dropdowns.length; i++) {
      var dd = dropdowns[i];
      if (dd.hidden) continue;
      dd.hidden = true;
      var wrap = dd.closest('[data-cs-wrap]');
      var trigger = wrap && wrap.querySelector('[data-cs-trigger]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function recorderRevisaoOnClick(event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;

    // Clique fora de qualquer select customizado fecha o(s) que estiverem
    // abertos — inclui clique no restante do modal e no backdrop (o próprio
    // elemento raiz do overlay). Cliques dentro de um select (aberto ou não)
    // seguem pros handlers específicos de trigger/opção logo abaixo.
    if (!alvo.closest('[data-cs-wrap]')) {
      recorderFecharTodosDropdownsSelect();
    } else {
      var trigger = alvo.closest('[data-cs-trigger]');
      if (trigger) {
        var wrapTrigger = trigger.closest('[data-cs-wrap]');
        var dropdown = wrapTrigger.querySelector('[data-cs-dropdown]');
        var estavaAberto = !dropdown.hidden;
        recorderFecharTodosDropdownsSelect();
        dropdown.hidden = estavaAberto;
        trigger.setAttribute('aria-expanded', String(!dropdown.hidden));
        return;
      }

      var opcao = alvo.closest('[data-cs-opcao]');
      if (opcao) {
        var wrapOpcao = opcao.closest('[data-cs-wrap]');
        var select = wrapOpcao.querySelector('select');
        var novoValor = opcao.getAttribute('data-value');
        if (select.value !== novoValor) {
          select.value = novoValor;
          // Dispara o MESMO evento/elemento que o select nativo antigo
          // disparava — recorderRevisaoOnInput cuida de atualizar o passo,
          // persistir e recalcular alertas/sugestões/confirmação, sem
          // nenhuma duplicação de lógica aqui.
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        var rotulo = opcao.querySelector('.up-rec-cs-opcao-label');
        var valorExibido = wrapOpcao.querySelector('.up-rec-cs-valor');
        if (rotulo && valorExibido) valorExibido.textContent = rotulo.textContent;
        var opcoesDoWrap = wrapOpcao.querySelectorAll('[data-cs-opcao]');
        for (var j = 0; j < opcoesDoWrap.length; j++) {
          var selecionada = opcoesDoWrap[j] === opcao;
          opcoesDoWrap[j].classList.toggle('up-rec-cs-opcao-selecionada', selecionada);
          opcoesDoWrap[j].setAttribute('aria-selected', String(selecionada));
        }
        recorderFecharTodosDropdownsSelect();
        return;
      }
    }

    if (alvo.closest('[data-rev-fechar]')) { recorderFecharRevisao(); return; }
    if (alvo.closest('[data-rev-gerar]')) {
      if (recorderState.passos.length === 0) return; // defesa extra — o botão já vem "disabled" nesse caso
      recorderGerarJsonFinal();
      return;
    }
    if (alvo.closest('[data-rev-analisar]')) {
      recorderState.analiseAtiva = !recorderState.analiseAtiva;
      recorderRenderRevisao();
      return;
    }

    var btnAcaoRapida = alvo.closest('[data-rev-acao-rapida]');
    if (btnAcaoRapida) {
      var acao = btnAcaoRapida.getAttribute('data-rev-acao-rapida');
      var idxAcao = Number(btnAcaoRapida.getAttribute('data-rev-index'));
      recorderAplicarAcaoRapida(acao, idxAcao);
      return;
    }

    var btnRemover = alvo.closest('[data-rev-remover]');
    if (btnRemover) {
      var idxRem = Number(btnRemover.getAttribute('data-rev-index'));
      recorderState.passos.splice(idxRem, 1);
      recorderPersistir();
      recorderRenderRevisao();
      return;
    }

    var btnSubir = alvo.closest('[data-rev-subir]');
    if (btnSubir) {
      var idxS = Number(btnSubir.getAttribute('data-rev-index'));
      if (idxS > 0) {
        var tmp = recorderState.passos[idxS - 1];
        recorderState.passos[idxS - 1] = recorderState.passos[idxS];
        recorderState.passos[idxS] = tmp;
        recorderPersistir();
        recorderRenderRevisao();
      }
      return;
    }

    var btnDescer = alvo.closest('[data-rev-descer]');
    if (btnDescer) {
      var idxD = Number(btnDescer.getAttribute('data-rev-index'));
      if (idxD < recorderState.passos.length - 1) {
        var tmp2 = recorderState.passos[idxD + 1];
        recorderState.passos[idxD + 1] = recorderState.passos[idxD];
        recorderState.passos[idxD] = tmp2;
        recorderPersistir();
        recorderRenderRevisao();
      }
      return;
    }

    var btnTrocar = alvo.closest('[data-rev-trocar]');
    if (btnTrocar) {
      var idxT = Number(btnTrocar.getAttribute('data-rev-index'));
      recorderIniciarTrocaElemento(idxT);
      return;
    }

    var btnLocalizar = alvo.closest('[data-rev-localizar]');
    if (btnLocalizar) {
      var idxL = Number(btnLocalizar.getAttribute('data-rev-index'));
      recorderLocalizarElemento(idxL);
      return;
    }
  }

  function recorderRenderRevisao() {
    var existente = document.getElementById(RECORDER_PAINEL_ID);
    if (existente) existente.remove();

    var root = document.createElement('div');
    root.id = RECORDER_PAINEL_ID;
    root.className = 'up-rec-overlay';
    root.innerHTML = recorderHtmlRevisao();
    document.body.appendChild(root);

    root.addEventListener('input', recorderRevisaoOnInput);
    root.addEventListener('change', recorderRevisaoOnInput);
    root.addEventListener('click', recorderRevisaoOnClick);
    // ESC fecha o dropdown de select customizado aberto (só isso — não fecha
    // o painel de revisão inteiro).
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') recorderFecharTodosDropdownsSelect();
    });
  }

  // ─── Trocar elemento de um passo (dentro da revisão) ─────────────────────
  // Deixa o usuário reapontar o seletor de um passo já capturado, clicando de
  // novo no elemento certo na página real — útil quando o seletor veio
  // frágil/errado. Nunca cria um passo novo: só atualiza o existente na
  // mesma posição.

  var recorderTrocaAvisoTimer = null;
  // Texto de status "atual" da barra de troca (achou/não achou o elemento
  // anterior) — guardado pra recorderAvisarNaBarraTroca conseguir restaurar
  // depois de um aviso temporário (ex.: campo sensível), sem recalcular nada.
  var recorderTrocaStatusOriginal = '';

  // ─── Destaque do elemento ATUAL do passo, enquanto o usuário decide o novo ──
  // Independente do spotlight do tour real (tourState) — é só um retângulo
  // visual temporário, sem nenhum efeito no runtime do tour.
  var RECORDER_DESTAQUE_ID = 'userpulse-recorder-destaque';
  var recorderDestaqueElemento = null;
  var recorderDestaqueHandlersBound = false;

  function recorderPosicionarDestaque() {
    if (!recorderDestaqueElemento) return;
    var div = document.getElementById(RECORDER_DESTAQUE_ID);
    if (!div) return;
    var rect = recorderDestaqueElemento.getBoundingClientRect();
    div.style.top = (rect.top - 4) + 'px';
    div.style.left = (rect.left - 4) + 'px';
    div.style.width = (rect.width + 8) + 'px';
    div.style.height = (rect.height + 8) + 'px';
  }

  function recorderMostrarDestaque(el) {
    recorderRemoverDestaque();
    recorderDestaqueElemento = el;
    var div = document.createElement('div');
    div.id = RECORDER_DESTAQUE_ID;
    div.className = 'up-rec-destaque';
    document.body.appendChild(div);
    recorderPosicionarDestaque();
  }

  function recorderRemoverDestaque() {
    recorderDestaqueElemento = null;
    var div = document.getElementById(RECORDER_DESTAQUE_ID);
    if (div) div.remove();
  }

  function recorderBindDestaqueReposicao() {
    if (recorderDestaqueHandlersBound) return;
    recorderDestaqueHandlersBound = true;
    window.addEventListener('scroll', recorderPosicionarDestaque, true);
    window.addEventListener('resize', recorderPosicionarDestaque);
  }

  function recorderUnbindDestaqueReposicao() {
    if (!recorderDestaqueHandlersBound) return;
    recorderDestaqueHandlersBound = false;
    window.removeEventListener('scroll', recorderPosicionarDestaque, true);
    window.removeEventListener('resize', recorderPosicionarDestaque);
  }

  // "data-cy=\"valor\"" pra seletor_tipo=data_cy, ou o próprio CSS pra seletor_tipo=css.
  function recorderFormatarSeletorAtual(passo) {
    if (!passo || !passo.seletor) return '(nenhum seletor definido)';
    if (passo.seletor_tipo === 'data_cy') return 'data-cy="' + passo.seletor + '"';
    return passo.seletor;
  }

  // Some com o painel de revisão (senão o overlay dele bloquearia cliques na
  // página real), tenta localizar o elemento ATUAL do passo (mesma lógica do
  // runtime do tour — selecionarElementoPasso) pra dar contexto ao usuário
  // antes dele clicar em outro, e mostra a barra flutuante com esse contexto.
  // Pausa a captura normal enquanto espera o clique de troca — obrigatório
  // quando chamado do painel lateral (captura ainda ativa; sem isso o
  // clique no novo elemento vira também um passo novo indesejado). Guarda o
  // pausado anterior pra restaurar corretamente ao sair (recorderPararEscutaTroca)
  // — no fluxo já existente via revisão final, já estava pausado, então
  // restaura pausado=true igual antes; sem mudança de comportamento ali.
  function recorderIniciarTrocaElemento(indice, origem) {
    var passo = recorderState.passos[indice];
    if (!passo) return;
    recorderState.trocaIndice = indice;
    recorderState.trocaOrigem = origem === 'painel-lateral' ? 'painel-lateral' : 'revisao';
    recorderState.pausadoAntesTroca = recorderState.pausado;
    recorderState.pausado = true;
    var painel = document.getElementById(RECORDER_PAINEL_ID);
    if (painel) painel.remove();

    if (recorderState.trocaOrigem === 'painel-lateral') {
      // Recolhe pro pill enquanto o usuário seleciona o novo elemento — mesma
      // ideia de remover o painel de revisão acima, mas pro painel lateral
      // (nunca é removido do DOM, só recolhido; reabre em recorderAplicarNovoSeletor/
      // recorderCancelarTroca/cancelar da escolha de seletor).
      recorderState.painelLateralAberto = false;
      recorderRenderPainelLateral();
    }

    var elementoAtual = null;
    try { elementoAtual = selecionarElementoPasso(passo); } catch (_e) { elementoAtual = null; }

    recorderRenderTrocaBarra(indice, passo, Boolean(elementoAtual));

    if (elementoAtual) {
      recorderMostrarDestaque(elementoAtual);
      try { elementoAtual.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) {}
      recorderBindDestaqueReposicao();
    }

    document.addEventListener('click', recorderCapturarTrocaElemento, true);
  }

  function recorderRenderTrocaBarra(indice, passo, elementoEncontrado) {
    if (document.getElementById(RECORDER_TROCA_BAR_ID)) return;

    recorderTrocaStatusOriginal = elementoEncontrado
      ? 'Elemento atual destacado. Clique em outro elemento para substituir.'
      : 'Elemento atual não encontrado nesta tela. Clique no novo elemento desejado.';

    var tituloParte = passo && passo.titulo && passo.titulo.trim()
      ? '<span class="up-rec-troca-titulo-passo">' + escapeHtml(passo.titulo.trim()) + '</span>'
      : '';

    var bar = document.createElement('div');
    bar.id = RECORDER_TROCA_BAR_ID;
    bar.className = 'up-rec-bar up-rec-bar-troca';
    bar.innerHTML = [
      '<span class="up-rec-dot"></span>',
      // Instrução explícita — "Selecione o novo elemento" deixa a ação
      // pedida clara de cara, em vez de só descrever o modo ("Trocando...").
      '<span class="up-rec-label">Selecione o novo elemento para o Passo ' + (indice + 1) + '</span>',
      tituloParte,
      '<span class="up-rec-troca-info">Elemento atual: ' + escapeHtml(recorderFormatarSeletorAtual(passo)) + '</span>',
      '<span class="up-rec-troca-status" data-troca-aviso>' + escapeHtml(recorderTrocaStatusOriginal) + '</span>',
      '<div class="up-rec-actions">',
      (elementoEncontrado ? '<button type="button" class="up-rec-btn" data-troca-ver-atual>Ver seletores do elemento atual</button>' : ''),
      '<button type="button" class="up-rec-btn up-rec-btn-danger" data-troca-cancelar>Cancelar troca</button>',
      '</div>',
    ].join('');
    document.body.appendChild(bar);

    bar.addEventListener('click', function (event) {
      var alvo = event.target;
      if (!(alvo instanceof Element)) return;
      if (alvo.closest('[data-troca-cancelar]')) { recorderCancelarTroca(); return; }
      if (alvo.closest('[data-troca-ver-atual]')) { recorderVerSeletoresElementoAtual(); return; }
    });
  }

  // Mensagem temporária na barra de troca (ex.: elemento sensível clicado) —
  // volta ao texto de status original depois de alguns segundos, sem encerrar
  // o modo de seleção (o usuário continua podendo clicar em outro elemento).
  function recorderAvisarNaBarraTroca(texto) {
    var bar = document.getElementById(RECORDER_TROCA_BAR_ID);
    if (!bar) return;
    var span = bar.querySelector('[data-troca-aviso]');
    if (!span) return;
    if (recorderTrocaAvisoTimer) window.clearTimeout(recorderTrocaAvisoTimer);
    span.textContent = texto;
    recorderTrocaAvisoTimer = window.setTimeout(function () {
      recorderTrocaAvisoTimer = null;
      span.textContent = recorderTrocaStatusOriginal;
    }, 3200);
  }

  // Mostra os candidatos de seletor do elemento ATUAL (o mesmo já destacado),
  // sem precisar que o usuário clique em outro elemento — reaproveita o mesmo
  // mini painel "Escolha o seletor deste passo" usado pra um elemento novo.
  function recorderVerSeletoresElementoAtual() {
    var passo = recorderState.passos[recorderState.trocaIndice];
    if (!passo) return;
    var elementoAtual = null;
    try { elementoAtual = selecionarElementoPasso(passo); } catch (_e) { elementoAtual = null; }
    if (!elementoAtual) return; // botão só aparece quando encontrado; confere de novo por segurança
    recorderPararEscutaTroca();
    recorderMostrarEscolhaSeletor(elementoAtual);
  }

  function recorderPararEscutaTroca() {
    document.removeEventListener('click', recorderCapturarTrocaElemento, true);
    if (recorderTrocaAvisoTimer) {
      window.clearTimeout(recorderTrocaAvisoTimer);
      recorderTrocaAvisoTimer = null;
    }
    recorderRemoverDestaque();
    recorderUnbindDestaqueReposicao();
    var bar = document.getElementById(RECORDER_TROCA_BAR_ID);
    if (bar) bar.remove();
    recorderState.pausado = recorderState.pausadoAntesTroca;
  }

  // Único ponto de saída do fluxo de "Trocar elemento" — chamado tanto ao
  // cancelar (na barra de troca ou no modal de escolha de seletor) quanto ao
  // confirmar um novo seletor (recorderAplicarNovoSeletor). Decide SEMPRE a
  // partir de recorderState.trocaOrigem (nunca de onde foi chamado), e é o
  // único lugar que limpa trocaIndice/trocaOrigem — elimina o risco de um
  // dos chamadores esquecer a checagem de origem e cair direto em
  // recorderRenderRevisao() por engano (bug anterior).
  function recorderFinalizarTrocaElemento() {
    var indice = recorderState.trocaIndice;
    var origem = recorderState.trocaOrigem;
    recorderState.trocaIndice = null;
    recorderState.trocaOrigem = null;

    // Causa raiz do bug "Trocar volta pra revisão/JSON mesmo vindo do painel
    // lateral": o modal "Escolha o seletor deste passo" (recorderMostrarEscolhaSeletor)
    // usa RECORDER_PAINEL_ID e nunca era removido daqui. recorderRenderRevisao()
    // reaproveita esse MESMO id e por isso se auto-limpava (mascarando o
    // problema no fluxo vindo da revisão) — mas recorderRenderPainelLateral()
    // usa outro id (RECORDER_PAINEL_LATERAL_ID) e nunca tocava nesse overlay,
    // que ficava por cima da tela bloqueando tudo (parecia "abrir outra
    // tela"). Remove sempre aqui, único ponto de saída, antes de decidir pra
    // onde voltar.
    var escolhaOuRevisaoAntiga = document.getElementById(RECORDER_PAINEL_ID);
    if (escolhaOuRevisaoAntiga) escolhaOuRevisaoAntiga.remove();

    if (origem === 'painel-lateral') {
      // Volta pro painel lateral com o mesmo passo selecionado — nunca abre a
      // revisão final nem gera JSON.
      recorderState.pausado = recorderState.pausadoAntesTroca;
      recorderState.painelLateralIndiceSelecionado = indice;
      recorderState.painelLateralAberto = true;
      recorderRenderPainelLateral();
      return;
    }

    // Vindo da revisão final — precisa estar pausado antes de reabri-la,
    // senão a captura normal ficaria ativa por baixo do overlay.
    recorderState.pausado = true;
    recorderRenderRevisao(); // volta pro painel de revisão sem alterar o passo
  }

  function recorderCancelarTroca() {
    recorderPararEscutaTroca(); // já restaura recorderState.pausado = pausadoAntesTroca
    recorderFinalizarTrocaElemento();
  }

  // Único clique escutado enquanto o modo de troca está ativo. Roda em fase
  // de captura e sempre bloqueia o clique real (preventDefault/stopPropagation
  // /stopImmediatePropagation) assim que decide que o alvo é candidato a novo
  // elemento — exceto cliques dentro da própria UI do gravador (ex.: o botão
  // "Cancelar seleção"), que precisam funcionar normalmente.
  function recorderCapturarTrocaElemento(event) {
    var el = event.target;
    if (!(el instanceof Element)) return;
    if (recorderElementoNaBarra(el)) return; // clique na própria UI do gravador (ex.: Cancelar) — deixa funcionar normal

    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

    if (recorderCampoSensivel(el)) {
      recorderAvisarNaBarraTroca('Esse elemento parece um campo sensível (senha/CPF/e-mail/telefone/cartão) — escolha outro elemento.');
      return; // continua no modo de seleção, esperando outro clique
    }

    recorderPararEscutaTroca();
    recorderMostrarEscolhaSeletor(el);
  }

  // ─── "Localizar na tela" (dentro da revisão ou do painel lateral) ────────
  // Diferente de "Trocar elemento": não espera clique nenhum, só destaca +
  // rola até o elemento ATUAL do passo pra dar contexto, com um botão pra
  // voltar. Reaproveita o mesmo destaque/scroll do runtime do tour
  // (selecionarElementoPasso) — nunca altera o passo.
  // origem ('revisao', padrão, ou 'painel-lateral') controla só pra onde
  // recorderFecharLocalizarBarra volta ao fechar — o painel lateral nunca
  // bloqueia a tela como a revisão final, então não precisa ser removido
  // nem readicionado.
  function recorderLocalizarElemento(indice, origem) {
    var passo = recorderState.passos[indice];
    if (!passo) return;
    recorderState.localizarOrigem = origem === 'painel-lateral' ? 'painel-lateral' : 'revisao';

    if (recorderState.localizarOrigem === 'revisao') {
      var painel = document.getElementById(RECORDER_PAINEL_ID);
      if (painel) painel.remove();
    }

    var elementoAtual = null;
    try { elementoAtual = selecionarElementoPasso(passo); } catch (_e) { elementoAtual = null; }

    recorderRenderLocalizarBarra(indice, passo, Boolean(elementoAtual));

    if (elementoAtual) {
      recorderMostrarDestaque(elementoAtual);
      try { elementoAtual.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) {}
      recorderBindDestaqueReposicao();
    }
  }

  function recorderRenderLocalizarBarra(indice, passo, elementoEncontrado) {
    if (document.getElementById(RECORDER_LOCALIZAR_BAR_ID)) return;

    var tituloParte = passo && passo.titulo && passo.titulo.trim() ? ' — ' + escapeHtml(passo.titulo.trim()) : '';

    var bar = document.createElement('div');
    bar.id = RECORDER_LOCALIZAR_BAR_ID;
    bar.className = 'up-rec-bar';
    bar.innerHTML = [
      '<span class="up-rec-label">Passo ' + (indice + 1) + tituloParte + '</span>',
      '<span class="up-rec-troca-status">' + (elementoEncontrado
        ? 'Elemento destacado na tela.'
        : (recorderSeletorPareceItemListaDinamica(passo)
          ? RECORDER_MSG_ELEMENTO_TEMPORARIO_LISTA
          : 'Elemento não encontrado nesta tela — pode estar oculto ou em outra página.')) + '</span>',
      '<div class="up-rec-actions">',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-localizar-voltar>Voltar à revisão</button>',
      '</div>',
    ].join('');
    document.body.appendChild(bar);

    bar.addEventListener('click', function (event) {
      if (event.target instanceof Element && event.target.closest('[data-localizar-voltar]')) recorderFecharLocalizarBarra();
    });
  }

  function recorderFecharLocalizarBarra() {
    recorderRemoverDestaque();
    recorderUnbindDestaqueReposicao();
    var bar = document.getElementById(RECORDER_LOCALIZAR_BAR_ID);
    if (bar) bar.remove();
    var origem = recorderState.localizarOrigem;
    recorderState.localizarOrigem = null;
    if (origem === 'painel-lateral') return; // painel lateral nunca foi removido — nada a reabrir
    recorderRenderRevisao(); // volta pro painel de revisão sem alterar nada
  }

  function recorderQualidadeLabel(qualidade) {
    if (qualidade === 'recomendado') return 'Recomendado';
    if (qualidade === 'bom') return 'Bom';
    if (qualidade === 'area') return 'Área';
    return 'Frágil';
  }

  function recorderCategoriaLabel(categoria) {
    return categoria === 'area' ? 'Área' : 'Elemento';
  }

  function recorderHtmlEscolhaSeletor(candidatos) {
    var itens = candidatos.map(function (c, i) {
      var qtdTexto = typeof c.quantidade === 'number' && c.quantidade > 0
        ? (c.quantidade === 1 ? '1 elemento encontrado' : c.quantidade + ' elementos encontrados')
        : '';
      return [
        '<button type="button" class="up-rec-escolha-item up-rec-escolha-item-' + c.qualidade + '" data-esc-escolher data-esc-index="' + i + '">',
        '<span class="up-rec-escolha-categoria up-rec-categoria-' + c.categoria + '">' + recorderCategoriaLabel(c.categoria) + '</span>',
        '<span class="up-rec-escolha-tipo">' + escapeHtml(c.rotulo) + '</span>',
        '<code class="up-rec-escolha-codigo" title="' + escapeHtml(c.seletor) + '">' + escapeHtml(c.seletor) + '</code>',
        (qtdTexto ? '<span class="up-rec-escolha-qtd">' + escapeHtml(qtdTexto) + '</span>' : ''),
        '<span class="up-rec-escolha-qualidade up-rec-qualidade-' + c.qualidade + '">' + recorderQualidadeLabel(c.qualidade) + '</span>',
        '</button>',
      ].join('');
    }).join('');

    return [
      '<div class="up-rec-modal up-rec-modal-escolha">',
      '<h3 class="up-rec-modal-title">Escolha o seletor deste passo</h3>',
      '<p class="up-rec-modal-sub">Selecione a opção mais estável para localizar este elemento na tela.</p>',
      '<div class="up-rec-escolha-lista">' + itens + '</div>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-esc-cancelar>Cancelar</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  // Mini painel de escolha — reaproveita o mesmo container (RECORDER_PAINEL_ID)
  // do painel de revisão/final, já que nunca aparecem ao mesmo tempo.
  function recorderMostrarEscolhaSeletor(el) {
    var candidatos = recorderGerarCandidatosSeletor(el);

    // Mostra .up-rec-overlay (bloqueia a tela) — sempre pausado a partir
    // daqui, mesmo vindo do painel lateral (captura ativa) via Trocar
    // elemento; sem isso a captura normal ficaria ligada por baixo do modal.
    recorderState.pausado = true;

    var existente = document.getElementById(RECORDER_PAINEL_ID);
    if (existente) existente.remove();

    var root = document.createElement('div');
    root.id = RECORDER_PAINEL_ID;
    root.className = 'up-rec-overlay';
    root.innerHTML = recorderHtmlEscolhaSeletor(candidatos);
    document.body.appendChild(root);

    root.addEventListener('click', function (event) {
      var alvo = event.target;
      if (!(alvo instanceof Element)) return;

      if (alvo.closest('[data-esc-cancelar]')) {
        recorderFinalizarTrocaElemento(); // cancelar aqui também não altera o passo
        return;
      }

      var botaoEscolher = alvo.closest('[data-esc-escolher]');
      if (botaoEscolher) {
        var indice = Number(botaoEscolher.getAttribute('data-esc-index'));
        var candidato = candidatos[indice];
        if (candidato) recorderAplicarNovoSeletor(el, candidato);
        return;
      }
    });
  }

  // Atualiza só seletor_tipo/seletor do passo (mantém a mesma posição no
  // array). Título só é preenchido se ainda estiver vazio — nunca sobrescreve
  // o que o usuário já escreveu na revisão. Descrição nunca tem uma fonte
  // automática (o gravador nunca inventa descrição), então fica como estava.
  function recorderAplicarNovoSeletor(el, candidato) {
    // Captura antes de recorderFinalizarTrocaElemento() limpar trocaIndice.
    var passo = recorderState.passos[recorderState.trocaIndice];
    // Defesa extra: só aplica se o candidato tiver um seletor_tipo válido
    // (data_cy, css ou area) — recorderGerarCandidatosSeletor já só gera
    // esses três, isso só protege contra um candidato inválido chegar aqui
    // por engano.
    if (passo && RECORDER_TIPOS_SELETOR_VALIDOS.indexOf(candidato.seletor_tipo) !== -1) {
      passo.seletor_tipo = candidato.seletor_tipo;
      passo.seletor = candidato.seletor;
      if (!passo.titulo || !passo.titulo.trim()) passo.titulo = recorderGerarTitulo(el);
      // Mesma regra do título — só sugere quando ainda está vazio, nunca
      // sobrescreve o que o admin já escreveu (ver recorderSugerirDescricao).
      if (!passo.descricao || !passo.descricao.trim()) {
        passo.descricao = recorderSugerirDescricao(el, candidato.categoria);
      }
      recorderPersistir();
    }
    recorderFinalizarTrocaElemento();
  }

  var RECORDER_COPIAR_FEEDBACK_MS = 1600;

  // Único lugar que renderiza o painel final "Tour gravado — N passo(s)"
  // (chamado só por recorderGerarJsonFinal). Se um dia for necessário um
  // segundo caminho de finalização, reaproveite esta função em vez de
  // duplicar o footer — um footer divergente sem Copiar/Baixar já causou
  // confusão no ambiente de testes (só "Fechar" aparecendo).
  // Função pura (sem DOM, sem recorderState) — separada de
  // recorderRenderPainelFinal só pra poder testar "contexto muda os textos
  // certos" direto, sem precisar montar um DOM completo. paraTourExistente
  // vem de recorderState.contexto === 'editar_tour_existente' (ver
  // iniciarGravadorSeNecessario); totalPassos vem de recorderMontarJson().
  function recorderTextosPainelFinal(paraTourExistente, totalPassos) {
    return {
      titulo: paraTourExistente
        ? 'Passos prontos para atualizar o Tour — ' + totalPassos + ' passo(s)'
        : 'Tour gravado — ' + totalPassos + ' passo(s)',
      subtitulo: paraTourExistente
        ? 'Este JSON serve para ATUALIZAR o Tour existente no UserPulse — ele não cria um Tour novo.'
        : 'Revise os passos, copie ou baixe o JSON e importe pela tela de Tours Guiados (Importar JSON).',
      instrucaoAtualizarHtml: paraTourExistente
        ? '<p class="up-rec-modal-sub">Depois de copiar, volte para a aba do UserPulse, cole em "Colar passos gravados" e clique em "Atualizar Tour existente".</p>'
        : '',
      textoBotaoCopiar: paraTourExistente ? 'Copiar JSON para atualizar Tour existente' : 'Copiar JSON',
      classeBotaoCopiar: paraTourExistente ? 'up-rec-btn up-rec-btn-primary' : 'up-rec-btn up-rec-btn-secondary',
      // "Copiar e abrir importação" leva pra tela que CRIA um Tour novo — não
      // faz sentido oferecer isso quando o objetivo é atualizar um já
      // existente, então some do painel nesse contexto (em vez de só mudar o
      // texto, pra não sugerir criar um Tour novo por engano).
      mostrarBotaoImportar: !paraTourExistente,
      classeBotaoFechar: paraTourExistente ? 'up-rec-btn up-rec-btn-secondary' : 'up-rec-btn up-rec-btn-primary',
    };
  }

  function recorderRenderPainelFinal() {
    var json = recorderMontarJson();
    var texto = JSON.stringify(json, null, 2);
    var copiarTimer = null;
    var importarTimer = null;

    // Aberto via "Editar fluxo no sistema" de um Tour existente
    // (recorderState.contexto, ver iniciarGravadorSeNecessario) — painel final
    // orientado a ATUALIZAR aquele Tour, não a criar um novo. Só muda texto/
    // CTA (recorderTextosPainelFinal); a lista de passos, o JSON gerado e o
    // restante do fluxo (Copiar JSON, Baixar JSON, Fechar) continuam
    // idênticos.
    var paraTourExistente = recorderState.contexto === 'editar_tour_existente';
    var textos = recorderTextosPainelFinal(paraTourExistente, json.tour.passos.length);
    var textoBotaoCopiar = textos.textoBotaoCopiar;
    var botaoImportarHtml = textos.mostrarBotaoImportar
      ? '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-up-rec-importar>Copiar e abrir importação</button>'
      : '';

    var avisoNavegacao = recorderState.navegacoes.length > 0
      ? '<p class="up-rec-modal-sub">' + recorderState.navegacoes.length + ' navegação(ões) de URL detectada(s) durante a gravação — não viraram passo (sem elemento associado); o tour usa a URL onde a gravação começou.</p>'
      : '';

    var root = document.createElement('div');
    root.id = RECORDER_PAINEL_ID;
    root.className = 'up-rec-overlay';
    root.innerHTML = [
      '<div class="up-rec-modal">',
      '<h3 class="up-rec-modal-title">' + textos.titulo + '</h3>',
      '<p class="up-rec-modal-sub">' + textos.subtitulo + '</p>',
      textos.instrucaoAtualizarHtml,
      avisoNavegacao,
      '<textarea class="up-rec-textarea" readonly data-up-rec-json>' + escapeHtml(texto) + '</textarea>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="' + textos.classeBotaoCopiar + '" data-up-rec-copiar>' + textoBotaoCopiar + '</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-secondary" data-up-rec-baixar>Baixar JSON</button>',
      botaoImportarHtml,
      '<button type="button" class="' + textos.classeBotaoFechar + '" data-up-rec-fechar>Fechar</button>',
      '</div>',
      '</div>',
    ].join('');
    document.body.appendChild(root);

    root.addEventListener('click', function (event) {
      var alvo = event.target;
      if (!(alvo instanceof Element)) return;

      var botaoCopiar = alvo.closest('[data-up-rec-copiar]');
      if (botaoCopiar) {
        // Feedback só aparece se a cópia de fato aconteceu: espera a Promise
        // do clipboard.writeText resolver, ou confere o retorno de
        // execCommand no fallback — nunca mostra "Copiado!" otimisticamente.
        var mostrarFeedback = function () {
          if (copiarTimer) window.clearTimeout(copiarTimer);
          botaoCopiar.textContent = 'Copiado!';
          copiarTimer = window.setTimeout(function () {
            copiarTimer = null;
            botaoCopiar.textContent = textoBotaoCopiar;
          }, RECORDER_COPIAR_FEEDBACK_MS);
        };
        try {
          var textarea = root.querySelector('[data-up-rec-json]');
          if (textarea && textarea.select) textarea.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(mostrarFeedback).catch(function () {});
          } else if (document.execCommand('copy')) {
            mostrarFeedback();
          }
        } catch (_e) {}
        return;
      }

      if (alvo.closest('[data-up-rec-baixar]')) {
        try {
          var blob = new Blob([texto], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'tour-gravado.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (_e) {}
        return;
      }

      // "Copiar e abrir importação": nunca chama o endpoint de importação
      // direto nem manda token nenhum — só copia o JSON (mesmo mecanismo do
      // botão Copiar) e abre /tours?importarJson=1 do admin (mesma origem que
      // serve este widget.js, via scriptOrigin) numa aba nova. O parâmetro
      // importarJson=1 só é um sinal pra tela abrir o modal "Importar JSON"
      // sozinha — o JSON em si NUNCA viaja pela URL, o usuário ainda cola o
      // conteúdo (já copiado) manualmente no campo de texto do modal.
      // Ver análise completa no resumo entregue — postMessage/endpoint direto
      // foram avaliados e descartados por exigirem confiar em mensagens
      // cross-origin vindas do site do cliente ou expor a importação sem
      // autenticação.
      var botaoImportar = alvo.closest('[data-up-rec-importar]');
      if (botaoImportar) {
        var mostrarFeedbackImportar = function () {
          if (importarTimer) window.clearTimeout(importarTimer);
          botaoImportar.textContent = 'Copiado! Abrindo…';
          importarTimer = window.setTimeout(function () {
            importarTimer = null;
            botaoImportar.textContent = 'Copiar e abrir importação';
          }, RECORDER_COPIAR_FEEDBACK_MS);
        };
        try {
          var textareaImp = root.querySelector('[data-up-rec-json]');
          if (textareaImp && textareaImp.select) textareaImp.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(mostrarFeedbackImportar).catch(function () {});
          } else if (document.execCommand('copy')) {
            mostrarFeedbackImportar();
          }
        } catch (_e) {}
        try { window.open(scriptOrigin + '/tours?importarJson=1', '_blank', 'noopener'); } catch (_e) {}
        return;
      }

      if (alvo.closest('[data-up-rec-fechar]')) {
        root.remove();
        return;
      }
    });
  }

  function recorderRenderBarra() {
    if (document.getElementById(RECORDER_BAR_ID)) return;

    var bar = document.createElement('div');
    bar.id = RECORDER_BAR_ID;
    // up-rec-bar-principal só afeta esta barra — troca/localizar continuam
    // com o .up-rec-bar de sempre, sem mudança visual nenhuma nelas.
    bar.className = 'up-rec-bar up-rec-bar-principal';
    bar.innerHTML = [
      // Linha 1 — status. Rótulo e bolinha mudam de cor/texto quando pausado
      // (ver recorderAtualizarBarra) — estado pausado precisa ficar óbvio de
      // relance, não só pelo texto do botão Continuar.
      '<div class="up-rec-bar-linha up-rec-bar-linha-status">',
      '<span class="up-rec-dot"></span>',
      '<span class="up-rec-label" data-up-rec-status-label>Gravando Tour</span>',
      '<span class="up-rec-contador" data-up-rec-contador>0 passos</span>',
      '<span class="up-rec-ultimo" data-up-rec-ultimo></span>',
      '</div>',
      // Linha 2 — ações. Pausar/Desfazer/Cancelar viram ícones compactos
      // (o texto completo fica no title); Continuar (quando pausado) e
      // Finalizar continuam com texto — são as duas ações "de destaque".
      '<div class="up-rec-bar-linha up-rec-bar-linha-acoes">',
      '<button type="button" class="up-rec-btn-bar" data-up-rec-pause>' + icon('pause') + '<span>Pausar</span></button>',
      '<button type="button" class="up-rec-btn-bar" data-up-rec-undo disabled>' + icon('undo') + '<span>Desfazer</span></button>',
      '<button type="button" class="up-rec-btn-bar up-rec-btn-bar-danger" data-up-rec-cancel>' + icon('close') + '<span>Cancelar</span></button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary up-rec-bar-finalizar" data-up-rec-finish>' + icon('check') + '<span>Finalizar</span></button>',
      '</div>',
      // Linha 3 — opção de revisão em tempo real (única opção de revisão
      // durante a captura; a antiga "revisar cada passo após o clique" foi
      // removida da interface por duplicar esse mesmo propósito).
      '<div class="up-rec-bar-linha up-rec-bar-linha-opcao">',
      '<label class="up-rec-toggle">',
      '<input type="checkbox" data-up-rec-revisar-tempo-real' + (recorderState.revisarTempoReal ? ' checked' : '') + '>',
      'Revisar passos em tempo real',
      '</label>',
      '<span class="up-rec-toggle-hint">Ao ativar, os passos capturados aparecerão em um painel lateral para você preencher título e descrição durante a gravação.</span>',
      '</div>',
      '<span class="up-rec-aviso" data-up-rec-aviso></span>',
    ].join('');
    document.body.appendChild(bar);

    var toggleTempoReal = bar.querySelector('[data-up-rec-revisar-tempo-real]');
    if (toggleTempoReal) {
      toggleTempoReal.addEventListener('change', function () {
        recorderState.revisarTempoReal = toggleTempoReal.checked;
        recorderPersistir();
        if (recorderState.revisarTempoReal) {
          if (recorderState.painelLateralIndiceSelecionado == null && recorderState.passos.length) {
            recorderState.painelLateralIndiceSelecionado = recorderState.passos.length - 1;
          }
          recorderRenderPainelLateral();
        } else {
          recorderFecharPainelLateral();
        }
      });
    }

    bar.addEventListener('click', function (event) {
      var alvo = event.target;
      if (!(alvo instanceof Element)) return;
      if (alvo.closest('[data-up-rec-pause]')) { recorderPausarOuContinuar(); return; }
      if (alvo.closest('[data-up-rec-undo]')) { recorderDesfazerUltimo(); return; }
      if (alvo.closest('[data-up-rec-cancel]')) { recorderCancelar(); return; }
      if (alvo.closest('[data-up-rec-finish]')) { recorderFinalizar(); return; }
    });

    recorderAtualizarBarra();
  }

  // Liga os listeners de captura + poll de URL — compartilhado entre iniciar
  // do zero (query param) e retomar de uma sessão persistida (reload).
  function recorderIniciarCaptura() {
    document.addEventListener('click', recorderCapturarClique, true);
    document.addEventListener('input', recorderCapturarValor, true);
    document.addEventListener('change', recorderCapturarValor, true);
    recorderIniciarPollUrl();
  }

  // Retoma uma gravação após reload/navegação de página inteira: os passos e
  // metadados já capturados vieram do sessionStorage (recorderPersistir), só
  // o que é necessariamente por-elemento (inputTimers/elParaIndice/ultimoEl)
  // reinicia zerado — os elementos da página anterior não existem mais.
  function recorderRetomarDeSessao(dados) {
    ensureStyles();
    recorderState.ativo = true;
    recorderState.pausado = Boolean(dados.pausado);
    recorderState.passos = Array.isArray(dados.passos) ? dados.passos : [];
    recorderState.navegacoes = Array.isArray(dados.navegacoes) ? dados.navegacoes : [];
    recorderState.meta = dados.meta || { titulo: '', descricao: '', sistema: '', prioridade: 0, url_contem: window.location.pathname };
    recorderState.contexto = dados.contexto || null;
    recorderState.revisarCadaPasso = Boolean(dados.revisarCadaPasso);
    recorderState.revisarTempoReal = Boolean(dados.revisarTempoReal);
    recorderState.ultimoEl = null;
    recorderState.ultimoElTimestamp = 0;
    recorderState.inputTimers = new WeakMap();
    recorderState.elParaIndice = new WeakMap();

    // Página nova desde a última gravação — registra como navegação, se ainda
    // não for a última conhecida (evita duplicar se retomar mais de uma vez
    // sem sair da mesma página, ex.: init() chamado de novo pelo host).
    var pathAtual = window.location.pathname;
    if (recorderState.navegacoes[recorderState.navegacoes.length - 1] !== pathAtual) {
      recorderState.navegacoes.push(pathAtual);
    }

    recorderIniciarCaptura();
    recorderPersistir();
    recorderRenderBarra();
    if (recorderState.revisarTempoReal) {
      recorderState.painelLateralIndiceSelecionado = recorderState.passos.length ? recorderState.passos.length - 1 : null;
      recorderRenderPainelLateral();
    }
  }

  // Decodifica o parâmetro up_rec_passos (base64url de um JSON.stringify de
  // array de passos — ver encodePassosBase64Url em web/src/utils/tour.ts,
  // gerado a partir de "Editar fluxo no sistema" em Form.tsx, modo edição).
  // Base64 padrão (com +/=) quebraria dentro de uma query string sem
  // encodeURIComponent extra; base64url evita isso.
  function recorderDecodificarBase64Url(valor) {
    var base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
    var resto = base64.length % 4;
    if (resto) base64 += new Array(5 - resto).join('=');
    var binario = window.atob(base64);
    var bytes = new Uint8Array(binario.length);
    for (var i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Sanitiza cada item antes de aceitar no gravador — nunca confia direto no
  // que veio da URL. Item sem título é descartado individualmente (em vez de
  // invalidar o lote inteiro); demais campos caem pro mesmo default usado por
  // recorderRegistrarPasso quando ausentes/tipo errado.
  function recorderSanitizarPassoInicial(p) {
    if (!p || typeof p !== 'object') return null;
    var titulo = typeof p.titulo === 'string' ? p.titulo.trim() : '';
    if (!titulo) return null;
    return {
      titulo: titulo,
      descricao: typeof p.descricao === 'string' ? p.descricao : '',
      // 'area' precisa ser aceito aqui igual a 'css'/'id' — é um tipo válido
      // de passo (destaca um grupo/container, ver selecionarElementoPasso),
      // não só um rótulo de UI do admin. Sem isso, um passo tipo Área perdia
      // o tipo (virava data_cy) ao ser carregado no gravador via "Editar
      // fluxo no sistema" (up_rec_passos), mesmo sem o usuário mexer em nada.
      seletor_tipo: (p.seletor_tipo === 'css' || p.seletor_tipo === 'id' || p.seletor_tipo === 'area') ? p.seletor_tipo : 'data_cy',
      seletor: typeof p.seletor === 'string' ? p.seletor : '',
      tooltip_posicao: typeof p.tooltip_posicao === 'string' ? p.tooltip_posicao : 'auto',
      acao_ao_avancar: typeof p.acao_ao_avancar === 'string' ? p.acao_ao_avancar : 'apenas_avancar',
      modo_avanco_interacao: typeof p.modo_avanco_interacao === 'string' ? p.modo_avanco_interacao : 'manual',
      seletor_confirmacao: typeof p.seletor_confirmacao === 'string' ? p.seletor_confirmacao : null,
      secao: typeof p.secao === 'string' ? p.secao : '',
    };
  }

  // Lê up_rec_passos (ou, via nomeParam, um parâmetro equivalente — ver
  // up_preview_passos em iniciarPreviewSeNecessario) pra decodificar uma
  // lista de passos vinda da URL, já sanitizados um a um. Usada tanto pra
  // pré-carregar o gravador com os passos já cadastrados do tour (modo
  // edição — ver "Editar fluxo no sistema" em Form.tsx) quanto pelo preview
  // de passos colados (sem gravador nenhum envolvido). Qualquer falha
  // (parâmetro ausente, base64/JSON inválido, formato inesperado) retorna []
  // em silêncio: quem chama decide o que fazer com uma lista vazia.
  function recorderLerPassosIniciais(params, nomeParam) {
    var bruto = params.get(nomeParam || 'up_rec_passos');
    if (!bruto) return [];
    try {
      var texto = recorderDecodificarBase64Url(bruto);
      var lista = JSON.parse(texto);
      if (!Array.isArray(lista)) return [];
      var passos = [];
      for (var i = 0; i < lista.length; i++) {
        var sanitizado = recorderSanitizarPassoInicial(lista[i]);
        if (sanitizado) passos.push(sanitizado);
      }
      return passos;
    } catch (_e) {
      return [];
    }
  }

  // Chamado no início de init(). Prioridade: retoma uma gravação já em
  // andamento (sessionStorage) mesmo sem ?userpulse_recorder=1 na URL — é
  // exatamente isso que permite sobreviver a um reload de página inteira.
  // Sem sessão persistida, só ativa do zero se o parâmetro estiver presente.
  // Guardado por recorderState.ativo pra não reiniciar (perdendo os passos já
  // capturados) se o host chamar init() de novo na mesma página.
  function iniciarGravadorSeNecessario() {
    if (recorderState.ativo) return;

    var persistido = recorderCarregarPersistido();
    if (persistido) {
      recorderRetomarDeSessao(persistido);
      return;
    }

    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_e) { return; }
    if (params.get('userpulse_recorder') !== '1') return;

    ensureStyles();
    recorderState.ativo = true;
    recorderState.pausado = false;
    // up_rec_passos é opcional (só presente quando "Editar fluxo no sistema"
    // é aberto em modo edição, com passos já cadastrados) — na criação
    // (Gravador de Fluxo / TourGravador.tsx) o parâmetro não é enviado e
    // recorderLerPassosIniciais retorna [], preservando o início vazio de
    // sempre.
    recorderState.passos = recorderLerPassosIniciais(params);
    recorderState.navegacoes = [];
    recorderState.ultimoEl = null;
    recorderState.ultimoElTimestamp = 0;
    recorderState.inputTimers = new WeakMap();
    recorderState.elParaIndice = new WeakMap();
    recorderState.meta = {
      titulo: params.get('up_rec_titulo') || '',
      descricao: params.get('up_rec_descricao') || '',
      sistema: params.get('up_rec_sistema') || (state.config && state.config.sistema) || '',
      prioridade: Number(params.get('up_rec_prioridade') || 0),
      url_contem: window.location.pathname,
    };
    // up_rec_context é opcional, mesmo padrão de up_rec_passos acima — só
    // presente quando "Editar fluxo no sistema" é aberto a partir de um Tour
    // já existente (Form.tsx). Nunca contém id/token/dado sensível, só ajusta
    // texto do painel final (ver recorderRenderPainelFinal) — nunca decide
    // nada de captura ou persistência.
    recorderState.contexto = params.get('up_rec_context') || null;

    recorderIniciarCaptura();
    recorderPersistir();
    recorderRenderBarra();
    // Passos pré-carregados devem aparecer de cara na revisão/lista lateral
    // (ligar revisarTempoReal só quando há algo pra mostrar — comportamento
    // padrão de gravação do zero continua igual, painel desligado até o
    // usuário optar).
    if (recorderState.passos.length > 0) {
      recorderState.revisarTempoReal = true;
      recorderState.painelLateralIndiceSelecionado = recorderState.passos.length - 1;
      recorderPersistir();
      recorderRenderPainelLateral();
    }
  }

  // Ativado quando a URL tem ?userpulse_preview=1 (aberta pelo admin em
  // "Colar passos gravados" → "Testar estes passos", ver buildPreviewUrl em
  // web/src/utils/tour.ts) — roda os passos colados como um Tour temporário,
  // só em memória, sem nenhuma escrita no banco: iniciarTour() aqui recebe um
  // objeto solto (id: null), nunca um tour buscado por slug/id via API.
  //
  // Deliberadamente PARALELO ao gravador, não uma variação dele: não ativa
  // recorderState (sem captura, sem barra, sem pausa, sem persistência em
  // sessionStorage), e preview=true em iniciarTour já suprime
  // registrarEventoTour/tourMarkShown sozinho (ver definições) — sem
  // precisar de nenhuma checagem extra aqui pra "não trackear".
  //
  // Precedência: o gravador sempre vence se os dois parâmetros aparecerem
  // juntos por engano. iniciarGravadorSeNecessario() já rodou antes desta
  // função (chamada logo em seguida, em init()) — se ele ativou
  // recorderState (novo ou retomado de uma sessão persistida), a checagem
  // abaixo já é suficiente pra nunca iniciar um preview por cima. A checagem
  // explícita de userpulse_recorder=1 é redundante com a de
  // recorderState.ativo na maioria dos casos, mas cobre o cenário em que os
  // dois parâmetros vêm juntos numa URL nova (sem sessão persistida) —
  // preferimos nunca iniciar preview nesse caso, mesmo que por algum motivo
  // futuro o gravador viesse a não ativar de fato.
  function iniciarPreviewSeNecessario() {
    if (recorderState.ativo || tourState.ativo) return;
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_e) { return; }
    if (params.get('userpulse_recorder') === '1') return;
    if (params.get('userpulse_preview') !== '1') return;

    var passos = recorderLerPassosIniciais(params, 'up_preview_passos');
    if (passos.length === 0) return;

    var tourPreview = {
      id: null,
      titulo: params.get('up_preview_titulo') || 'Pré-visualização',
      descricao: '',
      passos: passos,
    };
    iniciarTour(tourPreview, false, true);
  }

  // API pública para disparar um tour manualmente (ex.: botão "Ver tour" no host):
  //   window.UserPulse.iniciarTour('slug-do-tour')
  // jornadaContexto (opcional, uso interno) — ver jornadaEtapaClicar/tourConcluir.
  function iniciarTourPublico(slug, jornadaContexto) {
    if (!slug) return;
    fetchTour(slug).then(function (tour) {
      if (tour) iniciarTour(tour, false, false, false, jornadaContexto);
    }).catch(function () { /* fail silently */ });
  }

  // ─── Onboarding Guiado (Jornadas) — MVP ────────────────────────────────────
  // Central/checklist que o usuário abre manualmente — via
  // window.UserPulse.abrirJornadas() ou pelo botão flutuante "Ajuda" (Parte 3),
  // que só aparece quando há jornada elegível. Nunca dispara sozinha, ao
  // contrário de campanhas/tours automáticos (avaliarTourAutomatico/checkMode).
  //
  // Estrutura: Jornada -> BlocoJornada ("Pacote" na UI/widget) -> EtapaJornada.
  // Navegação em 2 níveis: painel inicial lista os Pacotes de cada jornada
  // elegível; clicar em "Iniciar"/"Continuar" abre as etapas daquele pacote;
  // "Voltar para pacotes" retorna à lista. permitir_refazer continua sendo
  // uma configuração da Jornada (não do pacote/etapa).
  //
  // Limitação conhecida (MVP): etapas do tipo "campanha" ficam desabilitadas no
  // painel, com a mensagem "Campanha será suportada em breve". Disparar uma
  // campanha manualmente reaproveitando fetchCampaign/render exigiria dividir
  // o slot único state.campanha (hoje usado só pela avaliação automática por
  // sistema/tela) sem quebrar o fluxo existente — fica para uma fase seguinte,
  // conforme combinado.

  var JORNADA_PAINEL_ID = 'userpulse-jornada-painel';
  var JORNADA_FAB_ID = 'userpulse-jornada-fab';
  var JORNADA_AVISO_ID = 'userpulse-jornada-aviso';

  // Incrementado a cada nova busca de elegibilidade (avaliarJornadasParaBotao
  // ou abrirJornadasPublico) — evita que uma resposta desatualizada (de uma
  // busca mais antiga que demorou mais pra voltar) sobrescreva
  // jornadaState.fabDisponivel depois de uma busca mais recente já ter
  // resolvido. Sem isso, navegações rápidas em sequência podiam deixar o FAB
  // "Ajuda" escondido pra sempre mesmo com jornada elegível de verdade.
  var jornadaElegibilidadeToken = 0;

  var jornadaState = {
    jornadas: [],
    aberto: false,
    fabDisponivel: false,
    // null = mostrando a lista de pacotes; { jornadaId, blocoId } = dentro das
    // etapas de um pacote específico.
    blocoAtivo: null,
    // Texto da busca da Central de ajuda — só se aplica na lista de pacotes
    // (some da tela quando dentro de um pacote específico).
    busca: '',
  };

  function fetchJornadas(sistema, tela, usuario_id, contexto) {
    var params = new URLSearchParams();
    if (sistema) params.set('sistema', sistema);
    if (tela) params.set('tela', tela);
    if (usuario_id) params.set('usuario_id', usuario_id);
    appendContexto(params, contexto);
    appendPublicKey(params);
    return fetch(apiUrl('/api/widget/jornadas?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return [];
      return response.json();
    });
  }

  function jornadaEncontrar(jornadaId) {
    for (var i = 0; i < jornadaState.jornadas.length; i++) {
      if (jornadaState.jornadas[i].id === jornadaId) return jornadaState.jornadas[i];
    }
    return null;
  }

  function jornadaEncontrarBloco(jornada, blocoId) {
    if (!jornada || !jornada.blocos) return null;
    for (var i = 0; i < jornada.blocos.length; i++) {
      if (jornada.blocos[i].id === blocoId) return jornada.blocos[i];
    }
    return null;
  }

  function jornadaEncontrarEtapa(bloco, etapaId) {
    if (!bloco || !bloco.etapas) return null;
    for (var i = 0; i < bloco.etapas.length; i++) {
      if (bloco.etapas[i].id === etapaId) return bloco.etapas[i];
    }
    return null;
  }

  // contextoExtra (opcional) é mesclado por cima do contexto padrão do widget
  // — usado hoje só para marcar { refazer: true } quando jornada.permitir_refazer
  // libera reexecutar uma etapa já concluída. bloco_id é opcional (null nos
  // eventos de nível jornada, preenchido nos de nível pacote/etapa).
  function registrarEventoJornada(jornadaId, blocoId, etapaId, tipoEvento, contextoExtra) {
    var config = state.config;
    if (!config || !jornadaId) return;
    var contexto = contextoExtra
      ? Object.assign({}, config.contexto || {}, contextoExtra)
      : (config.contexto || undefined);
    fetch(apiUrl('/api/widget/jornada/evento'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        public_key: config.public_key || undefined,
        jornada_id: jornadaId,
        bloco_id: blocoId != null ? blocoId : undefined,
        etapa_id: etapaId != null ? etapaId : undefined,
        tipo_evento: tipoEvento,
        usuario_id: config.usuario_id || undefined,
        sistema: config.sistema || undefined,
        tela: config.tela || undefined,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
        contexto: contexto,
      }),
    }).catch(function () { /* fail silently */ });
  }

  function jornadaTipoLabel(etapa) {
    if (etapa.tipo === 'tour') return 'Tour guiado';
    if (etapa.tipo === 'campanha') return 'Campanha · em breve';
    return 'Link';
  }

  function renderJornadaEtapaHtml(jornada, bloco, etapa, index) {
    var status = etapa.status || 'pendente';
    var concluida = status === 'concluida';
    // Tour apontado pela etapa foi inativado depois de criada a jornada — não
    // dá pra iniciar nem rever, então bloqueia independente de status/permitir_refazer.
    var tourInativo = etapa.tipo === 'tour' && Boolean(etapa.tour) && etapa.tour.ativo === false;
    // permitir_refazer é configurado na Jornada (não no pacote/etapa) — só
    // libera reexecutar uma etapa já concluída quando true; por padrão (false)
    // fica bloqueada. Exceção: etapa tipo tour concluída sempre pode ser
    // revista (reabre o tour de novo, sem contar como nova conclusão) mesmo
    // com permitir_refazer=false — etapas tipo link continuam bloqueadas
    // nesse caso.
    var podeRefazer = concluida && Boolean(jornada.permitir_refazer) && !tourInativo;
    var podeRever = concluida && !podeRefazer && etapa.tipo === 'tour' && !tourInativo;
    // disabled nativo bloqueia clique/reexecução no próprio DOM (o clique nem
    // chega ao listener delegado) — não depende só da checagem em
    // jornadaPainelClick, que fica como segunda camada de segurança.
    var desabilitada = (concluida && !podeRefazer && !podeRever) || etapa.tipo === 'campanha' || tourInativo;
    var classe = 'up-jorn-etapa' + (concluida ? ' up-jorn-etapa-concluida' : '');
    var marcador = concluida
      ? '<span class="up-jorn-etapa-check">' + icon('check') + '</span>'
      : '<span class="up-jorn-etapa-num">' + (index + 1) + '</span>';
    var tituloAttr = tourInativo
      ? ' title="Este tour está indisponível no momento."'
      : (concluida
        ? (podeRefazer ? ' title="Clique para refazer esta etapa."' : (podeRever ? ' title="Clique para rever o tour."' : ' title="Etapa já concluída."'))
        : (etapa.tipo === 'campanha' ? ' title="Campanha será suportada em breve."' : ''));
    var tipoTexto = tourInativo
      ? (concluida ? 'Concluída · Tour indisponível' : jornadaTipoLabel(etapa) + ' · indisponível')
      : (concluida
        ? (podeRefazer ? 'Concluída · Refazer' : (podeRever ? 'Concluída · Rever tour' : 'Concluída'))
        : jornadaTipoLabel(etapa) + (etapa.obrigatoria ? '' : ' · opcional'));
    return (
      '<button type="button" class="' + classe + '"' +
        ' data-up-jorn-jornada="' + escapeHtml(jornada.id) + '"' +
        ' data-up-jorn-bloco="' + escapeHtml(bloco.id) + '"' +
        ' data-up-jorn-etapa="' + index + '"' +
        (desabilitada ? ' disabled' : '') + tituloAttr +
      '>' +
        marcador +
        '<span class="up-jorn-etapa-corpo">' +
          '<span class="up-jorn-etapa-titulo">' + escapeHtml(etapa.titulo) + '</span>' +
          (etapa.descricao ? '<span class="up-jorn-etapa-desc">' + escapeHtml(etapa.descricao) + '</span>' : '') +
          '<span class="up-jorn-etapa-tipo">' + escapeHtml(tipoTexto) + '</span>' +
        '</span>' +
      '</button>'
    );
  }

  // Só se aplica quando jornada.permitir_pacotes_fora_ordem === false (default
  // é true — comportamento atual, sem nenhum bloqueio). Pacote obrigatório
  // fica bloqueado enquanto existir um pacote obrigatório ANTERIOR (por
  // ordem) ainda não concluído. Pacotes opcionais nunca bloqueiam nem são
  // bloqueados — a varredura por "anterior pendente" só considera obrigatórios.
  function jornadaPacoteBloqueado(jornada, bloco) {
    if (jornada.permitir_pacotes_fora_ordem !== false) return false;
    if (!bloco.obrigatorio) return false;
    var blocos = jornada.blocos || [];
    for (var i = 0; i < blocos.length; i++) {
      var anterior = blocos[i];
      if (anterior.id === bloco.id) break;
      if (anterior.obrigatorio && !(anterior.progresso && anterior.progresso.concluido)) {
        return true;
      }
    }
    return false;
  }

  function renderJornadaPacoteCardHtml(jornada, bloco) {
    var progresso = bloco.progresso || { concluido: false, etapas_concluidas: 0, etapas_total: (bloco.etapas || []).length };
    var pct = progresso.etapas_total > 0 ? Math.round((progresso.etapas_concluidas / progresso.etapas_total) * 100) : 0;
    var iniciado = progresso.etapas_concluidas > 0;
    var bloqueado = jornadaPacoteBloqueado(jornada, bloco);
    // CTA (ação do botão) e status (rótulo visual) são dois conceitos
    // separados: um pacote concluído ainda é clicável — abre pra revisão, ou
    // pra refazer se a jornada permitir — então o CTA usa "Rever" em vez de
    // travar como "Concluído" (esse texto agora só aparece no status).
    // Bloqueado por ordem tem prioridade sobre os demais estados: enquanto
    // travado, não importa se já teve progresso registrado antes (ex.: jornada
    // que só passou a exigir ordem depois de alguma etapa já concluída).
    var textoCta = bloqueado ? 'Bloqueado' : (progresso.concluido ? 'Rever' : (iniciado ? 'Continuar' : 'Iniciar'));
    var statusChave = bloqueado ? 'bloqueado' : (progresso.concluido ? 'concluido' : (iniciado ? 'andamento' : 'nao-iniciado'));
    var statusTexto = bloqueado ? 'Bloqueado' : (progresso.concluido ? 'Concluído' : (iniciado ? 'Em andamento' : 'Não iniciado'));
    var desabilitado = !bloco.ativo || bloqueado;
    var tituloAttr = !bloco.ativo
      ? ' title="Pacote indisponível no momento."'
      : (bloqueado ? ' title="Conclua o pacote anterior para desbloquear."' : '');
    return (
      '<button type="button" class="up-jorn-pacote' + (progresso.concluido ? ' up-jorn-pacote-concluido' : '') + '"' +
        ' data-up-jorn-jornada="' + escapeHtml(jornada.id) + '"' +
        ' data-up-jorn-abrir-bloco="' + escapeHtml(bloco.id) + '"' +
        (desabilitado ? ' disabled' : '') + tituloAttr +
      '>' +
        '<span class="up-jorn-pacote-corpo">' +
          '<span class="up-jorn-pacote-topo">' +
            '<span class="up-jorn-pacote-titulo">' + escapeHtml(bloco.titulo) + '</span>' +
            '<span class="up-jorn-pacote-status up-jorn-pacote-status-' + statusChave + '">' +
              '<span class="up-jorn-pacote-status-dot"></span>' + statusTexto +
            '</span>' +
          '</span>' +
          (bloco.descricao ? '<span class="up-jorn-pacote-desc">' + escapeHtml(bloco.descricao) + '</span>' : '') +
          '<span class="up-jorn-progresso">' +
            '<span class="up-jorn-progresso-barra"><span class="up-jorn-progresso-fill" style="width:' + pct + '%"></span></span>' +
            '<span class="up-jorn-progresso-texto">' + progresso.etapas_concluidas + ' de ' + progresso.etapas_total + ' etapas concluídas</span>' +
          '</span>' +
        '</span>' +
        '<span class="up-jorn-pacote-cta' + (bloqueado ? ' up-jorn-pacote-cta-bloqueado' : (progresso.concluido ? ' up-jorn-pacote-cta-concluido' : '')) + '">' +
          (progresso.concluido && !bloqueado ? icon('check') : '') + textoCta +
        '</span>' +
      '</button>'
    );
  }

  // "Continue de onde parou": primeiro pacote obrigatório (e disponível) ainda
  // não concluído e, dentro dele, a primeira etapa obrigatória pendente.
  // Pacotes/etapas opcionais nunca aparecem aqui — só o que efetivamente falta
  // pra concluir a jornada. Retorna null quando não há nada pendente (jornada
  // concluída ou só restam itens opcionais).
  function jornadaProximoPendente(jornada) {
    var blocos = jornada.blocos || [];
    for (var i = 0; i < blocos.length; i++) {
      var bloco = blocos[i];
      if (!bloco.obrigatorio || !bloco.ativo) continue;
      if (bloco.progresso && bloco.progresso.concluido) continue;
      var etapas = bloco.etapas || [];
      for (var j = 0; j < etapas.length; j++) {
        var etapa = etapas[j];
        if (etapa.obrigatoria && etapa.status !== 'concluida') {
          return { bloco: bloco, etapa: etapa };
        }
      }
    }
    return null;
  }

  // Botão reaproveita data-up-jorn-abrir-bloco (mesmo atributo dos cards de
  // pacote) — abre só o pacote, nunca a etapa/tour direto, então cai no mesmo
  // fluxo já tratado em jornadaPainelClick sem precisar de handler novo.
  function renderJornadaContinuarHtml(jornada, proximo) {
    return (
      '<div class="up-jorn-continuar">' +
        '<p class="up-jorn-continuar-titulo">' + icon('play') + ' Continue de onde parou</p>' +
        '<p class="up-jorn-continuar-linha"><strong>Pacote:</strong> ' + escapeHtml(proximo.bloco.titulo) + '</p>' +
        '<p class="up-jorn-continuar-linha"><strong>Próxima etapa:</strong> ' + escapeHtml(proximo.etapa.titulo) + '</p>' +
        '<button type="button" class="up-jorn-continuar-btn"' +
          ' data-up-jorn-jornada="' + escapeHtml(jornada.id) + '"' +
          ' data-up-jorn-abrir-bloco="' + escapeHtml(proximo.bloco.id) + '"' +
        '>Continuar</button>' +
      '</div>'
    );
  }

  function renderJornadaCardHtml(jornada) {
    var blocos = jornada.blocos || [];
    var progresso = jornada.progresso || { concluida: false, blocos_concluidos: 0, blocos_total: blocos.length };
    var pacotesHtml = blocos.map(function (b) { return renderJornadaPacoteCardHtml(jornada, b); }).join('');
    var proximo = progresso.concluida ? null : jornadaProximoPendente(jornada);
    return (
      '<div class="up-jorn-jornada">' +
        '<h4 class="up-jorn-card-titulo">' + escapeHtml(jornada.titulo) + '</h4>' +
        (jornada.descricao ? '<p class="up-jorn-card-desc">' + escapeHtml(jornada.descricao) + '</p>' : '') +
        (proximo ? renderJornadaContinuarHtml(jornada, proximo) : '') +
        (progresso.concluida
          ? '<p class="up-jorn-jornada-concluida">' + icon('check') + ' Jornada concluída</p>'
          : '<p class="up-jorn-progresso-texto" style="margin-bottom:8px">' + progresso.blocos_concluidos + ' de ' + progresso.blocos_total + ' pacotes concluídos</p>') +
        '<div class="up-jorn-pacotes">' + pacotesHtml + '</div>' +
      '</div>'
    );
  }

  function renderJornadaListaPacotesHtml() {
    if (jornadaState.jornadas.length === 0) {
      return '<div class="up-jorn-vazio"><p class="up-jorn-vazio-texto">Nenhuma jornada disponível no momento.</p></div>';
    }
    return jornadaState.jornadas.map(renderJornadaCardHtml).join('');
  }

  function renderJornadaEtapasDoBlocoHtml(jornada, bloco) {
    var etapas = bloco.etapas || [];
    var etapasHtml = etapas.map(function (e, i) { return renderJornadaEtapaHtml(jornada, bloco, e, i); }).join('');
    return (
      '<div class="up-jorn-etapas-header">' +
        '<button type="button" class="up-jorn-voltar" data-up-jorn-voltar-pacotes>' + icon('arrow_back') + ' Voltar para pacotes</button>' +
        '<h4 class="up-jorn-card-titulo">' + escapeHtml(bloco.titulo) + '</h4>' +
        (bloco.descricao ? '<p class="up-jorn-card-desc">' + escapeHtml(bloco.descricao) + '</p>' : '') +
      '</div>' +
      '<div class="up-jorn-etapas">' + etapasHtml + '</div>'
    );
  }

  function renderJornadaBuscaInputHtml() {
    var valor = jornadaState.busca || '';
    return (
      '<div class="up-jorn-busca">' +
        icon('search') +
        '<input type="text" class="up-jorn-busca-input" data-up-jorn-busca' +
          ' placeholder="Buscar etapas, pacotes ou jornadas" value="' + escapeHtml(valor) + '" />' +
      '</div>'
    );
  }

  function jornadaTextoContemBusca(texto, queryMinusculo) {
    return Boolean(texto) && texto.toLowerCase().indexOf(queryMinusculo) !== -1;
  }

  // Cada pacote que bate (por título/descrição da jornada, do próprio pacote,
  // ou de alguma etapa dentro dele) vira UM resultado, sem duplicar — clicar
  // nele abre o pacote correspondente (mesmo caminho de sempre).
  function jornadaBuscarResultados(query) {
    var queryMinusculo = query.toLowerCase();
    var resultados = [];
    (jornadaState.jornadas || []).forEach(function (jornada) {
      var jornadaBate = jornadaTextoContemBusca(jornada.titulo, queryMinusculo) || jornadaTextoContemBusca(jornada.descricao, queryMinusculo);
      (jornada.blocos || []).forEach(function (bloco) {
        var blocoBate = jornadaTextoContemBusca(bloco.titulo, queryMinusculo) || jornadaTextoContemBusca(bloco.descricao, queryMinusculo);
        var etapaQueBateu = null;
        (bloco.etapas || []).some(function (etapa) {
          if (jornadaTextoContemBusca(etapa.titulo, queryMinusculo) || jornadaTextoContemBusca(etapa.descricao, queryMinusculo)) {
            etapaQueBateu = etapa;
            return true;
          }
          return false;
        });
        if (jornadaBate || blocoBate || etapaQueBateu) {
          resultados.push({ jornada: jornada, bloco: bloco, etapa: etapaQueBateu });
        }
      });
    });
    return resultados;
  }

  function renderJornadaBuscaResultadoHtml(resultado) {
    var jornada = resultado.jornada, bloco = resultado.bloco, etapa = resultado.etapa;
    // Mesma checagem de bloqueio por ordem/disponibilidade dos cards normais
    // — um resultado de busca não pode abrir um pacote que hoje está travado.
    var bloqueado = jornadaPacoteBloqueado(jornada, bloco);
    var desabilitado = !bloco.ativo || bloqueado;
    var tituloAttr = !bloco.ativo
      ? ' title="Pacote indisponível no momento."'
      : (bloqueado ? ' title="Conclua o pacote anterior para desbloquear."' : '');
    return (
      '<button type="button" class="up-jorn-busca-resultado"' +
        ' data-up-jorn-jornada="' + escapeHtml(jornada.id) + '"' +
        ' data-up-jorn-abrir-bloco="' + escapeHtml(bloco.id) + '"' +
        (desabilitado ? ' disabled' : '') + tituloAttr +
      '>' +
        '<span class="up-jorn-busca-resultado-caminho">' + escapeHtml(jornada.titulo) + ' › ' + escapeHtml(bloco.titulo) + '</span>' +
        (etapa ? '<span class="up-jorn-busca-resultado-etapa">Etapa: ' + escapeHtml(etapa.titulo) + '</span>' : '') +
      '</button>'
    );
  }

  function renderJornadaBuscaResultadosHtml(query) {
    var resultados = jornadaBuscarResultados(query);
    if (resultados.length === 0) {
      return '<div class="up-jorn-vazio"><p class="up-jorn-vazio-texto">Nenhum resultado encontrado.</p></div>';
    }
    return '<div class="up-jorn-busca-resultados">' + resultados.map(renderJornadaBuscaResultadoHtml).join('') + '</div>';
  }

  function renderJornadaPainelHtml() {
    if (jornadaState.blocoAtivo) {
      var jornada = jornadaEncontrar(jornadaState.blocoAtivo.jornadaId);
      var bloco = jornadaEncontrarBloco(jornada, jornadaState.blocoAtivo.blocoId);
      if (jornada && bloco) return renderJornadaEtapasDoBlocoHtml(jornada, bloco);
      // Estado ficou inconsistente (ex.: dado recarregado) — volta pra lista.
      jornadaState.blocoAtivo = null;
    }
    var query = (jornadaState.busca || '').trim();
    if (query) return renderJornadaBuscaResultadosHtml(query);
    // MVP da Central de ajuda: só a seção "Jornadas" por enquanto (sem outras
    // seções) — o rótulo já deixa o painel pronto pra crescer depois sem
    // precisar mexer na estrutura de novo. Busca vazia mantém esse visual.
    return (
      '<div class="up-jorn-secao">' +
        '<h4 class="up-jorn-secao-titulo">Jornadas</h4>' +
        renderJornadaListaPacotesHtml() +
      '</div>'
    );
  }

  function renderJornadaPainel() {
    var existente = document.getElementById(JORNADA_PAINEL_ID);
    if (!jornadaState.aberto) {
      if (existente) existente.remove();
      return;
    }
    // O innerHTML inteiro é recriado a cada re-render (mesmo padrão do resto
    // do painel) — sem isso, o campo de busca perderia foco e posição do
    // cursor a cada tecla digitada.
    var buscaAntiga = existente ? existente.querySelector('[data-up-jorn-busca]') : null;
    var buscaTinhaFoco = Boolean(buscaAntiga) && document.activeElement === buscaAntiga;
    var buscaSelStart = buscaTinhaFoco ? buscaAntiga.selectionStart : null;
    var buscaSelEnd = buscaTinhaFoco ? buscaAntiga.selectionEnd : null;

    // Busca só aparece na lista de pacotes — dentro de um pacote específico
    // (blocoAtivo) some, igual à seção "Jornadas" e o "Continue de onde parou".
    var html =
      '<div class="up-jorn-painel">' +
        '<div class="up-jorn-header">' +
          '<h3 class="up-jorn-header-titulo">Central de ajuda</h3>' +
          '<button type="button" class="up-close" data-up-jorn-fechar aria-label="Fechar">' + icon('close') + '</button>' +
        '</div>' +
        '<div class="up-jorn-body">' +
          (jornadaState.blocoAtivo ? '' : renderJornadaBuscaInputHtml()) +
          renderJornadaPainelHtml() +
        '</div>' +
      '</div>';

    var root = existente;
    if (!root) {
      root = document.createElement('div');
      root.id = JORNADA_PAINEL_ID;
      root.className = 'up-widget-root';
      document.body.appendChild(root);
      root.addEventListener('click', jornadaPainelClick);
      root.addEventListener('input', jornadaPainelInput);
    }
    root.innerHTML = html;

    if (buscaTinhaFoco) {
      var buscaNova = root.querySelector('[data-up-jorn-busca]');
      if (buscaNova) {
        buscaNova.focus();
        try { buscaNova.setSelectionRange(buscaSelStart, buscaSelEnd); } catch (_e) { /* alguns navegadores não suportam em certos tipos de input */ }
      }
    }
  }

  function jornadaPainelInput(e) {
    var campo = e.target.closest('[data-up-jorn-busca]');
    if (!campo) return;
    jornadaState.busca = campo.value;
    renderJornadaPainel();
  }

  function fecharJornadaPainel() {
    if (!jornadaState.aberto) return;
    jornadaState.aberto = false;
    jornadaState.blocoAtivo = null;
    var existente = document.getElementById(JORNADA_PAINEL_ID);
    if (existente) existente.remove();
    renderJornadaFab(jornadaState.fabDisponivel);
    // Segunda checagem defensiva, um instante depois de fechar — mesma
    // lógica usada após o fetch de elegibilidade.
    window.setTimeout(jornadaGarantirFabNoDom, 400);
  }

  function jornadaAbrirBloco(jornada, bloco) {
    jornadaState.blocoAtivo = { jornadaId: jornada.id, blocoId: bloco.id };
    if (!bloco._abertoRegistrado) {
      bloco._abertoRegistrado = true;
      registrarEventoJornada(jornada.id, bloco.id, null, 'bloco_aberto');
    }
    renderJornadaPainel();
  }

  function jornadaMarcarConcluida(jornada, bloco, etapa, contextoExtra) {
    // Só conta pra progresso na primeira conclusão — refazer uma etapa já
    // concluída (permitir_refazer=true) não pode incrementar de novo, senão
    // etapas_concluidas passaria de etapas_total.
    var primeiraConclusao = etapa.status !== 'concluida';
    etapa.status = 'concluida';
    if (primeiraConclusao && bloco.progresso) {
      bloco.progresso.etapas_concluidas = Math.min(bloco.progresso.etapas_concluidas + 1, bloco.progresso.etapas_total);
    }
    registrarEventoJornada(jornada.id, bloco.id, etapa.id, 'etapa_concluida', contextoExtra);
    renderJornadaPainel();
    jornadaChecarConclusaoBloco(jornada, bloco);
  }

  // Bloco (Pacote) concluído: todas as suas etapas obrigatórias concluídas.
  function jornadaChecarConclusaoBloco(jornada, bloco) {
    if (bloco.progresso && bloco.progresso.concluido) return
    var pendentesObrigatorias = (bloco.etapas || []).filter(function (e) {
      return e.obrigatoria && e.status !== 'concluida';
    });
    if (pendentesObrigatorias.length === 0) {
      if (bloco.progresso) bloco.progresso.concluido = true;
      if (jornada.progresso) {
        jornada.progresso.blocos_concluidos = Math.min(jornada.progresso.blocos_concluidos + 1, jornada.progresso.blocos_total);
      }
      registrarEventoJornada(jornada.id, bloco.id, null, 'bloco_concluido');
      jornadaChecarConclusaoGeral(jornada);
    }
  }

  // Jornada concluída: todos os pacotes obrigatórios concluídos.
  function jornadaChecarConclusaoGeral(jornada) {
    if (jornada._concluidaRegistrada) return;
    var pendentesObrigatorios = (jornada.blocos || []).filter(function (b) {
      return b.obrigatorio && !(b.progresso && b.progresso.concluido);
    });
    if (pendentesObrigatorios.length === 0) {
      jornada._concluidaRegistrada = true;
      if (jornada.progresso) jornada.progresso.concluida = true;
      registrarEventoJornada(jornada.id, null, null, 'jornada_concluida');
    }
  }

  function jornadaPainelClick(e) {
    var fechar = e.target.closest('[data-up-jorn-fechar]');
    if (fechar) { fecharJornadaPainel(); return; }

    var voltar = e.target.closest('[data-up-jorn-voltar-pacotes]');
    if (voltar) { jornadaState.blocoAtivo = null; renderJornadaPainel(); return; }

    var abrirBloco = e.target.closest('[data-up-jorn-abrir-bloco]');
    if (abrirBloco) {
      if (abrirBloco.disabled) return;
      var jIdBloco = abrirBloco.getAttribute('data-up-jorn-jornada');
      var bId = abrirBloco.getAttribute('data-up-jorn-abrir-bloco');
      var jornadaDoBloco = jornadaEncontrar(jIdBloco);
      var blocoAlvo = jornadaEncontrarBloco(jornadaDoBloco, bId);
      if (!jornadaDoBloco || !blocoAlvo) return;
      // disabled nativo já impede isso na maioria dos casos — segunda camada
      // de segurança, mesmo padrão usado pra permitir_refazer.
      if (jornadaPacoteBloqueado(jornadaDoBloco, blocoAlvo)) return;
      jornadaAbrirBloco(jornadaDoBloco, blocoAlvo);
      return;
    }

    var btn = e.target.closest('[data-up-jorn-etapa]');
    if (!btn || btn.disabled) return;
    var jornadaId = btn.getAttribute('data-up-jorn-jornada');
    var blocoId = btn.getAttribute('data-up-jorn-bloco');
    var idx = Number(btn.getAttribute('data-up-jorn-etapa'));
    var jornada = jornadaEncontrar(jornadaId);
    var bloco = jornadaEncontrarBloco(jornada, blocoId);
    if (!jornada || !bloco || !bloco.etapas) return;
    var etapa = bloco.etapas[idx];
    if (!etapa) return;

    // Etapa já concluída só é reexecutável quando a jornada tem
    // permitir_refazer=true (configurado no admin) — senão, mesmo bloqueio de
    // sempre, EXCETO etapa tipo tour, que sempre pode ser revista (reabre o
    // tour sem contar como nova conclusão). O botão nativo disabled já impede
    // isso na maioria dos casos; esta checagem é a segunda camada de segurança.
    var concluida = etapa.status === 'concluida';
    var refazendo = concluida && Boolean(jornada.permitir_refazer);
    var revendoTour = concluida && !refazendo && etapa.tipo === 'tour';
    if (concluida && !refazendo && !revendoTour) return;
    var contextoExtra = refazendo ? { refazer: true } : (revendoTour ? { rever: true } : undefined);

    if (!jornada._iniciadaRegistrada) {
      jornada._iniciadaRegistrada = true;
      registrarEventoJornada(jornada.id, null, null, 'jornada_iniciada');
    }
    if (!bloco._iniciadoRegistrado) {
      bloco._iniciadoRegistrado = true;
      registrarEventoJornada(jornada.id, bloco.id, null, 'bloco_iniciado');
    }
    registrarEventoJornada(jornada.id, bloco.id, etapa.id, 'etapa_aberta', contextoExtra);

    if (etapa.tipo === 'link' && etapa.url) {
      window.open(etapa.url, etapa.abrir_nova_aba ? '_blank' : '_self', 'noopener,noreferrer');
      jornadaMarcarConcluida(jornada, bloco, etapa, contextoExtra);
    } else if (etapa.tipo === 'tour' && etapa.tour && etapa.tour.slug) {
      // disabled nativo já impede isso (ver renderJornadaEtapaHtml) — segunda
      // camada de segurança, mesmo padrão de sempre.
      if (etapa.tour.ativo === false) return;
      if (revendoTour) {
        // Já concluída — só reabre o tour pra revisão, sem re-registrar
        // etapa_concluida nem mexer no progresso da jornada.
        fecharJornadaPainel();
        iniciarTourPublico(etapa.tour.slug);
      } else {
        // A etapa só é marcada concluída quando o tour é de fato concluído
        // (tourConcluir(), via tourState.jornadaContexto) — nunca já ao
        // iniciar. Encerrar/pular/abandonar o tour no meio não conta como
        // conclusão da etapa.
        fecharJornadaPainel();
        iniciarTourPublico(etapa.tour.slug, {
          jornadaId: jornada.id, blocoId: bloco.id, etapaId: etapa.id, contextoExtra: contextoExtra,
        });
      }
    }
    // tipo === 'campanha': sem ação — botão fica desabilitado (ver renderJornadaEtapaHtml).
  }

  // Sem usuario_id, ou em telas de pré-login/pré-contexto, a Central de ajuda
  // não deve aparecer — o widget é embarcado em sistemas diferentes e não
  // conhece as rotas exatas de cada host, então usa uma heurística por path
  // (padrões comuns de tela de autenticação) como segundo sinal, além do
  // usuario_id de verdade.
  function jornadaContextoValido() {
    var config = state.config;
    if (!config || !config.usuario_id) return false;
    var path = '';
    try { path = window.location.pathname.toLowerCase(); } catch (_e) { return true; }
    var PADROES_SEM_CONTEXTO = ['/auth/', '/login', '/signin', '/sign-in'];
    for (var i = 0; i < PADROES_SEM_CONTEXTO.length; i++) {
      if (path.indexOf(PADROES_SEM_CONTEXTO[i]) !== -1) return false;
    }
    return true;
  }

  // Única fonte de verdade sobre se a Central pode aparecer/abrir agora —
  // usada tanto pelo FAB quanto por abrirJornadasPublico(), pra manter as
  // duas checagens sempre em sincronia.
  function jornadaPodeAbrirCentral() {
    return jornadaContextoValido() && !tourState.ativo && !(state.open && state.campanha);
  }

  function jornadaMostrarAvisoIndisponivel() {
    ensureStyles();
    var existente = document.getElementById(JORNADA_AVISO_ID);
    if (existente) existente.remove();
    var aviso = document.createElement('div');
    aviso.id = JORNADA_AVISO_ID;
    aviso.className = 'up-jorn-aviso';
    aviso.textContent = 'Ajuda indisponível nesta tela.';
    document.body.appendChild(aviso);
    window.setTimeout(function () {
      var el = document.getElementById(JORNADA_AVISO_ID);
      if (el) el.remove();
    }, 3000);
  }

  // Reavalia o FAB com a última elegibilidade conhecida (sem novo fetch) —
  // usada quando tour/campanha abrem ou fecham, pra esconder/mostrar a Ajuda
  // na hora, sem esperar a próxima navegação ou avaliação completa.
  function jornadaReavaliarFab() {
    renderJornadaFab(jornadaState.fabDisponivel);
  }

  // Camada defensiva extra, além do renderJornadaFab já chamado logo depois
  // de cada fetch de jornadas: garante que o botão exista no DOM sempre que
  // as três condições realmente permitirem (elegível, contexto/tour/campanha
  // OK, painel fechado) — mesmo que algum caminho intermediário tenha
  // deixado de recriá-lo a tempo por qualquer motivo transitório.
  function jornadaGarantirFabNoDom() {
    if (!jornadaState.fabDisponivel || jornadaState.aberto || !jornadaPodeAbrirCentral()) return;
    if (!document.getElementById(JORNADA_FAB_ID)) renderJornadaFab(true);
  }

  function renderJornadaFab(mostrar) {
    var existente = document.getElementById(JORNADA_FAB_ID);
    var podeExibir = mostrar && jornadaPodeAbrirCentral();
    if (!podeExibir || jornadaState.aberto) {
      if (existente) existente.remove();
      return;
    }
    if (existente) return;
    ensureStyles();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = JORNADA_FAB_ID;
    btn.className = 'up-jorn-fab';
    btn.setAttribute('aria-label', 'Ajuda');
    btn.innerHTML = icon('route') + '<span>Ajuda</span>';
    btn.addEventListener('click', function () { abrirJornadasPublico(); });
    document.body.appendChild(btn);
  }

  // Avaliado no init() (sistema opcional — Jornada não é filtrada por
  // sistema/tela, só por segmentação) só para decidir se o botão flutuante
  // aparece. Nunca abre o painel sozinho, nunca inicia tour sozinho.
  function avaliarJornadasParaBotao(config) {
    var meuToken = ++jornadaElegibilidadeToken;
    var contexto = resolveContexto();
    fetchJornadas(config.sistema, config.tela, config.usuario_id, contexto).then(function (jornadas) {
      // Resposta desatualizada — uma avaliação mais recente já foi disparada
      // depois desta; deixa o resultado dela prevalecer.
      if (meuToken !== jornadaElegibilidadeToken) return;
      jornadaState.fabDisponivel = (jornadas || []).length > 0;
      renderJornadaFab(jornadaState.fabDisponivel);
      if (debugState.enabled) {
        debugLog('Jornadas / FAB Ajuda', {
          fab_disponivel: jornadaState.fabDisponivel,
          jornadas_elegiveis: (jornadas || []).map(function (j) { return { id: j.id, titulo: j.titulo || null }; }),
          pode_abrir_central: jornadaPodeAbrirCentral(),
          motivo_bloqueio_central: jornadaPodeAbrirCentral() ? null : (!jornadaContextoValido() ? 'contexto inválido (sem usuario_id, ou em tela de login)' : (tourState.ativo ? 'tour ativo ocupando a tela' : 'campanha aberta ocupando a tela')),
        });
      }
      // Segunda checagem, um instante depois — pega qualquer condição
      // transitória (ex.: outro trecho de código mexendo no DOM bem nesse
      // meio tempo) que tenha impedido o botão de ficar de fato no DOM.
      window.setTimeout(jornadaGarantirFabNoDom, 400);
    }).catch(function () {
      if (meuToken !== jornadaElegibilidadeToken) return;
      jornadaState.fabDisponivel = false;
      renderJornadaFab(false);
      if (debugState.enabled) debugLog('Jornadas / FAB Ajuda', { fab_disponivel: false, motivo: 'erro ao buscar jornadas candidatas' });
    });
  }

  // API pública para abrir a central de ajuda manualmente (ex.: botão
  // "Central de ajuda" no host, ou o botão flutuante "Ajuda"):
  //   window.UserPulse.abrirJornadas()
  function abrirJornadasPublico() {
    var config = state.config;
    if (!config) return;
    // Mesma regra do FAB: sem contexto de usuário válido (tela de
    // autenticação, sem usuario_id) ou com tour/campanha ocupando a tela, não
    // abre — só avisa discretamente, em vez de competir visualmente por cima.
    if (!jornadaPodeAbrirCentral()) {
      jornadaMostrarAvisoIndisponivel();
      return;
    }
    ensureStyles();
    // Invalida qualquer avaliação em segundo plano (avaliarJornadasParaBotao)
    // ainda em andamento — o que essa busca vai encontrar é a fonte mais
    // confiável possível, já que é exatamente o que vai ficar na tela.
    jornadaElegibilidadeToken++;
    var contexto = resolveContexto();
    fetchJornadas(config.sistema, config.tela, config.usuario_id, contexto).then(function (jornadas) {
      // Pré-marca jornada._concluidaRegistrada com o que já veio concluído do
      // servidor (sessões anteriores) — bloco.progresso.concluido em si já
      // vem certo do servidor, sem precisar de flag equivalente por bloco.
      jornadaState.jornadas = (jornadas || []).map(function (j) {
        j._concluidaRegistrada = Boolean(j.progresso && j.progresso.concluida);
        return j;
      });
      // Essa busca acabou de provar se existe (ou não) jornada elegível agora
      // — é uma fonte mais confiável que qualquer avaliação em segundo plano
      // (mesmo uma mais recente), porque é literalmente o que está sendo
      // mostrado no painel neste momento. Por isso atualiza fabDisponivel
      // incondicionalmente aqui, ao contrário de avaliarJornadasParaBotao
      // (que só atualiza se ainda for a avaliação mais recente). Sem isso,
      // fechar o painel podia usar um valor antigo de fabDisponivel e o botão
      // "Ajuda" ficava escondido mesmo com jornada elegível de verdade.
      jornadaState.fabDisponivel = jornadaState.jornadas.length > 0;
      jornadaState.blocoAtivo = null;
      jornadaState.busca = '';
      jornadaState.aberto = true;
      renderJornadaFab(false);
      renderJornadaPainel();
      for (var i = 0; i < jornadaState.jornadas.length; i++) {
        registrarEventoJornada(jornadaState.jornadas[i].id, null, null, 'jornada_aberta');
      }
    }).catch(function () {
      jornadaState.jornadas = [];
      jornadaState.fabDisponivel = false;
      jornadaState.blocoAtivo = null;
      jornadaState.busca = '';
      jornadaState.aberto = true;
      renderJornadaFab(false);
      renderJornadaPainel();
    });
  }

  // Ativa/desativa o modo debug em qualquer momento (window.UserPulse.debug()
  // ativa; window.UserPulse.debug(false) desativa). Puramente observacional —
  // nunca muda elegibilidade/exibição, só liga o console.log de debugLog().
  function debugAtivar(ativar) {
    debugState.enabled = ativar !== false;
    try { console.log('[UserPulse debug] modo debug ' + (debugState.enabled ? 'ativado' : 'desativado') + '.'); } catch (_e) {}
    return debugState.enabled;
  }

  // window.UserPulse.debugState() — snapshot pontual do estado atual, sempre
  // logado (independe do modo debug estar ligado). Só leitura: nenhum fetch,
  // nenhuma mudança de state/tourState/jornadaState.
  function debugSnapshot() {
    var config = state.config;
    var passoAtual = null;
    if (tourState.ativo && tourState.tour && tourState.tour.passos) {
      var p = tourState.tour.passos[tourState.indice];
      if (p) {
        passoAtual = {
          ordem: tourState.indice,
          seletor_tipo: p.seletor_tipo || 'data_cy',
          seletor: p.seletor,
          status: tourState.naoEncontrado ? 'nao_encontrado' : debugStatusSeletorPasso(p),
        };
      }
    }
    var snapshot = {
      config: debugSanitizar(config),
      url: debugStatusUrl(),
      aparencia: tourState.aparencia
        ? { cor_principal: tourState.aparencia.cor_principal || null, logo_url: tourState.aparencia.logo_url || null }
        : null,
      campanha_atual: state.campanha ? { id: state.campanha.id, slug: state.campanha.slug || null, aberta: state.open } : null,
      tour_ativo: tourState.ativo
        ? { id: tourState.tour && tourState.tour.id, titulo: tourState.tour && tourState.tour.titulo, tela: tourState.tela, passo_atual: passoAtual }
        : null,
      jornada_fab_disponivel: Boolean(jornadaState.fabDisponivel),
      jornada_painel_aberto: Boolean(jornadaState.aberto),
    };
    try {
      console.groupCollapsed('[UserPulse debug] snapshot');
      console.log(snapshot);
      console.groupEnd();
    } catch (_e) { /* console indisponível — snapshot ainda é retornado normalmente */ }
    return snapshot;
  }

  // Drain any calls queued by widget-loader.js before this script finished loading
  var _q = window.UserPulse && window.UserPulse._q;
  window.UserPulse = window.UserPulse || {};
  window.UserPulse.init = init;
  window.UserPulse.track = track;
  window.UserPulse.updateContext = updateContext;
  window.UserPulse.iniciarTour = iniciarTourPublico;
  window.UserPulse.abrirJornadas = abrirJornadasPublico;
  window.UserPulse.debug = debugAtivar;
  window.UserPulse.debugState = debugSnapshot;
  // Não é API pública (mesma convenção de _q/_up_ready acima) — só existe
  // pra permitir testar funções internas sem precisar simular fetch/DOM real
  // completo. Nunca documentado pro host.
  //   - avaliarSegmentacaoTour: função pura, sem DOM/rede — ver
  //     server/src/widgetTourSegmentacao.test.ts.
  //   - tourVoltar/finalizarTour: mesmas funções do runtime, chamadas direto
  //     pra testar a decisão de navegação do "Voltar" — ver
  //     server/src/widgetTourVoltar.test.ts. tourState em si NUNCA é exposto
  //     aqui (nem direto nem em cópia) — expunha o objeto inteiro por
  //     referência (tour/passos, aparencia, urlPorPasso, config indireta via
  //     jornadaContexto etc.), deixando qualquer script no domínio do
  //     cliente livre pra ler E alterar esse estado à vontade. Em vez disso,
  //     ver os helpers de teste logo abaixo de tourFeedback em widget.js:
  //     tourSetTestState (setter controlado, lista fechada de campos),
  //     tourGetTestSnapshot/tourGetTestStepSnapshot (leitura mínima) e
  //     tourGetTestClickListener (só o listener de clique, não o root).
  //   - recorderCapturarClique/recorderCapturarValor/recorderPausarOuContinuar/
  //     recorderPrepararTesteCaptura/recorderGetTestSnapshot: pra testar que
  //     o estado pausado do Gravador de Tours realmente ignora clique/input
  //     — ver server/src/widgetRecorderPause.test.ts. Ao contrário de
  //     tourState acima, recorderState NUNCA é exposto aqui (nem direto nem
  //     em cópia): ele guarda título/seletor/descrição de cada passo já
  //     capturado no fluxo que o admin está gravando, e este é o widget
  //     PÚBLICO, rodando no browser do cliente — recorderGetTestSnapshot()
  //     devolve só { ativo, pausado, totalPassos, contexto }, nunca a lista
  //     de passos em si.
  //   - recorderSanitizarPassoInicial: função pura (só recebe um objeto solto
  //     e devolve outro sanitizado, nunca toca em recorderState) usada por
  //     recorderLerPassosIniciais pra validar cada passo de up_rec_passos —
  //     testa diretamente que seletor_tipo 'area' (e demais tipos válidos)
  //     sobrevivem à sanitização, e que um tipo inválido cai no fallback
  //     data_cy — ver server/src/widgetRecorderPause.test.ts.
  //   - iniciarPreviewSeNecessario: só orquestra funções puras/já expostas
  //     (recorderLerPassosIniciais + iniciarTour) a partir de
  //     window.location.search — nenhum estado novo exposto por causa dela;
  //     o teste confere o resultado via tourState/recorderGetTestSnapshot já
  //     expostos acima — ver server/src/widgetRecorderPause.test.ts.
  //   - iniciarGravadorSeNecessario: mesma função real chamada em init(),
  //     logo antes de iniciarPreviewSeNecessario — exposta só pra testar a
  //     precedência real entre os dois (gravador sempre vence quando os dois
  //     parâmetros aparecem juntos), na mesma ordem de chamada de init().
  //   - recorderTextosPainelFinal: função pura (sem DOM, sem recorderState —
  //     só título/subtítulo/CTA calculados a partir de paraTourExistente +
  //     totalPassos) usada por recorderRenderPainelFinal — testa que
  //     contexto='editar_tour_existente' troca os textos certos, e que sem
  //     contexto o texto antigo (orientado a criar/importar) continua igual.
  //   - tourGetTestSnapshot/tourGetTestStepSnapshot/tourSetTestState/
  //     tourGetTestClickListener: helpers mínimos de harness que substituem a
  //     exposição direta de tourState (ver comentário acima, em
  //     tourVoltar/finalizarTour). tourGetTestSnapshot devolve só
  //     { ativo, preview, feedbackEscolhido, indice, voltarFallbackTimerAtivo };
  //     tourGetTestStepSnapshot só { tourTitulo, totalPassos, seletorTipos }
  //     (nunca o array de passos em si, nem seletor/id/descrição de cada um);
  //     tourSetTestState só escreve os campos da lista fechada
  //     TOUR_TEST_STATE_CAMPOS_PERMITIDOS; tourGetTestClickListener devolve só
  //     a função de clique religada por bindTourEvents, nunca tourState.root.
  //     Nenhum deles expõe state geral do widget (config/campanha/jornada,
  //     que pode carregar usuario_email/nome passados pelo host em
  //     window.UserPulse.init()). Usados por widgetTourFeedback.test.ts,
  //     widgetTourVoltar.test.ts e widgetRecorderPause.test.ts.
  //   - renderTour: a MESMA função de render/orquestração usada em produção
  //     (só desenha o DOM a partir do tourState atual e religa os listeners
  //     de clique via bindTourEvents — nunca lê/expõe dado nenhum, nunca
  //     registra evento sozinha). Exposta pra que o teste do feedback final
  //     dispare o clique real no botão (via o listener que bindTourEvents
  //     religou) em vez de chamar tourFeedback() diretamente — de propósito
  //     NÃO expomos tourFeedback aqui: é a função que registra o evento de
  //     verdade, e expor uma função pública assim, com esse efeito colateral,
  //     deixaria qualquer script no domínio do cliente livre pra chamá-la à
  //     vontade. Simular o clique de verdade testa o mesmo caminho de
  //     produção sem abrir esse atalho — ver
  //     server/src/widgetTourFeedback.test.ts.
  window.UserPulse._internal = {
    avaliarSegmentacaoTour: avaliarSegmentacaoTour,
    tourVoltar: tourVoltar,
    finalizarTour: finalizarTour,
    tourGetTestSnapshot: tourGetTestSnapshot,
    tourGetTestStepSnapshot: tourGetTestStepSnapshot,
    tourSetTestState: tourSetTestState,
    tourGetTestClickListener: tourGetTestClickListener,
    renderTour: renderTour,
    recorderCapturarClique: recorderCapturarClique,
    recorderCapturarValor: recorderCapturarValor,
    recorderPausarOuContinuar: recorderPausarOuContinuar,
    recorderPrepararTesteCaptura: recorderPrepararTesteCaptura,
    recorderGetTestSnapshot: recorderGetTestSnapshot,
    recorderSanitizarPassoInicial: recorderSanitizarPassoInicial,
    iniciarPreviewSeNecessario: iniciarPreviewSeNecessario,
    iniciarGravadorSeNecessario: iniciarGravadorSeNecessario,
    recorderTextosPainelFinal: recorderTextosPainelFinal,
    // Destaque em elemento — funções puras (sem efeito colateral): só
    // validam/montam um seletor CSS a partir de data-cy (sem tocar em
    // localStorage/rede) ou consultam o DOM já presente (document.querySelector
    // real, sem estado do widget). Ver server/src/widgetDestaqueElemento.test.ts.
    destaqueElementoSeletorSeguro: destaqueElementoSeletorSeguro,
    destaqueElementoLocalizarAlvo: destaqueElementoLocalizarAlvo,
    destaqueElementoCalcularPosicao: destaqueElementoCalcularPosicao,
    destaqueElementoCalcularPosicaoTooltip: destaqueElementoCalcularPosicaoTooltip,
    destaqueElementoCalcularBeacon: destaqueElementoCalcularBeacon,
    destaqueElementoRectsIguais: destaqueElementoRectsIguais,
    destaqueElementoMutacoesApenasNoRoot: destaqueElementoMutacoesApenasNoRoot,
    destaqueElementoObterViewport: destaqueElementoObterViewport,
    // destaqueElementoResolverItens: função pura (fallback destaques[] vs
    // pseudo-item legado). destaqueElementoMontar/MontarTodos +
    // destaqueElementoGetTestClickListener: mesmo padrão de renderTour/
    // tourGetTestClickListener — expõem só o suficiente pra simular um
    // clique real no badge/CTA/fechar num harness de teste (vm), sem expor
    // destaqueElementoInstancias inteiro.
    destaqueElementoResolverItens: destaqueElementoResolverItens,
    destaqueElementoMontar: destaqueElementoMontar,
    destaqueElementoMontarTodos: destaqueElementoMontarTodos,
    destaqueElementoGetTestClickListener: destaqueElementoGetTestClickListener,
    destaqueElementoGetTestInputListener: destaqueElementoGetTestInputListener,
    destaqueElementoGetTestUtilidadeState: destaqueElementoGetTestUtilidadeState,
    destaqueElementoGetTestAberto: destaqueElementoGetTestAberto,
    // wasShown/markShown já existiam (política de "mostrar_uma_vez"
    // compartilhada por qualquer formato de campanha, via localStorage) —
    // expostas aqui pra confirmar que Destaque em elemento reaproveita a
    // mesma infra, mas com um gatilho diferente do modal: markShown só roda
    // numa interação explícita (clicar no badge, no CTA, ou dispensar),
    // nunca só por ter renderizado (ver comentário em destaqueElementoMontar).
    wasShown: wasShown,
    markShown: markShown,
    // Ícone do cabeçalho da modal por tipo de campanha (comunicado/melhoria/
    // pesquisa) — regra pura, exposta só pra confirmar por teste que fica em
    // paridade com iconeTipoCampanha/ICONES_TIPO_CAMPANHA (campanhas2/Index.tsx,
    // "preview"), a mesma regra do lado do admin. Ver server/src/widgetCampaignIcon.test.ts.
    campaignIconName: campaignIconName,
  };
  window.UserPulse._up_ready = true;
  if (_q && _q.length) {
    for (var _qi = 0; _qi < _q.length; _qi++) {
      var _qc = _q[_qi];
      if (_qc[0] === 'init') init.apply(null, _qc[1]);
      else if (_qc[0] === 'track') track.apply(null, _qc[1]);
      else if (_qc[0] === 'updateContext') updateContext.apply(null, _qc[1]);
      else if (_qc[0] === 'iniciarTour') iniciarTourPublico.apply(null, _qc[1]);
      else if (_qc[0] === 'abrirJornadas') abrirJornadasPublico.apply(null, _qc[1]);
      else if (_qc[0] === 'debug') debugAtivar.apply(null, _qc[1]);
    }
  }
})();
