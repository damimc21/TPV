from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

app_name = "ui"

urlpatterns = [
    path("", views.index, name="index"),
    path("tpv/", views.tpv, name="tpv"),
    path("tpv/mesa/<int:numero>/", views.mesa, name="mesa"),
    path("tpv/ticket/<int:factura_id>/", views.ticket, name="ticket"),
    path("tpv/comprobante/<int:comanda_id>/", views.comprobante, name="comprobante"),

    # LOGIN/LOGOUT
    path("login/", auth_views.LoginView.as_view(template_name="ui/auth/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),

    # CARDS
    path("ficheros/", views.ficheros, name="ficheros"),
    path("catalogo/", views.catalogo, name="catalogo"),
    path("catalogo/articulos/", views.catalogo_articulos, name="catalogo_articulos"),
    path("catalogo/modificadores/", views.catalogo_modificadores, name="catalogo_modificadores"),
    path("stock/", views.stock, name="stock"),
    path("caja/", views.caja, name="caja"),
    path("caja/gestion/", views.caja_gestion, name="caja_gestion"),
    path("caja/reaperturas/", views.caja_reaperturas, name="caja_reaperturas"),
    path("caja/cierres/", views.caja_cierres, name="caja_cierres"),
    path("caja/estadisticas/", views.caja_estadisticas, name="caja_estadisticas"),
    
    # API Caja
    path("api/dia/abrir/", views.api_dia_abrir, name="api_dia_abrir"),
    path("api/dia/cerrar/", views.api_dia_cerrar, name="api_dia_cerrar"),
    path("api/caja/abrir/", views.api_caja_abrir, name="api_caja_abrir"),
    path("api/caja/cerrar/", views.api_caja_cerrar, name="api_caja_cerrar"),

    path("albaranes-facturas/", views.albaranes_facturas, name="albaranes_facturas"),
    path("config/", views.config, name="config"),
    path("ayuda/", views.ayuda, name="ayuda"),

    # CONFIG
    path("config/maps/", views.maps_list, name="maps_list"),
    path("config/maps/create/", views.map_editor, name="map_editor"),

    # API para mapas
    path("api/maps/<int:map_id>/", views.api_map_get, name="api_map_get"),
    path("api/maps/<int:map_id>/save/", views.api_map_save, name="api_map_save"),
    path("config/maps/<int:map_id>/activate/", views.activate_map, name="map_activate"),
    path("api/maps/<int:map_id>/activate/", views.api_map_activate, name="api_map_activate"),
    path("api/maps/<int:map_id>/delete/", views.api_map_delete, name="api_map_delete"),
    path("api/maps/", views.api_maps_list, name="api_maps_list"),
]