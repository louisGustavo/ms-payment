export interface GetPaymentOutputDTO {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly amount: number;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  readonly paymentMethod: string;
  readonly installments: number;
  readonly transactionId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
