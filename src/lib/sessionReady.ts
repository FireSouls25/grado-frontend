// Recarga cuando la sesión vuelve a estar lista.
//
// Las páginas cargan una vez al montar, pero el perfil (roles) lo resuelve
// el shell en paralelo: si la primera carga cae por sesión aún no lista,
// la página quedaba en error hasta recargar a mano. Con esto, cada página
// carga si ya hay sesión, y se re-suscribe para recargar sola al
// recuperarse la sesión o al cambiar los roles, sin recargas manuales.
import { get } from 'svelte/store';
import { profile } from '$lib/shell/profile';

export function loadWhenReady(cb: () => void): () => void {
  let lastKey = '\0';
  if (get(profile).state === 'ready') {
    lastKey = 'ready:' + ((get(profile).me?.roles ?? []).join(','));
    cb();
  }
  return profile.subscribe((p) => {
    const key = `${p.state}:${(p.me?.roles ?? []).join(',')}`;
    if (key === lastKey) {
      lastKey = key;
      return;
    }
    const was = lastKey;
    lastKey = key;
    if (was === '\0') return; // primera lectura: ya se cargó arriba si había sesión
    if (p.state === 'ready') cb();
  });
}
