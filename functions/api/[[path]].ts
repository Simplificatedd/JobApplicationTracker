import { authenticateAccessRequest } from "../lib/auth";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  requireSameOriginMutation,
} from "../lib/http";
import {
  deleteResumeFile,
  getResumeFile,
  putResumeFile,
} from "../lib/resumeFiles";
import {
  CloudConflictError,
  getCloudState,
  parseSaveStateRequest,
  saveCloudState,
} from "../lib/state";
import type { CloudflareEnv } from "../lib/types";
import { reconcileDocuments } from "../lib/documentLifecycle";
import {
  MUTATION_PROTOCOL_ERROR,
  MUTATION_PROTOCOL_HEADER,
  MUTATION_PROTOCOL_VERSION,
} from "../../src/storage/mutationProtocol";

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  try {
    const user = await authenticateAccessRequest(context.request, context.env);
    requireSameOriginMutation(context.request);
    const url = new URL(context.request.url);
    const route = url.pathname.replace(/^\/api\/?/, "");

    if (route === "session" && context.request.method === "GET") {
      return jsonResponse({ id: user.id, email: user.email });
    }

    // Bind every data request to the identity the client used to choose its cache.
    // A stale tab must never write account A's snapshot after the Access cookie
    // changes to account B, even if that happens between two client requests.
    if (route === "state" || route === "document-cleanup" || route.startsWith("resume-files/")) {
      if (context.request.headers.get("X-Tracker-Account-Id") !== user.id) {
        throw new HttpError(412, "Signed-in account changed. Reload the tracker.");
      }
      if ((context.request.method === "PUT" || context.request.method === "DELETE" || context.request.method === "POST") &&
        context.request.headers.get(MUTATION_PROTOCOL_HEADER) !== MUTATION_PROTOCOL_VERSION) {
        throw new HttpError(426, MUTATION_PROTOCOL_ERROR);
      }
    }

    if (route === "document-cleanup") {
      if (context.request.method !== "POST") throw new HttpError(405, "Use POST to retry document cleanup.");
      return jsonResponse(await reconcileDocuments(context.env, user));
    }

    if (route === "state") {
      if (context.request.method === "GET") {
        const state = await getCloudState(context.env.DB, user.id);
        return state
          ? jsonResponse(state)
          : jsonResponse({ error: "Cloud state has not been created." }, { status: 404 });
      }

      if (context.request.method === "PUT") {
        const input = parseSaveStateRequest(await context.request.text());

        try {
          return jsonResponse(
            await saveCloudState(context.env.DB, user, input),
          );
        } catch (error) {
          if (error instanceof CloudConflictError) {
            return jsonResponse(
              { current: error.current, error: error.message },
              { status: error.status },
            );
          }

          throw error;
        }
      }

      throw new HttpError(405, "This cloud state method is not supported.");
    }

    const resumeMatch = route.match(/^resume-files\/([^/]+)$/);

    if (resumeMatch) {
      const storageKey = decodeURIComponent(resumeMatch[1]);

      if (context.request.method === "GET") {
        return await getResumeFile(context.env, user, storageKey);
      }

      if (context.request.method === "PUT") {
        return jsonResponse(
          await putResumeFile(context.request, context.env, user, storageKey),
        );
      }

      if (context.request.method === "DELETE") {
        await deleteResumeFile(context.env, user, storageKey);
        return new Response(null, { status: 204 });
      }

      throw new HttpError(405, "This resume file method is not supported.");
    }

    throw new HttpError(404, "The cloud API route could not be found.");
  } catch (error) {
    return errorResponse(error);
  }
};
