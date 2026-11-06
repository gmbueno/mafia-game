let database;
function db() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('mafia-table-v2', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('games'); request.result.createObjectStore('archive'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation(store, mode, run) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export const loadGame = () => operation('games', 'readonly', store => store.get('current'));
export async function saveGame(game) {
  await operation('games', 'readwrite', store => store.put(game, 'current'));
  if (game.winner) await operation('archive', 'readwrite', store => store.put(game, game.id));
}
export const clearGame = () => operation('games', 'readwrite', store => store.delete('current'));
export const listGames = () => operation('archive', 'readonly', store => store.getAll());
