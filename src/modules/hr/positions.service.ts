import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export const positionsService = {
  async listPositions() {
    return db.position.findMany({ orderBy: { nombre: 'asc' } });
  },

  async getPositionById(id: string) {
    const p = await db.position.findUnique({ where: { id } });
    if (!p) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Cargo no encontrado', 404);
    }
    return p;
  },
};
