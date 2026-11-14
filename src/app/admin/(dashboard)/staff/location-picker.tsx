"use client";

import { Checkbox } from "@/components/ui/checkbox";

export interface RoleOption {
  id: string;
  name: string;
  allLocations: boolean;
}

export interface LocationOption {
  id: string;
  label: string;
}

/**
 * Location checkboxes. For all-location roles the list is disabled, because
 * the role already grants every location.
 */
export function LocationPicker({
  idPrefix,
  locations,
  selected,
  disabled,
}: {
  idPrefix: string;
  locations: readonly LocationOption[];
  selected: readonly string[];
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="mb-2 text-sm font-medium">Locations</legend>
      {disabled ? (
        <p className="text-xs text-muted-foreground">This role covers every location.</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {locations.map((location) => (
            <label
              key={location.id}
              htmlFor={`${idPrefix}-${location.id}`}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={`${idPrefix}-${location.id}`}
                name="locationIds"
                value={location.id}
                defaultChecked={selected.includes(location.id)}
              />
              {location.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
