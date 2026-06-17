"""
Utilidades de email para el TPV.

Genera el PDF de una factura y lo envía al cliente via Resend.
La API key de Resend se configura via variable de entorno RESEND_API_KEY.

En modo sandbox (EMAIL_DEMO_RECIPIENT configurado), los emails se redirigen
a esa dirección en lugar del email real del cliente.

Configuración necesaria en settings.py / env vars:
    RESEND_API_KEY        = "re_xxxx..."
    DEFAULT_FROM_EMAIL    = "onboarding@resend.dev"  (o tu dominio verificado)
    EMAIL_DEMO_RECIPIENT = ""   (vacío = enviar al email real del cliente)
                                 (con valor = redirigir todo a ese email, modo demo)
"""

import io
import logging
import base64

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Generación del PDF
# ---------------------------------------------------------------------------

def generar_pdf_factura(factura) -> bytes:
    """
    Genera un PDF de la factura usando reportlab, con el mismo formato y
    aspecto que el ticket impreso en el TPV (recibo estrecho, monoespaciado),
    pero añadiendo los datos fiscales del cliente y la denominación de
    factura, ya que este PDF es el que se envía por email.
    Devuelve los bytes del PDF.
    """
    try:
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
    except ImportError:
        raise RuntimeError("reportlab no está instalado. Añade 'reportlab>=4.0' a requirements-prod.txt.")

    # Medidas tipo "recibo" (igual de estrecho que el ticket de 320px/80mm)
    ANCHO_PAGINA = 80 * mm
    ALTO_PAGINA = 320 * mm  # margen amplio para que quepa todo en una sola página
    MARGEN = 6 * mm
    ANCHO_UTIL = ANCHO_PAGINA - 2 * MARGEN

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=(ANCHO_PAGINA, ALTO_PAGINA),
        leftMargin=MARGEN,
        rightMargin=MARGEN,
        topMargin=MARGEN + 2 * mm,
        bottomMargin=MARGEN + 2 * mm,
    )

    INK = colors.HexColor("#0f172a")
    MUTED = colors.HexColor("#475569")

    nombre_style = ParagraphStyle("nombre", fontName="Courier-Bold", fontSize=13, leading=15, alignment=TA_CENTER, textColor=INK)
    centrado_style = ParagraphStyle("centrado", fontName="Courier", fontSize=8, leading=10, alignment=TA_CENTER, textColor=INK)
    body_style = ParagraphStyle("body", fontName="Courier", fontSize=8.5, leading=11, textColor=INK)
    body_bold_style = ParagraphStyle("body_bold", fontName="Courier-Bold", fontSize=8.5, leading=11, textColor=INK)
    seccion_style = ParagraphStyle("seccion", fontName="Courier-Bold", fontSize=8.5, leading=11, textColor=INK, spaceAfter=1)
    total_style = ParagraphStyle("total", fontName="Courier-Bold", fontSize=13, leading=16, textColor=INK)
    footer_style = ParagraphStyle("footer", fontName="Courier-Oblique", fontSize=9, leading=12, alignment=TA_CENTER, textColor=INK)
    pendiente_style = ParagraphStyle("pendiente", fontName="Courier-Oblique", fontSize=8, leading=11, alignment=TA_CENTER, textColor=MUTED)

    def fila_doble(label, value, label_w=30 * mm):
        t = Table(
            [[Paragraph(label, body_style), Paragraph(value, body_style)]],
            colWidths=[label_w, ANCHO_UTIL - label_w],
        )
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ]))
        return t

    elements = []

    # --- Bloque 1: Empresa (idéntico al ticket impreso) ---
    elements.append(Paragraph("TPV Hostelería SL", nombre_style))
    elements.append(Paragraph("NIF: B-12345678", centrado_style))
    elements.append(Paragraph("Calle Falsa 123, 28001 Madrid", centrado_style))
    elements.append(Paragraph("Tel: 912 345 678", centrado_style))
    elements.append(Spacer(1, 3 * mm))
    elements.append(HRFlowable(width="100%", thickness=1.2, color=INK))
    elements.append(Spacer(1, 2 * mm))

    # --- Bloque 2: Datos del documento ---
    tipo_doc = "FACTURA SIMPLIFICADA" if factura.estado == "pagada" else "COMPROBANTE DE VENTA"
    if getattr(factura, "tipo_factura", None) == "Completa":
        tipo_doc = "FACTURA"

    mesa_nombre = factura.comanda.mesa.nombre if factura.comanda and factura.comanda.mesa else "-"
    atendido_por = ""
    if factura.emitida_por:
        atendido_por = factura.emitida_por.first_name or factura.emitida_por.username

    elements.append(fila_doble("Nº Factura:", f"{factura.id:06d}"))
    elements.append(fila_doble("Tipo de documento:", tipo_doc))
    elements.append(fila_doble("Fecha/Hora:", factura.emitida_a.strftime("%d/%m/%Y %H:%M")))
    elements.append(fila_doble("Mesa:", mesa_nombre))
    elements.append(fila_doble("Atendido por:", atendido_por))

    elements.append(Spacer(1, 2 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.6, color=MUTED, dash=(2, 2)))
    elements.append(Spacer(1, 2 * mm))

    # --- Bloque 3: Datos fiscales del cliente (lo que distingue una factura de un ticket) ---
    cliente = factura.cliente
    datos_ocas = factura.datos_facturacion if not cliente else None
    if cliente or datos_ocas:
        if cliente:
            nombre_fact = cliente.nombre or ""
            nif_fact    = cliente.nif or ""
            email_fact  = cliente.email or ""
            dir_fact    = cliente.direccion or ""
            cp_fact     = cliente.codigo_postal or ""
            pobl_fact   = cliente.poblacion or ""
            prov_fact   = cliente.provincia or ""
        else:
            nombre_fact = datos_ocas.get("nombre", "") or ""
            nif_fact    = datos_ocas.get("nif", "") or ""
            email_fact  = datos_ocas.get("email", "") or ""
            dir_fact    = datos_ocas.get("direccion", "") or ""
            cp_fact     = datos_ocas.get("cp", "") or ""
            pobl_fact   = datos_ocas.get("poblacion", "") or ""
            prov_fact   = datos_ocas.get("provincia", "") or ""

        elements.append(Paragraph("FACTURADO A", seccion_style))
        if nombre_fact:
            elements.append(Paragraph(nombre_fact, body_style))
        if nif_fact:
            elements.append(Paragraph(f"NIF/CIF: {nif_fact}", body_style))
        if dir_fact:
            linea_dir = dir_fact
            if cp_fact or pobl_fact:
                linea_dir += f", {cp_fact} {pobl_fact}".strip(", ")
            if prov_fact:
                linea_dir += f" ({prov_fact})"
            elements.append(Paragraph(linea_dir, body_style))
        if email_fact:
            elements.append(Paragraph(f"Email: {email_fact}", body_style))

        elements.append(Spacer(1, 2 * mm))
        elements.append(HRFlowable(width="100%", thickness=0.6, color=MUTED, dash=(2, 2)))
        elements.append(Spacer(1, 2 * mm))

    # --- Bloque 4: Líneas de productos ---
    lineas = factura.comanda.lineas.filter(anulado=False).select_related("producto") if factura.comanda else []

    tabla_data = [[
        Paragraph("Cant.", body_bold_style), Paragraph("Artículo", body_bold_style),
        Paragraph("P.U.", body_bold_style), Paragraph("Total", body_bold_style),
    ]]
    for linea in lineas:
        desc = float(linea.descuento)
        precio = float(linea.precio_unitario)
        total_linea = linea.cantidad * precio * (1 - desc / 100)
        nombre_linea = linea.producto_nombre
        if desc > 0:
            nombre_linea += f" (-{desc:.0f}%)"
        tabla_data.append([
            Paragraph(str(linea.cantidad), body_style),
            Paragraph(nombre_linea, body_style),
            Paragraph(f"{precio:.2f}", body_style),
            Paragraph(f"{total_linea:.2f} €", body_style),
        ])

    if not tabla_data[1:]:
        tabla_data.append([Paragraph("(Sin líneas)", body_style), "", "", ""])

    col_widths = [8 * mm, ANCHO_UTIL - 8 * mm - 12 * mm - 16 * mm, 12 * mm, 16 * mm]
    tabla = Table(tabla_data, colWidths=col_widths)
    tabla.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 1, INK),
    ]))
    elements.append(tabla)
    elements.append(Spacer(1, 2 * mm))
    elements.append(HRFlowable(width="100%", thickness=0.6, color=INK))
    elements.append(Spacer(1, 2 * mm))

    # --- Bloque 5: Impuestos y totales ---
    elements.append(fila_doble("Base Imponible:", f"{factura.subtotal:.2f} €", label_w=38 * mm))
    elements.append(fila_doble("IVA (10%):", f"{factura.impuestos:.2f} €", label_w=38 * mm))
    elements.append(Spacer(1, 1 * mm))

    total_tabla = Table(
        [[Paragraph("TOTAL:", total_style), Paragraph(f"{factura.total:.2f} €", total_style)]],
        colWidths=[34 * mm, ANCHO_UTIL - 34 * mm],
    )
    total_tabla.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, 0), 1.5, INK),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, INK),
    ]))
    elements.append(total_tabla)

    if factura.estado != "pagada":
        elements.append(Spacer(1, 1 * mm))
        elements.append(Paragraph("PENDIENTE DE COBRO", pendiente_style))

    elements.append(Spacer(1, 3 * mm))

    # --- Bloque 6: Pago y pie ---
    metodo = factura.get_tipo_pago_display() if hasattr(factura, "get_tipo_pago_display") else factura.tipo_pago
    elements.append(fila_doble("MÉTODO DE PAGO:", str(metodo).upper(), label_w=34 * mm))
    if factura.tipo_pago == "efectivo":
        elements.append(fila_doble("Entrega:", f"{factura.efectivo_entregado:.2f} €", label_w=34 * mm))
        elements.append(fila_doble("Cambio:", f"{factura.cambio:.2f} €", label_w=34 * mm))

    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph("¡Gracias por su visita!", footer_style))

    doc.build(elements)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Envío via Resend
# ---------------------------------------------------------------------------

def enviar_factura_email(factura) -> bool:
    """
    Genera el PDF de la factura y lo envía al cliente via Resend.

    Si EMAIL_DEMO_RECIPIENT está configurado en settings, el email se redirige
    a esa dirección (modo demo).

    Devuelve True si se envió correctamente, False en caso contrario.
    """
    import os
    try:
        import resend
    except ImportError:
        logger.warning("email_utils: resend no está instalado, no se envía email")
        return False

    if not factura.cliente or not factura.cliente.email:
        logger.warning("email_utils: factura %s sin cliente o email", factura.id)
        return False

    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("email_utils: RESEND_API_KEY no configurada, no se envía email")
        return False

    resend.api_key = api_key

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "onboarding@resend.dev")
    sandbox_recipient = getattr(settings, "EMAIL_DEMO_RECIPIENT", "")
    to_email = sandbox_recipient if sandbox_recipient else factura.cliente.email
    cliente_nombre = factura.cliente.nombre if factura.cliente else "Cliente"

    # Generar PDF
    try:
        pdf_bytes = generar_pdf_factura(factura)
    except Exception as e:
        logger.error("email_utils: error generando PDF para factura %s: %s", factura.id, e)
        return False

    # Cuerpo del email
    cuerpo_html = f"""
    <p>Hola <strong>{cliente_nombre}</strong>,</p>
    <p>Adjuntamos la factura correspondiente a tu visita del
    <strong>{factura.emitida_a.strftime('%d/%m/%Y a las %H:%M')}</strong>.</p>
    <p><strong>Total: {factura.total:.2f} €</strong></p>
    <p>Muchas gracias por tu visita.</p>
    """
    if sandbox_recipient and sandbox_recipient != factura.cliente.email:
        cuerpo_html += f"<p><small>[MODO DEMO: email dirigido originalmente a {factura.cliente.email}]</small></p>"

    # Enviar via Resend
    try:
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": f"Tu factura #{factura.id:06d}",
            "html": cuerpo_html,
            "attachments": [{
                "filename": f"factura_{factura.id:06d}.pdf",
                "content": list(pdf_bytes),
            }],
        })
        logger.info("email_utils: factura %s enviada a %s via Resend", factura.id, to_email)
        return True
    except Exception as e:
        logger.error("email_utils: error enviando email factura %s via Resend: %s", factura.id, e)
        return False


def enviar_factura_email_a_direccion(factura, email_destino: str, nombre: str = None) -> bool:
    """
    Envía la factura a una dirección de email explícita (cliente ocasional sin FK en BD).

    Si EMAIL_DEMO_RECIPIENT está configurado, redirige igual que el flujo normal.
    Devuelve True si se envió correctamente, False en caso contrario.
    """
    import os
    try:
        import resend
    except ImportError:
        logger.warning("email_utils: resend no está instalado, no se envía email")
        return False

    if not email_destino:
        logger.warning("email_utils: enviar_factura_email_a_direccion llamado sin email_destino")
        return False

    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("email_utils: RESEND_API_KEY no configurada, no se envía email")
        return False

    resend.api_key = api_key

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "onboarding@resend.dev")
    sandbox_recipient = getattr(settings, "EMAIL_DEMO_RECIPIENT", "")
    to_email = sandbox_recipient if sandbox_recipient else email_destino

    # Nombre para el saludo: del parámetro explícito o de datos_facturacion
    if not nombre and factura.datos_facturacion:
        nombre = factura.datos_facturacion.get("nombre", None)

    # Generar PDF
    try:
        pdf_bytes = generar_pdf_factura(factura)
    except Exception as e:
        logger.error("email_utils: error generando PDF para factura %s: %s", factura.id, e)
        return False

    saludo = f"Hola, <strong>{nombre}</strong>" if nombre else "Hola"
    cuerpo_html = f"""
    <p>{saludo},</p>
    <p>Adjuntamos la factura correspondiente a tu visita del
    <strong>{factura.emitida_a.strftime('%d/%m/%Y a las %H:%M')}</strong>.</p>
    <p><strong>Total: {factura.total:.2f} €</strong></p>
    <p>Muchas gracias por tu visita.</p>
    """
    if sandbox_recipient and sandbox_recipient != email_destino:
        cuerpo_html += f"<p><small>[MODO DEMO: email dirigido originalmente a {email_destino}]</small></p>"

    try:
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": f"Tu factura #{factura.id:06d}",
            "html": cuerpo_html,
            "attachments": [{
                "filename": f"factura_{factura.id:06d}.pdf",
                "content": list(pdf_bytes),
            }],
        })
        logger.info("email_utils: factura %s (ocasional) enviada a %s via Resend", factura.id, to_email)
        return True
    except Exception as e:
        logger.error("email_utils: error enviando email factura %s (ocasional) via Resend: %s", factura.id, e)
        return False
