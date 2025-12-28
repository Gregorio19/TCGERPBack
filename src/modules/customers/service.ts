import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { CustomerStatus } from '@prisma/client';

export const customerService = {
  async list(params: PaginationParams & {
    estado?: string;
    canalComunicacion?: string;
    recibirPromociones?: boolean;
    dateFrom?: string;
    dateTo?: string;
    region?: string;
    ciudad?: string;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
    };

    // Búsqueda de texto
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filtro por estado
    if (filters.estado) {
      where.estado = filters.estado as CustomerStatus;
    }

    // Filtro por región y ciudad (desde dirección JSON)
    // Prisma usa JsonFilter para campos JSON
    if (filters.region || filters.ciudad) {
      const direccionFilters: any[] = [];
      if (filters.region) {
        direccionFilters.push({
          direccion: {
            path: ['region'],
            equals: filters.region,
          } as Prisma.JsonFilter,
        });
      }
      if (filters.ciudad) {
        direccionFilters.push({
          direccion: {
            path: ['ciudad'],
            equals: filters.ciudad,
          } as Prisma.JsonFilter,
        });
      }
      if (direccionFilters.length > 0) {
        where.AND = direccionFilters;
      }
    }

    // Filtro por fecha de registro
    if (filters.dateFrom || filters.dateTo) {
      where.fechaRegistro = {};
      if (filters.dateFrom) {
        where.fechaRegistro.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.fechaRegistro.lte = new Date(filters.dateTo);
      }
    }

    // Ordenamiento
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {};
    if (sortBy) {
      const validSortFields: (keyof Prisma.CustomerOrderByWithRelationInput)[] = [
        'nombre',
        'apellido',
        'email',
        'rut',
        'estado',
        'fechaRegistro',
        'createdAt',
      ];
      if (validSortFields.includes(sortBy as any)) {
        orderBy[sortBy as keyof Prisma.CustomerOrderByWithRelationInput] = sortDir || 'asc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.customer.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: string) {
    const customer = await db.customer.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new AppError(
        ErrorCodes.CUSTOMER_NOT_FOUND,
        `Cliente con ID ${id} no encontrado`,
        404
      );
    }

    return customer;
  },

  async create(data: {
    nombre: string;
    apellido: string;
    email: string;
    telefono: string;
    rut: string;
    direccion: any;
    estado?: CustomerStatus;
  }) {
    // Verificar email único
    const existingEmail = await db.customer.findUnique({
      where: { email: data.email },
    });

    if (existingEmail) {
      throw new AppError(
        ErrorCodes.DUPLICATE_EMAIL,
        `Ya existe un cliente con el email '${data.email}'`,
        409
      );
    }

    // Verificar RUT único
    const existingRut = await db.customer.findUnique({
      where: { rut: data.rut },
    });

    if (existingRut) {
      throw new AppError(
        ErrorCodes.DUPLICATE_RUT,
        `Ya existe un cliente con el RUT '${data.rut}'`,
        409
      );
    }

    const customer = await db.customer.create({
      data: {
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email,
        telefono: data.telefono,
        rut: data.rut,
        direccion: data.direccion,
        estado: data.estado || 'activo',
      },
    });

    return customer;
  },

  async update(id: string, data: {
    nombre?: string;
    apellido?: string;
    email?: string;
    telefono?: string;
    rut?: string;
    direccion?: any;
    estado?: CustomerStatus;
  }) {
    const existing = await this.getById(id);

    // Verificar email único si se está actualizando
    if (data.email && data.email !== existing.email) {
      const duplicate = await db.customer.findUnique({
        where: { email: data.email },
      });

      if (duplicate) {
        throw new AppError(
          ErrorCodes.DUPLICATE_EMAIL,
          `Ya existe un cliente con el email '${data.email}'`,
          409
        );
      }
    }

    // Verificar RUT único si se está actualizando
    if (data.rut && data.rut !== existing.rut) {
      const duplicate = await db.customer.findUnique({
        where: { rut: data.rut },
      });

      if (duplicate) {
        throw new AppError(
          ErrorCodes.DUPLICATE_RUT,
          `Ya existe un cliente con el RUT '${data.rut}'`,
          409
        );
      }
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre }),
        ...(data.apellido !== undefined && { apellido: data.apellido }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.telefono !== undefined && { telefono: data.telefono }),
        ...(data.rut !== undefined && { rut: data.rut }),
        ...(data.direccion !== undefined && { direccion: data.direccion }),
        ...(data.estado !== undefined && { estado: data.estado }),
      },
    });

    return customer;
  },

  async delete(id: string) {
    await this.getById(id);

    // Soft delete
    await db.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  },

  async getOrders(customerId: string) {
    // Verificar que el cliente existe
    await this.getById(customerId);

    const orders = await db.order.findMany({
      where: {
        clienteId: customerId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        sucursal: {
          select: {
            id: true,
            nombre: true,
            codigo: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return orders;
  },

  async getStats(customerId: string) {
    // Verificar que el cliente existe
    await this.getById(customerId);

    const [totalOrders, totalSpent, averageOrderValue, lastOrderDate] = await Promise.all([
      // Total de órdenes
      db.order.count({
        where: {
          clienteId: customerId,
        },
      }),

      // Total gastado (suma de totales)
      db.order.aggregate({
        where: {
          clienteId: customerId,
        },
        _sum: {
          total: true,
        },
      }),

      // Valor promedio de orden
      db.order.aggregate({
        where: {
          clienteId: customerId,
        },
        _avg: {
          total: true,
        },
      }),

      // Fecha de última orden
      db.order.findFirst({
        where: {
          clienteId: customerId,
        },
        orderBy: {
          fechaCreacion: 'desc',
        },
        select: {
          fechaCreacion: true,
        },
      }),
    ]);

    return {
      totalOrders,
      totalSpent: totalSpent._sum.total || 0,
      averageOrderValue: averageOrderValue._avg.total ? Math.round(averageOrderValue._avg.total) : 0,
      lastOrderDate: lastOrderDate?.fechaCreacion || null,
    };
  },
};

