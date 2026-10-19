// Búsqueda insensible a mayúsculas y tildes: dobla tanto el término como
// el texto ("José" casa con "jose"). La UI conserva el original con sus
// mayúsculas y tildes; solo la comparación usa la forma doblada.
export function foldSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
