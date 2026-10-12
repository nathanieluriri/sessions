export const PERMISSIONS = {
  view_calendar: "View calendar, bookings, holds, blocked time and client history",
  manage_bookings: "Create, approve, reject, reschedule, cancel and complete bookings, and decide client requests",
  update_booking_details: "Edit people, notes and contact details on bookings",
  record_payments: "Record cash or transfer payments and send payment links",
  assist_clients: "Read and reply to enquiries and quote requests",
  edit_availability: "Edit opening hours, buffers and blocked time",
  edit_packages: "Edit services, packages, rooms, extras, deposits and approval rules",
  edit_content: "Edit website pages, portfolio, team, FAQs, policies, SEO and analytics",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const CEO_ONLY = ["Payments and financial reports", "Staff and permissions", "Audit log and email outbox"];
