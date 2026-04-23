from tpvapp.auditoria import log_critical


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
