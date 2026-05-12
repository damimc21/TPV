"""Endpoints del bloque «importacion» de la API de Ficheros."""
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

def _import_headers(tipo):
    return IMPORT_HEADERS.get(tipo) or IMPORT_HEADERS["productos"]


def _normalize_import_header(value):
    value = (value or "").strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = value.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    value = value.replace("ñ", "n")
    return re.sub(r"[^a-z0-9_]+", "", value)


def _normalize_import_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _get_or_create_proveedor(nombre):
    nombre = str(nombre or "").strip()
    if not nombre:
        return None
    proveedor = Proveedor.objects.filter(nombre__iexact=nombre).first()
    if proveedor:
        return proveedor
    return Proveedor.objects.create(nombre=nombre)


def _parse_import_decimal(value, default="0.00"):
    text = str(value or "").strip().replace(" ", "")
    if not text:
        return Decimal(default)

    last_comma = text.rfind(",")
    last_dot = text.rfind(".")
    if last_comma >= 0 and last_dot >= 0:
        decimal_sep = "," if last_comma > last_dot else "."
        split_at = last_comma if decimal_sep == "," else last_dot
        whole = re.sub(r"[.,]", "", text[:split_at])
        cents = text[split_at + 1:]
        text = f"{whole}.{cents}"
    elif last_comma >= 0:
        text = text.replace(",", ".")

    try:
        return Decimal(text)
    except Exception:
        return Decimal(default)


def _normalize_hex_color(value):
    text = str(value or "").strip()
    if not text:
        return ""

    match = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", text)
    if not match:
        return None

    hex_value = match.group(1).lower()
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    return f"#{hex_value}"


def _row_line(row, fallback):
    try:
        return int(row.get("_line") or fallback)
    except (TypeError, ValueError):
        return fallback


def _verification_lookup(model, *extra_fields):
    fields = ("nombre",) + extra_fields
    lookup = {}
    for item in model.objects.values(*fields):
        key = _normalize_import_key(item.get("nombre"))
        if key and key not in lookup:
            lookup[key] = item
    return lookup


def _verification_group_lookup(model):
    return {
        key: name
        for name in model.objects.values_list("nombre", flat=True)
        for key in [_normalize_import_key(name)]
        if key
    }


def _table_columns(model):
    with connection.cursor() as cursor:
        return {
            column.name
            for column in connection.introspection.get_table_description(cursor, model._meta.db_table)
        }


def _create_producto_for_import(**kwargs):
    columns = _table_columns(Producto)
    legacy_required = {"control_stock", "stock_actual", "stock_minimo"} & columns
    if not legacy_required:
        return Producto.objects.create(**kwargs)

    values = {
        "nombre": kwargs.get("nombre"),
        "precio": kwargs.get("precio"),
        "activo": kwargs.get("activo", True),
        "eliminado": False,
        "departamento_id": kwargs.get("departamento").pk if kwargs.get("departamento") else None,
        "color_boton": kwargs.get("color_boton"),
        "impresora": kwargs.get("impresora"),
        "nombre_comanda": kwargs.get("nombre_comanda"),
        "nombre_factura": kwargs.get("nombre_factura"),
        "color_texto": kwargs.get("color_texto"),
        "icono_boton": kwargs.get("icono_boton"),
        "es_configurable": kwargs.get("es_configurable", False),
        "control_stock": False,
        "stock_actual": Decimal("0"),
        "stock_minimo": Decimal("0"),
    }
    insert_columns = [column for column in values if column in columns]
    quoted_table = connection.ops.quote_name(Producto._meta.db_table)
    quoted_columns = ", ".join(connection.ops.quote_name(column) for column in insert_columns)
    placeholders = ", ".join(["%s"] * len(insert_columns))

    with connection.cursor() as cursor:
        cursor.execute(
            f"INSERT INTO {quoted_table} ({quoted_columns}) VALUES ({placeholders})",
            [values[column] for column in insert_columns],
        )
        product_id = cursor.lastrowid

    return Producto.objects.get(pk=product_id)


def _import_rows_from_matrix(matrix):
    clean_rows = [[str(cell or "").strip() for cell in row] for row in matrix if any(str(cell or "").strip() for cell in row)]
    if not clean_rows:
        return [], []

    headers = [_normalize_import_header(cell) for cell in clean_rows[0]]
    rows = []
    for raw_row in clean_rows[1:]:
        row = {}
        for idx, header in enumerate(headers):
            if header:
                row[header] = raw_row[idx] if idx < len(raw_row) else ""
        rows.append(row)
    return headers, rows


def _parse_import_csv(uploaded_file):
    raw = uploaded_file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    first_line = text.splitlines()[0] if text.splitlines() else ""
    delimiter = ";" if first_line.count(";") >= first_line.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    return _import_rows_from_matrix(list(reader))


def _xlsx_col_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref or "")
    if not letters:
        return None
    value = 0
    for ch in letters.group(1):
        value = value * 26 + (ord(ch) - 64)
    return value - 1


def _xlsx_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join(si.itertext()) for si in root.findall("m:si", ns)]


def _xlsx_first_sheet_path(zf):
    try:
        rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
        wb_ns = {
            "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        }
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        first_sheet = workbook.find("m:sheets/m:sheet", wb_ns)
        rel_id = first_sheet.attrib.get(f"{{{wb_ns['r']}}}id") if first_sheet is not None else None
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        for rel in rels.findall("r:Relationship", rel_ns):
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target", "worksheets/sheet1.xml").lstrip("/")
                return target if target.startswith("xl/") else f"xl/{target}"
    except Exception:
        pass
    return "xl/worksheets/sheet1.xml"


def _parse_import_xlsx(uploaded_file):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    uploaded_file.seek(0)
    with zipfile.ZipFile(uploaded_file) as zf:
        shared = _xlsx_shared_strings(zf)
        sheet_path = _xlsx_first_sheet_path(zf)
        root = ET.fromstring(zf.read(sheet_path))
        matrix = []
        for row_el in root.findall(".//m:sheetData/m:row", ns):
            values = []
            for cell in row_el.findall("m:c", ns):
                col_index = _xlsx_col_index(cell.attrib.get("r"))
                if col_index is None:
                    col_index = len(values)
                while len(values) <= col_index:
                    values.append("")

                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    inline = cell.find("m:is", ns)
                    value = "".join(inline.itertext()) if inline is not None else ""
                else:
                    value_el = cell.find("m:v", ns)
                    value = value_el.text if value_el is not None and value_el.text is not None else ""
                    if cell_type == "s" and value != "":
                        idx = int(value)
                        value = shared[idx] if 0 <= idx < len(shared) else ""
                values[col_index] = value
            matrix.append(values)
    return _import_rows_from_matrix(matrix)


def _import_template_instruction_rows(tipo):
    if tipo == "inventario":
        return [
            ["Uso", "Rellena la hoja Datos y conserva los nombres de columna."],
            ["nombre", "Obligatorio. Si ya existe, se actualiza el articulo."],
            ["categoria", "Opcional. Si no existe, se crea automaticamente."],
            ["unidad", "Opcional. Valores admitidos: ud, pack, caja, kg, g, l, ml. Si falta, se usa ud."],
            ["stock_actual", "Opcional. Si falta, se usa 0."],
            ["stock_minimo", "Opcional. Si falta, se usa 0."],
            ["proveedor", "Opcional. Si no existe, se crea automaticamente y queda disponible en Stock."],
            ["precio_compra", "Opcional. Si falta, se usa 0."],
            ["Formatos", "Puedes importar CSV separado por punto y coma o Excel .xlsx."],
        ]
    return [
        ["Uso", "Rellena la hoja Datos y conserva los nombres de columna."],
        ["nombre", "Obligatorio. Si ya existe, se actualiza el producto."],
        ["departamento", "Obligatorio. Todo producto debe pertenecer a un departamento. Si no existe, se crea automaticamente."],
        ["precio", "Opcional. Si falta, se usa 0.00. Puedes usar punto o coma decimal."],
        ["activo", "Opcional. Usa 1/0, si/no o true/false. Si falta, se importa como activo."],
        ["nombre_factura", "Opcional. Si falta, se usa el nombre del producto."],
        ["nombre_comanda", "Opcional. Si falta, se usa el nombre del producto."],
        ["Colores", "La plantilla basica no pide colores. Los productos nuevos usan el color por defecto del catalogo."],
        ["Eliminado", "No se importa en modo basico. La eliminacion se gestiona desde el catalogo."],
        ["Imagenes", "No se importan desde esta plantilla. Se mantienen las imagenes existentes si actualizas productos."],
        ["Formatos", "Puedes importar CSV separado por punto y coma o Excel .xlsx."],
    ]


@login_required
@_require_manage_files
@require_GET
def importar_plantilla(request):
    tipo = request.GET.get("tipo", "productos")
    formato = request.GET.get("format", "csv").lower()
    headers = _import_headers(tipo)
    filename = f"plantilla_{tipo}.xlsx" if formato == "xlsx" else f"plantilla_{tipo}.csv"
    if formato == "xlsx":
        return _xlsx_response(
            filename,
            headers,
            [],
            sheet_name="Datos",
            extra_sheets=[("Instrucciones", ["Campo", "Detalle"], _import_template_instruction_rows(tipo))],
        )
    return _csv_response(filename, headers, [])


@login_required
@_require_manage_files
@require_POST
def importar_previsualizar(request):
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse({"error": "No se ha recibido ningun fichero."}, status=400)

    suffix = Path(uploaded_file.name).suffix.lower()
    try:
        if suffix == ".xlsx":
            headers, rows = _parse_import_xlsx(uploaded_file)
        elif suffix == ".csv":
            headers, rows = _parse_import_csv(uploaded_file)
        else:
            return JsonResponse({"error": "Formato no soportado. Usa CSV o Excel .xlsx."}, status=400)
    except Exception as e:
        log_error(
            "ficheros.importar_previsualizar",
            f"usuario={_actor_username(request)} accion=previsualizar_importacion_error archivo={uploaded_file.name}",
            exc=e,
        )
        return JsonResponse({"error": "No se pudo leer el fichero."}, status=400)

    return JsonResponse({"headers": headers, "rows": rows})


@login_required
@_require_manage_files
@require_POST
def importar_verificar(request):
    """Comprueba el impacto de una importacion antes de confirmarla."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Datos de verificacion invalidos."}, status=400)

    tipo = data.get("tipo", "productos")
    rows = data.get("rows", [])
    if not isinstance(rows, list):
        return JsonResponse({"error": "Formato de filas invalido."}, status=400)

    if tipo == "inventario":
        item_lookup = _verification_lookup(ArticuloInventario)
        group_lookup = _verification_group_lookup(CategoriaInventario)
        provider_lookup = _verification_group_lookup(Proveedor)
        group_field = "categoria"
        group_singular = "categoria"
        group_label = "categorias"
        group_existing_text = "Categoria existente"
        group_new_text = "Categoria nueva"
        group_empty_text = "Sin categoria"
        entity_singular = "articulo"
        entity_plural = "articulos"
    else:
        tipo = "productos"
        item_lookup = _verification_lookup(Producto, "eliminado")
        group_lookup = _verification_group_lookup(Departamento)
        provider_lookup = {}
        group_field = "departamento"
        group_singular = "departamento"
        group_label = "departamentos"
        group_existing_text = "Departamento existente"
        group_new_text = "Departamento nuevo"
        group_empty_text = "Sin departamento"
        entity_singular = "producto"
        entity_plural = "productos"

    name_counts = {}
    for row in rows:
        if isinstance(row, dict):
            name_key = _normalize_import_key(row.get("nombre"))
            if name_key:
                name_counts[name_key] = name_counts.get(name_key, 0) + 1

    summary = {
        "tipo": tipo,
        "total": len(rows),
        "crear": 0,
        "actualizar": 0,
        "revisar": 0,
        "errores": 0,
        "duplicados_archivo": 0,
        "eliminados_existentes": 0,
        "unidades_corregidas": 0,
        "grupos_nuevos": 0,
        "grupos_nuevos_lista": [],
        "proveedores_nuevos": 0,
        "proveedores_nuevos_lista": [],
        "grupo_singular": group_singular,
        "grupo_tipo": group_label,
        "entidad_singular": entity_singular,
        "entidad_plural": entity_plural,
    }
    new_group_keys = {}
    new_provider_keys = {}
    verified_rows = []

    for index, row in enumerate(rows, start=2):
        if not isinstance(row, dict):
            row = {}

        line = _row_line(row, index)
        nombre = str(row.get("nombre") or "").strip()
        name_key = _normalize_import_key(nombre)
        group_name = str(row.get(group_field) or "").strip()
        group_key = _normalize_import_key(group_name)
        notes = []
        action = "create"
        action_label = "Crear"
        impact_class = "create"

        if not name_key:
            action = "error"
            action_label = "Error"
            impact_class = "error"
            notes.append("Falta el nombre obligatorio.")
            summary["errores"] += 1
        elif name_counts.get(name_key, 0) > 1:
            action = "duplicate"
            action_label = "Duplicado"
            impact_class = "review"
            notes.append("Ese nombre aparece mas de una vez en el fichero; revisa cual debe importarse.")
            summary["duplicados_archivo"] += 1
            summary["revisar"] += 1
        elif name_key in item_lookup:
            existing = item_lookup[name_key]
            action = "update"
            action_label = "Actualizar"
            impact_class = "update"
            notes.append(f"Ya existe como {existing.get('nombre')}; se actualizara.")
            summary["actualizar"] += 1
            if tipo == "productos" and existing.get("eliminado"):
                action = "update_deleted"
                action_label = "Actualizar eliminado"
                impact_class = "review"
                notes.append("Esta coincidencia esta eliminada en Catalogo; se actualizara, pero seguira eliminada.")
                summary["eliminados_existentes"] += 1
                summary["revisar"] += 1
        else:
            notes.append(f"No existe, se creara un {entity_singular} nuevo.")
            summary["crear"] += 1

        if group_name:
            if group_key in group_lookup:
                notes.append(f"{group_existing_text}: {group_lookup[group_key]}.")
            else:
                notes.append(f"{group_new_text}: {group_name}.")
                new_group_keys[group_key] = group_name
        else:
            if tipo == "productos":
                # Deshacer el conteo previo del name-check
                if action == "create":
                    summary["crear"] -= 1
                elif action in ("update", "update_deleted"):
                    summary["actualizar"] -= 1
                action = "error"
                action_label = "Error"
                impact_class = "error"
                notes.append("Falta el departamento obligatorio. Todo producto debe pertenecer a un departamento.")
                summary["errores"] += 1
            else:
                notes.append(f"{group_empty_text}, se guardara sin asignar.")

        if tipo == "inventario":
            unidad = str(row.get("unidad") or "").strip().lower()
            if unidad and unidad not in {"ud", "pack", "caja", "kg", "g", "l", "ml"}:
                notes.append("Unidad no reconocida; al importar se usara ud.")
                summary["unidades_corregidas"] += 1
            proveedor_name = str(row.get("proveedor") or "").strip()
            proveedor_key = _normalize_import_key(proveedor_name)
            if proveedor_name:
                if proveedor_key in provider_lookup:
                    notes.append(f"Proveedor existente: {provider_lookup[proveedor_key]}.")
                else:
                    notes.append(f"Proveedor nuevo: {proveedor_name}.")
                    new_provider_keys[proveedor_key] = proveedor_name
        elif row.get("color_boton") or row.get("color_texto"):
            notes.append("Se aplicaran los colores indicados en el fichero.")

        verified_rows.append({
            "line": line,
            "action": action,
            "action_label": action_label,
            "impact_class": impact_class,
            "notes": notes,
            "group_name": group_name,
            "group_status": "new" if group_name and group_key not in group_lookup else ("existing" if group_name else "empty"),
        })

    new_group_names = sorted(new_group_keys.values(), key=lambda value: value.casefold())
    summary["grupos_nuevos"] = len(new_group_names)
    summary["grupos_nuevos_lista"] = new_group_names[:12]
    new_provider_names = sorted(new_provider_keys.values(), key=lambda value: value.casefold())
    summary["proveedores_nuevos"] = len(new_provider_names)
    summary["proveedores_nuevos_lista"] = new_provider_names[:12]

    return JsonResponse({"summary": summary, "rows": verified_rows})


@login_required
@_require_manage_files
@require_POST
def importar_productos(request):
    """Importa productos desde datos CSV parseados por el frontend."""
    try:
        data = json.loads(request.body)
        rows = data.get("rows", [])
        opciones = data.get("opciones") if isinstance(data.get("opciones"), dict) else {}
        rellenar_nombres_producto = opciones.get("rellenar_nombres_producto", True)

        creados = 0
        actualizados = 0
        errores = 0

        for row in rows:
            nombre = (row.get("nombre") or "").strip()
            if not nombre:
                errores += 1
                continue

            depto_nombre = (row.get("departamento") or "").strip()
            if not depto_nombre:
                errores += 1
                continue
            depto, _ = Departamento.objects.get_or_create(nombre=depto_nombre)

            precio = _parse_import_decimal(row.get("precio"), "0.00")

            activo_str = (row.get("activo") or "1").strip().lower()
            valid_activo = ("1", "0", "true", "false", "si", "no", "yes", "activo", "inactivo")
            if activo_str not in valid_activo:
                errores += 1
                continue
            activo = activo_str not in ("0", "false", "no", "inactivo")

            nombre_factura_raw = (row.get("nombre_factura") or "").strip()
            nombre_comanda_raw = (row.get("nombre_comanda") or "").strip()
            nombre_factura = nombre_factura_raw or (nombre if rellenar_nombres_producto else "")
            nombre_comanda = nombre_comanda_raw or (nombre if rellenar_nombres_producto else "")
            color_boton_raw = (row.get("color_boton") or "").strip()
            color_texto_raw = (row.get("color_texto") or "").strip()
            color_boton_importado = _normalize_hex_color(color_boton_raw)
            color_texto_importado = _normalize_hex_color(color_texto_raw)
            if color_boton_raw and color_boton_importado is None:
                errores += 1
                continue
            if color_texto_raw and color_texto_importado is None:
                errores += 1
                continue
            color_boton = color_boton_importado or "#2ecc71"
            color_texto = color_texto_importado or "#ffffff"

            # Buscar producto existente por nombre
            existente = Producto.objects.filter(nombre__iexact=nombre).first()
            if existente:
                existente.departamento = depto
                existente.precio = precio
                existente.activo = activo
                existente.nombre_factura = nombre_factura
                existente.nombre_comanda = nombre_comanda
                if color_boton_importado:
                    existente.color_boton = color_boton
                if color_texto_importado:
                    existente.color_texto = color_texto
                existente.save()
                actualizados += 1
            else:
                _create_producto_for_import(
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
@_require_manage_files
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
            if not cat_nombre and row.get("departamento"):
                errores += 1
                continue
            cat = None
            if cat_nombre:
                cat, _ = CategoriaInventario.objects.get_or_create(nombre=cat_nombre)

            unidad = (row.get("unidad") or "ud").strip().lower()
            valid_unidades = ['ud', 'pack', 'caja', 'kg', 'g', 'l', 'ml']
            if unidad not in valid_unidades:
                unidad = 'ud'

            stock_actual = _parse_import_decimal(row.get("stock_actual"), "0")
            stock_minimo = _parse_import_decimal(row.get("stock_minimo"), "0")

            proveedor = (row.get("proveedor") or "").strip()
            proveedor_ref = _get_or_create_proveedor(proveedor)
            proveedor_nombre = proveedor_ref.nombre if proveedor_ref else ""
            precio_compra = _parse_import_decimal(row.get("precio_compra"), "0")

            existente = ArticuloInventario.objects.filter(nombre__iexact=nombre).first()
            if existente:
                existente.categoria = cat
                existente.unidad = unidad
                existente.stock_actual = stock_actual
                existente.stock_minimo = stock_minimo
                existente.proveedor = proveedor_nombre
                existente.proveedor_ref = proveedor_ref
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
                    proveedor=proveedor_nombre,
                    proveedor_ref=proveedor_ref,
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

