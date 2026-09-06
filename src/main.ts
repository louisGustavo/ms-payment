import fs from 'node:fs';
import path from 'node:path';
import { env } from '@infra/config/env';
import { PostgresPool } from '@infra/database/postgres.pool';
import { PostgresPaymentRepository } from '@infra/database/postgres-payment.repository';
import { MockPaymentGateway } from '@infra/gateways/mock-payment.gateway';
import { MockCardTokenVaultGateway } from '@infra/gateways/mock-card-token-vault.gateway';
import { ProcessPaymentUseCase } from '@application/use-cases/process-payment.use-case';
import { GetPaymentByIdUseCase } from '@application/use-cases/get-payment-by-id.use-case';
import { GetPaymentByOrderIdUseCase } from '@application/use-cases/get-payment-by-order-id.use-case';
import { PaymentController } from '@adapters/http/controllers/payment.controller';
import { RabbitMQConnection } from '@infra/messaging/rabbitmq.connection';
import { OrderCreatedConsumer } from '@adapters/messaging/order-created.consumer';
import { buildApp } from '@infra/http/app';

async function bootstrap() {
  console.info('====================================================');
  console.info('Iniciando Payment Microservice (payment-ms)...');
  console.info(`Ambiente: ${env.NODE_ENV}`);
  console.info('====================================================');

  // 1. Inicializa o Pool do PostgreSQL e executa migrações estruturais do schema
  const postgresPool = PostgresPool.getInstance();
  try {
    const schemaPath = path.resolve(__dirname, 'infra/database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.info('[Bootstrap] Executando DDL estrutural em PostgreSQL...');
      const ddl = fs.readFileSync(schemaPath, 'utf-8');
      await postgresPool.query(ddl);
      console.info('[Bootstrap] Tabelas payments e outbox verificadas/criadas com sucesso.');
    }
  } catch (err) {
    console.warn('[Bootstrap] Aviso na inicialização do DDL (banco pode já estar inicializado):', err);
  }

  // 2. Instanciação de Infraestrutura e Repositórios
  const paymentRepository = new PostgresPaymentRepository(postgresPool);
  const paymentGateway = new MockPaymentGateway();
  const cardTokenVaultGateway = new MockCardTokenVaultGateway();

  // 3. Instanciação dos Casos de Uso
  const processPaymentUseCase = new ProcessPaymentUseCase({
    paymentRepository,
    paymentGateway,
    cardTokenVaultGateway,
  });

  const getPaymentByIdUseCase = new GetPaymentByIdUseCase({
    paymentRepository,
  });

  const getPaymentByOrderIdUseCase = new GetPaymentByOrderIdUseCase({
    paymentRepository,
  });

  // 4. Conexão com RabbitMQ e inicialização do Consumer Inbound
  const rmq = RabbitMQConnection.getInstance();
  try {
    const channel = await rmq.connect();
    const consumer = new OrderCreatedConsumer(channel, processPaymentUseCase);
    await consumer.start();
    console.info('[Bootstrap] RabbitMQ Consumer conectado e escutando eventos order.created.');
  } catch (err) {
    console.error('[Bootstrap] Falha ao conectar ao RabbitMQ. O serviço tentará reconectar:', err);
  }

  // 5. Inicialização da API HTTP Fastify
  const paymentController = new PaymentController(
    getPaymentByIdUseCase,
    getPaymentByOrderIdUseCase
  );

  const app = await buildApp({ paymentController });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.info(`[Bootstrap] Servidor HTTP ativo em http://${env.HOST}:${env.PORT}`);
    console.info(`[Bootstrap] Swagger UI disponível em http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    console.error('[Bootstrap] Erro ao iniciar servidor HTTP:', err);
    process.exit(1);
  }

  // 6. Encerramento Gracioso (Graceful Shutdown)
  const shutdown = async (signal: string) => {
    console.info(`\n[Bootstrap] Sinal ${signal} recebido. Encerrando recursos com segurança...`);
    try {
      await app.close();
      await rmq.close();
      await postgresPool.close();
      console.info('[Bootstrap] Recursos finalizados com sucesso. Encerrando processo.');
      process.exit(0);
    } catch (err) {
      console.error('[Bootstrap] Erro durante encerramento gracioso:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Falha crítica na inicialização do microsserviço:', err);
  process.exit(1);
});
