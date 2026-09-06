export interface ProcessPaymentInputDTO {
  readonly orderId: string;
  readonly customerId: string;
  readonly totalAmount: number;
  readonly shippingCost?: number;
  readonly paymentDetails: {
    readonly method: string;
    readonly paymentMethodId?: string;
    readonly installments?: number;
  };
}

export interface ProcessPaymentOutputDTO {
  readonly paymentId: string;
  readonly orderId: string;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  readonly transactionId?: string;
  readonly failureReason?: string;
  readonly isDuplicate?: boolean;
}
