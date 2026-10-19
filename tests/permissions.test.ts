import { describe, expect, it } from "vitest";
import { LEVELS, hasPermission, isOwner, staffChangeBlocked } from "../src/shared/permissions";

const ceo = { id: "ceo", role: "ceo", level: "ceo", permissions: [] };
const coo = { id: "coo", role: "admin", level: "coo", permissions: [] };
const dev = { id: "dev", role: "admin", level: "developer", permissions: [...LEVELS.developer.defaults] };
const desk = { id: "desk", role: "admin", level: "receptionist", permissions: [...LEVELS.receptionist.defaults] };
const books = { id: "books", role: "admin", level: "accountant", permissions: [...LEVELS.accountant.defaults] };

describe("roles", () => {
  it("gives the CEO and COO everything", () => {
    expect(isOwner(ceo) && isOwner(coo)).toBe(true);
    expect(hasPermission(coo, "manage_staff")).toBe(true);
    expect(isOwner({ role: "client", level: "coo", permissions: [] })).toBe(false);
  });
  it("keeps receptionists to the front desk", () => {
    expect(hasPermission(desk, "verify_payments")).toBe(true);
    expect(hasPermission(desk, "view_reports")).toBe(false);
    expect(hasPermission(desk, "view_payments")).toBe(false);
  });
  it("lets accountants see money but not staff", () => {
    expect(hasPermission(books, "view_reports")).toBe(true);
    expect(hasPermission(books, "manage_staff")).toBe(false);
  });
  it("lets the developer switch booking categories", () => {
    expect(hasPermission(dev, "toggle_booking_categories")).toBe(true);
  });
});

describe("staffChangeBlocked", () => {
  it("lets owners create and change anyone but the CEO", () => {
    expect(staffChangeBlocked(ceo, null, { level: "coo", permissions: [] })).toBeNull();
    expect(staffChangeBlocked(coo, desk, { level: "receptionist", permissions: ["manage_staff"] })).toBeNull();
    expect(staffChangeBlocked(coo, ceo, { level: "custom", permissions: [] })).not.toBeNull();
  });
  it("stops people changing their own access", () => {
    expect(staffChangeBlocked(dev, dev, { level: "developer", permissions: dev.permissions })).toMatch(/own access/);
  });
  it("keeps the developer below the owners", () => {
    expect(staffChangeBlocked(dev, coo, { level: "custom", permissions: [] })).not.toBeNull();
    expect(staffChangeBlocked(dev, null, { level: "coo", permissions: [] })).not.toBeNull();
    expect(staffChangeBlocked(dev, desk, { level: "receptionist", permissions: ["manage_staff"] })).not.toBeNull();
  });
  it("lets the developer hand out only what they hold", () => {
    expect(staffChangeBlocked(dev, desk, { level: "receptionist", permissions: ["edit_content"] })).toBeNull();
    expect(staffChangeBlocked(dev, desk, { level: "receptionist", permissions: ["view_reports"] })).toMatch(/view reports/);
  });
  it("needs the manage staff permission", () => {
    expect(staffChangeBlocked(desk, books, { level: "accountant", permissions: [] })).not.toBeNull();
  });
});
