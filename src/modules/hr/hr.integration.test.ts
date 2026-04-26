import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';

describe('RRHH API (integración)', () => {
  it('GET /api/hr/positions devuelve ApiResponse con data array', async () => {
    const res = await app.request('http://localhost/api/hr/positions');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: unknown;
      message?: string;
    };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
  });

  it('GET /api/hr/parametros/calculo devuelve porcentajes numéricos', async () => {
    const res = await app.request('http://localhost/api/hr/parametros/calculo');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        porcentajeAFP: number;
        porcentajeSalud: number;
        rebajaImpuesto: number;
      };
    };
    assert.equal(json.success, true);
    assert.equal(typeof json.data.porcentajeAFP, 'number');
    assert.equal(typeof json.data.rebajaImpuesto, 'number');
  });

  it('GET /api/hr/employees devuelve paginación estándar', async () => {
    const res = await app.request('http://localhost/api/hr/employees?limit=5');
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: { data: unknown[]; pagination: { page: number; limit: number; total: number } };
    };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.data));
    assert.ok(json.data.pagination);
    assert.equal(typeof json.data.pagination.total, 'number');
  });

  it('Horarios: plantilla + excepción override tiene prioridad en calendario', async () => {
    const loginRes = await app.request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200, 'login seed admin/password123');
    const { token } = (await loginRes.json()) as { token: string };

    const employeesRes = await app.request('http://localhost/api/hr/employees?limit=1');
    assert.equal(employeesRes.status, 200);
    const employeesJson = (await employeesRes.json()) as {
      success: boolean;
      data: { data: Array<{ id: string }> };
    };
    const employeeId = employeesJson.data.data[0]?.id;
    assert.ok(employeeId, 'debe existir al menos un empleado para test');

    const templateRes = await app.request(
      `http://localhost/api/hr/employees/${employeeId}/schedules/templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dayOfWeek: 0, // lunes
          startTime: '09:00',
          endTime: '12:00',
          effectiveFrom: '2026-04-01',
        }),
      }
    );
    const templateText = await templateRes.text();
    assert.ok(
      templateRes.status === 201 || templateRes.status === 409,
      `template status inesperado: ${templateRes.status} body=${templateText}`
    );

    const exceptionRes = await app.request(
      `http://localhost/api/hr/employees/${employeeId}/schedules/exceptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: '2026-04-06', // lunes
          type: 'override',
          startTime: '16:00',
          endTime: '18:00',
          note: 'cambio puntual de turno',
        }),
      }
    );
    const exceptionText = await exceptionRes.text();
    assert.ok(
      exceptionRes.status === 201 || exceptionRes.status === 409,
      `exception status inesperado: ${exceptionRes.status} body=${exceptionText}`
    );

    const calRes = await app.request(
      `http://localhost/api/hr/employees/${employeeId}/schedules/calendar?from=2026-04-06&to=2026-04-06`
    );
    assert.equal(calRes.status, 200);
    const calJson = (await calRes.json()) as {
      success: boolean;
      data: Array<{
        date: string;
        source: string;
        isOff: boolean;
        blocks: Array<{ startTime: string; endTime: string }>;
      }>;
    };
    assert.equal(calJson.success, true);
    assert.equal(calJson.data.length, 1);
    assert.equal(calJson.data[0].date, '2026-04-06');
    assert.equal(calJson.data[0].source, 'exception_override');
    assert.equal(calJson.data[0].isOff, false);
    assert.deepEqual(calJson.data[0].blocks, [{ startTime: '16:00', endTime: '18:00' }]);
  });

  it('Horarios: calendario masivo agrupa por empleado y respeta filtros', async () => {
    const employeesRes = await app.request('http://localhost/api/hr/employees?limit=1');
    assert.equal(employeesRes.status, 200);
    const employeesJson = (await employeesRes.json()) as {
      success: boolean;
      data: { data: Array<{ id: string; estado: string }> };
    };
    const employee = employeesJson.data.data[0];
    assert.ok(employee?.id, 'debe existir al menos un empleado para test');

    const calBulkRes = await app.request(
      `http://localhost/api/hr/schedules/calendar?from=2026-04-06&to=2026-04-06&estado=${employee.estado}&employeeIds=${employee.id}`
    );
    const calBulkText = await calBulkRes.text();
    assert.equal(calBulkRes.status, 200, calBulkText);
    const json = JSON.parse(calBulkText) as {
      success: boolean;
      data: Array<{
        employeeId: string;
        employee: { id: string; nombre: string; apellidoPaterno: string };
        days: Array<{ date: string; blocks: Array<{ startTime: string; endTime: string }> }>;
      }>;
    };
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].employeeId, employee.id);
    assert.equal(json.data[0].employee.id, employee.id);
    assert.ok(Array.isArray(json.data[0].days));
  });
});
