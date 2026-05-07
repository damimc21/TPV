from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

app_name = "ui"

urlpatterns = [
    path("", views.index, name="index"),
    path("tpv/", views.tpv, name="tpv"),
    path("tpv/mesa/<int:numero>/", views.mesa, name="mesa"),
    path("tpv/ticket/<int:factura_id>/", views.ticket, name="ticket"),
    path("tpv/ticket/cierre/<int:dia_id>/", views.ticket_cierre_dia, name="ticket_cierre_dia"),
    path("tpv/ticket/turno/<int:sesion_id>/", views.ticket_cierre_turno, name="ticket_cierre_turno"),
    path("tpv/comprobante/<int:comanda_id>/", views.comprobante, name="comprobante"),

    # LOGIN/LOGOUT
    path("login/", views.TpvLoginView.as_view(), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),

    # CARDS
    path("ficheros/", views.ficheros, name="ficheros"),
    path("ficheros/importar/", views.ficheros_importar, name="ficheros_importar"),
    path("ficheros/exportar/", views.ficheros_exportar, name="ficheros_exportar"),
    path("ficheros/backups/", views.ficheros_backups, name="ficheros_backups"),
    path("ficheros/informes/", views.ficheros_informes, name="ficheros_informes"),
    path("ficheros/auditoria/", views.ficheros_auditoria, name="ficheros_auditoria"),
    path("ficheros/logs/", views.ficheros_logs, name="ficheros_logs"),
    path("catalogo/", views.catalogo, name="catalogo"),
    path("catalogo/articulos/", views.catalogo_articulos, name="catalogo_articulos"),
    path("catalogo/modificadores/", views.catalogo_modificadores, name="catalogo_modificadores"),
    path("stock/", views.stock, name="stock"),
    path("stock/inventario/", views.stock_inventario, name="stock_inventario"),
    path("stock/proveedores/", views.stock_proveedores, name="stock_proveedores"),
    path("caja/", views.caja, name="caja"),
    path("caja/gestion/", views.caja_gestion, name="caja_gestion"),
    path("caja/reaperturas/", views.caja_reaperturas, name="caja_reaperturas"),
    path("caja/cierres/", views.caja_cierres, name="caja_cierres"),
    path("caja/estadisticas/", views.caja_estadisticas, name="caja_estadisticas"),
    path("caja/facturas/", views.caja_facturas, name="caja_facturas"),
    
    # API Caja
    path("api/dia/abrir/", views.api_dia_abrir, name="api_dia_abrir"),
    path("api/dia/cerrar/", views.api_dia_cerrar, name="api_dia_cerrar"),
    path("api/caja/abrir/", views.api_caja_abrir, name="api_caja_abrir"),
    path("api/caja/cerrar/", views.api_caja_cerrar, name="api_caja_cerrar"),
    path("api/caja/movimiento/", views.api_caja_movimiento, name="api_caja_movimiento"),
    path("api/caja/reabrir/<int:sesion_id>/", views.api_caja_reabrir, name="api_caja_reabrir"),
    path("api/dia/reabrir/<int:dia_id>/", views.api_dia_reabrir, name="api_dia_reabrir"),
    path("api/configuracion/update/", views.api_configuracion_update, name="api_configuracion_update"),

    path("albaranes-facturas/", views.albaranes_facturas, name="albaranes_facturas"),
    path("albaranes-facturas/albaranes/", views.albaranes, name="albaranes"),
    path("albaranes-facturas/facturas/", views.facturas, name="facturas"),
    path("config/", views.config, name="config"),
    path("config/usuarios/", views.config_usuarios, name="config_usuarios"),
    path("config/permisos/", views.config_permisos, name="config_permisos"),
    path("config/seguridad/", views.config_seguridad, name="config_seguridad"),
    path("ayuda/", views.ayuda, name="ayuda"),

    # CONFIG
    path("config/maps/", views.maps_list, name="maps_list"),
    path("config/maps/create/", views.map_editor, name="map_editor"),
    path("config/impresoras/", views.config_impresoras, name="config_impresoras"),

    # API para mapas
    path("api/maps/<int:map_id>/", views.api_map_get, name="api_map_get"),
    path("api/maps/<int:map_id>/save/", views.api_map_save, name="api_map_save"),
    path("config/maps/<int:map_id>/activate/", views.activate_map, name="map_activate"),
    path("api/maps/<int:map_id>/activate/", views.api_map_activate, name="api_map_activate"),
    path("api/maps/<int:map_id>/delete/", views.api_map_delete, name="api_map_delete"),
    path("api/maps/", views.api_maps_list, name="api_maps_list"),
]
