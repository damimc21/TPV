from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tpvapp', '0026_documentoproveedor'),
    ]

    operations = [
        migrations.AddField(
            model_name='factura',
            name='datos_facturacion',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
