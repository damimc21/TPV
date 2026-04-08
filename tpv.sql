-- 1. Crear la base de datos
CREATE DATABASE IF NOT EXISTS tpv
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE tpv;

-- 2. Crear la tabla 'departamentos'
CREATE TABLE IF NOT EXISTS departamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 3. Crear la tabla 'productos'
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    departamento_id INT,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

-- 4. Crear la tabla 'grupo_comentarios'
CREATE TABLE IF NOT EXISTS grupo_comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 5. Crear la tabla 'comentarios'
CREATE TABLE IF NOT EXISTS comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT,
    texto VARCHAR(255) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    FOREIGN KEY (grupo_id) REFERENCES grupo_comentarios(id)
);

-- 6. Crear la tabla 'grupo_suplementos'
CREATE TABLE IF NOT EXISTS grupo_suplementos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 7. Crear la tabla 'suplementos'
CREATE TABLE IF NOT EXISTS suplementos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    FOREIGN KEY (grupo_id) REFERENCES grupo_suplementos(id)
);

-- 8. Crear la tabla 'producto_grupo_comentario' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS producto_grupo_comentario (
    producto_id INT,
    grupo_comentario_id INT,
    PRIMARY KEY (producto_id, grupo_comentario_id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (grupo_comentario_id) REFERENCES grupo_comentarios(id)
);

-- 9. Crear la tabla 'producto_grupo_suplemento' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS producto_grupo_suplemento (
    producto_id INT,
    grupo_suplemento_id INT,
    PRIMARY KEY (producto_id, grupo_suplemento_id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (grupo_suplemento_id) REFERENCES grupo_suplementos(id)
);

-- 10. Crear la tabla 'usuarios'
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 11. Crear la tabla 'permisos'
CREATE TABLE IF NOT EXISTS permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

-- 12. Crear la tabla 'usuario_permisos' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS usuario_permisos (
    usuario_id INT,
    permiso_id INT,
    PRIMARY KEY (usuario_id, permiso_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (permiso_id) REFERENCES permisos(id)
);

-- 13. Crear la tabla 'roles'
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo BOOLEAN DEFAULT TRUE
);

-- 14. Crear la tabla 'rol_permisos' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS rol_permisos (
    rol_id INT,
    permiso_id INT,
    PRIMARY KEY (rol_id, permiso_id),
    FOREIGN KEY (rol_id) REFERENCES roles(id),
    FOREIGN KEY (permiso_id) REFERENCES permisos(id)
);

-- 15. Crear la tabla 'usuario_roles' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS usuario_roles (
    usuario_id INT,
    rol_id INT,
    PRIMARY KEY (usuario_id, rol_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- 16. Crear la tabla 'mesas'
CREATE TABLE IF NOT EXISTS mesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    estado ENUM('libre', 'ocupada', 'pagando') NOT NULL DEFAULT 'libre',
    activo BOOLEAN DEFAULT TRUE
);

-- 17. Crear la tabla 'comandas'
CREATE TABLE IF NOT EXISTS comandas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mesa_id INT,
    usuario_id INT,
    abierta_a DATETIME DEFAULT CURRENT_TIMESTAMP,
    cerrada_a DATETIME,
    estado ENUM('abierta', 'cerrada', 'pagada', 'cancelada') DEFAULT 'abierta',
    comprobante_impreso_a DATETIME NULL,
    comprobante_impreso_por INT NULL,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 18. Crear la tabla 'lineas_comanda'
CREATE TABLE IF NOT EXISTS lineas_comanda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comanda_id INT,
    producto_id INT,
    cantidad INT DEFAULT 1,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    producto_nombre VARCHAR(100) NOT NULL,
    anulado BOOLEAN NOT NULL DEFAULT FALSE,
    anulado_por INT NULL,
    anulado_a DATETIME NULL,
    FOREIGN KEY (anulado_por) REFERENCES usuarios(id),
    FOREIGN KEY (comanda_id) REFERENCES comandas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- 19. Crear la tabla 'linea_comanda_comentarios' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS linea_comanda_comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    linea_comanda_id INT NOT NULL,
    comentario_id INT NULL,
    comentario_texto VARCHAR(255) NOT NULL,
    FOREIGN KEY (linea_comanda_id) REFERENCES lineas_comanda(id),
    FOREIGN KEY (comentario_id) REFERENCES comentarios(id)
);

-- 20. Crear la tabla 'linea_comanda_suplementos' (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS linea_comanda_suplementos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    linea_comanda_id INT NOT NULL,
    suplemento_id INT NOT NULL,
    suplemento_nombre VARCHAR(100) NOT NULL,
    suplemento_precio DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (linea_comanda_id) REFERENCES lineas_comanda(id),
    FOREIGN KEY (suplemento_id) REFERENCES suplementos(id)
);

-- 21. Crear la tabla 'perfiles_fiscales'
CREATE TABLE IF NOT EXISTS perfiles_fiscales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255),
    nif VARCHAR(20),
    telefono VARCHAR(20),
    email VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE
);

-- 22. Crear la tabla 'facturas'
CREATE TABLE IF NOT EXISTS facturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comanda_id INT,
    tipo_pago ENUM('efectivo', 'tarjeta') NOT NULL DEFAULT 'efectivo',
    tipo_factura ENUM('Simplificada', 'Completa') NOT NULL DEFAULT 'Simplificada',
    emitida_a DATETIME DEFAULT CURRENT_TIMESTAMP,
    emitida_por INT,
    subtotal DECIMAL(10, 2) NOT NULL,
    impuestos DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    estado ENUM('emitida', 'anulada', 'pagada') DEFAULT 'emitida',
    perfil_fiscal_id INT NULL,
    FOREIGN KEY (perfil_fiscal_id) REFERENCES perfiles_fiscales(id),
    FOREIGN KEY (comanda_id) REFERENCES comandas(id),
    FOREIGN KEY (emitida_por) REFERENCES usuarios(id)
);

-- 23. Crear la tabla 'lineas_factura'
CREATE TABLE IF NOT EXISTS lineas_factura (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT,
    linea_comanda_id INT,
    cantidad INT DEFAULT 1,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    total_linea DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (linea_comanda_id) REFERENCES lineas_comanda(id)
);

-- 24. Crear la tabla 'pagos'
CREATE TABLE IF NOT EXISTS pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT,
    cantidad DECIMAL(10, 2) NOT NULL,
    metodo_pago ENUM('efectivo', 'tarjeta') NOT NULL DEFAULT 'efectivo',
    pagado_a DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
);

--25. Crear la tabla 'division_facturas_lineas'
CREATE TABLE IF NOT EXISTS division_facturas_lineas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    linea_comanda_id INT NOT NULL,
    cantidad_asignada INT NOT NULL DEFAULT 1,
    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (linea_comanda_id) REFERENCES lineas_comanda(id)
);

-- 26. Crear la tabla 'dias'
CREATE TABLE IF NOT EXISTS dias (
    id DATE PRIMARY KEY,
    abierto_por INT,
    cerrado_por INT,
    total_ventas DECIMAL(10, 2),
    FOREIGN KEY (abierto_por) REFERENCES usuarios(id),
    FOREIGN KEY (cerrado_por) REFERENCES usuarios(id)
);

-- 27. Crear la tabla 'turnos'
CREATE TABLE IF NOT EXISTS turnos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dia_id DATE,
    abierto_por INT,
    cerrado_por INT,
    caja DECIMAL(10, 2),
    inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    fin DATETIME,
    FOREIGN KEY (abierto_por) REFERENCES usuarios(id),
    FOREIGN KEY (cerrado_por) REFERENCES usuarios(id),
    FOREIGN KEY (dia_id) REFERENCES dias(id)
);

-- 28. Crear la tabla 'eventos_auditoria'
CREATE TABLE IF NOT EXISTS eventos_auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    evento VARCHAR(255) NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    detalles TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 29. Crear la tabla 'impresoras'
CREATE TABLE IF NOT EXISTS impresoras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('ticket', 'factura') NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);
