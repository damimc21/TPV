from django.conf import settings
from django.db import models
from django.utils import timezone

from .catalogo import Producto
from .operativa import LineaComanda


# =========================
# 9) GESTIÓN DE STOCK / INVENTARIO
# =========================

class CategoriaInventario(models.Model):
    """Categoría para agrupar artículos de inventario (Cafetería, Cocina, Bebidas...)"""
    nombre = models.CharField(max_length=100)
    orden = models.IntegerField(default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "categorias_inventario"
        ordering = ['orden', 'nombre']
        verbose_name = "Categoría de Inventario"
        verbose_name_plural = "Categorías de Inventario"

    def __str__(self):
        return self.nombre


class Proveedor(models.Model):
    """Proveedor reutilizable para articulos de inventario."""
    nombre = models.CharField(max_length=150, unique=True)
    contacto = models.CharField(max_length=120, blank=True, default='')
    telefono = models.CharField(max_length=40, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    nif = models.CharField(max_length=30, blank=True, default='')
    notas = models.TextField(blank=True, default='')
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "proveedores"
        ordering = ['nombre']
        verbose_name = "Proveedor"
        verbose_name_plural = "Proveedores"

    def __str__(self):
        return self.nombre


class ArticuloInventario(models.Model):
    """Artículo de inventario (materia prima / ingrediente) que se controla de forma independiente."""
    UNIDADES = [
        ('ud', 'Unidades'),
        ('pack', 'Packs'),
        ('caja', 'Cajas'),
        ('kg', 'Kilos'),
        ('g', 'Gramos'),
        ('l', 'Litros'),
        ('ml', 'Mililitros'),
    ]

    nombre = models.CharField(max_length=150)
    categoria = models.ForeignKey(
        CategoriaInventario, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='articulos'
    )
    unidad = models.CharField(max_length=5, choices=UNIDADES, default='ud')

    # Stock
    stock_actual = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    stock_minimo = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Vínculo opcional a Producto (para descuento automático al vender)
    producto_vinculado = models.OneToOneField(
        Producto, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='articulo_inventario'
    )
    auto_descontar = models.BooleanField(
        default=False,
        verbose_name="Descontar al vender",
        help_text="Si está activo, se descuenta stock automáticamente al vender el producto vinculado"
    )
    cantidad_por_venta = models.DecimalField(
        max_digits=10, decimal_places=2, default=1,
        verbose_name="Cantidad por venta",
        help_text="Unidades que se descuentan por cada venta del producto vinculado"
    )

    # Info adicional
    proveedor = models.CharField(max_length=150, blank=True, default='')
    proveedor_ref = models.ForeignKey(
        Proveedor, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='articulos'
    )
    precio_compra = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        verbose_name="Precio de compra por unidad"
    )
    notas = models.TextField(blank=True, default='')

    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "articulos_inventario"
        ordering = ['categoria__orden', 'nombre']
        verbose_name = "Artículo de Inventario"
        verbose_name_plural = "Artículos de Inventario"

    def __str__(self):
        return f"{self.nombre} ({self.get_unidad_display()})"


class MovimientoStock(models.Model):
    TIPO_ENTRADA = "entrada"
    TIPO_SALIDA = "salida"
    TIPO_VENTA = "venta"
    TIPO_AJUSTE = "ajuste"
    TIPO_ANULACION = "anulad"

    TIPOS = [
        (TIPO_ENTRADA, "Entrada (Compra/Reposición)"),
        (TIPO_SALIDA, "Salida (Mermas/Roturas)"),
        (TIPO_VENTA, "Venta (Automático)"),
        (TIPO_AJUSTE, "Ajuste de Inventario"),
        (TIPO_ANULACION, "Anulación de Venta"),
    ]

    # FK a Producto (legacy / descuento directo por venta)
    producto = models.ForeignKey(Producto, on_delete=models.CASCADE, null=True, blank=True, related_name="movimientos_stock")
    # FK a ArticuloInventario (nuevo sistema de inventario)
    articulo = models.ForeignKey(ArticuloInventario, on_delete=models.CASCADE, null=True, blank=True, related_name="movimientos")

    tipo = models.CharField(max_length=10, choices=TIPOS)
    cantidad = models.DecimalField(max_digits=10, decimal_places=2)
    anterior = models.DecimalField(max_digits=10, decimal_places=2) # Stock antes del movimiento
    nuevo = models.DecimalField(max_digits=10, decimal_places=2)    # Stock después del movimiento

    fecha = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    motivo = models.CharField(max_length=255, blank=True, null=True)

    # Opcional: enlace a la línea de comanda que originó el movimiento (si es tipo venta)
    linea_comanda = models.ForeignKey(LineaComanda, on_delete=models.SET_NULL, null=True, blank=True, related_name="movimientos_stock")

    class Meta:
        db_table = "movimientos_stock"
        ordering = ["-fecha"]

    def __str__(self):
        nombre = self.articulo.nombre if self.articulo else (self.producto.nombre if self.producto else "?")
        return f"{self.get_tipo_display()} - {nombre}: {self.cantidad}"


class DocumentoProveedor(models.Model):
    TIPO_ALBARAN = "albaran"
    TIPO_FACTURA = "factura"
    TIPOS = [
        (TIPO_ALBARAN, "Albaran"),
        (TIPO_FACTURA, "Factura"),
    ]

    ESTADO_PENDIENTE = "pendiente"
    ESTADO_RECIBIDO = "recibido"
    ESTADO_CONTABILIZADO = "contabilizado"
    ESTADO_PAGADO = "pagado"
    ESTADOS = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_RECIBIDO, "Recibido"),
        (ESTADO_CONTABILIZADO, "Contabilizado"),
        (ESTADO_PAGADO, "Pagado"),
    ]

    tipo = models.CharField(max_length=12, choices=TIPOS)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.SET_NULL, null=True, blank=True, related_name="documentos")
    proveedor_nombre = models.CharField(max_length=150, blank=True, default="")
    numero = models.CharField(max_length=80, blank=True, default="")
    fecha = models.DateField(default=timezone.localdate)
    vencimiento = models.DateField(null=True, blank=True)
    concepto = models.CharField(max_length=255, blank=True, default="")
    base = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    impuestos = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=ESTADOS, default=ESTADO_PENDIENTE)
    notas = models.TextField(blank=True, default="")
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="documentos_proveedor_creados")
    creado_a = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "documentos_proveedor"
        ordering = ["-fecha", "-id"]
        verbose_name = "Documento de proveedor"
        verbose_name_plural = "Documentos de proveedor"

    def save(self, *args, **kwargs):
        if self.proveedor and not self.proveedor_nombre:
            self.proveedor_nombre = self.proveedor.nombre
        super().save(*args, **kwargs)

    def __str__(self):
        proveedor = self.proveedor_nombre or (self.proveedor.nombre if self.proveedor else "Sin proveedor")
        return f"{self.get_tipo_display()} {self.numero or '#'+str(self.pk or '')} - {proveedor}"
