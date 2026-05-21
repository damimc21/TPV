"""Vistas para la sección «ficheros».
Reexportadas desde ui.views.__init__ para mantener compatibilidad.
"""
import json
import math
from django.shortcuts import render, redirect, get_object_or_404
from django.http import Http404, JsonResponse, HttpResponseBadRequest
from decimal import Decimal
from datetime import datetime
from django.views.decorators.http import require_POST, require_http_methods
from django.contrib.auth import logout, get_user_model
from django.contrib.auth.models import Permission
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from django.core.exceptions import PermissionDenied
from ..models import TPVMap, TPVMapItem
from tpvapp.models import Factura, Pago, SesionCaja, DiaContable, ConfiguracionTPV, LineaComanda, Comanda, Proveedor, MovimientoStock, DocumentoProveedor
from tpvapp.auditoria import log_info, log_warn, log_error, registrar
from tpvapp.permissions import has_app_permission
from tpvapp.permission_profiles import (
    PERMISSION_PACKS,
    PERMISSION_DEFINITIONS,
    CATEGORY_LABELS,
    grouped_permissions,
    permission_codenames,
)
from tpvapp.auth_security import (
    get_auth_security_config,
    get_client_ip,
    get_login_block,
    save_auth_security_config,
)
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext as _
from django.db.models import Sum, Count, F
from datetime import timedelta
from ._helpers import (
    _actor_username,
    _require_permission_or_403,
    _require_any_permission_or_403,
    _forbidden_json,
    ROLE_PACK_KEYS,
    _role_from_permissions,
    _apply_role_permissions,
)

@login_required
def ficheros(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/index.html")


@login_required
def ficheros_importar(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/importar.html")


@login_required
def ficheros_exportar(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/exportar.html")


def _tamano_legible(bytes_size):
    """Formatea un tamaño en bytes a texto legible (KB, MB...)."""
    if bytes_size is None:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if bytes_size < 1024:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024
    return f"{bytes_size:.1f} TB"


@login_required
def ficheros_backups(request):
    _require_permission_or_403(request, "manage_files")
    from tpvapp.models import BackupRegistro, ConfiguracionTPV
    from tpvapp import s3_utils
    from datetime import timezone as dt_timezone

    # Backups registrados en BD
    db_backups = BackupRegistro.objects.order_by("-fecha")[:50]
    db_nombres = {b.nombre_archivo for b in db_backups}

    # Convertir a dicts uniformes
    backups_lista = []
    for b in db_backups:
        backups_lista.append({
            "fecha": b.fecha,
            "nombre_archivo": b.nombre_archivo,
            "tamano_legible": b.tamano_legible,
            "tipo": b.tipo,
            "tipo_display": b.get_tipo_display(),
            "solo_s3": False,
            "s3_key": None,
        })

    # Backups en S3 que no están en BD (p.ej. tras un deploy fresco)
    s3_files = s3_utils.list_files(s3_utils.S3_PREFIX_BACKUPS)
    for f in s3_files:
        nombre = f["key"].split("/")[-1]
        if not nombre or nombre in db_nombres:
            continue
        try:
            fecha = datetime.fromisoformat(f["last_modified"])
            if fecha.tzinfo is not None:
                fecha = fecha.astimezone(dt_timezone.utc).replace(tzinfo=None)
        except (ValueError, KeyError):
            fecha = datetime.min
        backups_lista.append({
            "fecha": fecha,
            "nombre_archivo": nombre,
            "tamano_legible": _tamano_legible(f.get("size")),
            "tipo": "s3",
            "tipo_display": "S3",
            "solo_s3": True,
            "s3_key": f["key"],
        })

    # Ordenar por fecha descendente
    backups_lista.sort(key=lambda x: x["fecha"], reverse=True)

    # Configuración de autobackup
    auto_cfg = ConfiguracionTPV.objects.filter(clave="backup_auto_intervalo").first()
    auto_intervalo = auto_cfg.valor if auto_cfg else "0"

    return render(request, "ui/ficheros/backups.html", {
        "backups": backups_lista,
        "auto_intervalo": auto_intervalo,
    })


@login_required
def ficheros_informes(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/informes.html")


@login_required
def ficheros_auditoria(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/auditoria.html")


@login_required
def ficheros_logs(request):
    _require_permission_or_403(request, "manage_files")
    return render(request, "ui/ficheros/logs.html")

