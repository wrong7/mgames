import { isCompleteCode, randomCode } from "@mgames/game-kit";
import { Avatar, useProfile } from "@mgames/game-kit/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CodeInput } from "../components/CodeInput.tsx";
import { StageBackdrop } from "../components/StageBackdrop.tsx";
import { gameFacts } from "../gameFacts.ts";
import { GAMES } from "../games.ts";

export const Route = createFileRoute("/")({ component: Portada });

/**
 * La portada: crear una sala o entrar en una.
 *
 * Es la pantalla de los juegos de sobremesa de consola: un código grande y
 * nada más. Los juegos no se eligen aquí sino dentro de la sala, cuando ya está
 * todo el mundo; abajo sólo se enseñan para que se sepa qué hay, y cada ficha
 * se despliega para contar de qué va.
 *
 * Lleva el mismo cielo que la sala y el perfil: es lo primero que se ve y
 * tiene que parecer el mismo sitio al que se va a entrar.
 */
function Portada() {
	const { profile } = useProfile();
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const ready = isCompleteCode(code);

	const enter = (sala: string) => navigate({ to: "/sala/$sala", params: { sala } });

	return (
		<div className="relative h-dvh overflow-hidden bg-neutral-950 text-white">
			<StageBackdrop stars={false} />
			<main
				className="relative flex h-full flex-col gap-8 overflow-y-auto px-5 pb-10"
				style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
			>
				<header className="flex items-start justify-between gap-4">
					<div>
						<ClosedEye className="mb-2 w-12 text-white/90" />
						<h1 className="text-4xl font-black uppercase leading-none tracking-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
							No mires
						</h1>
						<p className="mt-3 max-w-xs text-sm text-white/70">
							Juegos para jugar en persona, cada uno en su móvil: tu pantalla dice algo que la de al
							lado no.
						</p>
					</div>
					{profile && (
						<Link
							to="/perfil"
							className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 text-sm active:scale-95"
							aria-label="Cambiar nombre o cara"
						>
							<Avatar seed={profile.avatar} size={28} className="block" />
							{profile.name}
						</Link>
					)}
				</header>

				<section className="flex flex-col gap-3">
					<button
						type="button"
						onClick={() => enter(randomCode())}
						className="rounded-2xl bg-white py-5 text-xl font-black uppercase tracking-widest text-black shadow-lg active:scale-[0.98]"
					>
						Crear sala
					</button>

					<p className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.3em] text-white/50">
						<span className="h-px flex-1 bg-white/15" />o entra con un código
						<span className="h-px flex-1 bg-white/15" />
					</p>

					<form
						className="flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (ready) enter(code);
						}}
					>
						<CodeInput value={code} onChange={setCode} />
						<button
							type="submit"
							disabled={!ready}
							className={[
								"rounded-2xl px-5 text-sm font-bold uppercase tracking-widest active:scale-95 disabled:opacity-40",
								// Con el código completo, entrar pasa a ser lo siguiente que hay que hacer.
								ready ? "bg-white text-black" : "bg-white/15",
							].join(" ")}
						>
							Entrar
						</button>
					</form>
				</section>

				<section>
					<h2 className="mb-3 text-xs uppercase tracking-[0.3em] text-white/50">Lo que hay</h2>
					<ul className="flex flex-col gap-2">
						{GAMES.map(({ manifest }) => (
							<li key={manifest.slug}>
								<details
									className="group rounded-2xl border-2 border-black/20"
									style={{
										backgroundColor: manifest.theme.background,
										color: manifest.theme.foreground,
									}}
								>
									<summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
										<span>
											<span className="block font-black uppercase tracking-tight">
												{manifest.name}
											</span>
											<span className="block text-sm opacity-80">{manifest.tagline}</span>
											<span className="mt-1.5 block text-[0.65rem] uppercase tracking-widest opacity-60">
												{gameFacts(manifest)}
											</span>
										</span>
										<Chevron />
									</summary>
									<p className="px-4 pb-4 text-sm leading-snug opacity-90">
										{manifest.description}
									</p>
								</details>
							</li>
						))}
					</ul>
				</section>
			</main>
		</div>
	);
}

/** La marca: un ojo cerrado, que es justo lo que pide el nombre. */
function ClosedEye({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 48 24"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<path d="M4 6c5.5 7 12 10.5 20 10.5S38.5 13 44 6" strokeWidth="3.5" />
			<path
				d="M10.5 12.5 8 17.5M18.5 15.5l-1 5.5M29.5 15.5l1 5.5M37.5 12.5l2.5 5"
				strokeWidth="3"
			/>
		</svg>
	);
}

/** La flecha de la ficha, que se da la vuelta al desplegarla. */
function Chevron() {
	return (
		<svg
			viewBox="0 0 16 16"
			className="mt-1 size-4 shrink-0 opacity-60 transition-transform group-open:rotate-180"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m4 6 4 4 4-4" />
		</svg>
	);
}
