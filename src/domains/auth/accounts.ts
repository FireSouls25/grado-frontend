// DEV-ONLY account directory. There is no users/auth service yet, so the
// login screen resolves the seeded test accounts locally. This file is a
// stand-in: real authentication (POST /v1/login, hashed passwords,
// tokens) replaces it, and it must never ship test credentials outside
// development. Passwords here are plain placeholders for the same reason.
export interface DevAccount {
  id: string;
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export const devAccounts: DevAccount[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username: 'admin',
    email: 'admin@observador.edu.co',
    password: 'admin123*',
    displayName: 'Administración'
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    username: 'carlos.mendoza',
    email: 'carlos.mendoza@observador.edu.co',
    password: 'docente123*',
    displayName: 'Carlos Mendoza'
  }
];

/** Match by username or email (case-insensitive), or raw subject UUID. */
export function resolveDevAccount(identifier: string): DevAccount | null {
  const v = identifier.trim().toLowerCase();
  if (!v) return null;
  if (/^[0-9a-f-]{36}$/.test(v)) {
    return { id: identifier.trim(), username: v, email: v, password: '', displayName: '' };
  }
  return (
    devAccounts.find((a) => a.username === v || a.email.toLowerCase() === v) ??
    null
  );
}

/** Plain comparison, dev only. Real verification lives server-side later. */
export function checkDevPassword(account: DevAccount, password: string): boolean {
  if (!account.password) return true;
  return account.password === password;
}
