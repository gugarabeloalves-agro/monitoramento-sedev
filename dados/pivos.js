// App de Monitoramento — cadastro dos 28 pivôs da Sede V (Soja 26/27).
// Fonte: Painel_Safra/dados_planilha.js (planilha de 04/11/2026) + mapa.js (ordem de plantio).
// "palhada" = cultura anterior / cobertura (ex.: "Palhada de trigo", "Soqueira de algodão").
//   null = ainda não informado → preencher (Gustavo informa ou edita no app).
window.APP_SAFRA = "Soja 26/27";
window.APP_PIVOS = [
  { pivo: "PV501", variedade: "M 6930 I2X",        area: 109.35, plantio: "2026-10-06", ciclo: 100, colheita: "2027-01-20", palhada: null },
  { pivo: "PV502", variedade: "M 6930 I2X",        area: 109.54, plantio: "2026-10-06", ciclo: 100, colheita: "2027-01-21", palhada: null },
  { pivo: "PV503", variedade: "BMX OLIMPO IPRO",   area: 108.47, plantio: "2026-10-07", ciclo: 112, colheita: "2027-02-02", palhada: null },
  { pivo: "PV504", variedade: "BMX OLIMPO IPRO",   area: 109.42, plantio: "2026-10-07", ciclo: 112, colheita: "2027-02-02", palhada: null },
  { pivo: "PV505", variedade: "BMX OLIMPO IPRO",   area: 108.38, plantio: "2026-10-08", ciclo: 112, colheita: "2027-02-03", palhada: null },
  { pivo: "PV506", variedade: "BMX OLIMPO IPRO",   area: 109.36, plantio: "2026-10-07", ciclo: 112, colheita: "2027-02-02", palhada: null },
  { pivo: "PV507", variedade: "BMX GUEPARDO IPRO", area: 109.01, plantio: "2026-10-07", ciclo: 100, colheita: "2027-01-22", palhada: null },
  { pivo: "PV508", variedade: "BMX GUEPARDO IPRO", area: 109.26, plantio: "2026-10-07", ciclo: 100, colheita: "2027-01-22", palhada: null },
  { pivo: "PV509", variedade: "BMX GUEPARDO IPRO", area: 108.95, plantio: "2026-10-08", ciclo: 100, colheita: "2027-01-23", palhada: null },
  { pivo: "PV510", variedade: "BMX GUEPARDO IPRO", area: 108.71, plantio: "2026-10-08", ciclo: 100, colheita: "2027-01-23", palhada: null },
  { pivo: "PV511", variedade: "BMX GUEPARDO IPRO", area: 108.71, plantio: "2026-10-08", ciclo: 100, colheita: "2027-01-23", palhada: null },
  { pivo: "PV512", variedade: "BMX GUEPARDO IPRO", area: 108.31, plantio: "2026-10-09", ciclo: 100, colheita: "2027-01-24", palhada: null },
  { pivo: "PV513", variedade: "BMX CRUZADA CE",    area: 109.18, plantio: "2026-10-05", ciclo: 108, colheita: "2027-01-28", palhada: null },
  { pivo: "PV514", variedade: "BMX CRUZADA CE",    area: 108.49, plantio: "2026-10-06", ciclo: 108, colheita: "2027-01-29", palhada: null },
  { pivo: "PV517", variedade: "BMX CRUZADA CE",    area: 109.48, plantio: "2026-10-06", ciclo: 108, colheita: "2027-01-30", palhada: null },
  { pivo: "PV518", variedade: "BMX CRUZADA CE",    area: 108.90, plantio: "2026-10-06", ciclo: 108, colheita: "2027-01-29", palhada: null },
  { pivo: "PV520", variedade: "BMX CRUZADA CE",    area: 108.78, plantio: "2026-09-23", ciclo: 108, colheita: "2027-01-21", palhada: null },
  { pivo: "PV521", variedade: "BMX CRUZADA CE",    area: 108.15, plantio: "2026-09-22", ciclo: 108, colheita: "2027-01-18", palhada: null },
  { pivo: "PV522", variedade: "BMX CRUZADA CE",    area: 109.28, plantio: "2026-10-05", ciclo: 108, colheita: "2027-01-28", palhada: null },
  { pivo: "PV523", variedade: "BMX CRUZADA CE",    area: 109.07, plantio: "2026-10-03", ciclo: 108, colheita: "2027-01-27", palhada: null },
  { pivo: "PV524", variedade: "BMX CRUZADA CE",    area: 108.51, plantio: "2026-10-02", ciclo: 108, colheita: "2027-01-25", palhada: null },
  { pivo: "PV525", variedade: "BMX CRUZADA CE",    area: 108.91, plantio: "2026-10-01", ciclo: 108, colheita: "2027-01-27", palhada: null },
  { pivo: "PV526", variedade: "BMX CRUZADA CE",    area: 108.96, plantio: "2026-10-01", ciclo: 108, colheita: "2027-01-23", palhada: null },
  { pivo: "PV527", variedade: "BMX CRUZADA CE",    area: 109.01, plantio: "2026-09-30", ciclo: 108, colheita: "2027-01-23", palhada: null },
  { pivo: "PV528", variedade: "BMX CRUZADA CE",    area: 109.21, plantio: "2026-09-30", ciclo: 108, colheita: "2027-01-23", palhada: null },
  { pivo: "PV529", variedade: "BMX CRUZADA CE",    area: 108.81, plantio: "2026-09-30", ciclo: 108, colheita: "2027-01-22", palhada: null },
  { pivo: "PV530", variedade: "BMX CRUZADA CE",    area: 108.71, plantio: "2026-09-29", ciclo: 108, colheita: "2027-01-22", palhada: null },
  { pivo: "PV531", variedade: "BMX CRUZADA CE",    area: 108.94, plantio: "2026-09-28", ciclo: 108, colheita: "2027-01-22", palhada: null }
];
