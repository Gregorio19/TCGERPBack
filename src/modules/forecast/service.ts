import { randomUUID } from 'crypto';

/** Respuestas estructuradas v1 (sin motor predictivo). */

export const forecastService = {
  calculate(_body: unknown) {
    return {
      escenario: 'base',
      periodos: 6,
      proyeccionTotal: 0,
      metadatos: { version: 'v1-stub', nota: 'Motor forecast no activo; contrato estable para el front.' },
    };
  },

  kpis() {
    return {
      precisionModelo: 0,
      mae: 0,
      cobertura: 0,
      ultimaActualizacion: new Date().toISOString(),
    };
  },

  productosTop(_body: unknown) {
    return { items: [] as { productoId: number; nombre: string; score: number }[] };
  },

  setsTop(_body: unknown) {
    return { items: [] as { set: string; score: number }[] };
  },

  grafico(_body: unknown) {
    return {
      labels: [] as string[],
      series: [] as number[],
    };
  },

  compararMetodos(_body: unknown) {
    return { metodos: [] as { nombre: string; error: number }[] };
  },

  alertas() {
    return [] as { id: string; severidad: string; mensaje: string }[];
  },

  estado() {
    return { activo: false, mensaje: 'Stub v1' };
  },

  configuracionList() {
    return [] as { id: string; nombre: string; activa: boolean }[];
  },

  configuracionGet(id: string) {
    return { id, nombre: 'default', activa: false, parametros: {} };
  },

  configuracionCreate(_body: unknown) {
    return { id: randomUUID(), nombre: 'nueva', activa: false };
  },

  configuracionUpdate(id: string, _body: unknown) {
    return { id, nombre: 'actualizada', activa: false };
  },

  configuracionDelete(_id: string) {
    return { ok: true };
  },

  historial(_query: Record<string, string | undefined>) {
    return {
      data: [] as { id: string; fecha: string; tipo: string }[],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    };
  },

  exportar(_body: unknown) {
    return new Uint8Array([0x7b, 0x7d]); // "{}"
  },

  datosHistoricos(_query: Record<string, string | undefined>) {
    return { puntos: [] as { fecha: string; valor: number }[] };
  },

  validarConfiguracion(_body: unknown) {
    return { valido: true, errores: [] as string[] };
  },

  recomendaciones() {
    return [] as string[];
  },

  metricas(_body: unknown) {
    return { porMetodo: [] as { metodo: string; rmse: number }[] };
  },
};
