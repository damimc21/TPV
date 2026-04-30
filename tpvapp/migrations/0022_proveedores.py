import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def crear_proveedores_desde_articulos(apps, schema_editor):
    Proveedor = apps.get_model("tpvapp", "Proveedor")
    ArticuloInventario = apps.get_model("tpvapp", "ArticuloInventario")

    proveedores = {}
    articulos = ArticuloInventario.objects.exclude(proveedor="").only("id", "proveedor", "proveedor_ref")
    for articulo in articulos:
        nombre = (articulo.proveedor or "").strip()
        if not nombre:
            continue
        key = nombre.casefold()
        proveedor = proveedores.get(key)
        if proveedor is None:
            proveedor = Proveedor.objects.filter(nombre__iexact=nombre).first()
            if proveedor is None:
                proveedor = Proveedor.objects.create(nombre=nombre)
            proveedores[key] = proveedor
        articulo.proveedor_ref_id = proveedor.id
        articulo.proveedor = proveedor.nombre
        articulo.save(update_fields=["proveedor_ref", "proveedor"])


def restaurar_nombre_proveedor(apps, schema_editor):
    ArticuloInventario = apps.get_model("tpvapp", "ArticuloInventario")
    for articulo in ArticuloInventario.objects.select_related("proveedor_ref").filter(proveedor_ref__isnull=False):
        articulo.proveedor = articulo.proveedor_ref.nombre
        articulo.save(update_fields=["proveedor"])


class Migration(migrations.Migration):

    dependencies = [
        ("tpvapp", "0021_usuario_custom_permissions"),
    ]

    operations = [
        migrations.CreateModel(
            name="Proveedor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nombre", models.CharField(max_length=150, unique=True)),
                ("contacto", models.CharField(blank=True, default="", max_length=120)),
                ("telefono", models.CharField(blank=True, default="", max_length=40)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("nif", models.CharField(blank=True, default="", max_length=30)),
                ("notas", models.TextField(blank=True, default="")),
                ("activo", models.BooleanField(default=True)),
                ("fecha_creacion", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "verbose_name": "Proveedor",
                "verbose_name_plural": "Proveedores",
                "db_table": "proveedores",
                "ordering": ["nombre"],
            },
        ),
        migrations.AddField(
            model_name="articuloinventario",
            name="proveedor_ref",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="articulos",
                to="tpvapp.proveedor",
            ),
        ),
        migrations.RunPython(crear_proveedores_desde_articulos, restaurar_nombre_proveedor),
    ]
