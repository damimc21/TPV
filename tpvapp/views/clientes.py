"""ViewSets y endpoints relacionados con «clientes»."""
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

class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all().order_by("nombre")
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        query = self.request.query_params.get("q")
        if query:
            from django.db.models import Q
            qs = qs.filter(
                Q(nombre__icontains=query) |
                Q(nif__icontains=query)
            )
        return qs

    def perform_create(self, serializer):
        cliente = serializer.save()
        actor = _actor_username(self.request.user)
        log_info(
            "clientes",
            f"usuario={actor} accion=crear cliente_id={cliente.id} nombre={cliente.nombre}",
        )

    def perform_update(self, serializer):
        before = serializer.instance.nombre
        cliente = serializer.save()
        actor = _actor_username(self.request.user)
        changed_fields = ",".join(sorted(serializer.validated_data.keys())) or "sin_campos"
        log_info(
            "clientes",
            f"usuario={actor} accion=editar cliente_id={cliente.id} nombre_antes={before} nombre_despues={cliente.nombre} campos={changed_fields}",
        )

    def perform_destroy(self, instance):
        actor = _actor_username(self.request.user)
        cliente_id = instance.id
        nombre = instance.nombre
        instance.delete()
        log_warn(
            "clientes",
            f"usuario={actor} accion=eliminar cliente_id={cliente_id} nombre={nombre}",
        )

