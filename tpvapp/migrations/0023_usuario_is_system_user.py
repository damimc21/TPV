from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tpvapp", "0022_proveedores"),
    ]

    operations = [
        migrations.AddField(
            model_name="usuario",
            name="is_system_user",
            field=models.BooleanField(
                default=False,
                editable=False,
                help_text="Usuario de sistema creado automaticamente. No puede eliminarse ni renombrarse.",
            ),
        ),
    ]
