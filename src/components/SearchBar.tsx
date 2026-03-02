import { Input } from "./ui/input";
import { Search } from "lucide-react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
	return (
		<div className="app-search-bar">
			<Search className="app-search-icon" />
			<Input
				type="text"
				placeholder="Search tokens..."
				className="app-search-input"
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}
