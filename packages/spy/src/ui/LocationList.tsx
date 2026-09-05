import { useState } from "react";
import { COLORS } from "../theme.ts";

export interface LocationListProps {
	locations: readonly string[];
}

/**
 * El catálogo de localizaciones, plegado por defecto.
 *
 * Es información pública y necesaria —el espía tiene que poder intentar
 * adivinar, y los demás descartar—, pero ocupa más que el resto de la pantalla
 * junta, así que se abre cuando hace falta.
 */
export function LocationList({ locations }: LocationListProps) {
	const [open, setOpen] = useState(false);

	return (
		<div className="shrink-0">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="w-full rounded-xl py-2 text-xs uppercase tracking-[0.2em]"
				style={{ backgroundColor: COLORS.slate, color: COLORS.ink }}
			>
				{open ? "Ocultar sitios" : `Ver los ${locations.length} sitios posibles`}
			</button>

			{open && (
				<ul
					className="mt-1.5 grid max-h-[38dvh] grid-cols-2 gap-1 overflow-y-auto rounded-xl p-2 text-sm"
					style={{ backgroundColor: COLORS.slate, color: COLORS.ink }}
				>
					{locations.map((location) => (
						<li key={location} className="rounded-lg px-2 py-1" style={{ background: "#0003" }}>
							{location}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
