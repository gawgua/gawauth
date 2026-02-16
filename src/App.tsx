import "./App.css";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import AppSidebar from "./components/AppSidebar";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import MainHeader from "./components/MainHeader";
import SearchBar from "./components/SearchBar";
import TOTPList from "./components/TOTPList";
import { TOTPItem } from "./components/TOTPCard";

const TOTP_PERIOD = 30; // TOTP period in seconds

function App() {
	const [openMenuId, setOpenMenuId] = useState<number | null>(null);
	const [items, setItems] = useState<TOTPItem[]>([]);
	const [progress, setProgress] = useState(0);

	const refreshTokens = useCallback(async () => {
		try {
			const payload = await invoke<string>("get_all_tokens");
			const parsed = payload
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line, index) => {
					const data = JSON.parse(line) as {
						account_name: string;
						issuer: string;
						digits: number;
						otp: string;
					};

					return {
						id: index + 1,
						issuer: data.issuer,
						account: data.account_name,
						code: data.otp,
						period: TOTP_PERIOD,
						badge: "Token",
						badgeClass: "badge-work",
					};
				});
			if (parsed.length !== 0) {
				setItems(parsed);
			}
		} catch (error) {
			console.error("Failed to refresh tokens", error);
		}
	}, []);

	useEffect(() => {
		refreshTokens();

		let lastElapsed = -1;

		const interval = setInterval(() => {
			const now = Math.floor(Date.now() / 1000);
			const elapsed = now % TOTP_PERIOD;
			const newProgress = (elapsed / TOTP_PERIOD) * 100;
			setProgress(newProgress);

			// Detect period reset (elapsed went from high to 0)
			if (lastElapsed > elapsed) {
				refreshTokens();
			}
			lastElapsed = elapsed;
		}, 1000);

		return () => clearInterval(interval);
	}, [refreshTokens]);

	const handleDelete = (id: number) => {
		setOpenMenuId(null);
		refreshTokens();
	};

	return (
		<SidebarProvider defaultOpen={true} className="app-shell">
			<AppSidebar />
			<SidebarInset className="app-main">
				<div className="app-main-inner">
					<div className="app-toolbar">
						<SearchBar />
						<MainHeader onTokensChanged={refreshTokens} />
					</div>
					<TOTPList
						items={items}
						openMenuId={openMenuId}
						onMenuToggle={(id, open) => setOpenMenuId(open ? id : null)}
						onDelete={handleDelete}
						progress={progress}
					/>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default App;
