"use client";

import { useRef } from "react";

/** Header checkbox that ticks every `name="ids"` checkbox in its form. */
export function SelectAll({ label = "Select all rows" }: { label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      onChange={(e) => {
        const form = ref.current?.closest("form");
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => (c.checked = e.target.checked));
      }}
    />
  );
}
