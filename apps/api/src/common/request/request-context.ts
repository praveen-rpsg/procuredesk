import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  ipAddress: string | null;
  requestId: string | null;
  userAgent: string | null;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | null {
  return requestContext.getStore() ?? null;
}

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return requestContext.run(context, callback);
}
