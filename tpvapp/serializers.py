from rest_framework import serializers
from .models import (
    Departamento, Producto, Mesa, Comanda, LineaComanda, Factura, Pago, EventoAuditoria,
    PerfilComentarios, Comentario, PerfilSuplementos, Suplemento, Cliente,
    PlantillaConfigurable, FormatoProducto, GrupoOpciones, OpcionGrupo, PrecioOpcionFormato
)


class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = "__all__"


class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = "__all__"

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
            "precio_unitario",
            "producto_nombre",
            "anulado",
            "anulado_a",
            "anulado_por",
            "configuracion_json",
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
        """
        Rellena automáticamente precio_unitario y (si tu modelo lo tiene) producto_nombre.
        Ignora lo que venga del cliente.
        """
        producto = validated_data["producto"]

        # Precio snapshot (muy importante para histórico)
        validated_data["precio_unitario"] = producto.precio

        # Si el modelo tiene un campo producto_nombre, lo rellenamos automáticamente (snapshot):
        if "producto_nombre" in [f.name for f in LineaComanda._meta.fields]:
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

