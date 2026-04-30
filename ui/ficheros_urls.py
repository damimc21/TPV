"""
URLs para los endpoints API de Ficheros.
Todas las rutas se montan bajo /api/ficheros/ en el proyecto principal.
"""
from django.urls import path
from . import ficheros_api

urlpatterns = [
    # === BACKUPS ===
    path("backup/crear/", ficheros_api.backup_crear, name="ficheros_backup_crear"),
    path("backup/descargar/<str:filename>/", ficheros_api.backup_descargar, name="ficheros_backup_descargar"),
    path("backup/restaurar/", ficheros_api.backup_restaurar, name="ficheros_backup_restaurar"),

    # === IMPORTAR ===
    path("importar-plantilla/", ficheros_api.importar_plantilla, name="ficheros_importar_plantilla"),
    path("importar-previsualizar/", ficheros_api.importar_previsualizar, name="ficheros_importar_previsualizar"),
    path("importar-verificar/", ficheros_api.importar_verificar, name="ficheros_importar_verificar"),
    path("importar-productos/", ficheros_api.importar_productos, name="ficheros_importar_productos"),
    path("importar-inventario/", ficheros_api.importar_inventario, name="ficheros_importar_inventario"),

    # === EXPORTAR ===
    path("exportar-productos/", ficheros_api.exportar_productos, name="ficheros_exportar_productos"),
    path("exportar-inventario/", ficheros_api.exportar_inventario, name="ficheros_exportar_inventario"),
    path("exportar-informe/<str:tipo>/", ficheros_api.exportar_informe, name="ficheros_exportar_informe"),
    path("informes/rango/", ficheros_api.informes_rango, name="ficheros_informes_rango"),

    # === AUDITORÍA ===
    path("auditoria/", ficheros_api.auditoria_listar, name="ficheros_auditoria_listar"),
    path("auditoria/usuarios/", ficheros_api.auditoria_usuarios, name="ficheros_auditoria_usuarios"),
    path("auditoria/eventos/", ficheros_api.auditoria_eventos, name="ficheros_auditoria_eventos"),
    path("auditoria/rango/", ficheros_api.auditoria_rango, name="ficheros_auditoria_rango"),
    path("auditoria/exportar/", ficheros_api.auditoria_exportar, name="ficheros_auditoria_exportar"),

    # === LOGS ===
    path("logs/", ficheros_api.logs_listar, name="ficheros_logs_listar"),
    path("logs/origenes/", ficheros_api.logs_origenes, name="ficheros_logs_origenes"),
    path("logs/rango/", ficheros_api.logs_rango, name="ficheros_logs_rango"),
    path("logs/ui-evento/", ficheros_api.logs_ui_evento, name="ficheros_logs_ui_evento"),
    path("logs/exportar/", ficheros_api.logs_exportar, name="ficheros_logs_exportar"),
    path("logs/limpiar/", ficheros_api.logs_limpiar, name="ficheros_logs_limpiar"),
    path("logs/<int:log_id>/", ficheros_api.logs_detalle, name="ficheros_logs_detalle"),
]
