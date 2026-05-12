from django.db import models
from django.utils import timezone


# =========================
# 10) LOGS DEL SISTEMA
# =========================

class LogSistema(models.Model):
    """Registro técnico de eventos del servidor: errores, advertencias, info."""
    NIVELES = [
        ('INFO', 'Información'),
        ('WARN', 'Advertencia'),
        ('ERROR', 'Error'),
        ('CRITICAL', 'Crítico'),
    ]

    nivel = models.CharField(max_length=10, choices=NIVELES, default='INFO')
    origen = models.CharField(max_length=100, help_text="Módulo o sección que generó el log")
    mensaje = models.TextField()
    traza = models.TextField(blank=True, default='', help_text="Stack trace (si aplica)")
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "logs_sistema"
        ordering = ["-fecha"]
        verbose_name = "Log del Sistema"
        verbose_name_plural = "Logs del Sistema"

    def __str__(self):
        return f"[{self.nivel}] {self.origen}: {self.mensaje[:80]}"
