"""
Migración 0024:
- Añade permiso visible_in_tpv
- Fusiona manage_permissions en manage_users (renombra descripción)
- Corrige on_delete PROTECT → SET_NULL en DiaContable, SesionCaja y MovimientoCaja
  para preservar trazabilidad histórica al eliminar usuarios
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tpvapp", "0023_usuario_is_system_user"),
    ]

    operations = [
        # 1. Actualizar la lista de permisos del modelo Usuario
        migrations.AlterModelOptions(
            name="usuario",
            options={
                "permissions": [
                    ("access_tpv", "Puede acceder al TPV"),
                    ("visible_in_tpv", "Aparece en el selector de operador del TPV"),
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
                    ("manage_users", "Puede gestionar usuarios y asignar permisos"),
                ],
            },
        ),

        # 2. DiaContable.abierta_por: PROTECT → SET_NULL
        migrations.AlterField(
            model_name="diacontable",
            name="abierta_por",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="dias_abiertos",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # 3. DiaContable.cerrado_por: PROTECT → SET_NULL (ya era null=True)
        migrations.AlterField(
            model_name="diacontable",
            name="cerrado_por",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="dias_cerrados",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # 4. SesionCaja.abierta_por: PROTECT → SET_NULL
        migrations.AlterField(
            model_name="sesioncaja",
            name="abierta_por",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sesiones_abiertas",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # 5. SesionCaja.cerrada_por: PROTECT → SET_NULL (ya era null=True)
        migrations.AlterField(
            model_name="sesioncaja",
            name="cerrada_por",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sesiones_cerradas",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # 6. MovimientoCaja.usuario: PROTECT → SET_NULL
        migrations.AlterField(
            model_name="movimientocaja",
            name="usuario",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
