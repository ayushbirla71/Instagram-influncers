import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import influencers"
        subtitle="Upload an Excel (.xlsx) list. Handles are read from the link or handle column, follower counts like “15.6k” are converted, locations are cleaned, and people already in the platform are merged, never duplicated."
      />
      <ImportClient />
    </>
  );
}
