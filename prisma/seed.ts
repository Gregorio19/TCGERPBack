import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from '../src/lib/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  const seedsPath = join(__dirname, '../api-spec/seeds.json');
  const seeds = JSON.parse(readFileSync(seedsPath, 'utf-8'));

  // 1. Branches (primero porque otros recursos dependen de ellas)
  console.log('📦 Creando sucursales...');
  for (const branch of seeds.branches) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: {},
      create: {
        id: branch.id,
        codigo: branch.codigo,
        nombre: branch.nombre,
        direccion: branch.direccion,
        telefono: branch.telefono,
        activa: branch.activa,
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

  // 3. Users (depende de branches y roles)
  console.log('👤 Creando usuarios...');
  for (const user of seeds.users) {
    const passwordHash = await hashPassword('password123'); // Contraseña por defecto

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
  console.log('🏢 Creando proveedores...');
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
  console.log('🃏 Creando productos...');
  for (const product of seeds.products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: {
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
        stock: product.stock,
        categoria: product.categoria,
        imagen: product.imagen,
        imagenes: product.imagenes || [],
        activo: product.activo,
      },
    });
  }

  // 6. Customers (antes de orders)
  console.log('👥 Creando clientes...');
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
  console.log('👔 Creando empleados...');
  for (const employee of seeds.employees) {
    await prisma.employee.upsert({
      where: { id: employee.id },
      update: {},
      create: {
        id: employee.id,
        rut: employee.rut,
        nombre: employee.nombre,
        apellidoPaterno: employee.apellidoPaterno,
        apellidoMaterno: employee.apellidoMaterno,
        email: employee.email,
        fechaNacimiento: new Date(employee.fechaNacimiento),
        fechaIngreso: new Date(employee.fechaIngreso),
        estado: employee.estado,
      },
    });
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

