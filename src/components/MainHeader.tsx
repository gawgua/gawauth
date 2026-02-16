import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FileDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

interface MainHeaderProps {
	onTokensChanged: () => void;
}

export default function MainHeader({ onTokensChanged }: MainHeaderProps) {
	const [isNewTokenOpen, setIsNewTokenOpen] = useState(false);
	const [isImportTokenOpen, setIsImportTokenOpen] = useState(false);
	const [newTokenSecret, setNewTokenSecret] = useState("");
	const [newTokenIssuer, setNewTokenIssuer] = useState("");
	const [newTokenAccount, setNewTokenAccount] = useState("");
	const [newTokenImagePath, setNewTokenImagePath] = useState<string | null>(null);
	const [importTokenUri, setImportTokenUri] = useState("");
	const [importTokenImagePath, setImportTokenImagePath] = useState<string | null>(null);

	const resetNewTokenForm = () => {
		setNewTokenSecret("");
		setNewTokenIssuer("");
		setNewTokenAccount("");
		setNewTokenImagePath(null);
	};

	const resetImportTokenForm = () => {
		setImportTokenUri("");
		setImportTokenImagePath(null);
	};

	const openImagePicker = async (onSelected: (path: string | null) => void) => {
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{
					name: "Images",
					extensions: ["png", "jpg", "jpeg"],
				},
			],
		});

		if (typeof selected === "string") {
			onSelected(selected);
			return;
		}

		onSelected(null);
	};

	const getFileName = (path: string | null) => {
		if (!path) {
			return "No file selected";
		}
		const normalizedPath = path.replace(/\\/g, "/");
		return normalizedPath.split("/").pop() ?? path;
	};

	const handleNewTokenSubmit = () => {
		const trimmedSecret = newTokenSecret.trim();
		if (trimmedSecret) {
			void invoke("add_token_from_secret", { secret: trimmedSecret }).then(
				onTokensChanged
			);
		} else if (newTokenImagePath) {
			void invoke("add_token_from_qr", { imagePath: newTokenImagePath }).then(
				onTokensChanged
			);
		}
		resetNewTokenForm();
		setIsNewTokenOpen(false);
	};

	const handleImportTokenSubmit = () => {
		const trimmedUri = importTokenUri.trim();
		if (trimmedUri) {
			invoke("import_token_from_uri", { uri: trimmedUri }).then(
				onTokensChanged
			).catch((error) => {
				console.error("Failed to import token from URI", error);
			});
		} else if (importTokenImagePath) {
			invoke("import_token_from_qr", { imagePath: importTokenImagePath }).then(
				onTokensChanged
			);
		}
		resetImportTokenForm();
		setIsImportTokenOpen(false);
	};

	return (
		<div className="app-actions">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm" className="app-action app-action-primary">
						<Plus />
						Add token
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="app-menu-dropdown">
					<DropdownMenuItem
						className="app-menu-item"
						onSelect={() => setIsNewTokenOpen(true)}
					>
						<Plus />
						<div className="app-menu-item-content">
							<span className="app-menu-item-title">New token</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="app-menu-item"
						onSelect={() => setIsImportTokenOpen(true)}
					>
						<FileDown />
						<div className="app-menu-item-content">
							<span className="app-menu-item-title">Import existing token</span>
							<span className="app-menu-item-subtitle">
								Support Google Authentication
							</span>
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={isNewTokenOpen} onOpenChange={setIsNewTokenOpen}>
				<DialogContent className="app-dialog">
					<DialogHeader>
						<DialogTitle>Choose your method.</DialogTitle>
					</DialogHeader>
					<div className="app-dialog-grid">
						<div className="app-dialog-method">
							<div className="app-dialog-method-header">
								<span className="app-dialog-method-title">Upload QR image</span>
								<span className="app-dialog-method-subtitle">
									Upload a QR image to scan.
								</span>
							</div>
							<Button
								className="app-dialog-input"
								variant="outline"
								onClick={() => openImagePicker(setNewTokenImagePath)}
							>
								Select image
							</Button>
							<span className="app-dialog-file-name">
								{getFileName(newTokenImagePath)}
							</span>
						</div>
						<div className="app-dialog-method">
							<div className="app-dialog-method-header">
								<span className="app-dialog-method-title">Enter secret</span>
								<span className="app-dialog-method-subtitle">
									Paste the secret.
								</span>
							</div>
							<Input
								type="text"
								placeholder="Enter secret"
								className="app-dialog-input"
								value={newTokenSecret}
								onChange={(event) => setNewTokenSecret(event.target.value)}
							/>
							<Input
								type="text"
								placeholder="Issuer"
								className="app-dialog-input"
								value={newTokenIssuer}
								onChange={(event) => setNewTokenIssuer(event.target.value)}
							/>
							<Input
								type="text"
								placeholder="Account"
								className="app-dialog-input"
								value={newTokenAccount}
								onChange={(event) => setNewTokenAccount(event.target.value)}
							/>
						</div>
					</div>
					<div className="app-dialog-actions">
						<Button className="app-dialog-submit" onClick={handleNewTokenSubmit}>
							Submit
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={isImportTokenOpen} onOpenChange={setIsImportTokenOpen}>
				<DialogContent className="app-dialog">
					<DialogHeader>
						<DialogTitle>Choose your method.</DialogTitle>
					</DialogHeader>
					<div className="app-dialog-grid">
						<div className="app-dialog-method">
							<div className="app-dialog-method-header">
								<span className="app-dialog-method-title">Upload QR image</span>
								<span className="app-dialog-method-subtitle">
									Upload a QR image to scan.
								</span>
							</div>
							<Button
								className="app-dialog-input"
								variant="outline"
								onClick={() => openImagePicker(setImportTokenImagePath)}
							>
								Select image
							</Button>
							<span className="app-dialog-file-name">
								{getFileName(importTokenImagePath)}
							</span>
						</div>
						<div className="app-dialog-method">
							<div className="app-dialog-method-header">
								<span className="app-dialog-method-title">Enter Google Auth URI</span>
								<span className="app-dialog-method-subtitle">
									Paste an otpauth URI.
								</span>
							</div>
							<Input
								type="text"
								placeholder="otpauth-migration://offline..."
								className="app-dialog-input"
								value={importTokenUri}
								onChange={(event) => setImportTokenUri(event.target.value)}
							/>
						</div>
					</div>
					<div className="app-dialog-actions">
						<Button className="app-dialog-submit" onClick={handleImportTokenSubmit}>
							Submit
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
