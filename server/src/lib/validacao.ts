export function validarBooleanoEstrito(valor: unknown, campo: string): { erro: string | null; valor: boolean | undefined } {
  if (valor === undefined) return { erro: null, valor: undefined }
  if (typeof valor !== 'boolean') {
    return { erro: `${campo} deve ser um booleano real (true ou false).`, valor: undefined }
  }
  return { erro: null, valor }
}

export function validarBooleanosEstritos(payload: Record<string, unknown>, campos: string[]): string | null {
  for (const campo of campos) {
    const resultado = validarBooleanoEstrito(payload[campo], campo)
    if (resultado.erro) return resultado.erro
  }
  return null
}
