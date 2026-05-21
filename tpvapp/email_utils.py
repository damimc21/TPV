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
    Genera un PDF de la factura usando reportlab.
    Devuelve los bytes del PDF.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        raise RuntimeError("reportlab no está instalado. Añade 'reportlab>=4.0' a requirements-prod.txt.")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#1a1a2e"))
    subtitle_style = ParagraphStyle("subtitle", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#555555"))
    header_style = ParagraphStyle("header", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold")
    normal_style = ParagraphStyle("normal", parent=styles["Normal"], fontSize=10)

    elements = []

    # --- Cabecera ---
    elements.append(Paragraph("FACTURA", title_style))
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(Paragraph(f"Nº {factura.id:06d}  ·  {factura.emitida_a.strftime('%d/%m/%Y %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 0.5 * cm))

    # --- Datos del cliente ---
    cliente = factura.cliente
    if cliente:
        elements.append(Paragraph("FACTURADO A", header_style))
        elements.append(Paragraph(cliente.nombre, normal_style))
        if cliente.nif:
            elements.append(Paragraph(f"NIF/CIF: {cliente.nif}", normal_style))
        if cliente.email:
            elements.append(Paragraph(f"Email: {cliente.email}", normal_style))
    elements.append(Spacer(1, 0.7 * cm))

    # --- Tabla de líneas ---
    lineas = factura.comanda.lineas.filter(anulado=False).select_related("producto") if factura.comanda else []

    tabla_data = [["Producto", "Cant.", "Precio unit.", "Dto.", "Total"]]
    for linea in lineas:
        desc = float(linea.descuento)
        precio = float(linea.precio_unitario)
        total_linea = linea.cantidad * precio * (1 - desc / 100)
        tabla_data.append([
            linea.producto_nombre,
            str(linea.cantidad),
            f"{precio:.2f} €",
            f"{desc:.0f}%" if desc > 0 else "—",
            f"{total_linea:.2f} €",
        ])

    if not tabla_data[1:]:
        tabla_data.append(["(Sin líneas)", "", "", "", ""])

    col_widths = [8 * cm, 1.5 * cm, 3 * cm, 2 * cm, 3 * cm]
    tabla = Table(tabla_data, colWidths=col_widths)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (1, 0), (-1, 0), "CENTER"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#1a1a2e")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(tabla)
    elements.append(Spacer(1, 0.5 * cm))

    # --- Totales ---
    totales_data = [
        ["Subtotal:", f"{factura.subtotal:.2f} €"],
        ["IVA:", f"{factura.impuestos:.2f} €"],
        ["TOTAL:", f"{factura.total:.2f} €"],
    ]
    totales_tabla = Table(totales_data, colWidths=[14 * cm, 3.5 * cm])
    totales_tabla.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 2), (-1, 2), 11),
        ("LINEABOVE", (0, 2), (-1, 2), 1, colors.HexColor("#1a1a2e")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(totales_tabla)
    elements.append(Spacer(1, 0.4 * cm))

    metodo = factura.get_tipo_pago_display() if hasattr(factura, "get_tipo_pago_display") else factura.tipo_pago
    elements.append(Paragraph(f"Método de pago: {metodo}", subtitle_style))
    elements.append(Spacer(1, 1 * cm))
    elements.append(Paragraph("Gracias por su visita.", subtitle_style))

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


def enviar_factura_email_a_direccion(factura, email_destino: str) -> bool:
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

    # Generar PDF
    try:
        pdf_bytes = generar_pdf_factura(factura)
    except Exception as e:
        logger.error("email_utils: error generando PDF para factura %s: %s", factura.id, e)
        return False

    cuerpo_html = f"""
    <p>Hola,</p>
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
