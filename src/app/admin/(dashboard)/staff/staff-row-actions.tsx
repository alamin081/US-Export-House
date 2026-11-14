"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { IDLE, type ActionResult } from "@/modules/access/action-state";
import {
  resetStaffPasswordAction,
  revokeStaffSessionsAction,
  setStaffActiveAction,
  updateStaffAccessAction,
} from "@/modules/access/staff.actions";
import { FormMessage } from "./form-message";
import { LocationPicker, type LocationOption, type RoleOption } from "./location-picker";

interface MemberSummary {
  id: string;
  email: string;
  isActive: boolean;
  roleId: string;
  locationIds: readonly string[];
}

/** Per-staff controls. Each form posts to its own Server Action. */
export function StaffRowActions({
  member,
  roles,
  locations,
}: {
  member: MemberSummary;
  roles: readonly RoleOption[];
  locations: readonly LocationOption[];
}) {
  const [accessState, accessAction, accessPending] = useActionState<ActionResult, FormData>(
    updateStaffAccessAction,
    IDLE,
  );
  const [activeState, activeAction, activePending] = useActionState<ActionResult, FormData>(
    setStaffActiveAction,
    IDLE,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<ActionResult, FormData>(
    resetStaffPasswordAction,
    IDLE,
  );
  const [sessionState, sessionAction, sessionPending] = useActionState<ActionResult, FormData>(
    revokeStaffSessionsAction,
    IDLE,
  );

  const [roleId, setRoleId] = useState(member.roleId);
  const role = roles.find((option) => option.id === roleId);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={activeAction}>
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
          <Button
            type="submit"
            size="sm"
            variant={member.isActive ? "outline" : "secondary"}
            disabled={activePending}
          >
            {member.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </form>

        <form action={sessionAction}>
          <input type="hidden" name="userId" value={member.id} />
          <Button type="submit" size="sm" variant="ghost" disabled={sessionPending}>
            End all sessions
          </Button>
        </form>

        <FormMessage state={activeState} />
        <FormMessage state={sessionState} />
      </div>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          Change role and locations
        </summary>
        <form action={accessAction} className="flex flex-col gap-4 border-t border-border p-3">
          <input type="hidden" name="userId" value={member.id} />
          <div className="max-w-xs">
            <Label htmlFor={`role-${member.id}`}>Role</Label>
            <Select
              id={`role-${member.id}`}
              name="roleId"
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
          <LocationPicker
            idPrefix={`loc-${member.id}`}
            locations={locations}
            selected={member.locationIds}
            disabled={role?.allLocations ?? false}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={accessPending}>
              Save access
            </Button>
            <FormMessage state={accessState} />
          </div>
        </form>
      </details>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Reset password</summary>
        <form
          action={passwordAction}
          className="flex flex-wrap items-end gap-3 border-t border-border p-3"
        >
          <input type="hidden" name="userId" value={member.id} />
          <div className="w-full max-w-xs">
            <Label htmlFor={`pw-${member.id}`}>New temporary password</Label>
            <Input
              id={`pw-${member.id}`}
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={passwordPending}>
            Reset and sign out
          </Button>
          <FormMessage state={passwordState} />
        </form>
      </details>
    </div>
  );
}
