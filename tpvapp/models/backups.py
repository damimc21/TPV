from django.conf import settings
from django.db import models
from django.utils import timezone


# =========================
# 11) BACKUPS
# =========================

class BackupRegistro(models.Model):
    """Registro de backups creados (manuales o automáticos)."""
    TIPO_MANUAL = 'manual'
    TIPO_AUTO = 'auto'
    TIPOS = [
        (TIPO_MANUAL, 'Manual'),
        (TIPO_AUTO, 'Automático'),
    ]

    nombre_archivo = models.CharField(max_length=255)
    ruta = models.CharField(max_length=500, help_text="Ruta relativa dentro de media/backups/")
    tamano_bytes = models.BigIntegerField(default=0)
    tipo = models.CharField(max_length=10, choices=TIPOS, default=TIPO_MANUAL)
    fecha = models.DateTimeField(default=timezone.now)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="backups_creados"
    )
    notas = models.TextField(blank=True, default='')

    class Meta:
        db_table = "backup_registros"
        ordering = ["-fecha"]
        verbose_name = "Backup"
        verbose_name_plural = "Backups"

    def __str__(self):
        return f"{self.nombre_archivo} ({self.get_tipo_display()}) - {self.fecha.strftime('%d/%m/%Y %H:%M')}"

    @property
    def tamano_legible(self):
        """Devuelve el tamaño en formato legible (KB, MB, GB)."""
        b = self.tamano_bytes
        if b < 1024:
            return f"{b} B"
        elif b < 1024 ** 2:
            return f"{b / 1024:.1f} KB"
        elif b < 1024 ** 3:
            return f"{b / 1024 ** 2:.1f} MB"
        return f"{b / 1024 ** 3:.2f} GB"
