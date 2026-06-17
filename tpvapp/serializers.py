from rest_framework import serializers
from .models import (
    Departamento, Producto, Mesa, Comanda, LineaComanda, Factura, Pago, EventoAuditoria,
    PerfilComentarios, Comentario, PerfilSuplementos, Suplemento, Cliente,
    PlantillaConfigurable, FormatoProducto, GrupoOpciones, OpcionGrupo, PrecioOpcionFormato, MovimientoStock,
    CategoriaInventario, Proveedor, ArticuloInventario, Impresora
)


class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = "__all__"


class ImpresoraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Impresora
        fields = "__all__"


class ProductoSerializer(serializers.ModelSerializer):
    es_configurable = serializers.SerializerMethodField()
    departamento_nombre = serializers.ReadOnlyField(source='departamento.nombre')

    class Meta:
        model = Producto
        fields = "__all__"

    def get_es_configurable(self, obj):
        return hasattr(obj, 'plantilla')

    def validate(self, data):
        nombre = data.get('nombre')
        departamento = data.get('departamento')

        if self.instance:
            nombre = nombre if nombre is not None else self.instance.nombre
            departamento = departamento if departamento is not None else self.instance.departamento

        if nombre and departamento:
            qs = Producto.objects.filter(nombre__iexact=nombre, departamento=departamento)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)

            if qs.exists():
                raise serializers.ValidationError({"nombre": "Ya existe un producto con ese nombre en este departamento."})

        return data


class MesaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mesa
        fields = "__all__"


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = "__all__"


class LineaComandaSerializer(serializers.ModelSerializer):
    class Meta:
        model = LineaComanda
        fields = "__all__"
        read_only_fields = [
            "anulado",
            "anulado_a",
            "anulado_por",
        ]

    def validate(self, attrs):
        """
        Bloquea añadir líneas si la comanda no está abierta.
        """
        comanda = attrs.get("comanda")
        if comanda and comanda.estado != Comanda.ESTADO_ABIERTA:
            raise serializers.ValidationError("Solo se pueden añadir líneas a una comanda abierta.")
        return attrs

    def create(self, validated_data):
        producto = validated_data["producto"]

        # Si no vienen en el payload, usamos los del producto base como fallback
        if "precio_unitario" not in validated_data:
            validated_data["precio_unitario"] = producto.precio

        if "producto_nombre" not in validated_data:
            validated_data["producto_nombre"] = producto.nombre

        return super().create(validated_data)


class ComandaSerializer(serializers.ModelSerializer):
    lineas = LineaComandaSerializer(many=True, read_only=True)
    class Meta:
        model = Comanda
        fields = "__all__"


class FacturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Factura
        fields = "__all__"


class PagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pago
        fields = "__all__"


class EventoAuditoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventoAuditoria
        fields = "__all__"


class CategoriaInventarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaInventario
        fields = "__all__"


class ProveedorSerializer(serializers.ModelSerializer):
    articulos_count = serializers.IntegerField(source='articulos.count', read_only=True)

    class Meta:
        model = Proveedor
        fields = "__all__"

    def validate_nombre(self, value):
        nombre = (value or "").strip()
        if not nombre:
            raise serializers.ValidationError("El nombre del proveedor es obligatorio.")

        qs = Proveedor.objects.filter(nombre__iexact=nombre)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un proveedor con ese nombre.")
        return nombre


class ArticuloInventarioSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.ReadOnlyField(source='categoria.nombre')
    producto_vinculado_nombre = serializers.ReadOnlyField(source='producto_vinculado.nombre')
    proveedor_nombre = serializers.SerializerMethodField()
    categoria_id = serializers.PrimaryKeyRelatedField(
        source='categoria',
        queryset=CategoriaInventario.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    producto_vinculado_id = serializers.PrimaryKeyRelatedField(
        source='producto_vinculado',
        queryset=Producto.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    proveedor_id = serializers.PrimaryKeyRelatedField(
        source='proveedor_ref',
        queryset=Proveedor.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = ArticuloInventario
        fields = "__all__"

    def get_proveedor_nombre(self, obj):
        if obj.proveedor_ref:
            return obj.proveedor_ref.nombre
        return obj.proveedor or ""

    def _get_or_create_proveedor(self, nombre):
        nombre = (nombre or "").strip()
        if not nombre:
            return None
        proveedor = Proveedor.objects.filter(nombre__iexact=nombre).first()
        if proveedor:
            return proveedor
        return Proveedor.objects.create(nombre=nombre)

    def _sync_proveedor(self, validated_data, *, creating=False):
        has_ref = 'proveedor_ref' in validated_data
        has_text = 'proveedor' in validated_data

        if has_ref:
            proveedor = validated_data.get('proveedor_ref')
            validated_data['proveedor'] = proveedor.nombre if proveedor else ''
            return validated_data

        if has_text:
            proveedor = self._get_or_create_proveedor(validated_data.get('proveedor'))
            validated_data['proveedor_ref'] = proveedor
            validated_data['proveedor'] = proveedor.nombre if proveedor else ''
            return validated_data

        if creating:
            validated_data.setdefault('proveedor', '')
            validated_data.setdefault('proveedor_ref', None)
        return validated_data

    def create(self, validated_data):
        return super().create(self._sync_proveedor(validated_data, creating=True))

    def update(self, instance, validated_data):
        return super().update(instance, self._sync_proveedor(validated_data))

    def validate(self, attrs):
        producto_vinculado = attrs.get(
            'producto_vinculado',
            self.instance.producto_vinculado if self.instance else None
        )
        auto_descontar = attrs.get(
            'auto_descontar',
            self.instance.auto_descontar if self.instance else False
        )

        if auto_descontar and not producto_vinculado:
            raise serializers.ValidationError({
                "producto_vinculado_id": "Elige un producto TPV para activar el descuento automatico."
            })

        if producto_vinculado:
            qs = ArticuloInventario.objects.filter(producto_vinculado=producto_vinculado)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "producto_vinculado_id": "Este producto TPV ya esta vinculado a otro articulo de inventario."
                })

        # Simplificación del flujo: la venta siempre descuenta 1 unidad.
        attrs['cantidad_por_venta'] = 1
        return attrs


class MovimientoStockSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.ReadOnlyField(source='producto.nombre')
    articulo_nombre = serializers.ReadOnlyField(source='articulo.nombre')
    usuario_nombre = serializers.ReadOnlyField(source='usuario.username')

    class Meta:
        model = MovimientoStock
        fields = "__all__"


# =========================
# Comentarios y Suplementos
# =========================

class ComentarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comentario
        fields = "__all__"


class PerfilComentariosSerializer(serializers.ModelSerializer):
    comentarios = ComentarioSerializer(many=True, read_only=True)
    departamentos_ids = serializers.PrimaryKeyRelatedField(
        source='departamentos', queryset=Departamento.objects.all(),
        many=True, required=False
    )
    productos_ids = serializers.PrimaryKeyRelatedField(
        source='productos', queryset=Producto.objects.all(),
        many=True, required=False
    )

    class Meta:
        model = PerfilComentarios
        fields = ['id', 'nombre', 'activo', 'comentarios', 'departamentos_ids', 'productos_ids']


class SuplementoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Suplemento
        fields = "__all__"


class PerfilSuplementosSerializer(serializers.ModelSerializer):
    suplementos = SuplementoSerializer(many=True, read_only=True)
    departamentos_ids = serializers.PrimaryKeyRelatedField(
        source='departamentos', queryset=Departamento.objects.all(),
        many=True, required=False
    )
    productos_ids = serializers.PrimaryKeyRelatedField(
        source='productos', queryset=Producto.objects.all(),
        many=True, required=False
    )

    class Meta:
        model = PerfilSuplementos
        fields = ['id', 'nombre', 'activo', 'suplementos', 'departamentos_ids', 'productos_ids']


# =========================
# Productos Configurables
# =========================

class PrecioOpcionFormatoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrecioOpcionFormato
        fields = ['id', 'formato', 'precio']


class OpcionGrupoSerializer(serializers.ModelSerializer):
    precios_formato = PrecioOpcionFormatoSerializer(many=True, read_only=True)

    class Meta:
        model = OpcionGrupo
        fields = ['id', 'nombre', 'precio_base', 'activo', 'orden', 'por_defecto', 'visible_comanda', 'visible_factura', 'precios_formato']


class GrupoOpcionesSerializer(serializers.ModelSerializer):
    opciones = OpcionGrupoSerializer(many=True, read_only=True)

    class Meta:
        model = GrupoOpciones
        fields = ['id', 'nombre', 'tipo_seleccion', 'obligatorio', 'permite_texto_libre', 'orden', 'opciones']


class FormatoProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormatoProducto
        fields = ['id', 'nombre', 'factor_precio', 'precio_fijo', 'orden', 'por_defecto']


class PlantillaConfigurableSerializer(serializers.ModelSerializer):
    formatos = FormatoProductoSerializer(many=True, read_only=True)
    grupos = GrupoOpcionesSerializer(many=True, read_only=True)

    class Meta:
        model = PlantillaConfigurable
        fields = ['id', 'producto', 'tiene_formatos', 'formatos', 'grupos']

