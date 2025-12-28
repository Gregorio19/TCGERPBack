# Especificación de API - TCG ERP

Esta carpeta contiene la especificación completa de la API extraída del código del frontend, mocks MSW y fixtures.

## Archivos Generados

### 1. `openapi.yaml`
Especificación OpenAPI 3.1 completa con todos los endpoints detectados.

**Endpoints por dominio:**
- **Productos**: 7 endpoints (GET, POST, PUT, DELETE, PATCH, stats, categories, low-stock)
- **Inventario**: 10 endpoints (CRUD + stats, alerts, locations, adjustments)
- **Recepciones**: 5 endpoints (CRUD completo)
- **Transferencias**: 5 endpoints (CRUD completo)
- **Proveedores**: 5 endpoints (CRUD completo)
- **Ventas**: 8 endpoints (CRUD + stats, monthly, recent, top-customers)
- **Órdenes**: 4 endpoints (CRUD + timeline)
- **Clientes**: 6 endpoints (CRUD + orders, stats)
- **Contabilidad - Cuentas**: 6 endpoints (CRUD + tree, children)
- **Contabilidad - Asientos**: 8 endpoints (CRUD + approve, contabilize, cancel)
- **Contabilidad - Libro Mayor**: 3 endpoints (list, by-account, export)
- **Contabilidad - Libro IVA**: 5 endpoints (list, by-period, stats, export)
- **RRHH - Empleados**: 4 endpoints (CRUD + estadisticas)
- **RRHH - Contratos**: 5 endpoints (CRUD + by-empleado, terminar)
- **RRHH - Nómina**: 8 endpoints (CRUD + generar, procesar, calcular, resumen, exportar)
- **RRHH - Imposiciones**: 5 endpoints (CRUD + generar, exportar)
- **RRHH - Cargos**: 2 endpoints (list, get)
- **RRHH - Parámetros**: 2 endpoints (get, update)
- **Admin - Usuarios**: 4 endpoints (CRUD)
- **Admin - Roles**: 5 endpoints (CRUD + permissions)
- **Admin - Permisos**: 1 endpoint (list)
- **Admin - Sucursales**: 4 endpoints (CRUD)
- **Admin - Configuraciones**: 3 endpoints (list, get, update)
- **Admin - Stats**: 1 endpoint
- **Forecast**: 15 endpoints (calculate, kpis, productos-top, sets-top, grafico, comparar, alertas, estado, configuracion, historial, exportar, datos-historicos, validar, recomendaciones, metricas)
- **Reportes**: 6 endpoints (CRUD + types, stats, recent, export)
- **Dashboard**: 5 endpoints (stats, charts, monthly-sales, categories, stock, trends)

**Total: ~140 endpoints detectados**

### 2. `resources.json`
Catálogo de recursos con:
- Campos detallados (tipo, requerido, validaciones)
- Relaciones entre recursos
- Reglas de negocio por recurso
- Mapeo frontend ↔ API

**Recursos documentados:**
- Product
- Order
- Customer
- Recepcion
- Transferencia
- Account
- AsientoContable
- Employee
- User
- Role
- Branch

### 3. `validation.json`
Reglas de validación por recurso:
- Validaciones de campos (required, type, min, max, pattern)
- Validaciones condicionales (ej: tipo="single" requiere campos específicos)
- Validadores personalizados (RUT, stock disponible, jerarquía cuentas)
- Validaciones comunes reutilizables

### 4. `filters-and-pagination.md`
Convenciones globales de:
- Paginación (page, limit, default: 25, max: 100)
- Ordenamiento (sortBy, sortOrder)
- Búsqueda de texto (search/q, case-insensitive)
- Filtros específicos por módulo

### 5. `errors.md`
Catálogo completo de errores:
- Códigos de error por categoría
- Mapeo HTTP status codes
- Estructura de respuesta de error
- Ejemplos de errores
- Reglas de negocio y validaciones

**Categorías:**
- Validación (422): 8 códigos
- Not Found (404): 11 códigos
- Conflict (409): 5 códigos
- Negocio (422): 15+ códigos
- Autenticación (401/403): 6 códigos
- Servidor (500): 4 códigos

### 6. `rbac.json`
Matriz de permisos por rol:
- **Admin**: Acceso completo
- **Cajero**: Ventas y POS
- **Bodeguero**: Inventario y recepciones
- **Contador**: Contabilidad
- **RRHH**: Empleados y nómina
- **Viewer**: Solo lectura

**Recursos con permisos:**
- products, inventory, recepciones, transferencias, proveedores
- sales, orders, customers
- accounting, rrhh, admin
- reports, forecast

### 7. `seeds.json`
Datos de ejemplo consolidados:
- Productos (singles y sellados)
- Clientes
- Órdenes
- Recepciones
- Proveedores
- Empleados
- Cuentas contables
- Sucursales
- Usuarios y roles

**Notas:**
- Precios en centavos CLP
- IDs UUID v4 (excepto productos legacy)
- Fechas ISO 8601 UTC
- Relaciones coherentes entre recursos

### 8. `conventions.md`
Estándares de la API:
- Formato de fechas (ISO 8601 UTC)
- Moneda (CLP en centavos)
- Identificadores (UUID v4)
- Soft delete
- Búsqueda de texto
- Paginación y ordenamiento
- Imágenes (URLs presignadas)
- Autenticación (JWT Bearer)
- Versionado, rate limiting, CORS
- Validación, logging, timeouts
- Seguridad y performance

## Campos Obligatorios por Recurso

### Product
- nombre, precio, stock, categoria, activo

### Order
- clienteId, items (min 1), estado, canal, tipoDocumento, total, sucursalId

### Customer
- nombre, apellido, email, telefono, rut, direccion, estado

### Recepcion
- proveedorId, sucursalId, fechaRecepcion, fechaDocumento, numeroDocumento, tipoDocumento, items (min 1), total

### Account
- codigo, nombre, tipo, nivel, activa

### AsientoContable
- fecha, movimientos (min 2), totalDebe, totalHaber (debe = haber)

### Employee
- rut, nombre, apellidoPaterno, apellidoMaterno, email, fechaNacimiento, fechaIngreso, estado

## Endpoints Sugeridos (No implementados en frontend)

Los siguientes endpoints podrían ser útiles pero no están siendo usados por el frontend actual:

```yaml
# Autenticación
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET /auth/me

# Stock por sucursal
GET /api/stock/by-branch/{branchId}
GET /api/stock/by-product/{productId}

# Dashboard adicionales
GET /dashboard/revenue
GET /dashboard/expenses
GET /dashboard/profit

# Exportaciones adicionales
POST /products/export
POST /orders/export
POST /customers/export
```

## Validaciones Importantes

1. **Productos tipo "single"**: Requieren nro_coleccionista, rareza, condicion, idioma
2. **Órdenes**: Total debe coincidir con suma de items
3. **Asientos contables**: Debe = Haber
4. **Transferencias**: Requieren stock disponible en origen, no pueden ser a la misma sucursal
5. **RUT**: Validación de dígito verificador (módulo 11)
6. **SKU**: Debe ser único
7. **Email**: Debe ser único y formato válido

## Próximos Pasos

1. Revisar y validar la especificación con el equipo de backend
2. Implementar los endpoints faltantes sugeridos
3. Agregar autenticación JWT si no está implementada
4. Validar que todos los handlers MSW correspondan 1:1 con OpenAPI
5. Generar clientes SDK a partir de OpenAPI
6. Configurar validación automática de requests/responses

## Notas

- Los precios en el frontend se muestran en pesos CLP, pero en la API se manejan en centavos (enteros)
- Los productos usan IDs numéricos (legacy), el resto usa UUIDs
- Las fechas siempre en ISO 8601 UTC
- Soft delete recomendado para recursos críticos
