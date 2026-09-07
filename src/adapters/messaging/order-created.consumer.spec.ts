import { OrderCreatedConsumer } from './order-created.consumer';
import { ProcessPaymentUseCase } from '@application/use-cases/process-payment.use-case';
import { DistributedLockService } from '@application/ports/distributed-lock.service';
import { Channel, ConsumeMessage } from 'amqplib';

describe('OrderCreatedConsumer', () => {
  let mockChannel: jest.Mocked<Partial<Channel>>;
  let mockUseCase: jest.Mocked<Partial<ProcessPaymentUseCase>>;
  let mockLockService: jest.Mocked<DistributedLockService>;
  let consumer: OrderCreatedConsumer;

  const validPayload = {
    eventName: 'OrderCreated',
    occurredAt: '2026-09-05T21:00:00.000Z',
    orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    customerId: 'cust-998877',
    totalAmount: 149.9,
    shippingCost: 15.0,
    items: [
      {
        id: 'item-1',
        productId: 'prod-100',
        name: 'Teclado Mecânico',
        unitPrice: 134.9,
        quantity: 1,
        subtotal: 134.9,
      },
    ],
    paymentDetails: {
      method: 'CREDIT_CARD',
      paymentMethodId: 'tok_visa_123456789',
      installments: 3,
    },
    createdAt: '2026-09-05T21:00:00.000Z',
  };

  const createMockMessage = (content: any): ConsumeMessage => ({
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    fields: {} as any,
    properties: {} as any,
  });

  beforeEach(() => {
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({ exchange: 'test' } as any),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test' } as any),
      bindQueue: jest.fn().mockResolvedValue({} as any),
      prefetch: jest.fn().mockResolvedValue({} as any),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'tag' } as any),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockUseCase = {
      execute: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'SUCCEEDED',
        transactionId: 'txn_123',
      }),
    };

    mockLockService = {
      acquire: jest.fn().mockResolvedValue('mock-token-uuid-1234'),
      release: jest.fn().mockResolvedValue(true),
    };

    consumer = new OrderCreatedConsumer(
      mockChannel as unknown as Channel,
      mockUseCase as unknown as ProcessPaymentUseCase,
      mockLockService
    );
  });

  it('deve configurar a topologia de exchanges e filas com DLQ corretamente', async () => {
    await consumer.setupTopology();

    expect(mockChannel.assertExchange).toHaveBeenCalledTimes(3);
    expect(mockChannel.assertQueue).toHaveBeenCalledTimes(2);
    expect(mockChannel.bindQueue).toHaveBeenCalledTimes(2);
    expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
  });

  it('deve inicializar o consumo com sucesso no start() e processar mensagem via callback', async () => {
    let messageCallback: ((msg: ConsumeMessage | null) => Promise<void>) | null = null;
    (mockChannel.consume as jest.Mock).mockImplementation((_queue, cb) => {
      messageCallback = cb;
      return Promise.resolve({ consumerTag: 'tag-1' });
    });

    await consumer.start();
    expect(mockChannel.consume).toHaveBeenCalled();

    // Testa mensagem nula
    await messageCallback!(null);

    // Testa mensagem válida
    const validMsg = createMockMessage(validPayload);
    await messageCallback!(validMsg);
    expect(mockChannel.ack).toHaveBeenCalledWith(validMsg);

    // Testa mensagem que causa exceção no processamento
    const errorMsg = createMockMessage(validPayload);
    mockUseCase.execute = jest.fn().mockRejectedValueOnce(new Error('Fatal unhandled error'));
    await messageCallback!(errorMsg);
    expect(mockChannel.nack).toHaveBeenCalledWith(errorMsg, false, false);
  });

  it('deve processar mensagem válida, adquirindo o lock e liberando no finally, e confirmando com ACK', async () => {
    const msg = createMockMessage(validPayload);

    await consumer.handleMessage(msg);

    const expectedLockResource = `lock:payment:order:${validPayload.orderId}`;
    expect(mockLockService.acquire).toHaveBeenCalledWith(expectedLockResource, expect.any(Number));
    expect(mockUseCase.execute).toHaveBeenCalledWith({
      orderId: validPayload.orderId,
      customerId: validPayload.customerId,
      totalAmount: validPayload.totalAmount,
      shippingCost: validPayload.shippingCost,
      paymentDetails: {
        method: 'CREDIT_CARD',
        paymentMethodId: 'tok_visa_123456789',
        installments: 3,
      },
    });
    expect(mockLockService.release).toHaveBeenCalledWith(expectedLockResource, 'mock-token-uuid-1234');
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('deve descartar com ACK e registrar aviso quando o lock distribuído NÃO for adquirido (concorrência detectada)', async () => {
    mockLockService.acquire.mockResolvedValueOnce(null);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const msg = createMockMessage(validPayload);
    await consumer.handleMessage(msg);

    const expectedLockResource = `lock:payment:order:${validPayload.orderId}`;
    expect(mockLockService.acquire).toHaveBeenCalledWith(expectedLockResource, expect.any(Number));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Concorrência detectada: Lock 'lock:payment:order:")
    );
    expect(mockUseCase.execute).not.toHaveBeenCalled();
    expect(mockLockService.release).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.nack).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('deve garantir que o lock é liberado mesmo se o caso de uso lançar exceção', async () => {
    mockUseCase.execute = jest.fn().mockRejectedValueOnce(new Error('Falha no gateway'));
    const msg = createMockMessage(validPayload);

    const expectedLockResource = `lock:payment:order:${validPayload.orderId}`;

    await expect(consumer.handleMessage(msg)).rejects.toThrow('Falha no gateway');

    expect(mockLockService.acquire).toHaveBeenCalledWith(expectedLockResource, expect.any(Number));
    expect(mockLockService.release).toHaveBeenCalledWith(expectedLockResource, 'mock-token-uuid-1234');
  });

  it('deve processar mensagem encapsulada no envelope CDC do Debezium (payload como string JSON)', async () => {
    const debeziumEnvelope = {
      schema: {
        type: 'string',
        name: 'io.debezium.data.Json',
        version: 1,
      },
      payload: JSON.stringify(validPayload),
    };
    const msg = createMockMessage(debeziumEnvelope);

    await consumer.handleMessage(msg);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: validPayload.orderId,
        customerId: validPayload.customerId,
        totalAmount: validPayload.totalAmount,
      })
    );
    expect(mockLockService.release).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('deve processar mensagem encapsulada no envelope CDC do Debezium (payload como objeto)', async () => {
    const debeziumEnvelope = {
      schema: { type: 'struct' },
      payload: validPayload,
    };
    const msg = createMockMessage(debeziumEnvelope);

    await consumer.handleMessage(msg);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: validPayload.orderId,
      })
    );
    expect(mockLockService.release).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('deve confirmar com ACK quando o pedido já foi processado (idempotência)', async () => {
    mockUseCase.execute = jest.fn().mockResolvedValueOnce({
      paymentId: 'pay-old',
      orderId: validPayload.orderId,
      status: 'SUCCEEDED',
      isDuplicate: true,
    });

    const msg = createMockMessage(validPayload);
    await consumer.handleMessage(msg);

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockLockService.release).toHaveBeenCalled();
  });

  it('deve rejeitar e enviar para DLQ com NACK quando o JSON for corrompido sem adquirir lock', async () => {
    const msg = createMockMessage('invalid-json{');

    await consumer.handleMessage(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockLockService.acquire).not.toHaveBeenCalled();
  });

  it('deve rejeitar e enviar para DLQ quando faltarem campos obrigatórios no contrato sem adquirir lock', async () => {
    const msg = createMockMessage({
      orderId: '',
      customerId: 'cust-1',
    });

    await consumer.handleMessage(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockLockService.acquire).not.toHaveBeenCalled();
  });
});
