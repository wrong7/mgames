import { CODE_LENGTH, isCompleteCode, normalizeCode, randomCode } from "@mgames/game-kit";
import { Avatar, useProfile } from "@mgames/game-kit/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GAMES } from "../games.ts";

export const Route = createFileRoute("/")({ component: Portada });

/**
 * La portada: crear una sala o entrar en una.
 *
 * Es la pantalla de los juegos de sobremesa de consola: un código grande y
 * nada más. Los juegos no se eligen aquí sino dentro de la sala, cuando ya está
 * todo el mundo; abajo sólo se enseñan para que se sepa qué hay.
 */
function Portada() {
	const { profile } = useProfile();
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const ready = isCompleteCode(code);

	const enter = (sala: string) => navigate({ to: "/sala/$sala", params: { sala } });

	return (
		<main
			className="flex h-dvh flex-col gap-8 overflow-y-auto bg-neutral-950 px-5 pb-10 text-white"
			style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}
		>
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-4xl font-black uppercase leading-none tracking-tight">No mires</h1>
					<p className="mt-2 max-w-xs text-sm text-white/60">
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
					className="rounded-2xl bg-white py-5 text-xl font-black uppercase tracking-widest text-black active:scale-[0.98]"
				>
					Crear sala
				</button>

				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready) enter(code);
					}}
				>
					<input
						value={code}
						onChange={(event) => setCode(normalizeCode(event.target.value))}
						maxLength={CODE_LENGTH}
						placeholder="CÓDIGO"
						aria-label="Código de la sala"
						// En móvil el teclado por defecto abre en minúsculas y con autocorrector;
						// los tres atributos juntos evitan que "K7QM" llegue como "k7qm.".
						autoCapitalize="characters"
						autoCorrect="off"
						spellCheck={false}
						className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-4 text-center font-mono text-2xl font-black uppercase tracking-[0.3em] text-white outline-none placeholder:text-white/30 placeholder:tracking-widest focus:ring-2 focus:ring-white/40"
					/>
					<button
						type="submit"
						disabled={!ready}
						className="rounded-2xl bg-white/15 px-5 text-sm font-bold uppercase tracking-widest active:scale-95 disabled:opacity-40"
					>
						Entrar
					</button>
				</form>
			</section>

			<section>
				<h2 className="mb-3 text-xs uppercase tracking-[0.3em] text-white/50">Lo que hay</h2>
				<ul className="flex flex-col gap-2">
					{GAMES.map(({ manifest }) => (
						<li
							key={manifest.slug}
							className="flex items-baseline justify-between gap-3 rounded-2xl border-2 border-black/20 px-4 py-3"
							style={{
								backgroundColor: manifest.theme.background,
								color: manifest.theme.foreground,
							}}
						>
							<span>
								<span className="block font-black uppercase tracking-tight">{manifest.name}</span>
								<span className="block text-sm opacity-80">{manifest.tagline}</span>
							</span>
							<span className="shrink-0 text-[0.65rem] uppercase tracking-widest opacity-60">
								{manifest.players.min}
								{manifest.players.max ? `–${manifest.players.max}` : "+"}
							</span>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
