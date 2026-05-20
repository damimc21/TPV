"""Endpoints del bloque «informes» de la API de Ficheros."""
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
from tpvapp import s3_utils
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
def informes_rango(request):
    """Devuelve fecha minima disponible (global o por tipo de informe)."""
    tipo = request.GET.get("tipo") or None
    valid_tipos = {"ventas", "stock", "turnos", "movimientos_caja", "clientes", "rankings"}
    if tipo and tipo not in valid_tipos:
        return JsonResponse({"error": f"Tipo de informe desconocido: {tipo}"}, status=400)

    min_dates = []
    values = []

    if tipo in (None, "ventas"):
        values.append(
            LineaComanda.objects.filter(anulado=False, comanda__cerrada_a__isnull=False).aggregate(v=Min("comanda__cerrada_a"))["v"]
        )
    if tipo in (None, "stock"):
        values.append(
            MovimientoStock.objects.filter(fecha__isnull=False).aggregate(v=Min("fecha"))["v"]
        )
    if tipo in (None, "turnos"):
        values.append(
            SesionCaja.objects.filter(fecha_apertura__isnull=False).aggregate(v=Min("fecha_apertura"))["v"]
        )
    if tipo in (None, "movimientos_caja"):
        values.append(
            MovimientoCaja.objects.filter(fecha__isnull=False).aggregate(v=Min("fecha"))["v"]
        )
    if tipo in (None, "clientes"):
        values.append(
            Cliente.objects.filter(fecha_registro__isnull=False).aggregate(v=Min("fecha_registro"))["v"]
        )
    if tipo in (None, "rankings"):
        values.append(
            LineaComanda.objects.filter(anulado=False, comanda__cerrada_a__isnull=False).aggregate(v=Min("comanda__cerrada_a"))["v"]
        )
        values.append(
            Factura.objects.filter(emitida_a__isnull=False).aggregate(v=Min("emitida_a"))["v"]
        )

    for value in values:
        if not value:
            continue
        as_date = value.date() if hasattr(value, "date") else value
        min_dates.append(as_date)

    if not min_dates:
        return JsonResponse({"min_date": None})

    return JsonResponse({"min_date": min(min_dates).isoformat()})


@login_required
@_require_manage_files
@require_GET
def exportar_informe(request, tipo):
    """
    Genera y descarga o previsualiza un informe segun el tipo solicitado.

    Ademas de devolver el archivo al navegador, guarda una copia en S3
    de forma asincrona (sin bloquear la descarga) bajo el prefijo informes/.
    """
    desde_str = request.GET.get("desde")
    hasta_str = request.GET.get("hasta")
    formato = request.GET.get("format", "csv")

    from datetime import datetime
    desde = datetime.strptime(desde_str, "%Y-%m-%d").date() if desde_str else None
    hasta = datetime.strptime(hasta_str, "%Y-%m-%d").date() if hasta_str else None

    if tipo == "ventas":
        headers, rows = _informe_ventas(desde, hasta)
    elif tipo == "stock":
        headers, rows = _informe_stock(desde, hasta)
    elif tipo == "turnos":
        headers, rows = _informe_turnos(desde, hasta)
    elif tipo == "movimientos_caja":
        headers, rows = _informe_movimientos_caja(desde, hasta)
    elif tipo == "clientes":
        headers, rows = _informe_clientes(desde, hasta)
    elif tipo == "rankings":
        headers, rows = _informe_rankings(desde, hasta)
    else:
        return JsonResponse({"error": f"Tipo de informe desconocido: {tipo}"}, status=400)

    if formato == "json":
        return JsonResponse({"headers": headers, "rows": rows})

    timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")

    if formato == "xlsx":
        filename = f"informe_{tipo}_{timestamp}.xlsx"
        response = _xlsx_response(filename, headers, rows)
        # Guardar copia en S3 de forma asincrona
        s3_key = f"{s3_utils.S3_PREFIX_INFORMES}{filename}"
        # Generamos el contenido xlsx en memoria para subirlo
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = tipo.capitalize()
        ws.append(headers)
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        s3_utils.upload_bytes_async(
            buf.getvalue(),
            s3_key,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        return response
    else:
        filename = f"informe_{tipo}_{timestamp}.csv"
        response = _csv_response(filename, headers, rows)
        # Guardar copia en S3 de forma asincrona
        s3_key = f"{s3_utils.S3_PREFIX_INFORMES}{filename}"
        buf = io.StringIO()
        import csv as csv_mod
        writer = csv_mod.writer(buf)
        writer.writerow(headers)
        writer.writerows(rows)
        s3_utils.upload_bytes_async(
            buf.getvalue().encode("utf-8"),
            s3_key,
            content_type="text/csv; charset=utf-8",
        )
        return response


def _informe_ventas(desde, hasta):
    qs = LineaComanda.objects.select_related(
        "comanda", "comanda__mesa", "comanda__usuario", "producto"
    ).filter(anulado=False)

    if desde:
        qs = qs.filter(comanda__cerrada_a__date__gte=desde)
    if hasta:
        qs = qs.filter(comanda__cerrada_a__date__lte=hasta)

    headers = ['Fecha', 'Mesa', 'Camarero', 'Producto', 'Cantidad', 'Precio Ud.', 'Descuento %', 'Total Línea']
    rows = []
    for l in qs.order_by("-comanda__cerrada_a"):
        fecha = l.comanda.cerrada_a.strftime("%d/%m/%Y %H:%M") if l.comanda.cerrada_a else ""
        mesa = l.comanda.mesa.nombre if l.comanda.mesa else "—"
        camarero = l.comanda.usuario.username if l.comanda.usuario else "—"
        total_linea = l.total
        rows.append([
            fecha, mesa, camarero, l.producto_nombre,
            l.cantidad, str(l.precio_unitario), str(l.descuento), str(total_linea)
        ])

    return headers, rows


def _informe_stock(desde, hasta):
    qs = MovimientoStock.objects.select_related("articulo", "producto", "usuario").all()

    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    headers = ['Fecha', 'Tipo', 'Artículo', 'Cantidad', 'Stock Anterior', 'Stock Nuevo', 'Motivo', 'Usuario']
    rows = []
    for m in qs.order_by("-fecha"):
        nombre = m.articulo.nombre if m.articulo else (m.producto.nombre if m.producto else "?")
        rows.append([
            m.fecha.strftime("%d/%m/%Y %H:%M"),
            m.get_tipo_display(),
            nombre,
            str(m.cantidad),
            str(m.anterior),
            str(m.nuevo),
            m.motivo or "",
            m.usuario.username if m.usuario else "—",
        ])

    return headers, rows


def _informe_turnos(desde, hasta):
    qs = SesionCaja.objects.select_related("dia", "abierta_por", "cerrada_por").all()

    if desde:
        qs = qs.filter(fecha_apertura__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha_apertura__date__lte=hasta)

    headers = ['Apertura', 'Cierre', 'Abierto por', 'Cerrado por', 'Fondo', 'Efectivo Final Real',
               'Ventas Efectivo', 'Ventas Tarjeta', 'Observaciones']
    rows = []
    for s in qs.order_by("-fecha_apertura"):
        rows.append([
            s.fecha_apertura.strftime("%d/%m/%Y %H:%M"),
            s.fecha_cierre.strftime("%d/%m/%Y %H:%M") if s.fecha_cierre else "Abierto",
            s.abierta_por.username if s.abierta_por else "—",
            s.cerrada_por.username if s.cerrada_por else "—",
            str(s.efectivo_inicial),
            str(s.efectivo_final_real) if s.efectivo_final_real is not None else "—",
            str(s.total_ventas_efectivo),
            str(s.total_ventas_tarjeta),
            s.observaciones or "",
        ])

    return headers, rows


def _informe_movimientos_caja(desde, hasta):
    qs = MovimientoCaja.objects.select_related("sesion", "usuario").all()

    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    headers = ['Fecha', 'Tipo', 'Importe', 'Concepto', 'Usuario', 'Turno']
    rows = []
    for m in qs.order_by("-fecha"):
        rows.append([
            m.fecha.strftime("%d/%m/%Y %H:%M"),
            m.tipo.capitalize(),
            str(m.importe),
            m.concepto,
            m.usuario.username if m.usuario else "—",
            str(m.sesion_id) if m.sesion else "—",
        ])

    return headers, rows


def _informe_clientes(desde=None, hasta=None):
    qs = Cliente.objects.all()

    if desde:
        qs = qs.filter(fecha_registro__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha_registro__date__lte=hasta)

    qs = qs.order_by("nombre")

    headers = ['Nombre', 'NIF/CIF', 'Email', 'Teléfono', 'Dirección', 'CP', 'Población', 'Provincia', 'Activo', 'Fecha Registro']
    rows = []
    for c in qs:
        rows.append([
            c.nombre,
            c.nif or "",
            c.email or "",
            c.telefono or "",
            c.direccion or "",
            c.codigo_postal or "",
            c.poblacion or "",
            c.provincia or "",
            "Sí" if c.activo else "No",
            c.fecha_registro.strftime("%d/%m/%Y") if c.fecha_registro else "",
        ])

    return headers, rows


def _informe_rankings(desde, hasta):
    """Rankings de productos, camareros, horas punta, etc."""
    filtro_lineas = Q(anulado=False)
    filtro_facturas = Q()

    if desde:
        filtro_lineas &= Q(comanda__cerrada_a__date__gte=desde)
        filtro_facturas &= Q(emitida_a__date__gte=desde)
    if hasta:
        filtro_lineas &= Q(comanda__cerrada_a__date__lte=hasta)
        filtro_facturas &= Q(emitida_a__date__lte=hasta)

    rows = []
    headers = ['Categoría', 'Ranking', 'Nombre/Concepto', 'Valor']

    # Top 20 productos más vendidos
    top_productos = (
        LineaComanda.objects.filter(filtro_lineas)
        .values("producto_nombre")
        .annotate(total_qty=Sum("cantidad"), total_eur=Sum(F("cantidad") * F("precio_unitario")))
        .order_by("-total_qty")[:20]
    )
    for i, p in enumerate(top_productos, 1):
        rows.append(["Top Productos", str(i), p["producto_nombre"], f"{p['total_qty']} uds ({p['total_eur']:.2f}€)"])

    # Top camareros por ventas
    top_camareros = (
        Factura.objects.filter(filtro_facturas, estado__in=["emitida", "pagada"])
        .values("emitida_por__username")
        .annotate(total=Sum("total"), tickets=Count("id"))
        .order_by("-total")[:10]
    )
    for i, c in enumerate(top_camareros, 1):
        rows.append(["Top Camareros", str(i), c["emitida_por__username"] or "—", f"{c['total']:.2f}€ ({c['tickets']} tickets)"])

    # Productos más anulados
    top_anulados = (
        LineaComanda.objects.filter(anulado=True)
        .values("producto_nombre")
        .annotate(total=Count("id"))
        .order_by("-total")[:10]
    )
    for i, a in enumerate(top_anulados, 1):
        rows.append(["Más Anulados", str(i), a["producto_nombre"], f"{a['total']} anulaciones"])

    # Top departamentos
    top_deptos = (
        LineaComanda.objects.filter(filtro_lineas)
        .values("producto__departamento__nombre")
        .annotate(total_eur=Sum(F("cantidad") * F("precio_unitario")))
        .order_by("-total_eur")[:10]
    )
    for i, d in enumerate(top_deptos, 1):
        nombre = d["producto__departamento__nombre"] or "Sin Categoría"
        rows.append(["Top Categorías", str(i), nombre, f"{d['total_eur']:.2f}€"])

    return headers, rows

