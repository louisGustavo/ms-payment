import { DomainEvent } from '../events/domain-event.interface';

export abstract class AggregateRoot<TId = string> {
  protected readonly _id: TId;
  private _domainEvents: DomainEvent[] = [];

  constructor(id: TId) {
    this._id = id;
  }

  public get id(): TId {
    return this._id;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
