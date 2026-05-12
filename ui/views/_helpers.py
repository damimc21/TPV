"""Helpers privados compartidos por todos los submódulos de ui.views."""
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

def _actor_username(user):
    return user.username if getattr(user, "is_authenticated", False) else "anon"


def _require_permission_or_403(request, codename: str):
    if has_app_permission(request.user, codename):
        return
    username = _actor_username(request.user)
    log_warn(
        "authz.ui",
        f"usuario={username} accion=denegado permiso={codename} path={request.path}",
    )
    raise PermissionDenied(_("No tienes permisos para realizar esta accion."))


def _require_any_permission_or_403(request, *codenames):
    if any(has_app_permission(request.user, code) for code in codenames):
        return
    username = _actor_username(request.user)
    joined = ",".join(codenames)
    log_warn(
        "authz.ui",
        f"usuario={username} accion=denegado permiso={joined} path={request.path}",
    )
    raise PermissionDenied(_("No tienes permisos para realizar esta accion."))


def _forbidden_json(request, codename: str):
    username = _actor_username(request.user)
    log_warn(
        "authz.ui",
        f"usuario={username} accion=denegado permiso={codename} path={request.path}",
    )
    return JsonResponse(
        {"ok": False, "error": "No tienes permisos para esta operacion."},
        status=403,
    )


ROLE_PACK_KEYS = ("camarero", "staff")


def _role_from_permissions(user):
    if getattr(user, "is_superuser", False):
        return "superusuario"
    active_codes = set(
        user.user_permissions.filter(
            content_type__app_label="tpvapp",
            codename__in=permission_codenames(),
        ).values_list("codename", flat=True)
    )
    # Comprueba los packs visibles de mayor a menor
    for role_key in reversed(ROLE_PACK_KEYS):
        role_codes = set(PERMISSION_PACKS[role_key]["permissions"])
        if role_codes.issubset(active_codes):
            return role_key
    return "normal"


def _apply_role_permissions(user, role_key):
    custom_codes = permission_codenames()
    current_custom = Permission.objects.filter(
        content_type__app_label="tpvapp",
        codename__in=custom_codes,
    )
    user.user_permissions.remove(*current_custom)
    if role_key in PERMISSION_PACKS:
        role_codes = PERMISSION_PACKS[role_key]["permissions"]
        role_permissions = current_custom.filter(codename__in=role_codes)
        user.user_permissions.add(*role_permissions)

