import { PaymentRepository } from '../ports/payment.repository.interface';
import { GetPaymentOutputDTO } from '../dtos/get-payment.dto';
import { ResourceNotFoundError } from '../errors/application.error';

export interface GetPaymentByIdUseCaseDependencies {
  readonly paymentRepository: PaymentRepository;
}

export class GetPaymentByIdUseCase {
  constructor(private readonly deps: GetPaymentByIdUseCaseDependencies) {}

  public async execute(paymentId: string): Promise<GetPaymentOutputDTO> {
    const payment = await this.deps.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new ResourceNotFoundError(paymentId);
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
