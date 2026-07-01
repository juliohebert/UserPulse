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
      '.up-tour-loading{font-size:12px;line-height:17px;color:#727785;margin-top:10px;display:flex;gap:8px;align-items:center;background:rgba(114,119,133,.08);border-radius:8px;padding:8px 10px}',
      '.up-tour-spinner{width:13px;height:13px;flex-shrink:0;border-radius:50%;border:2px solid rgba(114,119,133,.25);border-top-color:#727785;animation:up-tour-spin .7s linear infinite}',
      '@keyframes up-tour-spin{to{transform:rotate(360deg)}}',
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
      '.up-rec-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483640;display:flex;align-items:center;gap:10px;background:#0b1c30;color:#fff;padding:10px 14px;border-radius:999px;box-shadow:0 18px 40px rgba(11,28,48,.35);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}',
      '.up-rec-dot{width:9px;height:9px;border-radius:50%;background:#ff5252;flex-shrink:0;animation:up-rec-blink 1.2s ease-in-out infinite}',
      '@keyframes up-rec-blink{0%,100%{opacity:1}50%{opacity:.25}}',
      '.up-rec-label{font-weight:800;white-space:nowrap}',
      '.up-rec-contador{opacity:.75;white-space:nowrap}',
      '.up-rec-ultimo{opacity:.7;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}',
      '.up-rec-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}',
      '.up-rec-btn{border:0;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-family:inherit;white-space:nowrap}',
      '.up-rec-btn:hover{background:rgba(255,255,255,.24)}',
      '.up-rec-btn:disabled{opacity:.35;cursor:not-allowed}',
      '.up-rec-btn-primary{background:#0058be}',
      '.up-rec-btn-primary:hover{background:#0066d6}',
      '.up-rec-btn-danger{background:rgba(255,82,82,.22)}',
      '.up-rec-btn-danger:hover{background:rgba(255,82,82,.36)}',
      '.up-rec-overlay{position:fixed;inset:0;z-index:2147483650;display:flex;align-items:center;justify-content:center;background:rgba(11,28,48,.55);padding:16px}',
      '.up-rec-modal{width:100%;max-width:640px;max-height:calc(100vh - 32px);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(11,28,48,.3);padding:20px;display:flex;flex-direction:column;gap:10px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0b1c30}',
      '.up-rec-modal-title{font-size:16px;font-weight:800;margin:0}',
      '.up-rec-modal-sub{font-size:12px;color:#424754;margin:0}',
      '.up-rec-textarea{flex:1;min-height:260px;border:1px solid #c2c6d6;border-radius:10px;padding:10px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical;background:#f8f9ff;color:#0b1c30}',
      '.up-rec-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}',
      '.up-rec-modal-revisao{max-width:720px}',
      '.up-rec-revisao-lista{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}',
      '.up-rec-revisao-item{border:1px solid #e0e2ef;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px}',
      '.up-rec-revisao-header{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.up-rec-revisao-ordem{font-weight:800;font-size:12px;color:#0058be}',
      '.up-rec-revisao-acoes{display:flex;gap:4px;flex-wrap:wrap}',
      '.up-rec-btn-icone{border:0;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;background:#eff4ff;color:#0058be;font-family:inherit}',
      '.up-rec-btn-icone:hover{background:#dbe8ff}',
      '.up-rec-btn-icone:disabled{opacity:.35;cursor:not-allowed}',
      '.up-rec-btn-icone.up-rec-btn-danger{background:rgba(255,82,82,.12);color:#ba1a1a}',
      '.up-rec-btn-icone.up-rec-btn-danger:hover{background:rgba(255,82,82,.22)}',
      '.up-rec-revisao-label{font-size:11px;font-weight:700;color:#727785;text-transform:uppercase;letter-spacing:.03em;display:block;margin-top:4px}',
      '.up-rec-input{width:100%;border:1px solid #c2c6d6;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;color:#0b1c30;margin-top:2px}',
      '.up-rec-textarea-sm{width:100%;border:1px solid #c2c6d6;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;color:#0b1c30;resize:vertical;min-height:44px;margin-top:2px}',
      '.up-rec-select{width:100%;border:1px solid #c2c6d6;border-radius:8px;padding:6px 8px;font-size:13px;font-family:inherit;color:#0b1c30;background:#fff;margin-top:2px}',
      '.up-rec-revisao-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}',
      '.up-rec-revisao-codigo{display:block;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f8f9ff;border-radius:6px;padding:4px 6px;color:#0b1c30;word-break:break-all;margin-top:2px}',
      '.up-rec-revisao-alertas{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:3px}',
      '.up-rec-revisao-alertas li{font-size:11px;color:#e65100;background:rgba(230,81,0,.08);border-radius:6px;padding:4px 7px}',
      '@media (max-width:480px){.up-rec-revisao-grid{grid-template-columns:1fr}}',
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
    iniciarGravadorSeNecessario();
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
    interacaoCleanup: null,
    interacaoTimer: null,
    nextClickTimer: null,
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
    // Primeira tentativa falhou — troca o tooltip do passo anterior (que ainda
    // estaria na tela) pelo estado discreto "Aguardando", em vez de deixá-lo
    // parado ali até a busca resolver. Só dispara uma vez por passo (tentativa
    // 0): no caso comum em que o elemento já existe, cb(el) acima resolve
    // antes de chegar aqui e esse estado nunca aparece.
    if (tentativa === 0) renderTour();
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

  function renderTourNaoEncontrado() {
    var passo = tourState.tour.passos[tourState.indice];
    var total = tourState.tour.passos.length;
    var ultimo = tourState.indice === total - 1;
    return [
      '<div class="up-tour-tooltip" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
      '<button type="button" class="up-tour-close" data-up-tour-skip="true" aria-label="Pular tour">' + icon('close') + '</button>',
      '<p class="up-tour-progress">Passo ' + (tourState.indice + 1) + ' de ' + total + '</p>',
      '<p class="up-tour-title">Elemento não encontrado</p>',
      passo.titulo ? '<p class="up-tour-desc" style="font-weight:700;color:#0b1c30">' + escapeHtml(passo.titulo) + '</p>' : '',
      passo.descricao ? '<p class="up-tour-desc">' + escapeHtml(passo.descricao) + '</p>' : '',
      '<div class="up-tour-warning">' + icon('close') + '<span>Não foi possível localizar este elemento na tela atual. Você pode voltar, pular o tour ou continuar para o próximo passo.</span></div>',
      tourFooter(total, ultimo),
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
      '<div class="up-tour-tooltip" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)">',
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

  function renderTour() {
    if (!tourState.ativo || !tourState.tour) return;

    var oldRoot = document.getElementById(TOUR_WIDGET_ID);
    if (oldRoot) oldRoot.remove();

    var root = document.createElement('div');
    root.id = TOUR_WIDGET_ID;
    root.className = 'up-tour-overlay';
    tourState.root = root;

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

  // Avanço automático por interação com o próprio elemento destacado (além dos
  // botões Próximo/Voltar) — controlado por passo.modo_avanco_interacao.
  // "manual" (default) não liga listener nenhum: só o botão Próximo avança.
  // Os listeners nunca chamam preventDefault/stopPropagation — a interação
  // original da aplicação acontece normalmente, e só depois de um pequeno
  // delay o tour avança (ou conclui, no último passo).
  var TOUR_INTERACAO_DELAY_MS = 250;

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
    tourState.interacaoTimer = window.setTimeout(function () {
      tourState.interacaoTimer = null;
      if (!tourState.ativo || tourState.elementoAtual !== el) return;
      var ultimo = tourState.indice === tourState.tour.passos.length - 1;
      if (ultimo) tourConcluir(); else irParaPasso(tourState.indice + 1);
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
      bindInteracao(el, passo);
      registrarEventoTour('passo_visualizado', indice);
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) {}
      window.setTimeout(renderTour, 320);
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
      try { el.click(); } catch (_e) {}
      tourState.nextClickTimer = window.setTimeout(function () {
        tourState.nextClickTimer = null;
        if (!tourState.ativo) return;
        irParaPasso(indiceProximo);
      }, TOUR_NEXT_CLICK_DELAY_MS);
      return;
    }

    irParaPasso(indiceProximo);
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
    limparInteracao();
    limparNextClickTimer();
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
    ultimoEl: null,
    ultimoElTimestamp: 0,
    ultimaUrl: '',
    inputTimers: null,
    elParaIndice: null,
    urlPollTimer: null,
    pausadoAntesRevisao: false,
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
  var RECORDER_MODOS_AVANCO = [
    { value: 'manual', label: 'Manual (só pelo botão Próximo)' },
    { value: 'ao_clicar', label: 'Ao clicar no elemento' },
    { value: 'ao_alterar_valor', label: 'Ao preencher/alterar o valor' },
    { value: 'ao_aparecer_elemento', label: 'Quando outro elemento aparecer' },
    { value: 'ao_sumir_elemento', label: 'Quando outro elemento sumir' },
  ];
  var RECORDER_ACOES_AO_AVANCAR = [
    { value: 'apenas_avancar', label: 'Apenas avançar' },
    { value: 'clicar_elemento', label: 'Clicar no elemento destacado e avançar' },
  ];
  var RECORDER_MODOS_AVANCO_COM_CONFIRMACAO = ['ao_aparecer_elemento', 'ao_sumir_elemento'];

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
        passos: recorderState.passos,
        navegacoes: recorderState.navegacoes,
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

  function recorderElementoNaBarra(el) {
    if (!el || !el.closest) return false;
    try { return Boolean(el.closest('#' + RECORDER_BAR_ID + ', #' + RECORDER_PAINEL_ID)); } catch (_e) { return false; }
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

  // Fallback quando não há data-cy/id/name/aria-label: tag + primeira classe
  // + posição entre irmãos do mesmo tipo, só o suficiente pra desambiguar —
  // de propósito simples (não é um gerador de caminho CSS único robusto).
  function recorderSeletorFallback(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : 'div';
    var classe = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/)[0] : '';
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

  // Ordem de preferência pedida: data-cy → id → name → aria-label → fallback CSS.
  function recorderGerarSeletor(el) {
    try {
      var dataCy = el.getAttribute && el.getAttribute('data-cy');
      if (dataCy) return { seletor_tipo: 'data_cy', seletor: dataCy };
      if (el.id) return { seletor_tipo: 'css', seletor: '#' + recorderCssEscapeSimples(el.id) };
      var name = el.getAttribute && el.getAttribute('name');
      if (name) {
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        return { seletor_tipo: 'css', seletor: tag + '[name="' + name.replace(/"/g, '\\"') + '"]' };
      }
      var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
      if (ariaLabel) return { seletor_tipo: 'css', seletor: '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]' };
      return { seletor_tipo: 'css', seletor: recorderSeletorFallback(el) };
    } catch (_e) {
      return { seletor_tipo: 'css', seletor: el.tagName ? el.tagName.toLowerCase() : '*' };
    }
  }

  // botão/link/menu → ao_clicar; input/textarea/select e autocomplete/combobox
  // /search/dropdown (por role ou por nome) → ao_alterar_valor.
  function recorderInferirModo(el) {
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

  // Só usa texto/atributos estáticos da própria UI (rótulo do botão, placeholder,
  // name) — nunca o valor digitado pelo usuário.
  function recorderGerarTitulo(el) {
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

  // Resumo curto do passo (só o título, truncado) — usado na barra pra
  // mostrar "o último passo capturado" sem expor nada além do que já é
  // texto estático da própria UI do host (nunca valor digitado).
  function recorderResumoPasso(p) {
    var titulo = (p.titulo || '').trim();
    if (titulo.length > 40) titulo = titulo.slice(0, 37) + '...';
    return titulo || '(sem título)';
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
    var botaoPausa = bar.querySelector('[data-up-rec-pause]');
    if (botaoPausa) botaoPausa.textContent = recorderState.pausado ? 'Continuar' : 'Pausar';
    var botaoDesfazer = bar.querySelector('[data-up-rec-undo]');
    if (botaoDesfazer) botaoDesfazer.disabled = recorderState.passos.length === 0;
  }

  function recorderRegistrarPasso(el, modo) {
    var sel = recorderGerarSeletor(el);
    var passo = {
      titulo: recorderGerarTitulo(el),
      descricao: '',
      seletor_tipo: sel.seletor_tipo,
      seletor: sel.seletor,
      tooltip_posicao: 'auto',
      acao_ao_avancar: 'apenas_avancar',
      modo_avanco_interacao: modo,
      seletor_confirmacao: null,
    };
    recorderState.passos.push(passo);
    recorderState.elParaIndice.set(el, recorderState.passos.length - 1);
    recorderAtualizarBarra();
    recorderPersistir();
  }

  // Cliques disparam ao_clicar; nunca chama preventDefault/stopPropagation —
  // a interação real do usuário com o sistema acontece normalmente.
  function recorderCapturarClique(event) {
    if (!recorderState.ativo || recorderState.pausado) return;
    var el = event.target;
    if (!(el instanceof Element) || recorderElementoNaBarra(el)) return;
    if (isEditableTarget(el) || recorderCampoSensivel(el)) return; // esses vão por input/change, não por clique
    var agora = Date.now();
    if (recorderState.ultimoEl === el && (agora - recorderState.ultimoElTimestamp) < RECORDER_CLIQUE_DEDUPE_MS) return; // duplo clique acidental
    recorderState.ultimoEl = el;
    recorderState.ultimoElTimestamp = agora;
    recorderRegistrarPasso(el, recorderInferirModo(el));
  }

  // input/change disparam ao_alterar_valor. Nunca lê event.target.value — só
  // usa o evento como sinal de "houve preenchimento". "input" tem debounce
  // (não captura a cada tecla); "change" já é uma confirmação (seleção/blur),
  // captura na hora. Ambos só geram UM passo por elemento nesta sessão de
  // gravação (elParaIndice evita duplicar a cada nova tecla/seleção).
  function recorderCapturarValor(event) {
    if (!recorderState.ativo || recorderState.pausado) return;
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
    recorderAtualizarBarra();
    recorderPersistir();
  }

  function recorderPausarOuContinuar() {
    recorderState.pausado = !recorderState.pausado;
    recorderAtualizarBarra();
    recorderPersistir();
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
  }

  // Botão "Finalizar" da barra: NÃO gera o JSON de imediato — abre o painel de
  // revisão pra editar/reordenar/remover passos antes. A gravação continua
  // "ativa" (sessionStorage intacto) nesse meio-tempo; só é limpa de fato em
  // recorderGerarJsonFinal(). Pausa a captura enquanto revisa (além disso,
  // cliques/edições dentro do próprio painel já são ignorados por
  // recorderElementoNaBarra, que também cobre o RECORDER_PAINEL_ID).
  function recorderFinalizar() {
    recorderState.pausadoAntesRevisao = recorderState.pausado;
    recorderState.pausado = true;
    recorderPersistir();
    var bar = document.getElementById(RECORDER_BAR_ID);
    if (bar) bar.remove();
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
    return alertas;
  }

  function recorderHtmlAlertas(p) {
    var alertas = recorderAlertasPasso(p);
    if (alertas.length === 0) return '';
    return '<ul class="up-rec-revisao-alertas">' + alertas.map(function (a) {
      return '<li>' + escapeHtml(a) + '</li>';
    }).join('') + '</ul>';
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

  function recorderSelectHtml(campo, indice, valorAtual, opcoes) {
    var options = opcoes.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === valorAtual ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    return '<select class="up-rec-select" data-rev-campo="' + campo + '" data-rev-index="' + indice + '">' + options + '</select>';
  }

  function recorderHtmlRevisaoItem(p, i, total) {
    return [
      '<div class="up-rec-revisao-item">',
      '<div class="up-rec-revisao-header">',
      '<span class="up-rec-revisao-ordem">Passo ' + (i + 1) + '</span>',
      '<div class="up-rec-revisao-acoes">',
      '<button type="button" class="up-rec-btn-icone" data-rev-subir data-rev-index="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Mover para cima">&uarr;</button>',
      '<button type="button" class="up-rec-btn-icone" data-rev-descer data-rev-index="' + i + '"' + (i === total - 1 ? ' disabled' : '') + ' title="Mover para baixo">&darr;</button>',
      '<button type="button" class="up-rec-btn-icone up-rec-btn-danger" data-rev-remover data-rev-index="' + i + '" title="Remover passo">Remover</button>',
      '</div>',
      '</div>',
      '<label class="up-rec-revisao-label">Título</label>',
      '<input type="text" class="up-rec-input" data-rev-campo="titulo" data-rev-index="' + i + '" value="' + escapeHtml(p.titulo || '') + '">',
      '<label class="up-rec-revisao-label">Descrição</label>',
      '<textarea class="up-rec-textarea-sm" data-rev-campo="descricao" data-rev-index="' + i + '">' + escapeHtml(p.descricao || '') + '</textarea>',
      '<div class="up-rec-revisao-grid">',
      '<div>',
      '<span class="up-rec-revisao-label">Seletor (' + escapeHtml(p.seletor_tipo) + ')</span>',
      '<code class="up-rec-revisao-codigo">' + escapeHtml(p.seletor) + '</code>',
      '</div>',
      '<div><span class="up-rec-revisao-label">Posição do tooltip</span>' + recorderSelectHtml('tooltip_posicao', i, p.tooltip_posicao, RECORDER_TOOLTIP_POSICOES) + '</div>',
      '<div><span class="up-rec-revisao-label">Como avançar</span>' + recorderSelectHtml('modo_avanco_interacao', i, p.modo_avanco_interacao, RECORDER_MODOS_AVANCO) + '</div>',
      '<div><span class="up-rec-revisao-label">Ação ao clicar em Próximo</span>' + recorderSelectHtml('acao_ao_avancar', i, p.acao_ao_avancar, RECORDER_ACOES_AO_AVANCAR) + '</div>',
      '</div>',
      '<div class="up-rec-confirmacao-wrap" data-rev-confirmacao-wrap="' + i + '">' + recorderHtmlConfirmacao(p, i) + '</div>',
      '<div class="up-rec-alertas-wrap" data-rev-alertas="' + i + '">' + recorderHtmlAlertas(p) + '</div>',
      '</div>',
    ].join('');
  }

  function recorderHtmlRevisao() {
    var passos = recorderState.passos;
    var itens = passos.map(function (p, i) { return recorderHtmlRevisaoItem(p, i, passos.length); }).join('');
    return [
      '<div class="up-rec-modal up-rec-modal-revisao">',
      '<h3 class="up-rec-modal-title">Revisar passos — ' + passos.length + ' passo' + (passos.length === 1 ? '' : 's') + '</h3>',
      '<p class="up-rec-modal-sub">Ajuste título, descrição e comportamento de cada passo antes de gerar o JSON.</p>',
      '<div class="up-rec-revisao-lista">',
      (passos.length === 0 ? '<p class="up-rec-modal-sub">Nenhum passo capturado ainda.</p>' : itens),
      '</div>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="up-rec-btn" data-rev-fechar>Fechar</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-rev-gerar>Gerar JSON</button>',
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

    // Título/descrição/modo/seletor de confirmação afetam os alertas exibidos
    // — atualiza só o bloco de alertas dessa linha (sem re-renderizar campos
    // de texto, que perderiam o foco/cursor do usuário no meio da digitação).
    if (campo === 'titulo' || campo === 'descricao' || campo === 'modo_avanco_interacao' || campo === 'seletor_confirmacao') {
      var wrap = document.querySelector('[data-rev-alertas="' + indice + '"]');
      if (wrap) wrap.innerHTML = recorderHtmlAlertas(passo);
    }
  }

  function recorderRevisaoOnClick(event) {
    var alvo = event.target;
    if (!(alvo instanceof Element)) return;

    if (alvo.closest('[data-rev-fechar]')) { recorderFecharRevisao(); return; }
    if (alvo.closest('[data-rev-gerar]')) { recorderGerarJsonFinal(); return; }

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
  }

  function recorderRenderPainelFinal() {
    var json = recorderMontarJson();
    var texto = JSON.stringify(json, null, 2);

    var avisoNavegacao = recorderState.navegacoes.length > 0
      ? '<p class="up-rec-modal-sub">' + recorderState.navegacoes.length + ' navegação(ões) de URL detectada(s) durante a gravação — não viraram passo (sem elemento associado); o tour usa a URL onde a gravação começou.</p>'
      : '';

    var root = document.createElement('div');
    root.id = RECORDER_PAINEL_ID;
    root.className = 'up-rec-overlay';
    root.innerHTML = [
      '<div class="up-rec-modal">',
      '<h3 class="up-rec-modal-title">Tour gravado — ' + json.tour.passos.length + ' passo(s)</h3>',
      '<p class="up-rec-modal-sub">Revise os passos, copie ou baixe o JSON e importe pela tela de Tours Guiados (Importar JSON).</p>',
      avisoNavegacao,
      '<textarea class="up-rec-textarea" readonly data-up-rec-json>' + escapeHtml(texto) + '</textarea>',
      '<div class="up-rec-modal-actions">',
      '<button type="button" class="up-rec-btn" data-up-rec-copiar>Copiar JSON</button>',
      '<button type="button" class="up-rec-btn" data-up-rec-baixar>Baixar JSON</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-up-rec-fechar>Fechar</button>',
      '</div>',
      '</div>',
    ].join('');
    document.body.appendChild(root);

    root.addEventListener('click', function (event) {
      var alvo = event.target;
      if (!(alvo instanceof Element)) return;

      if (alvo.closest('[data-up-rec-copiar]')) {
        try {
          var textarea = root.querySelector('[data-up-rec-json]');
          if (textarea && textarea.select) textarea.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).catch(function () {});
          } else {
            document.execCommand('copy');
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
    bar.className = 'up-rec-bar';
    bar.innerHTML = [
      '<span class="up-rec-dot"></span>',
      '<span class="up-rec-label">Gravando Tour</span>',
      '<span class="up-rec-contador" data-up-rec-contador>0 passos</span>',
      '<span class="up-rec-ultimo" data-up-rec-ultimo></span>',
      '<div class="up-rec-actions">',
      '<button type="button" class="up-rec-btn" data-up-rec-pause>Pausar</button>',
      '<button type="button" class="up-rec-btn" data-up-rec-undo disabled>Desfazer último passo</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-danger" data-up-rec-cancel>Cancelar</button>',
      '<button type="button" class="up-rec-btn up-rec-btn-primary" data-up-rec-finish>Finalizar</button>',
      '</div>',
    ].join('');
    document.body.appendChild(bar);

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
    recorderState.passos = [];
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

    recorderIniciarCaptura();
    recorderPersistir();
    recorderRenderBarra();
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
