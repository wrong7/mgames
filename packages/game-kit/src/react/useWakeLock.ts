import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida mientras el componente esté montado.
 *
 * Estos juegos se juegan hablando: el móvil se queda en la mano un minuto entero
 * sin que nadie lo toque mientras alguien piensa la pista. Sin esto la pantalla
 * se apaga justo cuando el equipo va a mirar el tablero.
 *
 * El bloqueo se pierde al cambiar de app o de pestaña, así que se vuelve a pedir
 * al regresar. Donde la API no existe (Safari antiguo, Firefox) no hace nada:
 * es una mejora, no un requisito.
 */
export function useWakeLock(enabled = true): void {
	useEffect(() => {
		if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

		let sentinel: WakeLockSentinel | null = null;
		let cancelled = false;

		const acquire = async () => {
			// Pedirlo con la pestaña oculta lanza; no es un fallo, sólo no toca aún.
			if (document.visibilityState !== "visible") return;
			try {
				sentinel = await navigator.wakeLock.request("screen");
				if (cancelled) {
					await sentinel.release();
					sentinel = null;
				}
			} catch {
				// El navegador lo ha denegado (batería baja, permisos). Se juega igual.
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void acquire();
		};

		void acquire();
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibilityChange);
			void sentinel?.release();
		};
	}, [enabled]);
}
