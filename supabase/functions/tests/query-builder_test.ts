import { PlanSchema } from '../_shared/plan-schema.ts';
import { buildQuery } from '../_shared/query-builder.ts';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  actual:   ${a}\n  expected: ${b}`);
}

interface GoldenCase {
  file: string;
  sql: string;
  params: unknown[];
}

const GOLDEN: GoldenCase[] = [
  {
    file: '01-select-simple.json',
    sql: 'SELECT "id", "titulo", "estado", "creado_en" FROM "tareas" WHERE "estado" = $1 ORDER BY "creado_en" DESC LIMIT $2',
    params: ['activa', 100],
  },
  {
    file: '02-select-with-join.json',
    sql: 'SELECT "tareas"."id", "tareas"."titulo", "categorias"."nombre" FROM "tareas" INNER JOIN "categorias" ON "tareas"."categoria_id" = "categorias"."id" WHERE "tareas"."estado" = $1 LIMIT $2',
    params: ['activa', 100],
  },
  {
    file: '03-insert-single.json',
    sql: 'INSERT INTO "tareas" ("titulo", "estado", "categoria_id") VALUES ($1, $2, $3) RETURNING *',
    params: ['comprar pilas', 'activa', 'f4e33b2a-1c5d-4e7f-8a9b-0c1d2e3f4a5b'],
  },
  {
    file: '04-update-with-filter.json',
    sql: 'UPDATE "tareas" SET "estado" = $1, "completada_en" = $2 WHERE "id" = $3',
    params: ['hecha', '2026-05-01T14:32:00Z', 'abc-123'],
  },
  {
    file: '05-delete-with-filters.json',
    sql: 'DELETE FROM "tareas" WHERE "estado" = $1 AND "actualizada_en" < $2',
    params: ['archivada', '2026-02-01T00:00:00Z'],
  },
  {
    file: '06-select-multi-operators.json',
    sql: 'SELECT "id", "titulo", "estado", "creado_en" FROM "tareas" WHERE "estado" = ANY($1) AND "titulo" ILIKE $2 AND "completada_en" IS NULL ORDER BY "creado_en" ASC LIMIT $3',
    params: [['activa', 'pendiente'], '%urgente%', 50],
  },
  {
    file: '07-insert-with-null-value.json',
    sql: 'INSERT INTO "tareas" ("titulo", "estado", "completada_en", "cantidad", "es_urgente") VALUES ($1, $2, $3, $4, $5) RETURNING *',
    params: ['revisar stock', 'activa', null, 5, false],
  },
  {
    file: '08-select-no-explicit-columns.json',
    sql: 'SELECT * FROM "productos" WHERE "activo" = $1 LIMIT $2',
    params: [true, 20],
  },
  {
    file: '09-select-comparison-operators.json',
    sql: 'SELECT "id", "monto", "fecha", "estado" FROM "ventas" WHERE "estado" != $1 AND "monto" > $2 AND "fecha" >= $3 AND "fecha" <= $4 LIMIT $5',
    params: ['cancelada', 1000, '2026-01-01', '2026-12-31', 50],
  },
  {
    file: '10-select-pattern-operators.json',
    sql: 'SELECT "id", "nombre", "categoria_id" FROM "productos" WHERE "nombre" LIKE $1 AND "categoria_id" != ALL($2) LIMIT $3',
    params: ['Cable%', ['cat-01', 'cat-02', 'cat-03'], 20],
  },
  {
    file: '11-select-null-operators.json',
    sql: 'SELECT "id", "cliente_id", "fecha_entrega" FROM "pedidos" WHERE "fecha_entrega" IS NULL AND "cliente_id" IS NOT NULL LIMIT $1',
    params: [100],
  },
];

function loadFixture(name: string): unknown {
  const url = new URL(`../../../tests/fixtures/plans/valid/${name}`, import.meta.url);
  return JSON.parse(Deno.readTextFileSync(url)) as unknown;
}

for (const { file, sql, params } of GOLDEN) {
  Deno.test(`[query-builder] ${file}`, () => {
    const raw = loadFixture(file);
    const plan = PlanSchema.parse(raw);
    const result = buildQuery(plan);
    assertEqual(result.sql, sql, `SQL mismatch — ${file}`);
    assertEqual(result.params, params, `params mismatch — ${file}`);
  });
}
