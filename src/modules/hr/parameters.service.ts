import { db } from '../../lib/db.js';
import { mapParametros } from './mapper.js';

export async function ensureHrParams() {
  const row = await db.hrCalculationParameters.findUnique({ where: { id: 'default' } });
  if (row) return row;
  return db.hrCalculationParameters.create({
    data: {
      id: 'default',
      porcentajeAFP: 10,
      porcentajeSalud: 7,
      porcentajeAFC: 0.6,
      porcentajeMutual: 0.93,
      tramoImpuesto: 'tramo_1',
      porcentajeImpuesto: 4,
      rebajaImpuesto: 12000,
    },
  });
}

export const parametersService = {
  async getParametros() {
    const p = await ensureHrParams();
    return mapParametros(p);
  },

  async updateParametros(data: {
    porcentajeAFP: number;
    porcentajeSalud: number;
    porcentajeAFC: number;
    porcentajeMutual: number;
    tramoImpuesto: string;
    porcentajeImpuesto: number;
    rebajaImpuesto: number;
  }) {
    const p = await db.hrCalculationParameters.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
    return mapParametros(p);
  },
};
