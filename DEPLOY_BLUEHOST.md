# Despliegue en Bluehost (rama `Bluehosting`)

Guía para publicar la API TCG ERP en Bluehost con Node.js App, PostgreSQL en cPanel y deploy vía Git + `.cpanel.yml`.

## Resumen del entorno configurado

| Item | Valor |
|------|--------|
| Subdominio API | `https://apierp.pandigeektcg.cl` |
| Application root | `/home/pandigee/public_html/apierp.pandigeektcg.cl` |
| Node.js | 20.20.2 (Production) |
| Startup file | `dist/server.js` |
| Base de datos | `pandigee_tcgerp` |
| Usuario PostgreSQL | `pandigee_tcgerpUser` |
| Rama Git | `Bluehosting` |
| Producción actual (rollback) | Vercel + Neon en rama `main` |

**Base URL de la API:** `https://apierp.pandigeektcg.cl/api`

---

## Checklist previo (cPanel — ya realizado por ti)

- [x] PostgreSQL `pandigee_tcgerp` + usuario `pandigee_tcgerpUser` con privilegios
- [x] Subdominio `apierp.pandigeektcg.cl`
- [x] Setup Node.js App (20.20.2, Production, `dist/server.js`)
- [x] Variables de entorno: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`

### Variables de entorno (referencia)

```text
NODE_ENV=production
DATABASE_URL=postgresql://pandigee_tcgerpUser:CONTRASEÑA_URL_ENCODED@localhost:5432/pandigee_tcgerp?schema=public
JWT_SECRET=<secreto-largo>
CORS_ALLOWED_ORIGINS=https://pandigeektcg.cl
```

**Nota:** Si la contraseña tiene caracteres especiales (`*`, `@`, `#`, etc.), codifícalos en la URL (`*` → `%2A`).

---

## Paso 1 — Push de la rama `Bluehosting` a GitHub

En tu máquina local (rama `Bluehosting`):

```bash
git checkout Bluehosting
git add .
git commit -m "feat: deploy Bluehost con cpanel.yml y scripts"
git push -u origin Bluehosting
```

---

## Paso 2 — Git Version Control en cPanel

1. cPanel → **Git Version Control** → **Create**
2. **Clone URL:** URL HTTPS/SSH de tu repo GitHub del backend
3. **Repository Path:** `/home/pandigee/public_html/apierp.pandigeektcg.cl`
4. Tras crear, en el repositorio → **Manage** → cambiar rama a **`Bluehosting`**
5. Clic en **Deploy HEAD Commit**

El archivo [`.cpanel.yml`](.cpanel.yml) ejecutará automáticamente:

- `npm ci`
- `npm run bluehost-build` (prisma generate + tsc)
- `npm run bluehost-deploy` (prisma migrate deploy)
- `touch tmp/restart.txt` (reinicio Passenger)

6. En **Setup Node.js App** → **REINICIAR** la aplicación (si hace falta tras el primer deploy).

---

## Paso 3 — Extensión PostgreSQL `btree_gist`

Tras el primer `migrate deploy`, en **phpPgAdmin** → BD `pandigee_tcgerp` → SQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

Si falla por permisos, abre ticket a soporte Bluehost.

Verificación local (con `DATABASE_URL` de Bluehost en `.env` temporal):

```bash
npm run bluehost-db-check
```

---

## Paso 4 — Seed opcional (BD vacía, sin Neon)

Si la BD está vacía y quieres usuario de prueba:

```bash
# Desde SSH en el servidor, dentro del virtualenv Node de cPanel:
source /home/pandigee/nodevenv/public_html/apierp.pandigeektcg.cl/20/bin/activate
cd /home/pandigee/public_html/apierp.pandigeektcg.cl
npm run db:seed
```

Credenciales seed por defecto: `admin` / `password123`

---

## Paso 5 — Smoke test

Desde tu Mac:

```bash
BLUEHOST_API_URL=https://apierp.pandigeektcg.cl npm run bluehost-smoke
```

Pruebas manuales:

- `GET https://apierp.pandigeektcg.cl/health`
- `GET https://apierp.pandigeektcg.cl/api-docs`
- `POST https://apierp.pandigeektcg.cl/api/auth/login`

---

## Paso 6 — Front (cutover)

En el proyecto frontend, actualizar:

```text
VITE_API_BASE_URL=https://apierp.pandigeektcg.cl/api
```

Rebuild y redeploy del front. Confirmar login y CORS (origen `https://pandigeektcg.cl` ya está en `CORS_ALLOWED_ORIGINS`).

Mantener Vercel (`tcgerp-back.vercel.app`) activo 24–48 h como rollback.

---

## Fase 2 — Migrar datos desde Neon (después)

Cuando quieras copiar producción Neon → Bluehost:

```bash
pg_dump "$NEON_DATABASE_URL" --no-owner --no-acl --format=custom -f tcgerp_backup.dump
pg_restore -d "$BLUEHOST_DATABASE_URL" --no-owner --no-acl --clean --if-exists tcgerp_backup.dump
```

Requiere SSH o herramientas `pg_dump`/`pg_restore` desde tu PC con acceso a ambas URLs.

---

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| 502 / app no arranca | Falta `dist/server.js` | Re-deploy; revisar log Passenger en cPanel |
| Error Prisma auth | Usuario/contraseña mal en `DATABASE_URL` | Usar `pandigee_tcgerpUser` y `%2A` para `*` |
| migrate falla en `btree_gist` | Sin extensión | `CREATE EXTENSION` en phpPgAdmin o soporte |
| CORS en front | Origen no listado | Agregar URL exacta en `CORS_ALLOWED_ORIGINS` |
| Build falla en deploy | Sin TypeScript en prod | `.cpanel.yml` usa `npm ci` completo (incluye devDeps para `tsc`) |

### Logs

- cPanel → Setup Node.js App → ruta del **Passenger log**
- O SSH + virtualenv (banner azul en la pantalla de la app Node)

### Rollback

1. Front vuelve a `https://tcgerp-back.vercel.app/api`
2. Rama `main` en Vercel sigue intacta
3. Iteraciones Bluehost solo en rama `Bluehosting`

---

## Flujo diario de actualizaciones

```text
git checkout Bluehosting
# ... cambios ...
git commit -m "..."
git push origin Bluehosting
→ cPanel Git: Deploy HEAD commit
→ Reiniciar app Node si es necesario
→ npm run bluehost-smoke
```
