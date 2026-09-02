"use client";

import { RiUploadCloud2Line } from "@remixicon/react";
import { useRef, useState } from "react";

interface ReconciliationUploadZoneProps {
	onFileRead: (content: string) => void;
}

export function ReconciliationUploadZone({
	onFileRead,
}: ReconciliationUploadZoneProps) {
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = (file: File) => {
		setError(null);
		if (!/\.csv$/i.test(file.name)) {
			setError("Formato não suportado. Use .csv.");
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			onFileRead(content);
		};
		reader.onerror = () => {
			setError("Não foi possível ler o arquivo.");
		};
		reader.readAsText(file, "utf-8");
	};

	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					const file = e.dataTransfer.files[0];
					if (file) handleFile(file);
				}}
				className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-24 transition-colors ${
					dragging
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/50 hover:bg-muted/50"
				}`}
			>
				<RiUploadCloud2Line className="text-muted-foreground size-14" />
				<div className="text-center">
					<p className="font-medium text-sm">
						Arraste um extrato ou fatura aqui ou clique para selecionar
					</p>
					<p className="mt-1 text-muted-foreground text-xs">.csv</p>
				</div>
			</button>

			<input
				ref={inputRef}
				type="file"
				accept=".csv"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleFile(file);
					e.target.value = "";
				}}
			/>

			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</div>
	);
}
