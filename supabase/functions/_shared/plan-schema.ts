import { z } from 'zod/v4';

// ─── Constantes del contrato — PLAN-JSON-CONTRACT.md §5 ──────────────────────

export const PLAN_VERSION = '1.0' as const;

export const ALLOWED_OPERATIONS = ['select', 'insert', 'update', 'delete'] as const;

// Ops con value (10): SQL literal según spec autoritativo
export const FILTER_OPS_WITH_VALUE = [
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'in',
  'not_in',
  'like',
  'ilike',
] as const;

// Ops sin value (2): NULL checks sin argumento
export const FILTER_OPS_NULLARY = ['is_null', 'is_not_null'] as const;

export const ALL_FILTER_OPS = [...FILTER_OPS_WITH_VALUE, ...FILTER_OPS_NULLARY] as const;

export const SELECT_LIMIT_DEFAULT = 100;
export const SELECT_LIMIT_MAX = 1000;
export const JOIN_MAX = 1;

// ─── Patrones de identificador (defensa en profundidad) ──────────────────────
// Bloquean inyección vía nombres exóticos de tabla/columna — PLAN-JSON-CONTRACT.md §2

const TABLE_RE = /^[a-z_][a-z0-9_]*$/;
const COL_RE = /^[a-z_][a-z0-9_.]*$/; // punto para table.column en joins

// ─── Tipos de valor ───────────────────────────────────────────────────────────

const PrimitiveValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ArrayValue = z.array(PrimitiveValue).min(1);

// ─── Filter schemas ───────────────────────────────────────────────────────────

const FilterWithValueSchema = z.object({
  column: z.string().regex(COL_RE),
  op: z.enum(FILTER_OPS_WITH_VALUE),
  value: z.union([PrimitiveValue, ArrayValue]),
});

const FilterNullarySchema = z.object({
  column: z.string().regex(COL_RE),
  op: z.enum(FILTER_OPS_NULLARY),
  // sin value — "value se ignora" según spec §5
});

export const PlanFilterSchema = z.union([FilterWithValueSchema, FilterNullarySchema]);

// ─── Order schema ─────────────────────────────────────────────────────────────

const PlanOrderBySchema = z.object({
  column: z.string().regex(COL_RE),
  dir: z.enum(['asc', 'desc']),
});

// ─── Join schema ──────────────────────────────────────────────────────────────

const PlanJoinSchema = z.object({
  type: z.literal('inner'), // M1: solo INNER JOIN; LEFT es M2 — PLAN-JSON-CONTRACT.md §6
  table: z.string().regex(TABLE_RE),
  on: z.object({
    left: z.string().regex(COL_RE),
    right: z.string().regex(COL_RE),
  }),
});

// ─── Schema por operación ─────────────────────────────────────────────────────

const SelectPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('select'),
  table: z.string().regex(TABLE_RE),
  columns: z.array(z.string().regex(COL_RE)).optional(),
  filters: z.array(PlanFilterSchema).optional(),
  joins: z.array(PlanJoinSchema).max(JOIN_MAX).optional(),
  order_by: z.array(PlanOrderBySchema).optional(),
  limit: z.number().int().min(1).max(SELECT_LIMIT_MAX).default(SELECT_LIMIT_DEFAULT),
  // offset: M2 — no existe en schema M1 (spec §7 restricciones M1)
});

const InsertPlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('insert'),
  table: z.string().regex(TABLE_RE),
  values: z.record(z.string(), PrimitiveValue),
});

const UpdatePlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('update'),
  table: z.string().regex(TABLE_RE),
  values: z.record(z.string(), PrimitiveValue),
  filters: z.array(PlanFilterSchema).min(1),
});

const DeletePlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  operation: z.literal('delete'),
  table: z.string().regex(TABLE_RE),
  filters: z.array(PlanFilterSchema).min(1),
});

// ─── Schema principal discriminado por operation ──────────────────────────────

export const PlanSchema = z.discriminatedUnion('operation', [
  SelectPlanSchema,
  InsertPlanSchema,
  UpdatePlanSchema,
  DeletePlanSchema,
]);

// ─── Tipos inferidos ──────────────────────────────────────────────────────────

export type Plan = z.infer<typeof PlanSchema>;
export type PlanFilter = z.infer<typeof PlanFilterSchema>;
export type PlanOrderBy = z.infer<typeof PlanOrderBySchema>;
export type PlanJoin = z.infer<typeof PlanJoinSchema>;
export type PlanOperation = (typeof ALLOWED_OPERATIONS)[number];
export type FilterOp = (typeof ALL_FILTER_OPS)[number];
