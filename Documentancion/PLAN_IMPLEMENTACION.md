# 📋 PLAN DE IMPLEMENTACIÓN DETALLADO - API TCG ERP

## 🔍 Análisis Comparativo

### Lo que dije ANTES:
- Lista de módulos con prioridades generales
- Estructura sugerida sin detalle de endpoints

### Lo que veo AHORA (basado en OpenAPI real):
- **116 paths** documentados en `openapi.yaml`
- **~140 endpoints** (algunos paths tienen múltiples métodos)
- Especificación completa con schemas, validaciones, respuestas
- Todos los endpoints están documentados con sus parámetros exactos

### Conclusión:
**TODO** está documentado en `openapi.yaml`. Solo falta imple mentar la lógica siguiendo la especificación.

---

## ✅ ESTADO ACTUAL

### Implementado (7%):
- ✅ Products: 9 endpoints funcionales
- ✅ Auth: 1 endpoint (login)
- ✅ Infraestructura: Librerías, middlewares, validación, RBAC

### Estructura creada (82%):
- ⚠️ Routers con placeholders para todos los módulos principales
- ⚠️ Falta: DTOs, Services, lógica completa

### Sin estructura (11%):
- ❌ Forecast (17 endpoints)
- ❌ Reports (8 endpoints)  
- ❌ Dashboard (6 endpoints)
- ❌ RRHH Cargos/Parámetros (4 endpoints)
- ❌ Admin Stats (1 endpoint)

---

## 🎯 PLAN DE IMPLEMENTACIÓN - ORDEN PRIORITARIO

### 📌 REGLA DE ORO
Cada módulo sigue este patrón (como Products):
1. **DTOs** (`dto.ts`) - Esquemas Zod desde `validation.json` + `openapi.yaml`
2. **Service** (`service.ts`) - Lógica + Prisma + validaciones de negocio
3. **Router** (`router.ts`) - Endpoints HTTP + middlewares + respuestas

---

## 🚀 MÓDULO 1: CUSTOMERS (Prioridad: ALTA)

### 📝 Endpoints a implementar (7 endpoints):
1. `GET /api/customers` - Listar con filtros/paginación
2. `POST /api/customers` - Crear
3. `GET /api/customers/:id` - Obtener por ID
4. `PUT /api/customers/:id` - Actualizar
5. `DELETE /api/customers/:id` - Eliminar
6. `GET /api/customers/:id/orders` - Órdenes del cliente
7. `GET /api/customers/:id/stats` - Estadísticas

### 📄 Archivos a crear/modificar:

**1. `src/modules/customers/dto.ts`**
```typescript
// Esquemas Zod basados en:
// - validation.json: Customer
// - openapi.yaml: components/schemas (si hay)
// - resources.json: Customer fields
```

**2. `src/modules/customers/service.ts`**
```typescript
// Lógica CRUD con Prisma
// Validación de RUT chileno
// Relación con Orders
// Estadísticas agregadas
```

**3. `src/modules/customers/router.ts`**
```typescript
// Reemplazar placeholder actual
// Montar los 7 endpoints
// Aplicar middlewares (auth, rbac, validation)
```

### ✅ Checklist:
- [ ] DTOs con validación de RUT chileno
- [ ] Service con CRUD completo
- [ ] Endpoint GET /customers con paginación/filtros
- [ ] Endpoint POST /customers
- [ ] Endpoint GET /customers/:id
- [ ] Endpoint PUT /customers/:id
- [ ] Endpoint DELETE /customers/:id (soft delete)
- [ ] Endpoint GET /customers/:id/orders
- [ ] Endpoint GET /customers/:id/stats
- [ ] Validaciones de negocio (email único, RUT único)
- [ ] Manejo de errores según errors.md
- [ ] RBAC configurado

---

## 🚀 MÓDULO 2: ORDERS (Prioridad: ALTA)

### 📝 Endpoints a implementar (6 endpoints):
1. `GET /api/orders` - Listar con filtros complejos
2. `POST /api/orders` - Crear orden
3. `GET /api/orders/:id` - Obtener por ID
4. `PUT /api/orders/:id` - Actualizar
5. `DELETE /api/orders/:id` - Eliminar
6. `GET /api/orders/:id/timeline` - Timeline de eventos

### 📄 Archivos a crear/modificar:

**1. `src/modules/sales/dto.ts`** (agregar esquemas de Orders)
```typescript
// OrderItem, CreateOrderRequest, UpdateOrderRequest
// Validar: total = suma de items, al menos 1 item
```

**2. `src/modules/sales/service.ts`** (agregar lógica de Orders)
```typescript
// CRUD Orders
// Cálculo de totales automático
// Validación de estados
// Timeline de eventos
```

**3. `src/modules/sales/router.ts`** (ya existe, agregar endpoints)
```typescript
// Endpoints bajo /orders
// Estados de orden según máquina de estados
```

### ✅ Checklist:
- [ ] DTOs para Order y OrderItem
- [ ] Service con cálculo de totales
- [ ] Validación: total = suma de items
- [ ] Máquina de estados (pendiente → confirmada → ...)
- [ ] Endpoint GET /orders con filtros complejos
- [ ] Endpoint POST /orders (crear con items)
- [ ] Endpoint GET /orders/:id
- [ ] Endpoint PUT /orders/:id (validar estado)
- [ ] Endpoint DELETE /orders/:id
- [ ] Endpoint GET /orders/:id/timeline
- [ ] Relación con Customer y Products

---

## 🚀 MÓDULO 3: INVENTORY (Prioridad: MEDIA-ALTA)

### 📝 Endpoints a implementar (11 endpoints):
1. `GET /api/inventory` - Listar
2. `GET /api/inventory/:id` - Obtener item
3. `PUT /api/inventory/:id` - Actualizar
4. `GET /api/inventory/stats` - Estadísticas
5. `GET /api/inventory/alerts` - Alertas
6. `GET /api/inventory/low-stock` - Stock bajo
7. `GET /api/inventory/out-of-stock` - Sin stock
8. `PATCH /api/inventory/:id/stock` - Actualizar stock
9. `GET /api/inventory/locations` - Ubicaciones
10. `GET /api/inventory/by-location/:location` - Por ubicación
11. `POST /api/inventory/adjustment` - Ajuste de inventario

### 📄 Archivos:
- `src/modules/inventory/dto.ts`
- `src/modules/inventory/service.ts`
- `src/modules/inventory/router.ts` (ya existe placeholder)

### 📝 Notas:
- Usar modelo `StockByBranch` de Prisma
- Ajustes requieren motivo (validación)

---

## 🚀 MÓDULO 4: RECEPCIONES (Prioridad: MEDIA)

### 📝 Endpoints a implementar (5 endpoints):
1. `GET /api/recepciones` - Listar
2. `POST /api/recepciones` - Crear
3. `GET /api/recepciones/:id` - Obtener
4. `PUT /api/recepciones/:id` - Actualizar
5. `DELETE /api/recepciones/:id` - Eliminar

### 📄 Archivos:
- `src/modules/inventory/dto.ts` (agregar recepciones)
- `src/modules/inventory/service.ts` (agregar recepciones)
- `src/modules/inventory/router.ts` (ya tiene placeholder)

### 📝 Notas:
- Al completar recepción, actualizar stock
- Validar: total = suma de items

---

## 🚀 MÓDULO 5: PROVEEDORES (Prioridad: MEDIA)

### 📝 Endpoints a implementar (5 endpoints):
1. `GET /api/proveedores` - Listar
2. `POST /api/proveedores` - Crear
3. `GET /api/proveedores/:id` - Obtener
4. `PUT /api/proveedores/:id` - Actualizar
5. `DELETE /api/proveedores/:id` - Eliminar

### 📄 Archivos:
- `src/modules/inventory/dto.ts` (agregar proveedores)
- `src/modules/inventory/service.ts` (agregar proveedores)
- `src/modules/inventory/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 6: TRANSFERENCIAS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (5 endpoints):
1. `GET /api/transferencias` - Listar
2. `POST /api/transferencias` - Crear
3. `GET /api/transferencias/:id` - Obtener
4. `PUT /api/transferencias/:id` - Actualizar
5. `DELETE /api/transferencias/:id` - Eliminar

### 📄 Archivos:
- `src/modules/inventory/dto.ts` (agregar transferencias)
- `src/modules/inventory/service.ts` (agregar transferencias)
- `src/modules/inventory/router.ts` (ya tiene placeholder)

### 📝 Validaciones:
- Stock disponible en origen
- No transferir a la misma sucursal
- Al completar, mover stock

---

## 🚀 MÓDULO 7: SALES (Prioridad: MEDIA)

### 📝 Endpoints a implementar (9 endpoints):
1. `GET /api/sales` - Listar
2. `POST /api/sales` - Crear venta
3. `GET /api/sales/:id` - Obtener
4. `PUT /api/sales/:id` - Actualizar
5. `DELETE /api/sales/:id` - Eliminar
6. `GET /api/sales/stats` - Estadísticas
7. `GET /api/sales/monthly` - Mensuales
8. `GET /api/sales/recent` - Recientes
9. `GET /api/sales/top-customers` - Top clientes
10. `PATCH /api/sales/:id/status` - Actualizar estado

### 📄 Archivos:
- `src/modules/sales/dto.ts` (agregar sales)
- `src/modules/sales/service.ts` (agregar sales)
- `src/modules/sales/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 8: ADMIN - SUCURSALES (Prioridad: MEDIA)

### 📝 Endpoints a implementar (5 endpoints):
1. `GET /api/admin/branches` - Listar
2. `POST /api/admin/branches` - Crear
3. `GET /api/admin/branches/:id` - Obtener
4. `PUT /api/admin/branches/:id` - Actualizar
5. `DELETE /api/admin/branches/:id` - Eliminar

### 📄 Archivos:
- `src/modules/admin/dto.ts` (agregar branches)
- `src/modules/admin/service.ts` (agregar branches)
- `src/modules/admin/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 9: ADMIN - USUARIOS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (5 endpoints):
1. `GET /api/admin/users` - Listar
2. `POST /api/admin/users` - Crear
3. `GET /api/admin/users/:id` - Obtener
4. `PUT /api/admin/users/:id` - Actualizar
5. `DELETE /api/admin/users/:id` - Eliminar

### 📄 Archivos:
- `src/modules/admin/dto.ts` (agregar users)
- `src/modules/admin/service.ts` (agregar users con hash passwords)
- `src/modules/admin/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 10: ADMIN - ROLES Y PERMISOS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (7 endpoints):
1. `GET /api/admin/roles` - Listar roles
2. `POST /api/admin/roles` - Crear rol
3. `GET /api/admin/roles/:id` - Obtener rol
4. `PUT /api/admin/roles/:id` - Actualizar rol
5. `DELETE /api/admin/roles/:id` - Eliminar rol
6. `PUT /api/admin/roles/:id/permissions` - Actualizar permisos
7. `GET /api/admin/permissions` - Listar permisos

### 📄 Archivos:
- `src/modules/admin/dto.ts` (agregar roles/permisos)
- `src/modules/admin/service.ts` (gestión de permisos)
- `src/modules/admin/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 11: ADMIN - CONFIGURACIONES (Prioridad: BAJA)

### 📝 Endpoints a implementar (4 endpoints):
1. `GET /api/admin/settings` - Listar
2. `GET /api/admin/settings/:id` - Obtener
3. `PUT /api/admin/settings/:id` - Actualizar
4. `GET /api/admin/stats` - Estadísticas admin

### 📄 Archivos:
- `src/modules/admin/dto.ts` (agregar settings)
- `src/modules/admin/service.ts` (agregar settings)
- `src/modules/admin/router.ts` (agregar endpoints)

---

## 🚀 MÓDULO 12: RRHH - EMPLEADOS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (6 endpoints):
1. `GET /api/hr/employees` - Listar
2. `POST /api/hr/employees` - Crear
3. `GET /api/hr/employees/:id` - Obtener
4. `PUT /api/hr/employees/:id` - Actualizar
5. `DELETE /api/hr/employees/:id` - Eliminar
6. `GET /api/hr/employees/estadisticas` - Estadísticas

### 📄 Archivos:
- `src/modules/hr/dto.ts` (agregar employees)
- `src/modules/hr/service.ts` (agregar employees)
- `src/modules/hr/router.ts` (ya tiene placeholder)

### 📝 Validaciones:
- RUT chileno único
- Email único

---

## 🚀 MÓDULO 13: RRHH - CONTRATOS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (6 endpoints):
1. `GET /api/hr/contracts` - Listar
2. `POST /api/hr/contracts` - Crear
3. `GET /api/hr/contracts/:id` - Obtener
4. `PUT /api/hr/contracts/:id` - Actualizar
5. `GET /api/hr/contracts/empleado/:empleadoId` - Por empleado
6. `PUT /api/hr/contracts/:id/terminar` - Terminar contrato

### 📄 Archivos:
- `src/modules/hr/dto.ts` (agregar contracts)
- `src/modules/hr/service.ts` (agregar contracts)
- `src/modules/hr/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 14: RRHH - NÓMINA (Prioridad: MEDIA)

### 📝 Endpoints a implementar (9 endpoints):
1. `GET /api/hr/payroll` - Listar
2. `POST /api/hr/payroll` - Generar
3. `GET /api/hr/payroll/:id` - Obtener
4. `GET /api/hr/payroll/periodo/:periodo` - Por período
5. `POST /api/hr/payroll/generar` - Generar para período
6. `PUT /api/hr/payroll/procesar` - Procesar
7. `POST /api/hr/payroll/calcular` - Calcular
8. `GET /api/hr/payroll/resumen/:periodo` - Resumen
9. `POST /api/hr/payroll/exportar` - Exportar

### 📄 Archivos:
- `src/modules/hr/dto.ts` (agregar payroll)
- `src/modules/hr/service.ts` (lógica compleja de nómina)
- `src/modules/hr/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 15: RRHH - IMPOSICIONES (Prioridad: MEDIA)

### 📝 Endpoints a implementar (6 endpoints):
1. `GET /api/hr/contributions` - Listar
2. `POST /api/hr/contributions` - Generar
3. `GET /api/hr/contributions/:id` - Obtener
4. `GET /api/hr/contributions/periodo/:periodo` - Por período
5. `POST /api/hr/contributions/generar` - Generar para período
6. `POST /api/hr/contributions/exportar` - Exportar

### 📄 Archivos:
- `src/modules/hr/dto.ts` (agregar contributions)
- `src/modules/hr/service.ts` (agregar contributions)
- `src/modules/hr/router.ts` (ya tiene placeholder)

---

## 🚀 MÓDULO 16: RRHH - CARGOS Y PARÁMETROS (Prioridad: BAJA)

### 📝 Endpoints a implementar (4 endpoints):
1. `GET /api/hr/positions` - Listar cargos
2. `GET /api/hr/positions/:id` - Obtener cargo
3. `GET /api/hr/parametros/calculo` - Obtener parámetros
4. `PUT /api/hr/parametros/calculo` - Actualizar parámetros

### 📄 Archivos:
- Agregar a `src/modules/hr/router.ts` (crear endpoints nuevos)

---

## 🚀 MÓDULO 17: ACCOUNTING - CUENTAS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (7 endpoints):
1. `GET /api/accounting/accounts` - Listar
2. `POST /api/accounting/accounts` - Crear
3. `GET /api/accounting/accounts/:id` - Obtener
4. `PUT /api/accounting/accounts/:id` - Actualizar
5. `DELETE /api/accounting/accounts/:id` - Eliminar
6. `GET /api/accounting/accounts/tree` - Árbol jerárquico
7. `GET /api/accounting/accounts/:id/children` - Hijos

### 📄 Archivos:
- `src/modules/accounting/dto.ts` (agregar accounts)
- `src/modules/accounting/service.ts` (árbol jerárquico)
- `src/modules/accounting/router.ts` (ya tiene placeholder)

### 📝 Validaciones:
- Código único
- Jerarquía: nivel hijo > nivel padre
- No eliminar cuenta con movimientos

---

## 🚀 MÓDULO 18: ACCOUNTING - ASIENTOS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (8 endpoints):
1. `GET /api/accounting/entries` - Listar
2. `POST /api/accounting/entries` - Crear
3. `GET /api/accounting/entries/:id` - Obtener
4. `PUT /api/accounting/entries/:id` - Actualizar
5. `DELETE /api/accounting/entries/:id` - Eliminar
6. `POST /api/accounting/entries/:id/approve` - Aprobar
7. `POST /api/accounting/entries/:id/contabilize` - Contabilizar
8. `POST /api/accounting/entries/:id/cancel` - Cancelar

### 📄 Archivos:
- `src/modules/accounting/dto.ts` (agregar entries)
- `src/modules/accounting/service.ts` (lógica de asientos)
- `src/modules/accounting/router.ts` (ya tiene placeholder)

### 📝 Validaciones:
- Debe = Haber
- Al menos 2 movimientos
- Máquina de estados (borrador → aprobado → contabilizado)

---

## 🚀 MÓDULO 19: ACCOUNTING - LIBRO MAYOR E IVA (Prioridad: MEDIA)

### 📝 Endpoints a implementar (9 endpoints):
1. `GET /api/accounting/ledger` - Libro mayor
2. `GET /api/accounting/ledger/account/:id` - Por cuenta
3. `GET /api/accounting/ledger/export` - Exportar
4. `GET /api/accounting/tax-books` - Libro IVA
5. `GET /api/accounting/tax-books/period/:periodo` - Por período
6. `GET /api/accounting/tax-books/stats` - Estadísticas
7. `GET /api/accounting/tax-books/export` - Exportar
8. `GET /api/accounting/stats/general` - Estadísticas generales
9. `GET /api/accounting/stats/period/:periodo` - Por período

### 📄 Archivos:
- `src/modules/accounting/service.ts` (agregar ledger y tax-books)
- `src/modules/accounting/router.ts` (agregar endpoints)

---

## 🚀 MÓDULO 20: DASHBOARD (Prioridad: MEDIA)

### 📝 Endpoints a implementar (6 endpoints):
1. `GET /api/dashboard/stats` - Estadísticas
2. `GET /api/dashboard/charts` - Datos para gráficos
3. `GET /api/charts/monthly-sales` - Ventas mensuales
4. `GET /api/charts/categories` - Datos de categorías
5. `GET /api/charts/stock` - Datos de stock
6. `GET /api/charts/trends` - Datos de tendencias

### 📄 Archivos a crear:
- `src/modules/dashboard/router.ts` - Nuevo router
- `src/modules/dashboard/service.ts` - Nuevo service

### 📄 Modificar:
- `src/routes.ts` - Agregar route para dashboard

---

## 🚀 MÓDULO 21: REPORTS (Prioridad: MEDIA)

### 📝 Endpoints a implementar (8 endpoints):
1. `GET /api/reports` - Listar reportes
2. `POST /api/reports` - Generar reporte
3. `GET /api/reports/:id` - Obtener reporte
4. `DELETE /api/reports/:id` - Eliminar
5. `GET /api/reports/types` - Tipos disponibles
6. `GET /api/reports/stats` - Estadísticas
7. `GET /api/reports/recent` - Recientes
8. `GET /api/reports/export/:id` - Exportar

### 📄 Archivos a crear:
- `src/modules/reports/router.ts` - Nuevo router
- `src/modules/reports/service.ts` - Nuevo service
- `src/modules/reports/dto.ts` - Nuevos DTOs

### 📄 Modificar:
- `src/routes.ts` - Agregar route para reports

---

## 🚀 MÓDULO 22: FORECAST (Prioridad: BAJA - Más complejo)

### 📝 Endpoints a implementar (17 endpoints):
1. `POST /api/forecast/calculate` - Calcular forecast
2. `GET /api/forecast/kpis` - KPIs
3. `POST /api/forecast/productos-top` - Productos top
4. `POST /api/forecast/sets-top` - Sets top
5. `POST /api/forecast/grafico` - Datos para gráficos
6. `POST /api/forecast/comparar-metodos` - Comparar métodos
7. `GET /api/forecast/alertas` - Alertas
8. `GET /api/forecast/estado` - Estado
9. `GET /api/forecast/configuracion` - Listar configuraciones
10. `POST /api/forecast/configuracion` - Guardar configuración
11. `PUT /api/forecast/configuracion/:id` - Actualizar
12. `DELETE /api/forecast/configuracion/:id` - Eliminar
13. `GET /api/forecast/historial` - Historial
14. `POST /api/forecast/exportar` - Exportar
15. `GET /api/forecast/datos-historicos` - Datos históricos
16. `POST /api/forecast/validar-configuracion` - Validar
17. `GET /api/forecast/recomendaciones` - Recomendaciones
18. `POST /api/forecast/metricas` - Calcular métricas

### 📄 Archivos a crear:
- `src/modules/forecast/router.ts` - Nuevo router
- `src/modules/forecast/service.ts` - Nuevo service (lógica de ML/estadística)
- `src/modules/forecast/dto.ts` - Nuevos DTOs

### 📄 Modificar:
- `src/routes.ts` - Agregar route para forecast

---

## 📊 RESUMEN POR MÓDULO

| # | Módulo | Endpoints | Estado | Prioridad | Archivos Necesarios |
|---|--------|-----------|--------|-----------|---------------------|
| 1 | Customers | 7 | ⚠️ Placeholder | ALTA | dto.ts, service.ts, router.ts |
| 2 | Orders | 6 | ⚠️ Placeholder | ALTA | dto.ts (agregar), service.ts (agregar), router.ts |
| 3 | Inventory | 11 | ⚠️ Placeholder | MEDIA-ALTA | dto.ts, service.ts, router.ts |
| 4 | Recepciones | 5 | ⚠️ Placeholder | MEDIA | (mismo que inventory) |
| 5 | Proveedores | 5 | ⚠️ Placeholder | MEDIA | (mismo que inventory) |
| 6 | Transferencias | 5 | ⚠️ Placeholder | MEDIA | (mismo que inventory) |
| 7 | Sales | 10 | ⚠️ Placeholder | MEDIA | dto.ts (agregar), service.ts (agregar), router.ts |
| 8 | Admin - Branches | 5 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 9 | Admin - Users | 5 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 10 | Admin - Roles | 7 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 11 | Admin - Settings | 4 | ⚠️ Placeholder | BAJA | dto.ts, service.ts, router.ts |
| 12 | RRHH - Employees | 6 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 13 | RRHH - Contracts | 6 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 14 | RRHH - Payroll | 9 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 15 | RRHH - Contributions | 6 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 16 | RRHH - Positions/Params | 4 | ❌ Faltante | BAJA | router.ts (agregar) |
| 17 | Accounting - Accounts | 7 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 18 | Accounting - Entries | 8 | ⚠️ Placeholder | MEDIA | dto.ts, service.ts, router.ts |
| 19 | Accounting - Ledger/IVA | 9 | ⚠️ Placeholder | MEDIA | service.ts, router.ts |
| 20 | Dashboard | 6 | ❌ Faltante | MEDIA | router.ts, service.ts (nuevos) |
| 21 | Reports | 8 | ❌ Faltante | MEDIA | router.ts, service.ts, dto.ts (nuevos) |
| 22 | Forecast | 18 | ❌ Faltante | BAJA | router.ts, service.ts, dto.ts (nuevos) |

---

## 🎯 ORDEN DE IMPLEMENTACIÓN SUGERIDO

### Sprint 1: Core Business (Prioridad Alta)
1. ✅ **Customers** (7 endpoints) - Base para orders
2. ✅ **Orders** (6 endpoints) - Core del negocio

### Sprint 2: Inventory Management (Prioridad Media-Alta)
3. ✅ **Inventory básico** (11 endpoints)
4. ✅ **Proveedores** (5 endpoints)
5. ✅ **Recepciones** (5 endpoints)
6. ✅ **Transferencias** (5 endpoints)

### Sprint 3: Operations
7. ✅ **Sales** (10 endpoints)

### Sprint 4: Administration
8. ✅ **Admin - Branches** (5 endpoints)
9. ✅ **Admin - Users** (5 endpoints)
10. ✅ **Admin - Roles/Permissions** (7 endpoints)
11. ✅ **Admin - Settings/Stats** (5 endpoints)

### Sprint 5: HR
12. ✅ **RRHH - Employees** (6 endpoints)
13. ✅ **RRHH - Contracts** (6 endpoints)
14. ✅ **RRHH - Payroll** (9 endpoints)
15. ✅ **RRHH - Contributions** (6 endpoints)
16. ✅ **RRHH - Positions/Params** (4 endpoints)

### Sprint 6: Accounting
17. ✅ **Accounting - Accounts** (7 endpoints)
18. ✅ **Accounting - Entries** (8 endpoints)
19. ✅ **Accounting - Ledger/IVA** (9 endpoints)

### Sprint 7: Analytics
20. ✅ **Dashboard** (6 endpoints)
21. ✅ **Reports** (8 endpoints)
22. ✅ **Forecast** (18 endpoints) - Más complejo, puede requerir ML

---

## ✅ CHECKLIST POR MÓDULO

Para cada módulo implementar:

### Fase 1: DTOs
- [ ] Leer `validation.json` para el recurso
- [ ] Leer `openapi.yaml` para schemas exactos
- [ ] Crear esquemas Zod en `dto.ts`
- [ ] Validaciones especiales (RUT, debe=haber, etc.)

### Fase 2: Service
- [ ] Leer `resources.json` para campos y relaciones
- [ ] Implementar CRUD con Prisma
- [ ] Validaciones de negocio desde `businessRules`
- [ ] Manejo de errores según `errors.md`
- [ ] Paginación y filtros según `filters-and-pagination.md`

### Fase 3: Router
- [ ] Revisar paths exactos en `openapi.yaml`
- [ ] Implementar todos los endpoints del módulo
- [ ] Aplicar middlewares (auth, rbac, validation)
- [ ] Formatear respuestas con mapper
- [ ] Códigos de error correctos

### Fase 4: Verificación
- [ ] Todos los endpoints del OpenAPI están implementados
- [ ] Validaciones coinciden con especificación
- [ ] RBAC configurado según `rbac.json`
- [ ] Errores según `errors.md`
- [ ] Probar endpoints en Swagger UI

---

## 📝 PRÓXIMOS PASOS INMEDIATOS

**Empezar con Módulo 1: Customers**

¿Procedo a implementar Customers ahora? Sigue el patrón de Products y es la base para Orders.

