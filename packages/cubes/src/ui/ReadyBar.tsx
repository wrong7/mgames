import type { ReactNode } from "react";
import { People, type Person, ToyButton } from "./parts.tsx";

export interface ReadyBarProps {
	meId: string;
	/** Los de la sala: a quién se espera. */
	people: readonly Person[];
	/** Quién ha dicho listo. */
	ready: readonly string[];
	/** Lo que dice el botón antes de pulsarlo: "Estoy listo", "Siguiente ronda"... */
	label: string;
	onReady: (ready: boolean) => void;
	/** Enseñar las caras. Donde ya hay una lista de gente al lado, sobra. */
	showFaces?: boolean;
	/** Una línea más bajo el botón, como cuánto falta para que siga sola. */
	footnote?: ReactNode;
}

/**
 * "Listo" para lo siguiente, con quién falta.
 *
 * Nada empieza hasta que lo dicen todos los de la sala, porque en este juego
 * lo que pasa dura un segundo: quien no está mirando se lo pierde. Por eso
 * se dice en voz alta a quién se espera, con nombre.
 */
export function ReadyBar({
	meId,
	people,
	ready,
	label,
	onReady,
	showFaces = true,
	footnote,
}: ReadyBarProps) {
	const mine = ready.includes(meId);
	const missing = people.filter((person) => !ready.includes(person.id));

	return (
		<div className="flex shrink-0 flex-col gap-3">
			{showFaces && <People people={people} marked={ready} meId={meId} size={30} />}
			<ToyButton
				tone={mine ? "chalk" : "gold"}
				onClick={() => onReady(!mine)}
				className="py-4 text-lg"
			>
				{mine ? "✓ Listo" : label}
			</ToyButton>
			<p className="min-h-4 text-center text-xs leading-tight opacity-85">
				{mine && missing.length > 0 ? `Esperando a ${listNames(missing, meId)}` : null}
				{mine && missing.length > 0 && footnote ? " · " : null}
				{footnote}
			</p>
		</div>
	);
}

/** "Ana", "Ana y Bea", "Ana, Bea y tú". */
export function listNames(people: readonly Person[], meId?: string): string {
	const names = people.map((person) => (person.id === meId ? "tú" : person.name));
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}
