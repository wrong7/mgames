/**
 * El fondo del escenario de los muñecos: noche morada con estrellas.
 *
 * Va en CSS y no dentro de la escena 3D para que sea nítido a cualquier
 * resolución y no cueste nada al renderizar: el lienzo de los muñecos es
 * transparente y se pone encima.
 *
 * Sin estrellas donde el cielo va detrás de párrafos: un punto blanco entre
 * dos palabras se lee como un punto y seguido.
 */
export function StageBackdrop({
	className = "",
	stars = true,
}: {
	className?: string;
	stars?: boolean;
}) {
	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
			style={{
				background: [
					"radial-gradient(110% 55% at 50% 100%, rgba(125, 95, 255, 0.55) 0%, rgba(80, 50, 200, 0) 65%)",
					"radial-gradient(70% 45% at 8% 12%, rgba(64, 200, 255, 0.2) 0%, rgba(64, 200, 255, 0) 70%)",
					"radial-gradient(60% 45% at 95% 25%, rgba(255, 95, 205, 0.18) 0%, rgba(255, 95, 205, 0) 70%)",
					"linear-gradient(180deg, #160f3d 0%, #28196b 55%, #1f1452 100%)",
				].join(", "),
			}}
		>
			{(stars ? STARS : []).map((star) => (
				<span
					key={star.key}
					className="absolute rounded-full bg-white motion-safe:animate-pulse"
					style={{
						left: `${star.x}%`,
						top: `${star.y}%`,
						width: star.size,
						height: star.size,
						opacity: star.opacity,
						animationDelay: `${star.delay}s`,
						animationDuration: `${star.duration}s`,
					}}
				/>
			))}
		</div>
	);
}

/**
 * Estrellas en sitios fijos: un generador con semilla en vez de `Math.random`
 * para que el servidor y el navegador pinten el mismo cielo.
 */
const STARS = (() => {
	let state = 7;
	const next = () => {
		state = (state * 16807) % 2147483647;
		return state / 2147483647;
	};
	return Array.from({ length: 34 }, (_, key) => ({
		key,
		x: next() * 100,
		y: next() * 70,
		size: next() < 0.2 ? 3 : next() < 0.5 ? 2 : 1.5,
		opacity: 0.35 + next() * 0.55,
		delay: next() * 4,
		duration: 2.5 + next() * 3,
	}));
})();
