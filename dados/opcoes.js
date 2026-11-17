// Opções da ficha de vistoria (editável: acrescente sugestões à vontade).
window.APP_OPCOES = {
  estadios: ["VE", "VC", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9+", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"],
  niveis: [
    { k: "ausente", t: "Ausente", s: "—" },
    { k: "baixo",   t: "Baixo",   s: "B" },
    { k: "medio",   t: "Médio",   s: "M" },
    { k: "alto",    t: "Alto",    s: "A" }
  ],
  itens: [
    { k: "tiguera",     t: "Tiguera",                 ic: "🌽", sug: ["milho", "algodão", "trigo", "soja"] },
    { k: "soqueira",    t: "Soqueira",                ic: "🌿", sug: ["rebrota de algodão", "outra cultura"] },
    { k: "pragas",      t: "Pragas",                  ic: "🐛", sug: ["falsa-medideira", "Helicoverpa", "Spodoptera", "percevejo-marrom", "percevejo barriga-verde", "mosca-branca", "tripes", "ácaro", "vaquinha", "cigarrinha"] },
    { k: "daninhas",    t: "Plantas daninhas",        ic: "🌾", sug: ["buva", "capim-amargoso", "pé-de-galinha", "caruru", "trapoeraba", "leiteiro", "corda-de-viola"] },
    { k: "doencas",     t: "Doenças",                 ic: "🍂", sug: ["ferrugem-asiática", "mancha-alvo", "antracnose", "oídio", "mofo-branco", "crestamento foliar", "podridões"] },
    { k: "deficiencia", t: "Deficiência nutricional", ic: "🧪", sug: ["N", "P", "K", "S", "Mn", "Mo", "B", "Zn", "Ca", "Mg"] },
    { k: "outros",      t: "Outros",                  ic: "⚠️", sug: ["estande falho", "encharcamento", "falha de irrigação", "fitotoxidez", "granizo"] }
  ],
  // Indicação de aplicação por pivô (preenchida na vistoria)
  aplicacoes: [
    { k: "fungicida",      t: "Fungicida",               ic: "🍄" },
    { k: "inseticida",     t: "Inseticida",              ic: "🐛" },
    { k: "herbicida",      t: "Herbicida",               ic: "🌿" },
    { k: "microbiologico", t: "Microbiológicos",         ic: "🦠" },
    { k: "nutricao",       t: "Macro e micronutrientes", ic: "🧪" }
  ],
  palhadas: ["Palhada de trigo", "Soqueira de algodão", "Palhada de milho", "Pousio"],
  status: {
    ok:       { t: "OK",       ic: "🟢" },
    atencao:  { t: "Atenção",  ic: "🟡" },
    problema: { t: "Problema", ic: "🔴" }
  }
};
