"""ViewSets y endpoints relacionados con «catalogo»."""
from django.utils import timezone
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, F
from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
import os
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse
from ..models import (
    Departamento, Producto, Mesa, Comanda, LineaComanda, Factura, Pago, EventoAuditoria,
    PerfilComentarios, Comentario, PerfilSuplementos, Suplemento, Cliente,
    PlantillaConfigurable, FormatoProducto, GrupoOpciones, OpcionGrupo, PrecioOpcionFormato, MovimientoStock,
    CategoriaInventario, Proveedor, ArticuloInventario
)
from ..serializers import (
    DepartamentoSerializer, ProductoSerializer, MesaSerializer, ComandaSerializer,
    LineaComandaSerializer, FacturaSerializer, PagoSerializer, EventoAuditoriaSerializer,
    PerfilComentariosSerializer, ComentarioSerializer, PerfilSuplementosSerializer, SuplementoSerializer,
    ClienteSerializer, PlantillaConfigurableSerializer, MovimientoStockSerializer,
    CategoriaInventarioSerializer, ProveedorSerializer, ArticuloInventarioSerializer
)
from ..services import actualizar_estado_mesa, imprimir_comprobante, emitir_factura, registrar_pago, registrar_evento
from ..permissions import IsManagerOrReadOnly, has_app_permission
from tpvapp.auditoria import log_info, log_warn, log_error
from ..models import ConfiguracionTPV
from ._helpers import (
    _actor_username,
    _forbidden_response,
    _commit_borrador_a_comanda,
)

class DepartamentoViewSet(viewsets.ModelViewSet):
    queryset = Departamento.objects.all()
    serializer_class = DepartamentoSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        depto = serializer.save()
        actor = _actor_username(self.request.user)
        log_info(
            "catalogo.departamentos",
            f"usuario={actor} accion=crear departamento_id={depto.id} nombre={depto.nombre}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.nombre
        depto = serializer.save()
        actor = _actor_username(self.request.user)
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.departamentos",
            f"usuario={actor} accion=editar departamento_id={depto.id} nombre_antes={before} nombre_despues={depto.nombre} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        depto_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "catalogo.departamentos",
            f"usuario={actor} accion=eliminar departamento_id={depto_id} nombre={nombre}",
        )

    def destroy(self, request, *args, **kwargs):
        departamento=self.get_object()
        if hasattr(departamento, "productos") and departamento.productos.exists():
            log_warn(
                "catalogo.departamentos",
                f"usuario={_actor_username(request.user)} accion=eliminar_bloqueado departamento_id={departamento.id} motivo=productos_asociados",
            )
            return Response(
                {"detail": "No se puede eliminar el departamento porque tiene productos asociados."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.all()
    serializer_class = ProductoSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        producto = serializer.save()
        actor = _actor_username(self.request.user)
        log_info(
            "catalogo.productos",
            f"usuario={actor} accion=crear producto_id={producto.id} nombre={producto.nombre} precio={producto.precio}",
        )

    def perform_update(self, serializer):
        before_name = serializer.instance.nombre
        before_price = serializer.instance.precio
        producto = serializer.save()
        actor = _actor_username(self.request.user)
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.productos",
            f"usuario={actor} accion=editar producto_id={producto.id} nombre_antes={before_name} nombre_despues={producto.nombre} precio_antes={before_price} precio_despues={producto.precio} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        producto_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "catalogo.productos",
            f"usuario={actor} accion=eliminar producto_id={producto_id} nombre={nombre}",
        )


class PerfilComentariosViewSet(viewsets.ModelViewSet):
    queryset = PerfilComentarios.objects.all()
    serializer_class = PerfilComentariosSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        perfil = serializer.save()
        log_info(
            "catalogo.perfiles_comentarios",
            f"usuario={_actor_username(self.request.user)} accion=crear perfil_id={perfil.id} nombre={perfil.nombre}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.nombre
        perfil = serializer.save()
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.perfiles_comentarios",
            f"usuario={_actor_username(self.request.user)} accion=editar perfil_id={perfil.id} nombre_antes={before} nombre_despues={perfil.nombre} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        perfil_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "catalogo.perfiles_comentarios",
            f"usuario={actor} accion=eliminar perfil_id={perfil_id} nombre={nombre}",
        )


class ComentarioViewSet(viewsets.ModelViewSet):
    queryset = Comentario.objects.all()
    serializer_class = ComentarioSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        comentario = serializer.save()
        log_info(
            "catalogo.comentarios",
            f"usuario={_actor_username(self.request.user)} accion=crear comentario_id={comentario.id} texto={comentario.texto}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.texto
        comentario = serializer.save()
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.comentarios",
            f"usuario={_actor_username(self.request.user)} accion=editar comentario_id={comentario.id} texto_antes={before} texto_despues={comentario.texto} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        comentario_id = instance.id
        texto = instance.texto
        instance.delete()
        log_warn(
            "catalogo.comentarios",
            f"usuario={actor} accion=eliminar comentario_id={comentario_id} texto={texto}",
        )


class PerfilSuplementosViewSet(viewsets.ModelViewSet):
    queryset = PerfilSuplementos.objects.all()
    serializer_class = PerfilSuplementosSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        perfil = serializer.save()
        log_info(
            "catalogo.perfiles_suplementos",
            f"usuario={_actor_username(self.request.user)} accion=crear perfil_id={perfil.id} nombre={perfil.nombre}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.nombre
        perfil = serializer.save()
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.perfiles_suplementos",
            f"usuario={_actor_username(self.request.user)} accion=editar perfil_id={perfil.id} nombre_antes={before} nombre_despues={perfil.nombre} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        perfil_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "catalogo.perfiles_suplementos",
            f"usuario={actor} accion=eliminar perfil_id={perfil_id} nombre={nombre}",
        )


class SuplementoViewSet(viewsets.ModelViewSet):
    queryset = Suplemento.objects.all()
    serializer_class = SuplementoSerializer
    permission_classes = [IsManagerOrReadOnly]

    def perform_create(self, serializer):
        suplemento = serializer.save()
        log_info(
            "catalogo.suplementos",
            f"usuario={_actor_username(self.request.user)} accion=crear suplemento_id={suplemento.id} nombre={suplemento.nombre} precio={suplemento.precio}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.nombre
        suplemento = serializer.save()
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "catalogo.suplementos",
            f"usuario={_actor_username(self.request.user)} accion=editar suplemento_id={suplemento.id} nombre_antes={before} nombre_despues={suplemento.nombre} precio={suplemento.precio} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        suplemento_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "catalogo.suplementos",
            f"usuario={actor} accion=eliminar suplemento_id={suplemento_id} nombre={nombre}",
        )


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def plantilla_configurable(request, producto_id):
    """Devuelve o guarda la plantilla de configuración de un producto."""
    if request.method == 'GET':
        try:
            plantilla = PlantillaConfigurable.objects.get(producto_id=producto_id)
        except PlantillaConfigurable.DoesNotExist:
            return Response({"detail": "No configurable template found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PlantillaConfigurableSerializer(plantilla)
        return Response(serializer.data)

    elif request.method == 'POST':
        if not has_app_permission(request.user, "manage_catalog"):
            return _forbidden_response(request, "manage_catalog")
        with transaction.atomic():
            PlantillaConfigurable.objects.filter(producto_id=producto_id).delete()

            data = request.data
            tiene_formatos = data.get('tiene_formatos', False)

            plantilla = PlantillaConfigurable.objects.create(
                producto_id=producto_id,
                tiene_formatos=tiene_formatos
            )

            formato_objs = []
            for f_data in data.get('formatos', []):
                # Handle precio_fijo being optional/null/empty string
                pf_val = f_data.get('precio_fijo', None)
                if isinstance(pf_val, str) and not pf_val.strip():
                    pf_val = None
                elif pf_val == '':
                    pf_val = None

                fmt = FormatoProducto.objects.create(
                    plantilla=plantilla,
                    nombre=f_data.get('nombre', 'Formato'),
                    factor_precio=f_data.get('factor_precio', 1.0) or 1.0,
                    precio_fijo=pf_val,
                    orden=f_data.get('orden', 0)
                )
                formato_objs.append(fmt)

            for g_data in data.get('grupos', []):
                grupo = GrupoOpciones.objects.create(
                    plantilla=plantilla,
                    nombre=g_data.get('nombre', 'Grupo'),
                    tipo_seleccion=g_data.get('tipo_seleccion', GrupoOpciones.TIPO_MULTIPLE),
                    obligatorio=g_data.get('obligatorio', False),
                    orden=g_data.get('orden', 0)
                )

                for o_data in g_data.get('opciones', []):
                    # For compatibility, cast precio_base
                    pb_val = o_data.get('precio_base', 0.0)
                    if not str(pb_val).strip(): pb_val = 0.0

                    opcion = OpcionGrupo.objects.create(
                        grupo=grupo,
                        nombre=o_data.get('nombre', 'Opción'),
                        precio_base=pb_val,
                        por_defecto=o_data.get('por_defecto', False),
                        visible_comanda=o_data.get('visible_comanda', True),
                        visible_factura=o_data.get('visible_factura', True),
                        orden=o_data.get('orden', 0)
                    )

                    precios_formatos = o_data.get('precios_formatos', {})
                    for i, fmt in enumerate(formato_objs):
                        # As we rebuilt formats linearly, index `str(i)` is correct relative to array
                        pf_val = precios_formatos.get(str(i), '')
                        if str(pf_val).strip() != '':
                            PrecioOpcionFormato.objects.create(
                                opcion=opcion,
                                formato=fmt,
                                precio=pf_val
                            )

            serializer = PlantillaConfigurableSerializer(plantilla)
            actor = _actor_username(request.user)
            log_info(
                "catalogo.configurables",
                f"usuario={actor} accion=guardar_plantilla producto_id={producto_id} formatos={len(data.get('formatos', []))} grupos={len(data.get('grupos', []))}",
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def listar_iconos(request):
    iconos_dir = Path(settings.BASE_DIR) / "static" / "ui" / "img" / "productos"
    extensiones_validas = {".png", ".jpg", ".jpeg", ".webp", ".svg"}

    categorias = {}

    if iconos_dir.exists():
        # Primero procesamos carpetas (categorías)
        for item in sorted(iconos_dir.iterdir()):
            if item.is_dir():
                cat_name = item.name
                iconos_cat = []
                for subitem in sorted(item.iterdir()):
                    if subitem.is_file() and subitem.suffix.lower() in extensiones_validas:
                        iconos_cat.append({
                            "nombre": subitem.name,
                            "url": f"{settings.STATIC_URL}ui/img/productos/{cat_name}/{subitem.name}"
                        })
                if iconos_cat:
                    categorias[cat_name] = iconos_cat

            # También archivos en la raíz
            elif item.is_file() and item.suffix.lower() in extensiones_validas:
                if "General" not in categorias:
                    categorias["General"] = []
                categorias["General"].append({
                    "nombre": item.name,
                    "url": f"{settings.STATIC_URL}ui/img/productos/{item.name}"
                })

    return JsonResponse({"categorias": categorias})

