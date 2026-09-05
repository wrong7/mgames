/**
 * Las localizaciones y sus papeles.
 *
 * Criterios al elegirlas: que cualquiera pueda imaginarse dentro sin explicación
 * previa, y que los papeles den pie a preguntas ambiguas — "¿vienes mucho por
 * aquí?" tiene que poder responderse en casi todas. Por eso hay tantos sitios
 * cotidianos como exóticos: si todas fueran espectaculares, el espía las
 * distinguiría por el tono de las preguntas.
 *
 * La lista es pública: todo el mundo la ve durante la partida. Es lo que le da
 * al espía una posibilidad real de acertar, y a los demás una forma de descartar.
 */
export interface Location {
	name: string;
	roles: readonly string[];
}

export const LOCATIONS: readonly Location[] = [
	{
		name: "Playa",
		roles: [
			"Socorrista",
			"Vendedor de bebidas",
			"Surfista",
			"Turista quemado",
			"Niño con cubo",
			"Pareja en su luna de miel",
			"Ladrón de toallas",
		],
	},
	{
		name: "Hospital",
		roles: [
			"Cirujano",
			"Enfermera",
			"Paciente",
			"Celador",
			"Anestesista",
			"Familiar preocupado",
			"Estudiante de medicina",
		],
	},
	{
		name: "Avión en vuelo",
		roles: [
			"Piloto",
			"Auxiliar de vuelo",
			"Pasajero de primera",
			"Polizón",
			"Padre con un bebé",
			"Viajante nervioso",
			"Azafata de tierra que se coló",
		],
	},
	{
		name: "Estación espacial",
		roles: [
			"Comandante",
			"Ingeniera de a bordo",
			"Bióloga",
			"Técnico de soporte vital",
			"Turista espacial",
			"Médico de la tripulación",
			"Enlace con el control de tierra",
		],
	},
	{
		name: "Colegio",
		roles: [
			"Profesor",
			"Alumno repetidor",
			"Conserje",
			"Director",
			"Cocinera del comedor",
			"Madre en la puerta",
			"Delegado de clase",
		],
	},
	{
		name: "Casino",
		roles: [
			"Crupier",
			"Jugador arruinado",
			"Jefe de seguridad",
			"Contador de cartas",
			"Camarera",
			"Dueño",
			"Turista despistado",
		],
	},
	{
		name: "Submarino",
		roles: [
			"Capitán",
			"Sonarista",
			"Cocinero",
			"Maquinista",
			"Radiotelegrafista",
			"Oficial novato",
			"Médico de a bordo",
		],
	},
	{
		name: "Circo",
		roles: [
			"Domador",
			"Payaso",
			"Trapecista",
			"Taquillero",
			"Mago",
			"Contorsionista",
			"Mozo de pista",
		],
	},
	{
		name: "Restaurante",
		roles: [
			"Chef",
			"Camarero",
			"Crítico gastronómico",
			"Lavaplatos",
			"Cliente sin reserva",
			"Sumiller",
			"Pinche de cocina",
		],
	},
	{
		name: "Banco",
		roles: [
			"Director de la oficina",
			"Cajero",
			"Atracador",
			"Cliente pidiendo una hipoteca",
			"Guardia de seguridad",
			"Asesor financiero",
			"Transportista de fondos",
		],
	},
	{
		name: "Hotel",
		roles: [
			"Recepcionista",
			"Botones",
			"Camarera de piso",
			"Huésped que se queja",
			"Conserje",
			"Cocinero del desayuno",
			"Cliente sin reserva",
		],
	},
	{
		name: "Teatro",
		roles: [
			"Actor principal",
			"Apuntador",
			"Tramoyista",
			"Acomodador",
			"Director de escena",
			"Espectador dormido",
			"Taquillera",
		],
	},
	{
		name: "Comisaría",
		roles: [
			"Inspector",
			"Agente de guardia",
			"Detenido",
			"Abogado de oficio",
			"Perito forense",
			"Denunciante",
			"Recepcionista",
		],
	},
	{
		name: "Museo",
		roles: [
			"Guía",
			"Vigilante de sala",
			"Restauradora",
			"Ladrón de arte",
			"Turista con audioguía",
			"Conservador",
			"Escolar aburrido",
		],
	},
	{
		name: "Supermercado",
		roles: [
			"Cajera",
			"Reponedor",
			"Cliente con el carro lleno",
			"Carnicero",
			"Vigilante",
			"Encargado",
			"Señora de las muestras",
		],
	},
	{
		name: "Tren nocturno",
		roles: [
			"Revisor",
			"Maquinista",
			"Pasajero sin billete",
			"Vendedor del carrito",
			"Viajero que ronca",
			"Turista con mochila",
			"Jefe de tren",
		],
	},
	{
		name: "Barco pirata",
		roles: ["Capitán", "Grumete", "Vigía", "Cocinero", "Contramaestre", "Prisionero", "Artillero"],
	},
	{
		name: "Castillo medieval",
		roles: [
			"Rey",
			"Bufón",
			"Caballero",
			"Cocinera",
			"Herrero",
			"Dama de compañía",
			"Guardia de la muralla",
		],
	},
	{
		name: "Estadio de fútbol",
		roles: [
			"Portero",
			"Árbitro",
			"Ultra",
			"Entrenador",
			"Vendedor de bocadillos",
			"Comentarista",
			"Recogepelotas",
		],
	},
	{
		name: "Gimnasio",
		roles: [
			"Entrenador personal",
			"Socio novato",
			"Recepcionista",
			"Culturista",
			"Monitora de spinning",
			"Limpiador",
			"Fisioterapeuta",
		],
	},
	{
		name: "Camping",
		roles: [
			"Guarda",
			"Padre de familia numerosa",
			"Excursionista perdido",
			"Dueño del bar",
			"Adolescente con guitarra",
			"Vecino de parcela",
			"Socorrista de la piscina",
		],
	},
	{
		name: "Zoo",
		roles: [
			"Cuidador",
			"Veterinaria",
			"Niño con un globo",
			"Guía",
			"Taquillero",
			"Fotógrafo",
			"Vendedor de helados",
		],
	},
	{
		name: "Bar de tapas",
		roles: [
			"Camarero",
			"Cocinero",
			"Parroquiano de siempre",
			"Guiri perdido",
			"Dueño",
			"Repartidor de barriles",
			"Grupo de despedida",
		],
	},
	{
		name: "Aeropuerto",
		roles: [
			"Controlador aéreo",
			"Pasajero con el vuelo retrasado",
			"Agente de facturación",
			"Personal de seguridad",
			"Piloto en escala",
			"Guía del perro detector",
			"Taxista esperando",
		],
	},
];

/** Sólo los nombres: es lo que se enseña a todos durante la partida. */
export const LOCATION_NAMES: readonly string[] = LOCATIONS.map((location) => location.name);
