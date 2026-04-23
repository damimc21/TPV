"""
============================================================
FICHEROS — API Endpoints
============================================================
Todos los endpoints que consume el frontend de la sección Ficheros:
  - Backups: crear, descargar, restaurar
  - Importar: productos, inventario
  - Exportar: productos, inventario, informes
  - Auditoría: listar, usuarios, exportar
  - Logs: listar, detalle, exportar, limpiar
============================================================
"""
import csv
import io
import os
import shutil
import json
import re
import zipfile
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, F, Q, Min
from django.http import JsonResponse, HttpResponse, FileResponse
from django.utils import timezone
from django.views.decorators.http import require_POST, require_GET

from tpvapp.models import (
    Producto, Departamento, BackupRegistro, LogSistema, EventoAuditoria,
    ArticuloInventario, CategoriaInventario, MovimientoStock,
    Factura, LineaComanda, Comanda, SesionCaja, DiaContable,
    MovimientoCaja, Pago, Cliente,
)
from tpvapp.auditoria import log_info, log_warn, log_error

User = get_user_model()

# Directorio de backups
BACKUP_DIR = Path(settings.BASE_DIR) / "backups"


def _get_csrf(request):
    """Helper: obtener cookie CSRF."""
    return request.META.get("HTTP_X_CSRFTOKEN", "")


def _actor_username(request):
    user = getattr(request, "user", None)
    return user.username if getattr(user, "is_authenticated", False) else "anon"


# ============================================================
#  BACKUPS
# ============================================================

@login_required
@require_POST
def backup_crear(request):
    """Crea una copia de seguridad de la base de datos SQLite."""
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.sqlite3"
        dest = BACKUP_DIR / filename

        # Copiar el archivo de base de datos
        db_path = settings.DATABASES['default']['NAME']
        shutil.copy2(str(db_path), str(dest))

        tamano = dest.stat().st_size

        # Registrar en BD
        BackupRegistro.objects.create(
            nombre_archivo=filename,
            ruta=str(dest),
            tamano_bytes=tamano,
            tipo='manual',
            creado_por=request.user,
        )
        log_info(
            "ficheros.backups",
            f"usuario={_actor_username(request)} accion=crear_backup archivo={filename} tamano_bytes={tamano}",
        )

        return JsonResponse({"ok": True, "nombre": filename, "tamano": tamano})
    except Exception as e:
        log_error(
            "ficheros.backups",
            f"usuario={_actor_username(request)} accion=crear_backup_error",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


@login_required
@require_GET
def backup_descargar(request, filename):
    """Descarga un archivo de backup."""
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        return JsonResponse({"ok": False, "error": "Archivo no encontrado"}, status=404)

    response = FileResponse(
        open(str(filepath), "rb"),
        content_type="application/octet-stream"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@login_required
@require_POST
def backup_restaurar(request):
    """Restaura la BD desde un backup, creando una copia de seguridad previa."""
    try:
        data = json.loads(request.body)
        filename = data.get("filename")
        if not filename:
            return JsonResponse({"ok": False, "error": "Falta el nombre del archivo"}, status=400)

        filepath = BACKUP_DIR / filename
        if not filepath.exists():
            return JsonResponse({"ok": False, "error": "Archivo de backup no encontrado"}, status=404)

        db_path = str(settings.DATABASES['default']['NAME'])

        # Crear backup de seguridad antes de restaurar
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        safety_name = f"pre_restore_{timestamp}.sqlite3"
        safety_path = BACKUP_DIR / safety_name
        shutil.copy2(db_path, str(safety_path))

        tamano_safety = safety_path.stat().st_size
        BackupRegistro.objects.create(
            nombre_archivo=safety_name,
            ruta=str(safety_path),
            tamano_bytes=tamano_safety,
            tipo='auto',
            creado_por=request.user,
            notas="Backup de seguridad antes de restauración",
        )

        # Restaurar: reemplazar la BD actual
        shutil.copy2(str(filepath), db_path)
        log_warn(
            "ficheros.backups",
            f"usuario={_actor_username(request)} accion=restaurar_backup archivo={filename} backup_seguridad={safety_name}",
        )

        return JsonResponse({"ok": True})
    except Exception as e:
        log_error(
            "ficheros.backups",
            f"usuario={_actor_username(request)} accion=restaurar_backup_error",
            exc=e,
        )
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


# ============================================================
#  IMPORTAR PRODUCTOS / INVENTARIO
# ============================================================

@login_required
@require_POST
def importar_productos(request):
    """Importa productos desde datos CSV parseados por el frontend."""
    try:
        data = json.loads(request.body)
        rows = data.get("rows", [])

        creados = 0
        actualizados = 0
        errores = 0

        for row in rows:
            nombre = (row.get("nombre") or "").strip()
            if not nombre:
                errores += 1
                continue

            depto_nombre = (row.get("departamento") or "").strip()
            depto = None
            if depto_nombre:
                depto, _ = Departamento.objects.get_or_create(nombre=depto_nombre)

            precio_str = (row.get("precio") or "0").replace(",", ".")
            try:
                precio = Decimal(precio_str)
            except Exception:
                precio = Decimal("0.00")

            activo_str = (row.get("activo") or "1").strip().lower()
            activo = activo_str not in ("0", "false", "no", "inactivo")

            nombre_factura = (row.get("nombre_factura") or "").strip() or None
            nombre_comanda = (row.get("nombre_comanda") or "").strip() or None
            color_boton = (row.get("color_boton") or "").strip() or None
            color_texto = (row.get("color_texto") or "").strip() or "#ffffff"

            # Buscar producto existente por nombre
            existente = Producto.objects.filter(nombre__iexact=nombre).first()
            if existente:
                existente.departamento = depto
                existente.precio = precio
                existente.activo = activo
                if nombre_factura:
                    existente.nombre_factura = nombre_factura
                if nombre_comanda:
                    existente.nombre_comanda = nombre_comanda
                if color_boton:
                    existente.color_boton = color_boton
                existente.color_texto = color_texto
                existente.save()
                actualizados += 1
            else:
                Producto.objects.create(
                    nombre=nombre,
                    departamento=depto,
                    precio=precio,
                    activo=activo,
                    nombre_factura=nombre_factura,
                    nombre_comanda=nombre_comanda,
                    color_boton=color_boton,
                    color_texto=color_texto,
                )
                creados += 1

        log_info(
            "ficheros.importar_productos",
            f"usuario={_actor_username(request)} accion=importar_productos filas={len(rows)} creados={creados} actualizados={actualizados} errores={errores}",
        )
        return JsonResponse({"creados": creados, "actualizados": actualizados, "errores": errores})

    except Exception as e:
        log_error(
            "ficheros.importar_productos",
            f"usuario={_actor_username(request)} accion=importar_productos_error",
            exc=e,
        )
        return JsonResponse({"error": str(e)}, status=500)


@login_required
@require_POST
def importar_inventario(request):
    """Importa artículos de inventario desde datos CSV parseados por el frontend."""
    try:
        data = json.loads(request.body)
        rows = data.get("rows", [])

        creados = 0
        actualizados = 0
        errores = 0

        for row in rows:
            nombre = (row.get("nombre") or "").strip()
            if not nombre:
                errores += 1
                continue

            cat_nombre = (row.get("categoria") or "").strip()
            cat = None
            if cat_nombre:
                cat, _ = CategoriaInventario.objects.get_or_create(nombre=cat_nombre)

            unidad = (row.get("unidad") or "ud").strip().lower()
            valid_unidades = ['ud', 'pack', 'caja', 'kg', 'g', 'l', 'ml']
            if unidad not in valid_unidades:
                unidad = 'ud'

            stock_str = (row.get("stock_actual") or "0").replace(",", ".")
            try:
                stock_actual = Decimal(stock_str)
            except Exception:
                stock_actual = Decimal("0")

            stock_min_str = (row.get("stock_minimo") or "0").replace(",", ".")
            try:
                stock_minimo = Decimal(stock_min_str)
            except Exception:
                stock_minimo = Decimal("0")

            proveedor = (row.get("proveedor") or "").strip()
            precio_str = (row.get("precio_compra") or "0").replace(",", ".")
            try:
                precio_compra = Decimal(precio_str)
            except Exception:
                precio_compra = Decimal("0")

            existente = ArticuloInventario.objects.filter(nombre__iexact=nombre).first()
            if existente:
                existente.categoria = cat
                existente.unidad = unidad
                existente.stock_actual = stock_actual
                existente.stock_minimo = stock_minimo
                existente.proveedor = proveedor
                existente.precio_compra = precio_compra
                existente.save()
                actualizados += 1
            else:
                ArticuloInventario.objects.create(
                    nombre=nombre,
                    categoria=cat,
                    unidad=unidad,
                    stock_actual=stock_actual,
                    stock_minimo=stock_minimo,
                    proveedor=proveedor,
                    precio_compra=precio_compra,
                )
                creados += 1

        log_info(
            "ficheros.importar_inventario",
            f"usuario={_actor_username(request)} accion=importar_inventario filas={len(rows)} creados={creados} actualizados={actualizados} errores={errores}",
        )
        return JsonResponse({"creados": creados, "actualizados": actualizados, "errores": errores})

    except Exception as e:
        log_error(
            "ficheros.importar_inventario",
            f"usuario={_actor_username(request)} accion=importar_inventario_error",
            exc=e,
        )
        return JsonResponse({"error": str(e)}, status=500)


# ============================================================
#  EXPORTAR DATOS
# ============================================================

def _csv_response(filename, headers, rows):
    """Helper: genera una HttpResponse con contenido CSV descargable."""
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    # BOM para Excel
    response.write('\ufeff')
    writer = csv.writer(response, delimiter=';')
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return response


def _excel_col_name(index):
    """Convierte índice 1-based a nombre de columna Excel (A, B, ..., AA...)."""
    name = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def _xlsx_response(filename, headers, rows):
    """Genera un .xlsx sin dependencias externas."""
    def to_excel_cell(value):
        if value is None:
            return "", False
        if isinstance(value, (int, float, Decimal)):
            return str(value), True
        text = str(value).strip()
        if re.fullmatch(r"-?\d+(?:[.,]\d+)?", text):
            numeric = text.replace(",", ".")
            if numeric.count(".") <= 1:
                return numeric, True
        return str(value), False

    sheet_rows = [headers] + list(rows)
    sheet_xml_rows = []
    for row_idx, row in enumerate(sheet_rows, start=1):
        cells = []
        for col_idx, raw in enumerate(row, start=1):
            cell_ref = f"{_excel_col_name(col_idx)}{row_idx}"
            value, is_number = to_excel_cell(raw)
            if is_number and value != "":
                cells.append(f'<c r="{cell_ref}"><v>{escape(value)}</v></c>')
            else:
                cells.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>'
                )
        sheet_xml_rows.append(f"<row r=\"{row_idx}\">{''.join(cells)}</row>")

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(sheet_xml_rows)}</sheetData>"
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Informe" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    response = HttpResponse(
        output.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@login_required
@require_GET
def exportar_productos(request):
    """Exporta productos del catálogo en CSV."""
    qs = Producto.objects.select_related("departamento").all()

    activos = request.GET.get("activos")
    eliminados = request.GET.get("eliminados")
    depto_id = request.GET.get("departamento")

    if activos == "1":
        qs = qs.filter(activo=True)
    if eliminados != "1":
        qs = qs.filter(eliminado=False)
    if depto_id:
        qs = qs.filter(departamento_id=depto_id)

    headers = ['nombre', 'departamento', 'precio', 'activo', 'nombre_factura', 'nombre_comanda', 'color_boton', 'color_texto']
    rows = []
    for p in qs:
        rows.append([
            p.nombre,
            p.departamento.nombre if p.departamento else '',
            str(p.precio),
            '1' if p.activo else '0',
            p.nombre_factura or '',
            p.nombre_comanda or '',
            p.color_boton or '',
            p.color_texto or '',
        ])

    return _csv_response("productos.csv", headers, rows)


@login_required
@require_GET
def exportar_inventario(request):
    """Exporta artículos de inventario en CSV."""
    qs = ArticuloInventario.objects.select_related("categoria").filter(activo=True)

    headers = ['nombre', 'categoria', 'unidad', 'stock_actual', 'stock_minimo', 'proveedor', 'precio_compra']
    rows = []
    for a in qs:
        rows.append([
            a.nombre,
            a.categoria.nombre if a.categoria else '',
            a.unidad,
            str(a.stock_actual),
            str(a.stock_minimo),
            a.proveedor,
            str(a.precio_compra),
        ])

    return _csv_response("inventario.csv", headers, rows)


# ============================================================
#  INFORMES
# ============================================================

@login_required
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
@require_GET
def exportar_informe(request, tipo):
    """Genera y descarga o previsualiza un informe según el tipo solicitado."""
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
    if formato == "xlsx":
        return _xlsx_response(f"informe_{tipo}.xlsx", headers, rows)
    else:
        return _csv_response(f"informe_{tipo}.csv", headers, rows)


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


# ============================================================
#  AUDITORÍA
# ============================================================

@login_required
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
@require_GET
def auditoria_usuarios(request):
    """Lista usuarios para el filtro de auditoría."""
    users = User.objects.filter(is_active=True).values("id", "username").order_by("username")
    return JsonResponse(list(users), safe=False)


@login_required
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
@require_GET
def auditoria_rango(request):
    """Devuelve la fecha mínima disponible en auditoría."""
    min_dt = EventoAuditoria.objects.aggregate(v=Min("fecha"))["v"]
    min_date = min_dt.date().isoformat() if min_dt else None
    return JsonResponse({"min_date": min_date})


@login_required
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


# ============================================================
#  LOGS DEL SISTEMA
# ============================================================

@login_required
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
@require_GET
def logs_exportar(request):
    """Exporta logs del sistema en CSV."""
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

    return _csv_response("logs_sistema.csv", headers, rows)


@login_required
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
