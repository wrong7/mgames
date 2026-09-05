import type { PlayerProfile } from "@mgames/game-kit";
import type { Board as BoardData, CardKind } from "../engine/index.ts";
import { Card } from "./Card.tsx";

export interface BoardProps {
	board: BoardData;
	revealed: readonly boolean[];
	/**
	 * Si es `true` se ve el color de las 25 cartas (pantalla del jefe de espías);
	 * si es `false`, sólo el de las que ya se han destapado.
	 */
	showAllKinds: boolean;
	/** Carta señalada por cada jugador. */
	votes?: Readonly<Record<string, number>>;
	/** La gente de la sala, para poner cara a cada ficha. */
	players?: readonly PlayerProfile[];
	/** Quién mira, para resaltar su propia ficha. */
	meId?: string;
	onCardPress?: (index: number) => void;
	disabled?: boolean;
}

/** La rejilla de 5x5. Ocupa todo el alto disponible y no hace scroll. */
export function Board({
	board,
	revealed,
	showAllKinds,
	votes = {},
	players = [],
	meId,
	onCardPress,
	disabled,
}: BoardProps) {
	// De "una carta por jugador" a "quiénes señalan cada carta", que es como se
	// pinta. La cara sale de la sala: si alguien se cambia de nombre, la ficha
	// se actualiza sola.
	const votesByCard = new Map<number, PlayerProfile[]>();
	for (const [playerId, index] of Object.entries(votes)) {
		const player = players.find((p) => p.id === playerId);
		if (player) votesByCard.set(index, [...(votesByCard.get(index) ?? []), player]);
	}
	const myIndex = meId ? votes[meId] : undefined;

	return (
		<div
			// El contenedor de consulta que usan las cartas para dimensionar su texto.
			className="grid min-h-0 flex-1 grid-cols-5 grid-rows-5 gap-1.5 [container-type:inline-size]"
		>
			{board.words.map((word, index) => {
				const isRevealed = revealed[index] === true;
				const kind: CardKind | null =
					showAllKinds || isRevealed ? (board.kinds[index] ?? null) : null;
				return (
					<Card
						// Las palabras de un tablero son únicas, así que sirven de clave estable
						// aunque cambie el reparto.
						key={word}
						word={word}
						kind={kind}
						revealed={isRevealed}
						votes={votesByCard.get(index)}
						mine={myIndex === index}
						disabled={disabled}
						onClick={onCardPress ? () => onCardPress(index) : undefined}
					/>
				);
			})}
		</div>
	);
}
