import { CardDetails } from './card-token-vault.gateway.interface';

export interface ProcessTransactionInput {
  readonly orderId: string;
  readonly customerId: string;
  readonly amount: number;
  readonly paymentMethod: string;
  readonly installments: number;
  readonly cardDetails?: CardDetails;
}

export interface TransactionResult {
  readonly success: boolean;
  readonly transactionId?: string;
  readonly failureReason?: string;
}

export interface PaymentGateway {
  processTransaction(input: ProcessTransactionInput): Promise<TransactionResult>;
}
