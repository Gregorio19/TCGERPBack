import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { clpSchema } from '../../lib/validation.js';

const paymentDto = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: clpSchema.min(1).max(2147483647),
  reference: z.string().trim().min(1).max(255).optional(),
});

export const paymentsDto = z.array(paymentDto).min(1).max(100);
export type PaymentInput = z.infer<typeof paymentDto>;

export function preparePayments(payments: PaymentInput[], total: number, cashSessionId?: string) {
  let amountTendered = 0;
  let nonCash = 0;
  for (const payment of payments) {
    if (payment.method === 'efectivo') amountTendered += payment.amount;
    else nonCash += payment.amount;
  }

  if (nonCash > total || nonCash + amountTendered < total) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 'La suma de los pagos debe coincidir con el total de la orden', 400);
  }

  const change = nonCash + amountTendered - total;
  let cashRemaining = total - nonCash;
  const applied = payments.flatMap((payment) => {
    if (payment.method !== 'efectivo') return [{ ...payment, cashSessionId }];
    const amount = Math.min(payment.amount, cashRemaining);
    cashRemaining -= amount;
    return amount > 0 ? [{ ...payment, amount, cashSessionId }] : [];
  });

  return { applied, amountTendered, change };
}
