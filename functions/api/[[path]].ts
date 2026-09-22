import { authenticateAccessRequest } from "../lib/auth";
import { errorResponse, HttpError, jsonResponse } from "../lib/http";
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

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  try {
    const user = await authenticateAccessRequest(context.request, context.env);
    const url = new URL(context.request.url);
    const route = url.pathname.replace(/^\/api\/?/, "");

    if (route === "session" && context.request.method === "GET") {
      return jsonResponse({ email: user.email });
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
        return getResumeFile(context.env, user, storageKey);
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
