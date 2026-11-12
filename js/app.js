// App de Monitoramento · Sede V — telas, login, vistorias, fotos e envio (offline primeiro).
(function () {
  "use strict";
  const C = window.APP_CONFIG, O = window.APP_OPCOES, M = window.APP_MAPA;
  const SAFRA = window.APP_SAFRA || "Soja 26/27";
  const app = document.getElementById("app");

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hoje = () => iso(new Date());
  const parseD = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (s) => { if (!s) return "—"; const d = parseD(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  const fmtAno = (s) => { if (!s) return "—"; const d = parseD(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  const segunda = (s) => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const rotuloSemana = (seg) => { const a = parseD(seg), b = parseD(seg); b.setDate(b.getDate() + 6); return pad(a.getDate()) + "/" + pad(a.getMonth() + 1) + " a " + pad(b.getDate()) + "/" + pad(b.getMonth() + 1); };
  const dias = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
  const online = () => navigator.onLine !== false;

  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "mon-auth" }
  });

  // ---------- estado ----------
  const cache = LS.get("mon.cache", null);
  const S = {
    user: null,
    pivos: cache ? cache.pivos : Object.fromEntries((window.APP_PIVOS || []).map((p) => [p.pivo, Object.assign({ safra: SAFRA }, p)])),
    vistorias: cache ? cache.vistorias : [],
    fotos: cache ? cache.fotos : [],
    perfis: cache ? cache.perfis : {},
    cacheEm: cache ? cache.em : null,
    outbox: [],
    palhadaPend: LS.get("mon.palhadaPend", {}),
    syncing: false,
    syncErro: "",
    drafts: {},
    view: LS.get("mon.view", "mapa"),
    urls: LS.get("mon.urls", {})
  };

  // ---------- avisos ----------
  let toastT = null;
  function toast(msg, tipo) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.className = "toast mostrar " + (tipo || "");
    t.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("mostrar"), 3500);
  }

  // ---------- dados ----------
  function nomeAutor(id) {
    if (S.user && id === S.user.id) return S.user.nome;
    return (S.perfis[id] && S.perfis[id].nome) || "Alguém";
  }
  function palhadaDe(p) { return S.palhadaPend[p] || (S.pivos[p] && S.pivos[p].palhada) || null; }
  function pivosSoja() {
    const ord = M.ordemPlantio.filter((p) => S.pivos[p]);
    Object.keys(S.pivos).forEach((p) => { if (!ord.includes(p)) ord.push(p); });
    return ord;
  }
  function vistoriasDe(p) {
    const srv = S.vistorias.filter((v) => v.pivo === p).map((v) => Object.assign({}, v, {
      _fotos: S.fotos.filter((f) => f.vistoria_id === v.id)
    }));
    const enviadas = new Set(srv.map((v) => v.client_id));
    const pend = S.outbox.filter((it) => it.vistoria.pivo === p && !enviadas.has(it.client_id)).map((it) => Object.assign({}, it.vistoria, {
      id: it.client_id, client_id: it.client_id, autor: it.autor, criado_em: it.criado_em, _pendente: true, _erro: it.erro,
      _fotos: it.fotos.map((f) => ({ client_id: f.client_id, observacao: f.observacao, item: f.item, _url: f._url }))
    }));
    return pend.concat(srv).sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em));
  }
  const ultima = (p) => vistoriasDe(p)[0] || null;

  async function carregarOutbox() {
    S.outbox.forEach((it) => it.fotos.forEach((f) => f._url && URL.revokeObjectURL(f._url)));
    let itens = [];
    try { itens = await Local.todos(); } catch (e) { console.error(e); }
    itens.forEach((it) => it.fotos.forEach((f) => { f._url = URL.createObjectURL(f.blob); }));
    S.outbox = itens.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  }

  async function atualizar() {
    if (!online() || !S.user) return;
    try {
      const [pv, vi, fo, pe] = await Promise.all([
        sb.from("pivos").select("*"),
        sb.from("vistorias").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }),
        sb.from("fotos").select("*").order("criado_em"),
        sb.from("perfis").select("id,usuario,nome")
      ]);
      const erro = pv.error || vi.error || fo.error || pe.error;
      if (erro) throw erro;
      if (!pv.data.length) return; // sem acesso (sessão vencida): mantém o que tem
      S.pivos = Object.fromEntries(pv.data.map((r) => [r.pivo, r]));
      S.vistorias = vi.data;
      S.fotos = fo.data;
      S.perfis = Object.fromEntries(pe.data.map((r) => [r.id, r]));
      S.cacheEm = new Date().toISOString();
      LS.set("mon.cache", { pivos: S.pivos, vistorias: S.vistorias, fotos: S.fotos, perfis: S.perfis, em: S.cacheEm });
      if (!/\/nova$/.test(location.hash)) rota();
    } catch (e) {
      console.error("atualizar", e);
    }
  }

  // ---------- envio (sincronização) ----------
  async function enviarItem(it, uid) {
    const v = Object.assign({}, it.vistoria, { client_id: it.client_id, autor: uid, atualizado_em: new Date().toISOString() });
    const r = await sb.from("vistorias").upsert(v, { onConflict: "client_id" }).select("id").single();
    if (r.error) throw r.error;
    const vid = r.data.id;
    for (const f of it.fotos) {
      if (f.enviada) continue;
      const caminho = uid + "/" + vid + "/" + f.client_id + ".jpg";
      const up = await sb.storage.from("fotos").upload(caminho, f.blob, { contentType: "image/jpeg", upsert: false });
      if (up.error && !/exist|duplicate/i.test(up.error.message || "") && String(up.error.statusCode) !== "409") throw up.error;
      const rf = await sb.from("fotos").upsert({
        client_id: f.client_id, vistoria_id: vid, caminho, observacao: f.observacao || null, item: f.item || null,
        lat: f.lat == null ? null : f.lat, lng: f.lng == null ? null : f.lng, autor: uid
      }, { onConflict: "client_id" });
      if (rf.error) throw rf.error;
      f.enviada = true;
      const copia = Object.assign({}, it, { fotos: it.fotos.map((x) => { const y = Object.assign({}, x); delete y._url; return y; }) });
      delete copia.erro;
      await Local.salvar(copia);
    }
  }

  async function sincronizar(manual) {
    if (S.syncing) return;
    if (!online()) { if (manual) toast("Sem sinal. Os lançamentos ficam guardados no celular."); return; }
    const { data } = await sb.auth.getSession();
    const sess = data && data.session;
    const pendentes = S.outbox.length + Object.keys(S.palhadaPend).length;
    if (!sess) { if (pendentes) { S.syncErro = "Entre de novo para enviar"; badge(); } return; }
    const uid = sess.user.id;
    S.syncing = true; S.syncErro = ""; badge();
    let enviados = 0;
    try {
      for (const [p, val] of Object.entries(S.palhadaPend)) {
        const r = await sb.from("pivos").update({ palhada: val, palhada_por: uid, palhada_em: new Date().toISOString() }).eq("pivo", p);
        if (r.error) throw r.error;
        delete S.palhadaPend[p]; LS.set("mon.palhadaPend", S.palhadaPend);
        if (S.pivos[p]) S.pivos[p].palhada = val;
      }
      for (const it of S.outbox.slice()) {
        if (it.autor !== uid) { S.syncErro = "Há lançamentos de outro usuário neste celular"; continue; }
        try {
          await enviarItem(it, uid);
          await Local.apagar(it.client_id);
          enviados++;
        } catch (e) {
          console.error("envio", e);
          it.erro = (e && e.message) || String(e);
          const copia = Object.assign({}, it, { fotos: it.fotos.map((x) => { const y = Object.assign({}, x); delete y._url; return y; }) });
          await Local.salvar(copia);
          S.syncErro = "Falha ao enviar: " + it.erro;
          break;
        }
      }
    } catch (e) {
      console.error(e);
      S.syncErro = "Falha ao enviar: " + ((e && e.message) || e);
    }
    S.syncing = false;
    await carregarOutbox();
    if (enviados) toast("✓ " + enviados + (enviados > 1 ? " vistorias enviadas" : " vistoria enviada"), "ok");
    else if (manual && !S.syncErro) toast("✓ Tudo em dia");
    if (S.syncErro && manual) toast(S.syncErro, "erro");
    await atualizar();
    badge();
  }

  function textoBadge() {
    const n = S.outbox.length + Object.keys(S.palhadaPend).length;
    if (S.syncing) return { t: "⏳ Enviando…", c: "env" };
    if (!online()) return { t: n ? "📴 " + n + " no celular" : "📴 Sem sinal", c: "off" };
    if (S.syncErro) return { t: "⚠️ " + (n || "") + " p/ enviar", c: "erro" };
    if (n) return { t: "⏳ " + n + " p/ enviar", c: "pend" };
    return { t: "✓ Em dia", c: "ok" };
  }
  function badge() {
    const b = $("#badge"); if (!b) return;
    const x = textoBadge(); b.textContent = x.t; b.className = "badge " + x.c;
  }

  // ---------- fotos ----------
  async function comprimir(arquivo) {
    const MAX = 1600;
    let img;
    try { img = await createImageBitmap(arquivo, { imageOrientation: "from-image" }); }
    catch (e) {
      img = await new Promise((ok, erro) => {
        const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = URL.createObjectURL(arquivo);
      });
    }
    const w = img.width, h = img.height, k = Math.min(1, MAX / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.75));
  }
  function posicao() {
    return new Promise((ok) => {
      if (!navigator.geolocation) return ok(null);
      navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  }
  async function carregarImagens() {
    const imgs = $$("img[data-path]");
    if (!imgs.length) return;
    const agora = Date.now();
    const falta = [...new Set(imgs.map((i) => i.dataset.path).filter((p) => !S.urls[p] || S.urls[p].exp < agora))];
    if (falta.length && online()) {
      try {
        const r = await sb.storage.from("fotos").createSignedUrls(falta, 7 * 24 * 3600);
        if (!r.error) {
          r.data.forEach((x) => { if (x.signedUrl) S.urls[x.path] = { url: x.signedUrl, exp: agora + 6.5 * 24 * 3600e3 }; });
          LS.set("mon.urls", S.urls);
        }
      } catch (e) { console.error(e); }
    }
    imgs.forEach((i) => { const u = S.urls[i.dataset.path]; if (u) i.src = u.url; else i.alt = "📷 sem sinal"; });
  }

  // ---------- pedaços de tela ----------
  function topo(titulo, voltar) {
    const x = textoBadge();
    return '<header class="topo">' +
      (voltar ? '<a class="voltar" href="' + voltar + '" aria-label="Voltar">‹</a>' : '<div class="logo">🌱</div>') +
      '<div class="tt"><b>' + esc(titulo) + '</b><small>' + esc(S.user.nome) + " · " + esc(SAFRA) + "</small></div>" +
      '<button id="badge" class="badge ' + x.c + '" data-act="sync">' + esc(x.t) + "</button></header>";
  }
  function chipStatus(st) {
    if (!st || !O.status[st]) return "";
    return '<span class="st st-' + st + '">' + O.status[st].ic + " " + O.status[st].t + "</span>";
  }
  function problemas(ck) {
    const out = [];
    O.itens.forEach((it) => {
      const c = ck && ck[it.k];
      if (!c || !c.nivel) return;
      if (c.nivel === "ausente") return;
      const n = O.niveis.find((x) => x.k === c.nivel);
      out.push('<span class="pb pb-' + c.nivel + '">' + it.ic + " " + esc(it.t) + (c.qual ? ": " + esc(c.qual) : "") + " (" + n.s + ")</span>");
    });
    return out.join("");
  }
  function corVar(v) { return M.coresVariedade[v] || "#888"; }

  // ---------- tela: login ----------
  function telaLogin(msg) {
    document.title = "Monitoramento Sede V";
    app.innerHTML =
      '<div class="login"><div class="login-card">' +
      '<div class="login-logo">🌱</div><h1>Monitoramento<br>Sede V</h1><p class="sub">Vistoria de pivôs · ' + esc(SAFRA) + "</p>" +
      '<form id="fLogin" autocomplete="on">' +
      '<label>Usuário<input name="u" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="ex.: gustavo.rabelo" required></label>' +
      '<label>Senha<input name="s" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn grande" type="submit">Entrar</button>' +
      '<p class="msg" id="loginMsg">' + esc(msg || "") + "</p></form>" +
      '<p class="nota">Esqueceu a senha? Fale com o Gustavo.</p></div></div>';
    $("#fLogin").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = $("#loginMsg");
      const usuario = f.u.value.trim().toLowerCase().replace(/@.*$/, "");
      if (!online()) { m.textContent = "Sem internet. O primeiro login precisa de sinal."; return; }
      m.textContent = "Entrando…";
      const r = await sb.auth.signInWithPassword({ email: usuario + "@" + C.dominioLogin, password: f.s.value });
      if (r.error) { m.textContent = "Usuário ou senha incorretos."; return; }
      await entrar(r.data.user);
    });
  }

  async function entrar(u) {
    let perfil = LS.get("mon.user", null);
    if (!perfil || perfil.id !== u.id) perfil = { id: u.id, usuario: (u.email || "").split("@")[0], nome: (u.email || "").split("@")[0] };
    if (online()) {
      const r = await sb.from("perfis").select("id,usuario,nome").eq("id", u.id).maybeSingle();
      if (r.data) perfil = r.data;
    }
    S.user = perfil;
    LS.set("mon.user", perfil);
    if (!location.hash || location.hash === "#") location.hash = "#/";
    rota();
    atualizar();
    await carregarOutbox();
    if (S.outbox.length && !/\/nova$/.test(location.hash)) rota();
    sincronizar();
  }

  async function sair() {
    const n = S.outbox.filter((it) => it.autor === (S.user && S.user.id)).length;
    if (n && !confirm("Ainda há " + n + " vistoria(s) suas guardadas no celular, sem enviar. Se sair, elas só serão enviadas quando você entrar de novo. Sair mesmo assim?")) return;
    await sb.auth.signOut().catch(() => {});
    LS.del("mon.user");
    S.user = null;
    location.hash = "#/";
    telaLogin();
  }

  // ---------- tela: início (mapa / lista) ----------
  function telaInicio() {
    document.title = "Monitoramento Sede V";
    const semAtual = segunda(hoje());
    const lista = pivosSoja();
    let feitos = 0; const cont = { ok: 0, atencao: 0, problema: 0 };
    const info = {};
    lista.forEach((p) => {
      const u = ultima(p);
      const naSemana = !!(u && segunda(u.data) === semAtual);
      if (naSemana) feitos++;
      if (u && u.status) cont[u.status]++;
      info[p] = { u, naSemana };
    });

    let corpo = "";
    if (S.view === "mapa") {
      corpo += '<div class="mapa"><div class="rio">〰 ' + esc(M.rioRotulo) + "</div>";
      M.linhas.forEach((linha, li) => {
        corpo += '<div class="linha">';
        linha.forEach((p, ci) => {
          if (!p) {
            corpo += (M.sede && M.sede.linha === li && M.sede.coluna === ci) ? '<div class="cel sede">🏠<small>' + esc(M.sede.rotulo) + "</small></div>" : '<div class="cel vazio"></div>';
            return;
          }
          if (!S.pivos[p]) { corpo += '<div class="cel fora"><b>' + p.replace("PV", "") + "</b><small>fora</small></div>"; return; }
          const x = info[p], st = x.u ? x.u.status || "nenhum" : "nenhum";
          const quando = x.u ? (dias(x.u.data, hoje()) === 0 ? "hoje" : "há " + dias(x.u.data, hoje()) + "d") : "sem vist.";
          const pend = x.u && x.u._pendente ? '<i class="pend">⏳</i>' : "";
          corpo += '<button class="cel st-' + st + (x.naSemana ? "" : " atrasado") + '" data-act="abrir" data-p="' + p + '">' +
            '<span class="var" style="background:' + corVar(S.pivos[p].variedade) + '"></span>' + pend +
            "<b>" + p.replace("PV", "") + "</b><small>" + quando + "</small></button>";
        });
        corpo += "</div>";
        if (li === M.estradaDepoisDaLinha) corpo += '<div class="estrada">' + esc(M.estradaRotulo) + "</div>";
      });
      corpo += "</div>";
      corpo += '<div class="legenda"><span><i class="q st-ok"></i>OK</span><span><i class="q st-atencao"></i>Atenção</span><span><i class="q st-problema"></i>Problema</span><span><i class="q st-nenhum"></i>Sem vistoria</span><span><i class="q tracejado"></i>Não vistoriado nesta semana</span></div>';
      corpo += '<div class="legenda">' + Object.entries(M.coresVariedade).map(([v, c]) => '<span><i class="bolinha" style="background:' + c + '"></i>' + esc(v.replace("BMX ", "")) + "</span>").join("") + "</div>";
    } else {
      corpo += '<div class="lista">';
      lista.forEach((p) => {
        const pv = S.pivos[p], x = info[p];
        corpo += '<button class="item" data-act="abrir" data-p="' + p + '">' +
          '<span class="var-barra" style="background:' + corVar(pv.variedade) + '"></span>' +
          '<div class="item-c"><div class="item-l1"><b>' + p + "</b> " + chipStatus(x.u && x.u.status) + (x.naSemana ? "" : ' <span class="tag-atr">sem vistoria na semana</span>') + "</div>" +
          '<div class="item-l2">' + esc(pv.variedade) + " · " + esc(palhadaDe(p) || "palhada ?") + "</div>" +
          '<div class="item-l3">' + (x.u ? "Última: " + fmt(x.u.data) + " · " + esc(nomeAutor(x.u.autor)) + (x.u.estadio ? " · " + esc(x.u.estadio) : "") + (x.u._pendente ? " · ⏳ no celular" : "") : "Nenhuma vistoria ainda") + "</div>" +
          "</div><span class=\"seta\">›</span></button>";
      });
      corpo += "</div>";
    }

    app.innerHTML = topo("Sede V") +
      '<main class="pag">' +
      '<div class="resumo"><div><b>Semana ' + rotuloSemana(semAtual) + "</b><br>" + feitos + " de " + lista.length + " pivôs vistoriados</div>" +
      '<div class="resumo-st">🟢 ' + cont.ok + " &nbsp;🟡 " + cont.atencao + " &nbsp;🔴 " + cont.problema + "</div></div>" +
      '<div class="seg2"><button class="' + (S.view === "mapa" ? "on" : "") + '" data-act="view" data-v="mapa">🗺️ Mapa</button><button class="' + (S.view === "lista" ? "on" : "") + '" data-act="view" data-v="lista">📋 Lista</button></div>' +
      corpo +
      '<p class="rodape">' + (S.cacheEm ? "Dados atualizados em " + new Date(S.cacheEm).toLocaleString("pt-BR") : "") + '<br><button class="link" data-act="sair">Sair (' + esc(S.user.usuario) + ")</button></p>" +
      "</main>";
  }

  // ---------- tela: pivô ----------
  function cabecalhoPivo(p) {
    const pv = S.pivos[p], pal = palhadaDe(p);
    const dap = pv.plantio ? dias(pv.plantio, hoje()) : null;
    return '<div class="ficha-pivo">' +
      '<div class="fp-l1"><span class="bolinha" style="background:' + corVar(pv.variedade) + '"></span><b>' + esc(pv.variedade) + "</b> · " + esc(pv.safra || SAFRA) + "</div>" +
      '<div class="fp-grid">' +
      "<div><small>Área</small>" + (pv.area ? Number(pv.area).toLocaleString("pt-BR") + " ha" : "—") + "</div>" +
      "<div><small>Plantio</small>" + fmt(pv.plantio) + (dap != null ? " · " + dap + " DAP" : "") + "</div>" +
      "<div><small>Ciclo</small>" + (pv.ciclo || "—") + " dias</div>" +
      "<div><small>Colheita prev.</small>" + fmt(pv.colheita) + "</div>" +
      "</div>" +
      '<div class="fp-pal ' + (pal ? "" : "falta") + '">' + (pal ? "🌾 " + esc(pal) + (S.palhadaPend[p] ? " ⏳" : "") : '⚠️ Palhada não preenchida · <a href="#/pivo/' + p + '/cadastro">preencher</a>') + "</div>" +
      "</div>";
  }

  function telaPivo(p, aba) {
    document.title = p + " · Monitoramento";
    const vs = vistoriasDe(p);
    let corpo = "";
    if (aba === "cadastro") {
      const pv = S.pivos[p], atual = palhadaDe(p) || "";
      const outra = atual && !O.palhadas.includes(atual);
      corpo += '<form id="fPal" class="cartao"><h3>Palhada / cultura anterior</h3>' +
        O.palhadas.map((o) => '<label class="radio"><input type="radio" name="pal" value="' + esc(o) + '"' + (atual === o ? " checked" : "") + "> " + esc(o) + "</label>").join("") +
        '<label class="radio"><input type="radio" name="pal" value="__outra"' + (outra ? " checked" : "") + '> Outra: <input name="outra" value="' + esc(outra ? atual : "") + '" placeholder="escreva"></label>' +
        '<button class="btn" type="submit">Salvar palhada</button>' +
        (pv.palhada_em ? '<p class="nota">Preenchida por ' + esc(nomeAutor(pv.palhada_por)) + " em " + fmtAno(pv.palhada_em) + "</p>" : "") +
        '</form><div class="cartao nota">Variedade, área, plantio, ciclo e colheita vêm da planilha da Sede V. A palhada é preenchida aqui, em campo.</div>';
    } else {
      if (!vs.length) corpo += '<div class="vazio-msg">Nenhuma vistoria neste pivô ainda.<br>Toque em <b>+ Nova vistoria</b>.</div>';
      let semAnt = null;
      vs.forEach((v) => {
        const sem = segunda(v.data);
        if (sem !== semAnt) { corpo += '<h4 class="semana">Semana ' + rotuloSemana(sem) + "</h4>"; semAnt = sem; }
        const meu = S.user && v.autor === S.user.id;
        corpo += '<article class="vist' + (v._pendente ? " pendente" : "") + '">' +
          '<div class="v-l1"><b>' + fmtAno(v.data) + "</b>" + (v.estadio ? ' <span class="estadio">' + esc(v.estadio) + "</span>" : "") + " " + chipStatus(v.status) + "</div>" +
          '<div class="v-aut">por ' + esc(nomeAutor(v.autor)) + (v._pendente ? ' · <span class="aguard">⏳ guardada no celular' + (v._erro ? " (erro: " + esc(v._erro) + ")" : "") + "</span>" : "") + "</div>" +
          '<div class="pbs">' + (problemas(v.checklist) || '<span class="pb pb-ausente">Nada relevante marcado</span>') + "</div>" +
          (v.anamnese ? '<p class="anam">' + esc(v.anamnese).replace(/\n/g, "<br>") + "</p>" : "") +
          (v._fotos.length ? '<div class="thumbs">' + v._fotos.map((f) => {
            const src = f._url ? ' src="' + f._url + '"' : ' crossorigin="anonymous" data-path="' + esc(f.caminho) + '"';
            return '<figure data-act="foto" data-obs="' + esc(f.observacao || "") + '" data-item="' + esc(f.item || "") + '"><img' + src + ' loading="lazy" alt="foto">' + (f.observacao ? "<figcaption>" + esc(f.observacao) + "</figcaption>" : "") + "</figure>";
          }).join("") + "</div>" : "") +
          (meu ? '<div class="v-acoes"><button class="link perigo" data-act="apagar" data-id="' + esc(v.id) + '" data-pend="' + (v._pendente ? 1 : 0) + '">Apagar</button></div>' : "") +
          "</article>";
      });
    }
    app.innerHTML = topo(p, "#/") +
      '<main class="pag">' + cabecalhoPivo(p) +
      '<div class="seg2"><a class="' + (aba !== "cadastro" ? "on" : "") + '" href="#/pivo/' + p + '">📅 Histórico (' + vs.length + ')</a><a class="' + (aba === "cadastro" ? "on" : "") + '" href="#/pivo/' + p + '/cadastro">✏️ Cadastro do pivô</a></div>' +
      corpo + "</main>" +
      '<a class="fab" href="#/pivo/' + p + '/nova">+ Nova vistoria</a>';

    const f = $("#fPal");
    if (f) f.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let val = (f.querySelector("input[name=pal]:checked") || {}).value;
      if (val === "__outra") val = f.outra.value.trim();
      if (!val) { toast("Escolha uma opção"); return; }
      S.palhadaPend[p] = val; LS.set("mon.palhadaPend", S.palhadaPend);
      toast(online() ? "Palhada salva" : "Palhada guardada no celular; envia quando tiver sinal", "ok");
      const voltarPara = S.drafts[p] ? "#/pivo/" + p + "/nova" : "#/pivo/" + p;
      location.hash = voltarPara;
      sincronizar();
    });
    carregarImagens();
  }

  // ---------- tela: nova vistoria ----------
  function novoDraft() {
    return { client_id: uuid(), data: hoje(), estadio: "", checklist: {}, anamnese: "", status: "", statusManual: false, fotos: [] };
  }
  function statusSugerido(ck) {
    const ns = Object.values(ck).map((c) => c.nivel);
    if (ns.includes("alto")) return "problema";
    if (ns.includes("medio")) return "atencao";
    return "ok";
  }

  function telaNova(p) {
    document.title = "Nova vistoria · " + p;
    const d = S.drafts[p] || (S.drafts[p] = novoDraft());
    if (!d.statusManual) d.status = statusSugerido(d.checklist);
    const itensOpt = '<option value="">— item —</option>' + O.itens.map((it) => '<option value="' + it.k + '">' + it.ic + " " + esc(it.t) + "</option>").join("");
    const y = window.scrollY;

    app.innerHTML = topo("Nova vistoria · " + p, "#/pivo/" + p) +
      '<main class="pag form">' + cabecalhoPivo(p) +
      '<section class="cartao"><h3>Data e estádio</h3>' +
      '<input type="date" data-f="data" value="' + esc(d.data) + '" max="' + hoje() + '">' +
      '<div class="chips">' + O.estadios.map((e) => '<button type="button" class="chip' + (d.estadio === e ? " on" : "") + '" data-act="estadio" data-v="' + e + '">' + e + "</button>").join("") + "</div></section>" +

      '<section class="cartao"><h3>Checklist</h3>' +
      O.itens.map((it) => {
        const c = d.checklist[it.k] || {};
        const aberto = c.nivel && c.nivel !== "ausente";
        const marcadas = (c.qual || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        return '<div class="ck">' +
          '<div class="ck-h">' + it.ic + " " + esc(it.t) + "</div>" +
          '<div class="niv">' + O.niveis.map((n) => '<button type="button" class="n-' + n.k + (c.nivel === n.k ? " on" : "") + '" data-act="nivel" data-k="' + it.k + '" data-v="' + n.k + '">' + n.t + "</button>").join("") + "</div>" +
          (aberto ? '<div class="ck-det"><div class="chips">' + it.sug.map((s) => '<button type="button" class="chip mini' + (marcadas.includes(s.toLowerCase()) ? " on" : "") + '" data-act="sug" data-k="' + it.k + '" data-v="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div>" +
            '<input data-f="qual" data-k="' + it.k + '" value="' + esc(c.qual || "") + '" placeholder="Qual / onde no pivô?"></div>' : "") +
          "</div>";
      }).join("") + "</section>" +

      '<section class="cartao"><h3>Anamnese</h3><textarea data-f="anamnese" rows="6" placeholder="O que foi visto, onde no pivô, desde quando, possível causa, sugestão…">' + esc(d.anamnese) + "</textarea>" +
      '<p class="nota">Dica: use o 🎤 do teclado do celular para ditar.</p></section>' +

      '<section class="cartao"><h3>Fotos (' + d.fotos.length + ")</h3>" +
      '<div class="foto-btns"><label class="btn sec">📷 Tirar foto<input id="inCam" type="file" accept="image/*" capture="environment" hidden></label>' +
      '<label class="btn sec">🖼️ Da galeria<input id="inGal" type="file" accept="image/*" multiple hidden></label></div>' +
      d.fotos.map((f, i) => '<div class="foto-ed"><img src="' + f._url + '" alt="foto ' + (i + 1) + '">' +
        '<div class="foto-campos"><textarea data-f="fobs" data-i="' + i + '" rows="2" placeholder="Observação da foto">' + esc(f.observacao || "") + "</textarea>" +
        '<select data-f="fitem" data-i="' + i + '">' + itensOpt.replace('value="' + (f.item || "") + '"', 'value="' + (f.item || "") + '" selected') + "</select>" +
        '<div class="foto-rod">' + (f.lat != null ? "📍 GPS ok" : "📍 sem GPS") + ' <button type="button" class="link perigo" data-act="rmfoto" data-i="' + i + '">remover</button></div></div></div>').join("") +
      "</section>" +

      '<section class="cartao"><h3>Status geral do pivô</h3><div class="niv st3">' +
      Object.entries(O.status).map(([k, s]) => '<button type="button" class="s-' + k + (d.status === k ? " on" : "") + '" data-act="status" data-v="' + k + '">' + s.ic + " " + s.t + "</button>").join("") +
      "</div>" + (d.statusManual ? "" : '<p class="nota">Sugerido pelo maior nível marcado. Toque para mudar.</p>') + "</section>" +

      '<div class="acoes-form"><button class="btn sec" data-act="cancelar">Descartar</button><button class="btn grande" data-act="salvar">💾 Salvar vistoria</button></div>' +
      "</main>";
    window.scrollTo(0, y);

    const addFotos = async (ev) => {
      const arqs = Array.from(ev.target.files || []);
      ev.target.value = "";
      if (!arqs.length) return;
      toast("Preparando " + arqs.length + " foto(s)…");
      const pos = posicao();
      for (const a of arqs) {
        try {
          const blob = await comprimir(a);
          d.fotos.push({ client_id: uuid(), blob, _url: URL.createObjectURL(blob), observacao: "", item: "", lat: null, lng: null });
        } catch (e) { console.error(e); toast("Não consegui abrir uma das fotos", "erro"); }
      }
      const g = await pos;
      if (g) d.fotos.forEach((f) => { if (f.lat == null) { f.lat = g.lat; f.lng = g.lng; } });
      telaNova(p);
    };
    $("#inCam").addEventListener("change", addFotos);
    $("#inGal").addEventListener("change", addFotos);
  }

  async function salvarVistoria(p) {
    const d = S.drafts[p]; if (!d) return;
    const pv = S.pivos[p];
    const temAlgo = d.estadio || Object.keys(d.checklist).length || d.anamnese.trim() || d.fotos.length;
    if (!temAlgo) { toast("Preencha pelo menos o estádio, o checklist, a anamnese ou uma foto", "erro"); return; }
    const item = {
      client_id: d.client_id,
      autor: S.user.id,
      criado_em: new Date().toISOString(),
      vistoria: {
        pivo: p, data: d.data || hoje(), safra: pv.safra || SAFRA, variedade: pv.variedade, palhada: palhadaDe(p),
        estadio: d.estadio || null, status: d.status || statusSugerido(d.checklist), checklist: d.checklist,
        anamnese: d.anamnese.trim() || null
      },
      fotos: d.fotos.map((f) => ({ client_id: f.client_id, blob: f.blob, observacao: (f.observacao || "").trim() || null, item: f.item || null, lat: f.lat, lng: f.lng }))
    };
    try {
      await Local.salvar(item);
    } catch (e) {
      console.error(e); toast("Erro ao guardar no celular: " + (e.message || e), "erro"); return;
    }
    d.fotos.forEach((f) => URL.revokeObjectURL(f._url));
    delete S.drafts[p];
    await carregarOutbox();
    toast(online() ? "✓ Vistoria salva. Enviando…" : "✓ Vistoria guardada no celular. Envia quando tiver sinal.", "ok");
    location.hash = "#/pivo/" + p;
    sincronizar();
  }

  // ---------- visualizador de foto ----------
  function verFoto(fig) {
    const img = $("img", fig); if (!img || !img.src) return;
    const it = O.itens.find((x) => x.k === fig.dataset.item);
    const ov = document.createElement("div");
    ov.className = "visor";
    ov.innerHTML = '<img src="' + img.src + '" alt="foto"><div class="visor-txt">' + (it ? "<b>" + it.ic + " " + esc(it.t) + "</b><br>" : "") + esc(fig.dataset.obs || "") + '</div><button class="visor-x" aria-label="Fechar">✕</button>';
    ov.addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }

  // ---------- eventos ----------
  app.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const m = location.hash.match(/^#\/pivo\/(PV\d+)/);
    const p = m && m[1];
    const d = p && S.drafts[p];
    switch (act) {
      case "sync": sincronizar(true); break;
      case "view": S.view = el.dataset.v; LS.set("mon.view", S.view); telaInicio(); break;
      case "abrir": location.hash = "#/pivo/" + el.dataset.p; break;
      case "sair": sair(); break;
      case "foto": verFoto(el); break;
      case "estadio": if (d) { d.estadio = d.estadio === el.dataset.v ? "" : el.dataset.v; telaNova(p); } break;
      case "nivel":
        if (d) {
          const k = el.dataset.k, c = d.checklist[k] || (d.checklist[k] = { nivel: "", qual: "" });
          if (c.nivel === el.dataset.v) delete d.checklist[k]; else c.nivel = el.dataset.v;
          telaNova(p);
        }
        break;
      case "sug":
        if (d) {
          const c = d.checklist[el.dataset.k]; if (!c) break;
          const lista = (c.qual || "").split(",").map((s) => s.trim()).filter(Boolean);
          const i = lista.findIndex((s) => s.toLowerCase() === el.dataset.v.toLowerCase());
          if (i >= 0) lista.splice(i, 1); else lista.push(el.dataset.v);
          c.qual = lista.join(", ");
          telaNova(p);
        }
        break;
      case "status": if (d) { d.status = el.dataset.v; d.statusManual = true; telaNova(p); } break;
      case "rmfoto": if (d) { const f = d.fotos.splice(Number(el.dataset.i), 1)[0]; if (f) URL.revokeObjectURL(f._url); telaNova(p); } break;
      case "cancelar":
        if (d && (d.fotos.length || d.anamnese || Object.keys(d.checklist).length) && !confirm("Descartar esta vistoria?")) break;
        if (d) { d.fotos.forEach((f) => URL.revokeObjectURL(f._url)); delete S.drafts[p]; }
        location.hash = "#/pivo/" + p;
        break;
      case "salvar": el.disabled = true; await salvarVistoria(p); el.disabled = false; break;
      case "apagar": {
        if (!confirm("Apagar esta vistoria e as fotos dela? Não dá para desfazer.")) break;
        const id = el.dataset.id;
        if (el.dataset.pend === "1") { await Local.apagar(id); await carregarOutbox(); rota(); toast("Apagada"); break; }
        if (!online()) { toast("Precisa de sinal para apagar uma vistoria já enviada", "erro"); break; }
        const fs = S.fotos.filter((f) => f.vistoria_id === id).map((f) => f.caminho);
        if (fs.length) await sb.storage.from("fotos").remove(fs);
        const r = await sb.from("vistorias").delete().eq("id", id);
        if (r.error) { toast("Erro ao apagar: " + r.error.message, "erro"); break; }
        S.vistorias = S.vistorias.filter((v) => v.id !== id);
        S.fotos = S.fotos.filter((f) => f.vistoria_id !== id);
        rota(); toast("Apagada"); atualizar();
        break;
      }
    }
  });

  app.addEventListener("input", (ev) => {
    const el = ev.target, f = el.dataset && el.dataset.f;
    if (!f) return;
    const m = location.hash.match(/^#\/pivo\/(PV\d+)\/nova/);
    const d = m && S.drafts[m[1]];
    if (!d) return;
    if (f === "data") d.data = el.value;
    else if (f === "anamnese") d.anamnese = el.value;
    else if (f === "qual") { const c = d.checklist[el.dataset.k]; if (c) c.qual = el.value; }
    else if (f === "fobs") d.fotos[Number(el.dataset.i)].observacao = el.value;
    else if (f === "fitem") d.fotos[Number(el.dataset.i)].item = el.value;
  });
  app.addEventListener("change", (ev) => {
    if (ev.target.dataset && ev.target.dataset.f === "fitem") ev.target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // ---------- rotas ----------
  function rota() {
    if (!S.user) return telaLogin();
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    if (partes[0] === "pivo" && S.pivos[partes[1]]) {
      if (partes[2] === "nova") return telaNova(partes[1]);
      return telaPivo(partes[1], partes[2] === "cadastro" ? "cadastro" : "historico");
    }
    telaInicio();
  }
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); rota(); });
  window.addEventListener("online", () => { badge(); sincronizar(); });
  window.addEventListener("offline", badge);
  setInterval(() => { if (S.user && (S.outbox.length || Object.keys(S.palhadaPend).length)) sincronizar(); }, 60000);

  // ---------- início ----------
  async function iniciar() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
    }
    let sess = null;
    try { sess = (await sb.auth.getSession()).data.session; } catch (e) { console.warn(e); }
    if (sess) return entrar(sess.user);
    const ult = LS.get("mon.user", null);
    if (ult && !online()) { // sem sinal: deixa lançar e envia quando entrar de novo
      S.user = ult; rota(); await carregarOutbox(); rota(); return;
    }
    telaLogin();
  }
  iniciar();
})();
