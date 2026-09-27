import { CODE_LENGTH, normalizeCode } from "@mgames/game-kit";
import { useState } from "react";

export interface CodeInputProps {
	value: string;
	onChange: (code: string) => void;
}

/**
 * El código de la sala, en una casilla por carácter.
 *
 * Las casillas dicen cuántos caracteres son sin tener que explicarlo, y son lo
 * que se ve; lo que se toca es un campo de texto normal, transparente y encima
 * de ellas, para que el teclado y pegar se porten como en cualquier otro campo.
 */
export function CodeInput({ value, onChange }: CodeInputProps) {
	const [focused, setFocused] = useState(false);

	return (
		<div className="relative flex min-w-0 flex-1 gap-1.5">
			{SLOTS.map((index) => {
				// La casilla que va a recibir el siguiente carácter; con el código
				// completo, la última, que es la que se va con la tecla de borrar.
				const current = focused && index === Math.min(value.length, CODE_LENGTH - 1);
				return (
					<span
						key={index}
						aria-hidden="true"
						className={[
							"flex h-16 min-w-0 flex-1 items-center justify-center rounded-2xl font-mono text-3xl font-black uppercase",
							value[index] ? "bg-white/20" : "bg-white/10",
							current ? "ring-2 ring-white/70" : "",
						].join(" ")}
					>
						{value[index] ?? ""}
					</span>
				);
			})}
			<input
				value={value}
				onChange={(event) => onChange(normalizeCode(editAtEnd(value, event.target.value)))}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				aria-label="Código de la sala"
				// En móvil el teclado por defecto abre en minúsculas y con autocorrector;
				// los tres atributos juntos evitan que "K7QM" llegue como "k7qm.".
				autoCapitalize="characters"
				autoCorrect="off"
				autoComplete="off"
				spellCheck={false}
				className="absolute inset-0 h-full w-full cursor-text text-base opacity-0"
			/>
		</div>
	);
}

/** Una casilla por carácter del código, en orden. */
const SLOTS = Array.from({ length: CODE_LENGTH }, (_, index) => index);

/**
 * El texto tras un cambio en el campo, como si el cursor estuviera siempre al
 * final: lo escrito o pegado va detrás y borrar quita lo último.
 *
 * El campo es invisible, así que no se ve dónde cae el cursor al tocarlo, y
 * escribir en medio de "K7" convertiría "K7QM" en "QMK7" sin que nadie lo
 * note. Se compara lo que había con lo que hay para saber qué ha pasado, sin
 * fiarse de dónde estaba el cursor. Sólo si se ha sustituido una selección se
 * respeta tal cual, porque entonces está claro lo que se quería.
 */
function editAtEnd(before: string, after: string): string {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let end = 0;
	while (
		end < before.length - start &&
		end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	) {
		end++;
	}
	const removed = before.length - start - end;
	const inserted = after.slice(start, after.length - end);
	if (removed > 0 && inserted) return after;
	if (inserted) return before + inserted;
	return before.slice(0, before.length - removed);
}
