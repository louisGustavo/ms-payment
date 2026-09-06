import { Payment } from './payment.entity';
import { Amount } from '../value-objects/amount.vo';
import {
  DomainValidationError,
  PaymentAlreadyFinalizedError,
} from '../errors/domain.error';

describe('Payment Aggregate Root', () => {
  const validProps = {
    orderId: 'order-123',
    customerId: 'cust-456',
    amount: 199.99,
    paymentMethod: 'CREDIT_CARD',
    installments: 3,
  };

  describe('Criação com Payment.create', () => {
    it('deve criar um Payment com status PENDING e valores válidos', () => {
      // Act
      const payment = Payment.create(validProps);

      // Assert
      expect(payment.id).toBeDefined();
      expect(payment.orderId).toBe('order-123');
      expect(payment.customerId).toBe('cust-456');
      expect(payment.amount.value).toBe(199.99);
      expect(payment.status).toBe('PENDING');
      expect(payment.paymentMethod).toBe('CREDIT_CARD');
      expect(payment.installments).toBe(3);
      expect(payment.transactionId).toBeNull();
      expect(payment.failureReason).toBeNull();
      expect(payment.createdAt).toBeInstanceOf(Date);
      expect(payment.updatedAt).toBeInstanceOf(Date);
      expect(payment.pullDomainEvents()).toHaveLength(0);
    });

    it('deve aceitar Amount como instância de Value Object', () => {
      // Act
      const payment = Payment.create({
        ...validProps,
        amount: new Amount(50),
      });

      // Assert
      expect(payment.amount.value).toBe(50);
    });

    it('deve definir installments padrão como 1 quando omitido', () => {
      // Act
      const payment = Payment.create({
        orderId: 'order-1',
        customerId: 'cust-1',
        amount: 100,
        paymentMethod: 'PIX',
      });

      // Assert
      expect(payment.installments).toBe(1);
    });

    it('deve lançar erro se orderId for inválido ou vazio', () => {
      expect(() => Payment.create({ ...validProps, orderId: '' })).toThrow(DomainValidationError);
      expect(() => Payment.create({ ...validProps, orderId: '   ' })).toThrow(
        'O identificador do pedido (orderId) é obrigatório.'
      );
    });

    it('deve lançar erro se customerId for inválido ou vazio', () => {
      expect(() => Payment.create({ ...validProps, customerId: '' })).toThrow(DomainValidationError);
      expect(() => Payment.create({ ...validProps, customerId: '   ' })).toThrow(
        'O identificador do cliente (customerId) é obrigatório.'
      );
    });

    it('deve lançar erro se paymentMethod for vazio', () => {
      expect(() => Payment.create({ ...validProps, paymentMethod: '' })).toThrow(DomainValidationError);
      expect(() => Payment.create({ ...validProps, paymentMethod: '  ' })).toThrow(
        'O método de pagamento (paymentMethod) é obrigatório.'
      );
    });

    it('deve lançar erro se installments for menor que 1 ou não inteiro', () => {
      expect(() => Payment.create({ ...validProps, installments: 0 })).toThrow(DomainValidationError);
      expect(() => Payment.create({ ...validProps, installments: -2 })).toThrow(DomainValidationError);
      expect(() => Payment.create({ ...validProps, installments: 1.5 })).toThrow(
        'O número de parcelas deve ser um número inteiro maior ou igual a 1.'
      );
    });
  });

  describe('Reconstituição com Payment.restore', () => {
    it('deve restaurar um pagamento existente preservando id, status e datas', () => {
      // Arrange
      const createdDate = new Date('2026-09-01T10:00:00.000Z');
      const updatedDate = new Date('2026-09-01T10:05:00.000Z');

      // Act
      const payment = Payment.restore({
        id: 'pay-uuid-999',
        orderId: 'order-123',
        customerId: 'cust-456',
        amount: 250.0,
        status: 'SUCCEEDED',
        paymentMethod: 'CREDIT_CARD',
        installments: 1,
        transactionId: 'txn_12345',
        failureReason: null,
        createdAt: createdDate,
        updatedAt: updatedDate,
      });

      // Assert
      expect(payment.id).toBe('pay-uuid-999');
      expect(payment.status).toBe('SUCCEEDED');
      expect(payment.transactionId).toBe('txn_12345');
      expect(payment.createdAt).toEqual(createdDate);
      expect(payment.updatedAt).toEqual(updatedDate);
      expect(payment.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('Transições de Estado e Eventos de Domínio', () => {
    it('deve marcar pagamento como SUCCEEDED e emitir PaymentSucceededEvent', () => {
      // Arrange
      const payment = Payment.create(validProps);

      // Act
      payment.markAsSucceeded('txn_live_abc123');

      // Assert
      expect(payment.status).toBe('SUCCEEDED');
      expect(payment.transactionId).toBe('txn_live_abc123');
      expect(payment.failureReason).toBeNull();

      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as unknown as { eventName: string; orderId: string; status: string; transactionId: string };
      expect(event.eventName).toBe('payment.succeeded');
      expect(event.orderId).toBe('order-123');
      expect(event.status).toBe('SUCCEEDED');
      expect(event.transactionId).toBe('txn_live_abc123');
    });

    it('deve marcar pagamento como FAILED e emitir PaymentFailedEvent', () => {
      // Arrange
      const payment = Payment.create(validProps);

      // Act
      payment.markAsFailed('Insufficient funds');

      // Assert
      expect(payment.status).toBe('FAILED');
      expect(payment.failureReason).toBe('Insufficient funds');

      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as unknown as { eventName: string; orderId: string; status: string; reason: string };
      expect(event.eventName).toBe('payment.failed');
      expect(event.orderId).toBe('order-123');
      expect(event.status).toBe('FAILED');
      expect(event.reason).toBe('Insufficient funds');
    });

    it('deve lançar DomainValidationError ao tentar aprovar sem transactionId', () => {
      const payment = Payment.create(validProps);
      expect(() => payment.markAsSucceeded('')).toThrow(DomainValidationError);
      expect(() => payment.markAsSucceeded('   ')).toThrow(
        'O identificador da transação (transactionId) é obrigatório ao aprovar o pagamento.'
      );
    });

    it('deve lançar DomainValidationError ao tentar recusar sem reason', () => {
      const payment = Payment.create(validProps);
      expect(() => payment.markAsFailed('')).toThrow(DomainValidationError);
      expect(() => payment.markAsFailed('   ')).toThrow(
        'O motivo da falha (reason) é obrigatório ao recusar o pagamento.'
      );
    });

    it('deve lançar PaymentAlreadyFinalizedError ao tentar alterar pagamento já aprovado', () => {
      const payment = Payment.create(validProps);
      payment.markAsSucceeded('txn_1');

      expect(() => payment.markAsSucceeded('txn_2')).toThrow(PaymentAlreadyFinalizedError);
      expect(() => payment.markAsFailed('Another reason')).toThrow(PaymentAlreadyFinalizedError);
    });

    it('deve lançar PaymentAlreadyFinalizedError ao tentar alterar pagamento já recusado', () => {
      const payment = Payment.create(validProps);
      payment.markAsFailed('Reason 1');

      expect(() => payment.markAsSucceeded('txn_1')).toThrow(PaymentAlreadyFinalizedError);
      expect(() => payment.markAsFailed('Reason 2')).toThrow(PaymentAlreadyFinalizedError);
    });

    it('deve limpar os eventos de domínio com clearDomainEvents', () => {
      const payment = Payment.create(validProps);
      payment.markAsSucceeded('txn_1');

      payment.clearDomainEvents();
      expect(payment.pullDomainEvents()).toHaveLength(0);
    });
  });
});
