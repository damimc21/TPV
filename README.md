# TPV
Sistema de Punto de Venta (TPV) desarrollado como proyecto académico, orientado a una cafetería con caja manual.
El sistema está diseñado para ser operativo, flexible y con control antifraude mediante auditoría completa de eventos.

---

## Descripción del Proyecto
Este proyecto consiste en el desarrollo de un TPV web con:
- Backend en **Django + Django REST Framework**
- Frontend en **HTML, CSS y JavaScript**
- Base de datos **MySQL (Amazon RDS)**
- Contenedores **Docker**
- Despliegue en **Amazon EKS**
- Imágenes en **Amazon ECR**
- HTTPS con **AWS Certificate Manager**
- DNS con **Route53**
- Gestión de secretos con **AWS Secrets Manager**
- Auditoría e informes en **Amazon S3**
- Infraestructura como código con **Terraform**

---

## Objetivos
- Gestionar mesas, comandas, facturas y pagos.
- Permitir operativa completa a camareros.
- Implementar sistema de roles y permisos.
- Registrar todos los eventos sensibles para control antifraude.
- Permitir despliegue reproducible en AWS.
- Poder crear y destruir la infraestructura fácilmente.
