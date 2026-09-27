import { useState } from "react";
import { COLORS } from "../theme.ts";

export interface LocationListProps {
	locations: readonly string[];
	/**
	 * Qué ronda es. Lo tachado vale para una ronda: con la siguiente, la lista
	 * vuelve a salir limpia.
	 */
	round: number;
}

/**
 * El catálogo de localizaciones, en una hoja que sube desde abajo.
 *
 * Es información pública y necesaria —el espía tiene que poder intentar
 * adivinar, y los demás descartar—, pero ocupa más que el resto de la pantalla
 * junta. Abierta dentro de la pantalla aplastaba la carta hasta cortarla en
 * los móviles bajos; por encima, la lista se ve entera y la carta no se toca.
 *
 * Cada sitio se tacha tocándolo: es la libreta de cada uno para ir descartando
 * mientras se oyen las respuestas. Es de quien la usa y no viaja a nadie.
 */
export function LocationList({ locations, round }: LocationListProps) {
	const [open, setOpen] = useState(false);
	const [crossed, toggle] = useCrossedOut(round);
	const left = locations.filter((location) => !crossed.has(location)).length;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-expanded={open}
				className="w-full shrink-0 rounded-xl py-2 text-xs uppercase tracking-[0.2em]"
				style={{ backgroundColor: COLORS.slate, color: COLORS.ink }}
			>
				{crossed.size > 0
					? `Sitios: te quedan ${left} de ${locations.length}`
					: `Ver los ${locations.length} sitios posibles`}
			</button>

			{open && (
				<div className="fixed inset-0 z-20 flex flex-col justify-end">
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label="Cerrar la lista de sitios"
						className="absolute inset-0 bg-black/55"
					/>
					<section
						aria-label="Sitios posibles"
						className="relative rounded-t-3xl px-3 pt-3 shadow-2xl"
						style={{
							backgroundColor: COLORS.slate,
							color: COLORS.ink,
							paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
						}}
					>
						<div className="mb-2.5 flex items-center justify-between gap-3 pl-1">
							<p className="text-[0.6rem] uppercase tracking-[0.2em] opacity-70">
								Toca para tachar los que descartes
							</p>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="shrink-0 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest active:scale-95"
								style={{ backgroundColor: COLORS.gold, color: COLORS.night }}
							>
								Cerrar
							</button>
						</div>
						<ul className="grid max-h-[70dvh] grid-cols-2 gap-1.5 overflow-y-auto text-sm">
							{locations.map((location) => {
								const off = crossed.has(location);
								return (
									<li key={location}>
										<button
											type="button"
											onClick={() => toggle(location)}
											aria-pressed={off}
											className={[
												"w-full rounded-lg px-2.5 py-2 text-left active:scale-[0.97]",
												off ? "line-through opacity-40" : "",
											].join(" ")}
											style={{ background: "#0003" }}
										>
											{location}
										</button>
									</li>
								);
							})}
						</ul>
					</section>
				</div>
			)}
		</>
	);
}

const STORAGE_KEY = "mgames:espia:tachados";

/**
 * Los sitios tachados en esta ronda.
 *
 * Se guardan en la pestaña porque el móvil a veces recarga la página al volver
 * de la pantalla bloqueada, y perder las notas a mitad de ronda es perder la
 * ronda. Sólo se guarda una: la de otra ronda no vale para nada.
 */
function useCrossedOut(round: number): [ReadonlySet<string>, (location: string) => void] {
	const [crossed, setCrossed] = useState<ReadonlySet<string>>(() => {
		try {
			const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
			return saved?.round === round ? new Set<string>(saved.crossed) : new Set<string>();
		} catch {
			return new Set<string>();
		}
	});

	const toggle = (location: string) => {
		const next = new Set(crossed);
		if (!next.delete(location)) next.add(location);
		setCrossed(next);
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ round, crossed: [...next] }));
		} catch {
			// Sin almacenamiento (modo privado): las notas valen mientras no se recargue.
		}
	};

	return [crossed, toggle];
}
