"""
signals_system.py
-----------------
Senales de inicializacion del sistema TPV.

- post_migrate: garantiza que siempre exista un superusuario de sistema
  (is_system_user=True). Si no existe, lo crea con credenciales por defecto
  y muestra un aviso en consola para que el administrador cambie la contrasena.
"""

import logging

from django.db.models.signals import post_migrate
from django.dispatch import receiver

logger = logging.getLogger("tpvapp.system")

_SYSTEM_USERNAME = "admin"
_SYSTEM_DEFAULT_PASSWORD = "admin"


@receiver(post_migrate)
def crear_superusuario_sistema(sender, **kwargs):
    """
    Tras cada migrate, comprueba si existe un superusuario de sistema.
    Si no hay ninguno, lo crea con credenciales por defecto.
    Solo actua cuando el sender es la app 'tpvapp' para evitar
    ejecutarse multiples veces (una por cada app migrada).
    """
    if sender.name != "tpvapp":
        return

    try:
        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Comprobar si ya existe algun superusuario de sistema.
        if User.objects.filter(is_system_user=True).exists():
            return

        user = User(
            username=_SYSTEM_USERNAME,
            is_superuser=True,
            is_staff=True,
            is_active=True,
            is_system_user=True,
        )
        user.set_password(_SYSTEM_DEFAULT_PASSWORD)
        user.save()

        # Guardar el flag directamente por si otra senal usa update_fields.
        User.objects.filter(pk=user.pk).update(is_system_user=True)

        logger.warning(
            "SISTEMA: Superusuario de sistema creado automaticamente. "
            "Usuario: '%s' | Contrasena inicial: '%s' | "
            "CAMBIA LA CONTRASENA INMEDIATAMENTE.",
            _SYSTEM_USERNAME,
            _SYSTEM_DEFAULT_PASSWORD,
        )

        print(
            "\n"
            "============================================================\n"
            "TPV - SUPERUSUARIO DE SISTEMA CREADO\n"
            "============================================================\n"
            f"Usuario   : {_SYSTEM_USERNAME}\n"
            f"Contrasena: {_SYSTEM_DEFAULT_PASSWORD}\n"
            "\n"
            "Cambia la contrasena en Configuracion > Usuarios.\n"
            "============================================================\n"
        )

    except Exception as exc:  # noqa: BLE001
        # No dejar que un error aqui rompa el migrate.
        logger.error("SISTEMA: Error al crear superusuario de sistema: %s", exc)
