"""ViewSets y endpoints relacionados con «configuracion»."""
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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def configuracion_update(request):
    if not has_app_permission(request.user, "manage_configuration"):
        return _forbidden_response(request, "manage_configuration")
    """Actualiza un valor de configuración global."""
    clave = request.data.get('clave')
    valor = request.data.get('valor')
    
    if not clave:
        return JsonResponse({"error": "Falta clave requerida"}, status=400)
        
    with transaction.atomic():
        conf, created = ConfiguracionTPV.objects.get_or_create(clave=clave)
        valor_anterior = conf.valor
        conf.valor = str(valor)
        conf.save(update_fields=['valor'])

    log_info(
        "configuracion.global",
        f"usuario={_actor_username(request.user)} accion=actualizar clave={clave} valor_anterior={valor_anterior} valor_nuevo={valor}",
    )
    return JsonResponse({"ok": True})

