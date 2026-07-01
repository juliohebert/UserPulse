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

  function registrarEvento(tipoEvento) {
    var campanha = state.campanha;
    var config = state.config;
    if (!campanha || !config) return;
    fetch(apiUrl('/api/widget/evento'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        campanha_id: campanha.id,
        tipo_evento: tipoEvento,
        usuario_id: config.usuario_id || undefined,
        sistema: config.sistema || undefined,
        tela: config.tela || undefined,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
        contexto: config.contexto || undefined,
      }),
    }).catch(function () { /* fail silently */ });
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
      '.up-widget-root{position:fixed;z-index:2147483000;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0b1c30}',
      '.up-widget-overlay{inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(11,28,48,.45)}',
      '.up-widget-root *{box-sizing:border-box}',
      '.up-fab{width:56px;height:56px;border:0;border-radius:999px;background:#0058be;color:#fff;box-shadow:0 18px 40px rgba(0,88,190,.28);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}',
      '.up-fab:hover{transform:translateY(-1px) scale(1.04);box-shadow:0 20px 44px rgba(0,88,190,.34)}',
      '.up-fab:active{transform:scale(.96)}',
      '.up-fab svg{width:24px;height:24px;fill:currentColor}',
      '.up-fab-close{background:#0b1c30;color:#f8f9ff}',
      '.up-modal{position:static;width:100%;max-width:560px;background:#fff;border:1px solid #c2c6d6;border-radius:16px;box-shadow:0 24px 70px rgba(11,28,48,.22);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 32px)}',
      '.up-modal-enter{animation:up-fade-in .2s ease-out}',
      '.up-modal-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(194,198,214,.45);flex-shrink:0}',
      '.up-brand{display:flex;align-items:center;gap:10px;min-width:0}',
      '.up-brand-icon{width:32px;height:32px;border-radius:999px;background:#d8e2ff;color:#0058be;display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
      '.up-title{font-size:15px;line-height:21px;font-weight:800;color:#0b1c30;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
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
      '.up-action{display:flex;width:100%;min-height:42px;align-items:center;justify-content:center;border:0;border-radius:12px;cursor:pointer;background:#6b38d4;color:#fff;text-decoration:none;font-size:12px;line-height:16px;font-weight:800;transition:opacity .15s ease,transform .15s ease}',
      '.up-action:hover{opacity:.92}',
      '.up-action:active{transform:scale(.98)}',
      '.up-scale{display:flex;gap:4px;width:100%}',
      '.up-score{flex:1;min-width:22px;height:34px;border-radius:8px;border:1px solid #c2c6d6;background:#fff;color:#424754;font-size:12px;font-weight:800;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}',
      '.up-score:hover{background:#d8e2ff;border-color:#0058be;color:#0058be;transform:translateY(-1px)}',
      '.up-score-active{background:#0058be;border-color:#0058be;color:#fff}',
      '.up-scale-labels{display:flex;justify-content:space-between;margin-top:6px;color:#727785;font-size:10px;line-height:14px;font-weight:800;text-transform:uppercase}',
      '.up-textarea{width:100%;min-height:72px;resize:vertical;border:1px solid #c2c6d6;border-radius:12px;background:#f8f9ff;color:#0b1c30;padding:10px 12px;font:inherit;font-size:14px;line-height:20px;outline:none}',
      '.up-textarea:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16)}',
      '.up-required{margin:-8px 0 0;color:#ba1a1a;font-size:11px;line-height:16px}',
      '.up-error{margin:0;color:#ba1a1a;font-size:12px;line-height:16px}',
      '.up-submit{width:100%;height:42px;border:0;border-radius:12px;background:#0058be;color:#fff;font-size:12px;line-height:16px;font-weight:800;cursor:pointer;transition:opacity .15s ease,transform .15s ease}',
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
      '.up-tour-spotlight{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(11,28,48,.55),0 0 0 3px #0058be,0 0 0 5px rgba(0,88,190,.25);pointer-events:none;transition:top .2s ease,left .2s ease,width .2s ease,height .2s ease}',
      '.up-tour-tooltip{position:fixed;z-index:2147483601;width:300px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #c2c6d6;border-radius:14px;box-shadow:0 18px 50px rgba(11,28,48,.3);padding:16px;pointer-events:auto;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0b1c30}',
      '.up-tour-progress{font-size:11px;font-weight:800;color:#0058be;text-transform:uppercase;letter-spacing:.04em;margin:0 0 6px}',
      '.up-tour-title{font-size:15px;font-weight:800;color:#0b1c30;margin:0 0 6px;line-height:20px}',
      '.up-tour-desc{font-size:13px;line-height:19px;color:#424754;margin:0}',
      '.up-tour-warning{font-size:12px;line-height:17px;color:#ba1a1a;margin-top:10px;display:flex;gap:6px;align-items:flex-start;background:rgba(186,26,26,.08);border-radius:8px;padding:8px 10px}',
      '.up-tour-warning svg{width:15px;height:15px;flex-shrink:0;margin-top:1px;fill:currentColor}',
      '.up-tour-footer{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:8px}',
      '.up-tour-dots{display:flex;gap:4px;align-items:center}',
      '.up-tour-dot{width:6px;height:6px;border-radius:999px;background:#d8dbe6;flex-shrink:0}',
      '.up-tour-dot-active{background:#0058be;width:14px;border-radius:4px}',
      '.up-tour-nav{display:flex;gap:6px}',
      '.up-tour-btn{border:0;border-radius:9px;padding:8px 13px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;transition:opacity .15s ease,transform .15s ease}',
      '.up-tour-btn:hover{opacity:.9}',
      '.up-tour-btn:active{transform:scale(.97)}',
      '.up-tour-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}',
      '.up-tour-btn-primary{background:#0058be;color:#fff}',
      '.up-tour-btn-secondary{background:#eff4ff;color:#0058be}',
      '.up-tour-btn-text{background:transparent;color:#727785;padding:8px 4px}',
      '.up-tour-close{position:absolute;top:10px;right:10px;border:0;background:transparent;color:#727785;padding:4px;border-radius:8px;cursor:pointer;line-height:0}',
      '.up-tour-close:hover{background:#eff4ff;color:#0b1c30}',
      '.up-tour-close svg{width:16px;height:16px;fill:currentColor;display:block}',
      '@media (max-width:480px){.up-tour-tooltip{width:calc(100vw - 24px)}}',
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
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2Zm0 13.85L7.3 15H20V6H4v11.85Z"/></svg>';
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
        '<button type="button" class="up-submit" data-up-confirm="true"' + (state.submitting ? ' disabled' : '') + '>',
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
      '<div class="up-brand"><div class="up-brand-icon">' + icon('chat') + '</div><p class="up-title">' + escapeHtml(campanha.titulo) + '</p></div>',
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

  function shownKey(campanha, config) {
    var ctx = config.slug || (config.sistema + ':' + config.tela);
    var uid = config.usuario_id ? ':u:' + config.usuario_id : '';
    return 'userpulse:shown:' + campanha.id + ':' + ctx + uid;
  }

  function wasShown(campanha, config) {
    if (!campanha.mostrar_uma_vez) return false;
    if (campanha.always_show_user) return false;
    if (!campanha.permitir_fechar_modal) return false;
    try {
      return window.localStorage.getItem(shownKey(campanha, config)) === '1';
    } catch (_err) {
      return false;
    }
  }

  function markShown(campanha, config) {
    if (!campanha.mostrar_uma_vez) return;
    if (campanha.always_show_user) return;
    if (!campanha.permitir_fechar_modal) return;
    try {
      window.localStorage.setItem(shownKey(campanha, config), '1');
    } catch (_err) {}
  }

  function shouldAutoOpen(campanha) {
    return (campanha.modo_exibicao || 'modal_automatica') === 'modal_automatica'
      && (campanha.gatilho || 'ao_abrir_tela') === 'ao_abrir_tela';
  }

  function scheduleAutoOpen(campanha, config) {
    if (!shouldAutoOpen(campanha) || wasShown(campanha, config)) return;
    var delay = Number.isFinite(Number(campanha.atraso_ms)) ? Math.max(0, Number(campanha.atraso_ms)) : 800;
    state.timer = window.setTimeout(function () {
      state.open = true;
      markShown(campanha, config);
      if (!state.visualizacaoRegistrada) {
        state.visualizacaoRegistrada = true;
        registrarEvento('visualizacao');
      }
      render();
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
    return {
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
    state.campanha = null;
    state.open = false;
    state.nota = null;
    state.observacao = '';
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

    if (normalized.slug) {
      resolveContexto(); // atualiza normalized.contexto via provider, se existir
      fetchCampaign(normalized)
        .then(function (campanha) {
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
          for (var i = 0; i < candidatos.length; i++) {
            var c = candidatos[i];
            if (!checkMode(c, normalized)) continue;
            state.campanha = c;
            resetRoot();
            render();
            scheduleAutoOpen(c, normalized);
            break;
          }
        })
        .catch(function () {});
    }

    if (normalized.sistema) avaliarTourAutomatico(normalized);
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
          evento: eventoNome,
          sistema: config.sistema,
          usuario_id: config.usuario_id,
          contexto: contextoTrack,
        }),
      }).catch(function () { /* fail silently */ });
    }

    fetchCandidatas(config.sistema, config.tela, 'apos_evento', eventoNome, config.usuario_id, contextoTrack)
      .then(function (candidatos) {
        for (var i = 0; i < candidatos.length; i++) {
          var campanha = candidatos[i];
          if (!checkMode(campanha, config)) continue;
          if (wasShown(campanha, config)) continue;

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
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          if ((c.modo_identificacao || 'sistema_tela') !== 'url_contem') continue;
          if (!checkMode(c, config)) continue;
          if (wasShown(c, config)) continue;

          if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }

          state.campanha = c;
          state.open = false;
          state.nota = null;
          state.observacao = '';
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
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          if (!checkMode(c, config)) continue;
          if (wasShown(c, config)) continue;
          if (state.timer) { window.clearTimeout(state.timer); state.timer = null; }
          state.campanha = c;
          state.open = false;
          state.nota = null;
          state.observacao = '';
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
  }

  function handleUrlChange() {
    var currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    if (urlChangeTimer) { window.clearTimeout(urlChangeTimer); urlChangeTimer = null; }
    urlChangeTimer = window.setTimeout(function () {
      urlChangeTimer = null;
      evaluateUrlCampaigns();
    }, 200);
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
  var TOUR_RETRY_MAX = 12;
  var TOUR_RETRY_INTERVAL_MS = 300;

  var tourState = {
    tour: null,
    indice: 0,
    root: null,
    elementoAtual: null,
    naoEncontrado: false,
    buscaTimer: null,
    reposTimer: null,
    ativo: false,
    elementClickHandler: null,
    elementClickTimer: null,
  };

  function fetchTour(slug) {
    var params = new URLSearchParams();
    params.set('slug', slug);
    return fetch(apiUrl('/api/widget/tour?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    });
  }

  function fetchTourCandidatos(sistema, tela, usuario_id, contexto) {
    var params = new URLSearchParams();
    params.set('sistema', sistema);
    if (tela) params.set('tela', tela);
    if (usuario_id) params.set('usuario_id', usuario_id);
    appendContexto(params, contexto);
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
    try {
      window.localStorage.setItem(tourShownKey(tour), '1');
    } catch (_err) {}
  }

  function registrarEventoTour(tipoEvento, passoOrdem) {
    var tour = tourState.tour;
    var config = state.config;
    if (!tour || !config) return;
    fetch(apiUrl('/api/widget/tour/evento'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tour_id: tour.id,
        tipo_evento: tipoEvento,
        passo_ordem: passoOrdem != null ? passoOrdem : undefined,
        usuario_id: config.usuario_id || undefined,
        sistema: config.sistema || undefined,
        tela: config.tela || undefined,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
        contexto: config.contexto || undefined,
      }),
    }).catch(function () { /* fail silently */ });
  }

  function selecionarElementoPasso(passo) {
    try {
      var el = passo.seletor_tipo === 'css'
        ? document.querySelector(passo.seletor)
        : document.querySelector('[data-cy="' + passo.seletor + '"]');
      if (!el) return null;
      // Elemento existe no DOM mas está oculto (display:none, etc.) — trata como
      // ainda-não-encontrado para dar tempo do host revelá-lo (ex.: outro passo
      // do tour abriu um painel) antes de cair no estado de erro.
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return el;
    } catch (_e) {
      return null;
    }
  }

  function localizarComRetry(passo, tentativa, cb) {
    var el = selecionarElementoPasso(passo);
    if (el) { cb(el); return; }
    if (tentativa >= TOUR_RETRY_MAX) { cb(null); return; }
    tourState.buscaTimer = window.setTimeout(function () {
      localizarComRetry(passo, tentativa + 1, cb);
    }, TOUR_RETRY_INTERVAL_MS);
  }

  function limparBuscaTimer() {
    if (tourState.buscaTimer) {
      window.clearTimeout(tourState.buscaTimer);
      tourState.buscaTimer = null;
    }
  }

  function clampPos(pos, w, h) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    return {
      top: Math.min(Math.max(pos.top, 8), Math.max(8, vh - h - 8)),
      left: Math.min(Math.max(pos.left, 8), Math.max(8, vw - w - 8)),
    };
  }

  function calcularPosicaoTooltip(rect, posicaoDesejada, tooltipW, tooltipH) {
    var margin = 16;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var positions = {
      top: { top: rect.top - tooltipH - margin, left: rect.left + rect.width / 2 - tooltipW / 2 },
      bottom: { top: rect.bottom + margin, left: rect.left + rect.width / 2 - tooltipW / 2 },
      left: { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left - tooltipW - margin },
      right: { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.right + margin },
    };
    function fits(pos) {
      return pos.top >= 8 && pos.left >= 8 && pos.top + tooltipH <= vh - 8 && pos.left + tooltipW <= vw - 8;
    }
    var ordem;
    if (posicaoDesejada === 'top') ordem = ['top', 'bottom', 'right', 'left'];
    else if (posicaoDesejada === 'left') ordem = ['left', 'right', 'bottom', 'top'];
    else if (posicaoDesejada === 'right') ordem = ['right', 'left', 'bottom', 'top'];
    else if (posicaoDesejada === 'bottom') ordem = ['bottom', 'top', 'right', 'left'];
    else ordem = ['bottom', 'top', 'right', 'left'];

    for (var i = 0; i < ordem.length; i++) {
      if (fits(positions[ordem[i]])) return clampPos(positions[ordem[i]], tooltipW, tooltipH);
    }
    return clampPos(positions[ordem[0]], tooltipW, tooltipH);
  }

  function renderTourNaoEncontrado() {
    var passo = tourState.tour.passos[tourState.indice];
    var total = tourState.tour.passos.length;
    var ultimo = tourState.indice === total - 1;
    return [
      '<div class="up-tour-tooltip" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="Pular tour">' + icon('close') + '</button>',
      '<p class="up-tour-progress">Passo ' + (tourState.indice + 1) + ' de ' + total + '</p>',
      '<p class="up-tour-title">' + escapeHtml(passo.titulo) + '</p>',
      passo.descricao ? '<p class="up-tour-desc">' + escapeHtml(passo.descricao) + '</p>' : '',
      '<div class="up-tour-warning">' + icon('close') + '<span>Não foi possível localizar este elemento na tela atual.</span></div>',
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

  function renderTour() {
    if (!tourState.ativo || !tourState.tour) return;

    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    var root = document.createElement('div');
    root.id = TOUR_WIDGET_ID;
    root.className = 'up-tour-overlay';
    tourState.root = root;

    if (tourState.naoEncontrado || !tourState.elementoAtual) {
      root.innerHTML = renderTourNaoEncontrado();
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
      '<div class="up-tour-dots" style="margin-top:10px">' + dots.join('') + '</div>',
      tourFooter(total, ultimo),
      '</div>',
    ].join('');

    document.body.appendChild(root);
    bindTourEvents();

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
    window.requestAnimationFrame(renderTour);
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
    if (event.key === 'Escape') tourPular();
  }

  function bindTourEvents() {
    if (!tourState.root) return;
    tourState.root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-up-tour-back]')) { event.preventDefault(); tourVoltar(); return; }
      if (target.closest('[data-up-tour-next]')) { event.preventDefault(); tourProximo(); return; }
      if (target.closest('[data-up-tour-finish]')) { event.preventDefault(); tourConcluir(); return; }
      if (target.closest('[data-up-tour-skip]')) { event.preventDefault(); tourPular(); return; }
    });
  }

  // Clicar no próprio elemento destacado também avança o tour (além dos botões
  // Próximo/Voltar). O listener nunca chama preventDefault/stopPropagation —
  // o clique original da aplicação acontece normalmente, e só depois de um
  // pequeno delay o tour avança (ou conclui, no último passo).
  var TOUR_ELEMENT_CLICK_DELAY_MS = 250;

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

  // Cancela qualquer avanço agendado por clique no elemento. Chamado sempre que
  // o passo muda (irParaPasso, inclusive via Voltar) ou o tour termina — sem
  // isso, um clique em Voltar logo após um clique-avanço podia deixar o timeout
  // "zumbi" vivo e, se o usuário voltasse a passar pelo mesmo elemento físico
  // (mesmo nó do DOM) antes dele disparar, o avanço atrasado acontecia de novo
  // sem pedido, fazendo o tour parecer "perder" o Voltar.
  function limparElementClickTimer() {
    if (tourState.elementClickTimer) {
      window.clearTimeout(tourState.elementClickTimer);
      tourState.elementClickTimer = null;
    }
  }

  function unbindElementClick() {
    if (tourState.elementoAtual && tourState.elementClickHandler) {
      tourState.elementoAtual.removeEventListener('click', tourState.elementClickHandler);
    }
    tourState.elementClickHandler = null;
    limparElementClickTimer();
  }

  function bindElementClick(el) {
    var handler = function (event) {
      if (isEditableTarget(event.target)) return; // não autoavança em campos editáveis
      if (tourState.elementClickTimer) return; // já há um avanço agendado — não empilha outro
      tourState.elementClickTimer = window.setTimeout(function () {
        tourState.elementClickTimer = null;
        // Confere se o passo/elemento ainda é o mesmo — segunda camada de
        // proteção, além do cancelamento em unbindElementClick/limparElementClickTimer.
        if (!tourState.ativo || tourState.elementoAtual !== el) return;
        var ultimo = tourState.indice === tourState.tour.passos.length - 1;
        if (ultimo) tourConcluir(); else tourProximo();
      }, TOUR_ELEMENT_CLICK_DELAY_MS);
    };
    el.addEventListener('click', handler);
    tourState.elementClickHandler = handler;
  }

  function irParaPasso(indice) {
    limparBuscaTimer();
    unbindElementClick();
    tourState.indice = indice;
    tourState.naoEncontrado = false;
    tourState.elementoAtual = null;

    var passo = tourState.tour.passos[indice];
    if (!passo) { finalizarTour(); return; }

    localizarComRetry(passo, 0, function (el) {
      if (!tourState.ativo) return; // tour foi encerrado enquanto buscava
      if (!el) {
        tourState.naoEncontrado = true;
        registrarEventoTour('elemento_nao_encontrado', indice);
        renderTour();
        return;
      }
      tourState.elementoAtual = el;
      bindElementClick(el);
      registrarEventoTour('passo_visualizado', indice);
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) {}
      window.setTimeout(renderTour, 320);
    });
  }

  function tourProximo() {
    if (tourState.indice < tourState.tour.passos.length - 1) irParaPasso(tourState.indice + 1);
  }

  function tourVoltar() {
    if (tourState.indice > 0) irParaPasso(tourState.indice - 1);
  }

  function tourPular() {
    registrarEventoTour('pulado', tourState.indice);
    if (tourState.tour && (!state.config || !state.config.usuario_id)) tourMarkShown(tourState.tour);
    finalizarTour();
  }

  function tourConcluir() {
    registrarEventoTour('concluido', tourState.indice);
    if (tourState.tour && (!state.config || !state.config.usuario_id)) tourMarkShown(tourState.tour);
    finalizarTour();
  }

  function finalizarTour() {
    limparBuscaTimer();
    unbindElementClick();
    unbindTourReposHandlers();
    document.removeEventListener('keydown', tourKeydown);
    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();
    tourState.ativo = false;
    tourState.tour = null;
    tourState.root = null;
    tourState.elementoAtual = null;
    tourState.naoEncontrado = false;
  }

  function iniciarTour(tour) {
    if (!tour || !tour.passos || tour.passos.length === 0) return;
    finalizarTour();
    ensureStyles();
    tourState.tour = tour;
    tourState.ativo = true;
    registrarEventoTour('inicio', 0);
    bindTourReposHandlers();
    document.addEventListener('keydown', tourKeydown);
    irParaPasso(0);
  }

  // Avalia automaticamente, no init(), se há um tour guiado elegível para o
  // contexto atual (mesmo princípio do checkMode usado para campanhas).
  function avaliarTourAutomatico(config) {
    if (tourState.ativo || !config.sistema) return;
    fetchTourCandidatos(config.sistema, config.tela, config.usuario_id, config.contexto)
      .then(function (candidatos) {
        if (tourState.ativo) return;
        for (var i = 0; i < candidatos.length; i++) {
          var c = candidatos[i];
          if (!checkMode(c, config)) continue;
          // Com usuario_id, confia no backend (já fez dedupe/reexibição). Sem
          // usuario_id, o servidor não tem como identificar o usuário — cai
          // no fallback localStorage.
          if (!config.usuario_id && tourWasShown(c)) continue;
          iniciarTour(c);
          break;
        }
      })
      .catch(function () { /* fail silently */ });
  }

  // API pública para disparar um tour manualmente (ex.: botão "Ver tour" no host):
  //   window.UserPulse.iniciarTour('slug-do-tour')
  function iniciarTourPublico(slug) {
    if (!slug) return;
    fetchTour(slug).then(function (tour) {
      if (tour) iniciarTour(tour);
    }).catch(function () { /* fail silently */ });
  }

  // Drain any calls queued by widget-loader.js before this script finished loading
  var _q = window.UserPulse && window.UserPulse._q;
  window.UserPulse = window.UserPulse || {};
  window.UserPulse.init = init;
  window.UserPulse.track = track;
  window.UserPulse.updateContext = updateContext;
  window.UserPulse.iniciarTour = iniciarTourPublico;
  window.UserPulse._up_ready = true;
  if (_q && _q.length) {
    for (var _qi = 0; _qi < _q.length; _qi++) {
      var _qc = _q[_qi];
      if (_qc[0] === 'init') init.apply(null, _qc[1]);
      else if (_qc[0] === 'track') track.apply(null, _qc[1]);
      else if (_qc[0] === 'updateContext') updateContext.apply(null, _qc[1]);
      else if (_qc[0] === 'iniciarTour') iniciarTourPublico.apply(null, _qc[1]);
    }
  }
})();
