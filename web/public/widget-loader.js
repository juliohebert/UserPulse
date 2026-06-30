/**
 * UserPulse Widget Loader
 *
 * URL fixa que o sistema integrado inclui. Carrega automaticamente o
 * widget.js com cache-busting (?v=<versao>) definido pelo UserPulse.
 *
 * Chamadas a window.UserPulse.init(), .track() e .updateContext() feitas
 * antes do widget.js terminar de carregar são enfileiradas e executadas
 * assim que o widget estiver pronto.
 *
 * A versão é injetada pelo servidor Express em tempo de requisição.
 * Não edite este arquivo manualmente — ele é servido como template.
 */
(function () {
  'use strict';

  if (!window.UserPulse || !window.UserPulse._up_ready) {
    var _q = (window.UserPulse && window.UserPulse._q) || [];
    window.UserPulse = {
      _q: _q,
      init: function () { _q.push(['init', arguments]); },
      track: function () { _q.push(['track', arguments]); },
      updateContext: function () { _q.push(['updateContext', arguments]); },
      iniciarTour: function () { _q.push(['iniciarTour', arguments]); },
    };
  }

  var _s = document.currentScript || (function () {
    var _ss = document.getElementsByTagName('script');
    return _ss[_ss.length - 1];
  }());

  var _base = new URL(_s.src).origin;
  var _el = document.createElement('script');
  _el.src = _base + '/widget.js?v=__UP_VERSION__';
  _el.async = true;
  document.head.appendChild(_el);
}());
