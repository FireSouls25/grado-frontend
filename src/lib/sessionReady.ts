// Recarga cuando la sesión vuelve a estar lista.
//
// Las páginas cargan en onMount, pero el perfil (roles) lo resuelve el
// shell en paralelo: si la primera carga cae por sesión aún no lista,
// la página quedaba en error hasta recargar a mano. Con esto, cada
// página se re-suscribe y recarga sola al recuperarse la sesión o al
// cambiar los roles, sin recargas manuales.
import { profile } from '$lib/shell/profile';

export function onSessionReady(cb: () => void): () => void {
  let lastKey = '\0';
  return profile.subscribe((p) => {
    const key = `${p.state}:${(p.me?.roles ?? []).join(',')}`;
    if (key === lastKey) {
      lastKey = key;
      return;
    }
    const was = lastKey;
    lastKey = key;
    if (was === '\0') return; // primera lectura: el onMount ya cargó
    if (p.state === 'ready') cb();
  });
}
