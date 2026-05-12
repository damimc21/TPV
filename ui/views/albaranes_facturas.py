"""Vistas para la sección «albaranes_facturas».
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
def albaranes_facturas(request):
    _require_any_permission_or_403(request, "manage_stock", "manage_files")
    return render(request, "ui/albaranes_facturas/index.html", _documentos_proveedor_context())


def _documentos_proveedor_context():
    hoy = timezone.localdate()
    inicio_mes = hoy.replace(day=1)
    return {
        "proveedores_count": Proveedor.objects.count(),
        "entradas_mes_count": MovimientoStock.objects.filter(
            tipo=MovimientoStock.TIPO_ENTRADA,
            fecha__date__gte=inicio_mes,
        ).count(),
    }


def _parse_date_or_none(value):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_decimal_or_zero(value):
    value = str(value or "0").replace(",", ".").strip()
    try:
        return Decimal(value or "0")
    except Exception:
        return Decimal("0.00")


def _documentos_proveedor_page(request, tipo, template_name):
    _require_any_permission_or_403(request, "manage_stock", "manage_files")
    error = ""
    if request.method == "POST":
        proveedor_id = request.POST.get("proveedor") or None
        proveedor = Proveedor.objects.filter(pk=proveedor_id).first() if proveedor_id else None
        proveedor_nombre = (request.POST.get("proveedor_nombre") or "").strip()
        fecha = _parse_date_or_none(request.POST.get("fecha")) or timezone.localdate()
        vencimiento = _parse_date_or_none(request.POST.get("vencimiento"))
        total = _parse_decimal_or_zero(request.POST.get("total"))

        if not proveedor and not proveedor_nombre:
            error = "Indica un proveedor o escribe el nombre."
        elif tipo == DocumentoProveedor.TIPO_FACTURA and total <= 0:
            error = "Indica el total de la factura."
        else:
            DocumentoProveedor.objects.create(
                tipo=tipo,
                proveedor=proveedor,
                proveedor_nombre=proveedor.nombre if proveedor else proveedor_nombre,
                numero=(request.POST.get("numero") or "").strip(),
                fecha=fecha,
                vencimiento=vencimiento,
                concepto=(request.POST.get("concepto") or "").strip(),
                base=_parse_decimal_or_zero(request.POST.get("base")),
                impuestos=_parse_decimal_or_zero(request.POST.get("impuestos")),
                total=total,
                estado=request.POST.get("estado") or DocumentoProveedor.ESTADO_PENDIENTE,
                notas=(request.POST.get("notas") or "").strip(),
                creado_por=request.user if request.user.is_authenticated else None,
            )
            return redirect(request.path)

    context = _documentos_proveedor_context() | {
        "documentos": DocumentoProveedor.objects.select_related("proveedor").filter(tipo=tipo),
        "proveedores": Proveedor.objects.filter(activo=True).order_by("nombre"),
        "estados": DocumentoProveedor.ESTADOS,
        "error": error,
        "today": timezone.localdate(),
    }
    return render(request, template_name, context)


@login_required
def albaranes(request):
    return _documentos_proveedor_page(
        request,
        DocumentoProveedor.TIPO_ALBARAN,
        "ui/albaranes_facturas/albaranes.html",
    )


@login_required
def facturas(request):
    return _documentos_proveedor_page(
        request,
        DocumentoProveedor.TIPO_FACTURA,
        "ui/albaranes_facturas/facturas.html",
    )


def _facturas_emitidas_context():
    hoy = timezone.localdate()
    facturas_hoy = Factura.objects.filter(emitida_a__date=hoy)
    total_hoy = (
        facturas_hoy
        .filter(estado=Factura.ESTADO_PAGADA)
        .aggregate(Sum("total"))["total__sum"]
        or Decimal("0.00")
    )
    return {
        "facturas": (
            Factura.objects
            .select_related("cliente", "comanda", "emitida_por")
            .order_by("-emitida_a")[:25]
        ),
        "facturas_hoy_count": facturas_hoy.count(),
        "facturas_hoy_total": total_hoy,
        "facturas_pendientes_count": Factura.objects.filter(estado=Factura.ESTADO_EMITIDA).count(),
    }

