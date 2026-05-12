from django.db import models
from django.contrib.auth.models import AbstractUser


# =========================
# 1) USUARIOS (Django User)
# =========================

class Usuario(AbstractUser):
    activo = models.BooleanField(default=True)
    is_system_user = models.BooleanField(
        default=False,
        editable=False,
        help_text="Usuario de sistema creado automáticamente. No puede eliminarse ni renombrarse.",
    )

    class Meta:
        permissions = [
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
        ]

    def __str__(self):
        return self.username
