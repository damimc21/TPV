"""Endpoints del bloque «logs» de la API de Ficheros."""
import csv
import io
import os
import shutil
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from functools import wraps
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db import connection
from django.db.models import Sum, Count, F, Q, Min
from django.http import JsonResponse, HttpResponse, FileResponse
from django.utils import timezone
from django.views.decorators.http import require_POST, require_GET
from tpvapp.models import (
    Producto, Departamento, BackupRegistro, LogSistema, EventoAuditoria,
    ArticuloInventario, CategoriaInventario, Proveedor, MovimientoStock,
    Factura, LineaComanda, Comanda, SesionCaja, DiaContable,
    MovimientoCaja, Pago, Cliente,
)
from tpvapp.auditoria import log_info, log_warn, log_error, registrar
from tpvapp.permissions import has_app_permission
from ._helpers import (
    User,
    BACKUP_DIR,
    IMPORT_HEADERS,
    _ui_audit_event_name,
    _get_csrf,
    _actor_username,
    _require_manage_files,
    _csv_response,
    _excel_col_name,
    _xlsx_response,
)

@login_required
@_require_manage_files
@require_GET
def logs_listar(request):
    """Lista logs del sistema con paginación y filtros."""
    page = int(request.GET.get("page", 1))
    per_page = int(request.GET.get("per_page", 30))
    q = request.GET.get("q", "")
    nivel = request.GET.get("nivel", "")
    origen = request.GET.get("origen", "")
    desde = request.GET.get("desde", "")
    hasta = request.GET.get("hasta", "")

    qs = LogSistema.objects.order_by("-fecha")

    if q:
        qs = qs.filter(Q(mensaje__icontains=q) | Q(origen__icontains=q))
    if nivel:
        qs = qs.filter(nivel=nivel)
    if origen:
        qs = qs.filter(origen=origen)
    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    total = qs.count()
    total_pages = max(1, (total + per_page - 1) // per_page)

    start = (page - 1) * per_page
    items = qs[start:start + per_page]

    data = {
        "items": [
            {
                "id": l.id,
                "fecha": l.fecha.strftime("%d/%m/%Y %H:%M:%S"),
                "nivel": l.nivel,
                "origen": l.origen,
                "mensaje": l.mensaje,
                "traza": l.traza if l.traza else "",
            }
            for l in items
        ],
        "total": total,
        "total_pages": total_pages,
        "page": page,
    }
    return JsonResponse(data)


@login_required
@_require_manage_files
@require_GET
def logs_detalle(request, log_id):
    """Devuelve el detalle de un log específico."""
    try:
        log = LogSistema.objects.get(id=log_id)
        return JsonResponse({
            "id": log.id,
            "fecha": log.fecha.strftime("%d/%m/%Y %H:%M:%S"),
            "nivel": log.nivel,
            "origen": log.origen,
            "mensaje": log.mensaje,
            "traza": log.traza or log.mensaje,
        })
    except LogSistema.DoesNotExist:
        return JsonResponse({"error": "Log no encontrado"}, status=404)


@login_required
@_require_manage_files
@require_GET
def logs_exportar(request):
    """Exporta logs del sistema en CSV/XLSX o devuelve JSON."""
    q = request.GET.get("q", "")
    nivel = request.GET.get("nivel", "")
    origen = request.GET.get("origen", "")
    desde = request.GET.get("desde", "")
    hasta = request.GET.get("hasta", "")
    formato = request.GET.get("format", "csv").lower()

    qs = LogSistema.objects.order_by("-fecha")

    if q:
        qs = qs.filter(Q(mensaje__icontains=q) | Q(origen__icontains=q))
    if nivel:
        qs = qs.filter(nivel=nivel)
    if origen:
        qs = qs.filter(origen=origen)
    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    headers = ['Fecha', 'Nivel', 'Origen', 'Mensaje', 'Traza']
    rows = []
    for l in qs:
        rows.append([
            l.fecha.strftime("%d/%m/%Y %H:%M:%S"),
            l.nivel,
            l.origen,
            l.mensaje,
            l.traza or "",
        ])

    if formato == "json":
        return JsonResponse({"headers": headers, "rows": rows})
    if formato == "xlsx":
        return _xlsx_response("logs_sistema.xlsx", headers, rows)
    return _csv_response("logs_sistema.csv", headers, rows)


@login_required
@_require_manage_files
@require_GET
def logs_origenes(request):
    """Lista origenes para el filtro de logs."""
    origenes = (
        LogSistema.objects.exclude(origen__isnull=True)
        .exclude(origen__exact="")
        .values_list("origen", flat=True)
        .distinct()
        .order_by("origen")
    )
    return JsonResponse(list(origenes), safe=False)


@login_required
@_require_manage_files
@require_GET
def logs_rango(request):
    """Devuelve la fecha minima disponible en logs del sistema."""
    min_dt = LogSistema.objects.aggregate(v=Min("fecha"))["v"]
    min_date = min_dt.date().isoformat() if min_dt else None
    return JsonResponse({"min_date": min_date})


@login_required
@require_POST
def logs_ui_evento(request):
    """
    Recibe eventos ligeros de UI para trazabilidad (ej. cambio de tema).
    """
    try:
        data = json.loads(request.body or "{}")
        evento = str(data.get("evento") or "").strip().lower()
        detalle = str(data.get("detalle") or "").strip()
        origen = str(data.get("origen") or "ui").strip()[:100] or "ui"
        nivel = str(data.get("nivel") or "INFO").strip().upper()

        if not evento:
            return JsonResponse({"ok": False, "error": "evento requerido"}, status=400)

        audit_event = _ui_audit_event_name(evento)
        audit_details = f"origen={origen} nivel={nivel}"
        if detalle:
            audit_details += f" detalle={detalle}"
        registrar(request.user if getattr(request.user, "is_authenticated", False) else None, audit_event, audit_details)

        username = _actor_username(request)
        message = f"usuario={username} evento={evento}"
        if detalle:
            message += f" detalle={detalle}"

        if nivel == "WARN":
            log_warn(origen, message)
        elif nivel in ("ERROR", "CRITICAL"):
            log_error(origen, message)
        else:
            log_info(origen, message)

        return JsonResponse({"ok": True})
    except Exception as e:
        log_error(
            "ui.eventos",
            f"usuario={_actor_username(request)} accion=registrar_evento_ui_error",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=400)


@login_required
@_require_manage_files
@require_POST
def logs_limpiar(request):
    """Elimina logs con más de 30 días de antigüedad."""
    try:
        limite = timezone.now() - timedelta(days=30)
        result = LogSistema.objects.filter(fecha__lt=limite).delete()
        eliminados = result[0] if result else 0
        log_warn(
            "logs.sistema",
            f"usuario={_actor_username(request)} accion=limpiar_logs eliminados={eliminados}",
        )
        return JsonResponse({"ok": True, "eliminados": eliminados})
    except Exception as e:
        log_error(
            "logs.sistema",
            f"usuario={_actor_username(request)} accion=limpiar_logs_error",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=500)

