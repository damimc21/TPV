"""Vistas para la sección «config».
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
def config(request):
    _require_permission_or_403(request, "manage_configuration")
    return render(request, "ui/config/index.html")


def _post_bool(post, key):
    return post.get(key) in ("1", "on", "true", "True")


@login_required
def config_seguridad(request):
    _require_permission_or_403(request, "manage_configuration")
    saved = False
    if request.method == "POST":
        rules = []
        raw_json = request.POST.get("throttle_rules_json")
        if raw_json:
            try:
                parsed = json.loads(raw_json)
                if isinstance(parsed, list):
                    for row in parsed:
                        rules.append(
                            {
                                "attempts": row.get("attempts"),
                                "seconds": row.get("seconds"),
                            }
                        )
            except Exception:
                rules = []

        values = {
            "enabled": _post_bool(request.POST, "enabled"),
            "throttle_rules": rules,
            "user_lock_mode": request.POST.get("user_lock_mode", "none"),
            "user_lock_attempts": request.POST.get("user_lock_attempts"),
            "user_lock_seconds": request.POST.get("user_lock_seconds"),
        }
        cfg = save_auth_security_config(values)
        saved = True
        log_info(
            "auth.config",
            (
                f"usuario={_actor_username(request.user)} accion=actualizar_seguridad_login "
                f"enabled={cfg['enabled']} rules={cfg['throttle_rules']} "
                f"user_lock_mode={cfg['user_lock_mode']} user_lock_attempts={cfg['user_lock_attempts']} "
                f"user_lock_seconds={cfg['user_lock_seconds']}"
            ),
        )
    else:
        cfg = get_auth_security_config()

    return render(
        request,
        "ui/config/seguridad.html",
        {
            "cfg": cfg,
            "saved": saved,
        },
    )


@login_required
def config_impresoras(request):
    _require_permission_or_403(request, "manage_configuration")
    from tpvapp.models import Impresora
    impresoras = Impresora.objects.all().order_by('nombre')
    return render(request, "ui/config/impresoras.html", {"impresoras": impresoras})


@login_required
def config_usuarios(request):
    _require_permission_or_403(request, "manage_users")
    User = get_user_model()
    notice_ok = ""
    notice_error = ""
    actor_is_system_user = getattr(request.user, "is_system_user", False)

    if request.method == "POST":
        action = (request.POST.get("action") or "").strip().lower()
        actor = _actor_username(request.user)
        try:
            if action == "create":
                username = (request.POST.get("username") or "").strip()
                password = request.POST.get("password") or ""
                email = (request.POST.get("email") or "").strip()
                wants_waiter = _post_bool(request.POST, "role_camarero")
                is_staff = _post_bool(request.POST, "is_staff")
                is_active = _post_bool(request.POST, "is_active")
                # Solo el usuario de sistema puede crear otro superusuario.
                wants_superuser = _post_bool(request.POST, "is_superuser")
                if wants_superuser and not actor_is_system_user:
                    raise ValueError("Solo el usuario de sistema puede crear otro superusuario.")

                if not username:
                    raise ValueError("El nombre de usuario es obligatorio.")
                if not password:
                    raise ValueError("La contraseña es obligatoria para crear el usuario.")
                if User.objects.filter(username__iexact=username).exists():
                    raise ValueError("Ya existe un usuario con ese nombre.")

                new_user = User.objects.create_user(
                    username=username,
                    password=password,
                    email=email,
                    is_staff=is_staff or wants_superuser,
                    is_active=is_active,
                    is_superuser=wants_superuser,
                )
                role_key = "superusuario" if wants_superuser else "staff" if is_staff else "camarero" if wants_waiter else None
                _apply_role_permissions(new_user, role_key)
                registrar(
                    request.user,
                    "USUARIO_CREADO",
                    f"usuario_objetivo={new_user.username} staff={is_staff} superuser={wants_superuser} activo={is_active}",
                )
                log_info(
                    "auth.users",
                    f"usuario={actor} accion=crear usuario_objetivo={new_user.username} staff={is_staff} superuser={wants_superuser} activo={is_active}",
                )
                notice_ok = f"Usuario '{new_user.username}' creado correctamente."

            elif action == "update":
                user_id = request.POST.get("user_id")
                target = get_object_or_404(User, id=user_id)

                # Protecciones para el superusuario de sistema.
                if target.is_system_user:
                    if target.id != request.user.id:
                        raise ValueError("El usuario de sistema solo puede modificar su propia contraseña.")
                    # Solo permite cambiar contraseña.
                    new_password = request.POST.get("new_password") or ""
                    if new_password.strip():
                        if len(new_password.strip()) < 4:
                            raise ValueError("La contraseña debe tener al menos 4 caracteres.")
                        target.set_password(new_password.strip())
                        target.save(update_fields=["password"])
                        registrar(
                            request.user,
                            "USUARIO_ACTUALIZADO",
                            f"usuario_objetivo={target.username} campos=password",
                        )
                        log_info(
                            "auth.users",
                            f"usuario={actor} accion=editar usuario_objetivo={target.username} campos=password",
                        )
                        notice_ok = "Contraseña del usuario de sistema actualizada correctamente."
                    else:
                        notice_ok = "No se realizaron cambios."
                    # Salir sin procesar más campos.
                    users = list(User.objects.all().order_by("username"))
                    for user_item in users:
                        user_item.permission_role = _role_from_permissions(user_item)
                    _rp_keys = list(ROLE_PACK_KEYS) + (["superusuario"] if getattr(request.user, "is_system_user", False) else [])
                    role_packs = [(key, PERMISSION_PACKS[key]) for key in _rp_keys]
                    return render(
                        request,
                        "ui/config/usuarios.html",
                        {"users": users, "role_packs": role_packs, "notice_ok": notice_ok, "notice_error": notice_error},
                    )

                if target.is_superuser and target.id != request.user.id and not actor_is_system_user:
                    raise ValueError("Solo el usuario de sistema puede editar otro superusuario.")

                is_staff = _post_bool(request.POST, "is_staff")
                wants_waiter = _post_bool(request.POST, "role_camarero")
                is_active = _post_bool(request.POST, "is_active")
                if target.id == request.user.id and not is_active:
                    raise ValueError("No puedes desactivar tu propio usuario.")

                # Solo el usuario de sistema puede promover/degradar superusuarios.
                posted_superuser = _post_bool(request.POST, "is_superuser")
                if not actor_is_system_user and "is_superuser" in request.POST and posted_superuser != target.is_superuser:
                    raise ValueError("Solo el usuario de sistema puede cambiar el rol de superusuario.")
                if actor_is_system_user and target.id == request.user.id and "is_superuser" in request.POST and posted_superuser != target.is_superuser:
                    raise ValueError("No puedes cambiar tu propio rol de superusuario.")
                wants_superuser = posted_superuser if actor_is_system_user and target.id != request.user.id else target.is_superuser

                before = {
                    "email": target.email or "",
                    "is_staff": target.is_staff,
                    "is_active": target.is_active,
                    "is_superuser": target.is_superuser,
                }

                target.email = (request.POST.get("email") or "").strip()
                target.is_staff = is_staff or wants_superuser
                target.is_active = is_active
                target.is_superuser = wants_superuser
                changed_fields = ["email", "is_staff", "is_active", "is_superuser"]
                role_key = "superusuario" if wants_superuser else "staff" if is_staff else "camarero" if wants_waiter else None

                new_password = request.POST.get("new_password") or ""
                if new_password.strip():
                    target.set_password(new_password.strip())
                    changed_fields.append("password")

                target.save()
                _apply_role_permissions(target, role_key)
                registrar(
                    request.user,
                    "USUARIO_ACTUALIZADO",
                    (
                        f"usuario_objetivo={target.username} "
                        f"email_antes={before['email']} email_despues={target.email or ''} "
                        f"staff_antes={before['is_staff']} staff_despues={target.is_staff} "
                        f"activo_antes={before['is_active']} activo_despues={target.is_active} "
                        f"campos={','.join(changed_fields)} rol={role_key or 'normal'}"
                    ),
                )
                log_info(
                    "auth.users",
                    f"usuario={actor} accion=editar usuario_objetivo={target.username} campos={','.join(changed_fields)} rol={role_key or 'normal'}",
                )
                notice_ok = f"Usuario '{target.username}' actualizado correctamente."

            elif action == "delete":
                user_id = request.POST.get("user_id")
                target = get_object_or_404(User, id=user_id)
                if target.is_system_user:
                    raise ValueError("El usuario de sistema no puede eliminarse.")
                if target.id == request.user.id:
                    raise ValueError("No puedes eliminar tu propio usuario.")
                if target.is_superuser and not actor_is_system_user:
                    raise ValueError("Solo el usuario de sistema puede eliminar otro superusuario.")

                # Detectar comandas activas del usuario (sin cerrar).
                comandas_activas = Comanda.objects.filter(
                    usuario=target, fecha_cierre__isnull=True
                ).count()
                confirmed = request.POST.get("confirm_delete") == "1"
                if comandas_activas and not confirmed:
                    # Devolver aviso al frontend para que muestre confirmación extra.
                    users = list(User.objects.all().order_by("username"))
                    for user_item in users:
                        user_item.permission_role = _role_from_permissions(user_item)
                    _rp_keys = list(ROLE_PACK_KEYS) + (["superusuario"] if getattr(request.user, "is_system_user", False) else [])
                    role_packs = [(key, PERMISSION_PACKS[key]) for key in _rp_keys]
                    return render(
                        request,
                        "ui/config/usuarios.html",
                        {
                            "users": users,
                            "role_packs": role_packs,
                            "notice_ok": "",
                            "notice_error": "",
                            "delete_warning": {
                                "user_id": target.id,
                                "username": target.username,
                                "comandas_activas": comandas_activas,
                            },
                        },
                    )

                username_target = target.username
                target.delete()
                registrar(
                    request.user,
                    "USUARIO_ELIMINADO",
                    f"usuario_objetivo={username_target} comandas_activas_al_borrar={comandas_activas}",
                )
                log_warn(
                    "auth.users",
                    f"usuario={actor} accion=eliminar usuario_objetivo={username_target} comandas_activas={comandas_activas}",
                )
                notice_ok = "Usuario eliminado correctamente."
            else:
                notice_error = "Accion no valida."
        except ValueError as exc:
            notice_error = str(exc)
        except Exception as exc:
            log_error(
                "auth.users",
                f"usuario={_actor_username(request.user)} accion=gestion_usuarios_error",
                exc=exc,
            )
            notice_error = "No se pudo completar la operacion sobre usuarios."

    users = list(User.objects.all().order_by("username"))
    for user_item in users:
        user_item.permission_role = _role_from_permissions(user_item)
    _rp_keys = list(ROLE_PACK_KEYS) + (["superusuario"] if getattr(request.user, "is_system_user", False) else [])
    role_packs = [(key, PERMISSION_PACKS[key]) for key in _rp_keys]
    return render(
        request,
        "ui/config/usuarios.html",
        {
            "users": users,
            "role_packs": role_packs,
            "notice_ok": notice_ok,
            "notice_error": notice_error,
        },
    )


@login_required
def config_permisos(request):
    _require_permission_or_403(request, "manage_users")
    User = get_user_model()
    actor_is_system_user = getattr(request.user, "is_system_user", False)
    actor_is_superuser = getattr(request.user, "is_superuser", False)

    # Permisos que el actor puede otorgar:
    # - superusuario (is_superuser): todos los del catálogo (tiene bypass total).
    # - usuario normal con manage_users: solo los que él mismo tiene asignados.
    custom_codes = permission_codenames()
    if actor_is_superuser:
        grantable_codes = set(custom_codes)
    else:
        grantable_codes = set(
            request.user.user_permissions.filter(
                content_type__app_label="tpvapp",
                codename__in=custom_codes,
            ).values_list("codename", flat=True)
        )

    users = User.objects.all().order_by("username")
    selected_user = None
    notice_ok = ""
    notice_error = ""

    selected_user_id = request.GET.get("user") or request.POST.get("user_id")
    if users.exists() and selected_user_id:
        selected_user = users.filter(id=selected_user_id).first()

    custom_permissions_qs = Permission.objects.filter(
        content_type__app_label="tpvapp",
        codename__in=custom_codes,
    ).order_by("codename")
    permission_map = {perm.codename: perm for perm in custom_permissions_qs}
    missing_codes = [code for code in custom_codes if code not in permission_map]

    if request.method == "POST" and selected_user is not None:
        # Regla 1: nadie puede editar sus propios permisos.
        if selected_user.id == request.user.id:
            notice_error = "No puedes modificar tus propios permisos."
        elif selected_user.is_system_user:
            notice_error = "Los permisos del usuario de sistema no se pueden modificar."
        elif selected_user.is_superuser and not actor_is_system_user:
            notice_error = "Solo el usuario de sistema puede modificar permisos de otro superusuario."
        elif missing_codes:
            notice_error = "Faltan permisos en base de datos. Ejecuta migraciones para crearlos."
        else:
            # Aceptamos cualquier pack conocido (camarero, staff, tpv_operador como
            # alias de camarero) excepto "superusuario", que solo se asigna por flujo
            # interno y no debe llegar por este formulario aunque alguien lo intente.
            selected_pack_keys = [
                key for key in request.POST.getlist("pack")
                if key in PERMISSION_PACKS and key != "superusuario"
            ]
            manual_codes = {
                code for code in request.POST.getlist("perm")
                if code in permission_map
            }
            pack_codes = set()
            for key in selected_pack_keys:
                pack_codes.update(PERMISSION_PACKS[key]["permissions"])

            requested_codes = pack_codes | manual_codes

            # Regla 2: solo puedes otorgar permisos que tú mismo tienes.
            forbidden_codes = requested_codes - grantable_codes
            if forbidden_codes:
                _label_map = {p["codename"]: p["label"] for p in PERMISSION_DEFINITIONS}
                forbidden_labels = [_label_map.get(c, c) for c in sorted(forbidden_codes)]
                notice_error = (
                    f"No puedes otorgar permisos que tú no tienes: {', '.join(forbidden_labels)}."
                )
            else:
                final_codes = sorted(requested_codes)
                selected_user.user_permissions.set(
                    [permission_map[code] for code in final_codes if code in permission_map]
                )
                registrar(
                    request.user,
                    "USUARIO_PERMISOS_ACTUALIZADOS",
                    (
                        f"usuario_objetivo={selected_user.username} "
                        f"packs={','.join(selected_pack_keys) if selected_pack_keys else 'ninguno'} "
                        f"permisos={','.join(final_codes) if final_codes else 'ninguno'}"
                    ),
                )
                log_info(
                    "auth.permissions",
                    (
                        f"usuario={_actor_username(request.user)} accion=actualizar_permisos "
                        f"usuario_objetivo={selected_user.username} "
                        f"packs={','.join(selected_pack_keys) if selected_pack_keys else 'ninguno'} "
                        f"permisos={','.join(final_codes) if final_codes else 'ninguno'}"
                    ),
                )
                notice_ok = "Permisos actualizados correctamente."

    active_codes = set(
        selected_user.user_permissions.filter(
            content_type__app_label="tpvapp",
            codename__in=custom_codes,
        ).values_list("codename", flat=True)
    ) if selected_user else set()

    # Packs activos: todos los permisos del pack están activados en el usuario
    active_packs = set()
    for key in ROLE_PACK_KEYS:
        pack_perms = set(PERMISSION_PACKS[key]["permissions"])
        if pack_perms and pack_perms.issubset(active_codes):
            active_packs.add(key)

    # Packs bloqueados: contienen permisos que el actor no puede otorgar
    locked_packs = set()
    for key in ROLE_PACK_KEYS:
        pack_perms = set(PERMISSION_PACKS[key]["permissions"])
        if not pack_perms.issubset(grantable_codes):
            locked_packs.add(key)

    # Categorías de permisos para el template
    permission_categories = []
    from tpvapp.permission_profiles import grouped_permissions, CATEGORY_LABELS
    for cat_key, items in grouped_permissions().items():
        permission_categories.append(
            {
                "label": CATEGORY_LABELS.get(cat_key, cat_key),
                "items": [{"codename": p["codename"], "label": p["label"]} for p in items],
            }
        )

    visible_packs = [(key, PERMISSION_PACKS[key]) for key in ROLE_PACK_KEYS]

    return render(
        request,
        "ui/config/permisos.html",
        {
            "users": users,
            "selected_user": selected_user,
            "permission_packs": visible_packs,
            "permission_categories": permission_categories,
            "active_packs": active_packs,
            "active_codes": active_codes,
            "grantable_codes": grantable_codes,
            "locked_packs": locked_packs,
            "missing_codes": missing_codes,
            "notice_ok": notice_ok,
            "notice_error": notice_error,
            "actor_is_system_user": actor_is_system_user,
        },
    )


def ayuda(request):
    return render(request, "ui/ayuda/index.html")

