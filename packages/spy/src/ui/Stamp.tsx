import type { ReactNode } from "react";
import { COLORS } from "../theme.ts";

/**
 * Un sello de tampón: letras y borde en rojo sobre papel, un poco torcido.
 *
 * Es el recurso gráfico del juego —la estética es la de un expediente—, así
 * que va aparte para que todos los sellos de la pantalla se parezcan.
 */
export function Stamp({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={`inline-block rounded-md border-2 px-2 py-0.5 font-black uppercase leading-none tracking-widest ${className}`}
			style={{ color: COLORS.stamp, borderColor: COLORS.stamp, backgroundColor: COLORS.paper }}
		>
			{children}
		</span>
	);
}
