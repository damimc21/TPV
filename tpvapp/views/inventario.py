"""ViewSets y endpoints relacionados con «inventario»."""
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

class MovimientoStockViewSet(viewsets.ModelViewSet):
    queryset = MovimientoStock.objects.all()
    serializer_class = MovimientoStockSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        producto_id = self.request.query_params.get("producto")
        if producto_id:
            qs = qs.filter(producto_id=producto_id)
        return qs


class CategoriaInventarioViewSet(viewsets.ModelViewSet):
    queryset = CategoriaInventario.objects.all().order_by('orden', 'nombre')
    serializer_class = CategoriaInventarioSerializer
    permission_classes = [IsAuthenticated]


class ProveedorViewSet(viewsets.ModelViewSet):
    queryset = Proveedor.objects.all().order_by('nombre')
    serializer_class = ProveedorSerializer
    permission_classes = [IsAuthenticated]

    def _linked_articulos(self, proveedor):
        return (
            ArticuloInventario.objects
            .filter(proveedor_ref=proveedor)
            .select_related('categoria')
            .order_by('categoria__nombre', 'nombre')
        )

    def _articulos_payload(self, queryset, limit=30):
        articulos = list(queryset[:limit])
        return [
            {
                "id": articulo.id,
                "nombre": articulo.nombre,
                "categoria": articulo.categoria.nombre if articulo.categoria else "",
            }
            for articulo in articulos
        ]

    def perform_create(self, serializer):
        proveedor = serializer.save()
        actor = _actor_username(self.request.user)
        detalles = f"proveedor_id={proveedor.id}, nombre={proveedor.nombre}"
        registrar_evento(self.request.user, "PROVEEDOR_CREADO", detalles)
        log_info(
            "stock.proveedores",
            f"usuario={actor} accion=crear proveedor_id={proveedor.id} nombre={proveedor.nombre}",
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        before_nombre = instance.nombre
        before_activo = instance.activo
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"

        with transaction.atomic():
            proveedor = serializer.save()
            articulos_qs = self._linked_articulos(proveedor)
            articulos_count = articulos_qs.count()

            if before_nombre != proveedor.nombre:
                articulos_qs.update(proveedor=proveedor.nombre)

        actor = _actor_username(self.request.user)
        if before_activo != proveedor.activo:
            accion = "reactivar" if proveedor.activo else "desactivar"
        else:
            accion = "editar"

        detalles = (
            f"accion={accion}, proveedor_id={proveedor.id}, "
            f"nombre_antes={before_nombre}, nombre_despues={proveedor.nombre}, "
            f"activo_antes={before_activo}, activo_despues={proveedor.activo}, "
            f"campos={changed_fields}, articulos_asociados={articulos_count}"
        )
        registrar_evento(self.request.user, "PROVEEDOR_ACTUALIZADO", detalles)
        log_info(
            "stock.proveedores",
            f"usuario={actor} {detalles}",
        )

    def destroy(self, request, *args, **kwargs):
        proveedor = self.get_object()
        articulos_qs = self._linked_articulos(proveedor)
        articulos_count = articulos_qs.count()
        confirmed = str(request.query_params.get("confirm") or "").lower() in {"1", "true", "yes", "si", "sí"}

        if articulos_count and not confirmed:
            return Response(
                {
                    "requires_confirmation": True,
                    "detail": (
                        f"Este proveedor esta asignado a {articulos_count} productos. "
                        "Si lo eliminas, quedaran sin proveedor."
                    ),
                    "proveedor": {
                        "id": proveedor.id,
                        "nombre": proveedor.nombre,
                    },
                    "articulos_count": articulos_count,
                    "articulos": self._articulos_payload(articulos_qs),
                    "truncated": articulos_count > 30,
                },
                status=status.HTTP_409_CONFLICT,
            )

        articulos_nombres = list(articulos_qs.values_list("nombre", flat=True))
        with transaction.atomic():
            if articulos_count:
                articulos_qs.update(proveedor_ref=None, proveedor="")
            proveedor_id = proveedor.id
            proveedor_nombre = proveedor.nombre
            proveedor.delete()

        detalles = (
            f"proveedor_id={proveedor_id}, nombre={proveedor_nombre}, "
            f"articulos_desvinculados={articulos_count}, "
            f"articulos={', '.join(articulos_nombres[:30])}"
        )
        registrar_evento(request.user, "PROVEEDOR_ELIMINADO", detalles)
        log_warn(
            "stock.proveedores",
            f"usuario={_actor_username(request.user)} accion=eliminar {detalles}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArticuloInventarioViewSet(viewsets.ModelViewSet):
    queryset = ArticuloInventario.objects.select_related('categoria', 'proveedor_ref', 'producto_vinculado').all().order_by('categoria__orden', 'nombre')
    serializer_class = ArticuloInventarioSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def ajustar(self, request, pk=None):
        if not has_app_permission(request.user, "manage_stock"):
            return _forbidden_response(request, "manage_stock")
        """Movimiento manual de inventario no bloqueante."""
        articulo = self.get_object()
        operacion = str(request.data.get('operacion') or 'delta').lower()
        tipo_payload = str(request.data.get('tipo') or '').lower()
        motivo = request.data.get('motivo') or 'Ajuste manual'
        actor = _actor_username(request.user)

        try:
            anterior = articulo.stock_actual
            if operacion == 'recuento':
                nuevo = Decimal(str(request.data.get('stock_final', request.data.get('cantidad', 0))))
                delta = nuevo - anterior
                tipo = MovimientoStock.TIPO_AJUSTE
                if not request.data.get('motivo'):
                    motivo = f"Recuento manual: {nuevo}"
            else:
                delta = Decimal(str(request.data.get('cantidad', 0)))
                nuevo = anterior + delta
                if tipo_payload in ('entrada', 'compra', 'recibir'):
                    tipo = MovimientoStock.TIPO_ENTRADA
                elif tipo_payload in ('salida', 'merma', 'rotura', 'anulacion'):
                    tipo = MovimientoStock.TIPO_SALIDA
                else:
                    tipo = MovimientoStock.TIPO_ENTRADA if delta > 0 else MovimientoStock.TIPO_SALIDA
        except Exception as exc:
            log_error(
                "stock.ajuste",
                f"usuario={actor} accion=ajuste_invalido articulo_id={articulo.id} nombre={articulo.nombre}",
                exc=exc,
            )
            return Response({"error": "Cantidad invalida"}, status=status.HTTP_400_BAD_REQUEST)

        if delta == 0:
            log_warn(
                "stock.ajuste",
                f"usuario={actor} accion=ajuste_rechazado articulo_id={articulo.id} nombre={articulo.nombre} motivo=delta_cero",
            )
            return Response({"error": "El ajuste no puede ser 0"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            articulo.stock_actual = nuevo
            articulo.save(update_fields=['stock_actual'])

            MovimientoStock.objects.create(
                articulo=articulo,
                tipo=tipo,
                cantidad=abs(delta),
                anterior=anterior,
                nuevo=nuevo,
                usuario=request.user,
                motivo=motivo
            )

        log_info(
            "stock.ajuste",
            f"usuario={actor} accion=ajustar articulo_id={articulo.id} nombre={articulo.nombre} tipo={tipo} anterior={anterior} nuevo={nuevo} motivo={motivo}",
        )

        return Response(self.get_serializer(articulo).data)

    @action(detail=True, methods=['get'])
    def historial(self, request, pk=None):
        articulo = self.get_object()
        movs = MovimientoStock.objects.filter(articulo=articulo).order_by('-fecha')[:50]
        return Response(MovimientoStockSerializer(movs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def plantillas_inventario(request):
    """Devuelve las plantillas predefinidas para inicializar el inventario"""
    plantillas = [
        {
            "id": "cafeteria",
            "nombre": "Cafetería",
            "subcategorias": [
                {
                    "id": "cafeteria-basicos",
                    "nombre": "Básicos",
                    "articulos": [
                        {"nombre": "Café en grano", "unidad": "kg", "categoria": "Cafetería"},
                        {"nombre": "Café descafeinado", "unidad": "kg", "categoria": "Cafetería"},
                        {"nombre": "Colacao", "unidad": "kg", "categoria": "Cafetería"},
                        {"nombre": "Azúcar", "unidad": "kg", "categoria": "Cafetería"},
                        {"nombre": "Edulcorante", "unidad": "pack", "categoria": "Cafetería"},
                    ],
                },
                {
                    "id": "cafeteria-leches",
                    "nombre": "Leches",
                    "articulos": [
                        {"nombre": "Leche entera", "unidad": "l", "categoria": "Cafetería"},
                        {"nombre": "Leche desnatada", "unidad": "l", "categoria": "Cafetería"},
                        {"nombre": "Leche sin lactosa", "unidad": "l", "categoria": "Cafetería"},
                        {"nombre": "Bebida vegetal", "unidad": "l", "categoria": "Cafetería"},
                    ],
                },
            ]
        },
        {
            "id": "cocina",
            "nombre": "Cocina",
            "subcategorias": [
                {
                    "id": "cocina-desayunos",
                    "nombre": "Desayunos",
                    "articulos": [
                        {"nombre": "Pan de molde", "unidad": "ud", "categoria": "Cocina"},
                        {"nombre": "Pan barra", "unidad": "ud", "categoria": "Cocina"},
                        {"nombre": "Mantequilla", "unidad": "ud", "categoria": "Cocina"},
                        {"nombre": "Mermelada", "unidad": "ud", "categoria": "Cocina"},
                        {"nombre": "Aceite oliva", "unidad": "l", "categoria": "Cocina"},
                        {"nombre": "Jamón york", "unidad": "kg", "categoria": "Cocina"},
                        {"nombre": "Queso lonchas", "unidad": "pack", "categoria": "Cocina"},
                    ],
                },
                {
                    "id": "cocina-basicos",
                    "nombre": "Básicos de cocina",
                    "articulos": [
                        {"nombre": "Huevos", "unidad": "caja", "categoria": "Cocina"},
                        {"nombre": "Sal", "unidad": "kg", "categoria": "Cocina"},
                        {"nombre": "Pimienta", "unidad": "ud", "categoria": "Cocina"},
                        {"nombre": "Harina", "unidad": "kg", "categoria": "Cocina"},
                    ],
                },
            ]
        },
        {
            "id": "bebidas",
            "nombre": "Bebidas",
            "subcategorias": [
                {
                    "id": "bebidas-refrescos",
                    "nombre": "Refrescos",
                    "articulos": [
                        {"nombre": "Coca-Cola", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Coca-Cola Zero", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Fanta Naranja", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Fanta Limón", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Aquarius", "unidad": "ud", "categoria": "Bebidas"},
                    ],
                },
                {
                    "id": "bebidas-agua-zumos",
                    "nombre": "Agua y zumos",
                    "articulos": [
                        {"nombre": "Agua mineral", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Agua con gas", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Zumo naranja", "unidad": "l", "categoria": "Bebidas"},
                        {"nombre": "Zumo piña", "unidad": "l", "categoria": "Bebidas"},
                    ],
                },
                {
                    "id": "bebidas-cervezas",
                    "nombre": "Cervezas",
                    "articulos": [
                        {"nombre": "Cerveza", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Cerveza sin alcohol", "unidad": "ud", "categoria": "Bebidas"},
                        {"nombre": "Cerveza tostada", "unidad": "ud", "categoria": "Bebidas"},
                    ],
                },
            ]
        },
        {
            "id": "consumibles",
            "nombre": "Limpieza y consumibles",
            "subcategorias": [
                {
                    "id": "consumibles-sala",
                    "nombre": "Sala",
                    "articulos": [
                        {"nombre": "Servilletas", "unidad": "pack", "categoria": "Consumibles"},
                        {"nombre": "Manteles papel", "unidad": "pack", "categoria": "Consumibles"},
                        {"nombre": "Pajitas", "unidad": "pack", "categoria": "Consumibles"},
                    ],
                },
                {
                    "id": "consumibles-limpieza",
                    "nombre": "Limpieza",
                    "articulos": [
                        {"nombre": "Papel higiénico", "unidad": "pack", "categoria": "Consumibles"},
                        {"nombre": "Lavavajillas", "unidad": "l", "categoria": "Consumibles"},
                        {"nombre": "Bolsas basura", "unidad": "pack", "categoria": "Consumibles"},
                        {"nombre": "Guantes desechables", "unidad": "caja", "categoria": "Consumibles"},
                    ],
                },
            ]
        }
    ]
    return Response(plantillas)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def importar_plantilla_inventario(request):
    if not has_app_permission(request.user, "manage_stock"):
        return _forbidden_response(request, "manage_stock")
    """Importa una lista de artículos predefinidos"""
    articulos_data = request.data.get('articulos', [])
    creados = 0
    omitidos = 0
    unidades_validas = {unidad for unidad, _ in ArticuloInventario.UNIDADES}

    with transaction.atomic():
        # Crear un mapa local de categorías para no duplicarlas
        for art in articulos_data:
            cat_nombre = art.get('categoria', 'General')
            cat, _ = CategoriaInventario.objects.get_or_create(nombre=cat_nombre)
            nombre = art.get('nombre', '').strip()
            if not nombre:
                omitidos += 1
                continue

            # Solo crearlo si no existe (por nombre)
            if not ArticuloInventario.objects.filter(nombre__iexact=nombre).exists():
                producto_vinculado_id = art.get('producto_vinculado_id') or None
                if producto_vinculado_id and ArticuloInventario.objects.filter(producto_vinculado_id=producto_vinculado_id).exists():
                    omitidos += 1
                    continue

                unidad = art.get('unidad', 'ud')
                if unidad not in unidades_validas:
                    unidad = 'ud'

                ArticuloInventario.objects.create(
                    nombre=nombre,
                    unidad=unidad,
                    categoria=cat,
                    stock_actual=art.get('stock_actual') or 0,
                    stock_minimo=art.get('stock_minimo') or 0,
                    producto_vinculado_id=producto_vinculado_id,
                    auto_descontar=bool(producto_vinculado_id and art.get('auto_descontar', False)),
                    cantidad_por_venta=1,
                )
                creados += 1
            else:
                omitidos += 1

    log_info(
        "stock.plantillas",
        f"usuario={_actor_username(request.user)} accion=importar_plantilla inventario_creados={creados} inventario_omitidos={omitidos}",
    )
    return Response({"status": "ok", "creados": creados, "omitidos": omitidos})

