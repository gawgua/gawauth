import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Camera, FileDown, Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	addTokenFromSecret,
	checkCameraAvailable,
	parseQrKeyPayload,
	readQrFromImage,
} from "../lib/qr";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";

interface MainHeaderProps {
	onTokensChanged: () => void;
}

type QrTarget = "new" | "import";

export default function MainHeader({ onTokensChanged }: MainHeaderProps) {
	const [isNewTokenOpen, setIsNewTokenOpen] = useState(false);
	const [isImportTokenOpen, setIsImportTokenOpen] = useState(false);
	const [newTokenSecret, setNewTokenSecret] = useState("");
	const [newTokenIssuer, setNewTokenIssuer] = useState("");
	const [newTokenAccount, setNewTokenAccount] = useState("");
	const [newTokenDigits, setNewTokenDigits] = useState<number | undefined>(undefined);
	const [newTokenImagePath, setNewTokenImagePath] = useState<string | null>(null);
	const [importTokenUri, setImportTokenUri] = useState("");
	const [importTokenImagePath, setImportTokenImagePath] = useState<string | null>(null);
	const [isCameraAvailable, setIsCameraAvailable] = useState(false);
	const [cameraTarget, setCameraTarget] = useState<QrTarget | null>(null);
	const [cameraFrame, setCameraFrame] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const unlistenRefs = useRef<UnlistenFn[]>([]);

	const cleanupCameraListeners = useCallback(() => {
		for (const unlisten of unlistenRefs.current) {
			unlisten();
		}
		unlistenRefs.current = [];
	}, []);

	const stopCamera = useCallback(async () => {
		cleanupCameraListeners();
		setCameraTarget(null);
		setCameraFrame(null);
		try {
			await invoke("stop_camera_scan");
		} catch {}
	}, [cleanupCameraListeners]);

	const refreshCameraAvailability = useCallback(async () => {
		const available = await checkCameraAvailable();
		setIsCameraAvailable(available);
	}, []);

	useEffect(() => {
		void refreshCameraAvailability();
		return () => {
			void stopCamera();
		};
	}, [refreshCameraAvailability, stopCamera]);

	const applyDecodedQr = useCallback((decodedText: string, target: QrTarget) => {
		const parsed = parseQrKeyPayload(decodedText);
		setErrorMessage(null);

		if (target === "new") {
			setNewTokenSecret(parsed.secret);
			if (parsed.issuer) {
				setNewTokenIssuer(parsed.issuer);
			}
			if (parsed.account) {
				setNewTokenAccount(parsed.account);
			}
			setNewTokenDigits(parsed.digits);
		} else {
			setImportTokenUri(parsed.rawText);
		}
	}, []);

	const resetNewTokenForm = () => {
		setNewTokenSecret("");
		setNewTokenIssuer("");
		setNewTokenAccount("");
		setNewTokenDigits(undefined);
		setNewTokenImagePath(null);
		setErrorMessage(null);
	};

	const resetImportTokenForm = () => {
		setImportTokenUri("");
		setImportTokenImagePath(null);
		setErrorMessage(null);
	};

	const getFileName = (path: string | null) => {
		if (!path) {
			return "";
		}
		const normalizedPath = path.replace(/\\/g, "/");
		return normalizedPath.split("/").pop() ?? path;
	};

	const handleUploadQr = async (target: QrTarget) => {
		setErrorMessage(null);
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{
					name: "Images",
					extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
				},
			],
		});

		if (typeof selected !== "string") {
			return;
		}

		if (target === "new") {
			setNewTokenImagePath(selected);
		} else {
			setImportTokenImagePath(selected);
		}

		try {
			const decodedText = await readQrFromImage(selected);
			applyDecodedQr(decodedText, target);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorMessage(message);
		}
	};

	const handleOpenCamera = async (target: QrTarget) => {
		if (!isCameraAvailable) {
			return;
		}
		setErrorMessage(null);
		await stopCamera();

		try {
			const unlistenFrame = await listen<string>("camera-frame", (event) => {
				setCameraFrame(event.payload);
			});
			const unlistenDetected = await listen<string>("camera-qr-detected", (event) => {
				try {
					applyDecodedQr(event.payload, target);
				} catch (err) {
					setErrorMessage(err instanceof Error ? err.message : String(err));
				}
				void stopCamera();
			});
			unlistenRefs.current = [unlistenFrame, unlistenDetected];
			setCameraTarget(target);
			await invoke("start_camera_scan");
		} catch (error) {
			await stopCamera();
			setIsCameraAvailable(false);
			const message = error instanceof Error ? error.message : String(error);
			setErrorMessage(message);
		}
	};

	const handleNewTokenSubmit = async () => {
		setErrorMessage(null);
		const trimmedSecret = newTokenSecret.trim();

		try {
			if (trimmedSecret) {
				await addTokenFromSecret({
					secret: trimmedSecret,
					issuer: newTokenIssuer.trim(),
					account: newTokenAccount.trim(),
					digits: newTokenDigits,
				});
				onTokensChanged();
			} else if (newTokenImagePath) {
				const decoded = await readQrFromImage(newTokenImagePath);
				const parsed = parseQrKeyPayload(decoded);
				await addTokenFromSecret({
					secret: parsed.secret,
					issuer: newTokenIssuer.trim() || parsed.issuer,
					account: newTokenAccount.trim() || parsed.account,
					digits: parsed.digits,
				});
				onTokensChanged();
			} else {
				setErrorMessage("Please enter a secret key or scan a QR code.");
				return;
			}

			await stopCamera();
			resetNewTokenForm();
			setIsNewTokenOpen(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorMessage(message);
		}
	};

	const handleImportTokenSubmit = async () => {
		setErrorMessage(null);
		const trimmedUri = importTokenUri.trim();

		try {
			if (trimmedUri) {
				await invoke("import_token_from_uri", { uri: trimmedUri });
				onTokensChanged();
			} else if (importTokenImagePath) {
				const decoded = await readQrFromImage(importTokenImagePath);
				await invoke("import_token_from_uri", { uri: decoded });
				onTokensChanged();
			} else {
				setErrorMessage("Please enter a URI or scan a QR code.");
				return;
			}

			await stopCamera();
			resetImportTokenForm();
			setIsImportTokenOpen(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorMessage(message);
		}
	};

	const handleNewDialogChange = (openState: boolean) => {
		if (!openState) {
			void stopCamera();
			resetNewTokenForm();
		} else {
			void refreshCameraAvailability();
		}
		setIsNewTokenOpen(openState);
	};

	const handleImportDialogChange = (openState: boolean) => {
		if (!openState) {
			void stopCamera();
			resetImportTokenForm();
		} else {
			void refreshCameraAvailability();
		}
		setIsImportTokenOpen(openState);
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
						onSelect={() => handleNewDialogChange(true)}
					>
						<Plus />
						<div className="app-menu-item-content">
							<span className="app-menu-item-title">New token</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="app-menu-item"
						onSelect={() => handleImportDialogChange(true)}
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
			<Dialog open={isNewTokenOpen} onOpenChange={handleNewDialogChange}>
				<DialogContent className="app-dialog">
					<DialogHeader>
						<DialogTitle>Add new token</DialogTitle>
					</DialogHeader>
					<div className="app-dialog-method">
						<div className="app-dialog-method-header">
							<span className="app-dialog-method-title">Enter secret</span>
							<span className="app-dialog-method-subtitle">
								Type or paste the secret key, scan with camera, or upload a QR screenshot.
							</span>
						</div>
						<div className="app-key-input-row">
							<Input
								type="text"
								placeholder="Enter secret"
								className="app-dialog-input app-key-textbox"
								value={newTokenSecret}
								onChange={(event) => {
									setNewTokenSecret(event.target.value);
									setNewTokenDigits(undefined);
									setErrorMessage(null);
								}}
							/>
							<Button
								type="button"
								variant="outline"
								className={`app-dialog-input app-qr-button${
									!isCameraAvailable ? " app-qr-button-disabled" : ""
								}`}
								disabled={!isCameraAvailable}
								title={
									isCameraAvailable
										? "Open camera to scan QR code"
										: "Camera not available"
								}
								onClick={() => void handleOpenCamera("new")}
							>
								<Camera />
								Open
							</Button>
							<Button
								type="button"
								variant="outline"
								className="app-dialog-input app-qr-button"
								title="Upload QR image"
								onClick={() => void handleUploadQr("new")}
							>
								<Upload />
								Upload
							</Button>
						</div>
						{newTokenImagePath && (
							<span className="app-dialog-file-name">
								{getFileName(newTokenImagePath)}
							</span>
						)}
						{cameraTarget === "new" && (
							<div className="app-camera-preview">
								<div className="app-camera-preview-header">
									<span>Scanning QR code from camera...</span>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										onClick={() => void stopCamera()}
									>
										<X />
									</Button>
								</div>
								{cameraFrame ? (
									<img
										src={`data:image/png;base64,${cameraFrame}`}
										alt="Camera preview"
										className="app-camera-frame"
									/>
								) : (
									<div className="app-camera-placeholder">
										Waiting for camera stream...
									</div>
								)}
							</div>
						)}
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
						{errorMessage && (
							<p className="app-dialog-error" role="alert">
								{errorMessage}
							</p>
						)}
					</div>
					<div className="app-dialog-actions">
						<Button className="app-dialog-submit" onClick={() => void handleNewTokenSubmit()}>
							Submit
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={isImportTokenOpen} onOpenChange={handleImportDialogChange}>
				<DialogContent className="app-dialog">
					<DialogHeader>
						<DialogTitle>Import existing token</DialogTitle>
					</DialogHeader>
					<div className="app-dialog-method">
						<div className="app-dialog-method-header">
							<span className="app-dialog-method-title">Enter Google Auth URI</span>
							<span className="app-dialog-method-subtitle">
								Paste an otpauth URI, scan with camera, or upload a QR screenshot.
							</span>
						</div>
						<div className="app-key-input-row">
							<Input
								type="text"
								placeholder="otpauth-migration://offline..."
								className="app-dialog-input app-key-textbox"
								value={importTokenUri}
								onChange={(event) => {
									setImportTokenUri(event.target.value);
									setErrorMessage(null);
								}}
							/>
							<Button
								type="button"
								variant="outline"
								className={`app-dialog-input app-qr-button${
									!isCameraAvailable ? " app-qr-button-disabled" : ""
								}`}
								disabled={!isCameraAvailable}
								title={
									isCameraAvailable
										? "Open camera to scan QR code"
										: "Camera not available"
								}
								onClick={() => void handleOpenCamera("import")}
							>
								<Camera />
								Open
							</Button>
							<Button
								type="button"
								variant="outline"
								className="app-dialog-input app-qr-button"
								title="Upload QR image"
								onClick={() => void handleUploadQr("import")}
							>
								<Upload />
								Upload
							</Button>
						</div>
						{importTokenImagePath && (
							<span className="app-dialog-file-name">
								{getFileName(importTokenImagePath)}
							</span>
						)}
						{cameraTarget === "import" && (
							<div className="app-camera-preview">
								<div className="app-camera-preview-header">
									<span>Scanning QR code from camera...</span>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										onClick={() => void stopCamera()}
									>
										<X />
									</Button>
								</div>
								{cameraFrame ? (
									<img
										src={`data:image/png;base64,${cameraFrame}`}
										alt="Camera preview"
										className="app-camera-frame"
									/>
								) : (
									<div className="app-camera-placeholder">
										Waiting for camera stream...
									</div>
								)}
							</div>
						)}
						{errorMessage && (
							<p className="app-dialog-error" role="alert">
								{errorMessage}
							</p>
						)}
					</div>
					<div className="app-dialog-actions">
						<Button
							className="app-dialog-submit"
							onClick={() => void handleImportTokenSubmit()}
						>
							Submit
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
