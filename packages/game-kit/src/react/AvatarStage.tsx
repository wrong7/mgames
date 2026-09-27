import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar.tsx";
import type { Stage, StageActor, StageVariant } from "./avatar/stage.ts";

export type { StageActor, StageVariant };

export interface AvatarStageProps {
	/** Quién sale, en orden: el primero va delante y en el centro. */
	actors: readonly StageActor[];
	/**
	 * `sala` pone a todos en formación con su nombre; `solo`, uno grande;
	 * `podio`, a cada uno en el escalón de su puesto (`place`), para el final de
	 * una partida.
	 */
	variant?: StageVariant;
	/** Lo que va con cada uno (su nombre): el escenario lo coloca bajo su peana. */
	renderLabel?: (actor: StageActor) => ReactNode;
	/** Alguien ha tocado un slime, que ya está haciendo su gesto. */
	onTap?: (id: string) => void;
	className?: string;
}

/**
 * Los slimes 3D de un grupo, cada uno en su peana y moviéndose.
 *
 * La escena (three.js) se carga aparte cuando hace falta, para que la portada
 * no la pague. Si el móvil no tiene WebGL se pinta una fila de retratos
 * planos: menos gracioso, pero se sabe quién está.
 */
export function AvatarStage({
	actors,
	variant = "sala",
	renderLabel,
	onTap,
	className,
}: AvatarStageProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stageRef = useRef<Stage | null>(null);
	const labels = useRef(new Map<string, HTMLElement>());
	// La escena se crea después de montar; así sabe a quién poner cuando llega.
	const actorsRef = useRef(actors);
	actorsRef.current = actors;
	const [flat, setFlat] = useState(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		let stage: Stage | null = null;
		let observer: ResizeObserver | undefined;
		let cancelled = false;

		import("./avatar/stage.ts")
			.then(({ createStage }) => {
				if (cancelled) return;
				stage = createStage(canvas, {
					variant,
					calm: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
					label: (id) => labels.current.get(id),
					onFail: () => {
						if (!cancelled) setFlat(true);
					},
				});
				if (!stage) {
					setFlat(true);
					return;
				}
				stageRef.current = stage;
				const resize = () => stage?.setSize(container.clientWidth, container.clientHeight);
				resize();
				observer = new ResizeObserver(resize);
				observer.observe(container);
				stage.setActors(actorsRef.current);
			})
			.catch(() => {
				if (!cancelled) setFlat(true);
			});

		return () => {
			cancelled = true;
			observer?.disconnect();
			stage?.dispose();
			stageRef.current = null;
		};
	}, [variant]);

	// Pasarle la misma gente otra vez no mueve a nadie: sólo se nota lo que cambia.
	useEffect(() => {
		stageRef.current?.setActors(actors);
	}, [actors]);

	if (flat) {
		return (
			<div className={className}>
				<ul className="flex h-full flex-wrap content-center items-end justify-center gap-4 p-4">
					{actors.map((actor) => (
						<li key={actor.id} className="flex flex-col items-center gap-1">
							<Avatar seed={actor.seed} size={variant === "solo" ? 160 : 64} className="block" />
							{renderLabel?.(actor)}
						</li>
					))}
				</ul>
			</div>
		);
	}

	return (
		<div className={className}>
			<div
				ref={containerRef}
				className="relative h-full w-full touch-manipulation"
				onPointerDown={(event) => {
					const rect = event.currentTarget.getBoundingClientRect();
					const id = stageRef.current?.tap(event.clientX - rect.left, event.clientY - rect.top);
					if (id) onTap?.(id);
				}}
			>
				{/* Un lienzo nuevo por escenario: el anterior suelta su contexto al irse y ya no vale. */}
				<canvas key={variant} ref={canvasRef} className="absolute inset-0 block h-full w-full" />
				{renderLabel && (
					<div className="pointer-events-none absolute inset-0 overflow-hidden">
						{actors.map((actor) => (
							<div
								key={actor.id}
								ref={(element) => {
									if (element) labels.current.set(actor.id, element);
									else labels.current.delete(actor.id);
								}}
								// Invisible hasta que el escenario la coloca en su sitio.
								className="absolute top-0 left-0 opacity-0 will-change-transform"
							>
								{renderLabel(actor)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
