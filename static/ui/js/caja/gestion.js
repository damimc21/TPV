// GESTIÓN DE CAJA – LOGICA DE APERTURA/CIERRE DE DÍA Y SESIONES
// Este archivo centraliza las acciones de control de caja: abrir día, cerrar día, abrir cajón y cerrar cajón.

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // Identificación de elementos de la interfaz
  const btnAbrirDia = document.getElementById('btn-abrir-dia');
  const btnCerrarDia = document.getElementById('btn-cerrar-dia');
  const btnAbrirCaja = document.getElementById('btn-abrir-caja');
  const btnCerrarCaja = document.getElementById('btn-cerrar-caja');

  // Obtiene el token CSRF para realizar peticiones POST seguras.
  function getCsrfToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, 'csrftoken'.length + 1) === 'csrftoken=') {
          cookieValue = decodeURIComponent(cookie.substring('csrftoken='.length));
          break;
        }
      }
    }
    return cookieValue;
  }

  const csrftoken = getCsrfToken();
  const i18n = window.CAJA_I18N || {};

  /* ============================================================
     1. GESTIÓN DEL DÍA CONTABLE
     ============================================================ */

  // Abrir nuevo día de trabajo
  if (btnAbrirDia) {
    btnAbrirDia.onclick = async function () {
      const res = await fetch(window.CAJA_API_DIA_ABRIR, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrftoken }
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        alert(data.error);
      }
    };
  }

  // Cerrar día de trabajo (finalización de jornada)
  if (btnCerrarDia) {
    btnCerrarDia.onclick = async function () {
      if (!confirm(i18n.confirmCerrarDia || '¿Estás seguro de cerrar el día?')) return;
      const res = await fetch(window.CAJA_API_DIA_CERRAR, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrftoken }
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        alert(data.error);
      }
    };
  }

  /* ============================================================
     2. GESTIÓN DEL TURNO DE CAJA (SESIÓN)
     ============================================================ */

  // Abrir cajón (introducir efectivo inicial)
  if (btnAbrirCaja) {
    btnAbrirCaja.onclick = async function () {
      const inicial = document.getElementById('efectivo-inicial').value;
      const res = await fetch(window.CAJA_API_CAJA_ABRIR, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrftoken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ efectivo_inicial: inicial })
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        alert(data.error);
      }
    };
  }

  // Cerrar cajón (arqueo de caja)
  if (btnCerrarCaja) {
    btnCerrarCaja.onclick = async function () {
      const real = document.getElementById('efectivo-final').value;
      const obs = document.getElementById('observaciones').value;
      if (!real) {
        alert(i18n.errorEfectivoReal || 'Introduce el efectivo real');
        return;
      }

      const res = await fetch(window.CAJA_API_CAJA_CERRAR, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrftoken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ efectivo_final_real: real, observaciones: obs })
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        alert(data.error);
      }
    };
  }
});
