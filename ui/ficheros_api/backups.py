"""Endpoints del bloque «backups» de la API de Ficheros."""
import csv
import io
import os
import shutil
import json
import re
import subprocess
import sys
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
)


def _es_sqlite():
    """Devuelve True si la base de datos activa es SQLite."""
    engine = settings.DATABASES["default"].get("ENGINE", "")
    return "sqlite3" in engine


def _crear_backup_sqlite(dest: Path):
    """Copia el archivo SQLite al destino."""
    db_path = settings.DATABASES["default"]["NAME"]
    shutil.copy2(str(db_path), str(dest))
    return dest.stat().st_size


def _crear_backup_dumpdata(dest: Path):
    """
    Usa manage.py dumpdata para crear un JSON con todos los datos.
    Funciona con cualquier motor de base de datos (MySQL, PostgreSQL, etc.).
    El archivo resultante se puede restaurar con loaddata.
    """
    result = subprocess.run(
        [sys.executable, "manage.py", "dumpdata", "--natural-foreign",
         "--natural-primary", "--indent", "2"],
        capture_output=True,
        text=True,
        cwd=str(settings.BASE_DIR),
    )
    if result.returncode != 0:
        raise RuntimeError(f"dumpdata fallo: {result.stderr[:500]}")
    dest.write_text(result.stdout, encoding="utf-8")
    return dest.stat().st_size


@login_required
@_require_manage_files
@require_POST
def backup_crear(request):
    """
    Crea una copia de seguridad de la base de datos.

    - En local (SQLite): copia el archivo .sqlite3.
    - En produccion (MySQL/RDS): usa dumpdata para crear un JSON restaurable.

    En ambos casos, si hay bucket S3 configurado, sube el archivo al bucket
    bajo el prefijo backups/ ademas de guardarlo en local.
    """
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")

        if _es_sqlite():
            filename = f"backup_{timestamp}.sqlite3"
            dest = BACKUP_DIR / filename
            tamano = _crear_backup_sqlite(dest)
            notas = "Backup SQLite local"
        else:
            filename = f"backup_{timestamp}.json"
            dest = BACKUP_DIR / filename
            tamano = _crear_backup_dumpdata(dest)
            notas = "Backup dumpdata (MySQL/RDS)"

        # Subir a S3 si esta configurado
        s3_key = f"{s3_utils.S3_PREFIX_BACKUPS}{filename}"
        subido_s3 = s3_utils.upload_file(dest, s3_key)
        if subido_s3:
            notas += f" | S3: {s3_key}"

        # Registrar en BD
        BackupRegistro.objects.create(
            nombre_archivo=filename,
            ruta=str(dest),
            tamano_bytes=tamano,
            tipo="manual",
            creado_por=request.user,
            notas=notas,
        )
        log_info(
            "ficheros.backups",
            f"usuario={_actor_username(request)} accion=crear_backup archivo={filename} "
            f"tamano_bytes={tamano} s3={subido_s3}",
        )

        return JsonResponse({
            "ok": True,
            "nombre": filename,
            "tamano": tamano,
            "s3": subido_s3,
        })
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

