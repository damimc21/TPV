/**
 * GESTIÓN DE LA BARRA SUPERIOR (TOPBAR)
 * Este archivo permite ocultar/mostrar la cabecera para ganar espacio de trabajo.
 */
(function () {
  'use strict';

  const btn = document.getElementById('btnToggleCabecera');
  const topbar = document.querySelector('.topbar');
  if (!btn || !topbar) return;

  const label = 'Cabecera';

  /* ============================================================
     1. RESTAURAR ESTADO GUARDADO
     ============================================================ */
  const isHidden = localStorage.getItem('tpv_cabecera_oculta') === 'true';
  if (isHidden) {
    topbar.classList.add('topbar--oculta');
    document.body.classList.add('app--sinCabecera');
    btn.textContent = '▼ ' + label;
  } else {
    btn.textContent = '▲ ' + label;
  }

  /* ============================================================
     2. EVENTO DE INTERACCIÓN (CLICK)
     ============================================================ */
  btn.addEventListener('click', function () {
    const oculta = topbar.classList.toggle('topbar--oculta');
    document.body.classList.toggle('app--sinCabecera', oculta);
    localStorage.setItem('tpv_cabecera_oculta', oculta);
    btn.textContent = oculta ? '▼ ' + label : '▲ ' + label;
  });
})();
