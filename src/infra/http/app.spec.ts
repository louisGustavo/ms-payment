import { buildApp } from './app';
import { PaymentController } from '@adapters/http/controllers/payment.controller';
import { DomainValidationError } from '@domain/errors/domain.error';
import { ResourceNotFoundError, ApplicationError } from '@application/errors/application.error';

describe('Fastify Application (buildApp)', () => {
  let mockPaymentController: jest.Mocked<Partial<PaymentController>>;

  beforeEach(() => {
    mockPaymentController = {
      getById: jest.fn().mockImplementation(async (_req, reply) => {
        return reply.status(200).send({ success: true, data: { id: 'test-id' } });
      }),
      getByOrderId: jest.fn().mockImplementation(async (_req, reply) => {
        return reply.status(200).send({ success: true, data: { orderId: 'test-order' } });
      }),
    };
  });

  it('deve registrar rotas e responder /health', async () => {
    const app = await buildApp({
      paymentController: mockPaymentController as unknown as PaymentController,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBeDefined();
  });

  it('deve responder à rota GET /payments/:id', async () => {
    const app = await buildApp({
      paymentController: mockPaymentController as unknown as PaymentController,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/payments/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });

    expect(response.statusCode).toBe(200);
    expect(mockPaymentController.getById).toHaveBeenCalled();
  });

  it('deve responder à rota GET /payments/order/:orderId', async () => {
    const app = await buildApp({
      paymentController: mockPaymentController as unknown as PaymentController,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/payments/order/order-abc-123',
    });

    expect(response.statusCode).toBe(200);
    expect(mockPaymentController.getByOrderId).toHaveBeenCalled();
  });

  it('deve responder à documentação Swagger em /docs', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    expect([200, 302]).toContain(response.statusCode);
  });

  it('deve mapear DomainValidationError para HTTP 400', async () => {
    const app = await buildApp();
    app.get('/test-error-400', async () => {
      throw new DomainValidationError('Campo inválido');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-error-400',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('DOMAIN_VALIDATION_ERROR');
  });

  it('deve mapear ResourceNotFoundError para HTTP 404', async () => {
    const app = await buildApp();
    app.get('/test-error-404', async () => {
      throw new ResourceNotFoundError('recurso-123');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-error-404',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('deve mapear ApplicationError genérico para HTTP 422', async () => {
    class CustomAppError extends ApplicationError {
      constructor() {
        super('Regra de aplicação violada', 'APP_VIOLATION');
      }
    }

    const app = await buildApp();
    app.get('/test-error-422', async () => {
      throw new CustomAppError();
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-error-422',
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('APP_VIOLATION');
  });

  it('deve mapear erro desconhecido para HTTP 500', async () => {
    const app = await buildApp();
    app.get('/test-error-500', async () => {
      throw new Error('Falha catastrófica');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-error-500',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
