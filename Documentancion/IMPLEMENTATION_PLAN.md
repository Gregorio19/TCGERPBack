# Plan de Implementación - API TCG ERP

## 📋 Análisis: Estado Actual vs Plan Anterior

### ✅ Lo que YA está implementado (base sólida):
1. **Infraestructura completa**: Librerías, middlewares, validación, paginación, RBAC
2. **Products**: 100% funcional (9 endpoints) - Patrón de referencia
3. **Auth**: Login funcional con JWT

### ⚠️ Lo que tiene estructura pero falta implementar:
- Routers creados con placeholders
- Necesitan: DTOs + Services + Lógica completa

### ❌ Lo que falta crear:
- Routers para Forecast, Reports, Dashboard
- Endpoints de RRHH Cargos y Parámetros
- Endpoint Admin Stats

---

## 🎯 PLAN DE IMPLEMENTACIÓN - Orden por Prioridad y Dependencias

### REGLA: Cada módulo sigue el patrón de Products:
1. **DTOs** (validación Zod desde `validation.json` y `openapi.yaml`)
2. **Service** (lógica + Prisma + validaciones de negocio)
3. **Router** (endpoints HTTP + middlewares + respuestas) 

---

## 📦 FASE 1: CRUD BÁSICO (Alta Prioridad - Dependencias del Frontend)

### ✅ Módulo 1: Customers
**Razón**: Necesario para Orders y Sales. El frontend lo usa frecuentemente.

**Endpoints del OpenAPI**:
- `GET /api/customers` - Listar con paginación/filtros
- `POST /api/customers` - Crear cliente
- `GET /api/customers/:id` - Obtener por ID
- `PUT /api/customers/:id` - Actualizar
- `DELETE /api/customers/:id` - Eliminar
- `GET /api/customers/:id/orders` - Órdenes del cliente
- `GET /api/customers/:id/stats` - Estadísticas del cliente

**Archivos a crear/modificar**:
- `src/modules/customers/dto.ts` - Esquemas Zod (validar RUT chileno)
- `src/modules/customers/service.ts` - Lógica CRUD + relación con orders
- `src/modules/customers/router.ts` - Reemplazar placeholder

**Validaciones especiales**:
- RUT chileno con dígito verificador (desde `validation.json`)
- Email único
- Validación de teléfono chileno

---

### ✅ Módulo 2: Orders
**Razón**: Core del negocio. Usa Customers y Products.

**Endpoints del OpenAPI**:
- `GET /api/orders` - Listar con paginación/filtros complejos
- `POST /api/orders` - Crear orden
- `GET /api/orders/:id` - Obtener por ID
- `PUT /api/orders/:id` - Actualizar
- `DELETE /api/orders/:id` - Eliminar
- `GET /api/orders/:id/timeline` - Timeline de eventos

**Archivos a crear/modificar**:
- `src/modules/sales/dto.ts` - Esquemas para Orders (OrderItem, etc.)
- `src/modules/sales/service.ts` - CRUD + cálculo de totales + estados
- `src/modules/sales/router.ts` - Implementar endpoints de orders

**Validaciones especiales**:
- Total = suma de items
- Al menos 1 item
- Estados válidos según máquina de estados
- No modificar orden procesada

---

### ✅ Módulo 3: Inventory (Stock básico)
**Razón**: Necesario para recepciones y transferencias.

**Endpoints prioritarios del OpenAPI**:
- `GET /api/inventory` - Listar inventario
- `GET /api/inventory/:id` - Obtener item
- `PATCH /api/inventory/:id/stock` - Actualizar stock
- `GET /api/inventory/low-stock` - Stock bajo
- `GET /api/inventory/out-of-stock` - Sin stock
- `POST /api/inventory/adjustment` - Ajuste de inventario

**Archivos a crear/modificar**:
- `src/modules/inventory/dto.ts` - Esquemas para ajustes, filtros
- `src/modules/inventory/service.ts` - Gestión de stock por sucursal
- `src/modules/inventory/router.ts` - Endpoints básicos

**Nota**: Usar modelo `StockByBranch` de Prisma

---

## 📦 FASE 2: OPERACIONES DE INVENTARIO

### ✅ Módulo 4: Recepciones
**Razón**: Recibe productos de proveedores. Usa Inventory y Suppliers.

**Endpoints del OpenAPI**:
- `GET /api/recepciones` - Listar
- `POST /api/recepciones` - Crear recepción
- `GET /api/recepciones/:id` - Obtener
- `PUT /api/recepciones/:id` - Actualizar
- `DELETE /api/recepciones/:id` - Eliminar

**Archivos**:
- `src/modules/inventory/dto.ts` - Agregar esquemas de recepción
- `src/modules/inventory/service.ts` - Lógica de recepciones
- `src/modules/inventory/router.ts` - Endpoints `/recepciones`

**Validaciones**:
- Actualizar stock al completar recepción
- Total = suma de items

---

### ✅ Módulo 5: Proveedores
**Razón**: Necesario para recepciones.

**Endpoints del OpenAPI**:
- `GET /api/proveedores` - Listar
- `POST /api/proveedores` - Crear
- `GET /api/proveedores/:id` - Obtener
- `PUT /api/proveedores/:id` - Actualizar
- `DELETE /api/proveedores/:id` - Eliminar

**Archivos**:
- `src/modules/inventory/dto.ts` - Esquemas de proveedor
- `src/modules/inventory/service.ts` - CRUD proveedores
- `src/modules/inventory/router.ts` - Endpoints `/proveedores`

---

### ✅ Módulo 6: Transferencias
**Razón**: Transferir stock entre sucursales.

**Endpoints del OpenAPI**:
- `GET /api/transferencias` - Listar
- `POST /api/transferencias` - Crear
- `GET /api/transferencias/:id` - Obtener
- `PUT /api/transferencias/:id` - Actualizar
- `DELETE /api/transferencias/:id` - Eliminar

**Archivos**:
- `src/modules/inventory/dto.ts` - Esquemas de transferencia
- `src/modules/inventory/service.ts` - Lógica de transferencias
- `src/modules/inventory/router.ts` - Endpoints `/transferencias`

**Validaciones**:
- Stock disponible en origen
- No transferir a la misma sucursal

---

### ✅ Módulo 7: Sales
**Razón**: Ventas directas (POS). Similar a Orders pero más simple.

**Endpoints del OpenAPI**:
- `GET /api/sales` - Listar ventas
- `POST /api/sales` - Crear venta
- `GET /api/sales/:id` - Obtener
- `PUT /api/sales/:id` - Actualizar
- `DELETE /api/sales/:id` - Eliminar
- `GET /api/sales/stats` - Estadísticas
- `GET /api/sales/monthly` - Ventas mensuales
- `GET /api/sales/recent` - Recientes
- `GET /api/sales/top-customers` - Top clientes
- `PATCH /api/sales/:id/status` - Actualizar estado

**Archivos**:
- `src/modules/sales/dto.ts` - Esquemas de sales
- `src/modules/sales/service.ts` - Lógica de ventas
- `src/modules/sales/router.ts` - Endpoints `/sales`

---

## 📦 FASE 3: ADMINISTRACIÓN

### ✅ Módulo 8: Admin - Sucursales
**Razón**: Base para otros módulos.

**Endpoints del OpenAPI**:
- `GET /api/admin/branches` - Listar
- `POST /api/admin/branches` - Crear
- `GET /api/admin/branches/:id` - Obtener
- `PUT /api/admin/branches/:id` - Actualizar
- `DELETE /api/admin/branches/:id` - Eliminar

**Archivos**:
- `src/modules/admin/dto.ts` - Esquemas de branches
- `src/modules/admin/service.ts` - CRUD branches
- `src/modules/admin/router.ts` - Endpoints `/admin/branches`

---

### ✅ Módulo 9: Admin - Usuarios
**Razón**: Gestión de usuarios del sistema.

**Endpoints del OpenAPI**:
- `GET /api/admin/users` - Listar
- `POST /api/admin/users` - Crear
- `GET /api/admin/users/:id` - Obtener
- `PUT /api/admin/users/:id` - Actualizar
- `DELETE /api/admin/users/:id` - Eliminar

**Archivos**:
- `src/modules/admin/dto.ts` - Esquemas de usuarios
- `src/modules/admin/service.ts` - CRUD usuarios (hash passwords)
- `src/modules/admin/router.ts` - Endpoints `/admin/users`

---

### ✅ Módulo 10: Admin - Roles y Permisos
**Razón**: RBAC completo.

**Endpoints del OpenAPI**:
- `GET /api/admin/roles` - Listar roles
- `POST /api/admin/roles` - Crear rol
- `GET /api/admin/roles/:id` - Obtener rol
- `PUT /api/admin/roles/:id` - Actualizar rol
- `DELETE /api/admin/roles/:id` - Eliminar rol
- `PUT /api/admin/roles/:id/permissions` - Actualizar permisos
- `GET /api/admin/permissions` - Listar permisos

**Archivos**:
- `src/modules/admin/dto.ts` - Esquemas de roles/permisos
- `src/modules/admin/service.ts` - Gestión de roles y permisos
- `src/modules/admin/router.ts` - Endpoints `/admin/roles`, `/admin/permissions`

---

### ✅ Módulo 11: Admin - Configuraciones
**Endpoints del OpenAPI**:
- `GET /api/admin/settings` - Listar
- `GET /api/admin/settings/:id` - Obtener
- `PUT /api/admin/settings/:id` - Actualizar
- `GET /api/admin/stats` - Estadísticas admin

**Archivos**:
- `src/modules/admin/service.ts` - CRUD settings
- `src/modules/admin/router.ts` - Endpoints `/admin/settings`, `/admin/stats`

---

## 📦 FASE 4: RRHH

### ✅ Módulo 12: RRHH - Empleados
**Endpoints del OpenAPI**:
- `GET /api/hr/employees` - Listar
- `POST /api/hr/employees` - Crear
- `GET /api/hr/employees/:id` - Obtener
- `PUT /api/hr/employees/:id` - Actualizar
- `DELETE /api/hr/employees/:id` - Eliminar
- `GET /api/hr/employees/estadisticas` - Estadísticas

**Archivos**:
- `src/modules/hr/dto.ts` - Esquemas de empleados
- `src/modules/hr/service.ts` - CRUD empleados
- `src/modules/hr/router.ts` - Endpoints `/hr/employees`

---

### ✅ Módulo 13: RRHH - Contratos
**Endpoints del OpenAPI**:
- `GET /api/hr/contracts` - Listar
- `POST /api/hr/contracts` - Crear
- `GET /api/hr/contracts/:id` - Obtener
- `PUT /api/hr/contracts/:id` - Actualizar
- `GET /api/hr/contracts/empleado/:empleadoId` - Por empleado
- `PUT /api/hr/contracts/:id/terminar` - Terminar contrato

**Archivos**:
- `src/modules/hr/dto.ts` - Esquemas de contratos
- `src/modules/hr/service.ts` - Gestión de contratos
- `src/modules/hr/router.ts` - Endpoints `/hr/contracts`

---

### ✅ Módulo 14: RRHH - Nómina
**Endpoints del OpenAPI**:
- `GET /api/hr/payroll` - Listar
- `POST /api/hr/payroll` - Generar
- `GET /api/hr/payroll/:id` - Obtener
- `GET /api/hr/payroll/periodo/:periodo` - Por período
- `POST /api/hr/payroll/generar` - Generar para período
- `PUT /api/hr/payroll/procesar` - Procesar
- `POST /api/hr/payroll/calcular` - Calcular
- `GET /api/hr/payroll/resumen/:periodo` - Resumen
- `POST /api/hr/payroll/exportar` - Exportar

**Archivos**:
- `src/modules/hr/dto.ts` - Esquemas de nómina
- `src/modules/hr/service.ts` - Lógica compleja de nómina
- `src/modules/hr/router.ts` - Endpoints `/hr/payroll`

---

### ✅ Módulo 15: RRHH - Imposiciones
**Endpoints del OpenAPI**:
- `GET /api/hr/contributions` - Listar
- `POST /api/hr/contributions` - Generar
- `GET /api/hr/contributions/:id` - Obtener
- `GET /api/hr/contributions/periodo/:periodo` - Por período
- `POST /api/hr/contributions/generar` - Generar para período
- `POST /api/hr/contributions/exportar` - Exportar

**Archivos**:
- `src/modules/hr/service.ts` - Lógica de imposiciones
- `src/modules/hr/router.ts` - Endpoints `/hr/contributions`

---

### ✅ Módulo 16: RRHH - Cargos y Parámetros
**Endpoints del OpenAPI**:
- `GET /api/hr/positions` - Listar cargos
- `GET /api/hr/positions/:id` - Obtener cargo
- `GET /api/hr/parametros/calculo` - Obtener parámetros
- `PUT /api/hr/parametros/calculo` - Actualizar parámetros

**Archivos**:
- Crear nuevos endpoints en `src/modules/hr/router.ts`

---

## 📦 FASE 5: CONTABILIDAD

### ✅ Módulo 17: Accounting - Cuentas
**Endpoints del OpenAPI**:
- `GET /api/accounting/accounts` - Listar
- `POST /api/accounting/accounts` - Crear
- `GET /api/accounting/accounts/:id` - Obtener
- `PUT /api/accounting/accounts/:id` - Actualizar
- `DELETE /api/accounting/accounts/:id` - Eliminar
- `GET /api/accounting/accounts/tree` - Árbol jerárquico
- `GET /api/accounting/accounts/:id/children` - Hijos

**Validaciones especiales**:
- Jerarquía de cuentas (nivel hijo > nivel padre)
- Código único

---

### ✅ Módulo 18: Accounting - Asientos
**Endpoints del OpenAPI**:
- `GET /api/accounting/entries` - Listar
- `POST /api/accounting/entries` - Crear
- `GET /api/accounting/entries/:id` - Obtener
- `PUT /api/accounting/entries/:id` - Actualizar
- `DELETE /api/accounting/entries/:id` - Eliminar
- `POST /api/accounting/entries/:id/approve` - Aprobar
- `POST /api/accounting/entries/:id/contabilize` - Contabilizar
- `POST /api/accounting/entries/:id/cancel` - Cancelar

**Validaciones especiales**:
- Debe = Haber
- Al menos 2 movimientos
- Máquina de estados

---

### ✅ Módulo 19: Accounting - Libro Mayor e IVA
**Endpoints del OpenAPI**:
- `GET /api/accounting/ledger` - Libro mayor
- `GET /api/accounting/ledger/account/:id` - Por cuenta
- `GET /api/accounting/ledger/export` - Exportar
- `GET /api/accounting/tax-books` - Libro IVA
- `GET /api/accounting/tax-books/period/:periodo` - Por período
- `GET /api/accounting/tax-books/stats` - Estadísticas
- `GET /api/accounting/tax-books/export` - Exportar
- `GET /api/accounting/stats/general` - Estadísticas generales
- `GET /api/accounting/stats/period/:periodo` - Por período

---

## 📦 FASE 6: REPORTES Y ANALYTICS

### ✅ Módulo 20: Dashboard
**Endpoints del OpenAPI**:
- `GET /api/dashboard/stats` - Estadísticas
- `GET /api/dashboard/charts` - Datos para gráficos
- `GET /api/charts/monthly-sales` - Ventas mensuales
- `GET /api/charts/categories` - Datos de categorías
- `GET /api/charts/stock` - Datos de stock
- `GET /api/charts/trends` - Datos de tendencias

**Archivos a crear**:
- `src/modules/dashboard/router.ts` - Nuevo router
- `src/modules/dashboard/service.ts` - Agregaciones y consultas

---

### ✅ Módulo 21: Reports
**Endpoints del OpenAPI**:
- `GET /api/reports` - Listar reportes
- `POST /api/reports` - Generar reporte
- `GET /api/reports/:id` - Obtener reporte
- `DELETE /api/reports/:id` - Eliminar
- `GET /api/reports/types` - Tipos disponibles
- `GET /api/reports/stats` - Estadísticas
- `GET /api/reports/recent` - Recientes
- `GET /api/reports/export/:id` - Exportar

**Archivos a crear**:
- `src/modules/reports/router.ts` - Nuevo router
- `src/modules/reports/service.ts` - Generación de reportes

---

### ✅ Módulo 22: Forecast
**Endpoints del OpenAPI**: 17 endpoints (el más complejo)

**Archivos a crear**:
- `src/modules/forecast/router.ts` - Nuevo router
- `src/modules/forecast/service.ts` - Lógica de forecast (algoritmos)

**Nota**: Este módulo puede requerir lógica de ML/estadística.

---

## 📝 CHECKLIST POR MÓDULO

Para cada módulo, verificar:

- [ ] **DTOs creados** desde `validation.json` y `openapi.yaml`
- [ ] **Service implementado** con lógica de negocio
- [ ] **Router completo** con todos los endpoints del OpenAPI
- [ ] **Validaciones de negocio** desde `resources.json`
- [ ] **Relaciones Prisma** configuradas
- [ ] **Manejo de errores** según `errors.md`
- [ ] **Paginación** donde corresponda
- [ ] **Filtros** según `filters-and-pagination.md`
- [ ] **RBAC** configurado según `rbac.json`
- [ ] **Tests básicos** (opcional pero recomendado)

---

## 🎯 ORDEN DE IMPLEMENTACIÓN SUGERIDO

### Sprint 1: Core Business (Customers + Orders)
1. ✅ Customers
2. ✅ Orders

### Sprint 2: Inventory Management
3. ✅ Inventory (stock básico)
4. ✅ Proveedores
5. ✅ Recepciones

### Sprint 3: Operations
6. ✅ Transferencias
7. ✅ Sales

### Sprint 4: Administration
8. ✅ Admin - Sucursales
9. ✅ Admin - Usuarios
10. ✅ Admin - Roles y Permisos
11. ✅ Admin - Configuraciones

### Sprint 5: HR
12. ✅ RRHH - Empleados
13. ✅ RRHH - Contratos
14. ✅ RRHH - Nómina
15. ✅ RRHH - Imposiciones
16. ✅ RRHH - Cargos y Parámetros

### Sprint 6: Accounting
17. ✅ Accounting - Cuentas
18. ✅ Accounting - Asientos
19. ✅ Accounting - Libro Mayor e IVA

### Sprint 7: Analytics
20. ✅ Dashboard
21. ✅ Reports
22. ✅ Forecast

---

## 🔍 VALIDACIÓN CONTRA OPENAPI

Después de cada módulo, verificar que:
- Todos los endpoints del módulo en `openapi.yaml` están implementados
- Los esquemas de request/response coinciden
- Los códigos de error son los correctos
- Las validaciones son las especificadas

---

## 📊 MÉTRICAS DE PROGRESO

- **Total módulos**: 22
- **Módulos completos**: 2 (Products, Auth)
- **Por implementar**: 20
- **Módulos con estructura**: 18
- **Módulos sin estructura**: 2 (Forecast, Reports, Dashboard - 3 en realidad)

---

**¿Empezamos con el Módulo 1: Customers?**

