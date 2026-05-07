from django.apps import AppConfig


class TpvappConfig(AppConfig):
    name = 'tpvapp'

    def ready(self):
        # Registrar señales de autenticación (login/logout/fallo login).
        import tpvapp.signals_auth  # noqa: F401
        # Registrar señales de inicialización del sistema (superusuario de sistema).
        import tpvapp.signals_system  # noqa: F401
