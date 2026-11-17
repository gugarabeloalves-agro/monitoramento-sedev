// App de Monitoramento · Sede V — telas, login, vistorias (nova e edição), aplicação, fotos, envio (offline primeiro)
// e relatório semanal acumulado (tela + PDF, sempre montado na hora com os dados mais recentes).
(function () {
  "use strict";
  const C = window.APP_CONFIG, O = window.APP_OPCOES, M = window.APP_MAPA;
  const SAFRA = window.APP_SAFRA || "Soja 26/27";
  const SITE = window.APP_SITE || { pivos: {} };
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
  const copia = (x) => JSON.parse(JSON.stringify(x == null ? {} : x));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hoje = () => iso(new Date());
  const parseD = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (s) => { if (!s) return "—"; const d = parseD(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  const fmtAno = (s) => { if (!s) return "—"; const d = parseD(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  const addDias = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
  const segunda = (s) => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const rotuloSemana = (seg) => fmt(seg) + " a " + fmt(addDias(seg, 6));
  const dias = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
  const mil = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("pt-BR"));
  const online = () => navigator.onLine !== false;
  const NIV = { ausente: 0, baixo: 1, medio: 2, alto: 3 };

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
  const siteDe = (p) => (SITE.pivos && SITE.pivos[p]) || {};
  function palhadaDe(p) { return S.palhadaPend[p] || (S.pivos[p] && S.pivos[p].palhada) || null; }
  function pivosSoja() {
    const ord = M.ordemPlantio.filter((p) => S.pivos[p]);
    Object.keys(S.pivos).forEach((p) => { if (!ord.includes(p)) ord.push(p); });
    return ord;
  }

  // Junta o que está no servidor com o que ainda está no celular (novas e edições pendentes).
  function vistoriasDe(p) {
    const out = [], porCid = {};
    S.vistorias.filter((v) => v.pivo === p).forEach((v) => {
      const x = Object.assign({}, v, { _fotos: S.fotos.filter((f) => f.vistoria_id === v.id) });
      out.push(x);
      if (v.client_id) porCid[v.client_id] = x;
    });
    S.outbox.forEach((it) => {
      if (it.vistoria.pivo !== p) return;
      const srv = porCid[it.client_id];
      const rem = new Set((it.fotosRemover || []).map((f) => f.client_id));
      const ed = Object.fromEntries((it.fotosEdit || []).map((f) => [f.client_id, f]));
      const base = srv ? srv._fotos.filter((f) => !rem.has(f.client_id)).map((f) => ed[f.client_id] ? Object.assign({}, f, { observacao: ed[f.client_id].observacao, item: ed[f.client_id].item }) : f) : [];
      const ja = new Set(base.map((f) => f.client_id));
      const novas = it.fotos.filter((f) => !ja.has(f.client_id)).map((f) => ({
        client_id: f.client_id, observacao: f.observacao, item: f.item, lat: f.lat, lng: f.lng, enviada: !!f.enviada, _url: f._url, _blob: f.blob
      }));
      const m = Object.assign({}, srv || {}, it.vistoria, {
        id: srv ? srv.id : it.client_id, client_id: it.client_id, autor: it.autor,
        criado_em: srv ? srv.criado_em : it.criado_em, _pendente: true, _edicao: !!srv, _erro: it.erro, _fotos: base.concat(novas)
      });
      if (srv) out[out.indexOf(srv)] = m; else out.push(m);
    });
    return out.sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em));
  }
  const ultima = (p) => vistoriasDe(p)[0] || null;

  // ---------- aplicação ----------
  function normApl(a) {
    const x = copia(a);
    if (!x.cats || typeof x.cats !== "object") x.cats = {};
    if (typeof x.obs !== "string") x.obs = "";
    return x;
  }
  function aplPreenchida(a) {
    if (!a) return false;
    return Object.values(a.cats || {}).some((c) => c && c.precisa) || !!(a.obs || "").trim();
  }
  function aplSim(a) { const c = (a && a.cats) || {}; return O.aplicacoes.filter((x) => c[x.k] && c[x.k].precisa === "sim"); }
  function limparApl(a) {
    const x = normApl(a), cats = {};
    Object.entries(x.cats).forEach(([k, c]) => { if (c && c.precisa) cats[k] = { precisa: c.precisa, obs: (c.precisa === "sim" && (c.obs || "").trim()) || null }; });
    return { cats, obs: x.obs.trim() || null };
  }
  function ultimaApl(vs) { return vs.find((v) => aplPreenchida(v.aplicacao)) || null; }
  function aplHTML(a, curto) {
    if (!aplPreenchida(a)) return "";
    const c = a.cats || {};
    const sim = O.aplicacoes.filter((x) => c[x.k] && c[x.k].precisa === "sim");
    const nao = O.aplicacoes.filter((x) => c[x.k] && c[x.k].precisa === "nao");
    let h = '<div class="apl-lin">';
    sim.forEach((x) => { h += '<span class="ap ap-sim">' + x.ic + " " + esc(x.t) + (c[x.k].obs ? ": " + esc(c[x.k].obs) : "") + "</span>"; });
    if (nao.length) h += '<span class="ap ap-nao">Não precisa: ' + nao.map((x) => esc(curto ? x.t.split(" ")[0] : x.t)).join(", ") + "</span>";
    h += "</div>";
    if (a.obs) h += '<p class="nota apl-obs">🚜 ' + esc(a.obs) + "</p>";
    return h;
  }

  async function carregarOutbox() {
    S.outbox.forEach((it) => it.fotos.forEach((f) => f._url && URL.revokeObjectURL(f._url)));
    let itens = [];
    try { itens = await Local.todos(); } catch (e) { console.error(e); }
    itens.forEach((it) => it.fotos.forEach((f) => { f._url = URL.createObjectURL(f.blob); }));
    S.outbox = itens.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  }

  const editando = () => /\/(nova|editar)(\/|$)/.test(location.hash);

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
      if (!editando()) rota();
    } catch (e) {
      console.error("atualizar", e);
    }
  }

  // ---------- envio (sincronização) ----------
  function semUrls(it) {
    const c = Object.assign({}, it, { fotos: it.fotos.map((x) => { const y = Object.assign({}, x); delete y._url; return y; }) });
    delete c.erro;
    return c;
  }
  async function enviarItem(it, uid) {
    const v = Object.assign({}, it.vistoria, { client_id: it.client_id, autor: uid, atualizado_em: new Date().toISOString() });
    const r = await sb.from("vistorias").upsert(v, { onConflict: "client_id" }).select("id").single();
    if (r.error) throw r.error;
    const vid = r.data.id;
    // edição: fotos removidas e legendas alteradas
    for (const f of it.fotosRemover || []) {
      if (f.caminho) { try { await sb.storage.from("fotos").remove([f.caminho]); } catch (e) { console.warn(e); } }
      const rd = await sb.from("fotos").delete().eq("client_id", f.client_id);
      if (rd.error) throw rd.error;
    }
    for (const f of it.fotosEdit || []) {
      const ru = await sb.from("fotos").update({ observacao: f.observacao, item: f.item }).eq("client_id", f.client_id);
      if (ru.error) throw ru.error;
    }
    // fotos novas
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
      await Local.salvar(semUrls(it));
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
          await Local.salvar(Object.assign(semUrls(it), { erro: it.erro }));
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
    imgs.forEach((i) => { const u = S.urls[i.dataset.path]; if (u) { if (i.src !== u.url) i.src = u.url; } else i.alt = "📷 sem sinal"; });
  }
  function imgFoto(f, lazy) {
    const src = f._url ? ' src="' + f._url + '"' : ' crossorigin="anonymous" data-path="' + esc(f.caminho) + '"';
    return "<img" + src + (lazy ? ' loading="lazy"' : "") + ' alt="foto">';
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
  function clPct(x) { return x == null ? "" : x >= 90 ? "pct-ok" : x >= 80 ? "pct-atencao" : "pct-problema"; }
  function estandeTxt(s) {
    if (!s.estandeFinal) return "—";
    return mil(s.estandeFinal) + ' <span class="pct ' + clPct(s.estandePct) + '">' + s.estandePct + "%</span>";
  }
  function foiEditada(v) {
    return v.atualizado_em && v.criado_em && (new Date(v.atualizado_em) - new Date(v.criado_em)) > 120000;
  }

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
    if (S.outbox.length && !editando()) rota();
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
      const vs = vistoriasDe(p), u = vs[0] || null;
      const naSemana = !!(u && segunda(u.data) === semAtual);
      if (naSemana) feitos++;
      if (u && u.status) cont[u.status]++;
      const ua = ultimaApl(vs);
      info[p] = { u, naSemana, apl: ua ? aplSim(ua.aplicacao) : [] };
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
          const apl = x.apl.length ? '<i class="apl-ic" title="Aplicação indicada">🚜</i>' : "";
          corpo += '<button class="cel st-' + st + (x.naSemana ? "" : " atrasado") + '" data-act="abrir" data-p="' + p + '">' +
            '<span class="var" style="background:' + corVar(S.pivos[p].variedade) + '"></span>' + pend + apl +
            "<b>" + p.replace("PV", "") + "</b><small>" + quando + "</small></button>";
        });
        corpo += "</div>";
        if (li === M.estradaDepoisDaLinha) corpo += '<div class="estrada">' + esc(M.estradaRotulo) + "</div>";
      });
      corpo += "</div>";
      corpo += '<div class="legenda"><span><i class="q st-ok"></i>OK</span><span><i class="q st-atencao"></i>Atenção</span><span><i class="q st-problema"></i>Problema</span><span><i class="q st-nenhum"></i>Sem vistoria</span><span><i class="q tracejado"></i>Não vistoriado nesta semana</span><span>🚜 Aplicação indicada</span></div>';
      corpo += '<div class="legenda">' + Object.entries(M.coresVariedade).map(([v, c]) => '<span><i class="bolinha" style="background:' + c + '"></i>' + esc(v.replace("BMX ", "")) + "</span>").join("") + "</div>";
    } else {
      corpo += '<div class="lista">';
      lista.forEach((p) => {
        const pv = S.pivos[p], x = info[p], s = siteDe(p);
        corpo += '<button class="item" data-act="abrir" data-p="' + p + '">' +
          '<span class="var-barra" style="background:' + corVar(pv.variedade) + '"></span>' +
          '<div class="item-c"><div class="item-l1"><b>' + p + "</b> " + chipStatus(x.u && x.u.status) + (x.naSemana ? "" : ' <span class="tag-atr">sem vistoria na semana</span>') + "</div>" +
          '<div class="item-l2">' + esc(pv.variedade) + (s.gm ? " · GM " + esc(s.gm) : "") + (s.estandePct != null ? ' · estande <span class="pct ' + clPct(s.estandePct) + '">' + s.estandePct + "%</span>" : "") + " · " + esc(palhadaDe(p) || "palhada ?") + "</div>" +
          '<div class="item-l3">' + (x.u ? "Última: " + fmt(x.u.data) + " · " + esc(nomeAutor(x.u.autor)) + (x.u.estadio ? " · " + esc(x.u.estadio) : "") + (x.u._pendente ? " · ⏳ no celular" : "") : "Nenhuma vistoria ainda") +
          (x.apl.length ? ' · <span class="apl-tag">🚜 ' + x.apl.map((a) => esc(a.t.split(" ")[0])).join(", ") + "</span>" : "") + "</div>" +
          "</div><span class=\"seta\">›</span></button>";
      });
      corpo += "</div>";
    }

    app.innerHTML = topo("Sede V") +
      '<main class="pag">' +
      '<div class="resumo"><div><b>Semana ' + rotuloSemana(semAtual) + "</b><br>" + feitos + " de " + lista.length + " pivôs vistoriados</div>" +
      '<div class="resumo-st">🟢 ' + cont.ok + " &nbsp;🟡 " + cont.atencao + " &nbsp;🔴 " + cont.problema + "</div></div>" +
      '<a class="btn sec bloco" href="#/relatorio/' + semAtual + '">📄 Relatório semanal (tela e PDF)</a>' +
      '<div class="seg2"><button class="' + (S.view === "mapa" ? "on" : "") + '" data-act="view" data-v="mapa">🗺️ Mapa</button><button class="' + (S.view === "lista" ? "on" : "") + '" data-act="view" data-v="lista">📋 Lista</button></div>' +
      corpo +
      '<p class="rodape">' + (S.cacheEm ? "Dados atualizados em " + new Date(S.cacheEm).toLocaleString("pt-BR") : "") +
      (SITE.origemData ? "<br>Estande, GM e aplicações feitas: planilha de " + fmtAno(SITE.origemData) : "") +
      '<br><button class="link" data-act="sair">Sair (' + esc(S.user.usuario) + ")</button></p>" +
      "</main>";
  }

  // ---------- tela: pivô ----------
  function cabecalhoPivo(p) {
    const pv = S.pivos[p], pal = palhadaDe(p), s = siteDe(p);
    const dap = pv.plantio ? dias(pv.plantio, hoje()) : null;
    const dae = s.emergencia ? dias(s.emergencia, hoje()) : null;
    return '<div class="ficha-pivo">' +
      '<div class="fp-l1"><span class="bolinha" style="background:' + corVar(pv.variedade) + '"></span><b>' + esc(pv.variedade) + "</b> · " + esc(pv.safra || SAFRA) + (s.gm ? ' · <span class="gm" title="' + esc(s.gmDetalhe || "") + '">GM ' + esc(s.gm) + "</span>" : "") + "</div>" +
      '<div class="fp-grid">' +
      "<div><small>Área</small>" + (pv.area ? mil(pv.area) + " ha" : "—") + "</div>" +
      "<div><small>Plantio</small>" + fmt(pv.plantio) + (dap != null ? " · " + dap + " DAP" : "") + "</div>" +
      "<div><small>Emergência</small>" + fmt(s.emergencia) + (dae != null ? " · " + dae + " DAE" : "") + "</div>" +
      "<div><small>Ciclo · colheita prev.</small>" + (pv.ciclo || "—") + " d · " + fmt(pv.colheita) + "</div>" +
      "<div><small>Pl/ha planejadas</small>" + mil(s.estandePlanejado) + "</div>" +
      "<div><small>Estande final (pl/ha)</small>" + estandeTxt(s) + "</div>" +
      "</div>" +
      '<div class="fp-pal ' + (pal ? "" : "falta") + '">' + (pal ? "🌾 " + esc(pal) + (S.palhadaPend[p] ? " ⏳" : "") : '⚠️ Palhada não preenchida · <a href="#/pivo/' + p + '/cadastro">preencher</a>') + "</div>" +
      "</div>";
  }

  function cartaoAplicacao(p, vs) {
    const ua = ultimaApl(vs), s = siteDe(p), feitas = s.aplicacoes || {};
    let h = '<section class="cartao apl-card"><h3>🚜 Aplicação</h3>';
    if (ua) h += '<p class="nota">Indicação da vistoria de ' + fmt(ua.data) + " (" + esc(nomeAutor(ua.autor)) + ")" + (ua._pendente ? " ⏳" : "") + "</p>" + aplHTML(ua.aplicacao);
    else h += '<p class="nota">Nenhuma indicação ainda. Ela é preenchida na vistoria, na parte "🚜 Aplicação".</p>';
    const linhas = O.aplicacoes.filter((a) => feitas[a.k]).map((a) => {
      const f = feitas[a.k];
      return "<tr><td>" + a.ic + " " + esc(a.t) + "</td><td>" + (f.ultima ? fmt(f.ultima) : "—") + "</td><td>" + f.feitas + (f.programadas ? " · " + f.programadas + " progr." : "") + "</td></tr>";
    });
    if (linhas.length) h += '<table class="tab-mini"><thead><tr><th>Já feitas (planilha de ' + fmt(SITE.origemData) + ')</th><th>Última</th><th>Nº</th></tr></thead><tbody>' + linhas.join("") + "</tbody></table>";
    return h + "</section>";
  }

  function telaPivo(p, aba) {
    document.title = p + " · Monitoramento";
    const vs = vistoriasDe(p);
    let corpo = "";
    if (aba === "cadastro") {
      const pv = S.pivos[p], atual = palhadaDe(p) || "", s = siteDe(p);
      const outra = atual && !O.palhadas.includes(atual);
      corpo += '<form id="fPal" class="cartao"><h3>Palhada / cultura anterior</h3>' +
        O.palhadas.map((o) => '<label class="radio"><input type="radio" name="pal" value="' + esc(o) + '"' + (atual === o ? " checked" : "") + "> " + esc(o) + "</label>").join("") +
        '<label class="radio"><input type="radio" name="pal" value="__outra"' + (outra ? " checked" : "") + '> Outra: <input name="outra" value="' + esc(outra ? atual : "") + '" placeholder="escreva"></label>' +
        '<button class="btn" type="submit">Salvar palhada</button>' +
        (pv.palhada_em ? '<p class="nota">Preenchida por ' + esc(nomeAutor(pv.palhada_por)) + " em " + fmtAno(pv.palhada_em) + "</p>" : "") +
        "</form>" +
        '<div class="cartao"><h3>Dados da cultivar</h3><div class="fp-grid">' +
        "<div><small>Grupo de maturação</small>" + esc(s.gmDetalhe || "—") + "</div>" +
        "<div><small>População oficial</small>" + esc(s.populacaoOficial || "—") + "</div></div></div>" +
        '<div class="cartao nota">Variedade, área, plantio, ciclo e colheita vêm do banco do app. Emergência, estande, GM e aplicações feitas vêm do Painel da Safra (planilha de ' + fmtAno(SITE.origemData) + "). A palhada é preenchida aqui, em campo.</div>";
    } else {
      corpo += cartaoAplicacao(p, vs);
      corpo += '<a class="btn sec bloco" href="#/relatorio/' + segunda(hoje()) + "/" + p + '">📄 Relatório deste pivô</a>';
      if (!vs.length) corpo += '<div class="vazio-msg">Nenhuma vistoria neste pivô ainda.<br>Toque em <b>+ Nova vistoria</b>.</div>';
      const em = siteDe(p).emergencia;
      let semAnt = null;
      vs.forEach((v) => {
        const sem = segunda(v.data);
        if (sem !== semAnt) { corpo += '<h4 class="semana">Semana ' + rotuloSemana(sem) + "</h4>"; semAnt = sem; }
        const meu = S.user && v.autor === S.user.id;
        corpo += '<article class="vist' + (v._pendente ? " pendente" : "") + '">' +
          '<div class="v-l1"><b>' + fmtAno(v.data) + "</b>" + (v.estadio ? ' <span class="estadio">' + esc(v.estadio) + "</span>" : "") + (em ? ' <span class="dae">' + dias(em, v.data) + " DAE</span>" : "") + " " + chipStatus(v.status) + "</div>" +
          '<div class="v-aut">por ' + esc(nomeAutor(v.autor)) + (foiEditada(v) ? " · editada em " + fmt(v.atualizado_em.slice(0, 10)) : "") +
          (v._pendente ? ' · <span class="aguard">⏳ ' + (v._edicao ? "alteração guardada no celular" : "guardada no celular") + (v._erro ? " (erro: " + esc(v._erro) + ")" : "") + "</span>" : "") + "</div>" +
          '<div class="pbs">' + (problemas(v.checklist) || '<span class="pb pb-ausente">Nada relevante marcado</span>') + "</div>" +
          (v.anamnese ? '<p class="anam">' + esc(v.anamnese).replace(/\n/g, "<br>") + "</p>" : "") +
          aplHTML(v.aplicacao, true) +
          (v._fotos.length ? '<div class="thumbs">' + v._fotos.map((f) =>
            '<figure data-act="foto" data-obs="' + esc(f.observacao || "") + '" data-item="' + esc(f.item || "") + '">' + imgFoto(f, true) + (f.observacao ? "<figcaption>" + esc(f.observacao) + "</figcaption>" : "") + "</figure>"
          ).join("") + "</div>" : "") +
          (meu ? '<div class="v-acoes"><button class="btn sec mini" data-act="editar" data-cid="' + esc(v.client_id) + '">✏️ Editar</button><button class="link perigo" data-act="apagar" data-cid="' + esc(v.client_id) + '">Apagar</button></div>' : "") +
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
      location.hash = S.drafts[p] ? "#/pivo/" + p + "/nova" : "#/pivo/" + p;
      sincronizar();
    });
    carregarImagens();
  }

  // ---------- tela: nova vistoria / editar vistoria ----------
  const chaveDraft = (p, cid) => (cid ? "ed:" + cid : p);
  function draftDaRota() {
    const m = location.hash.match(/^#\/pivo\/(PV\d+)\/(nova|editar)(?:\/([^/]+))?/);
    if (!m) return null;
    const cid = m[2] === "editar" ? decodeURIComponent(m[3] || "") : null;
    return { p: m[1], cid, d: S.drafts[chaveDraft(m[1], cid)] };
  }
  function novoDraft() {
    return { client_id: uuid(), data: hoje(), estadio: "", checklist: {}, anamnese: "", status: "", statusManual: false, aplicacao: normApl({}), fotos: [], fotosRemover: [] };
  }
  function draftDeVistoria(v) {
    const it = S.outbox.find((x) => x.client_id === v.client_id);
    return {
      client_id: v.client_id, edicao: true, criado_em: v.criado_em,
      safra: v.safra, variedade: v.variedade, palhada: v.palhada,
      data: v.data, estadio: v.estadio || "", checklist: copia(v.checklist), anamnese: v.anamnese || "",
      status: v.status || "", statusManual: true, aplicacao: normApl(v.aplicacao),
      fotos: v._fotos.map((f) => f._blob
        ? { client_id: f.client_id, blob: f._blob, _url: URL.createObjectURL(f._blob), observacao: f.observacao || "", item: f.item || "", lat: f.lat, lng: f.lng, enviada: !!f.enviada }
        : { client_id: f.client_id, caminho: f.caminho, existente: true, observacao: f.observacao || "", item: f.item || "", lat: f.lat, lng: f.lng }),
      fotosRemover: ((it && it.fotosRemover) || []).slice()
    };
  }
  function descartarDraft(k) {
    const d = S.drafts[k]; if (!d) return;
    d.fotos.forEach((f) => { if (!f.existente && f._url) URL.revokeObjectURL(f._url); });
    delete S.drafts[k];
  }
  function statusSugerido(ck) {
    const ns = Object.values(ck).map((c) => c.nivel);
    if (ns.includes("alto")) return "problema";
    if (ns.includes("medio")) return "atencao";
    return "ok";
  }

  function telaForm(p, cid) {
    const k = chaveDraft(p, cid);
    let d = S.drafts[k];
    if (!d) {
      if (cid) {
        const v = vistoriasDe(p).find((x) => x.client_id === cid);
        if (!v) { toast("Vistoria não encontrada", "erro"); location.hash = "#/pivo/" + p; return; }
        if (!S.user || v.autor !== S.user.id) { toast("Só quem lançou pode editar", "erro"); location.hash = "#/pivo/" + p; return; }
        d = S.drafts[k] = draftDeVistoria(v);
      } else d = S.drafts[k] = novoDraft();
    }
    document.title = (cid ? "Editar vistoria · " : "Nova vistoria · ") + p;
    if (!d.statusManual) d.status = statusSugerido(d.checklist);
    const itensOpt = '<option value="">— item —</option>' + O.itens.map((it) => '<option value="' + it.k + '">' + it.ic + " " + esc(it.t) + "</option>").join("");
    const feitas = siteDe(p).aplicacoes || {};
    const y = window.scrollY;

    app.innerHTML = topo((cid ? "Editar vistoria · " : "Nova vistoria · ") + p, "#/pivo/" + p) +
      '<main class="pag form">' + cabecalhoPivo(p) +
      (cid ? '<div class="aviso-ed">✏️ Editando a vistoria de ' + fmtAno(d.data) + '. As mudanças só valem depois de tocar em <b>Salvar alterações</b>.</div>' : "") +
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

      '<section class="cartao"><h3>🚜 Aplicação</h3><p class="nota top0">Precisa fazer alguma aplicação neste pivô? Marque só o que avaliou.</p>' +
      O.aplicacoes.map((a) => {
        const c = d.aplicacao.cats[a.k] || {}, f = feitas[a.k];
        return '<div class="ck"><div class="ck-h">' + a.ic + " " + esc(a.t) + (f && f.ultima ? ' <small class="ult">última feita ' + fmt(f.ultima) + "</small>" : "") + "</div>" +
          '<div class="niv st2"><button type="button" class="a-nao' + (c.precisa === "nao" ? " on" : "") + '" data-act="apl" data-k="' + a.k + '" data-v="nao">Não precisa</button>' +
          '<button type="button" class="a-sim' + (c.precisa === "sim" ? " on" : "") + '" data-act="apl" data-k="' + a.k + '" data-v="sim">Precisa aplicar</button></div>' +
          (c.precisa === "sim" ? '<div class="ck-det"><input data-f="aplobs" data-k="' + a.k + '" value="' + esc(c.obs || "") + '" placeholder="Qual produto / alvo / prazo?"></div>' : "") +
          "</div>";
      }).join("") +
      '<textarea data-f="aplgeral" rows="2" placeholder="Observação geral da aplicação (opcional)">' + esc(d.aplicacao.obs || "") + "</textarea></section>" +

      '<section class="cartao"><h3>Fotos (' + d.fotos.length + ")</h3>" +
      '<div class="foto-btns"><label class="btn sec">📷 Tirar foto<input id="inCam" type="file" accept="image/*" capture="environment" hidden></label>' +
      '<label class="btn sec">🖼️ Da galeria<input id="inGal" type="file" accept="image/*" multiple hidden></label></div>' +
      d.fotos.map((f, i) => '<div class="foto-ed">' + imgFoto(f, false) +
        '<div class="foto-campos"><textarea data-f="fobs" data-i="' + i + '" rows="2" placeholder="Observação da foto">' + esc(f.observacao || "") + "</textarea>" +
        '<select data-f="fitem" data-i="' + i + '">' + itensOpt.replace('value="' + (f.item || "") + '"', 'value="' + (f.item || "") + '" selected') + "</select>" +
        '<div class="foto-rod">' + (f.lat != null ? "📍 GPS ok" : "📍 sem GPS") + ' <button type="button" class="link perigo" data-act="rmfoto" data-i="' + i + '">remover</button></div></div></div>').join("") +
      "</section>" +

      '<section class="cartao"><h3>Status geral do pivô</h3><div class="niv st3">' +
      Object.entries(O.status).map(([kk, s]) => '<button type="button" class="s-' + kk + (d.status === kk ? " on" : "") + '" data-act="status" data-v="' + kk + '">' + s.ic + " " + s.t + "</button>").join("") +
      "</div>" + (d.statusManual ? "" : '<p class="nota">Sugerido pelo maior nível marcado. Toque para mudar.</p>') + "</section>" +

      '<div class="acoes-form"><button class="btn sec" data-act="cancelar">' + (cid ? "Descartar alterações" : "Descartar") + '</button><button class="btn grande" data-act="salvar">💾 ' + (cid ? "Salvar alterações" : "Salvar vistoria") + "</button></div>" +
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
      if (g) d.fotos.forEach((f) => { if (f.lat == null && !f.existente) { f.lat = g.lat; f.lng = g.lng; } });
      telaForm(p, cid);
    };
    $("#inCam").addEventListener("change", addFotos);
    $("#inGal").addEventListener("change", addFotos);
    carregarImagens();
  }

  async function salvarVistoria(p, cid) {
    const k = chaveDraft(p, cid), d = S.drafts[k]; if (!d) return;
    const pv = S.pivos[p];
    const temAlgo = d.estadio || Object.keys(d.checklist).length || d.anamnese.trim() || d.fotos.length || aplPreenchida(d.aplicacao);
    if (!temAlgo) { toast("Preencha pelo menos o estádio, o checklist, a anamnese, a aplicação ou uma foto", "erro"); return; }
    const item = {
      client_id: d.client_id,
      autor: S.user.id,
      criado_em: d.criado_em || new Date().toISOString(),
      edicao: !!d.edicao,
      vistoria: {
        pivo: p, data: d.data || hoje(),
        // na edição, mantém a "foto" do cadastro do dia da vistoria
        safra: d.edicao ? d.safra || pv.safra || SAFRA : pv.safra || SAFRA,
        variedade: d.edicao ? d.variedade || pv.variedade : pv.variedade,
        palhada: d.edicao ? d.palhada || null : palhadaDe(p),
        estadio: d.estadio || null, status: d.status || statusSugerido(d.checklist), checklist: d.checklist,
        anamnese: d.anamnese.trim() || null, aplicacao: limparApl(d.aplicacao)
      },
      fotos: d.fotos.filter((f) => !f.existente).map((f) => ({ client_id: f.client_id, blob: f.blob, observacao: (f.observacao || "").trim() || null, item: f.item || null, lat: f.lat, lng: f.lng, enviada: !!f.enviada })),
      fotosEdit: d.fotos.filter((f) => f.existente).map((f) => ({ client_id: f.client_id, observacao: (f.observacao || "").trim() || null, item: f.item || null })),
      fotosRemover: d.fotosRemover || []
    };
    try {
      await Local.salvar(item);
    } catch (e) {
      console.error(e); toast("Erro ao guardar no celular: " + (e.message || e), "erro"); return;
    }
    descartarDraft(k);
    await carregarOutbox();
    if (cid) toast(online() ? "✓ Alterações salvas. Enviando…" : "✓ Alterações guardadas no celular. Envia quando tiver sinal.", "ok");
    else toast(online() ? "✓ Vistoria salva. Enviando…" : "✓ Vistoria guardada no celular. Envia quando tiver sinal.", "ok");
    location.hash = "#/pivo/" + p;
    sincronizar();
  }

  // ---------- relatório semanal acumulado ----------
  // Cada problema = item do checklist + cada termo do "qual" (ex.: Doenças · ferrugem-asiática).
  function termos(ck) {
    const out = {};
    O.itens.forEach((it) => {
      const c = ck && ck[it.k];
      if (!c || !c.nivel || c.nivel === "ausente") return;
      const ts = (c.qual || "").split(",").map((s) => s.trim()).filter(Boolean);
      (ts.length ? ts : [""]).forEach((t) => { out[it.k + "|" + t.toLowerCase()] = { it, termo: t, nivel: c.nivel }; });
    });
    return out;
  }
  function marcar(cur, prev, primeiro, w) {
    return Object.entries(cur).map(([k, t]) => {
      const f = primeiro[k], novo = f && segunda(f.data) === w;
      const pn = prev && prev[k] ? NIV[prev[k].nivel] : 0, cn = NIV[t.nivel];
      return Object.assign({ k, desde: f, tend: novo ? "★" : cn > pn ? "▲" : cn < pn ? "▼" : "=" }, t);
    });
  }
  function semanasAte(sel, VS) {
    let ini = sel;
    Object.values(VS).forEach((vs) => vs.forEach((v) => { const w = segunda(v.data); if (w < ini) ini = w; }));
    const out = [];
    for (let w = ini; w <= sel; w = addDias(w, 7)) out.push(w);
    return out;
  }
  function historicoPivo(vsTodas, sel, semanas) {
    const fim = addDias(sel, 6);
    const vs = vsTodas.filter((v) => v.data <= fim); // mais recente primeiro
    const primeiro = {};
    vs.slice().reverse().forEach((v) => Object.keys(termos(v.checklist)).forEach((k) => { if (!primeiro[k]) primeiro[k] = { data: v.data, autor: v.autor }; }));
    const porSem = {};
    vs.forEach((v) => { const w = segunda(v.data); (porSem[w] = porSem[w] || []).push(v); });
    let prev = null;
    const linhas = semanas.map((w) => {
      const lista = porSem[w];
      if (!lista) return { w, vazio: true };
      const ult = lista[0], cur = termos(ult.checklist);
      const sumiu = prev ? Object.entries(prev).filter(([k]) => !cur[k]).map(([k, t]) => Object.assign({ k }, t)) : [];
      const l = {
        w, lista, ult, cur, sumiu, marcas: marcar(cur, prev, primeiro, w),
        estadio: (lista.find((x) => x.estadio) || {}).estadio || "",
        apl: (lista.find((x) => aplPreenchida(x.aplicacao)) || {}).aplicacao || null
      };
      prev = cur;
      return l;
    });
    return { linhas, primeiro, temAlgo: vs.length > 0 };
  }
  const nivS = (n) => (O.niveis.find((x) => x.k === n) || {}).s || "";
  const nomeProb = (m) => m.it.ic + " " + esc(m.termo || m.it.t);
  const tendTxt = { "★": "novo", "▲": "piorou", "▼": "melhorou", "=": "igual" };

  function blocoRelatorio(p, h, sel) {
    const pv = S.pivos[p], s = siteDe(p), L = h.linhas[h.linhas.length - 1];
    const pal = palhadaDe(p);
    let x = '<section class="rel-pivo"><div class="rel-cab"><span class="bolinha" style="background:' + corVar(pv.variedade) + '"></span><b>' + p + "</b> · " + esc(pv.variedade) +
      (s.gm ? " · GM " + esc(s.gm) : "") + " · " + esc(pal || "palhada não informada") + " · " + (pv.area ? mil(pv.area) + " ha" : "") + "</div>" +
      '<div class="rel-sub">Plantio ' + fmt(pv.plantio) + " · emergência " + fmt(s.emergencia) + " · pl/ha planejadas " + mil(s.estandePlanejado) + " · estande final " + estandeTxt(s) + "</div>";
    if (!L || L.vazio) x += '<p class="rel-sem">— sem vistoria nesta semana —</p>';
    else {
      L.lista.forEach((v, i) => {
        const dae = s.emergencia ? dias(s.emergencia, v.data) + " DAE" : "";
        x += '<div class="rel-vist"><div class="v-l1"><b>' + fmtAno(v.data) + "</b>" + (v.estadio ? ' <span class="estadio">' + esc(v.estadio) + "</span>" : "") + (dae ? ' <span class="dae">' + dae + "</span>" : "") + " " + chipStatus(v.status) +
          ' <span class="v-aut">por ' + esc(nomeAutor(v.autor)) + (v._pendente ? " · ⏳ ainda no celular" : "") + (foiEditada(v) ? " · editada" : "") + "</span></div>";
        if (i === 0) {
          x += '<div class="pbs">' + (L.marcas.length ? L.marcas.map((m) => '<span class="pb pb-' + m.nivel + '">' + nomeProb(m) + " (" + nivS(m.nivel) + ") " +
            '<b class="tend" title="' + tendTxt[m.tend] + '">' + m.tend + "</b>" + (m.desde ? ' <small>desde ' + fmt(m.desde.data) + (m.tend === "★" ? " · " + esc(nomeAutor(m.desde.autor)) : "") + "</small>" : "") + "</span>").join("") : '<span class="pb pb-ausente">Nada relevante marcado</span>') + "</div>";
          if (L.sumiu.length) x += '<p class="nota">✓ Não visto mais nesta semana: ' + L.sumiu.map(nomeProb).join(", ") + "</p>";
        } else x += '<div class="pbs">' + (problemas(v.checklist) || '<span class="pb pb-ausente">Nada relevante marcado</span>') + "</div>";
        if (v.anamnese) x += '<p class="anam">' + esc(v.anamnese).replace(/\n/g, "<br>") + "</p>";
        x += aplHTML(v.aplicacao);
        x += "</div>";
      });
      const fotos = [].concat(...L.lista.map((v) => v._fotos)).slice(0, 6);
      if (fotos.length) x += '<div class="thumbs rel-fotos">' + fotos.map((f) => "<figure>" + imgFoto(f, false) + (f.observacao ? "<figcaption>" + esc(f.observacao) + "</figcaption>" : "") + "</figure>").join("") + "</div>";
    }
    // histórico acumulado (uma linha por semana)
    x += '<div class="tab-rol"><table class="tab-hist"><thead><tr><th>Semana</th><th>Estádio</th><th>Problemas</th><th>Aplic.</th><th>Status</th><th>Autor</th></tr></thead><tbody>' +
      h.linhas.map((l) => {
        if (l.vazio) return '<tr class="' + (l.w === sel ? "atual " : "") + 'vazia"><td>' + rotuloSemana(l.w) + '</td><td colspan="5">— sem vistoria —</td></tr>';
        const pr = l.marcas.length ? l.marcas.map((m) => nomeProb(m) + " (" + nivS(m.nivel) + ")" + (m.tend !== "=" ? " " + m.tend : "")).join("; ") : "—";
        const ap = l.apl ? (aplSim(l.apl).map((a) => a.ic).join(" ") || "não") : "—";
        const aut = [...new Set(l.lista.map((v) => nomeAutor(v.autor).split(" ")[0]))].join(", ");
        return '<tr class="' + (l.w === sel ? "atual" : "") + '"><td>' + rotuloSemana(l.w) + "</td><td>" + esc(l.estadio || "—") + "</td><td>" + pr + "</td><td>" + ap + "</td><td>" + (l.ult.status ? O.status[l.ult.status].ic : "—") + "</td><td>" + esc(aut) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return x + "</section>";
  }

  function telaRelatorio(selArg, filtro) {
    const semAtual = segunda(hoje());
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(selArg || "") ? segunda(selArg) : semAtual;
    if (filtro && !S.pivos[filtro]) filtro = null;
    const todos = pivosSoja();
    const lista = filtro ? [filtro] : todos;
    const VS = Object.fromEntries(todos.map((p) => [p, vistoriasDe(p)]));
    const semanas = semanasAte(sel, VS);
    const H = Object.fromEntries(lista.map((p) => [p, historicoPivo(VS[p], sel, semanas)]));

    let feitos = 0, pend = 0; const cont = { ok: 0, atencao: 0, problema: 0 };
    const semVist = [], nunca = [], novos = [], piora = [], melhora = [];
    const apl = Object.fromEntries(O.aplicacoes.map((a) => [a.k, []]));
    lista.forEach((p) => {
      const h = H[p], L = h.linhas[h.linhas.length - 1];
      if (!h.temAlgo) nunca.push(p);
      if (!L || L.vazio) { semVist.push(p); return; }
      feitos++;
      pend += L.lista.filter((v) => v._pendente).length;
      if (L.ult.status) cont[L.ult.status]++;
      L.marcas.forEach((m) => { if (m.tend === "★") novos.push([p, m]); else if (m.tend === "▲") piora.push([p, m]); else if (m.tend === "▼") melhora.push([p, m]); });
      L.sumiu.forEach((m) => melhora.push([p, Object.assign({}, m, { tend: "✓" })]));
      if (L.apl) aplSim(L.apl).forEach((a) => apl[a.k].push([p, L.apl.cats[a.k].obs]));
    });
    const linhaProb = ([p, m]) => "<li><b>" + p + "</b> · " + nomeProb(m) + (m.tend === "✓" ? " (não visto mais)" : " (" + nivS(m.nivel) + ")") +
      (m.tend === "★" && m.desde ? " — 1º registro em " + fmt(m.desde.data) + ", por " + esc(nomeAutor(m.desde.autor)) : "") + "</li>";
    const listaOu = (arr, f, vazio) => (arr.length ? "<ul>" + arr.map(f).join("") + "</ul>" : '<p class="nota">' + vazio + "</p>");
    const aplTxt = O.aplicacoes.filter((a) => apl[a.k].length).map((a) => "<li>" + a.ic + " <b>" + esc(a.t) + ":</b> " + apl[a.k].map(([p, o]) => p + (o ? " (" + esc(o) + ")" : "")).join(", ") + "</li>");

    const opcoes = '<option value="">Todos os pivôs</option>' + todos.map((p) => '<option value="' + p + '"' + (p === filtro ? " selected" : "") + ">" + p + " · " + esc(S.pivos[p].variedade) + "</option>").join("");
    const base = "#/relatorio/";
    const suf = filtro ? "/" + filtro : "";
    const geradoEm = new Date().toLocaleString("pt-BR");
    document.title = "Relatório semanal · Sede V";

    let corpo =
      '<div class="cartao nao-imprimir rel-ctrl">' +
      '<div class="rel-nav"><a class="btn sec" href="' + base + addDias(sel, -7) + suf + '">‹</a><b>Semana ' + rotuloSemana(sel) + "/" + parseD(sel).getFullYear() + "</b>" +
      (sel < semAtual ? '<a class="btn sec" href="' + base + addDias(sel, 7) + suf + '">›</a>' : '<span class="btn sec off">›</span>') + "</div>" +
      '<select id="relPivo">' + opcoes + "</select>" +
      '<button class="btn grande" data-act="pdf">⬇️ Baixar PDF</button>' +
      '<p class="nota">O relatório é montado na hora com os dados mais recentes: toda vistoria nova ou editada já entra aqui e no PDF. No celular, escolha <b>Salvar como PDF</b> na tela que abrir.</p></div>' +

      '<div id="rel"><header class="rel-topo"><h1>Relatório semanal acumulado · Sede V</h1>' +
      "<p>" + esc(SAFRA) + " · Semana " + rotuloSemana(sel) + "/" + parseD(sel).getFullYear() + (filtro ? " · " + filtro : " · " + lista.length + " pivôs") + "</p>" +
      '<p class="nota top0">Gerado em ' + geradoEm + " por " + esc(S.user.nome) + (S.cacheEm ? " · dados do servidor de " + new Date(S.cacheEm).toLocaleString("pt-BR") : "") +
      (SITE.origemData ? " · estande e GM da planilha de " + fmtAno(SITE.origemData) : "") + "</p>" +
      (pend ? '<p class="aviso-ed">⏳ ' + pend + " vistoria(s) desta semana ainda estão no celular, sem enviar. Já aparecem aqui.</p>" : "") + "</header>" +

      '<section class="rel-resumo"><h2>1. Resumo da semana</h2>' +
      '<div class="rel-kpis"><div><b>' + feitos + "/" + lista.length + "</b><small>vistoriados</small></div><div><b>🟢 " + cont.ok + "</b><small>OK</small></div><div><b>🟡 " + cont.atencao + "</b><small>Atenção</small></div><div><b>🔴 " + cont.problema + "</b><small>Problema</small></div></div>" +
      "<h3>★ Problemas novos</h3>" + listaOu(novos, linhaProb, "Nenhum problema novo nesta semana.") +
      "<h3>▲ Pioraram</h3>" + listaOu(piora, linhaProb, "Nada piorou em relação à semana anterior.") +
      "<h3>▼ Melhoraram</h3>" + listaOu(melhora, linhaProb, "Nada melhorou em relação à semana anterior.") +
      "<h3>🚜 Aplicações indicadas</h3>" + (aplTxt.length ? "<ul>" + aplTxt.join("") + "</ul>" : '<p class="nota">Nenhuma aplicação indicada nas vistorias desta semana.</p>') +
      (semVist.length ? "<h3>Sem vistoria nesta semana</h3><p>" + semVist.join(", ") + "</p>" : "") +
      "</section>" +

      '<h2 class="rel-h2">2. Por pivô</h2>';
    const comDados = lista.filter((p) => H[p].temAlgo || filtro);
    comDados.forEach((p) => { corpo += blocoRelatorio(p, H[p], sel); });
    if (!filtro && nunca.length) corpo += '<p class="nota">Ainda sem nenhuma vistoria: ' + nunca.join(", ") + ".</p>";
    if (!comDados.length) corpo += '<div class="vazio-msg">Nenhuma vistoria lançada até esta semana.</div>';
    corpo += '<p class="nota rel-leg">★ 1º registro do problema · ▲ piorou · ▼ melhorou · = igual à semana anterior · ✓ não visto mais · B/M/A = nível baixo, médio, alto · 🚜 aplicação indicada · % do estande = estande final ÷ pl/ha planejadas</p></div>';

    app.innerHTML = topo("Relatório semanal", filtro ? "#/pivo/" + filtro : "#/") + '<main class="pag rel">' + corpo + "</main>";
    const s = $("#relPivo");
    if (s) s.addEventListener("change", () => { location.hash = base + sel + (s.value ? "/" + s.value : ""); });
    app.dataset.pdf = "Relatorio_SedeV_" + sel + (filtro ? "_" + filtro : "");
    carregarImagens();
  }

  async function baixarPDF() {
    toast("Preparando o PDF…");
    await carregarImagens();
    const pendentes = $$("#rel img").filter((i) => i.getAttribute("src") && !i.complete);
    await Promise.all(pendentes.map((i) => new Promise((ok) => { i.addEventListener("load", ok, { once: true }); i.addEventListener("error", ok, { once: true }); setTimeout(ok, 8000); })));
    const t = document.title;
    document.title = app.dataset.pdf || "Relatorio_SedeV";
    window.print();
    setTimeout(() => { document.title = t; }, 1500);
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
    const r = draftDaRota();
    const d = r && r.d;
    const re = () => telaForm(r.p, r.cid);
    switch (act) {
      case "sync": sincronizar(true); break;
      case "view": S.view = el.dataset.v; LS.set("mon.view", S.view); telaInicio(); break;
      case "abrir": location.hash = "#/pivo/" + el.dataset.p; break;
      case "sair": sair(); break;
      case "foto": verFoto(el); break;
      case "pdf": el.disabled = true; await baixarPDF(); el.disabled = false; break;
      case "estadio": if (d) { d.estadio = d.estadio === el.dataset.v ? "" : el.dataset.v; re(); } break;
      case "nivel":
        if (d) {
          const k = el.dataset.k, c = d.checklist[k] || (d.checklist[k] = { nivel: "", qual: "" });
          if (c.nivel === el.dataset.v) delete d.checklist[k]; else c.nivel = el.dataset.v;
          re();
        }
        break;
      case "sug":
        if (d) {
          const c = d.checklist[el.dataset.k]; if (!c) break;
          const lista = (c.qual || "").split(",").map((s) => s.trim()).filter(Boolean);
          const i = lista.findIndex((s) => s.toLowerCase() === el.dataset.v.toLowerCase());
          if (i >= 0) lista.splice(i, 1); else lista.push(el.dataset.v);
          c.qual = lista.join(", ");
          re();
        }
        break;
      case "apl":
        if (d) {
          const k = el.dataset.k, cats = d.aplicacao.cats, c = cats[k] || (cats[k] = { precisa: "", obs: "" });
          if (c.precisa === el.dataset.v) delete cats[k]; else c.precisa = el.dataset.v;
          re();
        }
        break;
      case "status": if (d) { d.status = el.dataset.v; d.statusManual = true; re(); } break;
      case "rmfoto":
        if (d) {
          const f = d.fotos.splice(Number(el.dataset.i), 1)[0];
          if (f && f.existente) d.fotosRemover.push({ client_id: f.client_id, caminho: f.caminho });
          else if (f && f.enviada) d.fotosRemover.push({ client_id: f.client_id, caminho: null });
          if (f && !f.existente && f._url) URL.revokeObjectURL(f._url);
          re();
        }
        break;
      case "cancelar": {
        if (!r) break;
        const mexeu = d && (d.fotos.length || d.anamnese || Object.keys(d.checklist).length || aplPreenchida(d.aplicacao));
        if (d && mexeu && !confirm(r.cid ? "Descartar as alterações desta vistoria?" : "Descartar esta vistoria?")) break;
        descartarDraft(chaveDraft(r.p, r.cid));
        location.hash = "#/pivo/" + r.p;
        break;
      }
      case "salvar": if (r) { el.disabled = true; await salvarVistoria(r.p, r.cid); el.disabled = false; } break;
      case "editar": location.hash = "#/pivo/" + p + "/editar/" + encodeURIComponent(el.dataset.cid); break;
      case "apagar": {
        if (!confirm("Apagar esta vistoria e as fotos dela? Não dá para desfazer.")) break;
        const cid = el.dataset.cid;
        const it = S.outbox.find((x) => x.client_id === cid);
        const srv = S.vistorias.find((x) => x.client_id === cid);
        if (srv && !online()) { toast("Precisa de sinal para apagar uma vistoria já enviada", "erro"); break; }
        if (it) { await Local.apagar(cid); await carregarOutbox(); }
        if (srv) {
          const fs = S.fotos.filter((f) => f.vistoria_id === srv.id).map((f) => f.caminho);
          if (fs.length) await sb.storage.from("fotos").remove(fs);
          const rd = await sb.from("vistorias").delete().eq("id", srv.id);
          if (rd.error) { toast("Erro ao apagar: " + rd.error.message, "erro"); break; }
          S.vistorias = S.vistorias.filter((v) => v.id !== srv.id);
          S.fotos = S.fotos.filter((f) => f.vistoria_id !== srv.id);
        }
        descartarDraft(chaveDraft(p, cid));
        rota(); toast("Apagada"); atualizar();
        break;
      }
    }
  });

  app.addEventListener("input", (ev) => {
    const el = ev.target, f = el.dataset && el.dataset.f;
    if (!f) return;
    const r = draftDaRota(), d = r && r.d;
    if (!d) return;
    if (f === "data") d.data = el.value;
    else if (f === "anamnese") d.anamnese = el.value;
    else if (f === "qual") { const c = d.checklist[el.dataset.k]; if (c) c.qual = el.value; }
    else if (f === "aplobs") { const c = d.aplicacao.cats[el.dataset.k]; if (c) c.obs = el.value; }
    else if (f === "aplgeral") d.aplicacao.obs = el.value;
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
    if (partes[0] === "relatorio") return telaRelatorio(partes[1], partes[2]);
    if (partes[0] === "pivo" && S.pivos[partes[1]]) {
      if (partes[2] === "nova") return telaForm(partes[1], null);
      if (partes[2] === "editar" && partes[3]) return telaForm(partes[1], decodeURIComponent(partes[3]));
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
