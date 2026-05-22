from django.conf import settings
from django.db import models
from django.utils import timezone

from .catalogo import Cliente
from .operativa import Comanda


# =========================
# 4) FACTURACION / PAGOS
# =========================

class Factura(models.Model):
    PAGO_EFECTIVO = "efectivo"
    PAGO_TARJETA = "tarjeta"
    TIPOS_PAGO = [
        (PAGO_EFECTIVO, "Efectivo"),
        (PAGO_TARJETA, "Tarjeta"),
    ]

    FACT_SIMPLIFICADA = "Simplificada"
    FACT_COMPLETA = "Completa"
    TIPOS_FACTURA = [
        (FACT_SIMPLIFICADA, "Simplificada"),
        (FACT_COMPLETA, "Completa"),
    ]

    ESTADO_EMITIDA = "emitida"
    ESTADO_ANULADA = "anulada"
    ESTADO_PAGADA = "pagada"
    ESTADOS = [
        (ESTADO_EMITIDA, "Emitida"),
        (ESTADO_ANULADA, "Anulada"),
        (ESTADO_PAGADA, "Pagada"),
    ]

    comanda = models.ForeignKey(Comanda, on_delete=models.SET_NULL, null=True, related_name="facturas")
    cliente = models.ForeignKey(Cliente, on_delete=models.SET_NULL, null=True, blank=True, related_name="facturas")
    sesion = models.ForeignKey('SesionCaja', on_delete=models.SET_NULL, null=True, blank=True, related_name="facturas")

    tipo_pago = models.CharField(max_length=10, choices=TIPOS_PAGO, default=PAGO_EFECTIVO)
    tipo_factura = models.CharField(max_length=20, choices=TIPOS_FACTURA, default=FACT_SIMPLIFICADA)

    emitida_a = models.DateTimeField(default=timezone.now)
    emitida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="facturas_emitidas"
    )

    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    impuestos = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    efectivo_entregado = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cambio = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    estado = models.CharField(max_length=10, choices=ESTADOS, default=ESTADO_EMITIDA)
    email_enviado = models.BooleanField(default=False)

    # Datos de facturación para clientes ocasionales (sin FK en BD)
    # Formato: {"nombre": "...", "nif": "...", "direccion": "...", "cp": "...", "poblacion": "...", "provincia": "...", "email": "...", "telefono": "..."}
    datos_facturacion = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "facturas"

    def __str__(self):
        return f"Factura #{self.id} (Comanda #{self.comanda_id})"


class Pago(models.Model):
    PAGO_EFECTIVO = "efectivo"
    PAGO_TARJETA = "tarjeta"
    TIPOS_PAGO = [
        (PAGO_EFECTIVO, "Efectivo"),
        (PAGO_TARJETA, "Tarjeta"),
    ]

    factura = models.ForeignKey(Factura, on_delete=models.CASCADE, related_name="pagos")
    sesion = models.ForeignKey('SesionCaja', on_delete=models.SET_NULL, null=True, blank=True, related_name="pagos")
    cantidad = models.DecimalField(max_digits=10, decimal_places=2)

    metodo_pago = models.CharField(max_length=10, choices=TIPOS_PAGO, default=PAGO_EFECTIVO)
    pagado_a = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "pagos"

    def __str__(self):
        return f"Pago #{self.id} - {self.cantidad} ({self.metodo_pago})"
