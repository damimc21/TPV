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

User = get_user_model()

# Directorio de backups
BACKUP_DIR = Path(settings.BASE_DIR) / "backups"

IMPORT_HEADERS = {
    "productos": [
        "nombre", "departamento", "precio", "activo",
        "nombre_factura", "nombre_comanda",
    ],
    "inventario": [
        "nombre", "categoria", "unidad", "stock_actual",
        "stock_minimo", "proveedor", "precio_compra",
    ],
}


def _ui_audit_event_name(evento_raw: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_]+", "_", (evento_raw or "").strip()).strip("_").upper()
    token = token[:220] if token else "EVENTO"
    return f"UI_{token}"


def _get_csrf(request):
    """Helper: obtener cookie CSRF."""
    return request.META.get("HTTP_X_CSRFTOKEN", "")


def _actor_username(request):
    user = getattr(request, "user", None)
    return user.username if getattr(user, "is_authenticated", False) else "anon"


def _require_manage_files(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if has_app_permission(getattr(request, "user", None), "manage_files"):
            return view_func(request, *args, **kwargs)
        log_warn(
            "authz.files",
            f"usuario={_actor_username(request)} accion=denegado permiso=manage_files path={request.path}",
        )
        return JsonResponse(
            {"ok": False, "error": "No tienes permisos para acceder a Ficheros."},
            status=403,
        )

    return _wrapped


# ============================================================
#  BACKUPS
# ============================================================

@login_required
@_require_manage_files
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
@_require_manage_files
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
@_require_manage_files
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


def _xlsx_response(filename, headers, rows, sheet_name="Informe", extra_sheets=None):
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

    def sheet_xml(headers_, rows_):
        sheet_rows = [headers_] + list(rows_)
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
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f"<sheetData>{''.join(sheet_xml_rows)}</sheetData>"
            "</worksheet>"
        )

    sheets = [(sheet_name, headers, rows)] + list(extra_sheets or [])
    sheet_defs = []
    content_overrides = []
    workbook_relationships = []
    sheet_files = []
    for idx, (name, sheet_headers, sheet_rows) in enumerate(sheets, start=1):
        safe_name = escape(str(name)[:31] or f"Hoja {idx}", {'"': "&quot;"})
        sheet_defs.append(f'<sheet name="{safe_name}" sheetId="{idx}" r:id="rId{idx}"/>')
        content_overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{idx}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
        workbook_relationships.append(
            f'<Relationship Id="rId{idx}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{idx}.xml"/>'
        )
        sheet_files.append((f"xl/worksheets/sheet{idx}.xml", sheet_xml(sheet_headers, sheet_rows)))

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{''.join(sheet_defs)}</sheets>"
        "</workbook>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        f"{''.join(content_overrides)}"
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
        f"{''.join(workbook_relationships)}"
        "</Relationships>"
    )

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        for path, xml in sheet_files:
            zf.writestr(path, xml)

    response = HttpResponse(
        output.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


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


# ============================================================
#  INFORMES
# ============================================================

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


# ============================================================
#  LOGS DEL SISTEMA
# ============================================================

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
