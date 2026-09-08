import React from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { LayoutDashboard, List, CheckSquare, BookOpen, Users, Download, ShieldCheck, Network, Inbox, LogOut, ArrowUpDown, Scissors, Layers, Link2, Calculator, CreditCard, Landmark } from "lucide-react";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/use-current-user";
import { NotificationBell } from "@/components/notifications/notification-bell";

// Derived from Vite's BASE_URL — same logic as App.tsx.  Needed for signOut redirect.
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function NavLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </Link>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: currentUser } = useCurrentUser();

  return (
    <Sidebar className="border-r border-border bg-sidebar h-full flex-col">
      <SidebarHeader className="p-4 border-b border-border">
        <NavLink href="/dashboard" className="flex items-center gap-2 px-2 py-1">
          <ShieldCheck className="h-6 w-6 text-foreground" />
          <span className="font-bold font-serif text-lg tracking-wide uppercase">BasisGuard</span>
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="flex-1">
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider mb-2 px-4">
            Intelligence
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard" || location === "/"}>
                  <NavLink href="/dashboard" className="flex items-center gap-3 w-full px-4 py-2">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Command Center</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/positions")}>
                  <NavLink href="/positions" className="flex items-center gap-3 w-full px-4 py-2">
                    <List className="h-4 w-4" />
                    <span>Evidence Log</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/review-queue")}>
                  <NavLink href="/review-queue" className="flex items-center gap-3 w-full px-4 py-2">
                    <CheckSquare className="h-4 w-4" />
                    <span>Review Queue</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider mb-2 px-4">
            Library
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/citations")}>
                  <NavLink href="/citations" className="flex items-center gap-3 w-full px-4 py-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Citations</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/profiles")}>
                  <NavLink href="/profiles" className="flex items-center gap-3 w-full px-4 py-2">
                    <Users className="h-4 w-4" />
                    <span>Profiles</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider mb-2 px-4">
            Networks
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/chains")}>
                  <NavLink href="/chains" className="flex items-center gap-3 w-full px-4 py-2">
                    <Network className="h-4 w-4" />
                    <span>Chain Registry</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/submissions")}>
                  <NavLink href="/submissions" className="flex items-center gap-3 w-full px-4 py-2">
                    <Inbox className="h-4 w-4" />
                    <span>Onboarding</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider mb-2 px-4">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/export")}>
                  <NavLink href="/export" className="flex items-center gap-3 w-full px-4 py-2">
                    <Download className="h-4 w-4" />
                    <span>Audit Export</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/lots")}>
                  <NavLink href="/lots" className="flex items-center gap-3 w-full px-4 py-2">
                    <Layers className="h-4 w-4" />
                    <span>Lot Inventory</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/harvest")}>
                  <NavLink href="/harvest" className="flex items-center gap-3 w-full px-4 py-2">
                    <Scissors className="h-4 w-4" />
                    <span>Realized-Loss Review</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/transactions")}>
                  <NavLink href="/transactions" className="flex items-center gap-3 w-full px-4 py-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <span>Ingest</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/connections")}>
                  <NavLink href="/connections" className="flex items-center gap-3 w-full px-4 py-2">
                    <Link2 className="h-4 w-4" />
                    <span>Connections</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider mb-2 px-4">
            Settlement
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/billing")}>
                  <NavLink href="/billing" className="flex items-center gap-3 w-full px-4 py-2">
                    <CreditCard className="h-4 w-4" />
                    <span>Billing</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/tax-optimizer")}>
                  <NavLink href="/tax-optimizer" className="flex items-center gap-3 w-full px-4 py-2">
                    <Calculator className="h-4 w-4" />
                    <span>Simulator</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/desk") || location === "/treasury"}>
                  <NavLink href="/desk/treasury" className="flex items-center gap-3 w-full px-4 py-2">
                    <Landmark className="h-4 w-4" />
                    <span>Desk</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-foreground truncate">
              {user?.primaryEmailAddress?.emailAddress ?? "…"}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {currentUser ? ROLE_LABELS[currentUser.role] : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificationBell />
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
