import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import { parsePagination } from '../../lib/pagination.js';
import { hrEnvelope, hrDeleted } from '../../lib/hr-envelope.js';
import { mapCargo } from './mapper.js';
import { hrService } from './service.js';
import {
  listEmployeesQueryDto,
  employeeIdParamDto,
  createEmployeeDto,
  updateEmployeeDto,
  listContractsQueryDto,
  contractIdParamDto,
  empleadoIdContractParamDto,
  createContractDto,
  updateContractDto,
  terminarContractDto,
  listPayrollQueryDto,
  payrollIdParamDto,
  periodoParamDto,
  generarNominaDto,
  procesarNominaDto,
  calcularNominaDto,
  exportarNominaDto,
  listContributionsQueryDto,
  contributionIdParamDto,
  generarContributionsDto,
  exportarContributionsDto,
  positionIdParamDto,
  parametrosCalculoDto,
} from './dto.js';

export const hrRouter = new Hono();

// --- Empleados: rutas estáticas primero ---
hrRouter.get(
  '/employees/estadisticas',
  optionalAuth,
  async (c) => {
    const data = await hrService.estadisticas();
    return c.json(hrEnvelope(data));
  }
);

hrRouter.get(
  '/employees',
  optionalAuth,
  validateQuery(listEmployeesQueryDto),
  async (c) => {
    const q = (c as unknown as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<
      typeof listEmployeesQueryDto
    >;
    const qRecord: Record<string, string | undefined> = {};
    if (q.page) qRecord.page = q.page;
    if (q.limit) qRecord.limit = q.limit;
    const pagination = parsePagination(qRecord);
    const result = await hrService.listEmployees({
      ...pagination,
      estado: q.estado,
      cargo: q.cargo,
      departamento: q.departamento,
      fechaIngresoDesde: q.fechaIngresoDesde,
      fechaIngresoHasta: q.fechaIngresoHasta,
      busqueda: q.busqueda,
    });
    return c.json(hrEnvelope(result));
  }
);

hrRouter.post(
  '/employees',
  authJWT,
  rbacGuard,
  validateBody(createEmployeeDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof createEmployeeDto
    >;
    const data = await hrService.createEmployee(body);
    return c.json(hrEnvelope(data, 'Empleado creado'), 201);
  }
);

hrRouter.get(
  '/employees/:id',
  optionalAuth,
  validateParams(employeeIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const data = await hrService.getEmployeeById(id);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.put(
  '/employees/:id',
  authJWT,
  rbacGuard,
  validateParams(employeeIdParamDto),
  validateBody(updateEmployeeDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof updateEmployeeDto
    >;
    const data = await hrService.updateEmployee(id, body);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.delete(
  '/employees/:id',
  authJWT,
  rbacGuard,
  validateParams(employeeIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    await hrService.deleteEmployee(id);
    return c.json(hrDeleted('Empleado eliminado'));
  }
);

// --- Contratos ---
hrRouter.put(
  '/contracts/:id/terminar',
  authJWT,
  rbacGuard,
  validateParams(contractIdParamDto),
  validateBody(terminarContractDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof terminarContractDto
    >;
    const data = await hrService.terminarContract(id, body.fechaTermino, body.observaciones);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.get(
  '/contracts/empleado/:empleadoId',
  optionalAuth,
  validateParams(empleadoIdContractParamDto),
  async (c) => {
    const { empleadoId } = (c as unknown as { get: (k: string) => unknown }).get(
      'validatedParams'
    ) as { empleadoId: string };
    const data = await hrService.contractsByEmpleado(empleadoId);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.get(
  '/contracts',
  optionalAuth,
  validateQuery(listContractsQueryDto),
  async (c) => {
    const q = (c as unknown as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<
      typeof listContractsQueryDto
    >;
    const qRecord: Record<string, string | undefined> = {};
    if (q.page) qRecord.page = q.page;
    if (q.limit) qRecord.limit = q.limit;
    const pagination = parsePagination(qRecord);
    const result = await hrService.listContracts({
      ...pagination,
      estado: q.estado,
      tipo: q.tipo,
      empleadoId: q.empleadoId,
      search: q.search ?? q.q,
    });
    return c.json(hrEnvelope(result));
  }
);

hrRouter.post(
  '/contracts',
  authJWT,
  rbacGuard,
  validateBody(createContractDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof createContractDto
    >;
    const data = await hrService.createContract({
      empleadoId: body.empleadoId,
      tipo: body.tipo,
      jornada: body.jornada,
      sueldoBase: body.sueldoBase,
      fechaInicio: body.fechaInicio,
      fechaFin: body.fechaFin ?? null,
      observaciones: body.observaciones,
    });
    return c.json(hrEnvelope(data, 'Contrato creado'), 201);
  }
);

hrRouter.get(
  '/contracts/:id',
  optionalAuth,
  validateParams(contractIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const data = await hrService.getContractById(id);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.put(
  '/contracts/:id',
  authJWT,
  rbacGuard,
  validateParams(contractIdParamDto),
  validateBody(updateContractDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof updateContractDto
    >;
    const data = await hrService.updateContract(id, body);
    return c.json(hrEnvelope(data));
  }
);

// --- Nómina (rutas estáticas antes de :id) ---
hrRouter.get(
  '/payroll/resumen/:periodo',
  optionalAuth,
  validateParams(periodoParamDto),
  async (c) => {
    const { periodo } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      periodo: string;
    };
    const data = await hrService.resumenNomina(periodo);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.get(
  '/payroll/periodo/:periodo',
  optionalAuth,
  validateParams(periodoParamDto),
  async (c) => {
    const { periodo } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      periodo: string;
    };
    const data = await hrService.payrollByPeriodo(periodo);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.post(
  '/payroll/generar',
  authJWT,
  rbacGuard,
  validateBody(generarNominaDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof generarNominaDto
    >;
    const data = await hrService.generarNomina(body);
    return c.json(hrEnvelope(data, 'Nóminas generadas'), 201);
  }
);

hrRouter.post(
  '/payroll/calcular',
  authJWT,
  rbacGuard,
  validateBody(calcularNominaDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof calcularNominaDto
    >;
    const data = await hrService.calcularLiquidacion(body.empleadoId, body.periodo);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.put(
  '/payroll/procesar',
  authJWT,
  rbacGuard,
  validateBody(procesarNominaDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof procesarNominaDto
    >;
    const data = await hrService.procesarNomina(body);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.post(
  '/payroll/exportar',
  authJWT,
  rbacGuard,
  validateBody(exportarNominaDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof exportarNominaDto
    >;
    const csv = await hrService.exportNominaCsv(body);
    const filename = `nomina-${body.periodo}.csv`;
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  }
);

hrRouter.get(
  '/payroll',
  optionalAuth,
  validateQuery(listPayrollQueryDto),
  async (c) => {
    const q = (c as unknown as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<
      typeof listPayrollQueryDto
    >;
    const qRecord: Record<string, string | undefined> = {};
    if (q.page) qRecord.page = q.page;
    if (q.limit) qRecord.limit = q.limit;
    const pagination = parsePagination(qRecord);
    const result = await hrService.listPayroll({
      ...pagination,
      periodo: q.periodo,
      estado: q.estado,
      empleadoId: q.empleadoId,
    });
    return c.json(hrEnvelope(result));
  }
);

hrRouter.get(
  '/payroll/:id',
  optionalAuth,
  validateParams(payrollIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const data = await hrService.getPayrollById(id);
    return c.json(hrEnvelope(data));
  }
);

// --- Imposiciones ---
hrRouter.get(
  '/contributions/periodo/:periodo',
  optionalAuth,
  validateParams(periodoParamDto),
  async (c) => {
    const { periodo } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      periodo: string;
    };
    const data = await hrService.contributionsByPeriodo(periodo);
    return c.json(hrEnvelope(data));
  }
);

hrRouter.post(
  '/contributions/generar',
  authJWT,
  rbacGuard,
  validateBody(generarContributionsDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof generarContributionsDto
    >;
    const data = await hrService.generarContributions(body);
    return c.json(hrEnvelope(data, 'Imposiciones generadas'), 201);
  }
);

hrRouter.post(
  '/contributions/exportar',
  authJWT,
  rbacGuard,
  validateBody(exportarContributionsDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof exportarContributionsDto
    >;
    const csv = await hrService.exportContributionsCsv({ periodo: body.periodo });
    const filename = `imposiciones-${body.periodo}.csv`;
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  }
);

hrRouter.get(
  '/contributions',
  optionalAuth,
  validateQuery(listContributionsQueryDto),
  async (c) => {
    const q = (c as unknown as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<
      typeof listContributionsQueryDto
    >;
    const qRecord: Record<string, string | undefined> = {};
    if (q.page) qRecord.page = q.page;
    if (q.limit) qRecord.limit = q.limit;
    const pagination = parsePagination(qRecord);
    const result = await hrService.listContributionSummaries({
      ...pagination,
      periodo: q.periodo,
      tipo: q.tipo,
      empleadoId: q.empleadoId,
    });
    return c.json(hrEnvelope(result));
  }
);

hrRouter.get(
  '/contributions/:id',
  optionalAuth,
  validateParams(contributionIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const data = await hrService.getContributionSummaryById(id);
    return c.json(hrEnvelope(data));
  }
);

// --- Cargos ---
hrRouter.get('/positions', optionalAuth, async (c) => {
  const rows = await hrService.listPositions();
  return c.json(hrEnvelope(rows.map(mapCargo)));
});

hrRouter.get(
  '/positions/:id',
  optionalAuth,
  validateParams(positionIdParamDto),
  async (c) => {
    const { id } = (c as unknown as { get: (k: string) => unknown }).get('validatedParams') as {
      id: string;
    };
    const p = await hrService.getPositionById(id);
    return c.json(hrEnvelope(mapCargo(p)));
  }
);

// --- Parámetros ---
hrRouter.get('/parametros/calculo', optionalAuth, async (c) => {
  const data = await hrService.getParametros();
  return c.json(hrEnvelope(data));
});

hrRouter.put(
  '/parametros/calculo',
  authJWT,
  rbacGuard,
  validateBody(parametrosCalculoDto),
  async (c) => {
    const body = (c as unknown as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof parametrosCalculoDto
    >;
    const data = await hrService.updateParametros(body);
    return c.json(hrEnvelope(data));
  }
);
