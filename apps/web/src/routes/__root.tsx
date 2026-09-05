import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				// `viewport-fit=cover` deja que el fondo llegue hasta debajo de la muesca;
				// `maximum-scale=1` evita que iOS haga zoom al enfocar el campo del código.
				content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
			},
			{ name: "theme-color", content: "#1a1a1a" },
			{ name: "mobile-web-app-capable", content: "yes" },
			{ title: "No mires · juegos para jugar en persona" },
			{
				name: "description",
				content:
					"Juegos de mesa para grupos, en el móvil de cada uno. Sin instalar nada: se entra con un código.",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="es">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				{import.meta.env.DEV && (
					<TanStackDevtools
						config={{ position: "bottom-right" }}
						plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
					/>
				)}
				<Scripts />
			</body>
		</html>
	);
}
