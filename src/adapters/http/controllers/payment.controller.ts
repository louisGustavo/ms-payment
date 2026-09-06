import { FastifyReply, FastifyRequest } from 'fastify';
import { GetPaymentByIdUseCase } from '@application/use-cases/get-payment-by-id.use-case';
import { GetPaymentByOrderIdUseCase } from '@application/use-cases/get-payment-by-order-id.use-case';
import { ResourceNotFoundError } from '@application/errors/application.error';

export class PaymentController {
  constructor(
    private readonly getPaymentByIdUseCase: GetPaymentByIdUseCase,
    private readonly getPaymentByOrderIdUseCase: GetPaymentByOrderIdUseCase
  ) {}

  public async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const payment = await this.getPaymentByIdUseCase.execute(request.params.id);
      await reply.status(200).send({ success: true, data: payment });
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        await reply.status(404).send({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }

  public async getByOrderId(
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const payment = await this.getPaymentByOrderIdUseCase.execute(request.params.orderId);
      await reply.status(200).send({ success: true, data: payment });
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        await reply.status(404).send({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }
}
