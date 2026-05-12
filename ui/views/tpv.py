"""Vistas para la sección «tpv».
Reexportadas desde ui.views.__init__ para mantener compatibilidad.
"""
import json
import math
from django.shortcuts import render, redirect, get_object_or_404
from django.http import Http404, JsonResponse, HttpResponseBadRequest
from decimal import Decimal
from datetime import datetime
from django.views.decorators.http import require_POST, require_http_methods
from django.contrib.auth import logout, get_user_model
from django.contrib.auth.models import Permission
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from django.core.exceptions import PermissionDenied
from ..models import TPVMap, TPVMapItem
from tpvapp.models import Factura, Pago, SesionCaja, DiaContable, ConfiguracionTPV, LineaComanda, Comanda, Proveedor, MovimientoStock, DocumentoProveedor
from tpvapp.auditoria import log_info, log_warn, log_error, registrar
from tpvapp.permissions import has_app_permission
from tpvapp.permission_profiles import (
    PERMISSION_PACKS,
    PERMISSION_DEFINITIONS,
    CATEGORY_LABELS,
    grouped_permissions,
    permission_codenames,
)
from tpvapp.auth_security import (
    get_auth_security_config,
    get_client_ip,
    get_login_block,
    save_auth_security_config,
)
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext as _
from django.db.models import Sum, Count, F
from datetime import timedelta
from ._helpers import (
    _actor_username,
    _require_permission_or_403,
    _require_any_permission_or_403,
    _forbidden_json,
    ROLE_PACK_KEYS,
    _role_from_permissions,
    _apply_role_permissions,
)

@login_required
def tpv(request):
    _require_permission_or_403(request, "access_tpv")
    active = TPVMap.objects.filter(owner=request.user, is_active=True).first()
    dia_actual = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    sesion_actual = SesionCaja.objects.filter(fecha_cierre__isnull=True).first() if dia_actual else None
    
    # Calcular siguiente turno del día actual
    next_turno = 1
    if dia_actual:
        next_turno = dia_actual.sesiones.count() + 1
    
    # Obtener fondo de caja predeterminado
    fondo_caja_obj = ConfiguracionTPV.objects.filter(clave="fondo_caja_predeterminado").first()
    fondo_caja = fondo_caja_obj.valor if (fondo_caja_obj and fondo_caja_obj.valor) else "0.00"

    return render(request, "ui/tpv/tpv.html", {
        "active_map_id": active.id if active else None,
        "dia_abierto": dia_actual is not None,
        "sesion_abierta": sesion_actual is not None,
        "next_turno": next_turno,
        "fecha_hoy": timezone.now().strftime("%d/%m/%Y"),
        "fondo_caja_predeterminado": fondo_caja,
    })


@login_required
def mesa(request, numero):
    _require_permission_or_403(request, "manage_orders")
    # 1) rango válido
    if not (1 <= numero <= 999):
        raise Http404("Mesa inválida")
    
    # 2) Estado dinámico y datos para el footer
    dia_actual = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    sesion_actual = SesionCaja.objects.filter(fecha_cierre__isnull=True).first() if dia_actual else None
    
    turno_numero = 1
    fecha_jornada = timezone.now()
    if dia_actual:
        fecha_jornada = dia_actual.fecha_apertura
        turno_numero = dia_actual.sesiones.count()
        if not sesion_actual: # Si por alguna razón estamos en la mesa sin sesión (no debería pasar según lógica TPV)
            turno_numero += 1
        else:
            # Encontrar el número de la sesión actual
            turno_numero = dia_actual.sesiones.filter(fecha_apertura__lte=sesion_actual.fecha_apertura).count()

    if sesion_actual:
        caja_estado = "ABIERTA"
    elif dia_actual:
        caja_estado = "DÍA ABIERTO"
    else:
        caja_estado = "CERRADA"
    
    return render(request, "ui/tpv/mesa.html", {
        "numero": numero,
        "terminal_id": "1",
        "turno_numero": turno_numero,
        "fecha_jornada": fecha_jornada,
        "caja_estado": caja_estado,
    })


@login_required
def ticket(request, factura_id):
    factura = get_object_or_404(Factura, id=factura_id)
    return render(request, "ui/tpv/ticket.html", {"factura": factura})


def _get_report_data(dia=None, sesion=None):
    """
    Función interna unificada para recopilar datos de cierre nivel Turno o Jornada.
    """
    from django.db.models import Sum
    from decimal import Decimal
    from tpvapp.models import Factura, LineaComanda, MovimientoCaja, Pago

    if sesion:
        pago_qs = Pago.objects.filter(sesion=sesion, factura__estado="pagada")
        factura_qs = Factura.objects.filter(sesion=sesion, estado="pagada")
        mov_qs = MovimientoCaja.objects.filter(sesion=sesion)
        sesiones_list = [sesion]
        tipo_cierre = "TURNO"
        doc_id = sesion.id
        responsable = sesion.cerrada_por or sesion.abierta_por
        fecha_negocio = sesion.fecha_apertura
        apertura = sesion.fecha_apertura
        cierre = sesion.fecha_cierre
    else:
        pago_qs = Pago.objects.filter(sesion__dia=dia, factura__estado="pagada")
        factura_qs = Factura.objects.filter(sesion__dia=dia, estado="pagada")
        mov_qs = MovimientoCaja.objects.filter(sesion__dia=dia)
        sesiones_list = dia.sesiones.all().order_by("fecha_apertura")
        tipo_cierre = "JORNADA"
        doc_id = dia.id
        responsable = dia.cerrado_por or dia.abierta_por
        fecha_negocio = dia.fecha_apertura
        apertura = dia.fecha_apertura
        cierre = dia.fecha_cierre

    # 1) Auditoría Ventas
    total_tickets = factura_qs.count()
    subtotal = factura_qs.aggregate(Sum('subtotal'))['subtotal__sum'] or Decimal("0.00")
    impuestos = factura_qs.aggregate(Sum('impuestos'))['impuestos__sum'] or Decimal("0.00")
    total_ventas = factura_qs.aggregate(Sum('total'))['total__sum'] or Decimal("0.00")

    # Descuentos / Invitaciones
    dinero_descuentos = Decimal("0.00")
    dinero_invitaciones = Decimal("0.00")
    if sesion:
        lineas_pagadas = LineaComanda.objects.filter(comanda__facturas__sesion=sesion, comanda__facturas__estado="pagada", anulado=False)
    else:
        lineas_pagadas = LineaComanda.objects.filter(comanda__facturas__sesion__dia=dia, comanda__facturas__estado="pagada", anulado=False)
    
    for linea in lineas_pagadas:
        if linea.descuento == 100:
            dinero_invitaciones += linea.cantidad * linea.precio_unitario
        elif linea.descuento > 0:
            dinero_descuentos += (linea.cantidad * linea.precio_unitario) * (linea.descuento / Decimal("100.00"))

    # 2) Medios de Pago
    total_efectivo_ventas = pago_qs.filter(metodo_pago="efectivo").aggregate(Sum('cantidad'))['cantidad__sum'] or Decimal("0.00")
    total_tarjeta_ventas = pago_qs.filter(metodo_pago="tarjeta").aggregate(Sum('cantidad'))['cantidad__sum'] or Decimal("0.00")
    # Total cobrado (debe coincidir con total_ventas si no hay pendientes)
    total_cobrado = total_efectivo_ventas + total_tarjeta_ventas

    # 3) Movimientos y Arqueo
    fondo_inicial = Decimal("0.00")
    efectivo_real = Decimal("0.00")
    for s in sesiones_list:
        fondo_inicial += s.efectivo_inicial
        efectivo_real += (s.efectivo_final_real or Decimal("0.00"))

    t_in = mov_qs.filter(tipo="entrada").aggregate(Sum('importe'))['importe__sum'] or Decimal("0.00")
    t_out = mov_qs.filter(tipo="salida").aggregate(Sum('importe'))['importe__sum'] or Decimal("0.00")

    # Lógica solicitada: (EFECTIVO REAL + TARJETA + SALIDAS - ENTRADAS) - FONDO = TOTAL REAL
    # Luego TOTAL REAL se compara con Z (Ventas Sistema)
    total_bruto_arqueo = efectivo_real + total_tarjeta_ventas + t_out - t_in
    total_real_neto = total_bruto_arqueo - fondo_inicial
    descuadre = total_real_neto - total_ventas

    # Datos por turno para el detalle (limpio)
    sesiones_data = []
    for s in sesiones_list:
        v_ef = Pago.objects.filter(sesion=s, metodo_pago="efectivo", factura__estado="pagada").aggregate(Sum('cantidad'))['cantidad__sum'] or Decimal("0.00")
        v_tj = Pago.objects.filter(sesion=s, metodo_pago="tarjeta", factura__estado="pagada").aggregate(Sum('cantidad'))['cantidad__sum'] or Decimal("0.00")
        sesiones_data.append({
            "obj": s,
            "efectivo": v_ef,
            "tarjeta": v_tj,
            "total": v_ef + v_tj
        })

    return {
        "tipo_cierre": tipo_cierre,
        "doc_id": doc_id,
        "responsable": responsable,
        "fecha_negocio": fecha_negocio,
        "apertura": apertura,
        "cierre": cierre,
        "total_tickets": total_tickets,
        "subtotal": subtotal,
        "impuestos": impuestos,
        "total_ventas": total_ventas,
        "dinero_descuentos": dinero_descuentos,
        "dinero_invitaciones": dinero_invitaciones,
        "efectivo_ventas": total_efectivo_ventas,
        "tarjeta_ventas": total_tarjeta_ventas,
        "total_cobrado": total_cobrado,
        "fondo_inicial": fondo_inicial,
        "entradas": t_in,
        "salidas": t_out,
        "efectivo_real": efectivo_real,
        "total_bruto_arqueo": total_bruto_arqueo,
        "total_real_neto": total_real_neto,
        "descuadre": descuadre,
        "sesiones": sesiones_data
    }


@login_required
def ticket_cierre_dia(request, dia_id):
    dia = get_object_or_404(DiaContable, id=dia_id)
    log_info(
        "caja.cierres",
        f"usuario={_actor_username(request.user)} accion=ver_ticket_cierre_jornada dia_id={dia.id} cerrada={'1' if dia.fecha_cierre else '0'}",
    )
    ctx = _get_report_data(dia=dia)
    return render(request, "ui/tpv/ticket_cierre.html", ctx)


@login_required
def ticket_cierre_turno(request, sesion_id):
    sesion = get_object_or_404(SesionCaja, id=sesion_id)
    log_info(
        "caja.cierres",
        f"usuario={_actor_username(request.user)} accion=ver_ticket_cierre_turno sesion_id={sesion.id} cerrada={'1' if sesion.fecha_cierre else '0'}",
    )
    ctx = _get_report_data(sesion=sesion)
    return render(request, "ui/tpv/ticket_cierre.html", ctx)


@login_required
def comprobante(request, comanda_id):
    _require_permission_or_403(request, "print_documents")
    from tpvapp.models import Comanda
    from tpvapp.services import imprimir_comprobante
    comanda = get_object_or_404(Comanda, id=comanda_id)
    try:
        imprimir_comprobante(comanda, request.user)
    except Exception as e:
        print(f"Error al marcar comprobante como impreso: {e}")
    
    return render(request, "ui/tpv/ticket.html", {"comanda_provisional": comanda})

