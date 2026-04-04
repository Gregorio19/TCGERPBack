/**
 * Respuestas alineadas con el contrato frontend RRHH (`ApiResponse<T>`).
 */
export function hrEnvelope<T>(data: T, message = 'OK') {
  return {
    success: true as const,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function hrDeleted(message: string) {
  return {
    success: true as const,
    message,
    timestamp: new Date().toISOString(),
  };
}
