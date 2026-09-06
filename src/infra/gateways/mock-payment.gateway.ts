import { randomUUID } from 'node:crypto';
import {
  PaymentGateway,
  ProcessTransactionInput,
  TransactionResult,
} from '@application/ports/payment.gateway.interface';
import { env } from '../config/env';

export interface MockPaymentGatewayOptions {
  readonly minDelayMs?: number;
  readonly maxDelayMs?: number;
}

export class MockPaymentGateway implements PaymentGateway {
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options?: MockPaymentGatewayOptions) {
    this.minDelayMs = options?.minDelayMs ?? env.GATEWAY_MIN_DELAY_MS;
    this.maxDelayMs = options?.maxDelayMs ?? env.GATEWAY_MAX_DELAY_MS;
  }

  public async processTransaction(input: ProcessTransactionInput): Promise<TransactionResult> {
    // Simulação de latência de rede e processamento financeiro
    await this.simulateLatency();

    // Regra de Falha Determinística para testes: customerId === "teste-123"
    if (input.customerId === 'teste-123') {
      return {
        success: false,
        failureReason: 'Insufficient funds / Test customer declined',
      };
    }

    // Geração de ID de transação realista
    const txnSuffix = randomUUID().replace(/-/g, '').slice(0, 16);
    return {
      success: true,
      transactionId: `txn_live_${txnSuffix}`,
    };
  }

  private async simulateLatency(): Promise<void> {
    if (this.maxDelayMs <= 0) {
      return;
    }
    const delay =
      Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs + 1)) + this.minDelayMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
