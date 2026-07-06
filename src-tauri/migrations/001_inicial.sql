-- 001_inicial.sql — Esquema inicial del MVP Financiero Local-First.
-- Versión: 1
-- Nombre: schema_inicial_v1
-- Genera: 4 tablas de dominio + tabla de control `_migrations` + 14 categorías semilla.
-- Idempotente: todas las sentencias usan IF NOT EXISTS y los seeds usan INSERT OR IGNORE.
-- Convenciones:
--   * Identificadores en TitleCase (Usuarios, Categorias, …) para alinearse con el Excel.
--   * Montos monetarios en INTEGER (centavos) — NUNCA en REAL.
--   * CHECK constraints en columnas y reglas cruzadas (tipo_flujo vs comportamiento).
--   * Timestamps en segundos epoch UNIX vía strftime('%s', 'now').

-- =============================================================================
-- 1) Tabla de control interno del runner de migraciones
-- =============================================================================
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    aplicada_en INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    sha256 TEXT NOT NULL
);

-- =============================================================================
-- 2) Usuarios (perfiles multi-cuenta)
-- =============================================================================
CREATE TABLE IF NOT EXISTS Usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    moneda TEXT NOT NULL DEFAULT 'LOCAL' CHECK (moneda IN ('LOCAL')),
    salario_personal_objetivo_centavos INTEGER NOT NULL DEFAULT 0
        CHECK (salario_personal_objetivo_centavos >= 0),
    modo_mejorado_activo INTEGER NOT NULL DEFAULT 0
        CHECK (modo_mejorado_activo IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nombre_unique
    ON Usuarios (nombre COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_usuarios_modo_mejorado
    ON Usuarios (modo_mejorado_activo);

-- =============================================================================
-- 3) Categorías (catálogo semilla con 14 filas)
-- =============================================================================
CREATE TABLE IF NOT EXISTS Categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    tipo_flujo TEXT NOT NULL CHECK (tipo_flujo IN ('Ingreso', 'Gasto')),
    es_esencial_defecto INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_nombre_tipo_unique
    ON Categorias (nombre COLLATE NOCASE, tipo_flujo);

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_flujo
    ON Categorias (tipo_flujo);

-- =============================================================================
-- 4) Transacciones (hechos financieros)
-- =============================================================================
CREATE TABLE IF NOT EXISTS Transacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo_flujo TEXT NOT NULL CHECK (tipo_flujo IN ('Ingreso', 'Gasto')),
    categoria_id INTEGER NOT NULL,
    concepto TEXT NOT NULL CHECK (length(trim(concepto)) > 0),
    frecuencia TEXT NOT NULL CHECK (frecuencia IN (
        'Mensual', 'Bimensual', 'Trimestral', 'Semestral', 'Anual'
    )),
    comportamiento TEXT CHECK (comportamiento IN ('Fijo', 'Variable')),
    naturaleza_necesidad TEXT CHECK (
        naturaleza_necesidad IS NULL OR
        naturaleza_necesidad IN ('Necesario', 'No tan necesario', 'No necesario')
    ),
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    notas TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (usuario_id)   REFERENCES Usuarios(id)   ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE RESTRICT,
    CHECK (
        -- Gasto: ambos campos requeridos.
        (tipo_flujo = 'Gasto'   AND comportamiento IS NOT NULL AND naturaleza_necesidad IS NOT NULL)
        OR
        -- Ingreso: naturaleza_necesidad SIEMPRE NULL. comportamiento
        -- puede ser NULL o NOT NULL porque el dominio distingue
        -- Ingresos Fijos vs Variables (la capa de agregación
        -- matriz.ts usa `comportamiento` para separar los buckets
        -- de Ingreso Fijo vs Variable).
        (tipo_flujo = 'Ingreso' AND naturaleza_necesidad IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario
    ON Transacciones (usuario_id);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_tipo
    ON Transacciones (usuario_id, tipo_flujo);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_categoria
    ON Transacciones (usuario_id, categoria_id);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_naturaleza
    ON Transacciones (usuario_id, naturaleza_necesidad)
    WHERE naturaleza_necesidad IS NOT NULL;

-- =============================================================================
-- 5) Simulador (propuestas de nuevos valores por transacción)
-- =============================================================================
CREATE TABLE IF NOT EXISTS Simulador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    transaccion_id INTEGER NOT NULL,
    nuevo_valor_centavos INTEGER NOT NULL
        CHECK (nuevo_valor_centavos >= 0),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (usuario_id)    REFERENCES Usuarios(id)       ON DELETE CASCADE,
    FOREIGN KEY (transaccion_id) REFERENCES Transacciones(id) ON DELETE CASCADE,
    UNIQUE (transaccion_id)
);

CREATE INDEX IF NOT EXISTS idx_simulador_usuario
    ON Simulador (usuario_id);

-- =============================================================================
-- 6) Triggers de mantenimiento de updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_transacciones_updated_at
AFTER UPDATE ON Transacciones
FOR EACH ROW
BEGIN
    UPDATE Transacciones SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_simulador_updated_at
AFTER UPDATE ON Simulador
FOR EACH ROW
BEGIN
    UPDATE Simulador SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

-- =============================================================================
-- 7) Seed: 14 categorías iniciales (4 Ingreso + 10 Gasto)
-- Cada fila se inserta con su propio `INSERT INTO` para que el seed sea
-- legible y para que el índice único `idx_categorias_nombre_tipo_unique`
-- (definido arriba) aborte limpiamente si se vuelve a correr.
-- =============================================================================
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Salario', 'Ingreso', NULL);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Otros ingresos', 'Ingreso', NULL);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Negocio', 'Ingreso', NULL);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Inversion', 'Ingreso', NULL);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Alimentacion', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Hogar', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Transporte', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Provisiones', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Deudas entidades', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Deudas conocidos', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Entretenimiento', 'Gasto', 0);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Familia', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Impuestos', 'Gasto', 1);
INSERT INTO Categorias (nombre, tipo_flujo, es_esencial_defecto) VALUES ('Otros gastos', 'Gasto', 0);

-- =============================================================================
-- 8) Seed: usuario por defecto 'Yo' (Slice 7 — wire de persistencia).
-- =============================================================================
-- MVP local: un solo perfil llamado 'Yo' con salario_objetivo=$500,000
-- ($500,000 = 50,000,000 centavos) para que el KPI engine tenga datos
-- out-of-the-box. La decision de producto #2 mantiene que el salario
-- NO se descuenta en el FA2 inicial — solo cuando modo_mejorado_activo=1.
--
-- `INSERT OR IGNORE` es idempotente: si 'Yo' ya existe (DBs creadas
-- antes de este seed), no falla. La unicidad real la enforce el
-- `idx_usuarios_nombre_unique` declarado arriba (case-insensitive).
INSERT OR IGNORE INTO Usuarios (nombre, salario_personal_objetivo_centavos)
VALUES ('Yo', 50000000);
