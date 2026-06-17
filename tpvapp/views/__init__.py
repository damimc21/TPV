"""Paquete `tpvapp.views` (refactor de tpvapp/views.py original)."""

from ._helpers import (
    _actor_username,
    _forbidden_response,
    _commit_borrador_a_comanda,
)

from .catalogo import (
    DepartamentoViewSet,
    ProductoViewSet,
    PerfilComentariosViewSet,
    ComentarioViewSet,
    PerfilSuplementosViewSet,
    SuplementoViewSet,
    plantilla_configurable,
    listar_iconos,
)

from .clientes import (
    ClienteViewSet,
)

from .mesa import (
    ComandaViewSet,
    MesaViewSet,
    LineaComandaViewSet,
    operadores_tpv,
)

from .facturacion import (
    FacturaViewSet,
)

from .auditoria import (
    EventoAuditoriaViewSet,
)

from .inventario import (
    MovimientoStockViewSet,
    CategoriaInventarioViewSet,
    ProveedorViewSet,
    ArticuloInventarioViewSet,
    plantillas_inventario,
    importar_plantilla_inventario,
)

from .configuracion import (
    configuracion_update,
    ImpresoraViewSet,
)

__all__ = [
    "_actor_username",
    "_forbidden_response",
    "_commit_borrador_a_comanda",
    "DepartamentoViewSet",
    "ProductoViewSet",
    "PerfilComentariosViewSet",
    "ComentarioViewSet",
    "PerfilSuplementosViewSet",
    "SuplementoViewSet",
    "plantilla_configurable",
    "listar_iconos",
    "ClienteViewSet",
    "ComandaViewSet",
    "MesaViewSet",
    "LineaComandaViewSet",
    "operadores_tpv",
    "FacturaViewSet",
    "EventoAuditoriaViewSet",
    "MovimientoStockViewSet",
    "CategoriaInventarioViewSet",
    "ProveedorViewSet",
    "ArticuloInventarioViewSet",
    "plantillas_inventario",
    "importar_plantilla_inventario",
    "configuracion_update",
    "ImpresoraViewSet",
]
