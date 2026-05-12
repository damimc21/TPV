from django.db import models
from django.utils import timezone


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
