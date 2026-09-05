/**
 * La parte del kit que necesita React y un navegador.
 *
 * Va en un subcamino aparte para que el núcleo (`@mgames/game-kit`) siga siendo
 * código puro: el servidor de salas lo importa desde un Worker, donde no existen
 * `document` ni `navigator`.
 */
export { Avatar, type AvatarProps } from "./Avatar.tsx";
export {
	draftProfile,
	type ProfileStore,
	readProfile,
	rerollAvatar,
	saveProfile,
	useProfile,
} from "./profile.ts";
export {
	type GameRoom,
	type RoomStatus,
	type UseGameRoomOptions,
	useGameRoom,
} from "./useGameRoom.ts";
export { useWakeLock } from "./useWakeLock.ts";
