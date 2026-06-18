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
- Servidor de aplicación Gunicorn, con Whitenoise sirviendo los archivos estáticos (sin Nginx ni servidor web adicional)
- Contenedores **Docker**
- Despliegue en **Amazon EKS**
- Imágenes en **Amazon ECR**
- Dominio registrado en Namecheap
- DNS y HTTPS gestionados con Cloudflare (proxy con redirección automática a HTTPS)
- Gestión de secretos con **AWS Secrets Manager**
- Auditoría e informes en **Amazon S3**
- Infraestructura como código con **Terraform**
- Integración continua y despliegue con GitHub Actions
- Control de versiones con **Git y GitHub**

---

## Cómo se despliega

Cada push a la rama develop dispara un workflow de GitHub Actions que construye la imagen Docker, la sube a Amazon ECR y la despliega en el clúster de Amazon EKS (incluyendo el job de migraciones de base de datos). El dominio se gestiona en Cloudflare: el tráfico llega cifrado a su proxy, que lo reenvía al balanceador de carga de Kubernetes y fuerza la redirección a HTTPS. Toda la infraestructura de AWS (VPC, RDS, EKS, ECR, S3) está definida por módulos de Terraform, lo que permite crearla y destruirla de forma reproducible.

---

## Estructura del repositorio
- `/tpv`: configuración del proyecto Django
- `/tpvapp`: aplicación principal
- `/templates`: plantillas HTML
- `/ui`: vistas web, plantillas y middlewares de auditoría
- `/static`: recursos estáticos
- `/infra`: infraestructura como código
- `/k8s`: despliegue de Kubernetes
- `/docs`: documentación técnica del proyecto
- `/scripts`: scripts de despliegue y destrucción de infraestructura
- `manage.py`: script principal del proyecto

---

## Objetivos
- Gestionar mesas, comandas, facturas, cobros, productos, usuarios, etc...
- Permitir operativa completa a camareros.
- Implementar sistema de roles y permisos.
- Registrar todos los eventos sensibles para control antifraude.
- Permitir despliegue reproducible en AWS.
- Poder crear y destruir la infraestructura fácilmente.
