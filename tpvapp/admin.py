from django.contrib import admin

from .models import (
    Usuario, Departamento, Producto, Mesa, Comanda,
    LineaComanda, Factura, Pago, EventoAuditoria, Cliente, Impresora,
    Proveedor
)

admin.site.register(Usuario)
admin.site.register(Departamento)
admin.site.register(Producto)
admin.site.register(Mesa)
admin.site.register(Comanda)
admin.site.register(LineaComanda)
admin.site.register(Factura)
admin.site.register(Pago)
admin.site.register(EventoAuditoria)
admin.site.register(Cliente)
admin.site.register(Impresora)
admin.site.register(Proveedor)
