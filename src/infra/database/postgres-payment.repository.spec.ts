import { PostgresPaymentRepository } from './postgres-payment.repository';
import { PostgresPool } from './postgres.pool';
import { Payment } from '@domain/entities/payment.entity';

describe('PostgresPaymentRepository', () => {
  let pool: jest.Mocked<PostgresPool>;
  let mockClient: {
    query: jest.Mock;
    release: jest.Mock;
  };
  let repository: PostgresPaymentRepository;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    pool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn().mockResolvedValue({ rows: [] }),
      isHealthy: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
      getRawPool: jest.fn(),
    } as unknown as jest.Mocked<PostgresPool>;

    repository = new PostgresPaymentRepository(pool);
  });

  it('deve persistir pagamento e registrar eventos na tabela outbox atomicamente', async () => {
    // Arrange
    const payment = Payment.create({
      orderId: 'order-10',
      customerId: 'cust-20',
      amount: 150.0,
      paymentMethod: 'CREDIT_CARD',
      installments: 2,
    });
    payment.markAsSucceeded('txn_100');

    // Act
    await repository.save(payment);

    // Assert
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payments'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.arrayContaining([
        expect.any(String),
        'Payment',
        payment.id,
        'payment.succeeded',
        expect.any(String),
        expect.any(Date),
      ])
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('deve executar ROLLBACK e liberar o cliente se ocorrer falha na transação', async () => {
    // Arrange
    const payment = Payment.create({
      orderId: 'order-11',
      customerId: 'cust-21',
      amount: 100.0,
      paymentMethod: 'PIX',
    });
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO payments')) {
        throw new Error('Database connection lost');
      }
      return Promise.resolve({ rows: [] });
    });

    // Act & Assert
    await expect(repository.save(payment)).rejects.toThrow('Database connection lost');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('deve retornar null em findById quando registro não for encontrado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] } as any);

    const result = await repository.findById('id-inexistente');

    expect(result).toBeNull();
  });

  it('deve retornar Payment reconstituído em findById quando encontrado', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'pay-uuid-1',
          order_id: 'order-1',
          customer_id: 'cust-1',
          amount: '89.90',
          status: 'SUCCEEDED',
          payment_method: 'CREDIT_CARD',
          installments: 1,
          transaction_id: 'txn_1',
          failure_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as any);

    const result = await repository.findById('pay-uuid-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('pay-uuid-1');
    expect(result?.amount.value).toBe(89.9);
  });

  it('deve retornar Payment em findByOrderId quando encontrado', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'pay-uuid-2',
          order_id: 'order-2',
          customer_id: 'cust-2',
          amount: '120.00',
          status: 'PENDING',
          payment_method: 'BOLETO',
          installments: 1,
          transaction_id: null,
          failure_reason: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as any);

    const result = await repository.findByOrderId('order-2');

    expect(result).not.toBeNull();
    expect(result?.orderId).toBe('order-2');
    expect(result?.status).toBe('PENDING');
  });

  it('deve retornar null em findByOrderId quando não encontrado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] } as any);

    const result = await repository.findByOrderId('order-inexistente');

    expect(result).toBeNull();
  });
});
