from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    DepartamentoViewSet, ProductoViewSet, MesaViewSet,
    ComandaViewSet, LineaComandaViewSet, FacturaViewSet, EventoAuditoriaViewSet,
    PerfilComentariosViewSet, ComentarioViewSet, PerfilSuplementosViewSet, SuplementoViewSet,
    listar_iconos, ClienteViewSet, plantilla_configurable, MovimientoStockViewSet,
    CategoriaInventarioViewSet, ProveedorViewSet, ArticuloInventarioViewSet,
    plantillas_inventario, importar_plantilla_inventario, configuracion_update,
    operadores_tpv, ImpresoraViewSet
)

router = DefaultRouter()
router.register(r"departamentos", DepartamentoViewSet)
router.register(r"productos", ProductoViewSet)
router.register(r"mesas", MesaViewSet)
router.register(r"clientes", ClienteViewSet)
router.register(r"comandas", ComandaViewSet)
router.register(r"lineas", LineaComandaViewSet)
router.register(r"facturas", FacturaViewSet)
router.register(r"auditoria", EventoAuditoriaViewSet)
router.register(r"perfiles-comentarios", PerfilComentariosViewSet)
router.register(r"comentarios", ComentarioViewSet)
router.register(r"perfiles-suplementos", PerfilSuplementosViewSet)
router.register(r"suplementos", SuplementoViewSet)
router.register(r"movimientos-stock", MovimientoStockViewSet)
router.register(r"categorias-inventario", CategoriaInventarioViewSet)
router.register(r"proveedores", ProveedorViewSet)
router.register(r"articulos-inventario", ArticuloInventarioViewSet)
router.register(r"impresoras", ImpresoraViewSet)

urlpatterns = [
    path("catalogo/iconos/", listar_iconos, name="listar_iconos"),
    path("productos/<int:producto_id>/plantilla/", plantilla_configurable, name="plantilla_configurable"),
    path("plantillas-inventario/", plantillas_inventario, name="plantillas_inventario"),
    path("plantillas-inventario/importar/", importar_plantilla_inventario, name="importar_plantilla_inventario"),
    path("configuracion/update/", configuracion_update, name="configuracion_update"),
    path("tpv/operadores/", operadores_tpv, name="operadores_tpv"),
    path("", include(router.urls)),
]
