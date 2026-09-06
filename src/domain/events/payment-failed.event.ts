import { DomainEvent } from './domain-event.interface';

export interface PaymentFailedPayload {
  readonly orderId: string;
  readonly paymentId: string;
  readonly status: 'FAILED';
  readonly reason: string;
  readonly amount: number;
}

export class PaymentFailedEvent implements DomainEvent {
  public readonly eventName = 'payment.failed';
  public readonly occurredAt: Date;
  public readonly orderId: string;
  public readonly paymentId: string;
  public readonly status: 'FAILED';
  public readonly reason: string;
  public readonly amount: number;

  constructor(payload: PaymentFailedPayload, occurredAt = new Date()) {
    this.orderId = payload.orderId;
    this.paymentId = payload.paymentId;
    this.status = payload.status;
    this.reason = payload.reason;
    this.amount = payload.amount;
    this.occurredAt = occurredAt;
    Object.freeze(this);
  }
}
