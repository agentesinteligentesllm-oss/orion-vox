// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PlanPreview from '../../src/components/PlanPreview.svelte';
import type { Plan } from '../../src/lib/contracts/plan-schema.ts';

afterEach(cleanup);

describe('PlanPreview — render legible humano', () => {
  it('SELECT sin filtros: muestra frase base con límite y tabla', () => {
    const plan: Plan = { version: '1.0', operation: 'select', table: 'ventas', limit: 5 };
    render(PlanPreview, { plan });
    expect(screen.getByText(/Voy a buscar 5 registros en "ventas"/)).toBeTruthy();
  });

  it('SELECT límite 1: singular "1 registro"', () => {
    const plan: Plan = { version: '1.0', operation: 'select', table: 'clientes', limit: 1 };
    render(PlanPreview, { plan });
    expect(screen.getByText(/Voy a buscar 1 registro en "clientes"/)).toBeTruthy();
  });

  it('SELECT con filtro =: muestra condición en texto', () => {
    const plan: Plan = {
      version: '1.0',
      operation: 'select',
      table: 'tareas',
      filters: [{ column: 'estado', op: '=', value: 'activo' }],
      limit: 100,
    };
    render(PlanPreview, { plan });
    expect(screen.getByText(/donde estado = activo/)).toBeTruthy();
  });

  it('SELECT con filtro is_null: texto legible sin valor técnico', () => {
    const plan: Plan = {
      version: '1.0',
      operation: 'select',
      table: 'tareas',
      filters: [{ column: 'deleted_at', op: 'is_null' }],
      limit: 100,
    };
    render(PlanPreview, { plan });
    expect(screen.getByText(/deleted_at está vacío/)).toBeTruthy();
  });

  it('INSERT: muestra tabla y cantidad de campos', () => {
    const plan: Plan = {
      version: '1.0',
      operation: 'insert',
      table: 'clientes',
      values: { nombre: 'Juan', email: 'juan@test.com' },
    };
    render(PlanPreview, { plan });
    expect(screen.getByText(/Voy a agregar 1 registro en "clientes" con 2 campos/)).toBeTruthy();
  });

  it('UPDATE: muestra tabla y condición', () => {
    const plan: Plan = {
      version: '1.0',
      operation: 'update',
      table: 'tareas',
      values: { estado: 'cerrado' },
      filters: [{ column: 'id', op: '=', value: 42 }],
    };
    render(PlanPreview, { plan });
    expect(screen.getByText(/Voy a actualizar registros en "tareas" donde id = 42/)).toBeTruthy();
  });

  it('DELETE: muestra tabla y condición', () => {
    const plan: Plan = {
      version: '1.0',
      operation: 'delete',
      table: 'logs',
      filters: [{ column: 'fecha', op: '<', value: '2025-01-01' }],
    };
    render(PlanPreview, { plan });
    expect(
      screen.getByText(/Voy a eliminar registros en "logs" donde fecha < 2025-01-01/),
    ).toBeTruthy();
  });

  it('escrituras: muestra aviso de confirmación requerida', () => {
    const insert: Plan = {
      version: '1.0',
      operation: 'insert',
      table: 'test',
      values: { col: 'val' },
    };
    render(PlanPreview, { plan: insert });
    expect(screen.getByText(/Requiere confirmación/)).toBeTruthy();
  });

  it('SELECT: NO muestra aviso de confirmación', () => {
    const plan: Plan = { version: '1.0', operation: 'select', table: 'test', limit: 10 };
    render(PlanPreview, { plan });
    expect(screen.queryByText(/Requiere confirmación/)).toBeNull();
  });

  it('header: muestra verb label y nombre de tabla', () => {
    const plan: Plan = { version: '1.0', operation: 'select', table: 'ventas', limit: 10 };
    render(PlanPreview, { plan });
    expect(screen.getByText('Consultar')).toBeTruthy();
    expect(screen.getByText('ventas')).toBeTruthy();
  });
});
