"""
Comando de emergencia para resetear la contrasena del superusuario de sistema.

Uso:
    python manage.py recuperar_admin
    python manage.py recuperar_admin --password nueva_clave

Requiere acceso al servidor (consola/SSH). No envia emails ni genera tokens;
la nueva contrasena se muestra directamente en la consola.
"""

import secrets
import string

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


def _generate_password(length=12):
    """Genera una contrasena aleatoria segura."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        # Garantizar al menos una mayuscula, minuscula, digito y especial.
        if (
            any(c.isupper() for c in pwd)
            and any(c.islower() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*" for c in pwd)
        ):
            return pwd


class Command(BaseCommand):
    help = (
        "Resetea la contrasena del superusuario de sistema (is_system_user=True). "
        "Usar solo en caso de emergencia cuando no se puede acceder a la aplicacion."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            type=str,
            default=None,
            help="Nueva contrasena (opcional). Si no se indica, se genera una aleatoria segura.",
        )

    def handle(self, *args, **options):
        User = get_user_model()

        system_user = User.objects.filter(is_system_user=True).first()
        if not system_user:
            raise CommandError(
                "No se encontro ningun superusuario de sistema (is_system_user=True). "
                "Ejecuta 'python manage.py migrate' para crearlo automaticamente."
            )

        new_password = options["password"]
        generated = False

        if not new_password:
            new_password = _generate_password()
            generated = True
        elif len(new_password) < 4:
            raise CommandError("La contrasena debe tener al menos 4 caracteres.")

        system_user.set_password(new_password)
        system_user.is_active = True  # Asegurar que no este desactivado.
        system_user.save(update_fields=["password", "is_active"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("TPV - CONTRASENA DE SISTEMA RESETEADA"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS(f"Usuario   : {system_user.username}"))
        self.stdout.write(self.style.SUCCESS(f"Contrasena: {new_password}"))
        if generated:
            self.stdout.write(self.style.SUCCESS(""))
            self.stdout.write(self.style.SUCCESS("Contrasena generada automaticamente."))
            self.stdout.write(self.style.SUCCESS("Cambiala en Configuracion > Usuarios tras el acceso."))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
