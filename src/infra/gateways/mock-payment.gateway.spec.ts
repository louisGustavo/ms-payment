import { MockPaymentGateway } from './mock-payment.gateway';

describe('MockPaymentGateway', () => {
  let gateway: MockPaymentGateway;

  beforeEach(() => {
    // Para execução rápida de testes, configuramos delay 0
    gateway = new MockPaymentGateway({ minDelayMs: 0, maxDelayMs: 0 });
  });

  it('deve instanciar sem options e usar valores padrão de env', () => {
    const defaultGateway = new MockPaymentGateway();
    expect(defaultGateway).toBeDefined();
  });

  it('deve aprovar transação com sucesso para customerId padrão e gerar txn_live_', async () => {
    const result = await gateway.processTransaction({
      orderId: 'order-1',
      customerId: 'cust-regular-123',
      amount: 150.0,
      paymentMethod: 'CREDIT_CARD',
      installments: 1,
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toMatch(/^txn_live_[a-f0-9]{16}$/);
    expect(result.failureReason).toBeUndefined();
  });

  it('deve recusar deterministicamente transação para customerId "teste-123"', async () => {
    const result = await gateway.processTransaction({
      orderId: 'order-2',
      customerId: 'teste-123',
      amount: 100.0,
      paymentMethod: 'CREDIT_CARD',
      installments: 1,
    });

    expect(result.success).toBe(false);
    expect(result.transactionId).toBeUndefined();
    expect(result.failureReason).toBe('Insufficient funds / Test customer declined');
  });

  it('deve executar com latência quando configurada', async () => {
    const latencyGateway = new MockPaymentGateway({ minDelayMs: 20, maxDelayMs: 50 });
    const start = Date.now();
    await latencyGateway.processTransaction({
      orderId: 'order-3',
      customerId: 'cust-regular',
      amount: 50.0,
      paymentMethod: 'PIX',
      installments: 1,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(15);
  });
});
