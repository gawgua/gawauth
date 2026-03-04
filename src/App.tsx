import "./App.css";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import AppSidebar, { SidebarFilter } from "./components/AppSidebar";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainHeader from "./components/MainHeader";
import SearchBar from "./components/SearchBar";
import TOTPList from "./components/TOTPList";
import { TOTPItem } from "./components/TOTPCard";

const TOTP_PERIOD = 30; // TOTP period in seconds

interface AppConfig {
	favourites: string[];
}

const DEFAULT_CONFIG: AppConfig = {
	favourites: [],
};

function App() {
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [items, setItems] = useState<TOTPItem[]>([]);
	const [, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
	const [progress, setProgress] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
	const [isToolbarPinned, setIsToolbarPinned] = useState(false);
	const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
	const mainScrollRef = useRef<HTMLDivElement | null>(null);
	const configRef = useRef<AppConfig>(DEFAULT_CONFIG);

	const updateConfig = useCallback(async (nextConfig: AppConfig) => {
		setConfig(nextConfig);
		configRef.current = nextConfig;

		try {
			const savedConfig = await invoke<string>("set_config", {
				config: JSON.stringify(nextConfig),
			});
			const parsed = JSON.parse(savedConfig) as AppConfig;
			setConfig(parsed);
			configRef.current = parsed;
		} catch (error) {
			console.error("Failed to sync config", error);
		}
	}, []);

	const refreshTokens = useCallback(async () => {
		try {
			const payload = await invoke<string>("get_all_tokens");
			const favouriteIds = new Set(configRef.current.favourites);
			const parsed = payload
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => {
					const data = JSON.parse(line) as {
						id: string;
						account_name: string;
						issuer: string;
						digits: number;
						otp: string;
					};

					return {
						id: data.id,
						issuer: data.issuer,
						account: data.account_name,
						code: data.otp,
						period: TOTP_PERIOD,
						badge: "Token",
						badgeClass: "badge-work",
						isFavorite: favouriteIds.has(data.id),
					};
				});
			setItems(parsed);
		} catch (error) {
			console.error("Failed to refresh tokens", error);
		}
	}, []);

	useEffect(() => {
		const initializeConfigAndTokens = async () => {
			try {
				const payload = await invoke<string>("get_config");
				if (payload.trim()) {
					const loadedConfig = JSON.parse(payload) as AppConfig;
					const normalizedConfig = {
						favourites: Array.isArray(loadedConfig.favourites)
							? loadedConfig.favourites
							: [],
					};
					setConfig(normalizedConfig);
					configRef.current = normalizedConfig;
				}
			} catch (error) {
				console.error("Failed to load config", error);
			}

			await refreshTokens();
		};

		initializeConfigAndTokens();

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

	const handleDelete = (_id: string) => {
		setOpenMenuId(null);
		refreshTokens();
	};

	const handleToggleFavorite = useCallback(
		(id: string) => {
			setItems((currentItems) =>
				currentItems.map((item) =>
					item.id === id
						? { ...item, isFavorite: !item.isFavorite }
						: item,
				),
			);

			const hasId = configRef.current.favourites.includes(id);
			const nextConfig: AppConfig = {
				favourites: hasId
					? configRef.current.favourites.filter((favouriteId) => favouriteId !== id)
					: [...configRef.current.favourites, id],
			};

			updateConfig(nextConfig);
		},
		[updateConfig],
	);

	useEffect(() => {
		const timeout = setTimeout(() => {
			setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
		}, 250);

		return () => clearTimeout(timeout);
	}, [searchQuery]);

	const filteredItems = useMemo(() => {
		const baseItems =
			sidebarFilter === "favorites"
				? items.filter((item) => item.isFavorite)
				: items;

		if (!debouncedSearchQuery) {
			return baseItems;
		}

		return baseItems.filter((item) => {
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
	}, [debouncedSearchQuery, items, sidebarFilter]);

	const favoritesCount = useMemo(
		() => items.filter((item) => item.isFavorite).length,
		[items],
	);

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
			<AppSidebar
				activeFilter={sidebarFilter}
				onFilterChange={setSidebarFilter}
				totalCount={items.length}
				favoritesCount={favoritesCount}
			/>
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
						onToggleFavorite={handleToggleFavorite}
						progress={progress}
					/>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default App;
