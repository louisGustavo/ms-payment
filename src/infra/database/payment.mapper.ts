import { Payment, PaymentStatus } from '@domain/entities/payment.entity';

export interface PaymentPersistenceRow {
  readonly id: string;
  readonly order_id: string;
  readonly customer_id: string;
  readonly amount: string | number;
  readonly status: string;
  readonly payment_method: string;
  readonly installments: number;
  readonly transaction_id: string | null;
  readonly failure_reason: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export interface PaymentPersistenceModel {
  readonly id: string;
  readonly order_id: string;
  readonly customer_id: string;
  readonly amount: number;
  readonly status: PaymentStatus;
  readonly payment_method: string;
  readonly installments: number;
  readonly transaction_id: string | null;
  readonly failure_reason: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export class PaymentMapper {
  public static toDomain(row: PaymentPersistenceRow): Payment {
    const rawAmount = typeof row.amount === 'string' ? parseFloat(row.amount) : row.amount;

    return Payment.restore({
      id: row.id,
      orderId: row.order_id,
      customerId: row.customer_id,
      amount: rawAmount,
      status: row.status as PaymentStatus,
      paymentMethod: row.payment_method,
      installments: row.installments,
      transactionId: row.transaction_id,
      failureReason: row.failure_reason,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    });
  }

  public static toPersistence(payment: Payment): PaymentPersistenceModel {
    return {
      id: payment.id,
      order_id: payment.orderId,
      customer_id: payment.customerId,
      amount: payment.amount.value,
      status: payment.status,
      payment_method: payment.paymentMethod,
      installments: payment.installments,
      transaction_id: payment.transactionId,
      failure_reason: payment.failureReason,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }
}
