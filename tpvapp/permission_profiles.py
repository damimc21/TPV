"""
Catálogo de permisos funcionales y packs de permisos.

Jerarquía:
  sistema (is_system_user) → superusuario (is_superuser) → usuarios con permisos

Reglas clave:
  - Nadie puede editar sus propios permisos.
  - Solo puedes otorgar permisos que tú mismo tienes (excepto superusuario, que tiene bypass).
  - El rol superusuario (is_superuser) solo lo gestiona el usuario de sistema.
  - El pack "superusuario" no se expone en la UI; se usa internamente al crear/promover superusuarios.
  - access_tpv y visible_in_tpv siempre van juntos.
"""

from collections import OrderedDict


PERMISSION_DEFINITIONS = [
    # --- TPV operativo ---
    {
        "codename": "access_tpv",
        "name": "Puede acceder al TPV",
        "category": "tpv",
        "label": "Acceso al TPV",
    },
    {
        "codename": "visible_in_tpv",
        "name": "Aparece en el selector de operador del TPV",
        "category": "tpv",
        "label": "Visible en selector de operador",
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
    # --- Caja ---
    {
        "codename": "manage_cash",
        "name": "Puede abrir/cerrar caja y jornada",
        "category": "caja",
        "label": "Gestión de caja y jornada",
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
        "label": "Ver cierres y estadísticas",
    },
    # --- Datos ---
    {
        "codename": "manage_catalog",
        "name": "Puede gestionar catalogo de productos",
        "category": "datos",
        "label": "Gestionar catálogo",
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
    # --- Configuracion ---
    {
        "codename": "manage_configuration",
        "name": "Puede modificar configuracion del sistema",
        "category": "config",
        "label": "Modificar configuración",
    },
    {
        "codename": "manage_users",
        "name": "Puede gestionar usuarios y asignar permisos",
        "category": "config",
        "label": "Gestionar usuarios y permisos",
    },
]


# Packs mostrados en la UI de permisos (camarero y staff).
# El pack "superusuario" existe solo para uso interno (crear/promover superusuarios)
# y NO se expone en la pantalla de permisos.
PERMISSION_PACKS = OrderedDict(
    [
        (
            "camarero",
            {
                "label": "Camarero",
                "description": "Trabajo diario: entrar al TPV, aparecer en el selector, comandar, cobrar e imprimir tickets.",
                "permissions": [
                    "access_tpv",
                    "visible_in_tpv",
                    "manage_orders",
                    "process_payments",
                    "print_documents",
                ],
            },
        ),
        (
            "staff",
            {
                "label": "Staff",
                "description": "Incluye Camarero y tareas de encargado: caja, cierres, informes, catálogo y stock.",
                "permissions": [
                    "access_tpv",
                    "visible_in_tpv",
                    "manage_orders",
                    "process_payments",
                    "print_documents",
                    "manage_cash",
                    "reopen_cash_sessions",
                    "view_cash_reports",
                    "manage_catalog",
                    "manage_stock",
                ],
            },
        ),
        # Uso interno: permisos por defecto al crear/promover un superusuario.
        # No se muestra en la UI de permisos.
        (
            "superusuario",
            {
                "label": "Superusuario",
                "description": "Acceso completo al sistema excepto gestión del propio rol de superusuario.",
                "permissions": [
                    "access_tpv",
                    "visible_in_tpv",
                    "manage_orders",
                    "process_payments",
                    "print_documents",
                    "manage_cash",
                    "reopen_cash_sessions",
                    "view_cash_reports",
                    "manage_catalog",
                    "manage_stock",
                    "manage_files",
                    "manage_configuration",
                    "manage_users",
                ],
            },
        ),
        (
            "tpv_operador",
            {
                "label": "Operador TPV",
                "description": "Alias compatible del perfil Camarero.",
                "permissions": [
                    "access_tpv",
                    "visible_in_tpv",
                    "manage_orders",
                    "process_payments",
                    "print_documents",
                ],
            },
        ),
    ]
)

# Claves de packs que se muestran en la UI de permisos (excluye superusuario y tpv_operador).
ROLE_PACK_KEYS = ("camarero", "staff")


def permission_codenames():
    """Devuelve la lista ordenada de codenames del catálogo de permisos."""
    return [p["codename"] for p in PERMISSION_DEFINITIONS]


def grouped_permissions():
    """Devuelve los permisos agrupados por categoría (OrderedDict)."""
    groups = OrderedDict()
    for perm in PERMISSION_DEFINITIONS:
        cat = perm["category"]
        if cat not in groups:
            groups[cat] = []
        groups[cat].append(perm)
    return groups


CATEGORY_LABELS = {
    "tpv": "TPV",
    "caja": "Caja",
    "datos": "Datos",
    "config": "Configuración",
}
