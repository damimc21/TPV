from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ui', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tpvmap',
            name='floor_style',
            field=models.CharField(
                choices=[
                    ('dark', 'Oscuro (por defecto)'),
                    ('wood', 'Madera'),
                    ('tile', 'Baldosa'),
                    ('marble', 'Mármol oscuro'),
                    ('restaurant', 'Restaurante'),
                ],
                default='dark',
                max_length=32,
            ),
        ),
    ]
