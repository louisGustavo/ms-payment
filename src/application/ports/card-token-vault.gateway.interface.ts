export interface CardDetails {
  readonly last4: string;
  readonly brand: string;
  readonly cardholderName: string;
}

export interface CardTokenVaultGateway {
  getCardDataByToken(paymentMethodId: string): Promise<CardDetails>;
}
