from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsManagerOrReadOnly(BasePermission):
    """
    - Lectura (GET/HEAD/OPTIONS): permitido a usuarios autenticados
    - Escritura (POST/PUT/PATCH/DELETE): solo staff (admin/encargado)
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_authenticated and request.user.is_staff