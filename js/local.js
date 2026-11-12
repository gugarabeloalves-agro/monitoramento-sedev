// Armazenamento no celular (IndexedDB): vistorias e fotos que ainda não foram enviadas.
window.Local = (function () {
  const NOME = "monitoramento-sedev", LOJA = "outbox";
  let dbp = null;
  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((ok, erro) => {
      const r = indexedDB.open(NOME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: "client_id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    return dbp;
  }
  async function tx(modo, fn) {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction(LOJA, modo);
      const res = fn(t.objectStore(LOJA));
      t.oncomplete = () => ok(res && res.result);
      t.onerror = () => erro(t.error);
      t.onabort = () => erro(t.error);
    });
  }
  return {
    todos: () => tx("readonly", (s) => s.getAll()),
    salvar: (item) => tx("readwrite", (s) => s.put(item)),
    apagar: (id) => tx("readwrite", (s) => s.delete(id))
  };
})();
