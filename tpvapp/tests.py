from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .models import (
    ArticuloInventario,
    CategoriaInventario,
    Comanda,
    Departamento,
    EventoAuditoria,
    LineaComanda,
    Mesa,
    MovimientoStock,
    Producto,
)
from .serializers import ArticuloInventarioSerializer
from .services import procesar_stock_comanda
from .views import ArticuloInventarioViewSet
from .views import importar_plantilla_inventario


class InventarioTestMixin:
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="tester",
            password="pass",
        )
        self.departamento = Departamento.objects.create(nombre="Barra")
        self.producto = Producto.objects.create(
            nombre="Coca Cola",
            precio=Decimal("2.50"),
            departamento=self.departamento,
        )
        self.categoria = CategoriaInventario.objects.create(nombre="Bebidas", orden=1)


class ArticuloInventarioSerializerTests(InventarioTestMixin, TestCase):
    def test_crea_articulo_con_vinculo_opcional(self):
        serializer = ArticuloInventarioSerializer(data={
            "nombre": "Caja Coca Cola",
            "categoria_id": self.categoria.id,
            "unidad": "caja",
            "stock_actual": "3.00",
            "stock_minimo": "1.00",
            "auto_descontar": True,
            "producto_vinculado_id": self.producto.id,
            "cantidad_por_venta": "1.00",
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        articulo = serializer.save()

        self.assertEqual(articulo.categoria, self.categoria)
        self.assertEqual(articulo.producto_vinculado, self.producto)
        self.assertTrue(articulo.auto_descontar)

    def test_auto_descontar_exige_producto_vinculado(self):
        serializer = ArticuloInventarioSerializer(data={
            "nombre": "Leche",
            "unidad": "l",
            "stock_actual": "2.00",
            "stock_minimo": "1.00",
            "auto_descontar": True,
            "cantidad_por_venta": "1.00",
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("producto_vinculado_id", serializer.errors)

    def test_no_permite_vincular_el_mismo_producto_dos_veces(self):
        ArticuloInventario.objects.create(
            nombre="Caja Coca Cola",
            unidad="caja",
            producto_vinculado=self.producto,
            auto_descontar=True,
            cantidad_por_venta=Decimal("1.00"),
        )

        serializer = ArticuloInventarioSerializer(data={
            "nombre": "Coca alternativa",
            "unidad": "ud",
            "auto_descontar": True,
            "producto_vinculado_id": self.producto.id,
            "cantidad_por_venta": "1.00",
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("producto_vinculado_id", serializer.errors)


class ProcesarStockComandaTests(InventarioTestMixin, TestCase):
    def crear_comanda_con_linea(self, producto=None, cantidad=1):
        mesa = Mesa.objects.create(numero=1, nombre="MESA 1")
        comanda = Comanda.objects.create(mesa=mesa, usuario=self.user)
        producto = producto or self.producto
        LineaComanda.objects.create(
            comanda=comanda,
            producto=producto,
            cantidad=cantidad,
            precio_unitario=producto.precio,
            producto_nombre=producto.nombre,
        )
        return comanda

    def test_descuenta_articulo_vinculado_y_permite_negativo(self):
        articulo = ArticuloInventario.objects.create(
            nombre="Caja Coca Cola",
            unidad="ud",
            stock_actual=Decimal("1.00"),
            stock_minimo=Decimal("2.00"),
            producto_vinculado=self.producto,
            auto_descontar=True,
            cantidad_por_venta=Decimal("1.00"),
        )
        comanda = self.crear_comanda_con_linea(cantidad=3)

        procesar_stock_comanda(comanda, self.user)

        articulo.refresh_from_db()
        self.assertEqual(articulo.stock_actual, Decimal("-2.00"))

        movimiento = MovimientoStock.objects.get(articulo=articulo)
        self.assertEqual(movimiento.tipo, MovimientoStock.TIPO_VENTA)
        self.assertEqual(movimiento.cantidad, Decimal("3.00"))
        self.assertEqual(movimiento.anterior, Decimal("1.00"))
        self.assertEqual(movimiento.nuevo, Decimal("-2.00"))

        self.assertTrue(EventoAuditoria.objects.filter(evento="STOCK_NEGATIVO").exists())

    def test_ignora_articulos_no_activados(self):
        articulo = ArticuloInventario.objects.create(
            nombre="Caja Coca Cola",
            unidad="ud",
            stock_actual=Decimal("5.00"),
            producto_vinculado=self.producto,
            auto_descontar=False,
            cantidad_por_venta=Decimal("1.00"),
        )
        comanda = self.crear_comanda_con_linea(cantidad=3)

        procesar_stock_comanda(comanda, self.user)

        articulo.refresh_from_db()
        self.assertEqual(articulo.stock_actual, Decimal("5.00"))
        self.assertFalse(MovimientoStock.objects.filter(articulo=articulo).exists())


class ArticuloInventarioAjustarTests(InventarioTestMixin, TestCase):
    def post_ajuste(self, articulo, payload):
        factory = APIRequestFactory()
        view = ArticuloInventarioViewSet.as_view({"post": "ajustar"})
        request = factory.post(
            f"/api/articulos-inventario/{articulo.id}/ajustar/",
            payload,
            format="json",
        )
        force_authenticate(request, user=self.user)
        return view(request, pk=articulo.id)

    def test_recuento_a_cero_es_valido(self):
        articulo = ArticuloInventario.objects.create(
            nombre="Leche",
            unidad="l",
            stock_actual=Decimal("5.00"),
        )

        response = self.post_ajuste(articulo, {
            "operacion": "recuento",
            "stock_final": "0",
        })

        self.assertEqual(response.status_code, 200)
        articulo.refresh_from_db()
        self.assertEqual(articulo.stock_actual, Decimal("0.00"))

        movimiento = MovimientoStock.objects.get(articulo=articulo)
        self.assertEqual(movimiento.tipo, MovimientoStock.TIPO_AJUSTE)
        self.assertEqual(movimiento.cantidad, Decimal("5.00"))
        self.assertEqual(movimiento.nuevo, Decimal("0.00"))

    def test_salida_manual_puede_dejar_stock_negativo(self):
        articulo = ArticuloInventario.objects.create(
            nombre="Cafe",
            unidad="kg",
            stock_actual=Decimal("2.00"),
        )

        response = self.post_ajuste(articulo, {
            "operacion": "delta",
            "tipo": "salida",
            "cantidad": "-3",
            "motivo": "Merma",
        })

        self.assertEqual(response.status_code, 200)
        articulo.refresh_from_db()
        self.assertEqual(articulo.stock_actual, Decimal("-1.00"))

        movimiento = MovimientoStock.objects.get(articulo=articulo)
        self.assertEqual(movimiento.tipo, MovimientoStock.TIPO_SALIDA)
        self.assertEqual(movimiento.cantidad, Decimal("3.00"))
        self.assertEqual(movimiento.nuevo, Decimal("-1.00"))


class ImportarPlantillaInventarioTests(InventarioTestMixin, TestCase):
    def test_importa_producto_tpv_con_unidad_elegida_y_auto_descuento(self):
        factory = APIRequestFactory()
        request = factory.post(
            "/api/plantillas-inventario/importar/",
            {
                "articulos": [
                    {
                        "nombre": "Coca Cola",
                        "categoria": "Productos TPV",
                        "unidad": "caja",
                        "stock_actual": "2",
                        "stock_minimo": "1",
                        "producto_vinculado_id": self.producto.id,
                        "auto_descontar": True,
                        "cantidad_por_venta": "1",
                    }
                ]
            },
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = importar_plantilla_inventario(request)

        self.assertEqual(response.status_code, 200)
        articulo = ArticuloInventario.objects.get(nombre="Coca Cola")
        self.assertEqual(articulo.unidad, "caja")
        self.assertEqual(articulo.stock_actual, Decimal("2.00"))
        self.assertEqual(articulo.stock_minimo, Decimal("1.00"))
        self.assertEqual(articulo.producto_vinculado, self.producto)
        self.assertTrue(articulo.auto_descontar)
