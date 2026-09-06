import { DomainEvent } from './domain-event.interface';

export interface PaymentSucceededPayload {
  readonly orderId: string;
  readonly paymentId: string;
  readonly status: 'SUCCEEDED';
  readonly transactionId: string;
  readonly amount: number;
}

export class PaymentSucceededEvent implements DomainEvent {
  public readonly eventName = 'payment.succeeded';
  public readonly occurredAt: Date;
  public readonly orderId: string;
  public readonly paymentId: string;
  public readonly status: 'SUCCEEDED';
  public readonly transactionId: string;
  public readonly amount: number;

  constructor(payload: PaymentSucceededPayload, occurredAt = new Date()) {
    this.orderId = payload.orderId;
    this.paymentId = payload.paymentId;
    this.status = payload.status;
    this.transactionId = payload.transactionId;
    this.amount = payload.amount;
    this.occurredAt = occurredAt;
    Object.freeze(this);
  }
}
