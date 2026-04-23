/**
 * TPV MODAL – GESTIÓN DE APERTURA OBLIGATORIA
 * Controla que el día y el turno de caja estén abiertos antes de permitir operar.
 */
(function () {
  'use strict';
  const Notify = window.Notify;

  // Identificar si el estado ya es válido desde variables de servidor
  const diaAbierto = window.TPV_DIA_ABIERTO === true;
  const sesionAbierta = window.TPV_SESION_ABIERTA === true;
  const modal = document.getElementById('modalCajaObligatorio');

  if (!modal) return;

  // Si no hay día o sesión activa, mostramos el modal de bloqueo
  if (!diaAbierto || !sesionAbierta) {
    modal.classList.remove('hidden');
  }

  /* Obtiene el token CSRF de las cookies para peticiones POST. */
  function getCsrfToken() {
    let value = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, 'csrftoken'.length + 1) === 'csrftoken=') {
          value = decodeURIComponent(cookie.substring('csrftoken='.length));
          break;
        }
      }
    }
    return value;
  }

  const csrftoken = getCsrfToken();

  /* ============================================================
     1. APERTURA DE DÍA
     ============================================================ */
  const btnAbrirDia = document.getElementById('btnAbrirDiaTPV');
  if (btnAbrirDia) {
    btnAbrirDia.addEventListener('click', async function () {
      const res = await fetch(window.TPV_API_DIA_ABRIR, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrftoken }
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
                Notify.error(data.error);
      }
    });
  }

  /* ============================================================
     2. APERTURA DE TURNO (CAJA)
     ============================================================ */
  const btnAbrirTurno = document.getElementById('btnAbrirTurnoTPV');
  const btnEditFondo = document.getElementById('btnEditFondo');
  const btnSaveFondo = document.getElementById('btnSaveFondo');
  const btnCancelFondo = document.getElementById('btnCancelFondo');
  
  const fondoView = document.getElementById('fondoView');
  const fondoEdit = document.getElementById('fondoEdit');
  const inputFondo = document.getElementById('inputFondo');
  const displayFondo = document.getElementById('displayFondo');
  const hiddenFondo = document.getElementById('efectivoInicialTPV');

  // Formateo inicial al cargar
  if (displayFondo && hiddenFondo) {
    displayFondo.innerText = formatEuros(hiddenFondo.value);
  }

  // Alternar a modo edición
  if (btnEditFondo) {
    btnEditFondo.addEventListener('click', () => {
      fondoView.classList.add('hidden');
      fondoEdit.classList.remove('hidden');
      inputFondo.focus();
    });
  }

  // Cancelar edición
  if (btnCancelFondo) {
    btnCancelFondo.addEventListener('click', () => {
      inputFondo.value = hiddenFondo.value; // Restaurar valor guardado
      fondoEdit.classList.add('hidden');
      fondoView.classList.remove('hidden');
    });
  }

  /**
   * Formatea un número al estilo moneda española (coma decimal, símbolo €)
   * Si es entero, no muestra decimales. Si tiene decimales, muestra 2.
   */
  function formatEuros(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return "0 €";
    return num.toLocaleString('es-ES', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  // Guardar nuevo valor visualmente
  if (btnSaveFondo) {
    btnSaveFondo.addEventListener('click', () => {
      let nuevoValor = parseFloat(inputFondo.value);
      if (isNaN(nuevoValor) || nuevoValor < 0) {
            Notify.info("Por favor, introduce un importe válido.");
        return;
      }
      
      // Actualizar estado
      hiddenFondo.value = nuevoValor.toFixed(2);
      displayFondo.innerText = formatEuros(nuevoValor);
      
      // Volver a vista lectura
      fondoEdit.classList.add('hidden');
      fondoView.classList.remove('hidden');
    });
  }

  if (btnAbrirTurno) {
    btnAbrirTurno.addEventListener('click', async function () {
      const val = hiddenFondo.value;
      const res = await fetch(window.TPV_API_CAJA_ABRIR, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrftoken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ efectivo_inicial: val })
      });
      const data = await res.json();
      if (data.ok) {
        modal.classList.add('hidden');
      } else {
            Notify.error(data.error);
      }
    });
  }
})();
