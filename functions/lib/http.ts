export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return jsonResponse(
    { error: "The cloud storage service could not complete the request." },
    { status: 500 },
  );
}

export function requireSameOriginMutation(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return;
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin !== requestOrigin) {
    throw new HttpError(403, "Cross-origin cloud storage writes are not allowed.");
  }
}
