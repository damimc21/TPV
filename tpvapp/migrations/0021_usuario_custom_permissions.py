from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tpvapp", "0020_add_logsistema_backupregistro"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="usuario",
            options={
                "permissions": [
                    ("access_tpv", "Puede acceder al TPV"),
                    ("manage_orders", "Puede comandar y editar pedidos"),
                    ("process_payments", "Puede cobrar y registrar pagos"),
                    ("print_documents", "Puede emitir comprobantes y tickets"),
                    ("manage_cash", "Puede abrir/cerrar caja y jornada"),
                    ("reopen_cash_sessions", "Puede reabrir cierres de caja o jornada"),
                    ("view_cash_reports", "Puede consultar cierres y estadisticas de caja"),
                    ("manage_catalog", "Puede gestionar catalogo de productos"),
                    ("manage_stock", "Puede gestionar inventario y stock"),
                    ("manage_files", "Puede usar importaciones, exportaciones y backups"),
                    ("manage_configuration", "Puede modificar configuracion del sistema"),
                    ("manage_users", "Puede crear/editar/eliminar usuarios"),
                    ("manage_permissions", "Puede asignar permisos a usuarios"),
                ],
            },
        ),
    ]
