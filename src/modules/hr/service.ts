import { employeesService } from './employees.service.js';
import { contractsService } from './contracts.service.js';
import { payrollService } from './payroll.service.js';
import { schedulesService } from './schedules.service.js';
import { positionsService } from './positions.service.js';
import { parametersService } from './parameters.service.js';

export const hrService = {
  ...employeesService,
  ...contractsService,
  ...payrollService,
  ...schedulesService,
  ...positionsService,
  ...parametersService,
};
