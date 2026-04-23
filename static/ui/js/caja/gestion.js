// GESTIÓN DE CAJA – LOGICA DE APERTURA/CIERRE DE DÍA Y SESIONES
// Este archivo centraliza las acciones de control de caja: abrir día, cerrar día, abrir cajón y cerrar cajón.

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // Identificación de elementos de la interfaz
  const btnAbrirDia = document.getElementById('btn-abrir-dia');
  const btnCerrarDia = document.getElementById('btn-cerrar-dia');
  const btnAbrirCaja = document.getElementById('btn-abrir-caja');
  const btnCerrarCaja = document.getElementById('btn-cerrar-caja');
  const btnMovEntrada = document.getElementById('btn-mov-entrada');
  const btnMovSalida = document.getElementById('btn-mov-salida');

  console.log("Caja Gestion JS Loaded");
  console.log("Buttons found:", { 
      btnAbrirDia: !!btnAbrirDia, 
      btnCerrarDia: !!btnCerrarDia, 
      btnAbrirCaja: !!btnAbrirCaja, 
      btnCerrarCaja: !!btnCerrarCaja, 
      btnMovEntrada: !!btnMovEntrada, 
      btnMovSalida: !!btnMovSalida 
  });

  // Modales personalizados
  const modalMovimiento = document.getElementById('modalMovimiento');
  const modalCerrarTurno = document.getElementById('modalCerrarTurno');
  console.log("Modals found:", { modalMovimiento: !!modalMovimiento, modalCerrarTurno: !!modalCerrarTurno });

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

  const config = window.readJsonScript
    ? window.readJsonScript('caja-gestion-config', {})
    : {};
  const endpoints = {
    apiDiaAbrir: config.apiDiaAbrir || '/api/dia/abrir/',
    apiDiaCerrar: config.apiDiaCerrar || '/api/dia/cerrar/',
    apiCajaAbrir: config.apiCajaAbrir || '/api/caja/abrir/',
    apiCajaCerrar: config.apiCajaCerrar || '/api/caja/cerrar/',
    apiCajaMovimiento: config.apiCajaMovimiento || '/api/caja/movimiento/'
  };
  const i18n = config.i18n || {};
  const t = window.t || ((key, fallback) => fallback || key);
  const csrftoken = getCsrfToken();

  // API unificada de dialogs de aplicacion
  const Notify = window.Notify;

  /* ============================================================
     1. GESTIÓN DEL DÍA CONTABLE
     ============================================================ */

  // Abrir nuevo día de trabajo
  if (btnAbrirDia) {
    btnAbrirDia.onclick = async function () {
      const res = await fetch(endpoints.apiDiaAbrir, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrftoken }
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        await Notify.error(data.error);
      }
    };
  }

  let isClosingDayGlobal = false;

  // Cerrar día de trabajo (finalización de jornada)
  if (btnCerrarDia) {
    btnCerrarDia.onclick = async function () {
      // Si hay un turno abierto (btnCerrarCaja existe), exigimos Arqueo
      if (btnCerrarCaja) {
          isClosingDayGlobal = true;
          document.querySelector('#modalCerrarTurno h2').textContent = "Arqueo de Cierre de Jornada";
          document.querySelector('#modalCerrarTurno p').textContent = "Hay un turno activo. Introduce el efectivo total del cajón para cerrar el turno y la jornada.";
          modalCerrarTurno.classList.remove('hidden');
          setupValidation(modalCerrarTurno, 'btnCerrarTurnoConfirm', ['efectivo-final']);
          return;
      }

      const confirmado = await Notify.confirmDanger(i18n.confirmCerrarDia || '¿Estás seguro de cerrar el día?', {
        title: 'Cerrar Jornada',
      });
      if (!confirmado) return;
      
      ejecutarCierreDia();
    };
  }

  async function ejecutarCierreDia(efectivoReal = null) {
      const body = efectivoReal !== null ? JSON.stringify({ efectivo_final_real: efectivoReal }) : null;
      const res = await fetch(endpoints.apiDiaCerrar, {
        method: 'POST',
        headers: { 
            'X-CSRFToken': csrftoken,
            'Content-Type': 'application/json'
        },
        body: body
      });
      const data = await res.json();
      if (data.ok) {
        if (data.print_url) {
            window.open(data.print_url, 'impresion_cierre', 'width=400,height=600');
        }
        setTimeout(() => location.reload(), 300);
      } else {
        await Notify.error(data.error);
      }
  }

  /* ============================================================
     2. GESTIÓN DEL TURNO DE CAJA (SESIÓN)
     ============================================================ */

  // Abrir cajón (introducir efectivo inicial)
  if (btnAbrirCaja) {
    btnAbrirCaja.onclick = async function () {
      const inicial = document.getElementById('efectivo-inicial').value;
      const res = await fetch(endpoints.apiCajaAbrir, {
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
        await Notify.error(data.error);
      }
    };
  }

  // Helper para validación visual de botones
  function setupValidation(modal, btnId, fields) {
      const btn = document.getElementById(btnId);
      const inputs = fields.map(id => document.getElementById(id));
      
      const validate = () => {
          const allFilled = inputs.every(input => {
              const val = input.value.trim();
              if (input.type === 'number') {
                  const num = parseFloat(val);
                  return !isNaN(num) && num >= 0;
              }
              return val !== "";
          });
          btn.disabled = !allFilled;
      };

      inputs.forEach(input => {
          input.addEventListener('input', validate);
      });

      // Inicializar
      validate();
  }

  // Cerrar cajón (arqueo de caja)
  if (btnCerrarCaja) {
    btnCerrarCaja.onclick = function () {
        console.log("btnCerrarCaja clicked");
        isClosingDayGlobal = false;
        document.querySelector('#modalCerrarTurno h2').textContent = "Arqueo de Turno";
        document.querySelector('#modalCerrarTurno p').textContent = "Verifica el efectivo físico en el cajón.";
        modalCerrarTurno.classList.remove('hidden');
        setupValidation(modalCerrarTurno, 'btnCerrarTurnoConfirm', ['efectivo-final']);
    };
  }

  // Lógica del modal de cerrar turno
  if(modalCerrarTurno) {
      document.getElementById('btnCerrarTurnoCancel').onclick = function() {
          console.log("btnCerrarTurnoCancel clicked");
          modalCerrarTurno.classList.add('hidden');
      };
      document.getElementById('btnCerrarTurnoConfirm').onclick = async function() {
          if (this.disabled) return;
          console.log("btnCerrarTurnoConfirm clicked");
          const efInput = document.getElementById('efectivo-final');
          const realStr = efInput.value;
          const real = parseFloat(realStr);

          if (isClosingDayGlobal) {
              ejecutarCierreDia(real);
              return;
          }

          const res = await fetch(endpoints.apiCajaCerrar, {
            method: 'POST',
            headers: {
              'X-CSRFToken': csrftoken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ efectivo_final_real: real, observaciones: "" })
          });
          
          const data = await res.json();
          if (data.ok) {
            if (data.print_url) {
                window.open(data.print_url, 'impresion_turno', 'width=400,height=600');
            }
            setTimeout(() => location.reload(), 300);
          } else {
            await Notify.error(data.error);
          }
      };
  }

  // MOVIMIENTOS DE CAJA
  if (btnMovEntrada) {
      btnMovEntrada.onclick = function() {
          console.log("btnMovEntrada clicked");
          document.getElementById('modalMovTitle').textContent = "Ingresar Dinero a Caja";
          document.getElementById('movTipo').value = "entrada";
          const conceptInput = document.getElementById('movConcepto');
          conceptInput.value = "";
          conceptInput.placeholder = "Ej: Cambio de la mañana, Bote...";
          document.getElementById('movImporte').value = "";
          modalMovimiento.classList.remove('hidden');
          setupValidation(modalMovimiento, 'btnMovConfirm', ['movConcepto', 'movImporte']);
      }
  }

  if (btnMovSalida) {
      btnMovSalida.onclick = function() {
          console.log("btnMovSalida clicked");
          document.getElementById('modalMovTitle').textContent = "Registrar Gasto de Caja";
          document.getElementById('movTipo').value = "salida";
          const conceptInput = document.getElementById('movConcepto');
          conceptInput.value = "";
          conceptInput.placeholder = "Ej: Pago a proveedor, Reparaciones...";
          document.getElementById('movImporte').value = "";
          modalMovimiento.classList.remove('hidden');
          setupValidation(modalMovimiento, 'btnMovConfirm', ['movConcepto', 'movImporte']);
      }
  }

  if (modalMovimiento) {
      document.getElementById('btnMovCancel').onclick = function() {
          console.log("btnMovCancel clicked");
          modalMovimiento.classList.add('hidden');
      }
      document.getElementById('btnMovConfirm').onclick = async function() {
          if (this.disabled) return;
          console.log("btnMovConfirm clicked");
          const tipo = document.getElementById('movTipo').value;
          const concepto = document.getElementById('movConcepto').value;
          const importe = document.getElementById('movImporte').value;

          const res = await fetch(endpoints.apiCajaMovimiento, {
            method: 'POST',
            headers: {
              'X-CSRFToken': csrftoken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tipo: tipo, concepto: concepto, importe: importe })
          });
          
          const data = await res.json();
          if (data.ok) {
            location.reload();
          } else {
            await Notify.error(data.error);
          }
      }
  }
});
