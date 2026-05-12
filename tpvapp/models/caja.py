from django.conf import settings
from django.db import models
from django.utils import timezone


# =========================
# 6) GESTION DE CAJA
# =========================

class DiaContable(models.Model):
    """Representa una jornada de negocio completa."""
    fecha_apertura = models.DateTimeField(default=timezone.now)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    abierta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="dias_abiertos"
    )
    cerrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="dias_cerrados"
    )

    class Meta:
        db_table = "dias_contables"
        ordering = ["-fecha_apertura"]

    @property
    def activo(self):
        return self.fecha_cierre is None

    def __str__(self):
        return f"Día {self.fecha_apertura.strftime('%d/%m/%Y')}"


class SesionCaja(models.Model):
    """Representa un turno de caja (ej: Mañana, Tarde) dentro de un Día Contable."""
    dia = models.ForeignKey(DiaContable, on_delete=models.CASCADE, related_name="sesiones", null=True, blank=True)

    abierta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="sesiones_abiertas"
    )
    cerrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="sesiones_cerradas"
    )

    fecha_apertura = models.DateTimeField(default=timezone.now)
    fecha_cierre = models.DateTimeField(null=True, blank=True)

    efectivo_inicial = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    # Totales del sistema al momento de cerrar
    total_ventas_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_ventas_tarjeta = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    # Arqueo final
    efectivo_final_real = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    observaciones = models.TextField(blank=True, default="")

    @property
    def activa(self):
        return self.fecha_cierre is None

    class Meta:
        db_table = "sesiones_caja"
        ordering = ["-fecha_apertura"]

    def __str__(self):
        estado = "Abierta" if self.activa else "Cerrada"
        return f"Turno #{self.id} ({estado}) - {self.fecha_apertura.strftime('%d/%m/%Y %H:%M')}"


class MovimientoCaja(models.Model):
    """Entradas o salidas de efectivo manuales."""
    sesion = models.ForeignKey(SesionCaja, on_delete=models.CASCADE, related_name="movimientos")
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    tipo = models.CharField(max_length=10, choices=[("entrada", "Entrada"), ("salida", "Salida")])
    importe = models.DecimalField(max_digits=10, decimal_places=2)
    concepto = models.CharField(max_length=255)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "movimientos_caja"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.tipo.upper()}: {self.importe}€ - {self.concepto}"
