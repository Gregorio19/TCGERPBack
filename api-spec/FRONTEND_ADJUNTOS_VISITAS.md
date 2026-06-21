# Adjuntos por visita (timeline) — guía para frontend

> **Índice general:** [FRONTEND_ARCHIVOS_CLIENTES.md](./FRONTEND_ARCHIVOS_CLIENTES.md) — visión completa (cliente + visitas + flujos UI).

Documento para integrar archivos asociados a **cada visita/nota** del cliente, no al cliente en general.

**Ver también:** [FRONTEND_ADJUNTOS_CLIENTES.md](./FRONTEND_ADJUNTOS_CLIENTES.md) (adjuntos a nivel cliente, lista separada).

**Base URL:** `/api`

---

## ¿Para qué sirve?

En el timeline de visitas, cada nota puede tener **0 o más archivos**: fotos del local, PDF firmado en esa reunión, etc. Los archivos pertenecen a la **visita**, no directamente al cliente.

**Flujo típico:**

1. Crear visita (`POST .../visits`) con texto y fecha.
2. Opcionalmente subir uno o más archivos (`POST .../visits/{visitId}/attachments`) — un archivo por request.
3. Ver timeline: `GET .../visits` ya trae `attachments[]` en cada visita.
4. Más tarde: agregar o quitar archivos de una visita existente (equivale a “editar” la visita en UI).

---

## Endpoints

| Método | Ruta | Auth | RBAC |
|--------|------|------|------|
| `GET` | `/customers/:customerId/visits` | Opcional | — |
| `POST` | `/customers/:customerId/visits` | JWT | `customers.create` |
| `GET` | `/customers/:customerId/visits/:visitId/attachments` | Opcional | — |
| `POST` | `/customers/:customerId/visits/:visitId/attachments` | JWT | `customers.create` |
| `GET` | `.../attachments/:attachmentId/download` | JWT | `customers.read` |
| `DELETE` | `.../attachments/:attachmentId` | JWT | `customers.delete` |

Mismas reglas que adjuntos cliente: **10 MB**, tipos imagen/PDF/Word/Excel, validación por magic bytes.

---

## 1. Crear visita

```http
POST /api/customers/{customerId}/visits
Authorization: Bearer {token}
Content-Type: application/json

{
  "descripcion": "Reunión en tienda, revisión de stock",
  "fecha": "2026-06-21T15:00:00.000Z"
}
```

**Respuesta 201:** visita con `attachments: []`.

---

## 2. Subir archivo a la visita

```http
POST /api/customers/{customerId}/visits/{visitId}/attachments
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

| Campo | Obligatorio |
|-------|-------------|
| `file` | Sí |
| `descripcion` | No (máx. 500 chars) |

```typescript
async function uploadVisitAttachment(
  customerId: string,
  visitId: string,
  file: File,
  token: string,
  descripcion?: string
) {
  const form = new FormData();
  form.append('file', file);
  if (descripcion?.trim()) form.append('descripcion', descripcion.trim());

  const res = await fetch(
    `/api/customers/${customerId}/visits/${visitId}/attachments`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  if (!res.ok) throw await res.json();
  return res.json();
}
```

**Varios archivos:** repetir `POST` por cada archivo (no hay batch en v1).

---

## 3. Listar visitas (timeline con adjuntos)

```http
GET /api/customers/{customerId}/visits?page=1&limit=20
```

Cada ítem incluye `attachments[]` completo:

```json
{
  "data": [
    {
      "id": "visit-uuid",
      "customerId": "...",
      "fecha": "2026-06-21T15:00:00.000Z",
      "descripcion": "Reunión en tienda",
      "usuario": { "nombre": "Admin", "username": "admin" },
      "attachments": [
        {
          "id": "att-uuid",
          "visitId": "visit-uuid",
          "originalName": "foto-local.jpg",
          "mimeType": "image/jpeg",
          "originalSizeBytes": 120000,
          "storedSizeBytes": 45000,
          "descripcion": null,
          "createdAt": "...",
          "uploadedBy": { "nombre": "Admin", "username": "admin" },
          "downloadPath": "/api/customers/{customerId}/visits/{visitId}/attachments/{id}/download"
        }
      ]
    }
  ],
  "pagination": { ... }
}
```

No hace falta un request extra por visita para mostrar el timeline.

---

## 4. Listar solo adjuntos de una visita

```http
GET /api/customers/{customerId}/visits/{visitId}/attachments?page=1&limit=20
```

Útil en modal de detalle/edición de una visita.

---

## 5. Descargar

Igual que adjuntos cliente: `GET` con JWT a `downloadPath`.

```typescript
const res = await fetch(
  `/api/customers/${customerId}/visits/${visitId}/attachments/${attachmentId}/download`,
  {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  }
);
const blob = await res.blob();
```

- **Local dev:** respuesta `200` con el archivo.
- **Producción R2:** `302` a URL firmada.

`Accept: application/json` devuelve `{ url }` (útil para preview de imágenes).

---

## 6. Eliminar adjunto

```http
DELETE /api/customers/{customerId}/visits/{visitId}/attachments/{attachmentId}
Authorization: Bearer {token}
```

Respuesta: `204`.

---

## Tipos TypeScript

```typescript
export interface CustomerVisitAttachment {
  id: string;
  visitId: string;
  originalName: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  descripcion: string | null;
  createdAt: string;
  uploadedBy: { nombre: string; username: string };
  downloadPath: string;
}

export interface CustomerVisit {
  id: string;
  customerId: string;
  fecha: string;
  descripcion: string;
  createdAt: string;
  updatedAt: string;
  usuario: { nombre: string; username: string };
  attachments: CustomerVisitAttachment[];
}
```

---

## UI sugerida

1. Formulario nueva visita → al guardar, si hay archivos pendientes, subirlos en secuencia con el `visitId` devuelto.
2. En cada ítem del timeline: mini-lista de adjuntos + botón “Añadir archivo” + eliminar por archivo.
3. Validar tamaño ≤ 10 MB antes del upload.
4. Ocultar acciones según permisos `customers.create` / `read` / `delete`.

---

## Diferencia con adjuntos de cliente

| | Adjuntos cliente | Adjuntos visita |
|--|------------------|-----------------|
| Asociación | Cliente | Visita concreta |
| Listado | `GET .../attachments` | Embebido en `GET .../visits` |
| Uso | Documentos generales del cliente | Evidencia de una visita/nota |
