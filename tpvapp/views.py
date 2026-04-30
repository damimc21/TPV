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

from .models import (
    Departamento, Producto, Mesa, Comanda, LineaComanda, Factura, Pago, EventoAuditoria,
    PerfilComentarios, Comentario, PerfilSuplementos, Suplemento, Cliente,
    PlantillaConfigurable, FormatoProducto, GrupoOpciones, OpcionGrupo, PrecioOpcionFormato, MovimientoStock,
    CategoriaInventario, Proveedor, ArticuloInventario
)
from .serializers import (
    DepartamentoSerializer, ProductoSerializer, MesaSerializer, ComandaSerializer,
    LineaComandaSerializer, FacturaSerializer, PagoSerializer, EventoAuditoriaSerializer,
    PerfilComentariosSerializer, ComentarioSerializer, PerfilSuplementosSerializer, SuplementoSerializer,
    ClienteSerializer, PlantillaConfigurableSerializer, MovimientoStockSerializer,
    CategoriaInventarioSerializer, ProveedorSerializer, ArticuloInventarioSerializer
)
from .services import actualizar_estado_mesa, imprimir_comprobante, emitir_factura, registrar_pago, registrar_evento
from .permissions import IsManagerOrReadOnly, has_app_permission
from tpvapp.auditoria import log_info, log_warn, log_error

# Create your views here.
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


class EventoAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EventoAuditoria.objects.all().order_by("-fecha")
    serializer_class = EventoAuditoriaSerializer
    permission_classes = [IsAuthenticated]


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


# =========================
# Comentarios y Suplementos
# =========================

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


# =========================
# INVENTARIO: Materias Primas / Ingredientes
# =========================

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

from .models import ConfiguracionTPV
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
