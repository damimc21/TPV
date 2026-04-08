import json
from django.shortcuts import render, redirect, get_object_or_404
from django.http import Http404, JsonResponse, HttpResponseBadRequest
from decimal import Decimal
from django.views.decorators.http import require_POST, require_http_methods
from django.contrib.auth.decorators import login_required
from .models import TPVMap, TPVMapItem
from tpvapp.models import Factura, Pago, SesionCaja, DiaContable, ConfiguracionTPV
from django.db.models import Sum
from django.utils import timezone


# Create your views here.
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
    return render(request, "ui/caja/reaperturas.html")

@login_required
def caja_cierres(request):
    return render(request, "ui/caja/cierres.html")

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

@login_required
def caja_estadisticas(request):
    return render(request, "ui/caja/estadisticas.html")


# =========================
#      API CAJA
# =========================

@login_required
@require_POST
def api_dia_abrir(request):
    if DiaContable.objects.filter(fecha_cierre__isnull=True).exists():
        return JsonResponse({"ok": False, "error": "Ya hay un día abierto."}, status=400)
    DiaContable.objects.create(abierta_por=request.user)
    return JsonResponse({"ok": True})

@login_required
@require_POST
def api_dia_cerrar(request):
    dia = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    if not dia:
        return JsonResponse({"ok": False, "error": "No hay ningún día abierto."}, status=400)
    
    # Cerrar sesión de caja activa si existe (Cierre automático)
    sesion_abierta = SesionCaja.objects.filter(dia=dia, fecha_cierre__isnull=True).first()
    if sesion_abierta:
        sesion_abierta.fecha_cierre = timezone.now()
        sesion_abierta.cerrada_por = request.user
        # Como es cierre forzado de día, usamos el inicial como real si no hay arqueo previo
        sesion_abierta.efectivo_final_real = sesion_abierta.efectivo_inicial
        sesion_abierta.observaciones = "[CIERRE AUTOMÁTICO POR FIN DE JORNADA]"
        sesion_abierta.save()

    dia.fecha_cierre = timezone.now()
    dia.cerrado_por = request.user
    dia.save(update_fields=["fecha_cierre", "cerrado_por"])
    return JsonResponse({"ok": True})

@login_required
@require_POST
def api_caja_abrir(request):
    dia = DiaContable.objects.filter(fecha_cierre__isnull=True).first()
    if not dia:
        return JsonResponse({"ok": False, "error": "No hay ningún día abierto para abrir caja."}, status=400)
    if SesionCaja.objects.filter(fecha_cierre__isnull=True).exists():
        return JsonResponse({"ok": False, "error": "Ya hay una sesión de caja abierta."}, status=400)
    
    try:
        data = json.loads(request.body)
        efectivo_inicial = Decimal(str(data.get("efectivo_inicial", "0.00")))
    except:
        efectivo_inicial = Decimal("0.00")
        
    SesionCaja.objects.create(
        dia=dia,
        abierta_por=request.user,
        efectivo_inicial=efectivo_inicial
    )
    return JsonResponse({"ok": True})

@login_required
@require_POST
def api_caja_cerrar(request):
    sesion = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()
    if not sesion:
        return JsonResponse({"ok": False, "error": "No hay ninguna sesión de caja abierta."}, status=400)
    
    try:
        data = json.loads(request.body)
        efectivo_real = Decimal(str(data.get("efectivo_final_real", "0.00")))
        observaciones = data.get("observaciones", "")
    except:
        return JsonResponse({"ok": False, "error": "Datos inválidos."}, status=400)
        
    sesion.fecha_cierre = timezone.now()
    sesion.cerrada_por = request.user
    sesion.efectivo_final_real = efectivo_real
    sesion.observaciones = observaciones
    sesion.save()
    return JsonResponse({"ok": True})


@login_required
def albaranes_facturas(request):
    return render(request, "ui/albaranes_facturas/index.html")


@login_required
def config(request):
    return render(request, "ui/config/index.html")




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
    # Activar un mapa y desactivar los demás del usuario
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    TPVMap.objects.filter(owner=request.user, is_active=True).update(is_active=False)
    TPVMap.objects.filter(id=m.id).update(is_active=True)

    # Redirigir al TPV, que ya cargará el activo
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

    if map_id == 0:
        m = TPVMap.objects.create(owner=request.user, name=name, width=w, height=h)
        # Si es el primer mapa del usuario, lo activamos automáticamente
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

    return JsonResponse({"ok": True, "id": m.id})

@login_required
@require_http_methods(["POST"])
def api_map_activate(request, map_id: int):
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    TPVMap.objects.filter(owner=request.user, is_active=True).update(is_active=False)
    TPVMap.objects.filter(id=m.id).update(is_active=True)

    return JsonResponse({"ok": True, "active_id": m.id})

@login_required
@require_http_methods(["POST"])
def api_map_delete(request, map_id: int):
    m = get_object_or_404(TPVMap, id=map_id, owner=request.user)

    # Seguridad: no permitir borrar el mapa activo (evita dejar TPV sin “principal” por accidente)
    if m.is_active:
        return JsonResponse({"ok": False, "error": "No puedes borrar el mapa activo."}, status=400)

    m.delete()
    return JsonResponse({"ok": True})