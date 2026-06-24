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
  };

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
      '.up-modal{position:static;width:100%;max-width:520px;background:#fff;border:1px solid #c2c6d6;border-radius:16px;box-shadow:0 24px 70px rgba(11,28,48,.22);overflow:hidden}',
      '.up-modal-enter{animation:up-fade-in .2s ease-out}',
      '.up-modal-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(194,198,214,.45)}',
      '.up-brand{display:flex;align-items:center;gap:10px;min-width:0}',
      '.up-brand-icon{width:32px;height:32px;border-radius:999px;background:#d8e2ff;color:#0058be;display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
      '.up-title{font-size:15px;line-height:21px;font-weight:800;color:#0b1c30;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.up-close{border:0;background:transparent;color:#727785;padding:4px;border-radius:8px;cursor:pointer;line-height:0;flex-shrink:0}',
      '.up-close:hover{background:#eff4ff;color:#0b1c30}',
      '.up-body{padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px}',
      '.up-subtitle{margin:0;color:#0058be;font-size:13px;line-height:18px;font-weight:800}',
      '.up-description{margin:0;color:#424754;font-size:14px;line-height:21px}',
      '.up-feedback-section{display:flex;flex-direction:column;gap:12px;padding-top:14px;border-top:1px solid #e0e2ef}',
      '.up-question{margin:0;color:#0b1c30;font-size:15px;line-height:21px;font-weight:700}',
      '.up-media{width:100%;overflow:hidden;border-radius:12px;background:#eff4ff;border:1px solid rgba(194,198,214,.45)}',
      '.up-media iframe{display:block;width:100%;aspect-ratio:16/9;border:0}',
      '.up-media img{display:block;width:100%;max-height:220px;object-fit:cover}',
      '.up-action{display:flex;width:100%;min-height:42px;align-items:center;justify-content:center;border:0;border-radius:12px;cursor:pointer;background:#6b38d4;color:#fff;text-decoration:none;font-size:12px;line-height:16px;font-weight:800;transition:opacity .15s ease,transform .15s ease}',
      '.up-action:hover{opacity:.92}',
      '.up-action:active{transform:scale(.98)}',
      '.up-scale{display:flex;gap:4px;width:100%}',
      '.up-score{flex:1;min-width:0;height:34px;border-radius:8px;border:1px solid #c2c6d6;background:#fff;color:#424754;font-size:12px;font-weight:800;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}',
      '.up-score:hover{background:#d8e2ff;border-color:#0058be;color:#0058be;transform:translateY(-1px)}',
      '.up-score-active{background:#0058be;border-color:#0058be;color:#fff}',
      '.up-scale-labels{display:flex;justify-content:space-between;margin-top:6px;color:#727785;font-size:10px;line-height:14px;font-weight:800;text-transform:uppercase}',
      '.up-textarea{width:100%;min-height:82px;resize:vertical;border:1px solid #c2c6d6;border-radius:12px;background:#f8f9ff;color:#0b1c30;padding:10px 12px;font:inherit;font-size:14px;line-height:20px;outline:none}',
      '.up-textarea:focus{border-color:#0058be;box-shadow:0 0 0 3px rgba(0,88,190,.16)}',
      '.up-required{margin:-8px 0 0;color:#ba1a1a;font-size:11px;line-height:16px}',
      '.up-error{margin:0;color:#ba1a1a;font-size:12px;line-height:16px}',
      '.up-submit{width:100%;height:42px;border:0;border-radius:12px;background:#0058be;color:#fff;font-size:12px;line-height:16px;font-weight:800;cursor:pointer;transition:opacity .15s ease,transform .15s ease}',
      '.up-submit:hover{opacity:.92}',
      '.up-submit:active{transform:scale(.98)}',
      '.up-submit:disabled{opacity:.42;cursor:not-allowed;transform:none}',
      '.up-thanks{padding:26px 22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}',
      '.up-check{width:62px;height:62px;border-radius:999px;background:rgba(0,105,71,.1);color:#006947;display:flex;align-items:center;justify-content:center}',
      '.up-thanks h4{margin:0;color:#0b1c30;font-size:20px;line-height:28px;font-weight:800}',
      '.up-thanks p{margin:0;color:#424754;font-size:14px;line-height:20px}',
      '.up-secondary{width:100%;height:40px;border:1px solid #c2c6d6;border-radius:12px;background:#fff;color:#424754;font-size:12px;font-weight:800;cursor:pointer}',
      '@keyframes up-fade-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}',
      '@media (max-width:600px){.up-widget-overlay{padding:12px}.up-modal-header{padding:16px}.up-body{padding:16px}.up-score{height:32px;font-size:11px}}',
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
      return [
        '<div class="' + modalClass + '" role="dialog" aria-modal="true" aria-label="Feedback enviado">',
        '<div class="up-thanks">',
        '<div class="up-check">' + icon('check') + '</div>',
        '<h4>Obrigado!</h4>',
        '<p>Seu feedback foi registrado e nos ajudara a melhorar.</p>',
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
      '<button type="button" class="up-close" aria-label="Fechar" data-up-toggle="true">' + icon('close') + '</button>',
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
    return 'userpulse:shown:' + campanha.id + ':' + ctx;
  }

  function wasShown(campanha, config) {
    if (!campanha.mostrar_uma_vez) return false;
    try {
      return window.localStorage.getItem(shownKey(campanha, config)) === '1';
    } catch (_err) {
      return false;
    }
  }

  function markShown(campanha, config) {
    if (!campanha.mostrar_uma_vez) return;
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
        state.open = false;
        state.submitted = false;
        state.nota = null;
        state.observacao = '';
        state.error = '';
        render();
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

  function normalizeConfig(config) {
    return {
      slug: config && config.slug ? String(config.slug) : '',
      sistema: config && config.sistema ? String(config.sistema) : '',
      tela: config && config.tela ? String(config.tela) : '',
      usuario_id: config && config.usuario_id ? String(config.usuario_id) : '',
      usuario_nome: config && config.usuario_nome ? String(config.usuario_nome) : '',
      usuario_email: config && config.usuario_email ? String(config.usuario_email) : '',
    };
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
    return fetch(apiUrl('/api/widget/campanha?' + params.toString()), {
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Nao foi possivel carregar a campanha.');
      return response.json();
    });
  }

  function submitFeedback() {
    var campanha = state.campanha;
    var config = state.config;
    if (!campanha || !config || state.nota === null || state.submitting) return;
    if (campanha.feedback_habilitado === false) return;

    if (campanha.observacao_obrigatoria && !state.observacao.trim()) {
      state.error = 'A observacao e obrigatoria para esta campanha.';
      render();
      return;
    }

    state.submitting = true;
    state.error = '';
    render();

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
        usuario_id: config.usuario_id || undefined,
        usuario_nome: config.usuario_nome || undefined,
        usuario_email: config.usuario_email || undefined,
        sistema: config.sistema,
        tela: config.tela,
        navegador: window.navigator.userAgent,
        dispositivo: getDevice(),
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
      .then(function () {
        state.submitted = true;
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

    state.submitting = true;
    state.error = '';
    render();

    fetch(apiUrl('/api/widget/confirmacao'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        campanha_id: campanha.id,
        usuario_id: config.usuario_id || undefined,
        usuario_nome: config.usuario_nome || undefined,
        usuario_email: config.usuario_email || undefined,
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

  function init(config) {
    // Restaurar overflow do body caso a modal estivesse aberta ao re-inicializar
    document.body.style.overflow = state.bodyOverflow || '';

    var normalized = normalizeConfig(config || {});
    state.config = normalized;
    state.campanha = null;
    state.open = false;
    state.nota = null;
    state.observacao = '';
    state.submitting = false;
    state.submitted = false;
    state.error = '';
    state.visualizacaoRegistrada = false;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    var oldRoot = document.getElementById(WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    if (!normalized.slug && (!normalized.sistema || !normalized.tela)) return;

    ensureStyles();
    fetchCampaign(normalized)
      .then(function (campanha) {
        if (!campanha) return;
        state.campanha = campanha;
        resetRoot();
        render();
        scheduleAutoOpen(campanha, normalized);
      })
      .catch(function () {
        // Widget embarcado deve falhar silenciosamente para nao afetar o sistema hospedeiro.
      });
  }

  window.UserPulse = window.UserPulse || {};
  window.UserPulse.init = init;
})();
