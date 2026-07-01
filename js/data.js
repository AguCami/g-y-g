/* ============================================================
   Genios y Gigantes — Datos del juego
   (herencias, gobiernos, religiones, maravillas)
   ============================================================ */
window.GG = window.GG || {};

/* Pilares: orden fijo usado en todo el juego */
GG.PILLARS = [
  { key: "ciencia",  name: "Ciencia",  icon: "🧪", color: "#3a7d44" },
  { key: "cultura",  name: "Cultura",  icon: "📖", color: "#2b5d9e" },
  { key: "libertad", name: "Libertad", icon: "🕊️", color: "#8a8f98" },
  { key: "poder",    name: "Poder",    icon: "👑", color: "#9e2b2b" },
];
GG.MAX_PILLAR = 12;

/* Recursos */
GG.RESOURCES = [
  { key: "oro",       name: "Oro",       img: "Screenshot_52.png", emoji: "🪙" },
  { key: "alimentos", name: "Alimentos", img: "Screenshot_50.png", emoji: "🍖" },
  { key: "piedra",    name: "Piedra",    img: "Screenshot_51.png", emoji: "🪨" },
  { key: "armas",     name: "Armas",     img: "Screenshot_53.png", emoji: "⚔️" },
];

GG.PLAYER_COLORS = [
  { key: "rojo",     name: "Rojo",     hex: "#c0392b" },
  { key: "azul",     name: "Azul",     hex: "#2c6fbb" },
  { key: "verde",    name: "Verde",    hex: "#27924f" },
  { key: "amarillo", name: "Amarillo", hex: "#d4a017" },
];

/* ---------------- HERENCIAS (8 pueblos) ---------------- */
GG.HERITAGES = [
  { id: "aurelianos", pueblo: "Aurelianos", herencia: "Imperial",    insp: "Roma",           pillars: { ciencia:1, cultura:1, libertad:1, poder:3 }, frase: "Su legado se construyó sobre la disciplina, la ley y la expansión." },
  { id: "talasios",   pueblo: "Talasios",   herencia: "Mercantil",   insp: "Fenicios",       pillars: { ciencia:2, cultura:1, libertad:2, poder:1 }, frase: "Navegaron más allá del horizonte cuando otros aún temían al mar." },
  { id: "nordviks",   pueblo: "Nordviks",   herencia: "Guerrera",    insp: "Vikingos",       pillars: { ciencia:1, cultura:1, libertad:0, poder:4 }, frase: "La gloria se conquista con acero, audacia y determinación." },
  { id: "zahiries",   pueblo: "Zahiríes",   herencia: "Académica",   insp: "Califato Abasí", pillars: { ciencia:3, cultura:2, libertad:1, poder:0 }, frase: "Los sabios son tan valiosos como los reyes." },
  { id: "heliacos",   pueblo: "Helíacos",   herencia: "Republicana", insp: "Atenas",         pillars: { ciencia:1, cultura:1, libertad:3, poder:1 }, frase: "La voz del ciudadano es el fundamento del Estado." },
  { id: "xianren",    pueblo: "Xianren",    herencia: "Artística",   insp: "China Imperial", pillars: { ciencia:1, cultura:4, libertad:1, poder:0 }, frase: "La armonía y la belleza sobreviven a los imperios." },
  { id: "vedaranos",  pueblo: "Vedaranos",  herencia: "Espiritual",  insp: "India",          pillars: { ciencia:1, cultura:2, libertad:0, poder:3 }, frase: "Toda sociedad florece cuando encuentra un propósito superior." },
  { id: "tonaltecas", pueblo: "Tonaltecas", herencia: "Pionera",     insp: "Aztecas",        pillars: { ciencia:2, cultura:0, libertad:3, poder:1 }, frase: "La grandeza pertenece a quienes se atreven a fundar un nuevo mundo." },
];

/* ---------------- GOBIERNOS (8) ---------------- */
GG.GOVERNMENTS = [
  { id: "monarquia",     name: "Monarquía",     mods: { ciencia:0,  cultura:1, libertad:-1, poder:2  }, evoca: "Reinos tradicionales" },
  { id: "republica",     name: "República",     mods: { ciencia:0,  cultura:1, libertad:2,  poder:-1 }, evoca: "Atenas, ciudades-estado" },
  { id: "imperio",       name: "Imperio",       mods: { ciencia:1,  cultura:0, libertad:-1, poder:2  }, evoca: "Roma, Persia" },
  { id: "teocracia",     name: "Teocracia",     mods: { ciencia:-1, cultura:2, libertad:0,  poder:1  }, evoca: "Estados religiosos" },
  { id: "meritocracia",  name: "Meritocracia",  mods: { ciencia:3,  cultura:0, libertad:0,  poder:-1 }, evoca: "Administración de funcionarios" },
  { id: "confederacion", name: "Confederación", mods: { ciencia:1,  cultura:0, libertad:2,  poder:-1 }, evoca: "Uniones de ciudades o regiones autónomas" },
  { id: "oligarquia",    name: "Oligarquía",    mods: { ciencia:1,  cultura:2, libertad:-1, poder:0  }, evoca: "Élites económicas" },
  { id: "dictadura",     name: "Dictadura",     mods: { ciencia:0,  cultura:0, libertad:-1, poder:3  }, evoca: "Regímenes autoritarios modernos" },
];

/* ---------------- RELIGIONES (8) ---------------- */
GG.RELIGIONS = [
  { id: "culto_solar",  name: "Culto Solar",         icon: "☀️", mods: { ciencia:-1, cultura:3,  libertad:0,  poder:-1 }, enfoque: "Cultura radical" },
  { id: "armonia",      name: "Camino de la Armonía",icon: "☯️", mods: { ciencia:0,  cultura:-1, libertad:3,  poder:-1 }, enfoque: "Libertad radical" },
  { id: "sabios",       name: "Orden de los Sabios", icon: "📚", mods: { ciencia:3,  cultura:0,  libertad:-1, poder:-1 }, enfoque: "Ciencia radical" },
  { id: "soberano",     name: "Culto al Soberano",   icon: "👑", mods: { ciencia:-1, cultura:0,  libertad:-1, poder:3  }, enfoque: "Poder radical" },
  { id: "profetas",     name: "Fe de los Profetas",  icon: "📜", mods: { ciencia:-1, cultura:2,  libertad:1,  poder:-1 }, enfoque: "Cultura + Libertad" },
  { id: "bosque",       name: "Dioses del Bosque",   icon: "🌳", mods: { ciencia:-1, cultura:1,  libertad:2,  poder:-1 }, enfoque: "Libertad + Cultura" },
  { id: "fuego",        name: "Adoradores del Fuego",icon: "🔥", mods: { ciencia:2,  cultura:-1, libertad:-1, poder:1  }, enfoque: "Ciencia + Poder" },
  { id: "acero",        name: "Señores del Acero",   icon: "⚔️", mods: { ciencia:1,  cultura:-1, libertad:-1, poder:2  }, enfoque: "Poder + Ciencia" },
];

/* ---------------- MARAVILLAS ---------------- */
GG.WONDERS = [
  { id: "biblioteca",   name: "Gran Biblioteca Universal", pillars: ["ciencia", "cultura"] },
  { id: "observatorio", name: "Observatorio de los Libres", pillars: ["ciencia", "libertad"] },
  { id: "hefesto",      name: "Complejo Militar Hefesto",  pillars: ["ciencia", "poder"] },
  { id: "universidad",  name: "Universidad de los Pueblos",pillars: ["cultura", "libertad"] },
  { id: "palacio",      name: "Palacio Imperial",          pillars: ["cultura", "poder"] },
  { id: "congreso",     name: "Congreso de las Naciones",  pillars: ["libertad", "poder"] },
];

/* Constantes de reglas */
GG.RULES = {
  startResources: { oro: 3, alimentos: 5, piedra: 2, armas: 2 },
  startCohorts: 4,
  startProvinces: 2,
  cohortCost: { oro: 1, armas: 1 },
  occupyCost: { piedra: 1 },
  cityCost: { oro: 7, piedra: 7 },
  cityDiscountPillarLevel: 6,      // Ciencia y Cultura >=6 => -1 oro y -1 piedra
  maxCitiesPerPlayer: 2,
  wonderCost: { piedra: 15, oro: 12 },
  wonderBuildTurns: 6,
  wonderPillarLevel: 12,
  reformGovCost: { poder: 3, oro: 8, armas: 8 },
  pillarPaymentCost: 7,            // 7 de un recurso => +1 pilar
  siegeCityTurns: 1,
  siegeCapitalTurns: 2,
  capitalDefBonus: 3,
  cityDefBonus: 2,
  capitalProdMult: 3,
  cityProdMult: 2,
  capitalStorage: 10,
  cityStorage: 5,
  maxStorage: 20,
  capitalFood: 2,
  cityFood: 1,
  provincesPerFood: 3,             // cada 3 provincias => 1 alimento
  merchantRatio: 2,                // 2:1 con el mercader
  cultureFreeTradeLevel: 8,        // Cultura >=8 => 1:1 con mercader
};

/* Pilar que sube al pagar 7 de un recurso */
GG.PILLAR_BY_PAYMENT = {
  armas: "poder",
  alimentos: "libertad",
  piedra: "ciencia",
  oro: "cultura",
};
