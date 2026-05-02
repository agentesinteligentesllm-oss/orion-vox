import { z } from 'zod/v4';

// ─── Constantes del contrato ──────────────────────────────────────────────────

export const PLAN_VERSION = '1.0' as const;

export const ALLOWED_OPERATIONS = ['select', 'insert', 'update', 'delete'] as const;

export const ALLOWED_FILTER_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
] as const;

export const ALLOWED_JOIN_TYPES = ['inner', 'left'] as const;

export const SELECT_LIMIT_DEFAULT = 100;
export const SELECT_LIMIT_MAX = 1000;
export const JOINS_MAX = 1;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const PlanFilterSchema = z.object({
  column: z.string().min(1),
  op: z.enum(ALLOWED_FILTER_OPS),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

const PlanJoinSchema = z.object({
  type: z.enum(ALLOWED_JOIN_TYPES),
  table: z.string().min(1),
  on: z.object({
    left: z.string().min(1),
    right: z.string().min(1),
  }),
});

const PlanOrderSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

// ─── Schema principal por operación ──────────────────────────────────────────

const SelectPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('select'),
  table: z.string().min(1),
  columns: z.array(z.string().min(1)).optional(),
  filters: z.array(PlanFilterSchema).optional(),
  joins: z.array(PlanJoinSchema).max(JOINS_MAX).optional(),
  order: z.array(PlanOrderSchema).optional(),
  limit: z.number().int().min(1).max(SELECT_LIMIT_MAX).default(SELECT_LIMIT_DEFAULT),
  offset: z.number().int().min(0).optional(),
});

const InsertPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('insert'),
  table: z.string().min(1),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

const UpdatePlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('update'),
  table: z.string().min(1),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  filters: z.array(PlanFilterSchema).min(1),
});

const DeletePlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('delete'),
  table: z.string().min(1),
  filters: z.array(PlanFilterSchema).min(1),
});

// ─── Schema discriminado ──────────────────────────────────────────────────────

export const PlanSchema = z.discriminatedUnion('operation', [
  SelectPlanSchema,
  InsertPlanSchema,
  UpdatePlanSchema,
  DeletePlanSchema,
]);

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type Plan = z.infer<typeof PlanSchema>;
export type PlanFilter = z.infer<typeof PlanFilterSchema>;
export type PlanJoin = z.infer<typeof PlanJoinSchema>;
export type PlanOrder = z.infer<typeof PlanOrderSchema>;
export type PlanOperation = (typeof ALLOWED_OPERATIONS)[number];
