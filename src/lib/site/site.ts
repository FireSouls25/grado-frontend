/**
 * Datos públicos del sitio: quién lo opera, para qué colegio y cómo
 * contactar. Viven aquí (no en i18n) porque cambian por despliegue, no por
 * idioma: cuando haya varios colegios, `school` saldrá de la configuración
 * del tenant. Lo vacío no se muestra.
 */
export interface SchoolInfo {
  name: string;
  web: string;
  email: string;
  phone: string;
}

const school: SchoolInfo = {
  name: 'Colegio Nuestra Señora de Guadalupe',
  /** Web, correo y teléfono oficiales del colegio (opcionales). */
  web: 'https://www.nuestrasenoradeguadalupe.edu.co/',
  email: 'iemguadalupe@hotmail.com',
  phone: ''
};

export const site = {
  product: 'Observador Estudiantil',
  brand: 'Fractal School',
  /** Correo único para soporte, privacidad (habeas data) y seguridad. */
  contactEmail: 'contacto@fractalschool.app',
  privacyPath: '/privacidad.html',
  team: ['David Castillo', 'Luna Mideros'],
  since: 2026,
  school
};
