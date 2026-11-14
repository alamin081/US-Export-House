import "server-only";

import { notFound, redirect } from "next/navigation";

import { isAppError } from "@/lib/errors";

/**
 * Runs a service read for an admin page: a 403 from the service (missing
 * permission or another branch's location) shows the "no access" page, a
 * missing record the 404 page. Anything else propagates.
 */
export async function forPage<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === "FORBIDDEN" || error.code === "LOCATION_FORBIDDEN") {
        redirect("/admin/forbidden");
      }
      if (error.code === "NOT_FOUND") notFound();
    }
    throw error;
  }
}
