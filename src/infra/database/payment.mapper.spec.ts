import { PaymentMapper, PaymentPersistenceRow } from './payment.mapper';
import { Payment } from '@domain/entities/payment.entity';

describe('PaymentMapper', () => {
  it('deve converter PaymentPersistenceRow para o domínio corretamente', () => {
    const row: PaymentPersistenceRow = {
      id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      order_id: 'order-100',
      customer_id: 'cust-200',
      amount: '149.90',
      status: 'SUCCEEDED',
      payment_method: 'CREDIT_CARD',
      installments: 3,
      transaction_id: 'txn_123',
      failure_reason: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:05:00.000Z',
    };

    const payment = PaymentMapper.toDomain(row);

    expect(payment.id).toBe(row.id);
    expect(payment.orderId).toBe('order-100');
    expect(payment.customerId).toBe('cust-200');
    expect(payment.amount.value).toBe(149.9);
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paymentMethod).toBe('CREDIT_CARD');
    expect(payment.installments).toBe(3);
    expect(payment.transactionId).toBe('txn_123');
    expect(payment.failureReason).toBeNull();
  });

  it('deve converter PaymentPersistenceRow com amount numérico', () => {
    const row: PaymentPersistenceRow = {
      id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      order_id: 'order-101',
      customer_id: 'cust-201',
      amount: 200.5,
      status: 'PENDING',
      payment_method: 'PIX',
      installments: 1,
      transaction_id: null,
      failure_reason: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const payment = PaymentMapper.toDomain(row);
    expect(payment.amount.value).toBe(200.5);
  });

  it('deve converter entidade de domínio para formato de persistência', () => {
    const payment = Payment.create({
      orderId: 'order-200',
      customerId: 'cust-300',
      amount: 99.9,
      paymentMethod: 'PIX',
      installments: 1,
    });
    payment.markAsSucceeded('txn_pix_1');

    const persistence = PaymentMapper.toPersistence(payment);

    expect(persistence.id).toBe(payment.id);
    expect(persistence.order_id).toBe('order-200');
    expect(persistence.customer_id).toBe('cust-300');
    expect(persistence.amount).toBe(99.9);
    expect(persistence.status).toBe('SUCCEEDED');
    expect(persistence.payment_method).toBe('PIX');
    expect(persistence.installments).toBe(1);
    expect(persistence.transaction_id).toBe('txn_pix_1');
    expect(persistence.failure_reason).toBeNull();
  });
});
