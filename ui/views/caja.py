"""Vistas para la sección «caja».
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
# caja_facturas reutiliza el contexto de facturas emitidas (sección albaranes/facturas)
from .albaranes_facturas import _facturas_emitidas_context

@login_required
def caja(request):
    _require_permission_or_403(request, "manage_cash")
    return render(request, "ui/caja/index.html")


@login_required
def caja_reaperturas(request):
    _require_permission_or_403(request, "reopen_cash_sessions")
    """Vista para reabrir jornadas o turnos cerrados por error."""
    # Últimos 10 días cerrados
    dias = DiaContable.objects.filter(fecha_cierre__isnull=False).order_by("-fecha_apertura")[:10]
    # Últimos 10 turnos cerrados
    sesiones = SesionCaja.objects.filter(fecha_cierre__isnull=False).order_by("-fecha_apertura")[:10]
    
    return render(request, "ui/caja/reaperturas.html", {
        "dias": dias,
        "sesiones": sesiones
    })


@login_required
def caja_cierres(request):
    _require_any_permission_or_403(request, "view_cash_reports", "manage_cash")
    """Historial de cierres de caja (Turnos y Jornadas)."""
    # Jornadas (Días Contables)
    dias_qs = DiaContable.objects.filter(fecha_cierre__isnull=False).order_by("-fecha_apertura")
    dias_lista = []
    for d in dias_qs:
        # Calcular total Z rápido del día
        total_z = SesionCaja.objects.filter(dia=d).aggregate(
            sum_ef=Sum('total_ventas_efectivo'),
            sum_tj=Sum('total_ventas_tarjeta')
        )
        t_z = (total_z['sum_ef'] or Decimal("0.00")) + (total_z['sum_tj'] or Decimal("0.00"))
        dias_lista.append({
            "dia": d,
            "total_z": t_z
        })

    # Turnos (Sesiones)
    sesiones_qs = SesionCaja.objects.filter(fecha_cierre__isnull=False).order_by("-fecha_apertura")
    sesiones_lista = []
    for s in sesiones_qs:
        t_z = s.total_ventas_efectivo + s.total_ventas_tarjeta
        sesiones_lista.append({
            "sesion": s,
            "total_z": t_z
        })

    return render(request, "ui/caja/cierres.html", {
        "dias_lista": dias_lista,
        "sesiones_lista": sesiones_lista
    })


@login_required
@require_POST
def api_dia_reabrir(request, dia_id):
    if not has_app_permission(request.user, "reopen_cash_sessions"):
        return _forbidden_json(request, "reopen_cash_sessions")
    """Reabre una jornada cerrada."""
    dia = get_object_or_404(DiaContable, id=dia_id)
    if not dia.fecha_cierre:
        log_warn(
            "caja.jornada",
            f"usuario={_actor_username(request.user)} accion=reabrir_jornada_bloqueado dia_id={dia.id} motivo=jornada_ya_abierta",
        )
        return JsonResponse({"ok": False, "error": "La jornada ya esta abierta."}, status=400)

    dia_abierto = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    if dia_abierto and dia_abierto.id != dia.id:
        log_warn(
            "caja.jornada",
            f"usuario={_actor_username(request.user)} accion=reabrir_jornada_bloqueado dia_id={dia.id} motivo=otra_jornada_abierta",
        )
        return JsonResponse({"ok": False, "error": "Ya hay otra jornada abierta. Cierra la actual antes de reabrir esta."}, status=400)

    dia.fecha_cierre = None
    dia.cerrado_por = None
    dia.save()
    log_info(
        "caja.jornada",
        f"usuario={_actor_username(request.user)} accion=reabrir_jornada dia_id={dia.id}",
    )
    return JsonResponse({"ok": True})


@login_required
@require_POST
def api_caja_reabrir(request, sesion_id):
    if not has_app_permission(request.user, "reopen_cash_sessions"):
        return _forbidden_json(request, "reopen_cash_sessions")
    """Reabre un turno de caja cerrado."""
    sesion = get_object_or_404(SesionCaja, id=sesion_id)
    if not sesion.fecha_cierre:
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=reabrir_turno_bloqueado sesion_id={sesion.id} motivo=turno_ya_abierto",
        )
        return JsonResponse({"ok": False, "error": "El turno ya esta abierto."}, status=400)

    if sesion.dia.fecha_cierre:
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=reabrir_turno_bloqueado sesion_id={sesion.id} motivo=jornada_cerrada",
        )
        return JsonResponse({"ok": False, "error": "No puedes reabrir un turno de una jornada cerrada. Reabre primero la jornada."}, status=400)

    sesion_abierta = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()
    if sesion_abierta and sesion_abierta.id != sesion.id:
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=reabrir_turno_bloqueado sesion_id={sesion.id} motivo=otro_turno_abierto",
        )
        return JsonResponse({"ok": False, "error": "Ya hay otro turno abierto."}, status=400)

    sesion.fecha_cierre = None
    sesion.cerrada_por = None
    sesion.efectivo_final_real = None
    sesion.observaciones = ""
    sesion.save()
    log_info(
        "caja.turno",
        f"usuario={_actor_username(request.user)} accion=reabrir_turno sesion_id={sesion.id}",
    )
    return JsonResponse({"ok": True})


@login_required
def caja_gestion(request):
    _require_permission_or_403(request, "manage_cash")
    """Vista para abrir/cerrar el día y la caja."""
    
    if request.method == "POST" and "fondo_caja" in request.POST:
        # Guardar parámetro
        fondo = request.POST.get("fondo_caja", "0.00")
        actual = ConfiguracionTPV.objects.filter(clave="fondo_caja_predeterminado").first()
        valor_anterior = actual.valor if actual else ""
        ConfiguracionTPV.objects.update_or_create(
            clave="fondo_caja_predeterminado",
            defaults={"valor": fondo, "descripcion": "Fondo de caja inicial por defecto"}
        )
        log_info(
            "configuracion.caja",
            (
                f"usuario={_actor_username(request.user)} accion=actualizar_fondo_caja_predeterminado "
                f"valor_anterior={valor_anterior or 'vacio'} valor_nuevo={fondo} "
                f"cambio={'1' if str(valor_anterior) != str(fondo) else '0'}"
            ),
        )
        return redirect("ui:caja_gestion")

    dia_actual = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    sesion_actual = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()
    sesiones_del_dia = []
    total_dia = Decimal("0.00")
    
    if dia_actual:
        sesiones = SesionCaja.objects.filter(dia=dia_actual).order_by("fecha_apertura")
        for s in sesiones:
            t_turno = s.facturas.filter(estado="pagada").aggregate(Sum('total'))['total__sum'] or Decimal("0.00")
            sesiones_del_dia.append({
                "sesion": s,
                "total": t_turno
            })
            total_dia += t_turno
    
    # Obtener fondo de caja predeterminado
    fondo_caja_obj = ConfiguracionTPV.objects.filter(clave="fondo_caja_predeterminado").first()
    fondo_caja = fondo_caja_obj.valor if (fondo_caja_obj and fondo_caja_obj.valor) else "0.00"

    return render(request, "ui/caja/gestion.html", {
        "dia_actual": dia_actual,
        "sesion_actual": sesion_actual,
        "sesiones_del_dia": sesiones_del_dia,
        "total_dia": total_dia,
        "fondo_caja_predeterminado": fondo_caja,
        "fecha_hoy": timezone.now(),
    })


@login_required
def caja_estadisticas(request):
    _require_any_permission_or_403(request, "view_cash_reports", "manage_cash")
    hoy = timezone.now().date()
    hace_14_dias = hoy - timedelta(days=13)
    inicio_mes = hoy.replace(day=1)

    # 1. Métricas de Hoy
    stats_hoy = Factura.objects.filter(
        emitida_a__date=hoy, 
        estado__in=[Factura.ESTADO_EMITIDA, Factura.ESTADO_PAGADA]
    ).aggregate(
        total=Sum('total'),
        count=Count('id')
    )
    total_hoy = stats_hoy['total'] or 0
    tickets_hoy = stats_hoy['count'] or 0
    media_hoy = total_hoy / tickets_hoy if tickets_hoy > 0 else 0

    # 2. Métricas de Mes
    total_mes = Factura.objects.filter(
        emitida_a__date__gte=inicio_mes,
        estado__in=[Factura.ESTADO_EMITIDA, Factura.ESTADO_PAGADA]
    ).aggregate(Sum('total'))['total__sum'] or 0

    # 3. Ventas por Método de Pago (Hoy)
    pagos_metodo = Factura.objects.filter(
        emitida_a__date=hoy,
        estado__in=[Factura.ESTADO_EMITIDA, Factura.ESTADO_PAGADA]
    ).values('tipo_pago').annotate(total=Sum('total'))
    
    label_pagos = [p['tipo_pago'].capitalize() for p in pagos_metodo]
    data_pagos = [float(p['total']) for p in pagos_metodo]

    # 4. Top 5 Productos (Mes)
    top_productos_qs = LineaComanda.objects.filter(
        comanda__cerrada_a__date__gte=inicio_mes,
        anulado=False
    ).values('producto_nombre').annotate(
        total_qty=Sum('cantidad')
    ).order_by('-total_qty')[:5]
    
    label_productos = [p['producto_nombre'] for p in top_productos_qs]
    data_productos = [p['total_qty'] for p in top_productos_qs]

    # 5. Ventas por Categoría (Hoy)
    ventas_categoria_qs = LineaComanda.objects.filter(
        comanda__cerrada_a__date=hoy,
        anulado=False
    ).values('producto__departamento__nombre').annotate(
        total_eur=Sum(F('cantidad') * F('precio_unitario'))
    ).order_by('-total_eur')
    
    label_cat = [v['producto__departamento__nombre'] or "Sin Categoría" for v in ventas_categoria_qs]
    data_cat = [float(v['total_eur']) for v in ventas_categoria_qs]

    # 6. Tendencia 14 días
    tendencia_qs = Factura.objects.filter(
        emitida_a__date__gte=hace_14_dias,
        estado__in=[Factura.ESTADO_EMITIDA, Factura.ESTADO_PAGADA]
    ).extra(select={'day': "date(emitida_a)"}).values('day').annotate(total=Sum('total')).order_by('day')
    
    # Rellenar huecos si no hay ventas algún día
    labels_tendencia = []
    data_tendencia = []
    dict_tendencia = {str(t['day']): float(t['total']) for t in tendencia_qs}
    
    for i in range(14):
        d = hace_14_dias + timedelta(days=i)
        d_str = d.strftime('%Y-%m-%d')
        labels_tendencia.append(d.strftime('%d/%m'))
        data_tendencia.append(dict_tendencia.get(d_str, 0))

    context = {
        "total_hoy": total_hoy,
        "tickets_hoy": tickets_hoy,
        "media_hoy": media_hoy,
        "total_mes": total_mes,
        "chart_pagos": json.dumps({"labels": label_pagos, "data": data_pagos}),
        "chart_productos": json.dumps({"labels": label_productos, "data": data_productos}),
        "chart_categorias": json.dumps({"labels": label_cat, "data": data_cat}),
        "chart_tendencia": json.dumps({"labels": labels_tendencia, "data": data_tendencia}),
    }
    
    return render(request, "ui/caja/estadisticas.html", context)


@login_required
@require_POST
def api_dia_abrir(request):
    if not has_app_permission(request.user, "manage_cash"):
        return _forbidden_json(request, "manage_cash")
    if DiaContable.objects.filter(fecha_cierre__isnull=True).exists():
        log_warn(
            "caja.jornada",
            f"usuario={_actor_username(request.user)} accion=abrir_jornada_bloqueado motivo=ya_existe_jornada_abierta",
        )
        return JsonResponse({"ok": False, "error": "Ya hay un dia abierto."}, status=400)

    dia = DiaContable.objects.create(abierta_por=request.user)
    log_info(
        "caja.jornada",
        f"usuario={_actor_username(request.user)} accion=abrir_jornada dia_id={dia.id}",
    )
    return JsonResponse({"ok": True})


@login_required
@require_POST
def api_dia_cerrar(request):
    if not has_app_permission(request.user, "manage_cash"):
        return _forbidden_json(request, "manage_cash")
    dia = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    if not dia:
        log_warn(
            "caja.jornada",
            f"usuario={_actor_username(request.user)} accion=cerrar_jornada_bloqueado motivo=no_hay_jornada_abierta",
        )
        return JsonResponse({"ok": False, "error": "No hay ningun dia abierto."}, status=400)

    efectivo_real = None
    try:
        import json
        data = json.loads(request.body)
        ef_val = data.get("efectivo_final_real")
        if ef_val is not None:
            efectivo_real = Decimal(str(ef_val))
    except Exception:
        pass

    sesion_abierta = SesionCaja.objects.filter(dia=dia, fecha_cierre__isnull=True).first()
    if sesion_abierta:
        sesion_abierta.fecha_cierre = timezone.now()
        sesion_abierta.cerrada_por = request.user
        if efectivo_real is not None:
            sesion_abierta.efectivo_final_real = efectivo_real
            sesion_abierta.observaciones = "[CIERRE MANUAL POR FIN DE JORNADA]"
        else:
            sesion_abierta.efectivo_final_real = sesion_abierta.efectivo_inicial
            sesion_abierta.observaciones = "[CIERRE AUTOMATICO POR FIN DE JORNADA]"
        sesion_abierta.save()

    dia.fecha_cierre = timezone.now()
    dia.cerrado_por = request.user
    dia.save(update_fields=["fecha_cierre", "cerrado_por"])
    sesion_id = sesion_abierta.id if sesion_abierta else "none"
    cierre_turno = "manual" if efectivo_real is not None else "automatico"
    log_info(
        "caja.jornada",
        (
            f"usuario={_actor_username(request.user)} accion=cerrar_jornada dia_id={dia.id} "
            f"sesion_cerrada={sesion_id} cierre_turno={cierre_turno} "
            f"efectivo_final_real={efectivo_real if efectivo_real is not None else 'auto'}"
        ),
    )

    from django.urls import reverse
    print_url = request.build_absolute_uri(reverse("ui:ticket_cierre_dia", args=[dia.id]))

    return JsonResponse({"ok": True, "print_url": print_url})


@login_required
@require_POST
def api_caja_abrir(request):
    if not has_app_permission(request.user, "manage_cash"):
        return _forbidden_json(request, "manage_cash")
    dia = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    if not dia:
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=abrir_turno_bloqueado motivo=no_hay_jornada_abierta",
        )
        return JsonResponse({"ok": False, "error": "No hay ningun dia abierto para abrir caja."}, status=400)
    if SesionCaja.objects.filter(fecha_cierre__isnull=True).exists():
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=abrir_turno_bloqueado motivo=ya_existe_turno_abierto",
        )
        return JsonResponse({"ok": False, "error": "Ya hay una sesion de caja abierta."}, status=400)

    try:
        data = json.loads(request.body)
        efectivo_inicial = Decimal(str(data.get("efectivo_inicial", "0.00")))
    except Exception:
        efectivo_inicial = Decimal("0.00")

    sesion = SesionCaja.objects.create(
        dia=dia,
        abierta_por=request.user,
        efectivo_inicial=efectivo_inicial,
    )
    log_info(
        "caja.turno",
        f"usuario={_actor_username(request.user)} accion=abrir_turno sesion_id={sesion.id} dia_id={dia.id} efectivo_inicial={efectivo_inicial}",
    )
    return JsonResponse({"ok": True})


@login_required
@require_POST
def api_caja_cerrar(request):
    if not has_app_permission(request.user, "manage_cash"):
        return _forbidden_json(request, "manage_cash")
    sesion = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()
    if not sesion:
        log_warn(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=cerrar_turno_bloqueado motivo=no_hay_turno_abierto",
        )
        return JsonResponse({"ok": False, "error": "No hay ninguna sesion de caja abierta."}, status=400)

    try:
        data = json.loads(request.body)
        ef_parsed = data.get("efectivo_final_real")
        efectivo_real = Decimal(str(ef_parsed)) if ef_parsed is not None and str(ef_parsed).strip() != "" else None
        observaciones = data.get("observaciones", "")
    except Exception as e:
        log_error(
            "caja.turno",
            f"usuario={_actor_username(request.user)} accion=cerrar_turno_error sesion_id={sesion.id}",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": "Datos invalidos."}, status=400)

    sesion.fecha_cierre = timezone.now()
    sesion.cerrada_por = request.user
    sesion.efectivo_final_real = efectivo_real
    sesion.observaciones = observaciones
    sesion.save()
    observaciones_len = len((observaciones or "").strip())
    log_info(
        "caja.turno",
        (
            f"usuario={_actor_username(request.user)} accion=cerrar_turno sesion_id={sesion.id} "
            f"efectivo_final_real={efectivo_real if efectivo_real is not None else 'none'} "
            f"observaciones_len={observaciones_len}"
        ),
    )

    from django.urls import reverse
    print_url = request.build_absolute_uri(reverse("ui:ticket_cierre_turno", args=[sesion.id]))
    return JsonResponse({"ok": True, "print_url": print_url})


@login_required
@require_POST
def api_caja_movimiento(request):
    if not has_app_permission(request.user, "manage_cash"):
        return _forbidden_json(request, "manage_cash")
    from tpvapp.models import MovimientoCaja

    sesion = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()
    if not sesion:
        log_warn(
            "caja.movimientos",
            f"usuario={_actor_username(request.user)} accion=movimiento_bloqueado motivo=no_hay_turno_abierto",
        )
        return JsonResponse({"ok": False, "error": "No hay un turno abierto para registrar el movimiento."}, status=400)

    try:
        data = json.loads(request.body)
        tipo = data.get("tipo")
        importe = data.get("importe")
        concepto = data.get("concepto")

        if tipo not in ["entrada", "salida"]:
            log_warn(
                "caja.movimientos",
                f"usuario={_actor_username(request.user)} accion=movimiento_bloqueado sesion_id={sesion.id} motivo=tipo_invalido tipo={tipo}",
            )
            return JsonResponse({"ok": False, "error": "Tipo invalido."}, status=400)

        importe_dec = Decimal(str(importe))
        if importe_dec <= 0:
            log_warn(
                "caja.movimientos",
                f"usuario={_actor_username(request.user)} accion=movimiento_bloqueado sesion_id={sesion.id} motivo=importe_invalido importe={importe}",
            )
            return JsonResponse({"ok": False, "error": "Importe invalido."}, status=400)
        if not concepto:
            log_warn(
                "caja.movimientos",
                f"usuario={_actor_username(request.user)} accion=movimiento_bloqueado sesion_id={sesion.id} motivo=concepto_vacio",
            )
            return JsonResponse({"ok": False, "error": "Concepto requerido."}, status=400)

        movimiento = MovimientoCaja.objects.create(
            sesion=sesion,
            usuario=request.user,
            tipo=tipo,
            importe=importe_dec,
            concepto=concepto,
        )
        log_info(
            "caja.movimientos",
            f"usuario={_actor_username(request.user)} accion=registrar_movimiento movimiento_id={movimiento.id} sesion_id={sesion.id} tipo={tipo} importe={importe_dec} concepto={concepto}",
        )
        return JsonResponse({"ok": True})
    except Exception as e:
        log_error(
            "caja.movimientos",
            f"usuario={_actor_username(request.user)} accion=registrar_movimiento_error sesion_id={sesion.id}",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
@require_POST
def api_configuracion_update(request):
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
    """Actualiza una clave de configuracion."""
    try:
        data = json.loads(request.body)
        clave = data.get("clave")
        valor = data.get("valor")

        if not clave:
            log_warn(
                "configuracion.ui",
                f"usuario={_actor_username(request.user)} accion=actualizar_bloqueado motivo=clave_vacia",
            )
            return JsonResponse({"ok": False, "error": "Falta la clave."}, status=400)

        actual = ConfiguracionTPV.objects.filter(clave=clave).first()
        valor_anterior = actual.valor if actual else ""
        _, created = ConfiguracionTPV.objects.update_or_create(
            clave=clave,
            defaults={"valor": str(valor)},
        )
        log_info(
            "configuracion.ui",
            (
                f"usuario={_actor_username(request.user)} accion=actualizar clave={clave} "
                f"valor_anterior={valor_anterior or 'vacio'} valor_nuevo={valor} "
                f"creado={'1' if created else '0'} cambio={'1' if str(valor_anterior) != str(valor) else '0'}"
            ),
        )
        return JsonResponse({"ok": True})
    except Exception as e:
        log_error(
            "configuracion.ui",
            f"usuario={_actor_username(request.user)} accion=actualizar_error",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
def caja_facturas(request):
    _require_any_permission_or_403(request, "process_payments", "view_cash_reports")
    return render(request, "ui/caja/facturas.html", _facturas_emitidas_context())

