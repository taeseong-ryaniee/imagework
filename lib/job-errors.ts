export class RunnerConfigurationError extends Error {
  readonly name = "RunnerConfigurationError";

  constructor() {
    super("The server worker is not configured.");
  }
}

export class ImageworkInputError extends Error {
  readonly name = "ImageworkInputError";

  constructor() {
    super("The submitted image request is invalid.");
  }
}

export class ProcessingCodeError extends Error {
  readonly name = "ProcessingCodeError";

  constructor() {
    super("The processing code is invalid.");
  }
}

export class JobTimeoutError extends Error {
  readonly name = "JobTimeoutError";

  constructor() {
    super("The local worker job exceeded its allowed time.");
  }
}

export class JobCancelledError extends Error {
  readonly name = "JobCancelledError";

  constructor() {
    super("The job was cancelled by an explicit cancel request.");
  }
}

export class JobRegistrationError extends Error {
  readonly name = "JobRegistrationError";

  constructor() {
    super("The process job could not be registered.");
  }
}

export class QueueCapacityError extends Error {
  readonly name = "QueueCapacityError";

  constructor() {
    super("The server worker queue is full.");
  }
}

export class CommandExecutionError extends Error {
  readonly name = "CommandExecutionError";

  constructor() {
    super("The local worker command did not complete.");
  }
}

export class ResultContractError extends Error {
  readonly name = "ResultContractError";

  constructor() {
    super("The downloaded result did not match the expected contract.");
  }
}
