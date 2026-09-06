import { ProcessPaymentUseCase } from './process-payment.use-case';
import { PaymentRepository } from '../ports/payment.repository.interface';
import { PaymentGateway } from '../ports/payment.gateway.interface';
import { CardTokenVaultGateway } from '../ports/card-token-vault.gateway.interface';
import { Payment } from '@domain/entities/payment.entity';
import { ProcessPaymentInputDTO } from '../dtos/process-payment.dto';

describe('ProcessPaymentUseCase', () => {
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let paymentGateway: jest.Mocked<PaymentGateway>;
  let cardTokenVaultGateway: jest.Mocked<CardTokenVaultGateway>;
  let useCase: ProcessPaymentUseCase;

  const sampleInput: ProcessPaymentInputDTO = {
    orderId: 'order-uuid-100',
    customerId: 'cust-998877',
    totalAmount: 149.9,
    shippingCost: 15.0,
    paymentDetails: {
      method: 'CREDIT_CARD',
      paymentMethodId: 'tok_visa_123456789',
      installments: 3,
    },
  };

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByOrderId: jest.fn().mockResolvedValue(null),
    };

    paymentGateway = {
      processTransaction: jest.fn().mockResolvedValue({
        success: true,
        transactionId: 'txn_live_99999',
      }),
    };

    cardTokenVaultGateway = {
      getCardDataByToken: jest.fn().mockResolvedValue({
        brand: 'VISA',
        last4: '1234',
        cardholderName: 'LUIS SILVA',
      }),
    };

    useCase = new ProcessPaymentUseCase({
      paymentRepository,
      paymentGateway,
      cardTokenVaultGateway,
    });
  });

  it('deve respeitar a idempotência se o pedido já foi processado anteriormente', async () => {
    // Arrange
    const existingPayment = Payment.create({
      orderId: 'order-uuid-100',
      customerId: 'cust-998877',
      amount: 149.9,
      paymentMethod: 'CREDIT_CARD',
      installments: 3,
    });
    existingPayment.markAsSucceeded('txn_existing_123');
    paymentRepository.findByOrderId.mockResolvedValueOnce(existingPayment);

    // Act
    const result = await useCase.execute(sampleInput);

    // Assert
    expect(result.isDuplicate).toBe(true);
    expect(result.paymentId).toBe(existingPayment.id);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.transactionId).toBe('txn_existing_123');
    expect(paymentGateway.processTransaction).not.toHaveBeenCalled();
    expect(cardTokenVaultGateway.getCardDataByToken).not.toHaveBeenCalled();
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('deve processar pagamento com cartão de crédito com sucesso', async () => {
    // Act
    const result = await useCase.execute(sampleInput);

    // Assert
    expect(cardTokenVaultGateway.getCardDataByToken).toHaveBeenCalledWith('tok_visa_123456789');
    expect(paymentGateway.processTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-uuid-100',
        customerId: 'cust-998877',
        amount: 149.9,
        paymentMethod: 'CREDIT_CARD',
        installments: 3,
        cardDetails: {
          brand: 'VISA',
          last4: '1234',
          cardholderName: 'LUIS SILVA',
        },
      })
    );
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.transactionId).toBe('txn_live_99999');
    expect(result.orderId).toBe('order-uuid-100');
  });

  it('deve marcar como FAILED quando o gateway rejeitar a transação', async () => {
    // Arrange
    paymentGateway.processTransaction.mockResolvedValueOnce({
      success: false,
      failureReason: 'Insufficient funds / Test customer declined',
    });

    // Act
    const result = await useCase.execute({
      ...sampleInput,
      customerId: 'teste-123',
    });

    // Assert
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toBe('Insufficient funds / Test customer declined');
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deve marcar como FAILED quando método for cartão mas token não for informado', async () => {
    // Arrange
    const inputWithoutToken: ProcessPaymentInputDTO = {
      ...sampleInput,
      paymentDetails: {
        method: 'CREDIT_CARD',
        paymentMethodId: '',
      },
    };

    // Act
    const result = await useCase.execute(inputWithoutToken);

    // Assert
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('Token do cartão (paymentMethodId) não foi fornecido');
    expect(cardTokenVaultGateway.getCardDataByToken).not.toHaveBeenCalled();
    expect(paymentGateway.processTransaction).not.toHaveBeenCalled();
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deve marcar como FAILED se a consulta ao cofre de cartões falhar', async () => {
    // Arrange
    cardTokenVaultGateway.getCardDataByToken.mockRejectedValueOnce(new Error('Vault service timeout'));

    // Act
    const result = await useCase.execute(sampleInput);

    // Assert
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('Falha ao obter dados do cartão no cofre de tokens: Vault service timeout');
    expect(paymentGateway.processTransaction).not.toHaveBeenCalled();
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deve marcar como FAILED quando o método de pagamento não for suportado', async () => {
    // Arrange
    const inputUnsupported: ProcessPaymentInputDTO = {
      ...sampleInput,
      paymentDetails: {
        method: 'CRYPTO_BITCOIN',
      },
    };

    // Act
    const result = await useCase.execute(inputUnsupported);

    // Assert
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain("Método de pagamento 'CRYPTO_BITCOIN' não é suportado.");
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deve processar pagamento via PIX sem consultar cofre de cartões', async () => {
    // Arrange
    const pixInput: ProcessPaymentInputDTO = {
      orderId: 'order-pix-1',
      customerId: 'cust-pix-1',
      totalAmount: 75.5,
      paymentDetails: {
        method: 'PIX',
      },
    };

    // Act
    const result = await useCase.execute(pixInput);

    // Assert
    expect(cardTokenVaultGateway.getCardDataByToken).not.toHaveBeenCalled();
    expect(paymentGateway.processTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-pix-1',
        paymentMethod: 'PIX',
        installments: 1,
        cardDetails: undefined,
      })
    );
    expect(result.status).toBe('SUCCEEDED');
  });

  it('deve processar pagamento via BOLETO sem consultar cofre de cartões', async () => {
    // Arrange
    const boletoInput: ProcessPaymentInputDTO = {
      orderId: 'order-boleto-1',
      customerId: 'cust-boleto-1',
      totalAmount: 120.0,
      paymentDetails: {
        method: 'BOLETO',
      },
    };

    // Act
    const result = await useCase.execute(boletoInput);

    // Assert
    expect(cardTokenVaultGateway.getCardDataByToken).not.toHaveBeenCalled();
    expect(paymentGateway.processTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-boleto-1',
        paymentMethod: 'BOLETO',
        installments: 1,
      })
    );
    expect(result.status).toBe('SUCCEEDED');
  });

  it('deve tratar exceção inesperada do gateway marcando como FAILED', async () => {
    // Arrange
    paymentGateway.processTransaction.mockRejectedValueOnce(new Error('Connection reset by peer'));

    // Act
    const result = await useCase.execute(sampleInput);

    // Assert
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('Falha de comunicação com gateway de pagamento: Connection reset by peer');
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
  });
});
