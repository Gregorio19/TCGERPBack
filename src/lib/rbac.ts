import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RBACConfig {
  roles: Record<string, {
    description: string;
    permissions: Record<string, Record<string, boolean>>;
  }>;
  resources: Record<string, string>;
  actions: Record<string, string>;
}

let rbacConfig: RBACConfig | null = null;

const loadRBAC = (): RBACConfig => {
  if (!rbacConfig) {
    const rbacPath = join(__dirname, '../../api-spec/rbac.json');
    const content = readFileSync(rbacPath, 'utf-8');
    rbacConfig = JSON.parse(content) as RBACConfig;
  }
  return rbacConfig;
};

export const can = (role: string, resource: string, action: string): boolean => {
  const config = loadRBAC();
  const roleConfig = config.roles[role];

  if (!roleConfig) {
    return false;
  }

  const resourcePermissions = roleConfig.permissions[resource];
  if (!resourcePermissions) {
    return false;
  }

  return resourcePermissions[action] === true;
};

export const mapPathToResource = (path: string, method: string): { resource: string; action: string } | null => {
  // Mapear paths a recursos y acciones
  const pathParts = path.split('/').filter(Boolean);

  // Remover /api si existe
  if (pathParts[0] === 'api') {
    pathParts.shift();
  }

  if (pathParts.length === 0) {
    return null;
  }

  const resource = pathParts[0];
  let action = 'read';

  if (method === 'GET') {
    action = 'read';
  } else if (method === 'POST') {
    action = 'create';
  } else if (method === 'PUT' || method === 'PATCH') {
    action = 'update';
  } else if (method === 'DELETE') {
    action = 'delete';
  }

  // Mapeos especiales
  if (resource === 'accounting' && pathParts.includes('entries')) {
    if (pathParts.includes('approve')) {
      return { resource: 'accounting', action: 'approve' };
    }
    if (pathParts.includes('contabilize')) {
      return { resource: 'accounting', action: 'post' };
    }
  }

  if (resource === 'rrhh' && pathParts.includes('payroll')) {
    if (pathParts.includes('generar') || pathParts.includes('procesar')) {
      return { resource: 'rrhh', action: 'process_payroll' };
    }
  }

  if (resource === 'reports' && method === 'POST') {
    return { resource: 'reports', action: 'generate' };
  }

  if (resource === 'forecast' && method === 'POST') {
    return { resource: 'forecast', action: 'calculate' };
  }

  return { resource, action };
};

