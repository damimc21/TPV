from django.core.management.base import BaseCommand, CommandError

from tpvapp.auth_security import clear_ip_throttle, clear_user_lock


class Command(BaseCommand):
    help = "Limpia bloqueo de login para un usuario (y opcionalmente throttle por IP)."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Usuario a desbloquear")
        parser.add_argument(
            "--ip",
            required=False,
            help="IP para limpiar throttle usuario+IP (opcional)",
        )

    def handle(self, *args, **options):
        username = (options.get("username") or "").strip()
        ip = (options.get("ip") or "").strip()

        if not username:
            raise CommandError("Debes indicar --username")

        clear_user_lock(username)
        if ip:
            clear_ip_throttle(username, ip)

        if ip:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Desbloqueado usuario '{username}' y limpiado throttle para IP {ip}."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Desbloqueado usuario '{username}'."
                )
            )
