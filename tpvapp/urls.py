from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    DepartamentoViewSet, ProductoViewSet, MesaViewSet,
    ComandaViewSet, LineaComandaViewSet, FacturaViewSet, EventoAuditoriaViewSet,
    PerfilComentariosViewSet, ComentarioViewSet, PerfilSuplementosViewSet, SuplementoViewSet,
    listar_iconos, ClienteViewSet, plantilla_configurable
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

urlpatterns = [
    path("catalogo/iconos/", listar_iconos, name="listar_iconos"),
    path("productos/<int:producto_id>/plantilla/", plantilla_configurable, name="plantilla_configurable"),
    path("", include(router.urls)),
]

