import { PlaceholderBadge } from "@/components/ui/badge";

/**
 * Marks the seed's sample locations and their stock, so local sample data is
 * never mistaken for real stock (it never exists in staging or production).
 */
export function SampleBadge({ show }: { show: boolean }) {
  return show ? <PlaceholderBadge label="Sample data" /> : null;
}
