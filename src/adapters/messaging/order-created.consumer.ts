import { Channel, ConsumeMessage } from 'amqplib';
import { ProcessPaymentUseCase } from '@application/use-cases/process-payment.use-case';
import { DistributedLockService } from '@application/ports/distributed-lock.service';
import { env } from '@infra/config/env';

export interface OrderCreatedPayload {
  readonly eventName?: string;
  readonly occurredAt?: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly totalAmount: number;
  readonly shippingCost?: number;
  readonly items?: Array<{
    readonly id: string;
    readonly productId: string;
    readonly name: string;
    readonly unitPrice: number;
    readonly quantity: number;
    readonly subtotal: number;
  }>;
  readonly paymentDetails: {
    readonly method: string;
    readonly paymentMethodId?: string;
    readonly installments?: number;
  };
  readonly createdAt?: string;
}

export class OrderCreatedConsumer {
  constructor(
    private readonly channel: Channel,
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    private readonly distributedLockService: DistributedLockService
  ) {}

  public async setupTopology(): Promise<void> {
    const exchange = env.RABBITMQ_ORDER_EVENTS_EXCHANGE;
    const routingKey = env.RABBITMQ_ORDER_CREATED_ROUTING_KEY;
    const queue = env.RABBITMQ_PAYMENT_QUEUE;
    const dlx = env.RABBITMQ_DLX;
    const dlq = env.RABBITMQ_DLQ;
    const dlqRoutingKey = `${queue}.dead`;

    // 1. Declara a Dead Letter Exchange (DLX) e sua fila (DLQ)
    await this.channel.assertExchange(dlx, 'topic', { durable: true });
    await this.channel.assertQueue(dlq, { durable: true });
    await this.channel.bindQueue(dlq, dlx, dlqRoutingKey);

    // 2. Declara a Exchange principal de pedidos
    await this.channel.assertExchange(exchange, 'topic', { durable: true });

    // 3. Declara a Exchange de publicação dos eventos de pagamento
    const paymentExchange = env.RABBITMQ_PAYMENT_EVENTS_EXCHANGE;
    await this.channel.assertExchange(paymentExchange, 'topic', { durable: true });

    // 3. Declara a fila de processamento de pagamentos com DLX configurada
    await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlx,
        'x-dead-letter-routing-key': dlqRoutingKey,
      },
    });

    // 4. Vincula a fila à exchange principal com a routing key order.created
    await this.channel.bindQueue(queue, exchange, routingKey);

    // 5. Configura prefetch para controle de concorrência
    await this.channel.prefetch(10);
  }

  public async start(): Promise<void> {
    await this.setupTopology();
    const queue = env.RABBITMQ_PAYMENT_QUEUE;

    console.info(`[OrderCreatedConsumer] Iniciando consumo da fila '${queue}'...`);

    await this.channel.consume(queue, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      try {
        await this.handleMessage(msg);
      } catch (err) {
        console.error('[OrderCreatedConsumer] Erro fatal ao processar mensagem. Enviando para DLQ:', err);
        // Nack sem requeue direciona a mensagem para a DLQ
        this.channel.nack(msg, false, false);
      }
    });
  }

  public async handleMessage(msg: ConsumeMessage): Promise<void> {
    const rawContent = msg.content.toString('utf-8');
    let parsed: any;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error('[OrderCreatedConsumer] Payload inválido (não é JSON válido). Descartando para DLQ.');
      this.channel.nack(msg, false, false);
      return;
    }

    // Suporte a envelope do Debezium (schema + payload serializado como string/objeto) ou payload direto
    let payload: OrderCreatedPayload = parsed;
    if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
      if (typeof parsed.payload === 'string') {
        try {
          payload = JSON.parse(parsed.payload);
        } catch {
          payload = parsed;
        }
      } else if (typeof parsed.payload === 'object' && parsed.payload !== null) {
        payload = parsed.payload;
      }
    }

    if (!payload.orderId || !payload.customerId || typeof payload.totalAmount !== 'number') {
      console.error('[OrderCreatedConsumer] Mensagem com contrato incompleto. Descartando para DLQ:', payload);
      this.channel.nack(msg, false, false);
      return;
    }

    // Controle de Concorrência Distribuída (Lock por recurso de Pedido)
    const lockResource = `lock:payment:order:${payload.orderId}`;
    const lockTtl = env.DISTRIBUTED_LOCK_TTL_MS;
    const lockToken = await this.distributedLockService.acquire(lockResource, lockTtl);

    if (!lockToken) {
      console.warn(
        `[OrderCreatedConsumer] Concorrência detectada: Lock '${lockResource}' já retido por outra instância. Descartando mensagem concorrente com ACK para evitar cobrança duplicada.`
      );
      this.channel.ack(msg);
      return;
    }

    try {
      console.info(`[OrderCreatedConsumer] Processando cobrança do pedido '${payload.orderId}'...`);

      const result = await this.processPaymentUseCase.execute({
        orderId: payload.orderId,
        customerId: payload.customerId,
        totalAmount: payload.totalAmount,
        shippingCost: payload.shippingCost,
        paymentDetails: {
          method: payload.paymentDetails?.method ?? '',
          paymentMethodId: payload.paymentDetails?.paymentMethodId,
          installments: payload.paymentDetails?.installments,
        },
      });

      if (result.isDuplicate) {
        console.info(`[OrderCreatedConsumer] Pedido '${payload.orderId}' já foi processado anteriormente (Idempotência).`);
      } else {
        console.info(
          `[OrderCreatedConsumer] Pagamento '${result.paymentId}' concluído com status: ${result.status}`
        );
      }

      // Confirmação com sucesso
      this.channel.ack(msg);
    } finally {
      await this.distributedLockService.release(lockResource, lockToken);
    }
  }
}
