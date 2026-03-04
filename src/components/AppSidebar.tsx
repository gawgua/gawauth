import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "./ui/sidebar";
import { Button } from "./ui/button";
import {
	Archive,
	Clock,
	HelpCircle,
	Settings,
	ShieldCheck,
	Star,
} from "lucide-react";

export type SidebarFilter = "all" | "favorites";

interface AppSidebarProps {
	activeFilter: SidebarFilter;
	onFilterChange: (filter: SidebarFilter) => void;
	totalCount: number;
	favoritesCount: number;
}

export default function AppSidebar({
	activeFilter,
	onFilterChange,
	totalCount,
	favoritesCount,
}: AppSidebarProps) {
	return (
		<Sidebar side="left" variant="sidebar" collapsible="none" className="app-sidebar">
			<SidebarHeader className="app-sidebar-header">
				<div className="app-brand">
					<div className="app-brand-mark">GA</div>
					<div>
						<p className="app-brand-title">GawAuth</p>
						<p className="app-brand-subtitle">Authenticator</p>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Library</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={activeFilter === "all"}
									onClick={() => onFilterChange("all")}
								>
									<ShieldCheck />
									<span>All tokens</span>
								</SidebarMenuButton>
								{totalCount > 0 && <SidebarMenuBadge>{totalCount}</SidebarMenuBadge>}
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={activeFilter === "favorites"}
									onClick={() => onFilterChange("favorites")}
								>
									<Star />
									<span>Favorites</span>
								</SidebarMenuButton>
								{favoritesCount > 0 && <SidebarMenuBadge>{favoritesCount}</SidebarMenuBadge>}
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarSeparator />
				<SidebarGroup>
					<SidebarGroupLabel>Spaces</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<span>Studio ops</span>
								</SidebarMenuButton>
								<SidebarMenuBadge>4</SidebarMenuBadge>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<span>Personal vault</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton>
									<span>Clients</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="app-sidebar-footer">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton>
							<Settings />
							<span>Settings</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton>
							<HelpCircle />
							<span>Help</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}