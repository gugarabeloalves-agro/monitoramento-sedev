// Layout esquemático da Sede V (copiado de Painel_Safra/mapa.js; não é em escala).
// Linha 0 = norte (Rio Guará). null = espaço vazio.
window.APP_MAPA = {
  linhas: [
    ["PV532", "PV533", "PV534", "PV535", "PV536", "PV537"],
    ["PV531", "PV530", "PV529", "PV528", "PV527", "PV526"],
    ["PV520", "PV521", "PV522", "PV523", "PV524", "PV525"],
    ["PV515", "PV514", "PV513", "PV512", "PV511", "PV510"],
    ["PV516", "PV517", "PV518", "PV507", "PV508", "PV509"],
    [null, null, null, "PV506", "PV505", "PV504"],
    [null, null, null, "PV501", "PV502", "PV503"]
  ],
  estradaDepoisDaLinha: 2,
  estradaRotulo: "BR-020 · Sede I ⟷ outras fazendas",
  rioRotulo: "Rio Guará (norte)",
  sede: { linha: 6, coluna: 2, rotulo: "Sede V" },
  ordemPlantio: ["PV521", "PV520", "PV531", "PV530", "PV529", "PV528", "PV527", "PV526", "PV525", "PV524", "PV523", "PV522", "PV513", "PV518",
                 "PV517", "PV514", "PV506", "PV505", "PV504", "PV503", "PV502", "PV501", "PV507", "PV508", "PV509", "PV510", "PV511", "PV512"],
  // cores da legenda do Caderno de plantio
  coresVariedade: { "BMX CRUZADA CE": "#2e9d4a", "BMX GUEPARDO IPRO": "#e3b505", "BMX OLIMPO IPRO": "#e05aa0", "M 6930 I2X": "#1fb5c9" }
};
