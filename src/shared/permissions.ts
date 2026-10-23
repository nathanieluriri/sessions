export const PERMISSIONS = {
  view_calendar: "View calendar, bookings, holds, blocked time and client history",
  manage_bookings: "Create, approve, reject, reschedule, cancel and complete bookings, and decide client requests",
  update_booking_details: "Edit people, notes and contact details on bookings",
  record_payments: "Record cash or transfer payments and send payment links",
  verify_payments: "Look up payment reference codes and validate payments",
  view_payments: "See every payment and outstanding balance",
  view_reports: "See financial reports and export bookings",
  assist_clients: "Read and reply to enquiries and quote requests",
  edit_availability: "Edit opening hours, buffers and blocked time",
  edit_packages: "Edit services, packages, rooms, extras, deposits and approval rules",
  toggle_booking_categories: "Turn categories on or off for online booking",
  edit_content: "Edit website pages, portfolio, team, FAQs, policies, SEO and analytics",
  view_audit: "See the audit log and email outbox",
  manage_staff: "Add staff and change their access",
  deliver_files: "Upload finished work to clients and download the files clients send",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const LEVELS = {
  ceo: { label: "CEO", defaults: [] as Permission[] },
  coo: { label: "COO", defaults: [] as Permission[] },
  accountant: { label: "Accountant", defaults: ["view_calendar", "record_payments", "verify_payments", "view_payments", "view_reports"] as Permission[] },
  receptionist: { label: "Receptionist", defaults: ["view_calendar", "manage_bookings", "update_booking_details", "verify_payments", "assist_clients"] as Permission[] },
  producer: { label: "Producer or engineer", defaults: ["view_calendar", "deliver_files"] as Permission[] },
  developer: { label: "Developer", defaults: ["edit_content", "toggle_booking_categories", "view_audit", "manage_staff"] as Permission[] },
  custom: { label: "Staff", defaults: [] as Permission[] },
} as const;

export type Level = keyof typeof LEVELS;

export const OWNER_ONLY = ["Changing CEO and COO accounts", "Giving out the manage staff permission", "Launch setup"];

interface Access { id?: string; role: string; level?: string; permissions: string[] }

/** CEO and COO have every permission. */
export const isOwner = (u: Access) => u.role === "ceo" || (u.role === "admin" && u.level === "coo");

export const hasPermission = (u: Access, p: Permission) => isOwner(u) || (u.role === "admin" && u.permissions.includes(p));

const FRONT_DESK: Permission[] = ["manage_bookings", "update_booking_details", "assist_clients", "record_payments"];

/** Client email and phone are for the front desk. Producers deliver through the portal and never see how to reach a client. */
export const canSeeContacts = (u: Access) => isOwner(u) || FRONT_DESK.some((p) => hasPermission(u, p));

/** Why `actor` may not set `target` to `next`, or null when allowed. `target` is null for a new account. */
export function staffChangeBlocked(actor: Access, target: Access | null, next: { level: Level; permissions: string[] }): string | null {
  if (!hasPermission(actor, "manage_staff")) return "You cannot manage staff.";
  if (target && actor.id && target.id === actor.id) return "You cannot change your own access.";
  if (target?.role === "ceo" || next.level === "ceo") return "The CEO account cannot be changed here.";
  if (isOwner(actor)) return null;
  if (target && isOwner(target)) return "Only the CEO or COO can change a COO account.";
  if (next.level === "coo") return "Only the CEO or COO can make someone COO.";
  if (next.permissions.includes("manage_staff")) return "Only the CEO or COO can give out the manage staff permission.";
  const extra = next.permissions.find((p) => !actor.permissions.includes(p));
  if (extra) return `You can only give permissions you have yourself (${extra.replace(/_/g, " ")}).`;
  return null;
}
