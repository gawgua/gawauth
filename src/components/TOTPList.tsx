import TOTPCard from "./TOTPCard";
import { TOTPItem } from "./TOTPCard";

interface TOTPListProps {
	items: TOTPItem[];
	openMenuId: number | null;
	onMenuToggle: (id: number, open: boolean) => void;
	onDelete: (id: number) => void;
	progress: number;
}

export default function TOTPList({
	items,
	openMenuId,
	onMenuToggle,
	onDelete,
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
					progress={progress}
				/>
			))}
		</section>
	);
}
