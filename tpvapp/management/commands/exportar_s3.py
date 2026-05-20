"""
Management command: exportar_s3

Exporta los logs del sistema y los eventos de auditoria de las ultimas N horas
a Amazon S3 como archivos JSON. Pensado para ejecutarse diariamente via CronJob
de Kubernetes.

Uso:
    python manage.py exportar_s3             # ultimas 25h (margen de seguridad)
    python manage.py exportar_s3 --horas 48  # ultimas 48h
    python manage.py exportar_s3 --todo      # exporta todo sin limite de fecha
"""

import json
import logging

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from tpvapp.models import LogSistema, EventoAuditoria
from tpvapp import s3_utils

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Exporta logs y auditoria a S3 como JSON"

    def add_arguments(self, parser):
        parser.add_argument(
            "--horas",
            type=int,
            default=25,
            help="Exportar registros de las ultimas N horas (por defecto 25)",
        )
        parser.add_argument(
            "--todo",
            action="store_true",
            default=False,
            help="Exportar todos los registros sin limite de fecha",
        )

    def handle(self, *args, **options):
        if not s3_utils._bucket():
            self.stdout.write(self.style.WARNING(
                "AWS_STORAGE_BUCKET_NAME no configurado. No se exporta nada."
            ))
            return

        horas = options["horas"]
        todo = options["todo"]

        if todo:
            desde = None
            self.stdout.write("Exportando todos los registros a S3...")
        else:
            desde = timezone.now() - timedelta(hours=horas)
            self.stdout.write(f"Exportando registros de las ultimas {horas}h a S3...")

        fecha_str = timezone.now().strftime("%Y%m%d_%H%M%S")
        errores = []

        # ---- Logs del sistema ----
        try:
            qs_logs = LogSistema.objects.order_by("-fecha")
            if desde:
                qs_logs = qs_logs.filter(fecha__gte=desde)

            datos_logs = [
                {
                    "id": l.id,
                    "fecha": l.fecha.isoformat(),
                    "nivel": l.nivel,
                    "origen": l.origen,
                    "mensaje": l.mensaje,
                    "traza": l.traza or "",
                }
                for l in qs_logs
            ]

            s3_key_logs = f"{s3_utils.S3_PREFIX_LOGS}logs_{fecha_str}.json"
            ok = s3_utils.upload_json(
                {"exportado_en": timezone.now().isoformat(), "registros": datos_logs},
                s3_key_logs,
            )
            if ok:
                self.stdout.write(self.style.SUCCESS(
                    f"  Logs: {len(datos_logs)} registros -> s3://{s3_utils._bucket()}/{s3_key_logs}"
                ))
            else:
                errores.append("logs")
                self.stdout.write(self.style.ERROR("  Logs: error al subir a S3"))
        except Exception as e:
            errores.append("logs")
            self.stdout.write(self.style.ERROR(f"  Logs: excepcion: {e}"))
            logger.exception("exportar_s3: error exportando logs")

        # ---- Auditoria ----
        try:
            qs_audit = EventoAuditoria.objects.select_related("usuario").order_by("-fecha")
            if desde:
                qs_audit = qs_audit.filter(fecha__gte=desde)

            datos_audit = [
                {
                    "id": e.id,
                    "fecha": e.fecha.isoformat(),
                    "usuario": e.usuario.username if e.usuario else None,
                    "evento": e.evento,
                    "detalles": e.detalles,
                }
                for e in qs_audit
            ]

            s3_key_audit = f"{s3_utils.S3_PREFIX_AUDITORIA}auditoria_{fecha_str}.json"
            ok = s3_utils.upload_json(
                {"exportado_en": timezone.now().isoformat(), "registros": datos_audit},
                s3_key_audit,
            )
            if ok:
                self.stdout.write(self.style.SUCCESS(
                    f"  Auditoria: {len(datos_audit)} registros -> s3://{s3_utils._bucket()}/{s3_key_audit}"
                ))
            else:
                errores.append("auditoria")
                self.stdout.write(self.style.ERROR("  Auditoria: error al subir a S3"))
        except Exception as e:
            errores.append("auditoria")
            self.stdout.write(self.style.ERROR(f"  Auditoria: excepcion: {e}"))
            logger.exception("exportar_s3: error exportando auditoria")

        if errores:
            raise SystemExit(f"Exportacion completada con errores en: {', '.join(errores)}")
        else:
            self.stdout.write(self.style.SUCCESS("Exportacion a S3 completada correctamente."))
