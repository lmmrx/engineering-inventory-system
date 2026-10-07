import { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditEntityType = "auth" | "user" | "hotel" | "category" | "item" | "work_order" | "purchase_request";

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

interface AuditEntry {
  action: `${AuditEntityType}.${string}`;
  entityId?: string | null;
  summary: string;
  changes?: AuditChanges | null;
  hotelId?: string | null;
  departmentId?: string | null;
  /** Defaults to the signed-in user; pass explicitly for sign-in events. */
  actorUserId?: string | null;
}

/**
 * Records an audit entry. Called after the change has succeeded; a failure to
 * write the entry is logged loudly but doesn't turn a completed change into an
 * error response, which would invite the user to repeat it.
 */
export async function audit(req: Request, entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.action.split(".")[0],
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        changes: entry.changes && Object.keys(entry.changes).length > 0 ? (entry.changes as Prisma.InputJsonValue) : undefined,
        ip: req.ip ?? null,
        actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : req.user?.userId ?? null,
        hotelId: entry.hotelId ?? null,
        departmentId: entry.departmentId ?? null,
      },
    });
  } catch (err) {
    console.error("AUDIT WRITE FAILED", entry.action, entry.entityId, err);
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return value ?? null;
}

// Foreign keys are stored as names, so the log reads "Housekeeping → Engineering"
// and stays meaningful if the referenced record is renamed later.
const NAME_LOOKUPS: Record<string, (id: string) => Promise<string | undefined>> = {
  hotelId: async (id) => (await prisma.hotel.findUnique({ where: { id } }))?.name,
  departmentId: async (id) => (await prisma.department.findUnique({ where: { id } }))?.name,
  categoryId: async (id) => (await prisma.category.findUnique({ where: { id } }))?.name,
  parentId: async (id) => (await prisma.category.findUnique({ where: { id } }))?.name,
  assignedToUserId: async (id) => (await prisma.user.findUnique({ where: { id } }))?.name,
};

/** Short, human-readable reference for a record, shared by the audit log and exports so they cross-match. */
export function recordRef(prefix: "WO" | "PR", id: string | null | undefined) {
  return id ? `${prefix}-${id.slice(-6).toUpperCase()}` : "";
}

/** The fields whose value differs between before and after, with ids resolved to names. */
export async function diff<T extends object>(before: T, after: T, fields: (keyof T & string)[]): Promise<AuditChanges> {
  const changes: AuditChanges = {};
  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (from === to) continue;
    const lookup = NAME_LOOKUPS[field];
    changes[field] = lookup
      ? {
          from: typeof from === "string" ? (await lookup(from)) ?? from : from,
          to: typeof to === "string" ? (await lookup(to)) ?? to : to,
        }
      : { from, to };
  }
  return changes;
}

/** Field values for a newly created record, in the same shape as an update's changes. */
export async function created<T extends object>(record: T, fields: (keyof T & string)[]) {
  return diff({} as T, record, fields);
}
