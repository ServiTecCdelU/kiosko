// lib/pin.ts — reglas del PIN de empleados (cajero/encargado). Puro, testeado.
//
// PIN de 6 numeros (antes 4: 10.000 combinaciones). Se rechazan los obvios,
// que son los primeros que prueba cualquiera. Que no se repita dentro del
// comercio lo valida el servidor (lib/server/demo.ts errorPinRepetido).

export const LARGO_PIN = 6;
/** PIN de antes: solo sirve para entrar una ultima vez y elegir uno de 6. */
export const LARGO_PIN_VIEJO = 4;

const PIN_REGEX = /^[0-9]{6}$/;

function esSecuencia(pin: string, paso: number): boolean {
  for (let i = 1; i < pin.length; i++) {
    if ((Number(pin[i]) - Number(pin[i - 1]) + 10) % 10 !== (paso + 10) % 10) return false;
  }
  return true;
}

/** null si sirve; si no, el motivo para mostrar. */
export function errorPinNuevo(pin: string): string | null {
  if (!PIN_REGEX.test(pin)) return `El PIN tiene que tener ${LARGO_PIN} números`;
  if (/^(\d)\1+$/.test(pin)) return "Ese PIN es muy fácil (todos los números iguales). Elegí otro.";
  if (esSecuencia(pin, 1) || esSecuencia(pin, -1)) return "Ese PIN es muy fácil (números seguidos). Elegí otro.";
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return "Ese PIN es muy fácil (se repite). Elegí otro.";
  return null;
}

/** Lo que se acepta para ENTRAR: el de 6, o el viejo de 4 (para pasar al nuevo). */
export function esPinParaEntrar(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin) || /^[0-9]{4}$/.test(pin);
}
