# TPV - Terminal de Punto de Venta
2º ASIR - Proyecto Final de Grado

Sistema de Punto de Venta (TPV) desarrollado y orientado a una cafetería con caja manual.
El sistema está diseñado para ser operativo, flexible y con control antifraude mediante auditoría completa de eventos.

---

## Descripción del Proyecto
Este proyecto consiste en el desarrollo de un **sistema TPV (Terminal de Punto de Venta)** orientado a entornos de restauración,
que permite gestionar mesas, comandas, productos, cobros, etc... mediante una aplicación web.

El objetivo es poder gestionar un negocio de restauración de manera eficiente y segura aplicando  los conocimientos adquiridos en el ciclo formativo.


## Tecnologías utilizadas
- Backend en **Django + Django REST Framework**
- Frontend en **HTML5, CSS3 y JavaScript**
- Base de datos **SQLite(entorno de desarrollo) y MySQL en Amazon RDS(entorno de producción)**
- Contenedores **Docker**
- Despliegue en **Amazon EKS**
- Imágenes en **Amazon ECR**
- HTTPS con **AWS Certificate Manager**
- DNS con **Route53**
- Gestión de secretos con **AWS Secrets Manager**
- Auditoría e informes en **Amazon S3**
- Infraestructura como código con **Terraform**
- Control de versiones con **Git y GitHub**

## Estructura del repositorio
- `/tpv` y `/tpvapp`: aplicaciones principales
- `/templates`: plantillas HTML
- `/static`: recursos estáticos
- `/docs`: documentación técnica del proyecto
- `manage.py`: script principal del proyecto

---

## Objetivos
- Gestionar mesas, comandas, facturas, cobros, productos, usuarios, etc...
- Permitir operativa completa a camareros.
- Implementar sistema de roles y permisos.
- Registrar todos los eventos sensibles para control antifraude.
- Permitir despliegue reproducible en AWS.
- Poder crear y destruir la infraestructura fácilmente.
