import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrive, departDue, leave, scheduleDeparture } from "./presence.ts";
import type { PlayerProfile } from "./profile.ts";
import { hostOf, type RoomState } from "./room.ts";

const person = (id: string, name = `Jugador ${id}`): PlayerProfile => ({
	id,
	name,
	avatar: `cara-${id}`,
});

const empty: RoomState = {
	players: [],
	arrivals: [],
	departures: {},
	game: null,
	gameState: null,
	updatedAt: 0,
};

/** Una sala con esa gente, llegada en ese orden, un segundo cada uno. */
const roomWith = (...ids: string[]): RoomState =>
	ids.reduce((room, id, i) => arrive(room, person(id), (i + 1) * 1000), empty);

const ids = (room: RoomState) => room.players.map((p) => p.id);

/** Nadie tiene la sala abierta. */
const nobody = new Set<string>();

describe("entrar en la sala", () => {
	it("conectarse es entrar, detrás de los que ya estaban", () => {
		const room = roomWith("ana", "bea", "carla");
		assert.deepEqual(ids(room), ["ana", "bea", "carla"]);
		assert.equal(hostOf(room.players), "ana");
		assert.equal(room.updatedAt, 3000);
	});

	it("volver a conectarse tal cual no cambia nada", () => {
		const room = roomWith("ana", "bea");
		assert.equal(arrive(room, person("bea"), 9000), room);
	});

	it("con otro nombre o cara se ve al momento, sin cambiar de sitio", () => {
		const room = arrive(roomWith("ana", "bea"), person("ana", "Anita"), 9000);
		assert.deepEqual(ids(room), ["ana", "bea"]);
		assert.equal(room.players[0]?.name, "Anita");
		assert.equal(room.updatedAt, 9000);
	});
});

describe("salir sin el botón", () => {
	it("quien deja la sala sale a su hora si no ha vuelto", () => {
		const leaving = scheduleDeparture(roomWith("ana", "bea"), "bea", 20_000);
		// Mientras tanto sigue dentro.
		assert.deepEqual(ids(leaving), ["ana", "bea"]);
		assert.equal(departDue(leaving, 19_999, nobody), leaving);

		const gone = departDue(leaving, 20_000, nobody);
		assert.deepEqual(ids(gone), ["ana"]);
		assert.deepEqual(gone.departures, {});
		assert.equal(gone.updatedAt, 20_000);
	});

	it("una recarga no se nota: volver antes de la hora anula la salida", () => {
		const leaving = scheduleDeparture(roomWith("ana", "bea"), "bea", 20_000);
		const back = arrive(leaving, person("bea"), 12_000);
		assert.deepEqual(back.departures, {});
		assert.deepEqual(ids(departDue(back, 60_000, nobody)), ["ana", "bea"]);
		// Nadie ha entrado ni salido: la sala no cuenta como cambiada.
		assert.equal(back.updatedAt, leaving.updatedAt);
	});

	it("quien vuelve más tarde recupera su sitio, y la sala si era el anfitrión", () => {
		const start = roomWith("ana", "bea", "carla");
		const gone = departDue(scheduleDeparture(start, "ana", 20_000), 20_000, nobody);
		assert.equal(hostOf(gone.players), "bea");

		const late = arrive(gone, person("dani"), 30_000);
		const back = arrive(late, person("ana"), 40_000);
		assert.deepEqual(ids(back), ["ana", "bea", "carla", "dani"]);
		assert.equal(hostOf(back.players), "ana");
	});

	it("a quien tiene la sala abierta en otro sitio no se le saca", () => {
		const leaving = scheduleDeparture(roomWith("ana", "bea"), "bea", 20_000);
		const kept = departDue(leaving, 30_000, new Set(["bea"]));
		assert.deepEqual(ids(kept), ["ana", "bea"]);
		assert.deepEqual(kept.departures, {});
	});

	it("manda la hora de salida más temprana", () => {
		// Se despide al cerrar la página (pronto) y luego se cierra la conexión (tarde).
		const leaving = scheduleDeparture(roomWith("ana"), "ana", 10_000);
		assert.equal(scheduleDeparture(leaving, "ana", 60_000), leaving);
		assert.equal(scheduleDeparture(leaving, "ana", 5000).departures.ana, 5000);
	});

	it("poner hora de salida no alarga la vida de la sala", () => {
		const room = roomWith("ana");
		assert.equal(scheduleDeparture(room, "ana", 99_000).updatedAt, room.updatedAt);
	});

	it("sólo se pone hora de salida a quien está dentro", () => {
		const room = roomWith("ana");
		assert.equal(scheduleDeparture(room, "bea", 20_000), room);
	});

	it("sale cada uno a su hora", () => {
		let room = scheduleDeparture(roomWith("ana", "bea", "carla"), "ana", 20_000);
		room = scheduleDeparture(room, "carla", 70_000);
		room = departDue(room, 30_000, nobody);
		assert.deepEqual(ids(room), ["bea", "carla"]);
		assert.deepEqual(room.departures, { carla: 70_000 });
	});

	it("salir no toca el juego que hay sobre la mesa", () => {
		const playing = { ...roomWith("ana", "bea"), game: "espia", gameState: { ronda: 3 } };
		const gone = departDue(scheduleDeparture(playing, "bea", 20_000), 20_000, nobody);
		assert.equal(gone.game, "espia");
		assert.equal(gone.gameState, playing.gameState);
	});
});

describe("salir con el botón", () => {
	it("se sale en el acto y del todo: si vuelve, llega el último", () => {
		const gone = leave(roomWith("ana", "bea", "carla"), "ana", 9000);
		assert.deepEqual(ids(gone), ["bea", "carla"]);
		assert.equal(gone.updatedAt, 9000);
		assert.deepEqual(ids(arrive(gone, person("ana"), 10_000)), ["bea", "carla", "ana"]);
	});

	it("se lleva por delante la hora de salida que tuviera", () => {
		const leaving = scheduleDeparture(roomWith("ana", "bea"), "bea", 20_000);
		assert.deepEqual(leave(leaving, "bea", 9000).departures, {});
	});

	it("quien no está no puede salir", () => {
		const room = roomWith("ana");
		assert.equal(leave(room, "bea", 9000), room);
	});
});
