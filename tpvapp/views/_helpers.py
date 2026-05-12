"""Helpers privados compartidos por los submódulos de tpvapp.views."""
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

def _actor_username(user):
    return user.username if getattr(user, "is_authenticated", False) else "anon"


def _forbidden_response(request, permiso_codename: str):
    log_warn(
        "authz.api",
        f"usuario={_actor_username(request.user)} accion=denegado permiso={permiso_codename} path={request.path}",
    )
    return Response(
        {"detail": "No tienes permisos para esta operacion."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _commit_borrador_a_comanda(mesa: Mesa, user, lineas_payload: list) -> Comanda:
    """
    Sincroniza el borrador (lineas_payload) con la comanda abierta:
    - Crea la comanda abierta si no existe
    - UPDATE: líneas existentes (por id) -> actualiza cantidad/anulado (si viene)
    - CREATE: líneas nuevas (sin id) -> crea con snapshot nombre/precio
    - DELETE: líneas que existen en BD pero ya no vienen en el payload
    """
    with transaction.atomic():
        # 1) Obtener/crear comanda abierta
        comanda = (
            Comanda.objects
            .filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA)
            .order_by("-abierta_a")
            .first()
        )
        if not comanda:
            comanda = Comanda.objects.create(
                mesa=mesa,
                usuario=user,
                abierta_a=timezone.now(),
                estado=Comanda.ESTADO_ABIERTA,
            )

        # 2) Cargar líneas actuales y mapear por id
        actuales_qs = comanda.lineas.all()
        actuales_por_id = {ln.id: ln for ln in actuales_qs}

        incoming_ids = set()
        nuevas = []  # (producto_id, cantidad, anulado)

        # 3) Procesar payload
        for l in (lineas_payload or []):
            if not isinstance(l, dict):
                continue

            linea_id = l.get("id")  # puede ser None
            producto_id = l.get("producto")
            cantidad = int(l.get("cantidad", 1) or 0)
            config_json = l.get("configuracion_json", None)
            precio_unitario_override = l.get("precio_unitario", None)  # Para productos configurables

            # Si cantidad <= 0 lo tratamos como "no debe existir"
            if cantidad <= 0:
                continue

            # anulado es opcional en tu payload actual
            anulado = bool(l.get("anulado", False))
            descuento = Decimal(str(l.get("descuento", 0) or 0))

            if linea_id:
                # UPDATE línea existente (si pertenece a esta comanda)
                linea = actuales_por_id.get(linea_id)
                if not linea:
                    # si llega un id que no es de esta comanda -> ignoramos
                    continue

                incoming_ids.add(linea_id)

                # No tocamos producto/nombre snapshot en updates (se mantienen)
                campos_update = []
                if linea.cantidad != cantidad:
                    linea.cantidad = cantidad
                    campos_update.append("cantidad")

                if hasattr(linea, "descuento") and linea.descuento != descuento:
                    linea.descuento = descuento
                    campos_update.append("descuento")

                # Actualizar configuracion_json si viene
                if config_json is not None and linea.configuracion_json != config_json:
                    linea.configuracion_json = config_json
                    campos_update.append("configuracion_json")

                # Actualizar precio_unitario si viene (para re-ediciones de configurables)
                if precio_unitario_override is not None:
                    nuevo_precio = Decimal(str(precio_unitario_override))
                    if linea.precio_unitario != nuevo_precio:
                        linea.precio_unitario = nuevo_precio
                        campos_update.append("precio_unitario")

                # Actualizar nombre snapshot si viene (para cambios de formato en configurables)
                nombre_override = l.get("producto_nombre")
                if nombre_override and linea.producto_nombre != nombre_override:
                    linea.producto_nombre = nombre_override
                    campos_update.append("producto_nombre")

                if campos_update:
                    linea.save(update_fields=campos_update)

            else:
                # CREATE nueva
                if not producto_id:
                    continue
                nombre_payload = l.get("producto_nombre")
                nuevas.append((int(producto_id), cantidad, anulado, descuento, config_json, precio_unitario_override, nombre_payload))

        # 4) DELETE: borrar las líneas actuales que no vienen en el payload
        ids_actuales = set(actuales_por_id.keys())
        ids_a_borrar = ids_actuales - incoming_ids
        if ids_a_borrar:
            comanda.lineas.filter(id__in=ids_a_borrar).delete()

        # 5) CREATE: crear nuevas líneas con snapshot
        if nuevas:
            producto_ids = [pid for pid, _, _, _, _, _, _ in nuevas]
            productos = {p.id: p for p in Producto.objects.filter(id__in=producto_ids)}

            crear = []
            for producto_id, cantidad, anulado, descuento, config_json, precio_override, nombre_override in nuevas:
                producto = productos.get(producto_id)
                if not producto:
                    continue

                # Para productos configurables el frontend calcula el precio total
                precio = Decimal(str(precio_override)) if precio_override is not None else producto.precio
                nombre = nombre_override if nombre_override else producto.nombre

                obj = LineaComanda(
                    comanda=comanda,
                    producto=producto,
                    cantidad=cantidad,
                    precio_unitario=precio,
                    producto_nombre=nombre,
                    configuracion_json=config_json,
                )
                if hasattr(obj, "descuento"):
                    obj.descuento = descuento

                crear.append(obj)

            if crear:
                LineaComanda.objects.bulk_create(crear)

        return comanda

