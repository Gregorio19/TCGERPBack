import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../app.js';
import { db } from '../../lib/db.js';

const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_DATE = '2026-04-27'; // lunes

async function adminToken() {
  const loginRes = await app.request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  assert.equal(loginRes.status, 200);
  const { token } = (await loginRes.json()) as { token: string };
  return token;
}

describe('Appointments agenda (integración)', () => {
  it('valida choques, duración, empleados distintos, overbooking y cancelación', async () => {
    const token = await adminToken();
    const employeesRes = await app.request('http://localhost/api/hr/employees?page=1&limit=5');
    assert.equal(employeesRes.status, 200);
    const employeesJson = (await employeesRes.json()) as { data: { data: Array<{ id: string; estado: string }> } };
    assert.ok(employeesJson.data.data.length >= 2, 'se requieren al menos 2 empleados para este test');
    const e1 = employeesJson.data.data[0]!.id;
    const e2 = employeesJson.data.data[1]!.id;
    await db.appointment.deleteMany({
      where: {
        employeeId: { in: [e1, e2] },
        startAt: { gte: new Date(`${TEST_DATE}T00:00:00.000Z`), lt: new Date(`${TEST_DATE}T23:59:59.999Z`) },
      },
    });
    await db.appointmentHold.deleteMany({
      where: {
        employeeId: { in: [e1, e2] },
        startAt: { gte: new Date(`${TEST_DATE}T00:00:00.000Z`), lt: new Date(`${TEST_DATE}T23:59:59.999Z`) },
      },
    });

    for (const eid of [e1, e2]) {
      const tplRes = await app.request(`http://localhost/api/hr/employees/${eid}/schedules/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dayOfWeek: 0,
          startTime: '09:00',
          endTime: '16:00',
          effectiveFrom: TEST_DATE,
        }),
      });
      assert.ok([201, 409].includes(tplRes.status), `template ${eid}`);
    }

    const availBaseRes = await app.request(
      `http://localhost/api/appointments/availability?from=${TEST_DATE}&to=${TEST_DATE}&employeeIds=${e1}&durationMin=30`
    );
    assert.equal(availBaseRes.status, 200);
    const availBase = (await availBaseRes.json()) as Array<{ startAt: string; isAvailable: boolean }>;
    const baseSlot = availBase.find((s) => s.isAvailable);
    assert.ok(baseSlot, 'debe existir al menos un slot base disponible');
    const baseStart = baseSlot!.startAt;

    const create1 = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        startAt: baseStart,
        durationMin: 30,
      }),
    });
    const create1Text = await create1.text();
    assert.equal(create1.status, 201, create1Text);
    const a1 = JSON.parse(create1Text) as { id: string };

    const clashSameEmployee = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        startAt: baseStart,
        durationMin: 30,
      }),
    });
    assert.equal(clashSameEmployee.status, 409);

    const sameHourOtherEmployee = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e2,
        startAt: baseStart,
        durationMin: 30,
      }),
    });
    assert.equal(sameHourOtherEmployee.status, 201, await sameHourOtherEmployee.text());

    const invalidDuration = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        startAt: `${TEST_DATE}T15:00:00.000Z`,
        durationMin: 20,
      }),
    });
    assert.equal(invalidDuration.status, 422);

    const serviceTypeRes = await app.request('http://localhost/api/appointments/service-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `Control overbook ${Date.now()}`,
        durationOptions: [30],
        allowOverbooking: true,
      }),
    });
    const serviceTypeText = await serviceTypeRes.text();
    assert.equal(serviceTypeRes.status, 201, serviceTypeText);
    const serviceType = JSON.parse(serviceTypeText) as { id: string };

    const overbookSlotRes = await app.request(
      `http://localhost/api/appointments/availability?from=${TEST_DATE}&to=${TEST_DATE}&employeeIds=${e1}&durationMin=30&serviceTypeId=${serviceType.id}`
    );
    assert.equal(overbookSlotRes.status, 200);
    const overbookSlots = (await overbookSlotRes.json()) as Array<{ startAt: string; isAvailable: boolean }>;
    const baseStartMs = new Date(baseStart).getTime();
    const overbookStart = overbookSlots.find((s) => {
      if (!s.isAvailable) return false;
      const startMs = new Date(s.startAt).getTime();
      return startMs >= baseStartMs + 30 * 60_000 || startMs + 30 * 60_000 <= baseStartMs;
    })?.startAt;
    assert.ok(overbookStart, 'debe existir slot para prueba de overbooking');

    const overbook1 = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        serviceTypeId: serviceType.id,
        startAt: overbookStart,
        durationMin: 30,
      }),
    });
    assert.equal(overbook1.status, 201, await overbook1.text());

    const overbook2 = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        serviceTypeId: serviceType.id,
        startAt: overbookStart,
        durationMin: 30,
      }),
    });
    if (overbook2.status !== 201) {
      await db.appointmentOverbookingPolicy.create({
        data: {
          employeeId: e1,
          serviceTypeId: serviceType.id,
          maxParallel: 2,
          effectiveFrom: new Date(`${TEST_DATE}T00:00:00.000Z`),
        },
      });
      const overbook2Retry = await app.request('http://localhost/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          employeeId: e1,
          serviceTypeId: serviceType.id,
          startAt: overbookStart,
          durationMin: 30,
        }),
      });
      assert.equal(overbook2Retry.status, 201, await overbook2Retry.text());
    }

    const overbook3 = await app.request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        employeeId: e1,
        serviceTypeId: serviceType.id,
        startAt: overbookStart,
        durationMin: 30,
      }),
    });
    assert.equal(overbook3.status, 409);

    const availabilityBefore = await app.request(
      `http://localhost/api/appointments/availability?from=${TEST_DATE}&to=${TEST_DATE}&employeeIds=${e1}&durationMin=30`
    );
    assert.equal(availabilityBefore.status, 200);
    const beforeJson = (await availabilityBefore.json()) as Array<{ startAt: string; isAvailable: boolean }>;
    const slotBefore = beforeJson.find((s) => s.startAt === baseStart);
    assert.ok(slotBefore && !slotBefore.isAvailable);

    const cancelRes = await app.request(`http://localhost/api/appointments/${a1.id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'cancel test' }),
    });
    assert.equal(cancelRes.status, 200);

    const availabilityAfter = await app.request(
      `http://localhost/api/appointments/availability?from=${TEST_DATE}&to=${TEST_DATE}&employeeIds=${e1}&durationMin=30`
    );
    assert.equal(availabilityAfter.status, 200);
    const afterJson = (await availabilityAfter.json()) as Array<{ startAt: string; isAvailable: boolean }>;
    const slotAfter = afterJson.find((s) => s.startAt === baseStart);
    assert.ok(slotAfter && slotAfter.isAvailable);

    await db.appointment.deleteMany({
      where: {
        employeeId: { in: [e1, e2] },
        startAt: { gte: new Date(`${TEST_DATE}T00:00:00.000Z`), lt: new Date(`${TEST_DATE}T23:59:59.999Z`) },
      },
    });
  });
});
