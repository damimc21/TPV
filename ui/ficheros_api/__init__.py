"""Paquete `ui.ficheros_api` (refactor de ui/ficheros_api.py original).

Cada submódulo agrupa los endpoints de un bloque.
"""

from ._helpers import (
    User,
    BACKUP_DIR,
    IMPORT_HEADERS,
    _ui_audit_event_name,
    _get_csrf,
    _actor_username,
    _require_manage_files,
    _csv_response,
    _excel_col_name,
    _xlsx_response,
)

from .backups import (
    backup_crear,
    backup_descargar,
    backup_restaurar,
)

from .importacion import (
    _import_headers,
    _normalize_import_header,
    _normalize_import_key,
    _get_or_create_proveedor,
    _parse_import_decimal,
    _normalize_hex_color,
    _row_line,
    _verification_lookup,
    _verification_group_lookup,
    _table_columns,
    _create_producto_for_import,
    _import_rows_from_matrix,
    _parse_import_csv,
    _xlsx_col_index,
    _xlsx_shared_strings,
    _xlsx_first_sheet_path,
    _parse_import_xlsx,
    _import_template_instruction_rows,
    importar_plantilla,
    importar_previsualizar,
    importar_verificar,
    importar_productos,
    importar_inventario,
)

from .exportacion import (
    exportar_productos,
    exportar_inventario,
)

from .informes import (
    informes_rango,
    exportar_informe,
    _informe_ventas,
    _informe_stock,
    _informe_turnos,
    _informe_movimientos_caja,
    _informe_clientes,
    _informe_rankings,
)

from .auditoria import (
    auditoria_listar,
    auditoria_usuarios,
    auditoria_eventos,
    auditoria_rango,
    auditoria_exportar,
)

from .logs import (
    logs_listar,
    logs_detalle,
    logs_exportar,
    logs_origenes,
    logs_rango,
    logs_ui_evento,
    logs_limpiar,
)

__all__ = [
    "User",
    "BACKUP_DIR",
    "IMPORT_HEADERS",
    "_ui_audit_event_name",
    "_get_csrf",
    "_actor_username",
    "_require_manage_files",
    "auditoria_listar",
    "auditoria_usuarios",
    "auditoria_eventos",
    "auditoria_rango",
    "auditoria_exportar",
    "backup_crear",
    "backup_descargar",
    "backup_restaurar",
    "_csv_response",
    "_excel_col_name",
    "_xlsx_response",
    "exportar_productos",
    "exportar_inventario",
    "_import_headers",
    "_normalize_import_header",
    "_normalize_import_key",
    "_get_or_create_proveedor",
    "_parse_import_decimal",
    "_normalize_hex_color",
    "_row_line",
    "_verification_lookup",
    "_verification_group_lookup",
    "_table_columns",
    "_create_producto_for_import",
    "_import_rows_from_matrix",
    "_parse_import_csv",
    "_xlsx_col_index",
    "_xlsx_shared_strings",
    "_xlsx_first_sheet_path",
    "_parse_import_xlsx",
    "_import_template_instruction_rows",
    "importar_plantilla",
    "importar_previsualizar",
    "importar_verificar",
    "importar_productos",
    "importar_inventario",
    "informes_rango",
    "exportar_informe",
    "_informe_ventas",
    "_informe_stock",
    "_informe_turnos",
    "_informe_movimientos_caja",
    "_informe_clientes",
    "_informe_rankings",
    "logs_listar",
    "logs_detalle",
    "logs_exportar",
    "logs_origenes",
    "logs_rango",
    "logs_ui_evento",
    "logs_limpiar",
]
