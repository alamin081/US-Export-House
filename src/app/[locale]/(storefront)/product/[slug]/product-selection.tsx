"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * Shared colour/size selection for the product page, so the gallery can show
 * the chosen colour's photos while the purchase panel shows its price and SKU.
 */

interface Selection {
  colourId: string | null;
  sizeId: string | null;
  setColourId: (id: string | null) => void;
  setSizeId: (id: string | null) => void;
}

const SelectionContext = createContext<Selection | null>(null);

export function ProductSelectionProvider({
  initialColourId,
  children,
}: {
  initialColourId: string | null;
  children: React.ReactNode;
}) {
  const [colourId, setColourId] = useState(initialColourId);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const value = useMemo(() => ({ colourId, sizeId, setColourId, setSizeId }), [colourId, sizeId]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useProductSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (selection === null) throw new Error("useProductSelection outside ProductSelectionProvider");
  return selection;
}
