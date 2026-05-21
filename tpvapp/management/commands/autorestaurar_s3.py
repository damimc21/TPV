"""
Management command: autorestaurar_s3

Comprueba si la base de datos esta vacia (sin usuarios) y, si es asi,
descarga el backup mas reciente de S3 y lo restaura con loaddata.

Pensado para ejecutarse en el Job de Kubernetes tras las migraciones,
para que un deploy fresco tras un destroy recupere los datos del ultimo backup.

Uso:
    python manage.py autorestaurar_s3
    python manage.py autorestaurar_s3 --forzar   # restaura aunque haya datos
"""

import logging
import subprocess
import sys
import tempfile
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from tpvapp import s3_utils

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Restaura el ultimo backup de S3 si la BD esta vacia"

    def add_arguments(self, parser):
        parser.add_argument(
            "--forzar",
            action="store_true",
            default=False,
            help="Restaurar aunque la BD ya tenga datos",
        )

    def handle(self, *args, **options):
        User = get_user_model()

        # Comprobar si la BD tiene datos
        tiene_datos = User.objects.exists()
        if tiene_datos and not options["forzar"]:
            self.stdout.write(
                self.style.SUCCESS("BD ya tiene datos, no es necesario restaurar. Saliendo.")
            )
            return

        if not s3_utils._bucket():
            self.stdout.write(
                self.style.WARNING("AWS_STORAGE_BUCKET_NAME no configurado. No se puede restaurar.")
            )
            return

        # Listar backups JSON en S3, ordenados por fecha descendente
        archivos = s3_utils.list_files(s3_utils.S3_PREFIX_BACKUPS)
        json_backups = sorted(
            [f for f in archivos if f["key"].endswith(".json")],
            key=lambda x: x["last_modified"],
            reverse=True,
        )

        if not json_backups:
            self.stdout.write(
                self.style.WARNING("No hay backups JSON en S3. Nada que restaurar.")
            )
            return

        ultimo = json_backups[0]
        s3_key = ultimo["key"]
        self.stdout.write(f"Restaurando desde S3: {s3_key} ...")

        # Descargar
        contenido = s3_utils.download_bytes(s3_key)
        if contenido is None:
            self.stdout.write(self.style.ERROR("Error al descargar el backup de S3."))
            raise SystemExit(1)

        # Guardar en archivo temporal y ejecutar loaddata
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="wb") as f:
            f.write(contenido)
            tmp_path = f.name

        try:
            from django.conf import settings
            result = subprocess.run(
                [sys.executable, "manage.py", "loaddata", tmp_path],
                capture_output=True, text=True, cwd=str(settings.BASE_DIR),
            )
            if result.returncode != 0:
                self.stdout.write(self.style.ERROR(f"loaddata fallo: {result.stderr[:500]}"))
                raise SystemExit(1)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        self.stdout.write(self.style.SUCCESS(f"Restauracion completada desde {s3_key}"))
