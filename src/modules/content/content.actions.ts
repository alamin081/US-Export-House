"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { CONTENT_TAGS } from "./cache-tags";
import {
  createPage,
  deletePage,
  findProductsForPicker,
  publishContent,
  restoreVersion,
  saveDraft,
  unpublishPage,
} from "./content.service";
import { saveLabel } from "./ui-labels.service";

/**
 * Content editor actions (Phase 12). The service checks every permission
 * again; publishing refreshes exactly the cache tags the document feeds, with
 * `updateTag`, so the storefront shows the change on the next request.
 */

function refreshAdmin(key: string) {
  revalidatePath("/admin/content");
  revalidatePath(`/admin/content/${key}`);
}

function refreshStorefront(key: string, isPage: boolean) {
  updateTag(CONTENT_TAGS.document(key));
  if (isPage) updateTag(CONTENT_TAGS.pages);
}

export async function saveContentAction(input: {
  key: string;
  revision: number;
  draft: unknown;
}): Promise<ActionResult & { revision?: number }> {
  try {
    const staff = await requireStaffAction("content.write");
    const saved = await saveDraft(staff, input, await getRequestMeta());
    refreshAdmin(input.key);
    return { status: "success", message: "Draft saved.", revision: saved.revision };
  } catch (error) {
    return actionError(error);
  }
}

export async function publishContentAction(input: {
  key: string;
  revision: number;
  note: string;
}): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("content.publish");
    const published = await publishContent(staff, input, await getRequestMeta());
    refreshStorefront(input.key, published.kind === "PAGE");
    refreshAdmin(input.key);
    return { status: "success", message: `Published as version ${published.version}.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function unpublishPageAction(key: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("content.publish");
    await unpublishPage(staff, key, await getRequestMeta());
    refreshStorefront(key, true);
    refreshAdmin(key);
    return {
      status: "success",
      message: "The page is off the site. Its draft and history are kept.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreVersionAction(input: {
  key: string;
  versionId: string;
  revision: number;
}): Promise<ActionResult & { revision?: number }> {
  try {
    const staff = await requireStaffAction("content.write");
    const saved = await restoreVersion(staff, input, await getRequestMeta());
    refreshAdmin(input.key);
    return {
      status: "success",
      message: "That version is now the draft. Publish it to put it live.",
      revision: saved.revision,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createPageAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  let key: string;
  try {
    const staff = await requireStaffAction("content.write");
    const created = await createPage(
      staff,
      {
        slug: form.get("slug"),
        titleEn: form.get("titleEn"),
        titleBn: form.get("titleBn") ?? "",
      },
      await getRequestMeta(),
    );
    key = created.key;
    revalidatePath("/admin/content");
  } catch (error) {
    return actionError(error);
  }
  redirect(`/admin/content/${key}`);
}

export async function deletePageAction(key: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("content.publish");
    await deletePage(staff, key, await getRequestMeta());
    revalidatePath("/admin/content");
  } catch (error) {
    return actionError(error);
  }
  redirect("/admin/content");
}

export async function searchProductsAction(term: string, ids: string[] = []) {
  try {
    const staff = await requireStaffAction("content.write");
    return await findProductsForPicker(staff, term, ids.slice(0, 30));
  } catch {
    return { results: [], named: [] };
  }
}

export async function saveLabelAction(input: {
  key: string;
  locale: "en" | "bn";
  value: string;
}): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction("content.publish");
    await saveLabel(staff, input, await getRequestMeta());
    updateTag(CONTENT_TAGS.labels);
    revalidatePath("/admin/content/labels");
    return {
      status: "success",
      message: input.value.trim() === "" ? "Back to the original label." : "Label saved: live now.",
    };
  } catch (error) {
    return actionError(error);
  }
}
