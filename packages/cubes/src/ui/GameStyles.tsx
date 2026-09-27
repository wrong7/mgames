import { PUFF_MS } from "./IsoBoard.tsx";

/**
 * Las animaciones del juego.
 *
 * Van aquí y no en el CSS de la web porque son del juego, como sus colores: la
 * web sólo aloja. React sube el `<style>` al `<head>` una sola vez, se pinte
 * donde se pinte, y lo quita cuando ya no queda nadie que lo use. Todo lleva el
 * prefijo `vynv-` para no pisar a nadie.
 */
export function GameStyles() {
	return (
		<style href="visto-y-no-visto" precedence="default">
			{CSS}
		</style>
	);
}

const CSS = `
@keyframes vynv-drop {
	0% { transform: translateY(-110px); opacity: 0; }
	35% { opacity: 1; }
	70% { transform: translateY(0); }
	85% { transform: translateY(-8px); }
	100% { transform: translateY(0); opacity: 1; }
}
@keyframes vynv-land {
	0% { transform: translateY(-28px); opacity: 0; }
	40% { opacity: 1; }
	100% { transform: translateY(0); opacity: 1; }
}
@keyframes vynv-fade-in { from { opacity: 0; } }
@keyframes vynv-puff {
	0% { transform: scale(0.3); opacity: 0.95; }
	100% { transform: scale(1.4); opacity: 0; }
}
@keyframes vynv-pop {
	0% { transform: scale(0.3); opacity: 0; }
	55% { transform: scale(1.12); opacity: 1; }
	100% { transform: scale(1); opacity: 1; }
}
@keyframes vynv-beat {
	0% { transform: scale(1.35); opacity: 0; }
	25% { transform: scale(1); opacity: 1; }
	80% { transform: scale(0.95); opacity: 1; }
	100% { transform: scale(0.8); opacity: 0; }
}
@keyframes vynv-bump {
	0% { transform: scale(1); }
	40% { transform: scale(1.12); }
	100% { transform: scale(1); }
}
@keyframes vynv-urge {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(1.06); }
}
@keyframes vynv-drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }

.vynv-cube { animation: vynv-drop 320ms cubic-bezier(0.3, 0.7, 0.4, 1) both; }
.vynv-shadow { animation: vynv-fade-in 300ms ease-out both; }
/* En la ronda se ven poco más de un segundo: tienen que estar quietos enseguida. */
.vynv-cube-quick { animation: vynv-land 140ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.vynv-shadow-quick { animation: vynv-fade-in 140ms ease-out both; }
.vynv-puff {
	transform-box: fill-box;
	transform-origin: center;
	animation: vynv-puff ${PUFF_MS}ms ease-out both;
}
.vynv-pop { animation: vynv-pop 380ms cubic-bezier(0.3, 0.7, 0.4, 1.4) both; }
.vynv-beat { animation: vynv-beat 800ms ease-out both; }
.vynv-bump { animation: vynv-bump 160ms ease-out; }
.vynv-urge { animation: vynv-urge 500ms ease-in-out infinite; }
.vynv-drain { transform-origin: left; animation-name: vynv-drain; animation-timing-function: linear; animation-fill-mode: both; }

@media (prefers-reduced-motion: reduce) {
	.vynv-cube, .vynv-shadow, .vynv-cube-quick, .vynv-shadow-quick, .vynv-pop, .vynv-bump { animation-duration: 1ms; }
	.vynv-beat, .vynv-urge { animation: none; }
	.vynv-puff { display: none; }
}
`;
