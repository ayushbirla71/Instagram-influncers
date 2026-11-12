"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ensureInvite } from "@/lib/instagram/oauth";

const Status = z.enum(["NEW", "SHORTLISTED", "SELECTED", "REJECTED", "ON_HOLD"]);
const AssignmentStatus = z.enum(["PLANNED", "CONFIRMED", "VISITED", "POSTED", "CANCELLED"]);

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
const optionalDate = z.preprocess(emptyToNull, z.coerce.date().nullable());

function refresh(handle?: string) {
  revalidatePath("/influencers");
  revalidatePath("/shortlist");
  revalidatePath("/dashboard");
  if (handle) revalidatePath(`/influencers/${handle}`);
}

/** Bulk status change from the influencers table: form has `ids` (many) and `status`. */
export async function bulkSetStatus(formData: FormData): Promise<void> {
  await requireUser();
  const ids = z.array(z.string().min(1)).max(1000).parse(formData.getAll("ids"));
  const status = Status.parse(formData.get("status"));
  if (ids.length === 0) return;
  await db.influencer.updateMany({ where: { id: { in: ids } }, data: { status } });
  refresh();
}

export async function setStatus(influencerId: string, handle: string, status: z.infer<typeof Status>): Promise<void> {
  await requireUser();
  await db.influencer.update({ where: { id: influencerId }, data: { status: Status.parse(status) } });
  refresh(handle);
}

const DetailsSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  status: Status,
  notes: optionalText(2000),
  budget: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100_000_000).nullable()),
});

export async function saveDetails(formData: FormData): Promise<void> {
  await requireUser();
  const d = DetailsSchema.parse(Object.fromEntries(formData));
  await db.influencer.update({ where: { id: d.id }, data: { status: d.status, notes: d.notes, budget: d.budget } });
  refresh(d.handle);
}

const AssignmentSchema = z.object({
  influencerId: z.string().min(1),
  handle: z.string().min(1),
  concept: optionalText(500),
  visitOrHome: z.preprocess(emptyToNull, z.enum(["Visit", "Home"]).nullable()),
  visitDate: optionalDate,
  postingDate: optionalDate,
  status: AssignmentStatus.default("PLANNED"),
  remarks: optionalText(1000),
});

export async function addAssignment(formData: FormData): Promise<void> {
  await requireUser();
  const { handle, ...data } = AssignmentSchema.parse(Object.fromEntries(formData));
  await db.assignment.create({ data });
  refresh(handle);
}

export async function updateAssignmentStatus(assignmentId: string, handle: string, status: z.infer<typeof AssignmentStatus>): Promise<void> {
  await requireUser();
  await db.assignment.update({ where: { id: assignmentId }, data: { status: AssignmentStatus.parse(status) } });
  refresh(handle);
}

export async function deleteAssignment(assignmentId: string, handle: string): Promise<void> {
  await requireUser();
  await db.assignment.delete({ where: { id: assignmentId } });
  refresh(handle);
}

/** Creates the tokenised link an influencer opens to connect their Instagram (idempotent). */
export async function createConnectInvite(influencerId: string, handle: string): Promise<void> {
  await requireUser();
  await ensureInvite(influencerId);
  refresh(handle);
}
