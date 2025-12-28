# Filtros y Paginación - Convenciones Globales

## Paginación

### Parámetros Estándar

- **`page`** (query, integer, default: 1): Número de página (1-based)
- **`limit`** o **`pageSize`** (query, integer, default: 25, max: 100): Tamaño de página

### Respuesta de Paginación

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 150,
    "totalPages": 6,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Ordenamiento

### Parámetros Estándar

- **`sortBy`** (query, string): Campo por el cual ordenar
- **`sortOrder`** o **`sortDir`** (query, enum: `asc` | `desc`, default: `asc`): Dirección de ordenamiento

### Campos Ordenables Comunes

- `id`: ID del recurso
- `nombre`: Nombre
- `fechaCreacion`: Fecha de creación
- `fechaActualizacion`: Fecha de actualización
- `precio`: Precio
- `stock`: Stock disponible

## Búsqueda de Texto

### Parámetro Estándar

- **`search`** o **`q`** (query, string): Búsqueda de texto libre (case-insensitive)

### Comportamiento

- Búsqueda case-insensitive
- Busca en múltiples campos relevantes del recurso
- Usa `ILIKE` o `%` para coincidencias parciales (PostgreSQL)

## Filtros por Módulo

### Productos (`/products`)

- `category`: Categoría del producto
- `juego`: Juego TCG (pokemon, yugioh, magic, etc.)
- `rareza`: Nivel de rareza
- `idioma`: Idioma de la carta
- `condicion`: Condición física (mint, near_mint, etc.)
- `tipo`: Tipo de producto (single, sellado, bundle, collection)
- `precioMin`: Precio mínimo
- `precioMax`: Precio máximo
- `stockDisponible`: Solo productos con stock disponible (boolean)

### Inventario (`/inventory`)

- `location`: Ubicación/almacén
- `lowStock`: Solo productos con stock bajo (boolean)
- `outOfStock`: Solo productos sin stock (boolean)

### Recepciones (`/recepciones`)

- `proveedor`: ID del proveedor
- `estado`: Estado de la recepción (PENDIENTE, EN_PROCESO, COMPLETADA, CANCELADA)
- `sucursal`: ID de la sucursal
- `fechaInicio`: Fecha desde (ISO 8601)
- `fechaFin`: Fecha hasta (ISO 8601)

### Transferencias (`/transferencias`)

- `sucursalOrigen`: ID de sucursal origen
- `sucursalDestino`: ID de sucursal destino
- `estado`: Estado de la transferencia (PENDIENTE, EN_TRANSITO, COMPLETADA, CANCELADA)
- `fechaInicio`: Fecha desde (ISO 8601)
- `fechaFin`: Fecha hasta (ISO 8601)

### Ventas (`/sales`)

- `status`: Estado de la venta (pendiente, completada, cancelada)
- `paymentMethod`: Método de pago
- `startDate`: Fecha desde (ISO 8601)
- `endDate`: Fecha hasta (ISO 8601)

### Órdenes (`/orders`)

- `estado`: Estado de la orden
- `canal`: Canal de venta (tienda_fisica, online, etc.)
- `clienteId`: ID del cliente
- `usuarioId`: ID del usuario que creó la orden
- `sucursalId`: ID de la sucursal
- `montoMinimo`: Monto mínimo
- `montoMaximo`: Monto máximo
- `fechaDesde`: Fecha desde (ISO 8601)
- `fechaHasta`: Fecha hasta (ISO 8601)

### Clientes (`/customers`)

- `estado`: Estado del cliente (activo, inactivo, suspendido)
- `canalComunicacion`: Canal de comunicación preferido (email, telefono, whatsapp, sms)
- `recibirPromociones`: Recibe promociones (boolean)
- `region`: Región
- `ciudad`: Ciudad
- `fechaRegistroDesde`: Fecha de registro desde (ISO 8601)
- `fechaRegistroHasta`: Fecha de registro hasta (ISO 8601)
- `fechaUltimaCompraDesde`: Fecha última compra desde (ISO 8601)
- `fechaUltimaCompraHasta`: Fecha última compra hasta (ISO 8601)

### Contabilidad - Cuentas (`/accounting/accounts`)

- `tipo`: Tipo de cuenta (activo, pasivo, patrimonio, ingreso, gasto, costo)
- `nivel`: Nivel jerárquico (1-5)
- `padreId`: ID de la cuenta padre
- `activa`: Solo cuentas activas (boolean)

### Contabilidad - Asientos (`/accounting/entries`)

- `tipo`: Tipo de asiento (manual, automatico, ajuste, cierre)
- `estado`: Estado (borrador, aprobado, contabilizado, anulado)
- `comprobante`: Tipo de comprobante (factura, boleta, etc.)
- `usuarioCreacion`: ID del usuario que creó el asiento
- `fechaDesde`: Fecha desde (ISO 8601)
- `fechaHasta`: Fecha hasta (ISO 8601)

### Contabilidad - Libro IVA (`/accounting/tax-books`)

- `tipo`: Tipo de libro (compras, ventas)
- `periodo`: Período (YYYY-MM)
- `rut`: RUT del contribuyente
- `fechaDesde`: Fecha desde (ISO 8601)
- `fechaHasta`: Fecha hasta (ISO 8601)

### RRHH - Empleados (`/hr/employees`)

- `estado`: Estado del empleado (activo, inactivo, suspendido, licencia)
- `cargo`: Cargo del empleado
- `departamento`: Departamento
- `fechaIngresoDesde`: Fecha de ingreso desde (ISO 8601)
- `fechaIngresoHasta`: Fecha de ingreso hasta (ISO 8601)

### RRHH - Contratos (`/hr/contracts`)

- `empleadoId`: ID del empleado
- `tipo`: Tipo de contrato (indefinido, plazo_fijo, part_time, etc.)
- `estado`: Estado (vigente, terminado, suspendido)
- `fechaInicioDesde`: Fecha de inicio desde (ISO 8601)
- `fechaInicioHasta`: Fecha de inicio hasta (ISO 8601)

### RRHH - Nómina (`/hr/payroll`)

- `periodo`: Período (YYYY-MM)
- `empleadoId`: ID del empleado
- `estado`: Estado (pendiente, procesada, pagada, cancelada)
- `fechaPagoDesde`: Fecha de pago desde (ISO 8601)
- `fechaPagoHasta`: Fecha de pago hasta (ISO 8601)

### RRHH - Imposiciones (`/hr/contributions`)

- `periodo`: Período (YYYY-MM)
- `empleadoId`: ID del empleado
- `tipo`: Tipo de imposición (afp, salud, etc.)

### Admin - Usuarios (`/admin/users`)

- `estado`: Estado (activo/inactivo, boolean)
- `rolId`: ID del rol
- `sucursalId`: ID de la sucursal
- `fechaInicio`: Fecha de creación desde (ISO 8601)
- `fechaFin`: Fecha de creación hasta (ISO 8601)

### Admin - Roles (`/admin/roles`)

- `estado`: Estado (activo/inactivo, boolean)

### Admin - Sucursales (`/admin/branches`)

- `estado`: Estado (activa/inactiva, boolean)

### Admin - Configuraciones (`/admin/settings`)

- `categoria`: Categoría de configuración
- `editable`: Solo configuraciones editables (boolean)

### Forecast (`/forecast/*`)

- `fechaInicio`: Fecha desde (ISO 8601)
- `fechaFin`: Fecha hasta (ISO 8601)
- `productos`: Array de IDs de productos
- `juegos`: Array de juegos
- `sets`: Array de sets
- `sucursales`: Array de IDs de sucursales
- `canales`: Array de canales de venta

## Ejemplos de Uso

### Búsqueda con Paginación

```
GET /api/products?page=1&limit=25&search=charizard&juego=pokemon
```

### Filtros Múltiples

```
GET /api/orders?estado=pendiente&sucursalId=1&fechaDesde=2024-01-01T00:00:00Z&fechaHasta=2024-12-31T23:59:59Z
```

### Ordenamiento

```
GET /api/products?sortBy=precio&sortOrder=desc&page=1&limit=10
```

### Combinación Completa

```
GET /api/inventory?page=2&limit=50&search=magic&location=almacen-1&lowStock=true&sortBy=stock&sortOrder=asc
```

