import { createFileRoute, Link } from "@tanstack/react-router";
import { GAMES, type GameEntry } from "../games.ts";

export const Route = createFileRoute("/")({ component: Catalogo });

/**
 * El catálogo: la portada de la web.
 *
 * Cada juego se anuncia con sus propios colores, tomados de su manifest, porque
 * la gracia de la colección es que cada uno se vea como lo que es. Lo único que
 * comparten es la forma de la tarjeta.
 */
function Catalogo() {
	return (
		<main className="h-dvh overflow-y-auto bg-neutral-950 px-5 pb-10 text-white">
			<header className="pt-12 pb-8">
				<h1 className="text-4xl font-black uppercase leading-none tracking-tight">mgames</h1>
				<p className="mt-2 max-w-xs text-sm text-white/60">
					Juegos para jugar en persona, cada uno en su móvil. Se entra con un código; no hay nada
					que instalar.
				</p>
			</header>

			<ul className="flex flex-col gap-3">
				{GAMES.map((entry) => (
					<li key={entry.manifest.slug}>
						<GameCard entry={entry} />
					</li>
				))}
			</ul>
		</main>
	);
}

function GameCard({ entry }: { entry: GameEntry }) {
	const game = entry.manifest;
	const content = (
		<>
			<div className="flex items-start justify-between gap-3">
				<h2 className="text-2xl font-black uppercase leading-none tracking-tight">{game.name}</h2>
				{game.status === "soon" && (
					<span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[0.6rem] uppercase tracking-widest opacity-70">
						Pronto
					</span>
				)}
			</div>
			<p className="mt-1 text-sm opacity-80">{game.tagline}</p>
			<p className="mt-4 text-[0.7rem] uppercase tracking-widest opacity-60">
				{formatPlayers(game)} · {game.minutes.min}–{game.minutes.max} min
			</p>
		</>
	);

	const className =
		"block rounded-2xl border-2 border-black/20 p-5 transition-transform active:scale-[0.98]";
	const style = { backgroundColor: game.theme.background, color: game.theme.foreground };

	if (game.status === "soon") {
		return (
			<div className={`${className} cursor-default opacity-60`} style={style}>
				{content}
			</div>
		);
	}

	return (
		<Link to={entry.to} className={className} style={style}>
			{content}
		</Link>
	);
}

function formatPlayers(game: GameEntry["manifest"]): string {
	if (game.players.max) return `${game.players.min}–${game.players.max} jugadores`;
	return `${game.players.min}+ jugadores`;
}
