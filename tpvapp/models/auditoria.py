from django.conf import settings
from django.db import models
from django.utils import timezone


# =========================
# 5) AUDITORIA
# =========================

class EventoAuditoria(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="eventos_auditoria"
    )
    evento = models.CharField(max_length=255)
    fecha = models.DateTimeField(default=timezone.now)
    detalles = models.TextField(blank=True, default="")

    class Meta:
        db_table = "eventos_auditoria"

    def __str__(self):
        return f"{self.fecha} - {self.evento} ({self.usuario})"
