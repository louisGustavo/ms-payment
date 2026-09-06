import Fastify, { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from '@adapters/http/routes/health.routes';
import { createPaymentRoutes } from '@adapters/http/routes/payment.routes';
import { PaymentController } from '@adapters/http/controllers/payment.controller';
import { DomainError, DomainValidationError } from '@domain/errors/domain.error';
import { ApplicationError, ResourceNotFoundError } from '@application/errors/application.error';

export interface BuildAppOptions {
  paymentController?: PaymentController;
}

export async function buildApp(options?: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env['NODE_ENV'] !== 'test',
  });

  // Registro do Swagger OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Payment Microservice API',
        description: 'API de pagamentos e healthcheck para o microsserviço payment-ms',
        version: '1.0.0',
      },
      tags: [
        { name: 'Health', description: 'Endpoints de monitoramento e integridade' },
        { name: 'Payments', description: 'Endpoints de consulta de transações financeiras' },
      ],
    },
  });

  // Interface Swagger UI em /docs
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Mapeamento global de erros conforme Blueprint Seção 5.2
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof ResourceNotFoundError) {
      return reply.status(404).send({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof DomainError || error instanceof ApplicationError) {
      return reply.status(422).send({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'Erro interno no servidor.',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  // Registro das rotas
  await app.register(healthRoutes);

  if (options?.paymentController) {
    const paymentRoutes = await createPaymentRoutes(options.paymentController);
    await app.register(paymentRoutes);
  }

  return app;
}
