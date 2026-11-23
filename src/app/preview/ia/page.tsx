"use client";

// TEMP preview, remove before merge
import {
	RiCheckLine,
	RiFileCopyLine,
	RiLockLine,
	RiSparklingLine,
} from "@remixicon/react";
import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Separator } from "@/shared/components/ui/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { AVAILABLE_MODELS, PROVIDERS } from "@/shared/lib/ai/models";

type Status = "none" | "pending" | "connected" | "expired";
type ProviderId =
	| "chatgpt"
	| "openai"
	| "anthropic"
	| "google"
	| "minimax"
	| "openrouter"
	| "ollama";
type Scenario = "empty" | "pending" | "all" | "expired";

const PROVIDER_LIST: {
	id: ProviderId;
	name: string;
	logo: string;
	mask?: string;
}[] = [
	{
		id: "chatgpt",
		name: "ChatGPT (assinatura)",
		logo: "/providers/chatgpt.svg",
	},
	{
		id: "openai",
		name: `${PROVIDERS.openai.name} (API)`,
		logo: "/providers/chatgpt.svg",
		mask: "sk-…a3F9",
	},
	{
		id: "anthropic",
		name: PROVIDERS.anthropic.name,
		logo: "/providers/claude.svg",
		mask: "sk-ant-…q8Lw",
	},
	{
		id: "google",
		name: PROVIDERS.google.name,
		logo: "/providers/gemini.svg",
		mask: "AIza…x2Kd",
	},
	{
		id: "minimax",
		name: PROVIDERS.minimax.name,
		logo: "/providers/minimax.svg",
		mask: "eyJh…9pQz",
	},
	{
		id: "openrouter",
		name: PROVIDERS.openrouter.name,
		logo: "/providers/openrouter_light.svg",
		mask: "sk-or-…m4Tn",
	},
	{
		id: "ollama",
		name: PROVIDERS.ollama.name,
		logo: "/providers/ollama_light.svg",
		mask: "http://localhost:11434/v1",
	},
];

const SCENARIOS: Record<Scenario, Record<ProviderId, Status>> = {
	empty: {
		chatgpt: "none",
		openai: "none",
		anthropic: "none",
		google: "none",
		minimax: "none",
		openrouter: "none",
		ollama: "none",
	},
	pending: {
		chatgpt: "pending",
		openai: "none",
		anthropic: "none",
		google: "none",
		minimax: "none",
		openrouter: "none",
		ollama: "none",
	},
	all: {
		chatgpt: "connected",
		openai: "connected",
		anthropic: "connected",
		google: "connected",
		minimax: "connected",
		openrouter: "connected",
		ollama: "connected",
	},
	expired: {
		chatgpt: "expired",
		openai: "connected",
		anthropic: "connected",
		google: "none",
		minimax: "none",
		openrouter: "none",
		ollama: "none",
	},
};

const SCENARIO_LABELS: Record<Scenario, string> = {
	empty: "Vazio",
	pending: "ChatGPT aguardando",
	all: "Tudo conectado",
	expired: "Sessão expirada",
};

function Segmented<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
}) {
	return (
		<div className="inline-flex rounded-lg bg-muted p-1">
			{options.map((o) => (
				<Button
					key={o.value}
					size="sm"
					variant={value === o.value ? "default" : "ghost"}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</Button>
			))}
		</div>
	);
}

function StatusBadge({ status }: { status: Status }) {
	if (status === "connected") return <Badge variant="success">Conectado</Badge>;
	if (status === "pending") return <Badge variant="info">Aguardando</Badge>;
	if (status === "expired")
		return <Badge variant="destructive">Sessão expirada</Badge>;
	return <Badge variant="outline">Não configurado</Badge>;
}

function Logo({ src, name }: { src: string; name: string }) {
	return (
		<img src={src} alt={name} className="size-6 shrink-0 object-contain" />
	);
}

function ChatGptFlow({ status }: { status: Status }) {
	const [copied, setCopied] = useState(false);
	if (status === "pending") {
		return (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					Abra o link abaixo, entre na sua conta e informe o código.
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<code className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-widest">
						K7QD-9FXM
					</code>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						}}
					>
						{copied ? <RiCheckLine /> : <RiFileCopyLine />}
						{copied ? "Copiado" : "Copiar"}
					</Button>
				</div>
				<a
					href="https://auth.openai.com/codex/device"
					target="_blank"
					rel="noreferrer"
					className="block text-sm text-primary underline-offset-4 hover:underline"
				>
					https://auth.openai.com/codex/device
				</a>
				<p className="animate-pulse text-sm text-muted-foreground">
					aguardando confirmação...
				</p>
				<Button variant="ghost" size="sm">
					Cancelar
				</Button>
			</div>
		);
	}
	if (status === "connected") {
		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="font-medium">daniel@•••••.com</span>
					<Badge variant="secondary">Plano Plus</Badge>
				</div>
				<Button variant="outline" size="sm">
					Desconectar
				</Button>
			</div>
		);
	}
	if (status === "expired") {
		return (
			<div className="space-y-3">
				<p className="text-sm text-destructive">Sessão expirada, reconecte.</p>
				<Button size="sm">Entrar com ChatGPT</Button>
			</div>
		);
	}
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				Use sua assinatura do ChatGPT, sem precisar de chave de API.
			</p>
			<Button size="sm">Entrar com ChatGPT</Button>
		</div>
	);
}

function KeyForm({
	id,
	status,
	compact,
}: {
	id: ProviderId;
	status: Status;
	compact?: boolean;
}) {
	const meta = PROVIDER_LIST.find((p) => p.id === id);
	const saved = status === "connected";
	const [editing, setEditing] = useState(false);
	const isOllama = id === "ollama";
	const showInputs = !saved || editing;

	return (
		<div className="space-y-3">
			{showInputs ? (
				<div className="space-y-3">
					{isOllama && (
						<div className="space-y-1.5">
							<Label htmlFor={"url-" + id}>URL base</Label>
							<Input
								id={"url-" + id}
								defaultValue="http://localhost:11434/v1"
							/>
						</div>
					)}
					<div className="space-y-1.5">
						{!compact && (
							<Label htmlFor={"key-" + id}>
								{isOllama ? "Chave (opcional)" : "Chave de API"}
							</Label>
						)}
						<div className="flex gap-2">
							<Input
								id={"key-" + id}
								type="password"
								placeholder={
									isOllama ? "Chave (opcional)" : "Cole a chave de API"
								}
							/>
							<Button onClick={() => setEditing(false)}>Salvar</Button>
							{editing && (
								<Button variant="ghost" onClick={() => setEditing(false)}>
									Cancelar
								</Button>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					<code className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">
						{meta?.mask}
					</code>
					<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
						Alterar
					</Button>
					<Button variant="ghost" size="sm" className="text-destructive">
						Remover
					</Button>
				</div>
			)}
		</div>
	);
}

function ProviderForm({ id, status }: { id: ProviderId; status: Status }) {
	return id === "chatgpt" ? (
		<ChatGptFlow status={status} />
	) : (
		<KeyForm id={id} status={status} />
	);
}

const NOTE = "As chaves ficam criptografadas e só são usadas por você.";

function Note() {
	return (
		<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
			<RiLockLine className="size-3.5" />
			{NOTE}
		</p>
	);
}

function TabHeader() {
	return (
		<div>
			<div className="mb-1 flex items-center gap-2">
				<h2 className="text-xl font-semibold">Inteligência artificial</h2>
				<span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
					<RiSparklingLine className="h-3 w-3" />
					IA
				</span>
			</div>
			<p className="text-sm text-muted-foreground">
				Conecte seus provedores de IA para usar o planejador e os insights.
			</p>
		</div>
	);
}

function OptionA({ s }: { s: Record<ProviderId, Status> }) {
	const [open, setOpen] = useState<ProviderId | null>(null);
	const current = PROVIDER_LIST.find((p) => p.id === open);
	return (
		<div className="space-y-4">
			<TabHeader />
			<Separator />
			<div className="divide-y rounded-lg border">
				{PROVIDER_LIST.map((p) => (
					<div key={p.id} className="flex items-center gap-3 px-4 py-3">
						<Logo src={p.logo} name={p.name} />
						<span className="min-w-0 flex-1 truncate text-sm font-medium">
							{p.name}
						</span>
						<StatusBadge status={s[p.id]} />
						<Button variant="outline" size="sm" onClick={() => setOpen(p.id)}>
							Configurar
						</Button>
					</div>
				))}
			</div>
			<Note />
			<Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{current?.name}</DialogTitle>
						<DialogDescription>{NOTE}</DialogDescription>
					</DialogHeader>
					{current && <ProviderForm id={current.id} status={s[current.id]} />}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function OptionB({ s }: { s: Record<ProviderId, Status> }) {
	const keys = PROVIDER_LIST.filter((p) => p.id !== "chatgpt");
	return (
		<div className="space-y-6">
			<TabHeader />
			<Separator />
			<section className="space-y-2">
				<h3 className="text-sm font-semibold">Assinatura</h3>
				<Card className="border-primary/40 bg-primary/5 p-5">
					<div className="mb-3 flex items-center gap-3">
						<Logo src="/providers/chatgpt.svg" name="ChatGPT" />
						<span className="flex-1 font-medium">ChatGPT (assinatura)</span>
						<StatusBadge status={s.chatgpt} />
					</div>
					<ChatGptFlow status={s.chatgpt} />
				</Card>
			</section>
			<section className="space-y-2">
				<h3 className="text-sm font-semibold">Chaves de API</h3>
				<div className="divide-y rounded-lg border">
					{keys.map((p) => (
						<div key={p.id} className="space-y-2 px-4 py-3">
							<div className="flex items-center gap-2">
								<Logo src={p.logo} name={p.name} />
								<span className="text-sm font-medium">{p.name}</span>
							</div>
							<KeyForm id={p.id} status={s[p.id]} compact />
						</div>
					))}
				</div>
			</section>
			<Note />
		</div>
	);
}

function OptionC({ s }: { s: Record<ProviderId, Status> }) {
	const [sel, setSel] = useState<ProviderId>("chatgpt");
	const current = PROVIDER_LIST.find((p) => p.id === sel) ?? PROVIDER_LIST[0];
	return (
		<div className="space-y-4">
			<TabHeader />
			<Separator />
			<div className="grid gap-4 md:grid-cols-[260px_1fr]">
				<div className="space-y-1 rounded-lg border p-1">
					{PROVIDER_LIST.map((p) => (
						<Button
							key={p.id}
							variant={sel === p.id ? "secondary" : "ghost"}
							className="h-auto w-full justify-start gap-3 px-3 py-2"
							onClick={() => setSel(p.id)}
						>
							<Logo src={p.logo} name={p.name} />
							<span className="min-w-0 flex-1 truncate text-left">
								{p.name}
							</span>
							<span
								className={
									"size-2 rounded-full " +
									(s[p.id] === "connected"
										? "bg-success"
										: s[p.id] === "none"
											? "bg-muted-foreground/30"
											: s[p.id] === "pending"
												? "bg-info"
												: "bg-destructive")
								}
							/>
						</Button>
					))}
				</div>
				<div className="space-y-4 rounded-lg border p-5">
					<div className="flex items-center gap-3">
						<Logo src={current.logo} name={current.name} />
						<h3 className="flex-1 font-semibold">{current.name}</h3>
						<StatusBadge status={s[current.id]} />
					</div>
					<Separator />
					<ProviderForm id={current.id} status={s[current.id]} />
					<Note />
				</div>
			</div>
		</div>
	);
}

function FilteredSelectors({ s }: { s: Record<ProviderId, Status> }) {
	const groups: { label: string; models: { id: string; name: string }[] }[] =
		[];
	if (s.chatgpt === "connected") {
		groups.push({
			label: "ChatGPT (assinatura)",
			models: [
				{ id: "sub:gpt-5.5", name: "GPT-5.5" },
				{ id: "sub:gpt-5.4", name: "GPT-5.4" },
			],
		});
	}
	for (const [pid, p] of Object.entries(PROVIDERS)) {
		if (s[pid as ProviderId] !== "connected") continue;
		groups.push({
			label: pid === "openai" ? "OpenAI (API)" : p.name,
			models: AVAILABLE_MODELS.filter((m) => m.provider === pid).map((m) => ({
				id: m.id,
				name: m.name,
			})),
		});
	}
	const first = groups[0]?.models[0]?.id;

	return (
		<Card className="space-y-3 p-6">
			<h2 className="text-xl font-semibold">Seletores filtrados</h2>
			<p className="text-sm text-muted-foreground">
				Modelo do planejador: só provedores conectados.
			</p>
			{groups.length === 0 ? (
				<div className="rounded-lg border border-dashed p-6 text-center text-sm">
					<p className="mb-1">Nenhum provedor de IA configurado.</p>
					<a
						href="/settings"
						className="text-primary underline-offset-4 hover:underline"
					>
						Configurar em Ajustes &gt; IA
					</a>
				</div>
			) : (
				<Select key={first} defaultValue={first}>
					<SelectTrigger className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{groups.map((g) => (
							<SelectGroup key={g.label}>
								<SelectLabel>{g.label}</SelectLabel>
								{g.models.map((m) => (
									<SelectItem key={m.id} value={m.id}>
										{m.name}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
			)}
		</Card>
	);
}

export default function Page() {
	const [option, setOption] = useState<"A" | "B" | "C">("A");
	const [scenario, setScenario] = useState<Scenario>("empty");
	const s = SCENARIOS[scenario];

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 p-6">
			<div className="flex flex-wrap items-center gap-4">
				<Segmented
					value={option}
					onChange={setOption}
					options={[
						{ value: "A", label: "Opção A" },
						{ value: "B", label: "Opção B" },
						{ value: "C", label: "Opção C" },
					]}
				/>
				<Segmented
					value={scenario}
					onChange={setScenario}
					options={(Object.keys(SCENARIO_LABELS) as Scenario[]).map((k) => ({
						value: k,
						label: SCENARIO_LABELS[k],
					}))}
				/>
			</div>

			<Tabs value="ia" className="w-full">
				<div className="overflow-x-auto">
					<TabsList className="inline-flex w-max flex-nowrap md:w-full">
						<TabsTrigger value="preferencias">Preferências</TabsTrigger>
						<TabsTrigger value="companion">Companion</TabsTrigger>
						<TabsTrigger value="ia">IA</TabsTrigger>
						<TabsTrigger value="nome">Alterar nome</TabsTrigger>
						<TabsTrigger value="senha">Alterar senha</TabsTrigger>
						<TabsTrigger value="passkeys">Passkeys</TabsTrigger>
						<TabsTrigger value="email">Alterar e-mail</TabsTrigger>
						<TabsTrigger value="deletar" className="text-destructive">
							Ações perigosas
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="ia" className="mt-4">
					<Card className="p-6">
						{option === "A" && <OptionA s={s} />}
						{option === "B" && <OptionB s={s} />}
						{option === "C" && <OptionC s={s} />}
					</Card>
				</TabsContent>
			</Tabs>

			<FilteredSelectors s={s} />
		</div>
	);
}
