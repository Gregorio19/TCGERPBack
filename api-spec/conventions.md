# Convenciones y Estándares de la API

## Formato de Fechas

- **Formato**: ISO 8601 (UTC)
- **Ejemplo**: `2024-12-01T10:30:00Z`
- **Tipo**: `date-time` en OpenAPI
- Todas las fechas se manejan en UTC en el backend

## Moneda

- **Moneda**: CLP (Pesos Chilenos)
- **Formato**: Enteros (centavos)
- **Ejemplo**: $1.000 CLP se representa como `100000` (100.000 centavos)
- **Tipo**: `integer` con `format: int64` en OpenAPI

## Identificadores

- **IDs de recursos**: UUID v4 (string)
- **IDs numéricos**: Solo para productos (legacy, `integer`)
- **Formato UUID**: `550e8400-e29b-41d4-a716-446655440000`

## Soft Delete

- Se recomienda implementar soft delete para recursos críticos
- Campo `activo: boolean` o `deletedAt: date-time`
- Los recursos eliminados no aparecen en listados por defecto

## Búsqueda de Texto

- **Parámetro**: `search` o `q`
- **Comportamiento**: Case-insensitive
- **Implementación**: Usar `ILIKE` en PostgreSQL o equivalente
- **Ejemplo**: `search=charizard` busca en múltiples campos

## Paginación

- **Página base**: 1 (no 0)
- **Tamaño por defecto**: 25
- **Tamaño máximo**: 100
- **Parámetros**: `page` y `limit`

## Ordenamiento

- **Parámetros**: `sortBy` (campo) y `sortOrder` (asc/desc)
- **Valor por defecto**: `sortBy=id`, `sortOrder=asc`
- **Campos ordenables**: Documentados en cada endpoint

## Imágenes

- **Formato**: URLs (presignadas en el futuro)
- **Tipos soportados**: JPG, PNG, WebP
- **Tamaño máximo**: 5MB por imagen
- **Múltiples imágenes**: Array de URLs

## Autenticación

- **Método**: JWT Bearer Token
- **Header**: `Authorization: Bearer <token>`
- **Expiración**: 24 horas (configurable)
- **Refresh**: Endpoint `/auth/refresh` (sugerido)

## Versionado

- **Versión actual**: v1
- **Formato**: `/api/v1/...` o header `API-Version: 1`
- **Cambios breaking**: Nueva versión mayor

## Rate Limiting

- **Límite**: 1000 requests/hora por IP
- **Header de respuesta**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- **Status 429**: Cuando se excede el límite

## CORS

- **Orígenes permitidos**: Configurables
- **Métodos**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Headers**: Authorization, Content-Type

## Content-Type

- **Request**: `application/json`
- **Response**: `application/json`
- **Excepciones**: Exportaciones (PDF, CSV, Excel) usan tipos MIME apropiados

## Encoding

- **Caracteres**: UTF-8
- **Idiomas**: Soporte completo para español, caracteres especiales

## Validación

- **Validación de entrada**: Siempre en el backend
- **Mensajes**: En español
- **Formato**: Array de errores por campo

## Logging

- **Nivel**: INFO para operaciones normales, ERROR para excepciones
- **Información**: Timestamp, usuario, endpoint, método, status code
- **Sensibles**: No loguear contraseñas, tokens completos

## Timeouts

- **Request timeout**: 30 segundos
- **Long-running operations**: Usar jobs asíncronos

## Caché

- **Headers**: `Cache-Control`, `ETag`
- **Duración**: Configurable por recurso
- **Invalidación**: Al modificar recursos

## Webhooks (Sugerido)

- **Eventos**: Creación, actualización, eliminación de recursos críticos
- **Formato**: POST a URL configurada
- **Autenticación**: Signature header

## Documentación

- **OpenAPI**: Especificación completa en `/api-spec/openapi.yaml`
- **Ejemplos**: Incluidos en la especificación
- **Changelog**: Mantener registro de cambios

## Testing

- **Ambiente de pruebas**: `/api/staging/...` o header `X-Environment: staging`
- **Datos de prueba**: Seeds documentados en `seeds.json`

## Seguridad

- **HTTPS**: Obligatorio en producción
- **Validación de entrada**: Sanitización de todos los inputs
- **SQL Injection**: Usar prepared statements
- **XSS**: Escapar outputs
- **CSRF**: Tokens para operaciones de modificación

## Performance

- **Índices**: En campos de búsqueda frecuente
- **Paginación**: Obligatoria para listados grandes
- **Lazy loading**: Para relaciones opcionales
- **Compresión**: Gzip para respuestas grandes

## Internacionalización

- **Idioma por defecto**: Español (es-CL)
- **Header**: `Accept-Language: es-CL, es, en`
- **Mensajes de error**: En el idioma solicitado

## Extensibilidad

- **Campos adicionales**: Usar `metadata: object` para datos no estructurados
- **Webhooks**: Para integraciones externas
- **Plugins**: Arquitectura modular (sugerido)

