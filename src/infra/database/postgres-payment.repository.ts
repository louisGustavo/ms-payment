import { randomUUID } from 'node:crypto';
import { Payment } from '@domain/entities/payment.entity';
import { PaymentRepository } from '@application/ports/payment.repository.interface';
import { PostgresPool } from './postgres.pool';
import { PaymentMapper, PaymentPersistenceRow } from './payment.mapper';

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: PostgresPool = PostgresPool.getInstance()) {}

  public async save(payment: Payment): Promise<void> {
    const client = await this.pool.connect();
    const persistenceModel = PaymentMapper.toPersistence(payment);

    try {
      await client.query('BEGIN');

      // 1. Upsert do registro na tabela payments
      const upsertPaymentSql = `
        INSERT INTO payments (
          id, order_id, customer_id, amount, status, payment_method, 
          installments, transaction_id, failure_reason, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (order_id) DO UPDATE SET
          status = EXCLUDED.status,
          transaction_id = EXCLUDED.transaction_id,
          failure_reason = EXCLUDED.failure_reason,
          updated_at = EXCLUDED.updated_at;
      `;

      await client.query(upsertPaymentSql, [
        persistenceModel.id,
        persistenceModel.order_id,
        persistenceModel.customer_id,
        persistenceModel.amount,
        persistenceModel.status,
        persistenceModel.payment_method,
        persistenceModel.installments,
        persistenceModel.transaction_id,
        persistenceModel.failure_reason,
        persistenceModel.created_at,
        persistenceModel.updated_at,
      ]);

      // 2. Coleta dos eventos de domínio acumulados no agregado
      const domainEvents = payment.pullDomainEvents();

      if (domainEvents.length > 0) {
        const insertOutboxSql = `
          INSERT INTO outbox (id, aggregatetype, aggregateid, type, payload, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6);
        `;

        for (const event of domainEvents) {
          await client.query(insertOutboxSql, [
            randomUUID(),
            'Payment',
            payment.id,
            event.eventName,
            JSON.stringify(event),
            event.occurredAt,
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async findById(id: string): Promise<Payment | null> {
    const query = `
      SELECT id, order_id, customer_id, amount, status, payment_method, 
             installments, transaction_id, failure_reason, created_at, updated_at
      FROM payments
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await this.pool.query<PaymentPersistenceRow>(query, [id]);
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return PaymentMapper.toDomain(row);
  }

  public async findByOrderId(orderId: string): Promise<Payment | null> {
    const query = `
      SELECT id, order_id, customer_id, amount, status, payment_method, 
             installments, transaction_id, failure_reason, created_at, updated_at
      FROM payments
      WHERE order_id = $1
      LIMIT 1;
    `;

    const result = await this.pool.query<PaymentPersistenceRow>(query, [orderId]);
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return PaymentMapper.toDomain(row);
  }
}
