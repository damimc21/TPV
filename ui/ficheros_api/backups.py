"""Endpoints del bloque «backups» de la API de Ficheros."""
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

