import { Payment } from '@domain/entities/payment.entity';
import { PaymentRepository } from '../ports/payment.repository.interface';
import { PaymentGateway } from '../ports/payment.gateway.interface';
import { CardDetails, CardTokenVaultGateway } from '../ports/card-token-vault.gateway.interface';
import { ProcessPaymentInputDTO, ProcessPaymentOutputDTO } from '../dtos/process-payment.dto';

export interface ProcessPaymentUseCaseDependencies {
  readonly paymentRepository: PaymentRepository;
  readonly paymentGateway: PaymentGateway;
  readonly cardTokenVaultGateway: CardTokenVaultGateway;
}

export class ProcessPaymentUseCase {
  constructor(private readonly deps: ProcessPaymentUseCaseDependencies) {}

  public async execute(input: ProcessPaymentInputDTO): Promise<ProcessPaymentOutputDTO> {
    // 1. Verificação de Idempotência: Se o pedido já possui pagamento registrado, descarta sem duplicar cobrança ou evento
    const existingPayment = await this.deps.paymentRepository.findByOrderId(input.orderId);
    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        status: existingPayment.status,
        transactionId: existingPayment.transactionId ?? undefined,
        failureReason: existingPayment.failureReason ?? undefined,
        isDuplicate: true,
      };
    }

    const method = input.paymentDetails.method ? input.paymentDetails.method.trim().toUpperCase() : '';
    const installments = input.paymentDetails.installments ?? 1;

    // 2. Criação do Agregado em estado inicial PENDING
    const payment = Payment.create({
      orderId: input.orderId,
      customerId: input.customerId,
      amount: input.totalAmount,
      paymentMethod: method || 'UNKNOWN',
      installments,
    });

    // 3. Validação de métodos suportados
    const supportedMethods = ['CREDIT_CARD', 'PIX', 'BOLETO'];
    if (!supportedMethods.includes(method)) {
      payment.markAsFailed(`Método de pagamento '${method || 'NÃO INFORMADO'}' não é suportado.`);
      await this.deps.paymentRepository.save(payment);
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        failureReason: payment.failureReason ?? undefined,
      };
    }

    // 4. Se for cartão de crédito, consulta o cofre de tokens
    let cardDetails: CardDetails | undefined;
    if (method === 'CREDIT_CARD') {
      const token = input.paymentDetails.paymentMethodId;
      if (!token || token.trim() === '') {
        payment.markAsFailed('Token do cartão (paymentMethodId) não foi fornecido para pagamento via cartão de crédito.');
        await this.deps.paymentRepository.save(payment);
        return {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: payment.status,
          failureReason: payment.failureReason ?? undefined,
        };
      }

      try {
        cardDetails = await this.deps.cardTokenVaultGateway.getCardDataByToken(token.trim());
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Falha ao consultar cofre de cartões';
        payment.markAsFailed(`Falha ao obter dados do cartão no cofre de tokens: ${errorMsg}`);
        await this.deps.paymentRepository.save(payment);
        return {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: payment.status,
          failureReason: payment.failureReason ?? undefined,
        };
      }
    }

    // 5. Execução da cobrança no Gateway de Pagamento
    try {
      const result = await this.deps.paymentGateway.processTransaction({
        orderId: input.orderId,
        customerId: input.customerId,
        amount: input.totalAmount,
        paymentMethod: method,
        installments,
        cardDetails,
      });

      if (result.success && result.transactionId) {
        payment.markAsSucceeded(result.transactionId);
      } else {
        payment.markAsFailed(result.failureReason ?? 'Transação recusada pelo gateway de pagamento.');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro inesperado no gateway de pagamento';
      payment.markAsFailed(`Falha de comunicação com gateway de pagamento: ${errorMsg}`);
    }

    // 6. Persistência atômica da entidade e dos eventos na Outbox
    await this.deps.paymentRepository.save(payment);

    // 7. Retorno do DTO com resultado do processamento
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      transactionId: payment.transactionId ?? undefined,
      failureReason: payment.failureReason ?? undefined,
    };
  }
}
