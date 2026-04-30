import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase

from tpvapp.models import EventoAuditoria, LogSistema


class AuditAndLogRoutingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="auditor",
            password="pass1234",
        )
        config_perm = Permission.objects.filter(
            content_type__app_label="tpvapp",
            codename="manage_configuration",
        ).first()
        if config_perm:
            self.user.user_permissions.add(config_perm)
        self.client.login(username="auditor", password="pass1234")

    def test_audita_accion_mutable_global_en_middleware(self):
        resp = self.client.post(
            "/es/api/configuracion/update/",
            data=json.dumps({"clave": "test_audit_key", "valor": "1"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            EventoAuditoria.objects.filter(
                usuario=self.user,
                evento="CONFIG_GLOBAL_ACTUALIZAR",
            ).exists()
        )

    def test_ui_evento_se_registra_en_auditoria_funcional(self):
        resp = self.client.post(
            "/api/ficheros/logs/ui-evento/",
            data=json.dumps(
                {
                    "evento": "theme_change",
                    "detalle": "from=dark to=light",
                    "nivel": "INFO",
                    "origen": "ui.tema",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            EventoAuditoria.objects.filter(
                usuario=self.user,
                evento="UI_THEME_CHANGE",
            ).exists()
        )

    def test_4xx_mutable_genera_log_tecnico_http_action(self):
        resp = self.client.post(
            "/es/api/configuracion/update/",
            data=json.dumps({"valor": "sin_clave"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(
            LogSistema.objects.filter(
                origen="http.action",
                mensaje__icontains="status=400",
            ).exists()
        )


class ConfigUserPermissionViewsTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.actor = User.objects.create_user(username="admin_local", password="pass1234")
        self.target = User.objects.create_user(username="camarero", password="pass1234")
        self.client.login(username="admin_local", password="pass1234")

    def _grant(self, *codes):
        perms = Permission.objects.filter(
            content_type__app_label="tpvapp",
            codename__in=list(codes),
        )
        self.actor.user_permissions.add(*list(perms))

    def test_config_usuarios_requires_manage_users(self):
        resp = self.client.get("/es/config/usuarios/")
        self.assertEqual(resp.status_code, 403)

    def test_config_usuarios_create_user(self):
        self._grant("manage_users")
        resp = self.client.post(
            "/es/config/usuarios/",
            data={
                "action": "create",
                "username": "nuevo_user",
                "password": "pass9999",
                "email": "nuevo@example.com",
                "first_name": "Nuevo",
                "last_name": "Usuario",
                "is_active": "1",
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(get_user_model().objects.filter(username="nuevo_user").exists())

    def test_config_permisos_assign_pack_and_advanced(self):
        self._grant("manage_permissions")
        resp = self.client.post(
            "/es/config/permisos/",
            data={
                "user_id": str(self.target.id),
                "pack": ["tpv_operador"],
                "perm": ["manage_cash"],
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(self.target.has_perm("tpvapp.access_tpv"))
        self.assertTrue(self.target.has_perm("tpvapp.manage_orders"))
        self.assertTrue(self.target.has_perm("tpvapp.process_payments"))
        self.assertTrue(self.target.has_perm("tpvapp.print_documents"))
        self.assertTrue(self.target.has_perm("tpvapp.manage_cash"))
