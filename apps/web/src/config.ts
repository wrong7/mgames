/**
 * Origen del servidor de salas (el Worker con los Durable Objects).
 *
 * Sin este valor los juegos siguen siendo jugables, pero cada móvil lleva sus
 * propias marcas: por eso es opcional y no revienta el arranque si falta.
 */
export const REALTIME_URL: string | undefined = import.meta.env.VITE_REALTIME_URL || undefined;
