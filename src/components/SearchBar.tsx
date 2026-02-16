import { Input } from "./ui/input";
import { Search } from "lucide-react";

export default function SearchBar() {
	return (
		<div className="app-search-bar">
			<Search className="app-search-icon" />
			<Input type="text" placeholder="Search tokens..." className="app-search-input" />
		</div>
	);
}
