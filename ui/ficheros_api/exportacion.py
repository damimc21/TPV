"""Endpoints del bloque «exportacion» de la API de Ficheros."""
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
)







@login_required
@_require_manage_files
@require_GET
def exportar_productos(request):
    """Exporta productos del catalogo en CSV/XLSX o devuelve JSON."""
    qs = Producto.objects.select_related("departamento").all()

    estado = request.GET.get("estado")
    eliminados = request.GET.get("eliminados")
    depto_id = request.GET.get("departamento")
    formato = request.GET.get("format", "csv").lower()

    if not estado:
        estado = "active" if request.GET.get("activos") == "1" else "all"
    if eliminados in ("1", "true"):
        eliminados = "include"
    elif eliminados not in ("include", "only"):
        eliminados = "exclude"

    if estado == "active":
        qs = qs.filter(activo=True)
    elif estado == "inactive":
        qs = qs.filter(activo=False)

    if eliminados == "only":
        qs = qs.filter(eliminado=True)
    elif eliminados == "exclude":
        qs = qs.filter(eliminado=False)
    if depto_id:
        qs = qs.filter(departamento_id=depto_id)

    headers = [
        "nombre", "departamento", "precio", "activo", "eliminado",
        "nombre_factura", "nombre_comanda", "color_boton", "color_texto",
    ]
    rows = []
    visual_rows = []
    include_deleted_state = eliminados != "exclude"
    for p in qs.order_by("departamento__nombre", "nombre"):
        rows.append([
            p.nombre,
            p.departamento.nombre if p.departamento else "",
            str(p.precio),
            "1" if p.activo else "0",
            "1" if p.eliminado else "0",
            p.nombre_factura or "",
            p.nombre_comanda or "",
            p.color_boton or "",
            p.color_texto or "",
        ])
        visual_row = [
            p.nombre,
            p.departamento.nombre if p.departamento else "",
            str(p.precio),
            "Si" if p.activo else "No",
        ]
        if include_deleted_state:
            visual_row.append("Si" if p.eliminado else "No")
        visual_rows.append(visual_row)

    if formato == "json":
        pretty_headers = ["Nombre", "Departamento", "Precio", "Activo"]
        if include_deleted_state:
            pretty_headers.append("Eliminado")
        return JsonResponse({"headers": pretty_headers, "rows": visual_rows})
    if formato == "xlsx":
        return _xlsx_response("productos.xlsx", headers, rows)
    return _csv_response("productos.csv", headers, rows)


@login_required
@_require_manage_files
@require_GET
def exportar_inventario(request):
    """Exporta articulos de inventario en CSV/XLSX o devuelve JSON."""
    qs = ArticuloInventario.objects.select_related("categoria", "proveedor_ref").filter(activo=True)
    formato = request.GET.get("format", "csv").lower()

    headers = ["nombre", "categoria", "unidad", "stock_actual", "stock_minimo", "proveedor", "precio_compra"]
    rows = []
    for a in qs.order_by("categoria__nombre", "nombre"):
        rows.append([
            a.nombre,
            a.categoria.nombre if a.categoria else "",
            a.unidad,
            str(a.stock_actual),
            str(a.stock_minimo),
            a.proveedor_ref.nombre if a.proveedor_ref else a.proveedor,
            str(a.precio_compra),
        ])

    if formato == "json":
        pretty_headers = ["Nombre", "Categoria", "Unidad", "Stock actual", "Stock minimo", "Proveedor", "Precio compra"]
        return JsonResponse({"headers": pretty_headers, "rows": rows})
    if formato == "xlsx":
        return _xlsx_response("inventario.xlsx", headers, rows)
    return _csv_response("inventario.csv", headers, rows)

