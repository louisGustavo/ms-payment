import { GetPaymentByOrderIdUseCase } from './get-payment-by-order-id.use-case';
import { PaymentRepository } from '../ports/payment.repository.interface';
import { Payment } from '@domain/entities/payment.entity';
import { ResourceNotFoundError } from '../errors/application.error';

describe('GetPaymentByOrderIdUseCase', () => {
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let useCase: GetPaymentByOrderIdUseCase;

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByOrderId: jest.fn(),
    };
    useCase = new GetPaymentByOrderIdUseCase({ paymentRepository });
  });

  it('deve retornar os dados do pagamento quando encontrado pelo orderId', async () => {
    const payment = Payment.create({
      orderId: 'order-xyz',
      customerId: 'cust-xyz',
      amount: 80.0,
      paymentMethod: 'PIX',
    });
    payment.markAsSucceeded('txn_pix_99');
    paymentRepository.findByOrderId.mockResolvedValueOnce(payment);

    const result = await useCase.execute('order-xyz');

    expect(result.orderId).toBe('order-xyz');
    expect(result.amount).toBe(80.0);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.transactionId).toBe('txn_pix_99');
  });

  it('deve lançar ResourceNotFoundError quando não encontrar pagamento para o orderId', async () => {
    paymentRepository.findByOrderId.mockResolvedValueOnce(null);

    await expect(useCase.execute('order-inexistente')).rejects.toThrow(ResourceNotFoundError);
  });
});
