"""Paquete `ui.views` (refactor de ui/views.py original).

Cada submódulo agrupa las vistas de una sección.
Este __init__ reexporta todos los nombres públicos para que
`from ui import views; views.tpv` siga funcionando como antes.
"""

from ._helpers import (
    _actor_username,
    _require_permission_or_403,
    _require_any_permission_or_403,
    _forbidden_json,
    ROLE_PACK_KEYS,
    _role_from_permissions,
    _apply_role_permissions,
)

from .auth import (
    TpvLoginView,
)

from .core import (
    index,
)

from .tpv import (
    tpv,
    mesa,
    ticket,
    _get_report_data,
    ticket_cierre_dia,
    ticket_cierre_turno,
    comprobante,
)

from .ficheros import (
    ficheros,
    ficheros_importar,
    ficheros_exportar,
    ficheros_backups,
    ficheros_informes,
    ficheros_auditoria,
    ficheros_logs,
)

from .catalogo import (
    catalogo,
    catalogo_articulos,
    catalogo_modificadores,
)

from .stock import (
    stock,
    stock_inventario,
    stock_proveedores,
)

from .caja import (
    caja,
    caja_reaperturas,
    caja_cierres,
    api_dia_reabrir,
    api_caja_reabrir,
    caja_gestion,
    caja_estadisticas,
    api_dia_abrir,
    api_dia_cerrar,
    api_caja_abrir,
    api_caja_cerrar,
    api_caja_movimiento,
    api_configuracion_update,
    caja_facturas,
)

from .albaranes_facturas import (
    albaranes_facturas,
    _documentos_proveedor_context,
    _parse_date_or_none,
    _parse_decimal_or_zero,
    _documentos_proveedor_page,
    albaranes,
    facturas,
    _facturas_emitidas_context,
)

from .config import (
    config,
    config_tpv_diseno,
    api_tpv_iconos,
    _post_bool,
    config_seguridad,
    config_impresoras,
    config_usuarios,
    config_permisos,
    ayuda,
)

from .maps import (
    map_editor,
    maps_list,
    activate_map,
    _map_to_dict,
    api_map_get,
    api_maps_list,
    api_map_save,
    api_map_activate,
    api_map_delete,
)

__all__ = [
    "_actor_username",
    "_require_permission_or_403",
    "_require_any_permission_or_403",
    "_forbidden_json",
    "ROLE_PACK_KEYS",
    "_role_from_permissions",
    "_apply_role_permissions",
    "albaranes_facturas",
    "_documentos_proveedor_context",
    "_parse_date_or_none",
    "_parse_decimal_or_zero",
    "_documentos_proveedor_page",
    "albaranes",
    "facturas",
    "_facturas_emitidas_context",
    "TpvLoginView",
    "caja",
    "caja_reaperturas",
    "caja_cierres",
    "api_dia_reabrir",
    "api_caja_reabrir",
    "caja_gestion",
    "caja_estadisticas",
    "api_dia_abrir",
    "api_dia_cerrar",
    "api_caja_abrir",
    "api_caja_cerrar",
    "api_caja_movimiento",
    "api_configuracion_update",
    "caja_facturas",
    "catalogo",
    "catalogo_articulos",
    "catalogo_modificadores",
    "config",
    "config_tpv_diseno",
    "api_tpv_iconos",
    "_post_bool",
    "config_seguridad",
    "config_impresoras",
    "config_usuarios",
    "config_permisos",
    "ayuda",
    "index",
    "ficheros",
    "ficheros_importar",
    "ficheros_exportar",
    "ficheros_backups",
    "ficheros_informes",
    "ficheros_auditoria",
    "ficheros_logs",
    "map_editor",
    "maps_list",
    "activate_map",
    "_map_to_dict",
    "api_map_get",
    "api_maps_list",
    "api_map_save",
    "api_map_activate",
    "api_map_delete",
    "stock",
    "stock_inventario",
    "stock_proveedores",
    "tpv",
    "mesa",
    "ticket",
    "_get_report_data",
    "ticket_cierre_dia",
    "ticket_cierre_turno",
    "comprobante",
]
