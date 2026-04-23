import json
import math
from django.shortcuts import render, redirect, get_object_or_404
from django.http import Http404, JsonResponse, HttpResponseBadRequest
from decimal import Decimal
from django.views.decorators.http import require_POST, require_http_methods
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from .models import TPVMap, TPVMapItem
from tpvapp.models import Factura, Pago, SesionCaja, DiaContable, ConfiguracionTPV, LineaComanda, Comanda
from tpvapp.auditoria import log_info, log_warn, log_error
from tpvapp.auth_security import (
    get_auth_security_config,
    get_client_ip,
    get_login_block,
    save_auth_security_config,
)
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext as _


# Create your views here.
def _actor_username(user):
    return user.username if getattr(user, "is_authenticated", False) else "anon"


class TpvLoginView(LoginView):
    template_name = "ui/auth/login.html"
    redirect_authenticated_user = True

    def post(self, request, *args, **kwargs):
        username = (request.POST.get("username") or "").strip()
        block = get_login_block(request, username)
        if block["blocked"]:
            form = self.get_form()
            if block["reason"] == "user_lock_permanent":
                form.add_error(
                    None,
                    _("Acceso bloqueado para este usuario hasta desbloqueo manual de administrador."),
                )
            elif block["reason"] == "user_lock":
                mins = max(1, math.ceil(max(1, block["retry_after"]) / 60))
                form.add_error(
                    None,
                    _("Acceso temporalmente bloqueado para este usuario. Intenta de nuevo en %(mins)s minuto(s).")
                    % {"mins": mins},
                )
            else:
                wait = max(1, int(block["retry_after"]))
                form.add_error(
                    None,
                    _("Demasiados intentos fallidos. Espera %(seconds)s segundos para volver a intentarlo.")
                    % {"seconds": wait},
                )
            log_warn(
                "auth.login_blocked",
                f"usuario_intento={username or 'unknown'} motivo={block['reason']} retry_after={block['retry_after']}s ip={get_client_ip(request)}",
            )
            return self.form_invalid(form)
        return super().post(request, *args, **kwargs)


def index(request):
    return render(request, "ui/home/index.html")


@login_required
def tpv(request):
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
    ctx = _get_report_data(dia=dia)
    return render(request, "ui/tpv/ticket_cierre.html", ctx)

@login_required
def ticket_cierre_turno(request, sesion_id):
    sesion = get_object_or_404(SesionCaja, id=sesion_id)
    ctx = _get_report_data(sesion=sesion)
    return render(request, "ui/tpv/ticket_cierre.html", ctx)

@login_required
def comprobante(request, comanda_id):
    from tpvapp.models import Comanda
    from tpvapp.services import imprimir_comprobante
    comanda = get_object_or_404(Comanda, id=comanda_id)
    try:
        imprimir_comprobante(comanda, request.user)
    except Exception as e:
        print(f"Error al marcar comprobante como impreso: {e}")
    
    return render(request, "ui/tpv/ticket.html", {"comanda_provisional": comanda})

# CARD VIEWS
@login_required
def ficheros(request):
    return render(request, "ui/ficheros/index.html")


@login_required
def ficheros_importar(request):
    return render(request, "ui/ficheros/importar.html")


@login_required
def ficheros_exportar(request):
    return render(request, "ui/ficheros/exportar.html")


@login_required
def ficheros_backups(request):
    from tpvapp.models import BackupRegistro, ConfiguracionTPV
    backups = BackupRegistro.objects.all()[:50]
    
    # Obtener configuración de autobackup
    auto_cfg = ConfiguracionTPV.objects.filter(clave="backup_auto_intervalo").first()
    auto_intervalo = auto_cfg.valor if auto_cfg else "0"  # 0 = deshabilitado
    
    return render(request, "ui/ficheros/backups.html", {
        "backups": backups,
        "auto_intervalo": auto_intervalo,
    })


@login_required
def ficheros_informes(request):
    return render(request, "ui/ficheros/informes.html")


@login_required
def ficheros_auditoria(request):
    return render(request, "ui/ficheros/auditoria.html")


@login_required
def ficheros_logs(request):
    return render(request, "ui/ficheros/logs.html")


@login_required
def catalogo(request):
    return render(request, "ui/catalogo/index.html")


@login_required
def catalogo_articulos(request):
    return render(request, "ui/catalogo/catalogo.html")


@login_required
def catalogo_modificadores(request):
    return render(request, "ui/catalogo/modificadores.html")


@login_required
def stock(request):
    return render(request, "ui/stock/index.html")


@login_required
def caja(request):
    return render(request, "ui/caja/index.html")




@login_required
def caja_reaperturas(request):
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
    """Vista para abrir/cerrar el día y la caja."""
    
    if request.method == "POST" and "fondo_caja" in request.POST:
        # Guardar parámetro
        fondo = request.POST.get("fondo_caja", "0.00")
        ConfiguracionTPV.objects.update_or_create(
            clave="fondo_caja_predeterminado",
            defaults={"valor": fondo, "descripcion": "Fondo de caja inicial por defecto"}
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

from django.db.models import Sum, Count, F
from django.utils import timezone
from datetime import timedelta
import json

@login_required
def caja_estadisticas(request):
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


# =========================
#      API CAJA
# =========================

@login_required
@require_POST
def api_dia_abrir(request):
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
    log_info(
        "caja.jornada",
        f"usuario={_actor_username(request.user)} accion=cerrar_jornada dia_id={dia.id}",
    )

    from django.urls import reverse
    print_url = request.build_absolute_uri(reverse("ui:ticket_cierre_dia", args=[dia.id]))

    return JsonResponse({"ok": True, "print_url": print_url})

@login_required
@require_POST
def api_caja_abrir(request):
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
    log_info(
        "caja.turno",
        f"usuario={_actor_username(request.user)} accion=cerrar_turno sesion_id={sesion.id} efectivo_final_real={efectivo_real}",
    )

    from django.urls import reverse
    print_url = request.build_absolute_uri(reverse("ui:ticket_cierre_turno", args=[sesion.id]))
    return JsonResponse({"ok": True, "print_url": print_url})

@login_required
@require_POST
def api_caja_movimiento(request):
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
            return JsonResponse({"ok": False, "error": "Tipo invalido."}, status=400)

        importe_dec = Decimal(str(importe))
        if importe_dec <= 0:
            return JsonResponse({"ok": False, "error": "Importe invalido."}, status=400)
        if not concepto:
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
    """Actualiza una clave de configuracion."""
    try:
        data = json.loads(request.body)
        clave = data.get("clave")
        valor = data.get("valor")

        if not clave:
            return JsonResponse({"ok": False, "error": "Falta la clave."}, status=400)

        ConfiguracionTPV.objects.update_or_create(
            clave=clave,
            defaults={"valor": str(valor)},
        )
        log_info(
            "configuracion.ui",
            f"usuario={_actor_username(request.user)} accion=actualizar clave={clave} valor={valor}",
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
def albaranes_facturas(request):
    return render(request, "ui/albaranes_facturas/index.html")


@login_required
def config(request):
    return render(request, "ui/config/index.html")


def _post_bool(post, key):
    return post.get(key) in ("1", "on", "true", "True")


@login_required
def config_seguridad(request):
    saved = False
    if request.method == "POST":
        rules = []
        raw_json = request.POST.get("throttle_rules_json")
        if raw_json:
            try:
                parsed = json.loads(raw_json)
                if isinstance(parsed, list):
                    for row in parsed:
                        rules.append(
                            {
                                "attempts": row.get("attempts"),
                                "seconds": row.get("seconds"),
                            }
                        )
            except Exception:
                rules = []

        values = {
            "enabled": _post_bool(request.POST, "enabled"),
            "throttle_rules": rules,
            "user_lock_mode": request.POST.get("user_lock_mode", "none"),
            "user_lock_attempts": request.POST.get("user_lock_attempts"),
            "user_lock_seconds": request.POST.get("user_lock_seconds"),
        }
        cfg = save_auth_security_config(values)
        saved = True
        log_info(
            "auth.config",
            (
                f"usuario={_actor_username(request.user)} accion=actualizar_seguridad_login "
                f"enabled={cfg['enabled']} rules={cfg['throttle_rules']} "
                f"user_lock_mode={cfg['user_lock_mode']} user_lock_attempts={cfg['user_lock_attempts']} "
                f"user_lock_seconds={cfg['user_lock_seconds']}"
            ),
        )
    else:
        cfg = get_auth_security_config()

    return render(
        request,
        "ui/config/seguridad.html",
        {
            "cfg": cfg,
            "saved": saved,
        },
    )

@login_required
def config_impresoras(request):
    from tpvapp.models import Impresora
    impresoras = Impresora.objects.all().order_by('nombre')
    return render(request, "ui/config/impresoras.html", {"impresoras": impresoras})

def ayuda(request):
    return render(request, "ui/ayuda/index.html")


# CONFIG VIEWS
@login_required
def map_editor(request):
    return render(request, "ui/config/maps/map_editor.html")


@login_required
def maps_list(request):
    # Listar mapas del usuario y saber cuál está activo
    maps = TPVMap.objects.filter(owner=request.user).order_by("-updated_at")
    active = maps.filter(is_active=True).first()
    return render(request, "ui/config/maps/maps_list.html", {
        "maps": maps,
        "active_map_id": active.id if active else None,
    })


@login_required
@require_POST
def activate_map(request, map_id: int):
    # Activar un mapa y desactivar los demas del usuario
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    TPVMap.objects.filter(owner=request.user, is_active=True).update(is_active=False)
    TPVMap.objects.filter(id=m.id).update(is_active=True)
    log_info(
        "config.mapas",
        f"usuario={_actor_username(request.user)} accion=activar_mapa mapa_id={m.id} nombre={m.name}",
    )

    # Redirigir al TPV, que ya cargara el activo
    return redirect("ui:tpv")


######################################
#   API VIEWS para mapas (GET/POST)  #
######################################
def _map_to_dict(m: TPVMap):
    return {
        "id": m.id,
        "name": m.name,
        "size": {"w": m.width, "h": m.height},
        "items": [
            {
                "id": str(it.id),
                "type": it.type,
                "x": it.x,
                "y": it.y,
                "rotation": it.rotation,
                "data": it.data or {},
                "z": it.z_index,
            }
            for it in m.items.order_by("z_index", "id")
        ],
    }

@login_required
@require_http_methods(["GET"])
def api_map_get(request, map_id: int):
    m = TPVMap.objects.filter(id=map_id, owner=request.user).first()
    if not m:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse(_map_to_dict(m))

@login_required
@require_http_methods(["GET"])
def api_maps_list(request):
    qs = TPVMap.objects.filter(owner=request.user).order_by("-updated_at")
    data = [{
        "id": m.id,
        "name": m.name,
        "is_active": m.is_active,
        "items_count": m.items.count(),
        "updated_at": m.updated_at.isoformat(),
    } for m in qs]
    return JsonResponse({"maps": data})

@login_required
@require_http_methods(["POST"])
def api_map_save(request, map_id: int):
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return HttpResponseBadRequest("Invalid JSON")

    name = (payload.get("name") or "").strip()
    size = payload.get("size") or {}
    w = int(size.get("w") or 1920)
    h = int(size.get("h") or 1080)
    items = payload.get("items") or []

    if not name:
        return HttpResponseBadRequest("Missing name")

    accion = "crear" if map_id == 0 else "editar"
    if map_id == 0:
        m = TPVMap.objects.create(owner=request.user, name=name, width=w, height=h)
        if not TPVMap.objects.filter(owner=request.user, is_active=True).exists():
            TPVMap.objects.filter(id=m.id).update(is_active=True)
    else:
        m = TPVMap.objects.filter(id=map_id, owner=request.user).first()
        if not m:
            return JsonResponse({"error": "not_found"}, status=404)
        m.name = name
        m.width = w
        m.height = h
        m.save(update_fields=["name", "width", "height", "updated_at"])
        m.items.all().delete()

    bulk = []
    for idx, it in enumerate(items):
        bulk.append(TPVMapItem(
            map=m,
            type=str(it.get("type") or ""),
            x=float(it.get("x") or 0),
            y=float(it.get("y") or 0),
            rotation=int(it.get("rotation") or 0),
            data=it.get("data") or {},
            z_index=int(it.get("z") if it.get("z") is not None else idx),
        ))
    TPVMapItem.objects.bulk_create(bulk)

    log_info(
        "config.mapas",
        f"usuario={_actor_username(request.user)} accion={accion}_mapa mapa_id={m.id} nombre={m.name} elementos={len(items)}",
    )

    return JsonResponse({"ok": True, "id": m.id})

@login_required
@require_http_methods(["POST"])
def api_map_activate(request, map_id: int):
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    TPVMap.objects.filter(owner=request.user, is_active=True).update(is_active=False)
    TPVMap.objects.filter(id=m.id).update(is_active=True)
    log_info(
        "config.mapas",
        f"usuario={_actor_username(request.user)} accion=activar_mapa_api mapa_id={m.id} nombre={m.name}",
    )

    return JsonResponse({"ok": True, "active_id": m.id})

@login_required
@require_http_methods(["POST"])
def api_map_delete(request, map_id: int):
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    if m.is_active:
        log_warn(
            "config.mapas",
            f"usuario={_actor_username(request.user)} accion=eliminar_mapa_bloqueado mapa_id={m.id} motivo=mapa_activo",
        )
        return JsonResponse({"ok": False, "error": "No puedes borrar el mapa activo."}, status=400)

    map_name = m.name
    m.delete()
    log_warn(
        "config.mapas",
        f"usuario={_actor_username(request.user)} accion=eliminar_mapa mapa_id={map_id} nombre={map_name}",
    )
    return JsonResponse({"ok": True})

