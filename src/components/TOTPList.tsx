import TOTPCard from "./TOTPCard";
import { TOTPItem } from "./TOTPCard";

interface TOTPListProps {
	items: TOTPItem[];
	openMenuId: string | null;
	onMenuToggle: (id: string, open: boolean) => void;
	onDelete: (id: string) => void;
	onToggleFavorite: (id: string) => void;
	progress: number;
}

export default function TOTPList({
	items,
	openMenuId,
	onMenuToggle,
	onDelete,
	onToggleFavorite,
	progress,
}: TOTPListProps) {
	return (
		<section className="totp-list" aria-label="TOTP codes">
			{items.map((item) => (
				<TOTPCard
					key={item.id}
					item={item}
					isMenuOpen={openMenuId === item.id}
					onMenuToggle={onMenuToggle}
					onDelete={onDelete}
					onToggleFavorite={onToggleFavorite}
					progress={progress}
				/>
			))}
		</section>
	);
}
