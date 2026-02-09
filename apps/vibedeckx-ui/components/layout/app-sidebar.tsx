"use client";

import { Columns3, ListTodo } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export type ActiveView = "workspace" | "tasks";

interface AppSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent className="pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Workspace"
              isActive={activeView === "workspace"}
              onClick={() => onViewChange("workspace")}
            >
              <Columns3 className="h-4 w-4" />
              <span>Workspace</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Tasks"
              isActive={activeView === "tasks"}
              onClick={() => onViewChange("tasks")}
            >
              <ListTodo className="h-4 w-4" />
              <span>Tasks</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
