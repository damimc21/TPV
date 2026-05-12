"""ViewSets y endpoints relacionados con «facturacion»."""
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

class FacturaViewSet(viewsets.ModelViewSet):
    queryset = Factura.objects.all()
    serializer_class = FacturaSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["post"])
    def pagar(self, request, pk=None):
        if not has_app_permission(request.user, "process_payments"):
            return _forbidden_response(request, "process_payments")
        factura = self.get_object()
        cantidad = request.data.get("cantidad")
        metodo_pago = request.data.get("metodo_pago", "efectivo")

        if cantidad is None:
            return Response({"ok": False, "error": "Falta 'cantidad'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pago = registrar_pago(factura, request.user, cantidad=cantidad, metodo_pago=metodo_pago)
            return Response(PagoSerializer(pago).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({"ok": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def ultima(self, request):
        f = Factura.objects.all().order_by("-emitida_a").first() # Quitamos el filtro de pagada por si quiere reimprimir la última emitida aunque no esté pagada (poco probable pero más flexible)
        if not f:
             return Response({"detail": "No hay facturas."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"id": f.id})

