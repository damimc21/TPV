from django.db import models


# =========================
# 7) CONFIGURACION
# =========================

class ConfiguracionTPV(models.Model):
    clave = models.CharField(max_length=50, unique=True)
    valor = models.TextField()
    descripcion = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "configuracion_tpv"

    def __str__(self):
        return self.clave

# =========================
# 8) CONFIGURACION HARDWARE / IMPRESORAS
# =========================

class Impresora(models.Model):
    TIPO_BARRA = 'barra'
    TIPO_COCINA = 'cocina'
    TIPO_CAJA = 'caja'
    TIPO_OTRA = 'otra'

    TIPOS = [
        (TIPO_BARRA, 'Barra'),
        (TIPO_COCINA, 'Cocina'),
        (TIPO_CAJA, 'Caja / Tickets'),
        (TIPO_OTRA, 'Otra'),
    ]

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=20, choices=TIPOS, default=TIPO_CAJA)
    ip_o_puerto = models.CharField(max_length=100, blank=True, null=True, help_text="IP (ej: 192.168.1.50) o Puerto (ej: COM1, USB0)")
    papel_mm = models.IntegerField(default=80, help_text="Ancho de papel en mm (58 o 80)")
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "impresoras"
        verbose_name = "Impresora"
        verbose_name_plural = "Impresoras"

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"
