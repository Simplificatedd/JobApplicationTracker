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
  // Self-hosters often skip the migration step; name it instead of a generic 500.
  if (error instanceof Error && /no such table/i.test(error.message)) {
    return jsonResponse(
      { error: "The database isn't set up yet. Apply the D1 migrations (installation guide step 3), then reload." },
      { status: 500 },
    );
  }
  return jsonResponse(
    { error: "The cloud storage service could not complete the request." },
    { status: 500 },
  );
}

export function requireBindings(
  env: { DB?: unknown; RESUME_FILES?: unknown },
  names: ("DB" | "RESUME_FILES")[],
) {
  for (const name of names) {
    if (!env[name]) {
      throw new HttpError(500, `The ${name} binding is missing. Add it in the Pages project's bindings (installation guide step 5), then redeploy.`);
    }
  }
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
