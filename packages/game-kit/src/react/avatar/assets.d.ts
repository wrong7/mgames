// Ficheros que Vite sirve tal cual y de los que el código sólo necesita la URL:
// el kit de muñecos y el descompresor de Draco.
declare module "*?url" {
	const url: string;
	export default url;
}
