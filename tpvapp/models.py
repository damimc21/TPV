from django.db import models
from django.db.models import Q
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.utils import timezone

# Create your models here.

# =========================
# 1) USUARIOS (Django User)
# =========================

class Usuario(AbstractUser):
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.username


# =========================
# 2) CATALOGO: Departamentos y Productos
# =========================

class Departamento(models.Model):
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    # M2M con Perfiles (se definen aquí para evitar forward-references)
    perfiles_comentarios = models.ManyToManyField(
        'PerfilComentarios', blank=True, related_name='departamentos'
    )
    perfiles_suplementos = models.ManyToManyField(
        'PerfilSuplementos', blank=True, related_name='departamentos'
    )

    class Meta:
        db_table = "departamentos"

    def __str__(self):
        return self.nombre


class Producto(models.Model):
    departamento = models.ForeignKey(
        Departamento, on_delete=models.SET_NULL, null=True, blank=True, related_name="productos"
    )
    nombre = models.CharField(max_length=100)
    precio = models.DecimalField(max_digits=10, decimal_places=2)
    activo = models.BooleanField(default=True)
    eliminado = models.BooleanField(default=False)
    
    nombre_factura = models.CharField(max_length=100, blank=True, null=True)
    nombre_comanda = models.CharField(max_length=100, blank=True, null=True)
    impresora = models.CharField(max_length=50, blank=True, null=True)
    color_boton = models.CharField(max_length=7, blank=True, null=True)
    color_texto = models.CharField(max_length=7, default='#ffffff', blank=True, null=True)
    icono_boton = models.CharField(max_length=255, blank=True, null=True)
    es_configurable = models.BooleanField(default=False)

    # M2M con Perfiles
    perfiles_comentarios = models.ManyToManyField(
        'PerfilComentarios', blank=True, related_name='productos',
        db_table='producto_grupo_comentario'
    )
    perfiles_suplementos = models.ManyToManyField(
        'PerfilSuplementos', blank=True, related_name='productos',
        db_table='producto_grupo_suplemento'
    )

    class Meta:
        db_table = "productos"

    def __str__(self):
        return self.nombre


# =========================
# 2b) CATALOGO: Comentarios y Suplementos
# =========================

class PerfilComentarios(models.Model):
    """Grupo/Perfil de Comentarios (grupo_comentarios en SQL)"""
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "grupo_comentarios"
        verbose_name = "Perfil de Comentarios"
        verbose_name_plural = "Perfiles de Comentarios"

    def __str__(self):
        return self.nombre


class Comentario(models.Model):
    """Comentario individual que pertenece a un perfil"""
    perfil = models.ForeignKey(
        PerfilComentarios, on_delete=models.PROTECT, null=True, blank=True,
        related_name='comentarios', db_column='grupo_id'
    )
    texto = models.CharField(max_length=255)
    activo = models.BooleanField(default=True)
    orden = models.IntegerField(default=0)

    class Meta:
        db_table = "comentarios"
        ordering = ['orden', 'id']

    def __str__(self):
        return self.texto


class PerfilSuplementos(models.Model):
    """Grupo/Perfil de Suplementos (grupo_suplementos en SQL)"""
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "grupo_suplementos"
        verbose_name = "Perfil de Suplementos"
        verbose_name_plural = "Perfiles de Suplementos"

    def __str__(self):
        return self.nombre


class Suplemento(models.Model):
    """Suplemento individual con precio que pertenece a un perfil"""
    perfil = models.ForeignKey(
        PerfilSuplementos, on_delete=models.PROTECT, null=True, blank=True,
        related_name='suplementos', db_column='grupo_id'
    )
    nombre = models.CharField(max_length=100)
    precio = models.DecimalField(max_digits=10, decimal_places=2)
    activo = models.BooleanField(default=True)
    orden = models.IntegerField(default=0)

    class Meta:
        db_table = "suplementos"
        ordering = ['orden', 'id']

    def __str__(self):
        return f"{self.nombre} ({self.precio}€)"


# =========================
# 2c) PRODUCTOS CONFIGURABLES
# =========================

class PlantillaConfigurable(models.Model):
    """Plantilla de configuración para un producto configurable."""
    producto = models.OneToOneField(
        Producto, on_delete=models.CASCADE, related_name='plantilla'
    )
    tiene_formatos = models.BooleanField(default=False)

    class Meta:
        db_table = "plantillas_configurables"

    def __str__(self):
        return f"Plantilla: {self.producto.nombre}"


class FormatoProducto(models.Model):
    """Formato/tamaño del producto (ej: Media, Entera)."""
    plantilla = models.ForeignKey(
        PlantillaConfigurable, on_delete=models.CASCADE, related_name='formatos'
    )
    nombre = models.CharField(max_length=50)
    factor_precio = models.DecimalField(max_digits=5, decimal_places=2, default=1.00)
    precio_fijo = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    orden = models.IntegerField(default=0)
    por_defecto = models.BooleanField(default=False)

    class Meta:
        db_table = "formatos_producto"
        ordering = ['orden', 'id']

    def __str__(self):
        return f"{self.nombre} (×{self.factor_precio})"


class GrupoOpciones(models.Model):
    """Grupo de opciones dentro de la configuración (ej: Pan, Base, Suplementos)."""
    TIPO_UNICA = 'unica'
    TIPO_MULTIPLE = 'multiple'
    TIPO_LIBRE = 'libre'
    TIPOS = [(TIPO_UNICA, 'Única'), (TIPO_MULTIPLE, 'Múltiple'), (TIPO_LIBRE, 'Texto Libre')]

    plantilla = models.ForeignKey(
        PlantillaConfigurable, on_delete=models.CASCADE, related_name='grupos'
    )
    nombre = models.CharField(max_length=100)
    tipo_seleccion = models.CharField(max_length=10, choices=TIPOS, default=TIPO_MULTIPLE)
    obligatorio = models.BooleanField(default=False)
    permite_texto_libre = models.BooleanField(default=False)
    orden = models.IntegerField(default=0)

    class Meta:
        db_table = "grupos_opciones"
        ordering = ['orden', 'id']

    def __str__(self):
        return f"{self.nombre} ({self.plantilla.producto.nombre})"


class OpcionGrupo(models.Model):
    """Opción individual dentro de un grupo (ej: Queso, Integral, Muy tostada)."""
    grupo = models.ForeignKey(
        GrupoOpciones, on_delete=models.CASCADE, related_name='opciones'
    )
    nombre = models.CharField(max_length=100)
    precio_base = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    activo = models.BooleanField(default=True)
    orden = models.IntegerField(default=0)
    por_defecto = models.BooleanField(default=False)
    visible_comanda = models.BooleanField(default=True)
    visible_factura = models.BooleanField(default=True)

    class Meta:
        db_table = "opciones_grupo"
        ordering = ['orden', 'id']

    def __str__(self):
        return f"{self.nombre} ({self.precio_base}€)"


class PrecioOpcionFormato(models.Model):
    """Precio específico de una opción según el formato elegido."""
    opcion = models.ForeignKey(
        OpcionGrupo, on_delete=models.CASCADE, related_name='precios_formato'
    )
    formato = models.ForeignKey(
        FormatoProducto, on_delete=models.CASCADE, related_name='precios_opciones'
    )
    precio = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "precios_opcion_formato"
        unique_together = ('opcion', 'formato')

    def __str__(self):
        return f"{self.opcion.nombre} → {self.formato.nombre}: {self.precio}€"


# =========================
# 2d) CLIENTES
# =========================

class Cliente(models.Model):
    nombre = models.CharField(max_length=200, verbose_name="Nombre / Razón Social")
    nif = models.CharField(max_length=20, blank=True, null=True, verbose_name="NIF/CIF/NIE")
    email = models.EmailField(blank=True, null=True, verbose_name="Correo Electrónico")
    telefono = models.CharField(max_length=20, blank=True, null=True, verbose_name="Teléfono")
    
    # Dirección desglosada
    direccion = models.CharField(max_length=255, blank=True, null=True, verbose_name="Domicilio Fiscal")
    codigo_postal = models.CharField(max_length=10, blank=True, null=True, verbose_name="Código Postal")
    poblacion = models.CharField(max_length=100, blank=True, null=True, verbose_name="Población / Ciudad")
    provincia = models.CharField(max_length=100, blank=True, null=True, verbose_name="Provincia")
    
    activo = models.BooleanField(default=True)
    fecha_registro = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "clientes"

    def __str__(self):
        return f"{self.nombre} ({self.nif})" if self.nif else self.nombre

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


# =========================
# 6) GESTION DE CAJA
# =========================

class DiaContable(models.Model):
    """Representa una jornada de negocio completa."""
    fecha_apertura = models.DateTimeField(default=timezone.now)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    abierta_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="dias_abiertos"
    )
    cerrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="dias_cerrados"
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
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sesiones_abiertas"
    )
    cerrada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="sesiones_cerradas"
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
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    
    tipo = models.CharField(max_length=10, choices=[("entrada", "Entrada"), ("salida", "Salida")])
    importe = models.DecimalField(max_digits=10, decimal_places=2)
    concepto = models.CharField(max_length=255)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "movimientos_caja"
        ordering = ["-fecha"]

    def __str__(self):
        return f"{self.tipo.upper()}: {self.importe}€ - {self.concepto}"


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