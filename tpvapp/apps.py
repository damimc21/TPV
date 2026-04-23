from django.apps import AppConfig


class TpvappConfig(AppConfig):
    name = 'tpvapp'

    def ready(self):
        # Registrar señales de autenticación (login/logout/fallo login).
        import tpvapp.signals_auth  # noqa: F401
