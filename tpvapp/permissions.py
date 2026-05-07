from rest_framework.permissions import BasePermission, SAFE_METHODS


def has_app_permission(user, codename: str) -> bool:
    """
    Comprueba un permiso funcional del dominio TPV.
    Regla:
    - superuser conserva acceso total.
    - staff es un rol visual/organizativo; sus accesos vienen por permisos.
    - el resto de usuarios se evalua por permiso Django tpvapp.<codename>.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user.has_perm(f"tpvapp.{codename}")

class IsManagerOrReadOnly(BasePermission):
    """
    - Lectura (GET/HEAD/OPTIONS): permitido a usuarios autenticados
    - Escritura (POST/PUT/PATCH/DELETE): solo staff (admin/encargado)
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_authenticated and request.user.is_staff
