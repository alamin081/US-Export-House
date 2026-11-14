"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { IDLE, type ActionResult } from "@/modules/access/action-state";
import { createStaffAction } from "@/modules/access/staff.actions";
import { FormMessage } from "./form-message";
import { LocationPicker, type LocationOption, type RoleOption } from "./location-picker";

export function CreateStaffForm({
  roles,
  locations,
}: {
  roles: readonly RoleOption[];
  locations: readonly LocationOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createStaffAction,
    IDLE,
  );
  const [roleId, setRoleId] = useState(roles.find((role) => !role.allLocations)?.id ?? "");
  const selectedRole = roles.find((role) => role.id === roleId);

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      <div>
        <Label htmlFor="new-name" required>
          Name
        </Label>
        <Input id="new-name" name="name" autoComplete="off" required />
      </div>

      <div>
        <Label htmlFor="new-email" required>
          Email
        </Label>
        <Input id="new-email" name="email" type="email" autoComplete="off" required />
      </div>

      <div>
        <Label htmlFor="new-role" required>
          Role
        </Label>
        <Select
          id="new-role"
          name="roleId"
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="new-password" required>
          Temporary password
        </Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="new-password-hint"
        />
        <FieldHint id="new-password-hint">At least 12 characters.</FieldHint>
      </div>

      <div className="sm:col-span-2">
        <LocationPicker
          idPrefix="new-location"
          locations={locations}
          selected={[]}
          disabled={selectedRole?.allLocations ?? false}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          <UserPlus aria-hidden="true" />
          {pending ? "Creating…" : "Create staff account"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
