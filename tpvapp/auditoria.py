"""
Helper centralizado para auditoria y logs de sistema.
"""
import traceback

from tpvapp.models import EventoAuditoria, LogSistema


def _safe_text(value, max_len=4000):
    text = "" if value is None else str(value)
    return text[:max_len]


def _trace_from_exception(exc):
    if not exc:
        return ""
    return _safe_text(traceback.format_exc(), max_len=12000)


def registrar(usuario, evento, detalles=""):
    """Registra un evento de auditoria sin romper el flujo si falla."""
    try:
        EventoAuditoria.objects.create(
            usuario=usuario,
            evento=_safe_text(evento, max_len=255),
            detalles=_safe_text(detalles, max_len=4000),
        )
    except Exception:
        # Nunca tumbar la operativa por un fallo en auditoria.
        pass


def log(nivel, origen, mensaje, traza=""):
    """Registra un log tecnico sin romper el flujo si falla."""
    try:
        LogSistema.objects.create(
            nivel=_safe_text((nivel or "INFO").upper(), max_len=10),
            origen=_safe_text(origen or "app", max_len=100),
            mensaje=_safe_text(mensaje, max_len=4000),
            traza=_safe_text(traza, max_len=12000),
        )
    except Exception:
        # Nunca tumbar la operativa por un fallo en logs.
        pass


def log_info(origen, mensaje):
    log("INFO", origen, mensaje)


def log_warn(origen, mensaje):
    log("WARN", origen, mensaje)


def log_error(origen, mensaje, exc=None):
    log("ERROR", origen, mensaje, _trace_from_exception(exc))


def log_critical(origen, mensaje, exc=None):
    log("CRITICAL", origen, mensaje, _trace_from_exception(exc))


def registrar_evento_usuario(
    usuario,
    evento,
    detalles="",
    *,
    origen_log=None,
    nivel_log="INFO",
):
    """
    Registra un evento funcional de auditoria y, opcionalmente, un log tecnico.
    """
    registrar(usuario, evento, detalles)

    if not origen_log:
        return

    username = getattr(usuario, "username", None) or "anon"
    mensaje = f"usuario={username} evento={evento}"
    if detalles:
        mensaje += f" detalles={detalles}"

    nivel = (nivel_log or "INFO").upper()
    if nivel == "WARN":
        log_warn(origen_log, mensaje)
    elif nivel in ("ERROR", "CRITICAL"):
        # No hay excepcion asociada aqui, solo evento de negocio.
        log(nivel, origen_log, mensaje)
    else:
        log_info(origen_log, mensaje)
