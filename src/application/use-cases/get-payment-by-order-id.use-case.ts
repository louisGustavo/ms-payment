import { PaymentRepository } from '../ports/payment.repository.interface';
import { GetPaymentOutputDTO } from '../dtos/get-payment.dto';
import { ResourceNotFoundError } from '../errors/application.error';

export interface GetPaymentByOrderIdUseCaseDependencies {
  readonly paymentRepository: PaymentRepository;
}

export class GetPaymentByOrderIdUseCase {
  constructor(private readonly deps: GetPaymentByOrderIdUseCaseDependencies) {}

  public async execute(orderId: string): Promise<GetPaymentOutputDTO> {
    const payment = await this.deps.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      throw new ResourceNotFoundError(orderId);
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      customerId: payment.customerId,
      amount: payment.amount.value,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      installments: payment.installments,
      transactionId: payment.transactionId,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}
