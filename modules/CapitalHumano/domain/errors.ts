/** A business rule was broken. `message` is Spanish UI copy; `details` lists what is in the way. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Solo un Administrador de Origo puede cambiar la organización.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** The row being replaced is no longer the current one: someone else changed it first. */
export class ConflictError extends Error {
  constructor(message = 'Alguien más cambió este registro. Vuelve a cargar e inténtalo de nuevo.') {
    super(message);
    this.name = 'ConflictError';
  }
}
