/**
 * Validador de RUT chileno
 * Implementa el algoritmo de módulo 11 para validar el dígito verificador
 */

/**
 * Valida el dígito verificador de un RUT chileno
 * @param rut RUT en formato 12.345.678-9
 * @returns true si el RUT es válido
 */
export function validateRut(rut: string): boolean {
  if (!rut || typeof rut !== 'string') {
    return false;
  }

  // Limpiar el RUT (quitar puntos y guiones)
  const cleanRut = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();

  // Validar formato básico
  if (!/^\d+[0-9K]$/.test(cleanRut)) {
    return false;
  }

  // Separar número y dígito verificador
  const rutNumber = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);

  // Validar que el número sea válido
  if (!/^\d+$/.test(rutNumber) || rutNumber.length === 0) {
    return false;
  }

  // Calcular dígito verificador
  let sum = 0;
  let multiplier = 2;

  // Recorrer el RUT de derecha a izquierda
  for (let i = rutNumber.length - 1; i >= 0; i--) {
    sum += parseInt(rutNumber[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  // Calcular resto y dígito verificador esperado
  const remainder = sum % 11;
  let expectedDv: string;

  if (remainder === 0) {
    expectedDv = '0';
  } else if (remainder === 1) {
    expectedDv = 'K';
  } else {
    expectedDv = (11 - remainder).toString();
  }

  // Comparar dígito verificador
  return dv === expectedDv;
}

/**
 * Normaliza un RUT a formato estándar (12.345.678-9)
 * @param rut RUT en cualquier formato
 * @returns RUT normalizado o null si es inválido
 */
export function normalizeRut(rut: string): string | null {
  if (!rut || typeof rut !== 'string') {
    return null;
  }

  try {
    const cleanRut = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();

    if (!/^\d+[0-9K]$/.test(cleanRut)) {
      return null;
    }

    const rutNumber = cleanRut.slice(0, -1);
    const dv = cleanRut.slice(-1);

    if (rutNumber.length === 0) {
      return null;
    }

    // Formatear con puntos y guión
    const formatted = rutNumber.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;

    return formatted;
  } catch (error) {
    return null;
  }
}

