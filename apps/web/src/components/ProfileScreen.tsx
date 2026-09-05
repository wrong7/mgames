import { MAX_NAME_LENGTH, normalizeName, type PlayerProfile } from "@mgames/game-kit";
import { Avatar, draftProfile, rerollAvatar } from "@mgames/game-kit/react";
import { useState } from "react";

export interface ProfileScreenProps {
	/** El perfil que hay, si lo hay: se edita en vez de empezar de cero. */
	initial: PlayerProfile | null;
	onSave: (profile: PlayerProfile) => void;
	/** Sólo cuando se viene a editar; al crear el perfil no hay a dónde volver. */
	onCancel?: () => void;
}

/**
 * Quién eres, una vez para todos los juegos.
 *
 * Nombre y cara. La cara sale de una semilla al azar y se puede volver a tirar
 * hasta que salga una que te guste; el nombre es lo que verán los demás en las
 * fichas y en las listas. Es la pantalla de "escribe tu nombre en el móvil"
 * de los juegos de sobremesa de consola, y como ahí, se pasa por ella una vez.
 */
export function ProfileScreen({ initial, onSave, onCancel }: ProfileScreenProps) {
	const [profile, setProfile] = useState<PlayerProfile>(() => initial ?? draftProfile());
	const ready = normalizeName(profile.name).length > 0;

	return (
		<form
			className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-neutral-950 px-6 text-white"
			style={{
				paddingTop: "max(1.5rem, env(safe-area-inset-top))",
				paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
			}}
			onSubmit={(event) => {
				event.preventDefault();
				if (ready) onSave(profile);
			}}
		>
			<div className="flex flex-col items-center gap-3">
				<Avatar seed={profile.avatar} name={profile.name} size={128} className="block" />
				<button
					type="button"
					onClick={() => setProfile(rerollAvatar(profile))}
					className="text-xs uppercase tracking-widest text-white/60 underline underline-offset-4 active:opacity-60"
				>
					Otra cara
				</button>
			</div>

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
					autoFocus={!initial}
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
		</form>
	);
}
