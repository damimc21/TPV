from django.utils import timezone
from tpvapp.models import DiaContable, SesionCaja
from django.utils.translation import gettext as _

def caja_estado(request):
    """
    Agrega el estado de la jornada y la caja al contexto global de todas las vistas.
    """
    if not request.user.is_authenticated:
        return {}

    dia_actual = DiaContable.objects.filter(fecha_cierre__isnull=True).order_by('-fecha_apertura').first()
    
    if dia_actual:
        fecha_str = dia_actual.fecha_apertura.strftime('%d/%m/%Y')
        estado_jornada_texto = f"{_('ABIERTA')} ({fecha_str})"
        
        sesion_actual = SesionCaja.objects.filter(dia=dia_actual, fecha_cierre__isnull=True).order_by('-fecha_apertura').first()
        if sesion_actual:
            estado_caja_texto = _("ABIERTA")
        else:
            estado_caja_texto = _("CERRADA")
    else:
        estado_jornada_texto = _("CERRADA")
        estado_caja_texto = _("CERRADA")

    return {
        'global_estado_jornada': estado_jornada_texto,
        'global_estado_caja': estado_caja_texto,
    }
