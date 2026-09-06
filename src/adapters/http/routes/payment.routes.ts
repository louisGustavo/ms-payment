import { FastifyInstance } from 'fastify';
import { PaymentController } from '../controllers/payment.controller';

export async function createPaymentRoutes(controller: PaymentController) {
  return async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get<{ Params: { id: string } }>(
      '/payments/:id',
      {
        schema: {
          description: 'Recupera os detalhes de um pagamento pelo seu identificador UUID',
          tags: ['Payments'],
          params: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uuid' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    orderId: { type: 'string' },
                    customerId: { type: 'string' },
                    amount: { type: 'number' },
                    status: { type: 'string' },
                    paymentMethod: { type: 'string' },
                    installments: { type: 'number' },
                    transactionId: { type: 'string', nullable: true },
                    failureReason: { type: 'string', nullable: true },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                },
              },
            },
            404: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
        },
      },
      async (request, reply) => controller.getById(request, reply)
    );

    fastify.get<{ Params: { orderId: string } }>(
      '/payments/order/:orderId',
      {
        schema: {
          description: 'Recupera os detalhes de um pagamento pelo identificador do pedido (orderId)',
          tags: ['Payments'],
          params: {
            type: 'object',
            required: ['orderId'],
            properties: {
              orderId: { type: 'string' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    orderId: { type: 'string' },
                    customerId: { type: 'string' },
                    amount: { type: 'number' },
                    status: { type: 'string' },
                    paymentMethod: { type: 'string' },
                    installments: { type: 'number' },
                    transactionId: { type: 'string', nullable: true },
                    failureReason: { type: 'string', nullable: true },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                  },
                },
              },
            },
            404: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
        },
      },
      async (request, reply) => controller.getByOrderId(request, reply)
    );
  };
}
