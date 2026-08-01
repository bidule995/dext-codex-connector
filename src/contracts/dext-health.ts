import { z } from "zod";

const NullableStringSchema = z.string().nullable();
const NullableNumberSchema = z.number().finite().nullable();

export const DextClientSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    practiceCode: NullableStringSchema,
    providerId: z.string().min(1),
    healthScore: z.number().int().min(0).max(100),
    alertLevel: z.string().min(1)
  })
  .loose();

export const DextClientDetailSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    providerId: z.string().min(1),
    practiceCode: NullableStringSchema,
    organisationType: NullableStringSchema,
    companyNumber: NullableStringSchema,
    healthScore: z.number().int().min(0).max(100),
    alertLevel: z.string().min(1),
    hmrcStatus: NullableStringSchema,
    yearEnd: NullableStringSchema,
    vatDetails: z
      .object({
        scheme: NullableStringSchema,
        number: NullableStringSchema,
        reportingCycle: NullableStringSchema,
        periodStart: NullableStringSchema,
        periodEnd: NullableStringSchema
      })
      .loose()
      .nullable(),
    metrics: z
      .object({
        debtorBalance: NullableNumberSchema,
        avgDebtorDays: NullableNumberSchema,
        oneDayImpact: NullableNumberSchema
      })
      .loose()
      .nullable(),
    bankReconciliation: z
      .object({
        bankAccounts: z.number().int().min(0).nullable(),
        manualFeeds: z.number().int().min(0).nullable()
      })
      .loose()
      .nullable()
  })
  .loose();

export const ActivityPeriodSchema = z
  .object({
    start: NullableStringSchema,
    end: NullableStringSchema,
    turnover: NullableNumberSchema,
    salesCount: NullableNumberSchema,
    billsCount: NullableNumberSchema,
    creditsCount: NullableNumberSchema,
    manualJournalsCount: NullableNumberSchema,
    bankTransactionsCount: NullableNumberSchema,
    totalCount: NullableNumberSchema,
    turnoverChangeMoM: NullableNumberSchema.optional(),
    salesChangeMoM: NullableNumberSchema.optional(),
    billsChangeMoM: NullableNumberSchema.optional(),
    creditsChangeMoM: NullableNumberSchema.optional(),
    manualJournalsChangeMoM: NullableNumberSchema.optional(),
    bankTransactionsChangeMoM: NullableNumberSchema.optional(),
    totalChangeMoM: NullableNumberSchema.optional(),
    turnoverChangeYoY: NullableNumberSchema.optional(),
    salesChangeYoY: NullableNumberSchema.optional(),
    billsChangeYoY: NullableNumberSchema.optional(),
    creditsChangeYoY: NullableNumberSchema.optional(),
    manualJournalsChangeYoY: NullableNumberSchema.optional(),
    bankTransactionsChangeYoY: NullableNumberSchema.optional(),
    totalChangeYoY: NullableNumberSchema.optional()
  })
  .loose();

export const DextClientActivityStatsSchema = z
  .object({
    annual: ActivityPeriodSchema,
    monthlyAverage: ActivityPeriodSchema,
    quarterlyAverage: ActivityPeriodSchema
  })
  .loose();

export const DextClientListSchema = z.array(DextClientSummarySchema);

export type DextClientSummary = z.infer<typeof DextClientSummarySchema>;
export type DextClientDetail = z.infer<typeof DextClientDetailSchema>;
export type DextClientActivityStats = z.infer<
  typeof DextClientActivityStatsSchema
>;
