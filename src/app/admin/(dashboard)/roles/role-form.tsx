"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteRoleAction, saveRoleAction } from "@/modules/access/role.actions";

interface PermissionGroupView {
  label: string;
  keys: ReadonlyArray<{
    key: string;
    en: string;
    bn: string;
    sensitive: boolean;
    superAdminOnly: boolean;
  }>;
}

/**
 * Edit one role: name (custom roles), description, location scope and the
 * permission checkboxes. Shows what will be added and removed before saving.
 */
export function RoleForm({
  roleId,
  initial,
  groups,
  isSystem,
  staffCount,
  readOnlyReason,
}: {
  roleId: string | null;
  initial: {
    name: string;
    description: string;
    permissions: string[];
    allLocations: boolean;
    updatedAt: string;
  };
  groups: readonly PermissionGroupView[];
  isSystem: boolean;
  staffCount: number;
  readOnlyReason: string | null;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [allLocations, setAllLocations] = useState(initial.allLocations);
  const [chosen, setChosen] = useState<string[]>(initial.permissions);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const readOnly = readOnlyReason !== null;
  const added = chosen.filter((key) => !initial.permissions.includes(key));
  const removed = initial.permissions.filter((key) => !chosen.includes(key));

  const toggle = (key: string, on: boolean) =>
    setChosen((current) => (on ? [...current, key] : current.filter((item) => item !== key)));

  return (
    <div className="flex flex-col gap-4">
      {readOnly ? (
        <p
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="role-locked"
        >
          {readOnlyReason}
        </p>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="role-name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <Input
            id="role-name"
            value={name}
            disabled={readOnly || isSystem}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            data-testid="role-name"
          />
          {isSystem ? (
            <p className="mt-1 text-xs text-muted-foreground">System roles keep their name.</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="role-description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <Input
            id="role-description"
            value={description}
            disabled={readOnly}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-4"
            checked={allLocations}
            disabled={readOnly || isSystem}
            onChange={(event) => setAllLocations(event.target.checked)}
          />
          Works at every location (otherwise only the locations given to each staff member)
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <fieldset key={group.label} className="rounded-lg border border-border bg-background p-4">
            <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold">
              {group.label}
              {readOnly ? null : (
                <button
                  type="button"
                  className="text-xs font-normal underline"
                  onClick={() => {
                    const keys = group.keys
                      .filter((entry) => !entry.superAdminOnly)
                      .map((entry) => entry.key);
                    const all = keys.every((key) => chosen.includes(key));
                    setChosen((current) =>
                      all
                        ? current.filter((key) => !keys.includes(key))
                        : [...new Set([...current, ...keys])],
                    );
                  }}
                >
                  All / none
                </button>
              )}
            </legend>
            <ul className="mt-2 flex flex-col gap-2">
              {group.keys.map((entry) => (
                <li key={entry.key}>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={chosen.includes(entry.key)}
                      disabled={readOnly || entry.superAdminOnly}
                      onChange={(event) => toggle(entry.key, event.target.checked)}
                      data-testid={`perm-${entry.key}`}
                    />
                    <span>
                      <code
                        className={cn(
                          "text-xs",
                          entry.sensitive && "text-red-700 dark:text-red-400",
                        )}
                      >
                        {entry.key}
                      </code>
                      {entry.superAdminOnly ? (
                        <span className="ms-1 text-xs text-muted-foreground">
                          (Super Admin only)
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">{entry.en}</span>
                      <span lang="bn" className="block text-xs text-muted-foreground">
                        {entry.bn}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>

      {readOnly ? null : (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/95 p-3 backdrop-blur">
          <p className="flex-1 text-xs text-muted-foreground" data-testid="role-diff">
            {added.length === 0 && removed.length === 0
              ? "No permission changes."
              : `+ ${added.join(", ") || "none"} · − ${removed.join(", ") || "none"}`}
            {roleId === null ? "" : ` · affects ${staffCount} staff`}
          </p>
          {message === null ? null : (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn(
                "text-sm",
                message.tone === "error" ? "text-destructive" : "text-emerald-700",
              )}
              data-testid="role-message"
            >
              {message.text}
            </p>
          )}
          <Button
            type="button"
            disabled={pending}
            data-testid="save-role"
            onClick={() =>
              start(async () => {
                const result = await saveRoleAction(roleId, {
                  name,
                  description,
                  allLocations,
                  permissions: chosen,
                  updatedAt: initial.updatedAt,
                });
                if (result.status === "success" || result.status === "error") {
                  setMessage({ tone: result.status, text: result.message });
                }
              })
            }
          >
            {roleId === null ? "Create role" : "Save role"}
          </Button>
          {roleId !== null && !isSystem ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={pending || staffCount > 0}
              title={staffCount > 0 ? "Move its staff to another role first" : undefined}
              onClick={() => {
                if (window.confirm(`Delete the role “${initial.name}”?`)) {
                  start(async () => {
                    const result = await deleteRoleAction(roleId);
                    if (result.status === "error")
                      setMessage({ tone: "error", text: result.message });
                  });
                }
              }}
            >
              Delete role
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
