export class AgentError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 500, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AgentError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function toAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) {
    return error;
  }

  return new AgentError('INTERNAL_ERROR', 'The agent run failed unexpectedly.', 500, {
    cause: error,
  });
}
