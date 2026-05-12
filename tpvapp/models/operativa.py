from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .catalogo import Cliente, Producto


# =========================
# 3) OPERATIVA: Mesas / Comandas / Líneas
# =========================

class Mesa(models.Model):
    ESTADO_LIBRE = "libre"
    ESTADO_OCUPADA = "ocupada"
    ESTADO_PAGANDO = "pagando"

    ESTADOS = [
        (ESTADO_LIBRE, "Libre"),
        (ESTADO_OCUPADA, "Ocupada"),
        (ESTADO_PAGANDO, "Pagando"),
    ]

    numero = models.PositiveBigIntegerField(unique=True)
    nombre = models.CharField(max_length=50, unique=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default=ESTADO_LIBRE)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "mesas"

    def save(self, *args, **kwargs):
        # Si no se pasa nombre, lo generamos automáticamente.
        if not self.nombre:
            self.nombre = f"MESA {self.numero}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nombre


class Comanda(models.Model):
    ESTADO_ABIERTA = "abierta"
    ESTADO_PAGADA = "pagada"
    ESTADO_ANULADA = "anulada"

    ESTADOS = [
        (ESTADO_ABIERTA, "Abierta"),
        (ESTADO_PAGADA, "Pagada"),
        (ESTADO_ANULADA, "Anulada"),
    ]

    mesa = models.ForeignKey(Mesa, on_delete=models.SET_NULL, null=True, related_name="comandas")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="comandas"
    )
    cliente = models.ForeignKey(Cliente, on_delete=models.SET_NULL, null=True, blank=True, related_name="comandas")

    abierta_a = models.DateTimeField(default=timezone.now)
    cerrada_a = models.DateTimeField(null=True, blank=True)

    estado = models.CharField(max_length=10, choices=ESTADOS, default=ESTADO_ABIERTA)

    comprobante_impreso_a = models.DateTimeField(null=True, blank=True)
    comprobante_impreso_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="comprobantes_impresos"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["mesa"],
                condition=Q(estado="abierta"),
                name="unique_comanda_abierta_por_mesa",
            )
        ]

        db_table = "comandas"

    def __str__(self):
        return f"Comanda #{self.id} - {self.mesa}"

    @property
    def tiene_comprobante(self) -> bool:
        return self.comprobante_impreso_a is not None

    @property
    def total_calculado(self):
        return sum(l.total for l in self.lineas.filter(anulado=False))


class LineaComanda(models.Model):
    comanda = models.ForeignKey(Comanda, on_delete=models.CASCADE, related_name="lineas")
    producto = models.ForeignKey(Producto, on_delete=models.SET_NULL, null=True, blank=True)

    cantidad = models.IntegerField(default=1)

    # Snapshot: importante para histórico
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    producto_nombre = models.CharField(max_length=100)

    descuento = models.DecimalField(max_digits=5, decimal_places=2, default=0.00) # Porcentaje 0-100

    # Snapshot de configuración para productos configurables
    configuracion_json = models.JSONField(null=True, blank=True, default=None)

    anulado = models.BooleanField(default=False)
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="lineas_anuladas"
    )
    anulado_a = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lineas_comanda"

    @property
    def total(self):
        subtotal = self.cantidad * self.precio_unitario
        if self.descuento > 0:
            return subtotal * (1 - (self.descuento / 100))
        return subtotal

    def __str__(self):
        return f"{self.cantidad}x {self.producto_nombre} (Comanda #{self.comanda_id})"
