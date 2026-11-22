import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashPassword } from '../src/lib/auth.js';
import { applyStockChange } from '../src/modules/inventory/stock.js';


const prisma = new PrismaClient();

type CanonicalCatalog = {
  permissions: Array<{
    nombre: string;
    recurso: string;
    accion: string;
    categoria: string;
    descripcion: string;
  }>;
};

function loadPermissionsCanonical(): CanonicalCatalog {
  const path = join(process.cwd(), 'api-spec/permissions-canonical.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as CanonicalCatalog & Record<string, unknown>;
  if (!Array.isArray(raw.permissions)) {
    throw new Error('permissions-canonical.json: falta array "permissions"');
  }
  return raw;
}

async function seedPermissionsCatalog() {
  const { permissions } = loadPermissionsCanonical();

  console.log('🔐 Reconciliando permisos canónicos...');
  await prisma.$transaction(async (tx) => {
    const permissionIds = [];
    for (const permission of permissions) {
      const { nombre, ...metadata } = permission;
      const { id } = await tx.permission.upsert({
        where: { nombre },
        update: metadata,
        create: permission,
        select: { id: true },
      });
      permissionIds.push(id);
    }

    // La FK elimina en cascada los enlaces de los permisos fuera del catálogo.
    await tx.permission.deleteMany({
      where: { nombre: { notIn: permissions.map(({ nombre }) => nombre) } },
    });

    const adminRole = await tx.role.findFirst({
      where: { nombre: 'Admin', deletedAt: null },
    });
    if (adminRole) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: adminRole.id, permissionId })),
        skipDuplicates: true,
      });
    }
  });
}

async function main() {
  console.log('🌱 Iniciando seed...');

  const seedsPath = join(process.cwd(), 'api-spec/seeds.json');
  const seeds = JSON.parse(readFileSync(seedsPath, 'utf-8'));
  const isProd = process.env.NODE_ENV === 'production';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (isProd ? '' : 'password123');
  if (!adminPassword) throw new Error('En producción define SEED_ADMIN_PASSWORD para el usuario admin');
  // En producción solo configuración: sin proveedores, productos, clientes ni empleados de ejemplo.
  if (isProd) Object.assign(seeds, { proveedores: [], products: [], customers: [], employees: [] });

  // 1. Branches (primero porque otros recursos dependen de ellas)
  console.log('📦 Creando sucursales...');
  for (const branch of seeds.branches) {
    const b = branch as typeof branch & {
      configuracion?: Record<string, unknown>;
      email?: string;
    };
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: {
        configuracion: b.configuracion ?? undefined,
        email: b.email ?? undefined,
      },
      create: {
        id: branch.id,
        codigo: branch.codigo,
        nombre: branch.nombre,
        direccion: branch.direccion,
        telefono: branch.telefono,
        activa: branch.activa,
        email: b.email,
        configuracion: (b.configuracion ?? {}) as object,
      },
    });
  }

  // 2. Roles (antes de usuarios)
  console.log('👥 Creando roles...');
  for (const role of seeds.roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: {
        id: role.id,
        nombre: role.nombre,
        descripcion: role.descripcion,
        activo: role.activo,
      },
    });
  }

  await seedPermissionsCatalog();

  // 3. Users (depende de branches y roles)
  console.log('👤 Creando usuarios...');
  for (const user of seeds.users) {
    const passwordHash = await hashPassword(adminPassword);

    const createdUser = await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        passwordHash,
        nombre: user.nombre,
        apellido: user.apellido,
        activo: user.activo,
        sucursalId: user.sucursalId,
      },
    });

    // Asignar roles
    if (user.roles && user.roles.length > 0) {
      for (const roleName of user.roles) {
        const role = seeds.roles.find((r: any) => r.nombre === roleName);
        if (role) {
          await prisma.userRole.upsert({
            where: {
              userId_roleId: {
                userId: createdUser.id,
                roleId: role.id,
              },
            },
            update: {},
            create: {
              userId: createdUser.id,
              roleId: role.id,
            },
          });
        }
      }
    }
  }

  // 4. Suppliers (antes de recepciones)
  if (!isProd) console.log('🏢 Creando proveedores...');
  for (const supplier of seeds.proveedores) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {},
      create: {
        id: supplier.id,
        nombre: supplier.nombre,
        rut: supplier.rut,
        email: supplier.email,
        telefono: supplier.telefono,
        direccion: supplier.direccion,
        activo: supplier.activo,
      },
    });
  }

  // 5. Products
  if (!isProd) console.log('🃏 Creando productos...');
  const seedCashier = seeds.users.find((user: { username: string }) => user.username === 'admin');
  for (const product of seeds.products) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id: product.id }, select: { id: true } });
      if (existing) return;

      const created = await tx.product.create({
        data: {
          id: product.id,
          nombre: product.nombre,
          descripcion: product.descripcion,
          sku: product.sku,
          juego: product.juego,
          set: product.set,
          nroColeccionista: product.nro_coleccionista,
          rareza: product.rareza,
          idioma: product.idioma,
          condicion: product.condicion,
          tipo: product.tipo,
          precio: product.precio,
          precioCompra: product.precio_compra,
          iva: product.iva || 19,
          categoria: product.categoria,
          imagen: product.imagen,
          imagenes: product.imagenes || [],
          activo: product.activo,
        },
      });
      if (product.stock > 0) {
        await applyStockChange(tx, {
          productId: created.id,
          branchId: seedCashier.sucursalId,
          userId: seedCashier.id,
          type: 'ajuste',
          quantity: product.stock,
          reason: 'Stock inicial del seed',
        });
      }
    });
  }

  // 6. Customers (antes de orders)
  if (!isProd) console.log('👥 Creando clientes...');
  for (const customer of seeds.customers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: {},
      create: {
        id: customer.id,
        nombre: customer.nombre,
        apellido: customer.apellido,
        email: customer.email,
        telefono: customer.telefono,
        rut: customer.rut,
        direccion: customer.direccion || {},
        estado: customer.estado,
        fechaRegistro: new Date(customer.fechaRegistro),
      },
    });
  }

  // 7. Accounts
  console.log('💰 Creando cuentas contables...');
  for (const account of seeds.accounts) {
    await prisma.account.upsert({
      where: { id: account.id },
      update: {},
      create: {
        id: account.id,
        codigo: account.codigo,
        nombre: account.nombre,
        tipo: account.tipo,
        nivel: account.nivel,
        activa: account.activa,
      },
    });
  }

  // 8. Employees
  const positionVendedorId = '550e8400-e29b-41d4-a716-446655440070';
  console.log('👔 Creando cargo y parámetros RRHH...');
  await prisma.position.upsert({
    where: { id: positionVendedorId },
    update: {},
    create: {
      id: positionVendedorId,
      nombre: 'Vendedor',
      descripcion: 'Venta en tienda',
      departamento: 'Ventas',
      nivelJerarquico: 2,
      sueldoMinimo: 650000,
      sueldoMaximo: 1100000,
    },
  });
  await prisma.hrCalculationParameters.upsert({
    where: { id: 'default' },
    update: {},
    create: {
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

  if (!isProd) console.log('👔 Creando empleados...');
  for (const employee of seeds.employees) {
    const empRow = {
      rut: employee.rut,
      nombre: employee.nombre,
      apellidoPaterno: employee.apellidoPaterno,
      apellidoMaterno: employee.apellidoMaterno,
      email: employee.email,
      telefono: employee.telefono ?? null,
      direccion: employee.direccion ?? undefined,
      fechaNacimiento: new Date(employee.fechaNacimiento),
      fechaIngreso: new Date(employee.fechaIngreso),
      estado: employee.estado,
      positionId: positionVendedorId,
    };

    await prisma.employee.upsert({
      where: { id: employee.id },
      update: empRow,
      create: {
        id: employee.id,
        ...empRow,
      },
    });

    if (employee.datosBancarios) {
      const b = employee.datosBancarios;
      await prisma.employeeBankData.upsert({
        where: { employeeId: employee.id },
        update: {
          banco: b.banco,
          tipoCuenta: b.tipoCuenta,
          numeroCuenta: b.numeroCuenta,
          rutTitular: b.rutTitular,
        },
        create: {
          employeeId: employee.id,
          banco: b.banco,
          tipoCuenta: b.tipoCuenta,
          numeroCuenta: b.numeroCuenta,
          rutTitular: b.rutTitular,
        },
      });
    }

    if (employee.previsional) {
      const p = employee.previsional;
      await prisma.employeeSocialSecurity.upsert({
        where: { employeeId: employee.id },
        update: {
          afp: p.afp,
          salud: p.salud,
          isapre: p.isapre ?? null,
          mutual: p.mutual ?? false,
          afc: p.afc ?? false,
          porcentajeAFC: p.porcentajeAFC ?? null,
        },
        create: {
          employeeId: employee.id,
          afp: p.afp,
          salud: p.salud,
          isapre: p.isapre ?? null,
          mutual: p.mutual ?? false,
          afc: p.afc ?? false,
          porcentajeAFC: p.porcentajeAFC ?? null,
        },
      });
    }
  }

  console.log('✅ Seed completado!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

