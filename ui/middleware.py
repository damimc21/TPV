import re

from tpvapp.auditoria import log_critical, log_warn, log_error, registrar


_LANG_PREFIX_RE = re.compile(r"^[a-z]{2}(?:-[a-z]{2})?$", re.IGNORECASE)
_ID_TOKEN_RE = re.compile(r"^[0-9a-f-]{8,}$", re.IGNORECASE)

_EXACT_EVENT_RULES = {
    ("POST", "/logout/"): ("AUTH_LOGOUT_SOLICITAR", "auth"),
    ("POST", "/i18n/setlang/"): ("UI_IDIOMA_CAMBIAR", "ui"),

    ("POST", "/api/dia/abrir/"): ("CAJA_JORNADA_ABRIR", "caja"),
    ("POST", "/api/dia/cerrar/"): ("CAJA_JORNADA_CERRAR", "caja"),
    ("POST", "/api/dia/reabrir/{id}/"): ("CAJA_JORNADA_REABRIR", "caja"),
    ("POST", "/api/caja/abrir/"): ("CAJA_TURNO_ABRIR", "caja"),
    ("POST", "/api/caja/cerrar/"): ("CAJA_TURNO_CERRAR", "caja"),
    ("POST", "/api/caja/movimiento/"): ("CAJA_MOVIMIENTO_REGISTRAR", "caja"),
    ("POST", "/api/caja/reabrir/{id}/"): ("CAJA_TURNO_REABRIR", "caja"),

    ("POST", "/api/configuracion/update/"): ("CONFIG_GLOBAL_ACTUALIZAR", "config"),
    ("POST", "/config/seguridad/"): ("CONFIG_SEGURIDAD_GUARDAR", "config"),
    ("POST", "/config/usuarios/"): ("CONFIG_USUARIOS_GESTIONAR", "config"),
    ("POST", "/config/permisos/"): ("CONFIG_PERMISOS_GESTIONAR", "config"),
    ("POST", "/config/maps/{id}/activate/"): ("CONFIG_MAPA_ACTIVAR", "config"),
    ("POST", "/api/maps/{id}/save/"): ("CONFIG_MAPA_GUARDAR", "config"),
    ("POST", "/api/maps/{id}/activate/"): ("CONFIG_MAPA_ACTIVAR_API", "config"),
    ("POST", "/api/maps/{id}/delete/"): ("CONFIG_MAPA_ELIMINAR", "config"),

    ("POST", "/api/ficheros/backup/crear/"): ("FICHEROS_BACKUP_CREAR", "ficheros"),
    ("POST", "/api/ficheros/backup/restaurar/"): ("FICHEROS_BACKUP_RESTAURAR", "ficheros"),
    ("POST", "/api/ficheros/importar-productos/"): ("FICHEROS_PRODUCTOS_IMPORTAR", "ficheros"),
    ("POST", "/api/ficheros/importar-inventario/"): ("FICHEROS_INVENTARIO_IMPORTAR", "ficheros"),
    ("POST", "/api/ficheros/logs/limpiar/"): ("FICHEROS_LOGS_LIMPIAR", "ficheros"),

    ("POST", "/api/mesas/abrir-comanda-por-numero/"): ("TPV_MESA_ABRIR_COMANDA", "tpv"),
    ("POST", "/api/mesas/{id}/enviar/"): ("TPV_COMANDA_ENVIAR", "tpv"),
    ("POST", "/api/mesas/{id}/asignar-cliente/"): ("TPV_COMANDA_ASIGNAR_CLIENTE", "tpv"),
    ("POST", "/api/mesas/{id}/traspasar/"): ("TPV_COMANDA_TRASPASAR", "tpv"),
    ("POST", "/api/mesas/{id}/cobrar/"): ("TPV_COMANDA_COBRAR", "tpv"),
    ("POST", "/api/mesas/{id}/comprobante/"): ("TPV_COMANDA_COMPROBANTE", "tpv"),
    ("POST", "/api/mesas/{id}/total/"): ("TPV_COMANDA_TOTAL", "tpv"),
    ("POST", "/api/facturas/{id}/pagar/"): ("TPV_FACTURA_PAGAR", "tpv"),

    ("POST", "/api/productos/{id}/plantilla/"): ("CATALOGO_PRODUCTO_PLANTILLA_GUARDAR", "catalogo"),
    ("POST", "/api/plantillas-inventario/importar/"): ("STOCK_PLANTILLA_IMPORTAR", "stock"),
    ("POST", "/api/articulos-inventario/{id}/ajustar/"): ("STOCK_ARTICULO_AJUSTAR", "stock"),
}

_RESOURCE_EVENT_RULES = {
    "departamentos": ("catalogo", "DEPARTAMENTO"),
    "productos": ("catalogo", "PRODUCTO"),
    "clientes": ("clientes", "CLIENTE"),
    "comandas": ("tpv", "COMANDA"),
    "lineas": ("tpv", "LINEA_COMANDA"),
    "facturas": ("tpv", "FACTURA"),
    "perfiles-comentarios": ("catalogo", "PERFIL_COMENTARIO"),
    "comentarios": ("catalogo", "COMENTARIO"),
    "perfiles-suplementos": ("catalogo", "PERFIL_SUPLEMENTO"),
    "suplementos": ("catalogo", "SUPLEMENTO"),
    "movimientos-stock": ("stock", "MOVIMIENTO"),
    "categorias-inventario": ("stock", "CATEGORIA"),
    "articulos-inventario": ("stock", "ARTICULO"),
}


def _client_ip(request):
    forwarded_for = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return (request.META.get("REMOTE_ADDR") or "").strip() or "unknown"


def _normalized_path(path):
    raw = (path or "/").strip()
    parts = [p for p in raw.split("/") if p]
    if parts and _LANG_PREFIX_RE.match(parts[0]):
        parts = parts[1:]

    normalized = []
    for part in parts:
        token = (part or "").strip()
        if token.isdigit() or _ID_TOKEN_RE.match(token):
            normalized.append("{id}")
        else:
            normalized.append(token.lower())

    if not normalized:
        return "/"
    return "/" + "/".join(normalized) + "/"


def _event_from_request(method, normalized_path):
    tokens = [t for t in normalized_path.strip("/").split("/") if t]
    if not tokens:
        tokens = ["root"]

    event_tokens = []
    for token in tokens[:8]:
        if token == "{id}":
            event_tokens.append("ID")
            continue
        cleaned = re.sub(r"[^a-z0-9]+", "_", token).strip("_").upper()
        event_tokens.append(cleaned or "NA")

    return (f"ACCION_{method.upper()}_" + "_".join(event_tokens))[:255]


def _resource_event(method, normalized_path):
    tokens = [t for t in normalized_path.strip("/").split("/") if t]
    if len(tokens) < 2 or tokens[0] != "api":
        return None, None

    resource = tokens[1]
    rule = _RESOURCE_EVENT_RULES.get(resource)
    if not rule:
        return None, None

    modulo, entidad = rule
    modulo_tag = modulo.upper()

    if len(tokens) == 2 and method == "POST":
        return f"{modulo_tag}_{entidad}_CREAR", modulo

    if len(tokens) == 3 and tokens[2] == "{id}":
        if method in ("PUT", "PATCH"):
            return f"{modulo_tag}_{entidad}_ACTUALIZAR", modulo
        if method == "DELETE":
            return f"{modulo_tag}_{entidad}_ELIMINAR", modulo

    return None, None


def _event_and_module(method, normalized_path):
    exact = _EXACT_EVENT_RULES.get((method, normalized_path))
    if exact:
        return exact

    resource_event = _resource_event(method, normalized_path)
    if resource_event[0]:
        return resource_event

    if normalized_path.startswith("/api/ficheros/"):
        return _event_from_request(method, normalized_path), "ficheros"
    if normalized_path.startswith("/api/caja/") or normalized_path.startswith("/api/dia/"):
        return _event_from_request(method, normalized_path), "caja"
    if normalized_path.startswith("/api/"):
        return _event_from_request(method, normalized_path), "api"
    return _event_from_request(method, normalized_path), "ui"


class AuditActionMiddleware:
    """
    Capa global de auditoria:
    - Audita acciones mutables de usuarios autenticados (POST/PUT/PATCH/DELETE)
    - Deja logs tecnicos para respuestas 4xx/5xx
    """

    TRACK_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    SKIP_PATH_PREFIXES = ("/static/", "/admin/")
    SKIP_PATHS = {
        "/api/ficheros/logs/ui-evento/",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        self._track_action(request, response)
        return response

    def _track_action(self, request, response):
        method = (request.method or "").upper()
        if method not in self.TRACK_METHODS:
            return

        path = _normalized_path(getattr(request, "path", "/"))
        if path in self.SKIP_PATHS:
            return
        if any(path.startswith(prefix) for prefix in self.SKIP_PATH_PREFIXES):
            return

        status_code = int(getattr(response, "status_code", 200) or 200)
        result = "ok" if status_code < 400 else "error"
        ip = _client_ip(request)
        event, modulo = _event_and_module(method, path)
        details = (
            f"modulo={modulo} metodo={method} path={path} "
            f"status={status_code} resultado={result} ip={ip}"
        )

        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            registrar(user, event, details)

        username = user.username if getattr(user, "is_authenticated", False) else "anon"
        tech_message = (
            f"usuario={username} modulo={modulo} evento={event} "
            f"status={status_code} path={path} ip={ip}"
        )

        if status_code >= 500:
            log_error("http.action", tech_message)
        elif status_code >= 400:
            log_warn("http.action", tech_message)


class SystemErrorLoggingMiddleware:
    """
    Registra excepciones no controladas en logs_sistema sin alterar
    el comportamiento normal de Django (la excepción se vuelve a lanzar).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except Exception as exc:
            user = getattr(request, "user", None)
            username = user.username if getattr(user, "is_authenticated", False) else "anon"
            message = (
                f"Unhandled exception {exc.__class__.__name__} "
                f"en {request.method} {request.path} usuario={username}: {exc}"
            )
            log_critical("http.unhandled", message, exc=exc)
            raise
