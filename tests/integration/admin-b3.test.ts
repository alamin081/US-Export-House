import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import { createRole, deleteRole, getRoleForEdit, updateRole } from "@/modules/access/role.service";
import { auditCsvPages, getAuditEntry, listAudit } from "@/modules/audit/audit-log.service";
import { recordAudit } from "@/modules/audit/audit.service";
import { listLabels, saveLabel } from "@/modules/content/ui-labels.service";
import {
  getSettingsPage,
  resetSetting,
  saveSettings,
} from "@/modules/settings/settings-admin.service";
import { caught, runId, staffFor, testMeta } from "./order-fixture";

/**
 * Phase 12 B-3 against the real test database: the Settings page's rules,
 * role editing without lock-outs, the append-only audit log (and the
 * test-only purge switch), and storefront label overrides.
 */

const RUN = runId();
const meta = testMeta;
let owner: StaffContext;
let manager: StaffContext;
let editor: StaffContext;
const touchedSettings = [
  "returns.windowDays",
  "returns.maxPhotos",
  "store.whatsapp",
  "social.facebookUrl",
  "shipping.freeThresholdPoisha",
  "checkout.codMaxTotalPoisha",
];
let settingsBefore: Array<{ key: string; value: string }> = [];

beforeAll(async () => {
  owner = await staffFor(RUN, "Super Admin");
  manager = await staffFor(RUN, "Store Manager");
  editor = await staffFor(RUN, "Content Editor");
  settingsBefore = await db.setting.findMany({
    where: { key: { in: touchedSettings } },
    select: { key: true, value: true },
  });
});

afterAll(async () => {
  // Put the shared test database's settings back as they were.
  const existing = new Map(settingsBefore.map((row) => [row.key, row.value]));
  for (const key of touchedSettings) {
    const value = existing.get(key);
    if (value === undefined) await db.setting.deleteMany({ where: { key } });
    else await db.setting.update({ where: { key }, data: { value } });
  }
  await db.uiLabelOverride.deleteMany({ where: { key: "Home.newArrivalsTitle" } });
  await db.$disconnect();
});

describe("settings", () => {
  it("shows each role only the groups it may change", async () => {
    const managerPage = await getSettingsPage(manager);
    const groups = managerPage.groups.map((group) => group.key);
    expect(groups).toContain("store");
    expect(groups).toContain("checkout");
    expect(groups).not.toContain("returns");
    const editorGroups = (await getSettingsPage(editor)).groups.map((group) => group.key);
    expect(editorGroups.sort()).toEqual(["seo", "store"]);
    // Status shows connections, never secret values.
    expect(JSON.stringify(managerPage.status)).not.toMatch(/sk_|secret|password/i);
  });

  it("saves valid values with an audit trail and refuses everything when one is wrong", async () => {
    expect(
      (
        await caught(
          saveSettings(
            owner,
            "returns",
            { "returns.windowDays": "10", "returns.maxPhotos": "99" },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    // Nothing was written: the whole group is refused together.
    expect((await db.setting.findUnique({ where: { key: "returns.maxPhotos" } }))?.value).toBe(
      settingsBefore.find((row) => row.key === "returns.maxPhotos")?.value,
    );
    const windowBefore =
      (await db.setting.findUnique({ where: { key: "returns.windowDays" } }))?.value ?? "7";
    expect(windowBefore).not.toBe("10");

    const saved = await saveSettings(owner, "returns", { "returns.windowDays": "10" }, meta());
    expect(saved.changed).toEqual(["returns.windowDays"]);
    expect(saved.tags).toContain("settings");
    expect(
      (await db.setting.findUniqueOrThrow({ where: { key: "returns.windowDays" } })).value,
    ).toBe("10");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "settings.changed", userId: owner.userId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.before).toEqual({ "returns.windowDays": windowBefore });
    expect(audit.after).toEqual({ "returns.windowDays": "10" });

    await resetSetting(owner, "returns.windowDays", meta());
    expect(
      (await db.setting.findUniqueOrThrow({ where: { key: "returns.windowDays" } })).value,
    ).toBe("7");
  });

  it("takes money in taka and stores poisha", async () => {
    await saveSettings(owner, "checkout", { "checkout.codMaxTotalPoisha": "25,000" }, meta());
    expect(
      (await db.setting.findUniqueOrThrow({ where: { key: "checkout.codMaxTotalPoisha" } })).value,
    ).toBe("2500000");
  });

  it("follows each setting's permission", async () => {
    expect(
      (await caught(saveSettings(manager, "returns", { "returns.windowDays": "9" }, meta()))).code,
    ).toBe("FORBIDDEN");
    await saveSettings(editor, "store", { "store.whatsapp": "8801711000000" }, meta());
    await saveSettings(
      editor,
      "seo",
      { "social.facebookUrl": "https://facebook.com/usexporthouse" },
      meta(),
    );
    expect(
      (await caught(saveSettings(editor, "tax", { "vat.enabled": "true" }, meta()))).code,
    ).toBe("FORBIDDEN");
    expect(
      (
        await caught(
          saveSettings(editor, "seo", { "social.facebookUrl": "https://evil.example/x" }, meta()),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    // Edited on its own screen: refused here.
    expect(
      (
        await caught(
          saveSettings(owner, "delivery", { "shipping.freeThresholdPoisha": "3000" }, meta()),
        )
      ).code,
    ).toBe("FORBIDDEN");
    // Unknown and deprecated keys are refused.
    expect(
      (await caught(saveSettings(owner, "orders", { "orders.numberPadding": "5" }, meta()))).code,
    ).toBe("VALIDATION_FAILED");
  });
});

describe("roles", () => {
  it("only a Super Admin edits roles, and never their own or the Super Admin role", async () => {
    expect(
      (await caught(createRole(manager, { name: `X ${RUN}`, permissions: [] }, meta()))).code,
    ).toBe("FORBIDDEN");
    const superAdmin = await db.role.findFirstOrThrow({ where: { name: "Super Admin" } });
    const other = await staffFor(RUN, "Super Admin");
    expect(
      (
        await caught(
          updateRole(
            other,
            superAdmin.id,
            { name: "Super Admin", permissions: [], updatedAt: superAdmin.updatedAt.toISOString() },
            meta(),
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
    const ownRole = {
      ...owner,
      roleId: (await db.role.findFirstOrThrow({ where: { name: "Store Manager" } })).id,
    };
    const storeManagerRole = await getRoleForEdit(owner, ownRole.roleId);
    expect(
      (
        await caught(
          updateRole(
            ownRole,
            ownRole.roleId,
            {
              name: "Store Manager",
              permissions: ["catalog.read"],
              updatedAt: storeManagerRole.updatedAt,
            },
            meta(),
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
  });

  it("creates, edits and deletes a custom role with only known keys", async () => {
    expect(
      (
        await caught(
          createRole(
            owner,
            { name: `Bad ${RUN}`, permissions: ["catalog.read", "made.up"] },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await caught(
          createRole(owner, { name: `Admin ${RUN}`, permissions: ["role.manage"] }, meta()),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (await caught(createRole(owner, { name: "super admin", permissions: [] }, meta()))).code,
    ).toBe("VALIDATION_FAILED");

    const created = await createRole(
      owner,
      { name: `Packers ${RUN}`, permissions: ["order.read"] },
      meta(),
    );
    const role = await getRoleForEdit(owner, created.id);
    await updateRole(
      owner,
      created.id,
      {
        name: `Packers ${RUN}`,
        permissions: ["order.read", "order.fulfil"],
        updatedAt: role.updatedAt,
      },
      meta(),
    );
    // A second save on the old version is refused (optimistic lock).
    expect(
      (
        await caught(
          updateRole(
            owner,
            created.id,
            { name: `Packers ${RUN}`, permissions: [], updatedAt: role.updatedAt },
            meta(),
          ),
        )
      ).code,
    ).toBe("CONFLICT");
    // The next request of a staff member with this role sees the change.
    const stored = await db.role.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.permissions).toEqual(["order.fulfil", "order.read"]);

    // In use: cannot be deleted.
    const user = await db.user.create({
      data: { kind: "STAFF", email: `packer-${RUN.toLowerCase()}@test.local`, roleId: created.id },
    });
    expect((await caught(deleteRole(owner, created.id, meta()))).code).toBe("VALIDATION_FAILED");
    await db.user.update({ where: { id: user.id }, data: { roleId: null, isActive: false } });
    await deleteRole(owner, created.id, meta());
    expect(
      (await db.role.findUniqueOrThrow({ where: { id: created.id } })).deletedAt,
    ).not.toBeNull();
    const actions = await db.auditLog.findMany({
      where: { entityId: created.id },
      select: { action: true },
    });
    expect(actions.map((row) => row.action).sort()).toEqual([
      "role.created",
      "role.deleted",
      "role.updated",
    ]);
  });

  it("system roles keep their name", async () => {
    const branch = await db.role.findFirstOrThrow({ where: { name: "Inventory Staff" } });
    const view = await getRoleForEdit(owner, branch.id);
    await updateRole(
      owner,
      branch.id,
      {
        name: "Renamed",
        permissions: view.permissions,
        updatedAt: view.updatedAt,
        allLocations: true,
      },
      meta(),
    );
    const after = await db.role.findUniqueOrThrow({ where: { id: branch.id } });
    expect(after.name).toBe("Inventory Staff");
    expect(after.allLocations).toBe(false);
  });
});

describe("audit log", () => {
  it("refuses UPDATE, DELETE and TRUNCATE", async () => {
    const row = await db.auditLog.findFirstOrThrow();
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { action: "changed" } }),
    ).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/,
    );
    await expect(db.$executeRaw`TRUNCATE "AuditLog"`).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
  });

  it("lets only an explicit purge in a _test database through, and never elsewhere", async () => {
    const names = await db.$queryRaw<
      Array<{ dev: boolean; prod: boolean; test: boolean; tricky: boolean }>
    >`
      SELECT audit_log_purge_allowed('us_export_house') AS dev,
             audit_log_purge_allowed('neondb') AS prod,
             audit_log_purge_allowed('us_export_house_test') AS test,
             audit_log_purge_allowed('us_export_house_test_backup') AS tricky`;
    expect(names[0]).toEqual({ dev: false, prod: false, test: true, tricky: false });
    const row = await db.auditLog.findFirstOrThrow();
    // Allowed here only with the switch, and rolled back so nothing is lost.
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.audit_purge = 'on'`;
        const deleted = await tx.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${row.id}`;
        expect(deleted).toBe(1);
        throw new Error("ROLLBACK");
      }),
    ).rejects.toThrow("ROLLBACK");
    expect(await db.auditLog.findUnique({ where: { id: row.id } })).not.toBeNull();
  });

  it("filters, masks phone numbers and exports only with audit.export", async () => {
    await recordAudit({
      actorUserId: owner.userId,
      action: "order.call_logged",
      entityType: "order",
      entityId: `IT-${RUN}`,
      after: { phone: "01712345678", note: `call ${RUN}` },
      meta: meta(),
    });
    const list = await listAudit(owner, { action: "order.", id: `IT-${RUN}` });
    expect(list.rows).toHaveLength(1);
    const entry = await getAuditEntry(owner, list.rows[0]!.id);
    expect(JSON.stringify(entry.after)).toContain("017•••••678");
    expect(JSON.stringify(entry)).not.toContain("01712345678");
    expect(entry.diff.find((row) => row.path === "phone")?.change).toBe("added");

    const noExport = {
      ...owner,
      permissions: owner.permissions.filter((key) => key !== "audit.export"),
    };
    await expect(auditCsvPages(noExport, {}).next()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const page = await auditCsvPages(owner, { id: `IT-${RUN}` }).next();
    expect(page.value?.[0]?.after).toContain("017•••••678");
  });
});

describe("storefront labels", () => {
  it("need content.publish, keep placeholders and only touch allowed keys", async () => {
    expect(
      (
        await caught(
          saveLabel(
            editor,
            { key: "Home.newArrivalsTitle", locale: "en", value: "Just in" },
            meta(),
          ),
        )
      ).code,
    ).toBe("FORBIDDEN");
    await saveLabel(
      manager,
      { key: "Home.newArrivalsTitle", locale: "en", value: "Just in" },
      meta(),
    );
    const listed = (await listLabels(editor)).labels.find(
      (label) => label.key === "Home.newArrivalsTitle",
    );
    expect(listed?.en.override).toBe("Just in");
    expect(
      (
        await caught(
          saveLabel(
            manager,
            { key: "Shop.searchResultsFor", locale: "en", value: "Results" },
            meta(),
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    expect(
      (
        await caught(
          saveLabel(manager, { key: "Checkout.title", locale: "en", value: "Pay here" }, meta()),
        )
      ).code,
    ).toBe("FORBIDDEN");
    // Clearing brings back the code's label.
    await saveLabel(manager, { key: "Home.newArrivalsTitle", locale: "en", value: "" }, meta());
    expect(await db.uiLabelOverride.count({ where: { key: "Home.newArrivalsTitle" } })).toBe(0);
    expect(
      await db.auditLog.count({ where: { action: "ui_labels.changed", userId: manager.userId } }),
    ).toBe(2);
  });
});
