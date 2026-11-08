/** All money in the engine is whole NIS. Floats are rejected, never rounded. */
export function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be a whole number of NIS, got ${value}`)
  }
}

export function assertMoney(value: number, label: string): void {
  assertInteger(value, label)
  if (value < 0) {
    throw new RangeError(`${label} must not be negative, got ${value}`)
  }
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
