from django.db.models import Q
from django.utils import timezone
from decimal import Decimal
from .models import Mesa, Comanda, LineaComanda, Factura, Pago, EventoAuditoria, SesionCaja, Cliente, MovimientoStock, ArticuloInventario
from django.core.mail import send_mail
from django.conf import settings
import threading
from tpvapp.auditoria import log_info



def registrar_evento(usuario, evento: str, detalles: str = ""):
    EventoAuditoria.objects.create(usuario=usuario, evento=evento, detalles=detalles)
    username = getattr(usuario, "username", None) or "sistema"
    message = f"usuario={username} evento={evento}"
    if detalles:
        message += f" detalles={detalles}"
    log_info("auditoria.evento", message)


def actualizar_estado_mesa(mesa: Mesa):
    """
    Regla:
    - libre: no hay comandas abiertas
    - ocupada: hay líneas activas y NO hay comprobante
    - pagando: hay líneas activas y hay comprobante (aunque se añadan líneas después)
    """

    comanda_abierta = Comanda.objects.filter(
        mesa=mesa,
        estado=Comanda.ESTADO_ABIERTA,
    ).order_by("-abierta_a").first()

    if not comanda_abierta:
        mesa.estado = Mesa.ESTADO_LIBRE
        mesa.save(update_fields=["estado"])
        return

    mesa.estado = Mesa.ESTADO_PAGANDO if comanda_abierta.tiene_comprobante else Mesa.ESTADO_OCUPADA
    mesa.save(update_fields=["estado"])

def imprimir_comprobante(comanda: Comanda, usuario):
    if comanda.estado == Comanda.ESTADO_PAGADA:
        raise ValueError("No se puede imprimir comprobante: comanda ya pagada.")
    if comanda.estado == Comanda.ESTADO_ANULADA:
        raise ValueError("No se puede imprimir comprobante: comanda anulada.")

    hay_lineas = comanda.lineas.filter(anulado=False).exists()
    if not hay_lineas:
        raise ValueError("No se puede imprimir comprobante: la comanda no tiene líneas activas.")

    comanda.comprobante_impreso_a = timezone.now()
    comanda.comprobante_impreso_por = usuario
    comanda.save(update_fields=["comprobante_impreso_a", "comprobante_impreso_por"])

    registrar_evento(usuario, "COMPROBANTE_IMPRESO", f"comanda_id={comanda.id}, mesa_id={comanda.mesa_id}")
    actualizar_estado_mesa(comanda.mesa)


def procesar_stock_comanda(comanda: Comanda, usuario):
    """
    Descuenta solo articulos de inventario vinculados y activados.

    El inventario es voluntario y de apoyo: no bloquea ventas, permite
    negativos para mantener trazabilidad y no aplica recetas ni configurables.
    """
    lineas = (
        comanda.lineas
        .filter(anulado=False, producto__isnull=False)
        .select_related("producto", "producto__articulo_inventario")
    )
    if not lineas.exists():
        return

    for linea in lineas:
        producto = linea.producto
        try:
            articulo = producto.articulo_inventario
        except ArticuloInventario.DoesNotExist:
            continue

        if not articulo.auto_descontar:
            continue

        total_a_descontar = Decimal(linea.cantidad)

        if total_a_descontar > 0:
            stock_anterior = articulo.stock_actual
            articulo.stock_actual -= total_a_descontar
            articulo.save(update_fields=["stock_actual"])

            MovimientoStock.objects.create(
                articulo=articulo,
                tipo=MovimientoStock.TIPO_VENTA,
                cantidad=total_a_descontar,
                anterior=stock_anterior,
                nuevo=articulo.stock_actual,
                usuario=usuario,
                linea_comanda=linea,
                motivo=f"Venta en Comanda #{comanda.id}"
            )

            if articulo.stock_actual < 0:
                registrar_evento(
                    usuario,
                    "STOCK_NEGATIVO",
                    f"articulo_id={articulo.id}, linea_id={linea.id}, stock={articulo.stock_actual}"
                )
def emitir_factura(comanda: Comanda, usuario, tipo_pago: str = "efectivo", tipo_factura: str = "Simplificada", allow_pagada: bool = False):
    if not allow_pagada and comanda.estado == Comanda.ESTADO_PAGADA:
        raise ValueError("La comanda ya está pagada.")
    if comanda.estado == Comanda.ESTADO_ANULADA:
        raise ValueError("No se puede facturar una comanda anulada.")

    lineas = comanda.lineas.filter(anulado=False)
    if not lineas.exists():
        raise ValueError("No se puede facturar: no hay líneas activas.")

    total = sum(l.total for l in lineas)
    subtotal = (total / Decimal("1.10")).quantize(Decimal("0.00"))  # Base Imponible
    impuestos = total - subtotal                                   # IVA (10%)

    # Buscar sesión activa
    sesion = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()

    factura = Factura.objects.create(
        comanda=comanda,
        sesion=sesion,
        tipo_pago=tipo_pago,
        tipo_factura=tipo_factura,
        emitida_por=usuario,
        subtotal=subtotal,
        impuestos=impuestos,
        total=total,
        estado=Factura.ESTADO_EMITIDA,
    )

    registrar_evento(usuario, "FACTURA_EMITIDA", f"factura_id={factura.id}, comanda_id={comanda.id}")
    return factura


def registrar_pago(factura: Factura, usuario, cantidad, metodo_pago: str = "efectivo"):
    if factura.estado == Factura.ESTADO_ANULADA:
        raise ValueError("No se puede pagar una factura anulada.")
    if factura.estado == Factura.ESTADO_PAGADA:
        raise ValueError("La factura ya está pagada.")

    # Buscar sesión activa
    sesion = SesionCaja.objects.filter(fecha_cierre__isnull=True).first()

    pago = Pago.objects.create(
        factura=factura,
        sesion=sesion,
        cantidad=cantidad,
        metodo_pago=metodo_pago,
    )

    # Regla simple: si el pago cubre el total, marcamos pagada
    total_pagado = sum(p.cantidad for p in factura.pagos.all())
    if total_pagado >= factura.total:
        factura.estado = Factura.ESTADO_PAGADA
        factura.save(update_fields=["estado"])

        # Si todas las facturas de la comanda están pagadas -> comanda pagada
        comanda = factura.comanda
        if comanda and not comanda.facturas.exclude(estado=Factura.ESTADO_PAGADA).exists():
            comanda.estado = Comanda.ESTADO_PAGADA
            comanda.cerrada_a = comanda.cerrada_a or timezone.now()
            comanda.save(update_fields=["estado", "cerrada_a"])
            registrar_evento(usuario, "COMANDA_PAGADA", f"comanda_id={comanda.id}")

            # Liberar mesa
            if comanda.mesa:
                actualizar_estado_mesa(comanda.mesa)

            # PROCESAR STOCK
            try:
                procesar_stock_comanda(comanda, usuario)
            except Exception as e:
                registrar_evento(usuario, "ERROR_STOCK", f"Error procesando stock comanda {comanda.id}: {str(e)}")

    registrar_evento(usuario, "PAGO_REGISTRADO", f"pago_id={pago.id}, factura_id={factura.id}, cantidad={cantidad}")

    # --- Envío automático de email (en segundo plano para no bloquear el cobro) ---
    if factura.estado == Factura.ESTADO_PAGADA and factura.cliente and factura.cliente.email:
        factura_id = factura.id
        def _enviar_email_bg():
            try:
                f = Factura.objects.select_related('cliente').get(id=factura_id)
                enviar_factura_email(f)
            except Exception as e:
                print(f"Error al enviar email automático: {e}")
        t = threading.Thread(target=_enviar_email_bg, daemon=True)
        t.start()

    return pago

def enviar_factura_email(factura: Factura):
    """
    Simulación de envío de factura por email.
    En una implementación real, aquí generaríamos un PDF.
    """
    if not factura.cliente or not factura.cliente.email:
        return

    cliente = factura.cliente
    subject = f"Factura {factura.id} - TPV"

    # Construir cuerpo del mensaje
    mensaje = f"Hola {cliente.nombre},\n\n"
    mensaje += f"Adjuntamos el detalle de su factura emitida el {factura.emitida_a.strftime('%d/%m/%Y %H:%M')}.\n\n"
    mensaje += f"Total: {factura.total}€\n\n"
    mensaje += "Gracias por su visita.\n"

    try:
        send_mail(
            subject,
            mensaje,
            settings.DEFAULT_FROM_EMAIL,
            [cliente.email],
            fail_silently=False,
        )
        factura.email_enviado = True
        factura.save(update_fields=["email_enviado"])
        registrar_evento(None, "EMAIL_ENVIADO", f"factura_id={factura.id}, email={cliente.email}")
    except Exception as e:
        raise e
