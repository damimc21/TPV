"""ViewSets y endpoints relacionados con «mesa»."""
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

class ComandaViewSet(viewsets.ModelViewSet):
    queryset = Comanda.objects.all()
    serializer_class = ComandaSerializer
    permission_classes = [IsAuthenticated]


class MesaViewSet(viewsets.ModelViewSet):
    queryset = Mesa.objects.all()
    serializer_class = MesaSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="abrir-comanda-por-numero")
    def abrir_comanda_por_numero(self, request):
        if not has_app_permission(request.user, "manage_orders"):
            return _forbidden_response(request, "manage_orders")
        """
        Teclado / acceso por número:
        - Crea la mesa si no existe
        - NO crea comanda si no existe (porque ahora trabajas con borrador)
        - Devuelve la comanda abierta si ya existe, si no, devuelve null
        """
        try:
            numero = int(request.data.get("numero"))
        except (TypeError, ValueError):
            return Response({"detail": "numero inválido"}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= numero <= 999):
            return Response({"detail": "numero debe estar entre 1 y 999"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            mesa, _ = Mesa.objects.get_or_create(numero=numero)

            # Si ya hay comanda abierta, la devolvemos; si no, no creamos nada
            comanda = (
                Comanda.objects
                .select_for_update()
                .filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA)
                .order_by("-abierta_a")
                .first()
            )

        data = {
            "mesa": MesaSerializer(mesa).data,
            "comanda": ComandaSerializer(comanda).data if comanda else None,
            "cliente": {
                "id": comanda.cliente.id,
                "nombre": comanda.cliente.nombre
            } if comanda and comanda.cliente else None
        }
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def enviar(self, request, pk=None):
        if not has_app_permission(request.user, "manage_orders"):
            return _forbidden_response(request, "manage_orders")
        """
        Commit del borrador al salir al mapa.
        - Si lineas vacío: vacía y elimina la comanda abierta (si existe)
        - Si hay lineas: sincroniza incrementalmente la comanda abierta y devuelve la comanda actualizada
        """
        mesa = self.get_object()
        lineas = request.data.get("lineas", [])

        if not isinstance(lineas, list):
            return Response({"detail": "'lineas' debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        if len(lineas) == 0:
            comanda_abierta = (
                Comanda.objects
                .filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA)
                .order_by("-abierta_a")
                .first()
            )
            if comanda_abierta:
                comanda_abierta.lineas.all().delete()
                comanda_abierta.delete()

            actualizar_estado_mesa(mesa)
            return Response({"detail": "Comanda vaciada.", "comanda": None}, status=status.HTTP_200_OK)

        try:
            with transaction.atomic():
                comanda = _commit_borrador_a_comanda(mesa, request.user, lineas)
                actualizar_estado_mesa(mesa)
        except Producto.DoesNotExist:
            return Response({"detail": "Producto no existe."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # 🔥 clave: devolver comanda + líneas con IDs reales (para rehidratar frontend)
        return Response(
            {"detail": "OK", "comanda": ComandaSerializer(comanda).data},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"], url_path="asignar-cliente")
    def asignar_cliente(self, request, pk=None):
        if not has_app_permission(request.user, "manage_orders"):
            return _forbidden_response(request, "manage_orders")
        mesa = self.get_object()
        cliente_id = request.data.get("cliente_id")

        comanda = Comanda.objects.filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA).first()
        if not comanda:
            # Si no hay comanda, creamos una para asignar el cliente (borrador inicial)
            comanda = Comanda.objects.create(
                mesa=mesa,
                usuario=request.user,
                abierta_a=timezone.now(),
                estado=Comanda.ESTADO_ABIERTA
            )

        if cliente_id:
            try:
                # Comprobar si es un ID numérico o especial si hubiera
                cliente = Cliente.objects.get(id=int(cliente_id))
                comanda.cliente = cliente
            except (Cliente.DoesNotExist, ValueError):
                return Response({"detail": "Cliente no encontrado"}, status=status.HTTP_404_NOT_FOUND)
        else:
            comanda.cliente = None

        comanda.save(update_fields=["cliente"])
        return Response({"detail": "Cliente actualizado", "cliente_id": cliente_id})


    @action(detail=True, methods=["post"])
    def traspasar(self, request, pk=None):
        if not has_app_permission(request.user, "manage_orders"):
            return _forbidden_response(request, "manage_orders")
        mesa_origen = self.get_object()
        try:
            destino_numero = int(request.data.get("destino_numero"))
        except (TypeError, ValueError):
            return Response({"detail": "destino_numero inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if destino_numero == mesa_origen.numero:
            return Response({"detail": "La mesa destino debe ser distinta de la mesa origen."}, status=status.HTTP_400_BAD_REQUEST)

        mesa_destino = Mesa.objects.filter(numero=destino_numero).first()
        if not mesa_destino:
            return Response({"detail": "La mesa destino no existe."}, status=status.HTTP_400_BAD_REQUEST)

        lineas_payload = request.data.get("lineas", None)
        if lineas_payload is not None and not isinstance(lineas_payload, list):
            return Response({"detail": "'lineas' debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # A partir de ahora confiamos en que frontend llamó primero a sincronizarComanda
            comanda_origen = (
                Comanda.objects.select_for_update()
                .filter(mesa=mesa_origen, estado=Comanda.ESTADO_ABIERTA)
                .order_by("-abierta_a")
                .first()
            )

            if not comanda_origen:
                return Response({"detail": "No hay comanda abierta en la mesa origen."}, status=status.HTTP_400_BAD_REQUEST)

            comanda_destino = (
                Comanda.objects.select_for_update()
                .filter(mesa=mesa_destino, estado=Comanda.ESTADO_ABIERTA)
                .order_by("-abierta_a")
                .first()
            )
            if not comanda_destino:
                comanda_destino = Comanda.objects.create(
                    mesa=mesa_destino,
                    usuario=request.user,
                    abierta_a=timezone.now(),
                    estado=Comanda.ESTADO_ABIERTA,
                )

            origen_qs = comanda_origen.lineas.filter(anulado=False)
            if lineas_payload:
                productos_ids = [int(l.get("producto")) for l in lineas_payload if l.get("producto") is not None]
                origen_qs = origen_qs.filter(producto_id__in=productos_ids)

            lineas_a_traspasar = list(origen_qs)
            if not lineas_a_traspasar:
                return Response({"detail": "No hay líneas para traspasar."}, status=status.HTTP_400_BAD_REQUEST)

            for linea in lineas_a_traspasar:
                destino_linea = comanda_destino.lineas.filter(anulado=False, producto=linea.producto).first()
                if destino_linea:
                    destino_linea.cantidad += linea.cantidad
                    destino_linea.save(update_fields=["cantidad"])
                else:
                    LineaComanda.objects.create(
                        comanda=comanda_destino,
                        producto=linea.producto,
                        cantidad=linea.cantidad,
                        precio_unitario=linea.precio_unitario,
                        producto_nombre=linea.producto_nombre,
                        descuento=linea.descuento,
                    )

            origen_qs.delete()

            if not comanda_origen.lineas.filter(anulado=False).exists():
                comanda_origen.delete()

            actualizar_estado_mesa(mesa_origen)
            actualizar_estado_mesa(mesa_destino)

        return Response({
            "detail": "Traspaso realizado correctamente.",
            "mesa_destino": mesa_destino.numero,
            "traspasadas": len(lineas_a_traspasar),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def cobrar(self, request, pk=None):
        if not has_app_permission(request.user, "process_payments"):
            return _forbidden_response(request, "process_payments")
        """
        Cierra la mesa cobrando:
        1. Sincroniza el borrador (lineas) con la comanda abierta
        2. Emite factura simplificada
        3. Registra el pago (efectivo/tarjeta)
        4. Marca comanda como pagada y libera la mesa
        """
        mesa = self.get_object()
        lineas = request.data.get("lineas", [])
        metodo_pago = request.data.get("metodo_pago", "efectivo")
        importe_entregado = request.data.get("importe_entregado", None)
        is_split = request.data.get("is_split", False)
        cliente_id = request.data.get("cliente_id", None)

        if metodo_pago not in ("efectivo", "tarjeta"):
            return Response({"detail": "metodo_pago debe ser 'efectivo' o 'tarjeta'."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(lineas, list):
            return Response({"detail": "'lineas' debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                if is_split:
                    comanda_origen = (
                        Comanda.objects.select_for_update()
                        .filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA)
                        .order_by("-abierta_a")
                        .first()
                    )
                    if not comanda_origen:
                        registrar_evento(request.user, "ERROR_COBRO_SPLIT", f"Mesa {mesa.numero}: No hay comanda abierta.")
                        return Response({"detail": "No hay comanda abierta para dividir."}, status=status.HTTP_400_BAD_REQUEST)

                    # 1) Creamos una comanda temporal para el cobro
                    # IMPORTANTE: La creamos ya como PAGADA para evitar violar la restricción
                    # de 'unique_comanda_abierta_por_mesa' en models.py
                    comanda = Comanda.objects.create(
                        mesa=mesa,
                        usuario=request.user,
                        abierta_a=timezone.now(),
                        cerrada_a=timezone.now(),
                        estado=Comanda.ESTADO_PAGADA,
                        cliente_id=cliente_id
                    )

                    for l in lineas:
                        if not isinstance(l, dict): continue
                        linea_id = l.get("id")
                        producto_id = l.get("producto")
                        cantidad_a_pagar = int(l.get("cantidad", 0))
                        if cantidad_a_pagar <= 0: continue

                        # Buscamos la línea en la comanda original (por ID primero)
                        linea_origen = None
                        if linea_id:
                            linea_origen = comanda_origen.lineas.filter(id=linea_id, anulado=False).first()

                        # Si no hay ID o no se encontró por ID, buscamos cualquier línea del mismo producto
                        if not linea_origen and producto_id:
                            linea_origen = comanda_origen.lineas.filter(producto_id=producto_id, anulado=False).first()

                        if not linea_origen:
                            registrar_evento(request.user, "ERROR_COBRO_SPLIT", f"Mesa {mesa.numero}: Producto {producto_id} no encontrado.")
                            return Response({"detail": f"Producto {producto_id} no encontrado en la comanda."}, status=status.HTTP_400_BAD_REQUEST)

                        if linea_origen.cantidad < cantidad_a_pagar:
                            # Si una sola línea no llega, intentamos ver si hay más líneas del mismo producto para sumar
                            disponible_total = comanda_origen.lineas.filter(producto_id=linea_origen.producto_id, anulado=False).aggregate(total=Sum('cantidad'))['total'] or 0
                            if disponible_total < cantidad_a_pagar:
                                registrar_evento(request.user, "ERROR_COBRO_SPLIT", f"Mesa {mesa.numero}: Stock insuficiente para producto {producto_id}.")
                                return Response({"detail": f"No hay suficiente cantidad del producto {linea_origen.producto_nombre}."}, status=status.HTTP_400_BAD_REQUEST)

                            # Si llegamos aquí es que hay varias líneas que juntas suman lo necesario
                            # pero por simplicidad de este fix, vamos a forzar que la primera línea tenga suficiente o dar error descriptivo
                            # (En una versión Pro reasignaríamos cantidades entre líneas, pero aquí lo importante es que el cobro no falle)
                            # Actualizamos la línea origen para que "tenga" la cantidad necesaria para el trasvase (hack temporal seguro bajo atomic)
                            # NO, mejor no hackear. Vamos a repartir el descuento y crear la línea.

                        # Creamos la línea en la nueva comanda
                        LineaComanda.objects.create(
                            comanda=comanda,
                            producto=linea_origen.producto,
                            cantidad=cantidad_a_pagar,
                            precio_unitario=linea_origen.precio_unitario,
                            producto_nombre=linea_origen.producto_nombre,
                            descuento=l.get("descuento", linea_origen.descuento),
                        )

                        # Restamos de la comanda original (repartiendo entre líneas del mismo producto si es necesario)
                        cant_pendiente = cantidad_a_pagar
                        lineas_candidatas = comanda_origen.lineas.filter(producto_id=linea_origen.producto_id, anulado=False).order_by('id')
                        for lc in lineas_candidatas:
                            if cant_pendiente <= 0: break
                            if lc.cantidad <= cant_pendiente:
                                cant_pendiente -= lc.cantidad
                                lc.delete()
                            else:
                                lc.cantidad -= cant_pendiente
                                lc.save(update_fields=["cantidad"])
                                cant_pendiente = 0

                    # Si la original se quedó vacía, la eliminamos
                    if not comanda_origen.lineas.filter(anulado=False).exists():
                        comanda_origen.delete()
                else:
                    # 1) Sincronizar borrador completo
                    if len(lineas) > 0:
                        comanda = _commit_borrador_a_comanda(mesa, request.user, lineas)
                    else:
                        comanda = (
                            Comanda.objects.select_for_update()
                            .filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA)
                            .order_by("-abierta_a")
                            .first()
                        )

                if not comanda:
                    return Response({"detail": "No hay comanda abierta."}, status=status.HTTP_400_BAD_REQUEST)

                # Si no es split, actualizamos el cliente de la comanda (si viene uno)
                if not is_split and cliente_id:
                    comanda.cliente_id = cliente_id
                    comanda.save(update_fields=["cliente"])

                # Verificar que hay líneas activas
                if not comanda.lineas.filter(anulado=False).exists():
                    return Response({"detail": "No hay líneas activas para cobrar."}, status=status.HTTP_400_BAD_REQUEST)

                # 2) Emitir factura
                factura = emitir_factura(comanda, request.user, tipo_pago=metodo_pago, allow_pagada=is_split)

                # Aseguramos que la factura también tenga el cliente
                if cliente_id:
                    factura.cliente_id = cliente_id
                    factura.save(update_fields=["cliente"])

                # 3) Registrar pago por el total de la factura
                registrar_pago(factura, request.user, cantidad=factura.total, metodo_pago=metodo_pago)

                # 4) Calcular cambio
                total = factura.total
                if importe_entregado is not None:
                    try:
                        importe = Decimal(str(importe_entregado))
                    except Exception:
                        importe = total
                    cambio = max(importe - total, Decimal("0.00"))
                else:
                    importe = total
                    cambio = Decimal("0.00")

                factura.efectivo_entregado = importe
                factura.cambio = cambio
                factura.save(update_fields=["efectivo_entregado", "cambio"])

                actualizar_estado_mesa(mesa)

        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "detail": "Cobro realizado.",
            "total": str(total),
            "metodo_pago": metodo_pago,
            "cambio": str(cambio),
            "factura_id": factura.id,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def comprobante(self, request, pk=None):
        if not has_app_permission(request.user, "print_documents"):
            return _forbidden_response(request, "print_documents")
        """
        Si hay borrador, lo envía primero.
        Luego marca comprobante_impreso_a/por.
        """
        mesa = self.get_object()
        lineas = request.data.get("lineas", [])
        if lineas is None:
            lineas = []

        if not isinstance(lineas, list):
            return Response({"detail": "'lineas' debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                if len(lineas) > 0:
                    comanda = _commit_borrador_a_comanda(mesa, request.user, lineas)
                else:
                    comanda = Comanda.objects.filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA).order_by("-abierta_a").first()

                if not comanda:
                    return Response({"detail": "No hay comanda abierta."}, status=status.HTTP_400_BAD_REQUEST)

                comanda.comprobante_impreso_a = timezone.now()
                comanda.comprobante_impreso_por = request.user
                comanda.save(update_fields=["comprobante_impreso_a", "comprobante_impreso_por"])

                actualizar_estado_mesa(mesa)

        except Producto.DoesNotExist:
            return Response({"detail": "Producto no existe."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {"detail": "OK", "comanda": ComandaSerializer(comanda).data},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"])
    def total(self, request, pk=None):
        if not has_app_permission(request.user, "manage_orders"):
            return _forbidden_response(request, "manage_orders")
        """
        Si hay borrador, lo envía primero y devuelve el total.
        """
        mesa = self.get_object()
        lineas = request.data.get("lineas", [])
        if lineas is None:
            lineas = []

        if not isinstance(lineas, list):
            return Response({"detail": "'lineas' debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                if len(lineas) > 0:
                    comanda = _commit_borrador_a_comanda(mesa, request.user, lineas)
                else:
                    comanda = Comanda.objects.filter(mesa=mesa, estado=Comanda.ESTADO_ABIERTA).order_by("-abierta_a").first()

                if not comanda:
                    return Response({"detail": "No hay comanda abierta."}, status=status.HTTP_400_BAD_REQUEST)

                total = comanda.total_calculado

                actualizar_estado_mesa(mesa)

        except Producto.DoesNotExist:
            return Response({"detail": "Producto no existe."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {"mesa": mesa.numero, "comanda": comanda.id, "total": str(total)},
            status=status.HTTP_200_OK
        )


class LineaComandaViewSet(viewsets.ModelViewSet):
    queryset = LineaComanda.objects.all()
    serializer_class = LineaComandaSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        linea = serializer.save()
        if linea.comanda and linea.comanda.mesa:
            actualizar_estado_mesa(linea.comanda.mesa)

    def perform_update(self, serializer):
        linea = serializer.save()
        if linea.comanda and linea.comanda.mesa:
            actualizar_estado_mesa(linea.comanda.mesa)

    def perform_destroy(self, instance):
        # En lugar de eliminar físicamente la línea, la marcamos como anulada (soft delete).
        instance.anulado = True
        instance.anulado_por = self.request.user
        instance.anulado_a = timezone.now()
        instance.save(update_fields=["anulado", "anulado_por", "anulado_a"])
        if instance.comanda and instance.comanda.mesa:
            actualizar_estado_mesa(instance.comanda.mesa)

