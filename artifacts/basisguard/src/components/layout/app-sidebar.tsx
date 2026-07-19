import React from "react";
import { Link, useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { LayoutDashboard, List, CheckSquare, BookOpen, Users, Download, ShieldCheck } from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r border-border bg-sidebar h-full hidden md:flex">
      <SidebarHeader className="p-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
          <ShieldCheck className="h-6 w-6 text-foreground" />
          <span className="font-bold font-serif text-lg tracking-wide uppercase">BasisGuard</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}