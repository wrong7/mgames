import { MAX_NAME_LENGTH, normalizeName, type PlayerProfile } from "@mgames/game-kit";
import {
	AvatarStage,
	type AvatarStyle,
	draftProfile,
	rerollAvatar,
	setAvatarStyle,
	useAvatarStyle,
} from "@mgames/game-kit/react";
import { useMemo, useState } from "react";
import { StageBackdrop } from "./StageBackdrop.tsx";

export interface ProfileScreenProps {
	/** El perfil que hay, si lo hay: se edita en vez de empezar de cero. */
	initial: PlayerProfile | null;
	onSave: (profile: PlayerProfile) => void;
	/** Sólo cuando se viene a editar; al crear el perfil no hay a dónde volver. */
	onCancel?: () => void;
}

/** Cuántas caras atrás se puede volver: suficientes para arrepentirse de pasar una. */
const MAX_HISTORY = 20;

/** Los estilos de personaje; el slime es de prueba y sólo cambia en este móvil. */
const STYLES: { value: AvatarStyle; label: string }[] = [
	{ value: "muñeco", label: "Muñeco" },
	{ value: "slime", label: "Slime" },
];

/**
 * Quién eres, una vez para todos los juegos.
 *
 * Nombre y muñeco. El muñeco sale de una semilla al azar y se puede volver a
 * tirar hasta que salga uno que te guste —y volver al de antes si te lo has
 * saltado—; el nombre es lo que verán los demás en las fichas y en las listas.
 * Es la pantalla de "escribe tu nombre en el móvil" de los juegos de sobremesa
 * de consola, y como ahí, se pasa por ella una vez.
 */
export function ProfileScreen({ initial, onSave, onCancel }: ProfileScreenProps) {
	const [profile, setProfile] = useState<PlayerProfile>(() => initial ?? draftProfile());
	const [previous, setPrevious] = useState<string[]>([]);
	const ready = normalizeName(profile.name).length > 0;
	const actors = useMemo(() => [{ id: "yo", seed: profile.avatar }], [profile.avatar]);
	const style = useAvatarStyle();

	const reroll = () => {
		setPrevious((seeds) => [...seeds, profile.avatar].slice(-MAX_HISTORY));
		setProfile(rerollAvatar(profile));
	};
	const undo = () => {
		const seed = previous.at(-1);
		if (!seed) return;
		setPrevious((seeds) => seeds.slice(0, -1));
		setProfile({ ...profile, avatar: seed });
	};

	return (
		<form
			className="flex h-dvh w-full flex-col bg-neutral-950 text-white"
			onSubmit={(event) => {
				event.preventDefault();
				if (ready) onSave(profile);
			}}
		>
			<div className="relative min-h-60 flex-1">
				<StageBackdrop />
				<AvatarStage variant="solo" actors={actors} className="absolute inset-0" />
				<fieldset
					className="absolute right-3 flex rounded-full bg-black/30 p-1 text-xs font-bold"
					style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
				>
					<legend className="sr-only">Estilo de personaje</legend>
					{STYLES.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setAvatarStyle(option.value)}
							aria-pressed={style === option.value}
							className={`rounded-full px-3 py-1.5 active:scale-95 ${
								style === option.value ? "bg-white text-black" : "text-white/70"
							}`}
						>
							{option.label}
						</button>
					))}
				</fieldset>
				<div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
					{previous.length > 0 && (
						<button
							type="button"
							onClick={undo}
							className="rounded-full bg-black/30 px-4 py-3 text-sm font-bold active:scale-95"
							aria-label="Volver a la cara de antes"
						>
							↶
						</button>
					)}
					<button
						type="button"
						onClick={reroll}
						className="rounded-full bg-white px-6 py-3 text-sm font-black uppercase tracking-widest text-black shadow-lg active:scale-95"
					>
						Otra cara
					</button>
				</div>
			</div>

			<div
				className="flex w-full flex-col gap-4 px-6 pt-5"
				style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
			>
				<div className="flex w-full flex-col items-center gap-2">
					<label htmlFor="nombre" className="text-xs uppercase tracking-[0.3em] text-white/60">
						¿Cómo te llamas?
					</label>
					<input
						id="nombre"
						value={profile.name}
						onChange={(event) => setProfile({ ...profile, name: event.target.value })}
						maxLength={MAX_NAME_LENGTH}
						autoCapitalize="words"
						autoComplete="nickname"
						className="w-full rounded-2xl bg-white px-4 py-4 text-center text-2xl font-bold text-black outline-none focus:ring-4 focus:ring-white/30"
					/>
				</div>

				<div className="flex w-full flex-col gap-2">
					<button
						type="submit"
						disabled={!ready}
						className="w-full rounded-2xl bg-white py-4 text-lg font-black uppercase tracking-widest text-black active:scale-[0.98] disabled:opacity-40"
					>
						{initial ? "Guardar" : "Vamos"}
					</button>
					{onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="w-full rounded-2xl py-3 text-sm uppercase tracking-widest text-white/60 active:opacity-60"
						>
							Cancelar
						</button>
					)}
				</div>
			</div>
		</form>
	);
}
