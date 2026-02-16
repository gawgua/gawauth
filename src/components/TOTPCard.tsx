import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { CATEGORY_ITEMS } from "../lib/constants";

export interface TOTPItem {
	id: number;
	issuer: string;
	account: string;
	code: string;
	period: number;
	badge: string;
	badgeClass: string;
}

interface TOTPCardProps {
	item: TOTPItem;
	isMenuOpen: boolean;
	onMenuToggle: (id: number, open: boolean) => void;
	onDelete: (id: number) => void;
	progress: number;
}

export default function TOTPCard({
	item,
	isMenuOpen,
	onMenuToggle,
	onDelete,
	progress,
}: TOTPCardProps) {

	return (
		<Card
			className={`totp-card border-0 bg-transparent p-0 shadow-none rounded-none${
				isMenuOpen ? " totp-card-active" : ""
			}`}
		>
			<div className="totp-row-identity">
				<div className="totp-issuer-row">
					<p className="totp-issuer">{item.issuer}</p>
					<Badge className={`totp-badge ${item.badgeClass}`} variant="outline">
						{item.badge}
					</Badge>
				</div>
				<p className="totp-account">{item.account}</p>
			</div>
			<div className="totp-row-status">
				<p className="totp-code">{item.code}</p>
				<div
					className="totp-timer-ring"
					style={{ "--progress": `${100 - progress}%` } as React.CSSProperties}
				>
					<span className="totp-timer-text">{item.period - Math.round(item.period * progress / 100)}s</span>
				</div>
			</div>
			<div className="totp-row-menu">
				<DropdownMenu
					open={isMenuOpen}
					onOpenChange={(open) => onMenuToggle(item.id, open)}
				>
					<DropdownMenuTrigger asChild>
						<Button
							className="totp-menu-trigger"
							variant="ghost"
							size="icon"
							title="Menu"
						>
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="totp-menu-dropdown">
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="totp-menu-item">
								Add to categories
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent
								className="totp-menu-dropdown totp-menu-subcontent"
								alignOffset={-4}
							>
								<div className="totp-menu-search">
									<Search className="totp-menu-search-icon" />
									<Input
										type="text"
										placeholder="Search categories"
										className="totp-menu-search-input"
									/>
								</div>
								<DropdownMenuItem className="totp-menu-item totp-menu-add-category">
									<span className="totp-menu-icon">
										<Plus />
									</span>
									<span className="totp-menu-text">Add category</span>
								</DropdownMenuItem>
								{CATEGORY_ITEMS.length > 0 && (
									<Separator className="totp-menu-separator" />
								)}
								{CATEGORY_ITEMS.map((category) => (
									<DropdownMenuItem
										key={category.id}
										className="totp-menu-item totp-menu-category-item"
									>
										<span className="totp-menu-icon">
											<span
												className="totp-menu-category-dot"
												style={{ backgroundColor: category.color }}
											/>
										</span>
										<span className="totp-menu-text">{category.name}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuItem
							className="totp-menu-item totp-menu-item-delete"
							variant="destructive"
							onSelect={() => onDelete(item.id)}
						>
							<Trash2 />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</Card>
	);
}
