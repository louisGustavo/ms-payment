import { randomUUID } from 'node:crypto';
import { AggregateRoot } from './aggregate-root.base';
import { Amount } from '../value-objects/amount.vo';
import { DomainValidationError, PaymentAlreadyFinalizedError } from '../errors/domain.error';
import { PaymentSucceededEvent } from '../events/payment-succeeded.event';
import { PaymentFailedEvent } from '../events/payment-failed.event';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface CreatePaymentProps {
  id?: string;
  orderId: string;
  customerId: string;
  amount: number | Amount;
  paymentMethod: string;
  installments?: number;
}

export interface RestorePaymentProps {
  id: string;
  orderId: string;
  customerId: string;
  amount: number | Amount;
  status: PaymentStatus;
  paymentMethod: string;
  installments: number;
  transactionId: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Payment extends AggregateRoot<string> {
  private readonly _orderId: string;
  private readonly _customerId: string;
  private readonly _amount: Amount;
  private _status: PaymentStatus;
  private readonly _paymentMethod: string;
  private readonly _installments: number;
  private _transactionId: string | null;
  private _failureReason: string | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: RestorePaymentProps) {
    super(props.id);
    this._orderId = props.orderId;
    this._customerId = props.customerId;
    this._amount = props.amount instanceof Amount ? props.amount : new Amount(props.amount);
    this._status = props.status;
    this._paymentMethod = props.paymentMethod;
    this._installments = props.installments;
    this._transactionId = props.transactionId;
    this._failureReason = props.failureReason;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreatePaymentProps): Payment {
    if (!props.orderId || props.orderId.trim() === '') {
      throw new DomainValidationError('O identificador do pedido (orderId) é obrigatório.');
    }

    if (!props.customerId || props.customerId.trim() === '') {
      throw new DomainValidationError('O identificador do cliente (customerId) é obrigatório.');
    }

    if (!props.paymentMethod || props.paymentMethod.trim() === '') {
      throw new DomainValidationError('O método de pagamento (paymentMethod) é obrigatório.');
    }

    const installments = props.installments ?? 1;
    if (installments < 1 || !Number.isInteger(installments)) {
      throw new DomainValidationError('O número de parcelas deve ser um número inteiro maior ou igual a 1.');
    }

    const amount = props.amount instanceof Amount ? props.amount : new Amount(props.amount);
    const now = new Date();

    return new Payment({
      id: props.id ?? randomUUID(),
      orderId: props.orderId.trim(),
      customerId: props.customerId.trim(),
      amount,
      status: 'PENDING',
      paymentMethod: props.paymentMethod.trim().toUpperCase(),
      installments,
      transactionId: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static restore(props: RestorePaymentProps): Payment {
    return new Payment(props);
  }

  public markAsSucceeded(transactionId: string): void {
    if (this._status !== 'PENDING') {
      throw new PaymentAlreadyFinalizedError(this._id, this._status);
    }

    if (!transactionId || transactionId.trim() === '') {
      throw new DomainValidationError('O identificador da transação (transactionId) é obrigatório ao aprovar o pagamento.');
    }

    this._status = 'SUCCEEDED';
    this._transactionId = transactionId.trim();
    this._failureReason = null;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new PaymentSucceededEvent({
        orderId: this._orderId,
        paymentId: this._id,
        status: 'SUCCEEDED',
        transactionId: this._transactionId,
        amount: this._amount.value,
      }, this._updatedAt)
    );
  }

  public markAsFailed(reason: string): void {
    if (this._status !== 'PENDING') {
      throw new PaymentAlreadyFinalizedError(this._id, this._status);
    }

    if (!reason || reason.trim() === '') {
      throw new DomainValidationError('O motivo da falha (reason) é obrigatório ao recusar o pagamento.');
    }

    this._status = 'FAILED';
    this._failureReason = reason.trim();
    this._updatedAt = new Date();

    this.addDomainEvent(
      new PaymentFailedEvent({
        orderId: this._orderId,
        paymentId: this._id,
        status: 'FAILED',
        reason: this._failureReason,
        amount: this._amount.value,
      }, this._updatedAt)
    );
  }

  public get orderId(): string {
    return this._orderId;
  }

  public get customerId(): string {
    return this._customerId;
  }

  public get amount(): Amount {
    return this._amount;
  }

  public get status(): PaymentStatus {
    return this._status;
  }

  public get paymentMethod(): string {
    return this._paymentMethod;
  }

  public get installments(): number {
    return this._installments;
  }

  public get transactionId(): string | null {
    return this._transactionId;
  }

  public get failureReason(): string | null {
    return this._failureReason;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }
}
