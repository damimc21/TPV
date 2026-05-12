"""Vistas para la sección «maps».
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
def map_editor(request):
    _require_permission_or_403(request, "manage_configuration")
    return render(request, "ui/config/maps/map_editor.html")


@login_required
def maps_list(request):
    _require_permission_or_403(request, "manage_configuration")
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
    _require_permission_or_403(request, "manage_configuration")
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
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
    m = TPVMap.objects.filter(id=map_id, owner=request.user).first()
    if not m:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse(_map_to_dict(m))


@login_required
@require_http_methods(["GET"])
def api_maps_list(request):
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
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
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
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
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
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
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_json(request, "manage_configuration")
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

