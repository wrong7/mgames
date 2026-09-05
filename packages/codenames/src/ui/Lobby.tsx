import { CODE_LENGTH, isCompleteCode, normalizeCode } from "@mgames/game-kit";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import type { Role } from "./GameScreen.tsx";

export interface LobbyProps {
	/** Código actual del campo. Lo controla la app para poder llevarlo en la URL. */
	code: string;
	onCodeChange: (code: string) => void;
	/** Genera un código nuevo. */
	onNewCode: () => void;
	onStart: (role: Role) => void;
	onExit?: () => void;
}

/**
 * Antesala del juego: el código de la sala y desde qué lado se va a jugar.
 *
 * Todo el grupo teclea el mismo código; quien dé las pistas entra como jefe y el
 * resto como agentes. No hay "crear" y "unirse" por separado a propósito —
 * entrar en una sala que no existe la crea, que es como funciona sentarse a una
 * mesa.
 */
export function Lobby({ code, onCodeChange, onNewCode, onStart, onExit }: LobbyProps) {
	const ready = isCompleteCode(code);

	return (
		<div
			className="flex h-dvh w-full flex-col justify-between gap-6 p-6"
			style={{
				backgroundColor: COLORS.masterBg,
				paddingTop: "max(1.5rem, env(safe-area-inset-top))",
				paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
			}}
		>
			<header className="flex items-start justify-between gap-4 pt-2">
				{onExit && (
					<button
						type="button"
						onClick={onExit}
						className="rounded-xl bg-black/80 px-3 py-2 text-white active:scale-95"
						aria-label="Volver al catálogo"
					>
						←
					</button>
				)}
				<div className="flex-1 text-right">
					<h1 className="text-3xl font-black uppercase leading-none tracking-tight text-black">
						{manifest.name}
					</h1>
					<p className="mt-1 text-sm text-black/60">{manifest.tagline}</p>
				</div>
			</header>

			<div className="flex flex-col items-center gap-3">
				<label htmlFor="codigo-sala" className="text-xs uppercase tracking-[0.3em] text-black/60">
					Código de la sala
				</label>
				<input
					id="codigo-sala"
					value={code}
					onChange={(event) => onCodeChange(normalizeCode(event.target.value))}
					maxLength={CODE_LENGTH}
					// En móvil el teclado por defecto abre en minúsculas y con autocorrector;
					// los tres atributos juntos evitan que "K7QM" llegue como "k7qm." .
					autoCapitalize="characters"
					autoCorrect="off"
					spellCheck={false}
					inputMode="text"
					placeholder="····"
					className="w-full rounded-2xl bg-white/90 py-5 text-center font-mono text-5xl font-black uppercase tracking-[0.35em] text-black shadow-inner outline-none focus:ring-4 focus:ring-black/30"
				/>
				<button
					type="button"
					onClick={onNewCode}
					className="text-xs uppercase tracking-widest text-black/60 underline underline-offset-4 active:opacity-60"
				>
					Generar uno nuevo
				</button>
			</div>

			<div className="flex flex-col gap-3 pb-2">
				<RoleButton
					color={COLORS.azul}
					title="Soy el jefe"
					subtitle="Veo los colores y doy las pistas"
					disabled={!ready}
					onClick={() => onStart("master")}
				/>
				<RoleButton
					color={COLORS.rojo}
					title="Soy agente"
					subtitle="Sólo veo las palabras"
					disabled={!ready}
					onClick={() => onStart("agente")}
				/>
			</div>
		</div>
	);
}

function RoleButton({
	color,
	title,
	subtitle,
	disabled,
	onClick,
}: {
	color: string;
	title: string;
	subtitle: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="rounded-2xl border-2 border-black/80 px-5 py-4 text-left text-white transition-opacity active:scale-[0.98] disabled:opacity-40"
			style={{ backgroundColor: color }}
		>
			<span className="block text-xl font-black uppercase tracking-tight">{title}</span>
			<span className="block text-sm opacity-90">{subtitle}</span>
		</button>
	);
}
