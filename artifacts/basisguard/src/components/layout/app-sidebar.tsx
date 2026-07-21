import React from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, List, CheckSquare, BookOpen, Users, Download, ShieldCheck, Network, Inbox, LogOut, ArrowUpDown, Scissors, Layers } from "lucide-react";
import { useCurrentUser, ROLE_LABELS } from "@/hooks/use-current-user";

export function AppSidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: currentUser } = useCurrentUser();

  return (
    <Sidebar className="border-r border-border bg-sidebar h-full hidden md:flex flex-col">
      <SidebarHeader className="p-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
          <ShieldCheck className="h-6 w-6 text-foreground" />
          <span className="font-bold font-serif text-lg tracking-wide uppercase">BasisGuard</span>
        </Link>
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
                  <Link href="/dashboard" className="flex items-center gap-3 w-full px-4 py-2">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Command Center</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/positions")}>
                  <Link href="/positions" className="flex items-center gap-3 w-full px-4 py-2">
                    <List className="h-4 w-4" />
                    <span>Evidence Log</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/review-queue")}>
                  <Link href="/review-queue" className="flex items-center gap-3 w-full px-4 py-2">
                    <CheckSquare className="h-4 w-4" />
                    <span>Review Queue</span>
                  </Link>
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
                  <Link href="/citations" className="flex items-center gap-3 w-full px-4 py-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Citations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/profiles")}>
                  <Link href="/profiles" className="flex items-center gap-3 w-full px-4 py-2">
                    <Users className="h-4 w-4" />
                    <span>Profiles</span>
                  </Link>
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
                  <Link href="/chains" className="flex items-center gap-3 w-full px-4 py-2">
                    <Network className="h-4 w-4" />
                    <span>Chain Registry</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/submissions")}>
                  <Link href="/submissions" className="flex items-center gap-3 w-full px-4 py-2">
                    <Inbox className="h-4 w-4" />
                    <span>Onboarding</span>
                  </Link>
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
                  <Link href="/export" className="flex items-center gap-3 w-full px-4 py-2">
                    <Download className="h-4 w-4" />
                    <span>Audit Export</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/lots")}>
                  <Link href="/lots" className="flex items-center gap-3 w-full px-4 py-2">
                    <Layers className="h-4 w-4" />
                    <span>Lot Inventory</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/harvest")}>
                  <Link href="/harvest" className="flex items-center gap-3 w-full px-4 py-2">
                    <Scissors className="h-4 w-4" />
                    <span>Realized-Loss Review</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/transactions")}>
                  <Link href="/transactions" className="flex items-center gap-3 w-full px-4 py-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <span>Ingest</span>
                  </Link>
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
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            className="flex-shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
