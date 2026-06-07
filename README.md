# TCG ERP API

API Node.js + TypeScript con Hono, Prisma y PostgreSQL para el sistema TCG ERP.

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 20.x
- pnpm (o npm)
- PostgreSQL (o Vercel Postgres/Neon)

### Instalación

```bash
# Instalar dependencias
pnpm install

# Generar cliente Prisma
pnpm prisma:generate

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de base de datos
```

### Base de Datos

```bash
# Crear migraciones
pnpm prisma:migrate

# Cargar datos de ejemplo
pnpm db:seed
```

### Desarrollo

```bash
# Iniciar servidor de desarrollo
pnpm dev
```

El servidor estará disponible en `http://localhost:3001`

## 📁 Estructura del Proyecto

```
back/
├── api/                    # Adaptador Vercel
│   └── [[...hono]].ts
├── prisma/                 # Prisma ORM
│   ├── schema.prisma       # Esquema de base de datos
│   ├── migrations/         # Migraciones
│   └── seed.ts            # Datos de ejemplo
├── src/
│   ├── lib/               # Librerías base
│   │   ├── db.ts          # Cliente Prisma
│   │   ├── env.ts         # Variables de entorno
│   │   ├── logger.ts      # Logger
│   │   ├── errors.ts      # Manejo de errores
│   │   ├── responses.ts   # Helpers de respuesta
│   │   ├── pagination.ts  # Paginación
│   │   ├── auth.ts        # JWT auth
│   │   ├── rbac.ts        # Control de acceso
│   │   ├── validation.ts  # Validación Zod
│   │   └── mapper.ts      # Mapeo de datos
│   ├── middlewares/       # Middlewares
│   │   ├── error-handler.ts
│   │   ├── auth-jwt.ts
│   │   ├── rbac-guard.ts
│   │   ├── cors.ts
│   │   └── request-logger.ts
│   ├── modules/           # Módulos por dominio
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── sales/
│   │   ├── customers/
│   │   ├── accounting/
│   │   ├── hr/
│   │   ├── admin/
│   │   └── auth/
│   ├── app.ts             # App principal
│   ├── server.ts          # Servidor (solo dev)
│   └── routes.ts          # Montaje de rutas
├── api-spec/              # Especificaciones
│   ├── openapi.yaml
│   ├── resources.json
│   ├── validation.json
│   ├── rbac.json
│   └── seeds.json
├── package.json
├── tsconfig.json
└── vercel.json
```

## 🔧 Scripts Disponibles

- `pnpm dev` - Servidor de desarrollo con hot-reload
- `pnpm build` - Compilar TypeScript
- `pnpm start` - Iniciar servidor en producción
- `pnpm prisma:generate` - Generar cliente Prisma
- `pnpm prisma:migrate` - Ejecutar migraciones
- `pnpm db:seed` - Cargar datos de ejemplo
- `pnpm vercel-build` - Build para Vercel
- `pnpm vercel-smoke` - Smoke test post-deploy Vercel
- `pnpm bluehost-build` - Build para Bluehost (cPanel)
- `pnpm bluehost-deploy` - Migraciones en producción Bluehost
- `pnpm bluehost-smoke` - Smoke test contra `apierp.pandigeektcg.cl`
- `pnpm bluehost-db-check` - Verificar PostgreSQL y extensión `btree_gist`
- `pnpm typecheck` - Verificar tipos TypeScript

## 🌐 Despliegue en Vercel

### Configuración

1. Conectar repositorio a Vercel
2. Configurar variables de entorno:
   - `DATABASE_URL` - URL de conexión a PostgreSQL
   - `JWT_SECRET` - Secreto para JWT
   - `NODE_ENV` - `production`

3. Build Command: `pnpm vercel-build`
4. Output Directory: `dist` (o dejar vacío)
5. Install Command: `pnpm install`

### Variables de Entorno en Vercel

```bash
DATABASE_URL=postgres://user:password@host:port/db
JWT_SECRET=tu_secreto_seguro_aqui
NODE_ENV=production
```

## 🌐 Despliegue en Bluehost (rama `Bluehosting`)

Producción paralela en `https://apierp.pandigeektcg.cl` con Node.js App + PostgreSQL en cPanel. La rama `main` sigue en Vercel/Neon hasta validar el cutover.

Guía completa: **[DEPLOY_BLUEHOST.md](./DEPLOY_BLUEHOST.md)**

```bash
# Tras deploy en cPanel
BLUEHOST_API_URL=https://apierp.pandigeektcg.cl npm run bluehost-smoke
```

Front en cutover: `VITE_API_BASE_URL=https://apierp.pandigeektcg.cl/api`

## 📚 Endpoints Principales

### Documentación

- `GET /api-docs` - **Swagger UI** - Documentación interactiva de la API
- `GET /api-docs/openapi.json` - Especificación OpenAPI en JSON
- `GET /api-docs/openapi.yaml` - Especificación OpenAPI en YAML

### Autenticación

- `POST /api/auth/login` - Iniciar sesión

### Productos

- `GET /api/products` - Listar productos (con paginación, filtros)
- `POST /api/products` - Crear producto
- `GET /api/products/:id` - Obtener producto
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto
- `PATCH /api/products/:id/stock` - Actualizar stock
- `GET /api/products/stats` - Estadísticas
- `GET /api/products/categories` - Categorías
- `GET /api/products/low-stock` - Productos con stock bajo

### Otros Módulos

- `/api/inventory` - Inventario
- `/api/sales` - Ventas
- `/api/orders` - Órdenes
- `/api/customers` - Clientes
- `/api/accounting` - Contabilidad
- `/api/hr` - Recursos Humanos
- `/api/admin` - Administración

## 🔐 Autenticación

La API usa JWT Bearer tokens. Incluir en el header:

```
Authorization: Bearer <token>
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

## 📖 Especificaciones

Todas las especificaciones están en `/api-spec`:

- `openapi.yaml` - Especificación OpenAPI 3.1 (~140 endpoints)
- `resources.json` - Catálogo de recursos
- `validation.json` - Reglas de validación
- `rbac.json` - Control de acceso basado en roles
- `seeds.json` - Datos de ejemplo
- `filters-and-pagination.md` - Convenciones de paginación
- `errors.md` - Catálogo de errores
- `conventions.md` - Estándares de la API

## 🛠️ Tecnologías

- **Hono** - Framework web rápido
- **Prisma** - ORM para PostgreSQL
- **TypeScript** - Tipado estático
- **Zod** - Validación de esquemas
- **JWT** - Autenticación
- **PostgreSQL** - Base de datos

## 📝 Notas

- Los precios se manejan en centavos CLP (enteros)
- Las fechas están en formato ISO 8601 UTC
- Los IDs son UUIDs v4 (excepto productos que usan integer legacy)
- La paginación es 1-based (página 1, 2, 3...)
- Tamaño de página por defecto: 25, máximo: 100

## 🐛 Troubleshooting

### Error de conexión a base de datos

Verificar que `DATABASE_URL` esté correctamente configurada en `.env`

### Error de migraciones

```bash
pnpm prisma migrate reset  # Resetear base de datos
pnpm prisma migrate dev    # Crear nuevas migraciones
```

### Error de tipos TypeScript

```bash
pnpm prisma:generate  # Regenerar cliente Prisma
pnpm typecheck        # Verificar tipos
```

## 📄 Licencia

ISC

