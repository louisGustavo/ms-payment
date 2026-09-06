import { GetPaymentByIdUseCase } from './get-payment-by-id.use-case';
import { PaymentRepository } from '../ports/payment.repository.interface';
import { Payment } from '@domain/entities/payment.entity';
import { ResourceNotFoundError } from '../errors/application.error';

describe('GetPaymentByIdUseCase', () => {
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let useCase: GetPaymentByIdUseCase;

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByOrderId: jest.fn(),
    };
    useCase = new GetPaymentByIdUseCase({ paymentRepository });
  });

  it('deve retornar os detalhes do pagamento quando encontrado', async () => {
    // Arrange
    const payment = Payment.create({
      orderId: 'order-1',
      customerId: 'cust-1',
      amount: 150.0,
      paymentMethod: 'CREDIT_CARD',
      installments: 1,
    });
    payment.markAsSucceeded('txn_123');
    paymentRepository.findById.mockResolvedValueOnce(payment);

    // Act
    const result = await useCase.execute(payment.id);

    // Assert
    expect(result.id).toBe(payment.id);
    expect(result.orderId).toBe('order-1');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.transactionId).toBe('txn_123');
  });

  it('deve lançar ResourceNotFoundError quando o pagamento não existir', async () => {
    // Arrange
    paymentRepository.findById.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(useCase.execute('non-existent-id')).rejects.toThrow(ResourceNotFoundError);
  });
});
