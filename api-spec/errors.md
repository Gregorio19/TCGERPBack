# Catálogo de Errores de la API

## Estructura de Error

Todos los errores siguen esta estructura:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje descriptivo del error",
    "details": [
      {
        "field": "campo",
        "message": "Mensaje específico del campo"
      }
    ]
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

## Códigos de Error por Categoría

### Errores de Validación (422)

- `VALIDATION_ERROR`: Error general de validación
- `REQUIRED_FIELD`: Campo requerido faltante
- `INVALID_FORMAT`: Formato inválido
- `INVALID_RANGE`: Valor fuera de rango permitido
- `INVALID_ENUM`: Valor no válido para enum
- `INVALID_DATE`: Fecha inválida o formato incorrecto
- `INVALID_EMAIL`: Email inválido
- `INVALID_RUT`: RUT inválido (formato chileno)
- `INVALID_UUID`: UUID inválido

### Errores de Recurso No Encontrado (404)

- `PRODUCT_NOT_FOUND`: Producto no encontrado
- `ORDER_NOT_FOUND`: Orden no encontrada
- `CUSTOMER_NOT_FOUND`: Cliente no encontrado
- `EMPLOYEE_NOT_FOUND`: Empleado no encontrado
- `ACCOUNT_NOT_FOUND`: Cuenta contable no encontrada
- `RECEPTION_NOT_FOUND`: Recepción no encontrada
- `TRANSFER_NOT_FOUND`: Transferencia no encontrada
- `SUPPLIER_NOT_FOUND`: Proveedor no encontrado
- `USER_NOT_FOUND`: Usuario no encontrado
- `ROLE_NOT_FOUND`: Rol no encontrado
- `BRANCH_NOT_FOUND`: Sucursal no encontrada
- `RESOURCE_NOT_FOUND`: Recurso no encontrado (genérico)

### Errores de Conflicto (409)

- `DUPLICATE_SKU`: SKU duplicado
- `DUPLICATE_EMAIL`: Email duplicado
- `DUPLICATE_RUT`: RUT duplicado
- `DUPLICATE_CODE`: Código duplicado
- `DUPLICATE_ACCOUNT_CODE`: Código de cuenta duplicado
- `CONFLICT_STATE`: Conflicto de estado (ej: orden ya procesada)

### Errores de Negocio (422)

- `INVALID_STOCK`: Stock inválido (negativo, insuficiente)
- `OUT_OF_STOCK`: Producto sin stock
- `INSUFFICIENT_STOCK`: Stock insuficiente para la operación
- `INVALID_PRICE`: Precio inválido (negativo, fuera de rango)
- `INVALID_QUANTITY`: Cantidad inválida
- `INVALID_DISCOUNT`: Descuento inválido
- `INVALID_PAYMENT_METHOD`: Método de pago inválido
- `INVALID_ORDER_STATE`: Estado de orden inválido para la operación
- `ORDER_ALREADY_PROCESSED`: Orden ya procesada
- `ORDER_ALREADY_CANCELLED`: Orden ya cancelada
- `PAYROLL_PERIOD_CLOSED`: Período de nómina cerrado
- `ACCOUNTING_ENTRY_ALREADY_POSTED`: Asiento ya contabilizado
- `INVALID_ACCOUNTING_ENTRY`: Asiento contable inválido (debe = haber)
- `INVALID_ACCOUNT_HIERARCHY`: Jerarquía de cuentas inválida
- `INVALID_DATE_RANGE`: Rango de fechas inválido
- `INVALID_PERIOD`: Período inválido (formato YYYY-MM)

### Errores de Autenticación y Autorización (401/403)

- `UNAUTHORIZED`: No autenticado
- `INVALID_TOKEN`: Token inválido o expirado
- `TOKEN_EXPIRED`: Token expirado
- `FORBIDDEN`: No tiene permisos para realizar la acción
- `INSUFFICIENT_PERMISSIONS`: Permisos insuficientes
- `ROLE_REQUIRED`: Rol requerido no asignado

### Errores de Servidor (500)

- `INTERNAL_SERVER_ERROR`: Error interno del servidor
- `DATABASE_ERROR`: Error de base de datos
- `EXTERNAL_SERVICE_ERROR`: Error en servicio externo
- `PROCESSING_ERROR`: Error al procesar la solicitud

### Errores de Límites (429)

- `RATE_LIMIT_EXCEEDED`: Límite de tasa excedido
- `TOO_MANY_REQUESTS`: Demasiadas solicitudes

## Mapeo HTTP Status Codes

| Código HTTP | Categoría | Códigos de Error |
|------------|-----------|------------------|
| 400 | Bad Request | Errores de formato general |
| 401 | Unauthorized | UNAUTHORIZED, INVALID_TOKEN, TOKEN_EXPIRED |
| 403 | Forbidden | FORBIDDEN, INSUFFICIENT_PERMISSIONS, ROLE_REQUIRED |
| 404 | Not Found | *_NOT_FOUND |
| 409 | Conflict | DUPLICATE_*, CONFLICT_STATE |
| 422 | Unprocessable Entity | VALIDATION_ERROR, *_INVALID, *_ERROR (negocio) |
| 429 | Too Many Requests | RATE_LIMIT_EXCEEDED, TOO_MANY_REQUESTS |
| 500 | Internal Server Error | INTERNAL_SERVER_ERROR, DATABASE_ERROR, etc. |

## Ejemplos de Errores

### Error de Validación

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Error de validación en los datos proporcionados",
    "details": [
      {
        "field": "precio",
        "message": "El precio debe ser mayor a 0"
      },
      {
        "field": "sku",
        "message": "El SKU es requerido"
      }
    ]
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

### Error de Recurso No Encontrado

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Producto con ID 123 no encontrado"
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

### Error de Conflicto

```json
{
  "error": {
    "code": "DUPLICATE_SKU",
    "message": "Ya existe un producto con el SKU 'SWSH12PT5-025-MINT-ES'"
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

### Error de Negocio

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuficiente. Disponible: 5, Solicitado: 10",
    "details": [
      {
        "field": "cantidad",
        "message": "La cantidad solicitada excede el stock disponible"
      }
    ]
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

### Error de Autorización

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "No tiene permisos para eliminar productos"
  },
  "success": false,
  "timestamp": "2024-12-01T10:30:00Z"
}
```

## Reglas de Negocio y Validaciones

### Productos

- SKU debe ser único
- Precio debe ser > 0
- Stock no puede ser negativo
- Si `tipo === "single"`, requiere: `collectorNo`, `rarity`, `condition`, `lang`
- Si `tipo === "sellado"`, no requiere `collectorNo`, `rarity`, `condition`

### Órdenes

- No se puede modificar una orden ya procesada
- No se puede cancelar una orden ya entregada
- El total debe coincidir con la suma de items
- Debe tener al menos un item

### Inventario

- Stock no puede ser negativo
- Ajustes de stock requieren motivo
- Transferencias requieren stock disponible en origen

### Contabilidad

- Asientos deben tener debe = haber
- No se puede modificar un asiento ya contabilizado
- Cuentas deben respetar jerarquía (nivel padre < nivel hijo)

### RRHH

- No se puede procesar nómina de período cerrado
- Contratos no pueden solaparse para el mismo empleado
- Imposiciones solo se generan para empleados activos

