import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";

export interface CurrentUser {
  id: string;
  clerk_id: string;
  email: string;
  display_name: string | null;
  role: "super_admin" | "reviewer" | "cpa_partner";
  credential: string | null;
  created_at: string;
}

export function useCurrentUser() {
  const { isSignedIn } = useAuth();

  return useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
  });
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  reviewer: "Reviewer",
  cpa_partner: "CPA Partner",
};
