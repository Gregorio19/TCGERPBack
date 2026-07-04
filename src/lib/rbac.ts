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

  let resource = pathParts[0];
  // API usa prefijo /hr; permisos en rbac.json están bajo "rrhh"
  if (resource === 'hr') {
    resource = 'rrhh';
  }
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
    if (
      pathParts.includes('generar') ||
      pathParts.includes('procesar') ||
      pathParts.includes('calcular') ||
      pathParts.includes('exportar')
    ) {
      return { resource: 'rrhh', action: 'process_payroll' };
    }
  }

  if (resource === 'rrhh' && pathParts.includes('contributions') && pathParts.includes('exportar')) {
    return { resource: 'rrhh', action: 'process_payroll' };
  }

  if (resource === 'rrhh' && pathParts.includes('contributions') && pathParts.includes('generar')) {
    return { resource: 'rrhh', action: 'process_payroll' };
  }

  if (resource === 'reports' && pathParts.includes('export')) {
    return { resource: 'reports', action: 'export' };
  }

  if (resource === 'reports' && method === 'POST') {
    return { resource: 'reports', action: 'generate' };
  }

  if (resource === 'forecast' && pathParts.includes('configuracion')) {
    if (method === 'GET') {
      return { resource: 'forecast', action: 'read' };
    }
    return { resource: 'forecast', action: 'configure' };
  }

  if (resource === 'forecast' && method === 'POST' && !pathParts.includes('configuracion')) {
    const calcPaths = ['calculate', 'productos-top', 'sets-top', 'grafico', 'comparar-metodos', 'exportar', 'validar-configuracion', 'metricas'];
    if (calcPaths.some((p) => pathParts.includes(p))) {
      return { resource: 'forecast', action: 'calculate' };
    }
  }

  return { resource, action };
};

