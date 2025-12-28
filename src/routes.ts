import { Hono } from 'hono';
import { productsRouter } from './modules/products/router.js';
import { inventoryRouter } from './modules/inventory/router.js';
import { salesRouter } from './modules/sales/router.js';
import { ordersRouter } from './modules/sales/orders-router.js';
import { customersRouter } from './modules/customers/router.js';
import { accountingRouter } from './modules/accounting/router.js';
import { hrRouter } from './modules/hr/router.js';
import { adminRouter } from './modules/admin/router.js';
import { authRouter } from './modules/auth/router.js';
import { recepcionesRouter } from './modules/recepciones/router.js';
import { proveedoresRouter } from './modules/proveedores/router.js';
import { transferenciasRouter } from './modules/transferencias/router.js';

export const routes = new Hono();

// Autenticación
routes.route('/auth', authRouter);

// Montar routers por dominio
routes.route('/products', productsRouter);
routes.route('/inventory', inventoryRouter);
routes.route('/sales', salesRouter);
routes.route('/orders', ordersRouter);
routes.route('/customers', customersRouter);
routes.route('/accounting', accountingRouter);
routes.route('/hr', hrRouter);
routes.route('/admin', adminRouter);
routes.route('/recepciones', recepcionesRouter);
routes.route('/transferencias', transferenciasRouter);
routes.route('/proveedores', proveedoresRouter);
