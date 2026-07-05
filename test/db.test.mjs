// Unit test dei mapper utente <-> riga DB (puri). Non serve un database: verifichiamo che
// la conversione oggetto-utente ⇄ riga sia fedele e lossless (camelCase, campi opzionali, zona jsonb).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { userToRow, rowToUser } = (await import('../db.js')).default;

// Simula il ritorno di node-pg: la colonna jsonb torna già come OGGETTO, le timestamptz come Date.
function asPgRow(row) {
  return { ...row, zone: row.zone ? JSON.parse(row.zone) : null,
    created_at: row.created_at ? new Date(row.created_at) : null,
    referred_at: row.referred_at ? new Date(row.referred_at) : null };
}

test('userToRow → rowToUser: round-trip fedele di un utente completo', () => {
  const u = {
    id: 'mario@x.it', email: 'mario@x.it', provider: 'email', passHash: 'salt:hash',
    name: 'Mario', picture: 'assets/photos/users/ab.png', city: 'Scanno', phone: '333', lang: 'it', notif: true,
    zone: { id: 'ab', label: 'Abruzzo', region: 'Abruzzo', comuni: ['Scanno', 'Opi'] },
    seed: 'mario', referredBy: 'davide', referredAt: '2026-07-01T10:00:00.000Z', createdAt: '2026-07-01T09:00:00.000Z',
  };
  const back = rowToUser(asPgRow(userToRow(u)));
  assert.deepEqual(back, u);
});

test('rowToUser: passHash preservato (per il login), campi assenti restano assenti', () => {
  const u = { id: 'a@b.it', email: 'a@b.it', provider: 'email', passHash: 'salt:hash', createdAt: '2026-07-01T00:00:00.000Z' };
  const back = rowToUser(asPgRow(userToRow(u)));
  assert.equal(back.passHash, 'salt:hash');
  assert.equal('name' in back, false);   // mai impostato → assente
  assert.equal('zone' in back, false);
  assert.equal('notif' in back, false);  // false → omesso (come nell'app)
});

test('utente Google: name+picture presenti, niente passHash', () => {
  const u = { id: 'g@x.it', email: 'g@x.it', provider: 'google', name: 'Tizio', picture: 'https://lh3/x', seed: 'g', createdAt: '2026-07-04T00:00:00.000Z' };
  const back = rowToUser(asPgRow(userToRow(u)));
  assert.deepEqual(back, u);
  assert.equal('passHash' in back, false);
});
