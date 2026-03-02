import "./App.css";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import AppSidebar from "./components/AppSidebar";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainHeader from "./components/MainHeader";
import SearchBar from "./components/SearchBar";
import TOTPList from "./components/TOTPList";
import { TOTPItem } from "./components/TOTPCard";

const TOTP_PERIOD = 30; // TOTP period in seconds

function App() {
	const [openMenuId, setOpenMenuId] = useState<number | null>(null);
	const [items, setItems] = useState<TOTPItem[]>([]);
	const [progress, setProgress] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
	const [isToolbarPinned, setIsToolbarPinned] = useState(false);
	const mainScrollRef = useRef<HTMLDivElement | null>(null);

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

	const handleDelete = (_id: number) => {
		setOpenMenuId(null);
		refreshTokens();
	};

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
		}, 250);

		return () => clearTimeout(timeout);
	}, [searchQuery]);

	const filteredItems = useMemo(() => {
		if (!debouncedSearchQuery) {
			return items;
		}

		return items.filter((item) => {
			let issuer = item.issuer?.trim() ?? "";
			let account = item.account?.trim() ?? "";

			if (account.includes(":")) {
				const [accountIssuer, ...accountParts] = account.split(":");
				if (!issuer) {
					issuer = accountIssuer.trim();
				}
				account = accountParts.join(":").trim();
			}

			if (!issuer) {
				issuer = account;
			}

			const searchText = `${issuer} ${account}`.toLowerCase();
			return searchText.includes(debouncedSearchQuery);
		});
	}, [debouncedSearchQuery, items]);

	useEffect(() => {
		const element = mainScrollRef.current;
		if (!element) {
			return;
		}

		const syncPinnedState = () => {
			setIsToolbarPinned(element.scrollTop > 0);
		};

		syncPinnedState();
		element.addEventListener("scroll", syncPinnedState, { passive: true });

		return () => {
			element.removeEventListener("scroll", syncPinnedState);
		};
	}, []);

	return (
		<SidebarProvider defaultOpen={true} className="app-shell">
			<AppSidebar />
			<SidebarInset
				ref={mainScrollRef}
				className="h-svh overflow-y-auto px-3 sm:px-4 md:px-6"
			>
				<div className="mx-auto w-full max-w-6xl py-4 sm:py-6">
					<div
						className={`sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 rounded-xl border px-2 py-2 transition-all duration-0 ease-out ${
							isToolbarPinned
								? "border-border/70 bg-background/85 shadow-sm backdrop-blur"
								: "border-transparent bg-transparent shadow-none"
						}`}
					>
						<SearchBar value={searchQuery} onChange={setSearchQuery} />
						<MainHeader onTokensChanged={refreshTokens} />
					</div>
					<TOTPList
						items={filteredItems}
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
