import { z } from "zod";

const MoneySchema = z.number().finite();

export const DextCommerceItemSchema = z
  .object({
    name: z.string().optional(),
    quantity: z.number().finite().optional(),
    unit_price: MoneySchema.optional(),
    amount: MoneySchema.optional()
  })
  .passthrough();

export const DextCommerceTransactionSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    currency_code: z.string().optional(),
    reference_id: z.string().nullable().optional(),
    account_id: z.string().optional(),
    transacted_at: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    items: z.array(DextCommerceItemSchema).optional(),
    totals: z
      .object({
        sub: MoneySchema.optional(),
        tax: MoneySchema.optional(),
        grand: MoneySchema.optional()
      })
      .passthrough()
      .optional(),
    payments: z.array(z.record(z.string(), z.unknown())).optional(),
    deposits: z.array(z.record(z.string(), z.unknown())).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    attributes: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const DextCommerceListResponseSchema = z.object({
  pagination: z.object({
    count: z.number().int().min(0),
    total_count: z.number().int().min(0).optional(),
    next: z.string().optional()
  }),
  values: z.array(DextCommerceTransactionSchema)
});

export const DextCommerceGetResponseSchema = z.object({
  value: DextCommerceTransactionSchema
});

export const DextCommerceCurrentUserResponseSchema = z.object({
  value: z.object({ id: z.string().min(1) }).passthrough()
});

export type DextCommerceTransaction = z.infer<
  typeof DextCommerceTransactionSchema
>;

export interface DextCommercePage {
  transactions: DextCommerceTransaction[];
  count: number;
  totalCount?: number;
  nextCursor?: string;
}
