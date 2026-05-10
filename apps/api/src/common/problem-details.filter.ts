import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

type ProblemDetails = {
  chronologyErrors?: string[];
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  timestamp: string;
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const responseBody =
      exceptionResponse && typeof exceptionResponse === "object"
        ? (exceptionResponse as Record<string, unknown>)
        : null;
    const responseMessage = responseBody?.message;
    const detail =
      typeof responseMessage === "string"
        ? responseMessage
        : exception instanceof Error
          ? exception.message
          : "An unexpected error occurred.";

    const body: ProblemDetails = {
      type: `https://procuredesk.local/problems/${status}`,
      title: status === 500 ? "Internal Server Error" : "Request Failed",
      status,
      detail: status === 500 ? "An unexpected error occurred." : detail,
      instance: request.url,
      timestamp: new Date().toISOString(),
    };

    const chronologyErrors = responseBody?.chronologyErrors;
    if (Array.isArray(chronologyErrors)) {
      body.chronologyErrors = chronologyErrors.filter(
        (error): error is string => typeof error === "string",
      );
    }

    void response.status(status).send(body);
  }
}
