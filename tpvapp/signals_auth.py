from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from tpvapp.auditoria import log_info, log_warn, registrar_evento_usuario
from tpvapp.auth_security import register_failed_login, register_success_login


def _request_context(request):
    if request is None:
        return "request=none"

    forwarded_for = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
    else:
        ip = (request.META.get("REMOTE_ADDR") or "").strip() or "unknown"

    method = request.method or "?"
    path = request.path or "?"
    user_agent = (request.META.get("HTTP_USER_AGENT") or "").strip() or "unknown"

    return f"ip={ip} method={method} path={path} ua={user_agent}"


def _failed_identity(credentials):
    if not credentials:
        return "unknown"

    for key in ("username", "email", "user", "login"):
        value = credentials.get(key)
        if value:
            return str(value)
    return "unknown"


@receiver(user_logged_in)
def on_user_logged_in(sender, request, user, **kwargs):
    username = getattr(user, "username", None) or "unknown"
    register_success_login(request, username)
    registrar_evento_usuario(
        user,
        "AUTH_LOGIN_OK",
        _request_context(request),
    )
    message = f"usuario={username} accion=login_ok {_request_context(request)}"
    log_info("auth.login", message)


@receiver(user_logged_out)
def on_user_logged_out(sender, request, user, **kwargs):
    username = getattr(user, "username", None) or "unknown"
    registrar_evento_usuario(
        user,
        "AUTH_LOGOUT",
        _request_context(request),
    )
    message = f"usuario={username} accion=logout {_request_context(request)}"
    log_info("auth.logout", message)


@receiver(user_login_failed)
def on_user_login_failed(sender, credentials, request, **kwargs):
    identity = _failed_identity(credentials)
    security = register_failed_login(request, identity)
    extra = f" fails={security['fails']} bloqueos={security['locks']} etapa={security['stage']}"
    if security["throttle_applied"]:
        extra += f" throttle={security['throttle_applied']}s"
    if security["user_lock_permanent"]:
        extra += " user_lock=permanent"
    elif security["user_lock_applied"]:
        extra += f" user_lock={security['user_lock_applied']}s"
    registrar_evento_usuario(
        None,
        "AUTH_LOGIN_FAILED",
        f"usuario_intento={identity} {_request_context(request)}{extra}",
    )
    message = f"usuario_intento={identity} accion=login_failed {_request_context(request)}{extra}"
    log_warn("auth.login_failed", message)
