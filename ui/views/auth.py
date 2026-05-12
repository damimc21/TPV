"""Vistas para la sección «auth».
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

class TpvLoginView(LoginView):
    template_name = "ui/auth/login.html"
    redirect_authenticated_user = True

    def dispatch(self, request, *args, **kwargs):
        if (
            request.method == "GET"
            and request.GET.get("switch") == "1"
            and getattr(request.user, "is_authenticated", False)
        ):
            next_url = (request.GET.get("next") or "").strip() or "/"
            registrar(
                request.user,
                "AUTH_CAMBIAR_USUARIO_INICIADO",
                f"next={next_url}",
            )
            log_info(
                "auth.switch_user",
                f"usuario={_actor_username(request.user)} accion=cambiar_usuario_iniciar next={next_url}",
            )
            logout(request)
        return super().dispatch(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        username = (request.POST.get("username") or "").strip()
        block = get_login_block(request, username)
        if block["blocked"]:
            form = self.get_form()
            if block["reason"] == "user_lock_permanent":
                form.add_error(
                    None,
                    _("Acceso bloqueado para este usuario hasta desbloqueo manual de administrador."),
                )
            elif block["reason"] == "user_lock":
                mins = max(1, math.ceil(max(1, block["retry_after"]) / 60))
                form.add_error(
                    None,
                    _("Acceso temporalmente bloqueado para este usuario. Intenta de nuevo en %(mins)s minuto(s).")
                    % {"mins": mins},
                )
            else:
                wait = max(1, int(block["retry_after"]))
                form.add_error(
                    None,
                    _("Demasiados intentos fallidos. Espera %(seconds)s segundos para volver a intentarlo.")
                    % {"seconds": wait},
                )
            log_warn(
                "auth.login_blocked",
                f"usuario_intento={username or 'unknown'} motivo={block['reason']} retry_after={block['retry_after']}s ip={get_client_ip(request)}",
            )
            return self.form_invalid(form)
        return super().post(request, *args, **kwargs)

