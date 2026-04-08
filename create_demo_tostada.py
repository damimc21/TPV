import os
import django
from decimal import Decimal

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tpv.settings')
django.setup()

from tpvapp.models import (
    Departamento, Producto, PlantillaConfigurable, FormatoProducto,
    GrupoOpciones, OpcionGrupo, PrecioOpcionFormato
)

def create_tostada_configurable():
    print("Creando producto Tostada Configurable...")
    
    # Asegurar departamento
    depto, _ = Departamento.objects.get_or_create(nombre="Desayunos")
    
    # Crear producto base
    prod, created = Producto.objects.get_or_create(
        nombre="Tostada (Demo)",
        defaults={
            "departamento": depto,
            "precio": Decimal("1.50"),
            "es_configurable": True,
            "color_boton": "#eab308", # Amarillo
            "icono_boton": "https://img.icons8.com/color/96/toast.png"
        }
    )
    
    if not created:
        prod.es_configurable = True
        prod.save()
        
    print(f"Producto ID {prod.id} creado/actualizado.")

    # Crear plantilla
    plantilla, _ = PlantillaConfigurable.objects.get_or_create(
        producto=prod,
        defaults={"tiene_formatos": True}
    )
    
    # Crear formatos (Media / Entera)
    media, _ = FormatoProducto.objects.get_or_create(
        plantilla=plantilla, nombre="Media",
        defaults={"factor_precio": Decimal("1.00"), "orden": 1, "por_defecto": True}
    )
    entera, _ = FormatoProducto.objects.get_or_create(
        plantilla=plantilla, nombre="Entera",
        defaults={"factor_precio": Decimal("2.00"), "orden": 2}
    )
    
    # Crear grupos
    g_pan, _ = GrupoOpciones.objects.get_or_create(
        plantilla=plantilla, nombre="Pan",
        defaults={"tipo_seleccion": GrupoOpciones.TIPO_UNICA, "obligatorio": True, "orden": 1}
    )
    g_base, _ = GrupoOpciones.objects.get_or_create(
        plantilla=plantilla, nombre="Base",
        defaults={"tipo_seleccion": GrupoOpciones.TIPO_UNICA, "obligatorio": True, "orden": 2}
    )
    g_suplementos, _ = GrupoOpciones.objects.get_or_create(
        plantilla=plantilla, nombre="Suplementos",
        defaults={"tipo_seleccion": GrupoOpciones.TIPO_MULTIPLE, "orden": 3}
    )
    g_comentarios, _ = GrupoOpciones.objects.get_or_create(
        plantilla=plantilla, nombre="Preparación",
        defaults={"tipo_seleccion": GrupoOpciones.TIPO_MULTIPLE, "permite_texto_libre": True, "orden": 4}
    )
    
    # Opciones de pan
    OpcionGrupo.objects.get_or_create(grupo=g_pan, nombre="Blanco", defaults={"orden": 1})
    OpcionGrupo.objects.get_or_create(grupo=g_pan, nombre="Integral", defaults={"orden": 2})
    OpcionGrupo.objects.get_or_create(grupo=g_pan, nombre="Cereales", defaults={"precio_base": Decimal("0.20"), "orden": 3})
    
    # Opciones de base
    OpcionGrupo.objects.get_or_create(grupo=g_base, nombre="Aceite", defaults={"orden": 1})
    OpcionGrupo.objects.get_or_create(grupo=g_base, nombre="Tomate", defaults={"orden": 2})
    OpcionGrupo.objects.get_or_create(grupo=g_base, nombre="Mantequilla", defaults={"orden": 3})
    OpcionGrupo.objects.get_or_create(grupo=g_base, nombre="Marmelada", defaults={"orden": 4})
    
    # Opciones de suplementos
    supl_york, _ = OpcionGrupo.objects.get_or_create(grupo=g_suplementos, nombre="Jamón York", defaults={"precio_base": Decimal("0.50"), "orden": 1})
    supl_queso, _ = OpcionGrupo.objects.get_or_create(grupo=g_suplementos, nombre="Queso", defaults={"precio_base": Decimal("0.50"), "orden": 2})
    supl_serrano, _ = OpcionGrupo.objects.get_or_create(grupo=g_suplementos, nombre="Jamón Serrano", defaults={"precio_base": Decimal("1.20"), "orden": 3})
    
    # Overrides de precio para suplementos (Ej: Entera vale el doble de suplemento salvo jamón serrano)
    PrecioOpcionFormato.objects.get_or_create(opcion=supl_york, formato=entera, defaults={"precio": Decimal("1.00")})
    PrecioOpcionFormato.objects.get_or_create(opcion=supl_queso, formato=entera, defaults={"precio": Decimal("1.00")})
    PrecioOpcionFormato.objects.get_or_create(opcion=supl_serrano, formato=entera, defaults={"precio": Decimal("2.00")}) # Descuento en la entera
    
    # Comentarios
    OpcionGrupo.objects.get_or_create(grupo=g_comentarios, nombre="Muy tostada", defaults={"orden": 1})
    OpcionGrupo.objects.get_or_create(grupo=g_comentarios, nombre="Poco hecha", defaults={"orden": 2})
    
    print("¡Producto Tostada Demo creado con éxito!")

if __name__ == "__main__":
    create_tostada_configurable()
