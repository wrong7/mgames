import { useEffect, useState } from "react";
import { ANSWER_WINDOW_MS, MAX_ANSWER, type RoundView } from "../engine/index.ts";
import { COLORS } from "../theme.ts";
import { buzz, useClock } from "./clock.ts";
import { Stopwatch, seconds, ToyButton } from "./parts.tsx";

export interface CounterProps {
	round: RoundView;
	now: () => number;
	onConfirm: (value: number) => void;
}

/**
 * Cuántos había: se suma y se resta tocando, y se confirma.
 *
 * Nada de teclado numérico: el juego es también de dedo rápido, y el primero
 * en acertar se lleva un punto más. El número va en grande en el centro, entre
 * los dos botones, que es donde se mira mientras se toca.
 *
 * Se monta con cada ronda (la pantalla le pone de `key` la ronda), así que el
 * número empieza siempre en cero.
 */
export function Counter({ round, now, onConfirm }: CounterProps) {
	const [value, setValue] = useState(0);
	// Lo confirmado en este móvil, mientras el servidor contesta. Luego manda `mine`.
	const [sent, setSent] = useState<number | null>(null);
	const confirmed = round.mine?.value ?? sent;
	const pressed = round.closesAt !== null && confirmed === null;

	const change = (delta: number) => {
		setValue((current) => Math.min(Math.max(current + delta, 0), MAX_ANSWER));
		buzz(8);
	};
	const confirm = () => {
		if (value === 0 || confirmed !== null) return;
		setSent(value);
		onConfirm(value);
	};

	// Con teclado también se juega: flechas o + y -, e Intro para confirmar.
	useEffect(() => {
		if (confirmed !== null) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "+") {
				event.preventDefault();
				setValue((current) => Math.min(current + 1, MAX_ANSWER));
			} else if (event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "-") {
				event.preventDefault();
				setValue((current) => Math.max(current - 1, 0));
			} else if (event.key === "Enter" && value > 0) {
				event.preventDefault();
				setSent(value);
				onConfirm(value);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [confirmed, value, onConfirm]);

	// Alguien ha contestado y tú no: que se note también en la mano.
	useEffect(() => {
		if (pressed) buzz([40, 60, 40]);
	}, [pressed]);

	return (
		<div className="flex flex-col gap-3">
			{/* El hueco de la cuenta atrás está siempre, para que al aparecer no mueva los botones que se están tocando. */}
			<div className="h-8">
				{round.closesAt !== null ? (
					<Hurry closesAt={round.closesAt} now={now} urgent={confirmed === null} />
				) : (
					confirmed === null && (
						<p className="text-center text-2xl leading-8 font-black uppercase tracking-tight">
							¿Cuántos había?
						</p>
					)
				)}
			</div>

			{confirmed === null ? (
				<>
					<div className="flex items-center justify-between gap-2">
						<PadButton label="Uno menos" onPress={() => change(-1)} disabled={value === 0}>
							−
						</PadButton>
						<output
							key={value}
							className="vynv-bump min-w-[2ch] text-center text-7xl leading-none font-black tabular-nums"
							aria-live="polite"
						>
							{value}
						</output>
						<PadButton label="Uno más" onPress={() => change(1)} disabled={value >= MAX_ANSWER}>
							+
						</PadButton>
					</div>
					<ToyButton onClick={confirm} disabled={value === 0} className="py-4 text-lg">
						Confirmar
					</ToyButton>
				</>
			) : (
				<Confirmed value={confirmed} ms={round.mine?.ms ?? null} />
			)}
		</div>
	);
}

function PadButton({
	label,
	onPress,
	disabled,
	children,
}: {
	label: string;
	onPress: () => void;
	disabled: boolean;
	children: string;
}) {
	return (
		<ToyButton
			tone="chalk"
			onClick={onPress}
			disabled={disabled}
			aria-label={label}
			className="grid size-[5.5rem] shrink-0 place-items-center text-6xl leading-none"
		>
			{children}
		</ToyButton>
	);
}

/**
 * Tu número, ya sin vuelta atrás, y lo que has tardado en marcarlo.
 *
 * El tiempo es el del servidor, que lo apunta al recibir el número: llega un
 * instante después de pulsar, pero es el mismo que sale en el resultado y el
 * que decide quién fue el primero. Uno medido aquí no cuadraría con ninguno de
 * los dos.
 */
function Confirmed({ value, ms }: { value: number; ms: number | null }) {
	return (
		<div className="flex items-center justify-center gap-5 py-2">
			<span
				className="vynv-pop grid h-[5.5rem] min-w-[5.5rem] place-items-center rounded-2xl px-4 text-6xl font-black tabular-nums shadow-[0_5px_0_#b98500]"
				style={{ backgroundColor: COLORS.gold, color: COLORS.ink }}
			>
				{value}
			</span>
			<span className="flex flex-col gap-1.5">
				<span className="text-sm font-bold uppercase tracking-widest opacity-90">✓ Confirmado</span>
				{/* El hueco está desde el principio, para que al llegar el tiempo no se mueva nada. */}
				<span className="flex h-10 items-center">
					{ms !== null && (
						<span className="vynv-pop flex items-center gap-2" style={{ color: COLORS.gold }}>
							<Stopwatch className="size-7 shrink-0" />
							<span className="text-4xl leading-none font-black tabular-nums">{seconds(ms)}</span>
						</span>
					)}
				</span>
			</span>
		</div>
	);
}

/**
 * La cuenta atrás desde que contesta el primero. La barra la anima el
 * navegador (así no tiembla aunque el móvil vaya justo); el número se repinta
 * cada décima.
 */
function Hurry({
	closesAt,
	now,
	urgent,
}: {
	closesAt: number;
	now: () => number;
	urgent: boolean;
}) {
	const time = useClock(now, [], 100);
	// Se calcula al aparecer y no en cada render: cambiarle el retraso a una
	// animación en marcha la hace saltar.
	const [delay] = useState(() => -(ANSWER_WINDOW_MS - (closesAt - now())));
	const seconds = Math.max(0, Math.ceil((closesAt - time) / 1000));
	const tone = urgent ? COLORS.gold : COLORS.chalk;

	return (
		<div className="flex h-full items-center gap-3">
			<span
				className={`w-7 text-center text-3xl leading-none font-black tabular-nums ${urgent ? "vynv-urge" : ""}`}
				style={{ color: tone }}
			>
				{seconds}
			</span>
			<div className="h-3 flex-1 overflow-hidden rounded-full bg-black/25">
				<div
					className="vynv-drain h-full rounded-full"
					style={{
						backgroundColor: tone,
						animationDuration: `${ANSWER_WINDOW_MS}ms`,
						animationDelay: `${delay}ms`,
					}}
				/>
			</div>
			<span className="w-24 text-right text-[0.65rem] leading-tight font-black uppercase tracking-wider">
				{urgent ? "¡Confirma ya!" : "Esperando a los demás"}
			</span>
		</div>
	);
}
