import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok } from '../../lib/responses.js';
import { forecastService } from './service.js';

export const forecastRouter = new Hono();

forecastRouter.post('/calculate', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.calculate(body));
});

forecastRouter.get('/kpis', optionalAuth, async (c) => {
  return ok(c, forecastService.kpis());
});

forecastRouter.post('/productos-top', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.productosTop(body));
});

forecastRouter.post('/sets-top', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.setsTop(body));
});

forecastRouter.post('/grafico', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.grafico(body));
});

forecastRouter.post('/comparar-metodos', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.compararMetodos(body));
});

forecastRouter.get('/alertas', optionalAuth, async (c) => {
  return ok(c, forecastService.alertas());
});

forecastRouter.get('/estado', optionalAuth, async (c) => {
  return ok(c, forecastService.estado());
});

forecastRouter.get('/configuracion', optionalAuth, async (c) => {
  return ok(c, forecastService.configuracionList());
});

forecastRouter.post('/configuracion', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.configuracionCreate(body), 201);
});

forecastRouter.get('/configuracion/:id', optionalAuth, async (c) => {
  return ok(c, forecastService.configuracionGet(c.req.param('id')));
});

forecastRouter.put('/configuracion/:id', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.configuracionUpdate(c.req.param('id'), body));
});

forecastRouter.delete('/configuracion/:id', authJWT, rbacGuard, async (c) => {
  return ok(c, forecastService.configuracionDelete(c.req.param('id')));
});

forecastRouter.get('/historial', optionalAuth, async (c) => {
  const q: Record<string, string | undefined> = {
    page: c.req.query('page'),
    limit: c.req.query('limit'),
  };
  return ok(c, forecastService.historial(q));
});

forecastRouter.post('/exportar', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const buf = forecastService.exportar(body);
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="forecast-export.bin"',
    },
  });
});

forecastRouter.get('/datos-historicos', optionalAuth, async (c) => {
  const q: Record<string, string | undefined> = {
    desde: c.req.query('desde'),
    hasta: c.req.query('hasta'),
  };
  return ok(c, forecastService.datosHistoricos(q));
});

forecastRouter.post('/validar-configuracion', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.validarConfiguracion(body));
});

forecastRouter.get('/recomendaciones', optionalAuth, async (c) => {
  return ok(c, forecastService.recomendaciones());
});

forecastRouter.post('/metricas', authJWT, rbacGuard, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return ok(c, forecastService.metricas(body));
});
