"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import {
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Hash,
  Plus,
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-16 flex-col items-center border-r border-sidebar-border bg-sidebar py-4",
        className
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-1">
        <div className="mb-2 h-[1px] w-8 bg-sidebar-border" />
        <SidebarIcon icon={Hash} label="General" active />
        <SidebarIcon icon={Hash} label="Random" />
        <SidebarIcon icon={Users} label="Team" />
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <SidebarIcon icon={Settings} label="Settings" />
        <SidebarIcon icon={LogOut} label="Logout" />
      </div>
    </aside>
  );
}

interface SidebarIconProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}

function SidebarIcon({ icon: Icon, label, active }: SidebarIconProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-10 w-10 rounded-xl text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      title={label}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}
