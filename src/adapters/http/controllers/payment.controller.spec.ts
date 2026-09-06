import { PaymentController } from './payment.controller';
import { GetPaymentByIdUseCase } from '@application/use-cases/get-payment-by-id.use-case';
import { GetPaymentByOrderIdUseCase } from '@application/use-cases/get-payment-by-order-id.use-case';
import { ResourceNotFoundError } from '@application/errors/application.error';
import { FastifyReply, FastifyRequest } from 'fastify';

describe('PaymentController', () => {
  let getPaymentByIdUseCase: jest.Mocked<GetPaymentByIdUseCase>;
  let getPaymentByOrderIdUseCase: jest.Mocked<GetPaymentByOrderIdUseCase>;
  let controller: PaymentController;
  let mockReply: {
    status: jest.Mock;
    send: jest.Mock;
  };

  beforeEach(() => {
    getPaymentByIdUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetPaymentByIdUseCase>;

    getPaymentByOrderIdUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetPaymentByOrderIdUseCase>;

    controller = new PaymentController(getPaymentByIdUseCase, getPaymentByOrderIdUseCase);

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('getById', () => {
    it('deve retornar 200 com os dados do pagamento', async () => {
      const mockPayment = {
        id: 'pay-1',
        orderId: 'order-1',
        customerId: 'cust-1',
        amount: 100,
        status: 'SUCCEEDED' as const,
        paymentMethod: 'CREDIT_CARD',
        installments: 1,
        transactionId: 'txn_1',
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      getPaymentByIdUseCase.execute.mockResolvedValueOnce(mockPayment);

      const mockRequest = { params: { id: 'pay-1' } } as unknown as FastifyRequest<{ Params: { id: string } }>;

      await controller.getById(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true, data: mockPayment });
    });

    it('deve retornar 404 quando o pagamento não for encontrado', async () => {
      getPaymentByIdUseCase.execute.mockRejectedValueOnce(new ResourceNotFoundError('pay-not-found'));

      const mockRequest = { params: { id: 'pay-not-found' } } as unknown as FastifyRequest<{ Params: { id: string } }>;

      await controller.getById(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('pay-not-found'),
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('getByOrderId', () => {
    it('deve retornar 200 com os dados do pagamento por orderId', async () => {
      const mockPayment = {
        id: 'pay-2',
        orderId: 'order-2',
        customerId: 'cust-2',
        amount: 50,
        status: 'PENDING' as const,
        paymentMethod: 'PIX',
        installments: 1,
        transactionId: null,
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      getPaymentByOrderIdUseCase.execute.mockResolvedValueOnce(mockPayment);

      const mockRequest = { params: { orderId: 'order-2' } } as unknown as FastifyRequest<{ Params: { orderId: string } }>;

      await controller.getByOrderId(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true, data: mockPayment });
    });

    it('deve retornar 404 quando pedido não tiver pagamento registrado', async () => {
      getPaymentByOrderIdUseCase.execute.mockRejectedValueOnce(new ResourceNotFoundError('order-not-found'));

      const mockRequest = { params: { orderId: 'order-not-found' } } as unknown as FastifyRequest<{ Params: { orderId: string } }>;

      await controller.getByOrderId(mockRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('order-not-found'),
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('deve relançar erro inesperado em getById', async () => {
      getPaymentByIdUseCase.execute.mockRejectedValueOnce(new Error('DB failure'));
      const mockRequest = { params: { id: 'pay-err' } } as unknown as FastifyRequest<{ Params: { id: string } }>;
      await expect(controller.getById(mockRequest, mockReply as unknown as FastifyReply)).rejects.toThrow('DB failure');
    });

    it('deve relançar erro inesperado em getByOrderId', async () => {
      getPaymentByOrderIdUseCase.execute.mockRejectedValueOnce(new Error('DB failure 2'));
      const mockRequest = { params: { orderId: 'order-err' } } as unknown as FastifyRequest<{ Params: { orderId: string } }>;
      await expect(controller.getByOrderId(mockRequest, mockReply as unknown as FastifyReply)).rejects.toThrow('DB failure 2');
    });
  });
});
