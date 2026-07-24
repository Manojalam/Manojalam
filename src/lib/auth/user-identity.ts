type UserIdentitySource = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type UserIdentity = {
  displayName: string;
  email: string;
  initials: string;
};

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getInitials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "A")[0] ?? "A";
  const last = parts.length > 1
    ? Array.from(parts[parts.length - 1])[0] ?? ""
    : "";

  return `${first}${last}`.toUpperCase();
}

export function getUserIdentity(user: UserIdentitySource): UserIdentity {
  const email = user.email?.trim() ?? "";
  const metadata = user.user_metadata ?? {};
  const displayName = firstNonEmptyString([
    metadata.display_name,
    metadata.full_name,
    metadata.name,
  ]) ?? email.split("@")[0] ?? "Account";
  const safeDisplayName = displayName || "Account";

  return {
    displayName: safeDisplayName,
    email,
    initials: getInitials(safeDisplayName),
  };
}
