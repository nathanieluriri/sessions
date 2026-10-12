export const PERMISSIONS = {
  view_calendar: "View calendar, holds and blocked time",
  manage_bookings: "Reschedule or cancel bookings and decide client requests",
  update_booking_details: "Edit people, notes and contact details on bookings",
  assist_clients: "Read and reply to enquiries",
  edit_availability: "Edit opening hours, buffers and blocked time",
  edit_packages: "Edit packages and services",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const CEO_ONLY = ["Payments and financial reports", "Staff and permissions", "Website content and policies", "Audit log and email outbox"];
