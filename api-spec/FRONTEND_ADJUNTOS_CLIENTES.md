# Adjuntos de archivos por cliente — guía para frontend

> **Índice general:** [FRONTEND_ARCHIVOS_CLIENTES.md](./FRONTEND_ARCHIVOS_CLIENTES.md) — visión completa (cliente + visitas + flujos UI).

Documento de referencia para integrar la carga, listado, descarga y eliminación de archivos asociados a un cliente en la ficha de clientes del ERP.

**Base URL API:** `/api` (ej. local `http://localhost:3001/api`, producción según deploy).

**OpenAPI:** schemas y rutas en `openapi.yaml` (`CustomerAttachment`, `/customers/{id}/attachments`).

---

## ¿Para qué sirve?

Permite **adjuntar documentos a un cliente** de forma persistente: fotos, PDFs, contratos Word, planillas Excel, etc.

Casos de uso típicos:

- Comprobantes de pago o facturas escaneadas
- Fotos de identificación o productos entregados
- Contratos firmados (PDF / Word)
- Hojas de cálculo con condiciones comerciales

Los archivos **no van dentro del timeline de visitas/notas** como binarios embebidos en el JSON de la visita — esa es la lista de **adjuntos a nivel cliente**. Para archivos **por visita** (timeline), ver **[FRONTEND_ADJUNTOS_VISITAS.md](./FRONTEND_ADJUNTOS_VISITAS.md)**.

El front puede **mezclar visualmente** visitas (con sus `attachments[]`) y adjuntos de cliente en una línea de tiempo ordenando por fecha; el backend no expone un endpoint `/timeline` unificado en v1.

**Almacenamiento:** binarios en Cloudflare R2 (S3-compatible); en Postgres solo metadata (nombre, tipo, tamaño, quién subió, fecha).

---

## Resumen de endpoints

| Método | Ruta | Auth | Permiso RBAC | Uso |
|--------|------|------|--------------|-----|
| `GET` | `/customers/:customerId/attachments` | Opcional | — | Listar adjuntos (paginado) |
| `POST` | `/customers/:customerId/attachments` | JWT | `customers.create` | Subir archivo |
| `GET` | `/customers/:customerId/attachments/:attachmentId/download` | JWT | `customers.read` | Descargar (redirect 302) |
| `DELETE` | `/customers/:customerId/attachments/:attachmentId` | JWT | `customers.delete` | Eliminar adjunto |

`:customerId` y `:attachmentId` son UUID.

---

## Tipos de archivo permitidos

Validación en backend por **magic bytes** (no basta la extensión del nombre).

| Categoría | Formatos |
|-----------|----------|
| Imagen | JPEG, PNG, WebP, GIF |
| PDF | `.pdf` |
| Word | `.doc`, `.docx` |
| Excel | `.xls`, `.xlsx` |

**Límite de tamaño:** 10 MB por archivo (`ATTACHMENTS_MAX_BYTES = 10485760`).

**Imágenes:** el backend las comprime (redimensiona si superan ~2048 px, calidad ~80 %). Pueden guardarse como JPEG o WebP aunque el usuario suba PNG/GIF. En la respuesta conviene mostrar `originalSizeBytes` vs `storedSizeBytes` para reflejar el ahorro.

**PDF / Office:** se suben tal cual, sin recompresión fuerte en v1.

---

## Autenticación y permisos

- **Subir:** header `Authorization: Bearer {accessToken}` + permiso `customers.create`.
- **Descargar:** JWT + permiso `customers.read`.
- **Eliminar:** JWT + permiso `customers.delete`.
- **Listar:** auth opcional (mismo patrón que otras rutas de clientes con `optionalAuth`).

El bucket R2 es **privado**. No hay URL pública directa al archivo: la descarga pasa siempre por la API, que responde **302** hacia una URL firmada de R2 (~5 minutos de validez).

---

## 1. Listar adjuntos

```http
GET /api/customers/{customerId}/attachments?page=1&limit=20
```

Query params: `page`, `limit` o `pageSize` (misma convención que visitas y otros listados).

**Respuesta 200:**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid-del-adjunto",
        "customerId": "uuid-del-cliente",
        "originalName": "factura-enero.pdf",
        "mimeType": "application/pdf",
        "originalSizeBytes": 245000,
        "storedSizeBytes": 245000,
        "descripcion": "Factura enero 2026",
        "createdAt": "2026-06-20T20:30:00.000Z",
        "uploadedBy": {
          "nombre": "Administrador",
          "username": "admin"
        },
        "downloadPath": "/api/customers/{customerId}/attachments/{attachmentId}/download"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

**UI sugerida:** tabla o lista de tarjetas con nombre, tipo, tamaño, fecha, autor, acciones (descargar / eliminar). Icono según `mimeType` (imagen vs PDF vs Office).

---

## 2. Subir archivo

```http
POST /api/customers/{customerId}/attachments
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

**Campos FormData:**

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `file` | Sí | Archivo binario |
| `descripcion` | No | Texto corto (máx. 500 caracteres) para etiquetar en UI |

**No** enviar `Content-Type: application/json`. Usar `FormData` nativo del browser.

**Ejemplo (fetch):**

```typescript
async function uploadCustomerAttachment(
  customerId: string,
  file: File,
  token: string,
  descripcion?: string
) {
  const form = new FormData();
  form.append('file', file);
  if (descripcion?.trim()) {
    form.append('descripcion', descripcion.trim());
  }

  const res = await fetch(`/api/customers/${customerId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json();
    throw err;
  }

  return res.json(); // 201 — objeto adjunto (misma forma que un ítem del listado)
}
```

**Respuesta 201:** un objeto `CustomerAttachment` (campos del listado).

**Errores frecuentes:**

| HTTP | Código | Significado |
|------|--------|-------------|
| 401 | — | Sin token o token inválido |
| 403 | — | Sin permiso `customers.create` |
| 422 | `VALIDATION_ERROR` / `INVALID_FORMAT` | Archivo vacío, tipo no permitido, o > 10 MB |
| 503 | `EXTERNAL_SERVICE_ERROR` | Storage R2 no configurado o error de conexión |

Mensaje 422 en tipo inválido: detalle `UNSUPPORTED_FILE_TYPE` en `error.details`.

---

## 3. Descargar archivo

```http
GET /api/customers/{customerId}/attachments/{attachmentId}/download
Authorization: Bearer {token}
```

**Respuesta:** `302 Found` con header `Location` apuntando a URL firmada de R2.

**Importante para el front:** un `<a href="..." download>` **no** envía el header `Authorization`. Opciones:

**A) Fetch + blob (recomendado en SPA):**

```typescript
async function downloadCustomerAttachment(
  customerId: string,
  attachmentId: string,
  token: string,
  filename: string
) {
  const res = await fetch(
    `/api/customers/${customerId}/attachments/${attachmentId}/download`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    }
  );

  if (!res.ok) throw new Error('No se pudo descargar');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**B)** Abrir en nueva pestaña solo si el backend expusiera un endpoint que acepte token por query (no existe en v1).

Usar `originalName` del adjunto como nombre al guardar.

---

## 4. Eliminar adjunto

```http
DELETE /api/customers/{customerId}/attachments/{attachmentId}
Authorization: Bearer {token}
```

**Respuesta:** `204 No Content` (sin body).

Borra el archivo en R2 y el registro en base de datos. Conviene confirmación en UI (`¿Eliminar adjunto?`).

---

## Relación con visitas / timeline

Hoy existen dos fuentes de “historial” en la ficha cliente:

| Fuente | Endpoint | Contenido |
|--------|----------|-----------|
| Visitas / notas | `GET /api/customers/:id/visits` | Texto largo, fecha del hecho, autor |
| Adjuntos | `GET /api/customers/:id/attachments` | Archivos con metadata |

**Decisión de producto (front):**

1. **Sección separada “Adjuntos”** — más simple; lista + upload + acciones.
2. **Timeline unificado en UI** — fetch de ambos endpoints, normalizar a eventos `{ type: 'visit' | 'attachment', date, ... }`, ordenar descendente por fecha.
3. **Solo adjuntos en pestaña Documentos** — visitas siguen en su bloque actual.

El backend no impone ninguna de estas opciones.

---

## Entorno local vs producción

| Entorno | Storage | Comportamiento |
|---------|---------|----------------|
| **Local (dev)** | Puede usarse `ATTACHMENTS_STORAGE=memory` | Upload funciona; archivos **no persisten** al reiniciar el servidor; descarga usa URLs fake |
| **Producción (Vercel)** | `ATTACHMENTS_STORAGE=s3` + variables R2 | Persistencia real en Cloudflare R2 |

Para probar el flujo completo en local sin depender de R2, el backend puede estar en modo `memory`. Para beta/producción debe estar en `s3`.

Variables de entorno relevantes (solo backend; el front no las usa):

- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`
- `ATTACHMENTS_MAX_BYTES=10485760`
- `ATTACHMENTS_STORAGE=s3` | `memory`

---

## Checklist de integración frontend

- [ ] Input `type="file"` con `accept` acorde (`.pdf,.doc,.docx,.xls,.xlsx,image/*`) — la validación final la hace el backend.
- [ ] Validar tamaño ≤ 10 MB **antes** de subir (mejor UX).
- [ ] `FormData` con campo `file`; opcional `descripcion`.
- [ ] Mostrar progreso / loading en upload (sin `Content-Type` manual en headers).
- [ ] Refrescar lista tras `POST` exitoso.
- [ ] Descarga vía fetch autenticado, no link directo sin token.
- [ ] Confirmación antes de `DELETE`.
- [ ] Manejo de 422 (tipo/tamaño) y 503 (storage) con mensajes al usuario.
- [ ] Ocultar acciones según permisos del usuario (`customers.create` / `read` / `delete`).

---

## Tipos TypeScript sugeridos

```typescript
export interface CustomerAttachment {
  id: string;
  customerId: string;
  originalName: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  descripcion: string | null;
  createdAt: string;
  uploadedBy: {
    nombre: string;
    username: string;
  };
  downloadPath: string;
}

export interface PaginatedAttachments {
  data: CustomerAttachment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

## Decisiones de UI pendientes (a definir en el equipo front)

Estas decisiones no están implementadas en backend; conviene acordarlas antes de desarrollar:

1. ¿Pestaña **“Adjuntos”** separada o integrada en timeline?
2. ¿Campo **descripcion** obligatorio u opcional en el formulario de subida?
3. ¿Vista previa de **imágenes** en lista (thumbnail vía descarga autenticada)?
4. ¿Permitir **múltiples archivos** en un solo submit (hoy: un `POST` = un archivo; múltiples = varios requests)?
5. ¿Mostrar **ahorro de compresión** en imágenes (`originalSizeBytes` → `storedSizeBytes`)?
6. ¿Filtros en lista (solo PDF, solo imágenes)? — no hay filtros en API v1; sería filtrado client-side.

---

## Referencias

- OpenAPI: `api-spec/openapi.yaml` — paths `/customers/{id}/attachments`
- Convenciones generales: `api-spec/conventions.md`, `api-spec/errors.md`
- Tests de integración backend: `src/modules/customers/attachments.integration.test.ts`
