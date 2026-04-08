from django.conf import settings
from django.db import models

# Create your models here.
class TPVMap(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tpv_maps")
    name = models.CharField(max_length=80)
    width = models.PositiveIntegerField(default=1920)
    height = models.PositiveIntegerField(default=1080)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=False)

class TPVMapItem(models.Model):
    map = models.ForeignKey(TPVMap, on_delete=models.CASCADE, related_name="items")
    type = models.CharField(max_length=32)          # items del mapa
    x = models.FloatField()
    y = models.FloatField()
    rotation = models.IntegerField(default=0)
    data = models.JSONField(default=dict, blank=True)
    z_index = models.IntegerField(default=0)

