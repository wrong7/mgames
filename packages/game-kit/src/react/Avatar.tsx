import { Blobatar } from "@blobatar/react";

export interface AvatarProps {
	/** Semilla del avatar: `profile.avatar`. La misma semilla, la misma cara. */
	seed: string;
	/** Lado en píxeles. */
	size: number;
	/** Nombre para lectores de pantalla. */
	name?: string;
	className?: string;
}

/**
 * La cara de un jugador.
 *
 * Es una figura generada a partir de una semilla, así que no hay imágenes que
 * subir ni guardar: la semilla viaja con el perfil y cada móvil dibuja la misma
 * cara. Se renderiza como `<img>` estático, que es lo que permite pintar
 * veinticinco en un tablero sin que pese.
 */
export function Avatar({ seed, size, name, className }: AvatarProps) {
	return (
		<Blobatar
			name={seed}
			size={size}
			background="circle"
			title={name}
			alt={name ?? ""}
			className={className}
			draggable={false}
		/>
	);
}
