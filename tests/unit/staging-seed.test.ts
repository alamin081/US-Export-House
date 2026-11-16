import { describe, expect, it } from "vitest";

import {
  defaultSettingRows,
  planAccessAndSettings,
  systemRoleRows,
} from "../../prisma/reference/access-and-settings";
import {
  checkServerIdentity,
  checkStagingTarget,
  STAGING_DATABASE,
} from "../../scripts/lib/staging-seed-guard";
import { PERMISSIONS, SUPER_ADMIN_ROLE } from "@/modules/access/permissions";
import { DEPRECATED_SETTING_KEYS, SETTING_DEFINITIONS } from "@/modules/settings/settings.registry";

/** Fake credentials; the host shape matches the pinned staging endpoint. */
const DIRECT = `postgresql://role:fake-password@${STAGING_DATABASE.neonEndpointId}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const STAGING_ENV = { APP_ENV: "staging", DATABASE_URL_UNPOOLED: DIRECT };

function reason(env: Record<string, string | undefined>): string {
  const result = checkStagingTarget(env);
  if (result.ok) throw new Error("expected a refusal");
  return result.reason;
}

describe("staging seed target guard", () => {
  it("accepts the pinned staging endpoint over the direct connection", () => {
    const result = checkStagingTarget(STAGING_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.label).toBe(
        `${STAGING_DATABASE.neonEndpointId}.c-3.ap-southeast-1.aws.neon.tech/neondb`,
      );
      expect(result.label).not.toContain("fake-password");
    }
  });

  it("refuses production, local and a missing APP_ENV", () => {
    expect(reason({ ...STAGING_ENV, APP_ENV: "production" })).toContain('must be "staging"');
    expect(reason({ ...STAGING_ENV, APP_ENV: "local" })).toContain('must be "staging"');
    expect(reason({ DATABASE_URL_UNPOOLED: DIRECT })).toContain('must be "staging"');
  });

  it("refuses the pooler, another endpoint, another database and no TLS", () => {
    expect(
      reason({
        ...STAGING_ENV,
        DATABASE_URL_UNPOOLED: DIRECT.replace(
          STAGING_DATABASE.neonEndpointId,
          `${STAGING_DATABASE.neonEndpointId}-pooler`,
        ),
      }),
    ).toContain("pooler");
    expect(
      reason({
        ...STAGING_ENV,
        DATABASE_URL_UNPOOLED: DIRECT.replace("ep-odd-breeze", "ep-other"),
      }),
    ).toContain("is not the staging endpoint");
    expect(
      reason({ ...STAGING_ENV, DATABASE_URL_UNPOOLED: DIRECT.replace("/neondb", "/other") }),
    ).toContain('Database "other"');
    expect(
      reason({ ...STAGING_ENV, DATABASE_URL_UNPOOLED: DIRECT.replace("?sslmode=require", "") }),
    ).toContain("sslmode=require");
    expect(
      reason({
        ...STAGING_ENV,
        DATABASE_URL_UNPOOLED: "postgresql://u:p@localhost:5432/us_export_house",
      }),
    ).toContain("is not the staging endpoint");
    expect(reason({ APP_ENV: "staging" })).toContain("DATABASE_URL_UNPOOLED");
  });

  it("never echoes the password in a refusal", () => {
    const message = reason({
      ...STAGING_ENV,
      DATABASE_URL_UNPOOLED: DIRECT.replace("/neondb", "/other"),
    });
    expect(message).not.toContain("fake-password");
  });

  it("checks the identity the server reports", () => {
    const good = {
      projectId: STAGING_DATABASE.neonProjectId,
      branchId: STAGING_DATABASE.neonBranchId,
      database: STAGING_DATABASE.database,
    };
    expect(checkServerIdentity(good)).toBeNull();
    expect(checkServerIdentity({ ...good, projectId: "fancy-cake-09808437" })).toContain(
      "Neon project",
    );
    expect(checkServerIdentity({ ...good, branchId: "br-main" })).toContain("Neon branch");
    expect(checkServerIdentity({ ...good, projectId: null })).toContain("unknown");
    expect(checkServerIdentity({ ...good, database: "postgres" })).toContain("database");
  });
});

describe("staging seed plan (roles and settings)", () => {
  it("creates the seven system roles, Super Admin with every permission", () => {
    const roles = systemRoleRows();
    expect(roles).toHaveLength(7);
    expect(new Set(roles.map((role) => role.name)).size).toBe(7);
    const superAdmin = roles.find((role) => role.name === SUPER_ADMIN_ROLE);
    expect(superAdmin?.permissions).toEqual([...PERMISSIONS]);
    expect(superAdmin?.allLocations).toBe(true);
    for (const role of roles) {
      expect(role.isSystem).toBe(true);
      for (const key of role.permissions) expect(PERMISSIONS).toContain(key);
      if (role.name !== SUPER_ADMIN_ROLE) expect(role.permissions).not.toContain("role.manage");
    }
  });

  it("creates one setting per registry key, defaults only, no deprecated keys", () => {
    const rows = defaultSettingRows();
    const deprecated: readonly string[] = DEPRECATED_SETTING_KEYS;
    expect(rows).toHaveLength(
      SETTING_DEFINITIONS.filter((definition) => !deprecated.includes(definition.key)).length,
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    for (const row of rows) {
      const definition = SETTING_DEFINITIONS.find((item) => item.key === row.key);
      expect(row.value).toBe(definition?.defaultValue);
      expect(deprecated).not.toContain(row.key);
      expect(row.isPublic).toBe(false);
      expect(["STRING", "INT", "BOOLEAN", "JSON"]).toContain(row.valueType);
    }
  });

  it("plans everything on an empty database", () => {
    const plan = planAccessAndSettings([], []);
    expect(plan.rolesToCreate).toHaveLength(7);
    expect(plan.settingsToCreate).toHaveLength(defaultSettingRows().length);
    expect(plan.warnings).toEqual([]);
  });

  it("is idempotent: a second run creates nothing", () => {
    const first = planAccessAndSettings([], []);
    const second = planAccessAndSettings(
      first.rolesToCreate.map((role) => ({ ...role, deletedAt: null })),
      first.settingsToCreate.map((row) => row.key),
    );
    expect(second.rolesToCreate).toEqual([]);
    expect(second.settingsToCreate).toEqual([]);
    expect(second.warnings).toEqual([]);
  });

  it("never changes an edited role or setting, only reports it", () => {
    const edited = planAccessAndSettings(
      [
        { name: "Branch Manager", permissions: ["catalog.read"], deletedAt: null },
        { name: "Content Editor", permissions: [], deletedAt: new Date() },
      ],
      [defaultSettingRows()[0]?.key ?? ""],
    );
    expect(edited.rolesToCreate.map((role) => role.name)).not.toContain("Branch Manager");
    expect(edited.rolesToCreate.map((role) => role.name)).not.toContain("Content Editor");
    expect(edited.rolesToCreate).toHaveLength(5);
    expect(edited.settingsToCreate.map((row) => row.key)).not.toContain(
      defaultSettingRows()[0]?.key,
    );
    expect(edited.warnings).toHaveLength(2);
  });
});
