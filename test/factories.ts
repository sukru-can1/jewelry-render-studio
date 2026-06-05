import bcrypt from "bcryptjs";

// Test data factories consumed by RBAC/admin tests in later waves. These return
// plain User-shaped objects (no DB write) — persistence is exercised in Plan 02
// integration tests. passwordHash is a real bcrypt hash of a known test password
// so `authorize()`-style comparisons can be asserted.

export const TEST_PASSWORD = "test-password-123";

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

export function adminUser(overrides: Partial<UserFactory> = {}): UserFactory {
  return {
    id: "test-admin-id",
    email: "admin@example.com",
    role: "Admin",
    disabled: false,
    passwordHash,
    ...overrides,
  };
}

export function operatorUser(overrides: Partial<UserFactory> = {}): UserFactory {
  return {
    id: "test-operator-id",
    email: "operator@example.com",
    role: "Operator",
    disabled: false,
    passwordHash,
    ...overrides,
  };
}

export interface UserFactory {
  id: string;
  email: string;
  role: "Admin" | "Operator";
  disabled: boolean;
  passwordHash: string;
}
