import type { Tenant, User } from "@prisma/client";

export type AuthUser = User & {
  roles: { role: { id: string; name: string } }[];
};

export type AppVariables = {
  user: AuthUser;
  tenant: Tenant;
};
