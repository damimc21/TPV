"""Helpers privados y constantes compartidas por los submódulos de ui.ficheros_api."""
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


# ---- Generadores de respuestas tabulares (compartidos entre exportacion/informes/auditoria/logs/...) ----

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

