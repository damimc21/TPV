"""Endpoints del bloque «auditoria» de la API de Ficheros."""
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
def auditoria_listar(request):
    """Lista eventos de auditoría con paginación y filtros."""
    page = int(request.GET.get("page", 1))
    per_page = int(request.GET.get("per_page", 30))
    q = request.GET.get("q", "")
    usuario_id = request.GET.get("usuario", "")
    evento = request.GET.get("evento", "")
    desde = request.GET.get("desde", "")
    hasta = request.GET.get("hasta", "")

    qs = EventoAuditoria.objects.select_related("usuario").order_by("-fecha")

    if q:
        qs = qs.filter(Q(evento__icontains=q) | Q(detalles__icontains=q))
    if usuario_id:
        qs = qs.filter(usuario_id=usuario_id)
    if evento:
        qs = qs.filter(evento=evento)
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
                "id": e.id,
                "fecha": e.fecha.strftime("%d/%m/%Y %H:%M:%S"),
                "usuario": e.usuario.username if e.usuario else None,
                "evento": e.evento,
                "detalles": e.detalles,
            }
            for e in items
        ],
        "total": total,
        "total_pages": total_pages,
        "page": page,
    }
    return JsonResponse(data)


@login_required
@_require_manage_files
@require_GET
def auditoria_usuarios(request):
    """Lista usuarios para el filtro de auditoría."""
    users = User.objects.filter(is_active=True).values("id", "username").order_by("username")
    return JsonResponse(list(users), safe=False)


@login_required
@_require_manage_files
@require_GET
def auditoria_eventos(request):
    """Lista tipos de evento para el filtro de auditoría."""
    eventos = (
        EventoAuditoria.objects.exclude(evento__isnull=True)
        .exclude(evento__exact="")
        .values_list("evento", flat=True)
        .distinct()
        .order_by("evento")
    )
    return JsonResponse(list(eventos), safe=False)


@login_required
@_require_manage_files
@require_GET
def auditoria_rango(request):
    """Devuelve la fecha mínima disponible en auditoría."""
    min_dt = EventoAuditoria.objects.aggregate(v=Min("fecha"))["v"]
    min_date = min_dt.date().isoformat() if min_dt else None
    return JsonResponse({"min_date": min_date})


@login_required
@_require_manage_files
@require_GET
def auditoria_exportar(request):
    """Exporta eventos de auditoría en CSV/XLSX o devuelve JSON."""
    q = request.GET.get("q", "")
    usuario_id = request.GET.get("usuario", "")
    evento = request.GET.get("evento", "")
    desde = request.GET.get("desde", "")
    hasta = request.GET.get("hasta", "")
    formato = request.GET.get("format", "csv").lower()

    qs = EventoAuditoria.objects.select_related("usuario").order_by("-fecha")

    if q:
        qs = qs.filter(Q(evento__icontains=q) | Q(detalles__icontains=q))
    if usuario_id:
        qs = qs.filter(usuario_id=usuario_id)
    if evento:
        qs = qs.filter(evento=evento)
    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    headers = ['Fecha', 'Usuario', 'Evento', 'Detalles']
    rows = []
    for e in qs:
        rows.append([
            e.fecha.strftime("%d/%m/%Y %H:%M:%S"),
            e.usuario.username if e.usuario else "—",
            e.evento,
            e.detalles,
        ])

    if formato == "json":
        return JsonResponse({"headers": headers, "rows": rows})
    if formato == "xlsx":
        return _xlsx_response("auditoria.xlsx", headers, rows)
    return _csv_response("auditoria.csv", headers, rows)

