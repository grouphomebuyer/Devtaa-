/**
 * Uniform error envelope (Phase 3 §14, Phase 7 §4).
 *
 * Error codes are part of the API contract: clients switch on `code` to render
 * specific, actionable messages and their Hindi/Marathi translations, so a code
 * must never be renamed without a version bump.
 */

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface AppErrorOptions {
  ruleCode?: string;
  details?: Record<string, unknown>;
  fieldErrors?: FieldError[];
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly ruleCode: string | undefined;
  readonly details: Record<string, unknown> | undefined;
  readonly fieldErrors: FieldError[] | undefined;

  constructor(status: number, code: string, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.ruleCode = options.ruleCode;
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
  }

  toEnvelope(traceId: string): {
    error: {
      code: string;
      message: string;
      ruleCode?: string;
      details?: Record<string, unknown>;
      fieldErrors?: FieldError[];
      traceId: string;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.ruleCode ? { ruleCode: this.ruleCode } : {}),
        ...(this.details ? { details: this.details } : {}),
        ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
        traceId,
      },
    };
  }
}

/**
 * Translate PostgreSQL errors raised by the schema's own guards into API
 * errors. The database is the last line of defence (Phase 4 §9); when it fires,
 * the user still deserves a sentence that tells them what to do.
 */
export function fromDatabaseError(error: unknown): AppError | null {
  if (!(error instanceof Error)) return null;
  const message = error.message;

  if (message.includes('PERIOD_LOCKED')) {
    return new AppError(423, 'PERIOD_LOCKED', 'The accounting period is closed for posting.', {
      ruleCode: 'BR-GL-04',
    });
  }
  if (message.includes('NEGATIVE_STOCK')) {
    return new AppError(422, 'INSUFFICIENT_STOCK', 'Not enough stock at this store for the issue.', {
      ruleCode: 'BR-MAT-04',
    });
  }
  if (message.includes('JOURNAL_UNBALANCED')) {
    return new AppError(500, 'JOURNAL_UNBALANCED', 'Refusing to post an unbalanced journal.', {
      ruleCode: 'BR-GL-01',
    });
  }
  if (message.includes('uq_vendor_invoice')) {
    return new AppError(422, 'DUPLICATE_INVOICE', 'This invoice is already booked for this vendor.', {
      ruleCode: 'BR-005',
    });
  }
  if (message.includes('ENGAGEMENT_MODEL_LOCKED')) {
    return new AppError(
      422,
      'ENGAGEMENT_MODEL_LOCKED',
      'The engagement model cannot change once the project has financial postings.',
      { ruleCode: 'BR-PRJ-01' },
    );
  }
  return null;
}
