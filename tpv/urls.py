"""
URL configuration for tpv project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf.urls.i18n import i18n_patterns
from django.urls import path, include
from django.views.static import serve
from django.conf import settings
import os

def _static_ui(filename, content_type):
    """Sirve un archivo de static/ui/ desde la raíz (necesario para SW scope)."""
    filepath = os.path.join(settings.BASE_DIR, 'static', 'ui', filename)
    from django.http import FileResponse
    def view(request):
        return FileResponse(open(filepath, 'rb'), content_type=content_type)
    return view

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),  # set_language
    path("api/", include("tpvapp.urls")),             # API fuera de i18n
    path("admin/", admin.site.urls),
    # PWA: service worker y manifest desde la raíz
    path("sw.js", _static_ui('sw.js', 'application/javascript'), name='sw'),
    path("manifest.json", _static_ui('manifest.json', 'application/manifest+json'), name='manifest'),
]

# Todo lo “UI” traducible dentro de i18n_patterns
urlpatterns += i18n_patterns(
    path("", include("ui.urls")),
)