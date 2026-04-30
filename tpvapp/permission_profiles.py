"""
Catalogo de permisos funcionales y packs de permisos.
"""

from collections import OrderedDict


PERMISSION_DEFINITIONS = [
    {
        "codename": "access_tpv",
        "name": "Puede acceder al TPV",
        "category": "tpv",
        "label": "Acceso al TPV",
    },
    {
        "codename": "manage_orders",
        "name": "Puede comandar y editar pedidos",
        "category": "tpv",
        "label": "Comandar y editar pedidos",
    },
    {
        "codename": "process_payments",
        "name": "Puede cobrar y registrar pagos",
        "category": "tpv",
        "label": "Cobrar y registrar pagos",
    },
    {
        "codename": "print_documents",
        "name": "Puede emitir comprobantes y tickets",
        "category": "tpv",
        "label": "Emitir comprobantes/tickets",
    },
    {
        "codename": "manage_cash",
        "name": "Puede abrir/cerrar caja y jornada",
        "category": "caja",
        "label": "Gestion de caja y jornada",
    },
    {
        "codename": "reopen_cash_sessions",
        "name": "Puede reabrir cierres de caja o jornada",
        "category": "caja",
        "label": "Reabrir cierres",
    },
    {
        "codename": "view_cash_reports",
        "name": "Puede consultar cierres y estadisticas de caja",
        "category": "caja",
        "label": "Ver cierres y estadisticas",
    },
    {
        "codename": "manage_catalog",
        "name": "Puede gestionar catalogo de productos",
        "category": "datos",
        "label": "Gestionar catalogo",
    },
    {
        "codename": "manage_stock",
        "name": "Puede gestionar inventario y stock",
        "category": "datos",
        "label": "Gestionar stock/inventario",
    },
    {
        "codename": "manage_files",
        "name": "Puede usar importaciones, exportaciones y backups",
        "category": "datos",
        "label": "Gestionar ficheros y backups",
    },
    {
        "codename": "manage_configuration",
        "name": "Puede modificar configuracion del sistema",
        "category": "config",
        "label": "Modificar configuracion",
    },
    {
        "codename": "manage_users",
        "name": "Puede crear/editar/eliminar usuarios",
        "category": "config",
        "label": "Gestionar usuarios",
    },
    {
        "codename": "manage_permissions",
        "name": "Puede asignar permisos a usuarios",
        "category": "config",
        "label": "Gestionar permisos",
    },
]


PERMISSION_PACKS = OrderedDict(
    [
        (
            "tpv_operador",
            {
                "label": "Operador TPV",
                "description": "Acceso al TPV para comandar, cobrar e imprimir tickets.",
                "permissions": [
                    "access_tpv",
                    "manage_orders",
                    "process_payments",
                    "print_documents",
                ],
            },
        ),
        (
            "caja_responsable",
            {
                "label": "Responsable de Caja",
                "description": "Control de aperturas/cierres y revision de informes de caja.",
                "permissions": [
                    "manage_cash",
                    "reopen_cash_sessions",
                    "view_cash_reports",
                ],
            },
        ),
        (
            "gestion_datos",
            {
                "label": "Gestion de Datos",
                "description": "Catalogo, inventario y operaciones de ficheros.",
                "permissions": [
                    "manage_catalog",
                    "manage_stock",
                    "manage_files",
                ],
            },
        ),
        (
            "admin_config",
            {
                "label": "Administrador de Configuracion",
                "description": "Config global, usuarios y permisos.",
                "permissions": [
                    "manage_configuration",
                    "manage_users",
                    "manage_permissions",
                ],
            },
        ),
    ]
)


CATEGORY_LABELS = {
    "tpv": "Operativa TPV",
    "caja": "Caja y Cierres",
    "datos": "Catalogo, Stock y Ficheros",
    "config": "Configuracion y Seguridad",
}


def permission_codenames():
    return [item["codename"] for item in PERMISSION_DEFINITIONS]


def grouped_permissions():
    grouped = OrderedDict((key, []) for key in CATEGORY_LABELS.keys())
    for item in PERMISSION_DEFINITIONS:
        grouped[item["category"]].append(item)
    return grouped
