import type { Ref } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";

export function Composer({
	ref,
	value,
	onChange,
	onSubmit,
	onStop,
	busy,
	disabled = false,
}: {
	ref: Ref<HTMLTextAreaElement>;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onStop: () => void;
	busy: boolean;
	disabled?: boolean;
}) {
	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<Textarea
				ref={ref}
				rows={3}
				value={value}
				disabled={disabled}
				aria-label="Mensagem para o planejador"
				placeholder="Digite sua pergunta"
				onChange={(event) => onChange(event.target.value)}
			/>
			<div className="flex justify-end gap-2">
				{busy ? (
					<Button type="button" variant="outline" onClick={onStop}>
						Parar
					</Button>
				) : null}
				<Button type="submit" disabled={disabled || busy || value.trim().length === 0}>
					Enviar
				</Button>
			</div>
		</form>
	);
}
