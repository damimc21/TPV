"""
Template tags para inyectar iconos SVG inline.

Uso desde plantillas:

    {% load tpv_icons %}
    {% icon "printer" %}                 -> <svg class="icono" ...>...</svg>
    {% icon "printer" cls="icono icono--mini" %}
    {% icon "no-existe" %}               -> comentario HTML; nunca rompe la página

Los SVGs viven en static/ui/img/iconos/<nombre>.svg. Como todos usan
stroke="currentColor", heredan el color del texto del botón. La templatetag
elimina los atributos width/height fijos del SVG para que sea fácil escalarlo
con CSS (font-size, width, etc).

El contenido del fichero se cachea en memoria del proceso: leer 145 SVGs
una sola vez no duele. Si añades un icono nuevo y no aparece, reinicia el
servidor.
"""

import re
from pathlib import Path

from django import template
from django.conf import settings
from django.utils.safestring import mark_safe

register = template.Library()

_ICONS_DIR = Path(settings.BASE_DIR) / "static" / "ui" / "img" / "iconos"
_CACHE: dict[str, str] = {}

# Quita los atributos width/height del primer <svg ...> para escalar con CSS
_RE_SIZE = re.compile(r'\s+(width|height)="[^"]*"')


def _load_svg(name: str) -> str | None:
    if name in _CACHE:
        return _CACHE[name]
    path = _ICONS_DIR / f"{name}.svg"
    try:
        content = path.read_text(encoding="utf-8").strip()
    except (FileNotFoundError, OSError):
        return None
    # Limpiar BOM si existe
    if content.startswith("﻿"):
        content = content[1:]
    _CACHE[name] = content
    return content


@register.simple_tag
def icon(name: str, cls: str = "icono") -> str:
    """Inyecta el SVG `static/ui/img/iconos/<name>.svg` con la clase indicada."""
    svg = _load_svg(name)
    if svg is None:
        return mark_safe(f"<!-- icono no encontrado: {name} -->")

    # Quita width/height (deja que CSS controle el tamaño)
    svg = _RE_SIZE.sub("", svg, count=2)

    # Añade la clase al primer <svg ...>. Si el SVG ya trae class= la fusionamos.
    if 'class="' in svg.split(">", 1)[0]:
        svg = re.sub(
            r'<svg\b([^>]*?)class="([^"]*)"',
            lambda m: f'<svg{m.group(1)}class="{cls} {m.group(2)}"',
            svg,
            count=1,
        )
    else:
        svg = svg.replace("<svg", f'<svg class="{cls}"', 1)

    return mark_safe(svg)
