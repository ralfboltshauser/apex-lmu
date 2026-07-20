const catalogVersion = 1

// Reviewed against LMU's official 2023 and current car lists. Matching remains
// deliberately model-specific: team, season, livery and number text may wrap a
// known model name, but Apex never guesses a model by stripping generic words.
const catalog = [
  ['hypercar-alpine-a424', 'Alpine A424', 'Alpine', 'Hypercar', 'hypercar', ['alpine a424']],
  ['hypercar-aston-martin-valkyrie', 'Aston Martin Valkyrie', 'Aston Martin', 'Hypercar', 'hypercar', ['aston martin valkyrie']],
  ['hypercar-bmw-m-hybrid-v8', 'BMW M Hybrid V8', 'BMW', 'Hypercar', 'hypercar', ['bmw m hybrid v8', 'bmw m-hybrid v8']],
  ['hypercar-cadillac-v-series-r', 'Cadillac V-Series.R', 'Cadillac', 'Hypercar', 'hypercar', ['cadillac v series r', 'cadillac v-series.r']],
  ['hypercar-ferrari-499p', 'Ferrari 499P', 'Ferrari', 'Hypercar', 'hypercar', ['ferrari 499p']],
  ['hypercar-genesis-gmr-001', 'Genesis GMR-001', 'Genesis', 'Hypercar', 'hypercar', ['genesis gmr 001', 'genesis gmr-001']],
  ['hypercar-glickenhaus-scg-007', 'Glickenhaus SCG 007', 'Glickenhaus', 'Hypercar', 'hypercar', ['glickenhaus scg 007', 'scg 007']],
  ['hypercar-isotta-tipo-6', 'Isotta Fraschini Tipo 6', 'Isotta Fraschini', 'Hypercar', 'hypercar', ['isotta fraschini tipo 6', 'isotta tipo 6']],
  ['hypercar-lamborghini-sc63', 'Lamborghini SC63', 'Lamborghini', 'Hypercar', 'hypercar', ['lamborghini sc63']],
  ['hypercar-peugeot-9x8-evo', 'Peugeot 9X8 Evo', 'Peugeot', 'Hypercar', 'hypercar', ['peugeot 9x8 evo']],
  ['hypercar-peugeot-9x8', 'Peugeot 9X8', 'Peugeot', 'Hypercar', 'hypercar', ['peugeot 9x8']],
  ['hypercar-porsche-963', 'Porsche 963', 'Porsche', 'Hypercar', 'hypercar', ['porsche 963']],
  ['hypercar-toyota-gr010', 'Toyota GR010', 'Toyota', 'Hypercar', 'hypercar', ['toyota gr010 hybrid', 'toyota gr010-hybrid', 'toyota gr010']],
  ['hypercar-vanwall-680', 'Vanwall Vandervell 680', 'Vanwall', 'Hypercar', 'hypercar', ['vanwall vandervell 680', 'vandervell 680']],
  ['lmp2-oreca-07', 'Oreca 07 Gibson', 'Oreca', 'LMP2', 'lmp2', ['oreca 07 gibson', 'oreca 07']],
  ['lmp3-ligier-js-p325', 'Ligier JS P325', 'Ligier', 'LMP3', 'lmp3', ['ligier js p325']],
  ['lmp3-ginetta-g61', 'Ginetta G61-LT-P3 Evo', 'Ginetta', 'LMP3', 'lmp3', ['ginetta g61 lt p3 evo', 'ginetta g61-lt-p3 evo']],
  ['lmp3-duqueine-d09', 'Duqueine D09', 'Duqueine', 'LMP3', 'lmp3', ['duqueine d09']],
  ['lmgt3-aston-martin-vantage', 'Aston Martin Vantage AMR LMGT3 Evo', 'Aston Martin', 'LMGT3', 'lmgt3', ['aston martin vantage amr lmgt3 evo', 'aston martin vantage lmgt3']],
  ['lmgt3-bmw-m4-evo', 'BMW M4 Evo LMGT3', 'BMW', 'LMGT3', 'lmgt3', ['bmw m4 evo lmgt3']],
  ['lmgt3-bmw-m4', 'BMW M4 LMGT3', 'BMW', 'LMGT3', 'lmgt3', ['bmw m4 lmgt3']],
  ['lmgt3-corvette-z06', 'Chevrolet Corvette Z06 LMGT3.R', 'Chevrolet', 'LMGT3', 'lmgt3', ['chevrolet corvette z06 lmgt3 r', 'corvette z06 lmgt3 r']],
  ['lmgt3-ferrari-296', 'Ferrari 296 LMGT3', 'Ferrari', 'LMGT3', 'lmgt3', ['ferrari 296 lmgt3']],
  ['lmgt3-ford-mustang', 'Ford Mustang LMGT3', 'Ford', 'LMGT3', 'lmgt3', ['ford mustang lmgt3']],
  ['lmgt3-lexus-rc-f', 'Lexus RC F LMGT3', 'Lexus', 'LMGT3', 'lmgt3', ['lexus rc f lmgt3', 'lexus rc f gt3', 'lexus rc f']],
  ['lmgt3-lamborghini-huracan', 'Lamborghini Huracán LMGT3 Evo2', 'Lamborghini', 'LMGT3', 'lmgt3', ['lamborghini huracan lmgt3 evo2', 'lamborghini huracán lmgt3 evo2']],
  ['lmgt3-mclaren-720s', 'McLaren 720S LMGT3 Evo', 'McLaren', 'LMGT3', 'lmgt3', ['mclaren 720s lmgt3 evo', 'mclaren 720s gt3 evo']],
  ['lmgt3-mercedes-amg', 'Mercedes-AMG LMGT3 Evo', 'Mercedes-AMG', 'LMGT3', 'lmgt3', ['mercedes amg lmgt3 evo', 'mercedes amg lmgt3']],
  ['lmgt3-porsche-911', 'Porsche 911 GT3 R LMGT3', 'Porsche', 'LMGT3', 'lmgt3', ['porsche 911 gt3 r lmgt3', 'porsche 911 gt3 r']],
  ['gte-aston-martin-vantage', 'Aston Martin Vantage GTE', 'Aston Martin', 'GTE', 'gte', ['aston martin vantage gte']],
  ['gte-corvette-c8-r', 'Chevrolet Corvette C8.R', 'Chevrolet', 'GTE', 'gte', ['chevrolet corvette c8 r', 'corvette c8 r']],
  ['gte-ferrari-488', 'Ferrari 488 GTE Evo', 'Ferrari', 'GTE', 'gte', ['ferrari 488 gte evo']],
  ['gte-porsche-911-rsr', 'Porsche 911 RSR-19', 'Porsche', 'GTE', 'gte', ['porsche 911 rsr 19', 'porsche 911 rsr-19']],
].map(([id, displayName, manufacturer, className, family, aliases]) => ({ id, displayName, manufacturer, className, family, aliases }))

const classFamilies = {
  hypercar: new Set(['hypercar', 'hypercars', 'hyp', 'lmh', 'lmdh']),
  lmp2: new Set(['lmp2', 'lmp 2']),
  lmp3: new Set(['lmp3', 'lmp 3']),
  lmgt3: new Set(['lmgt3', 'lm gt3', 'gt3', 'gt 3']),
  gte: new Set(['gte', 'lm gte', 'lmgte']),
}

function normalizeVehicleText(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ')
}

function containsSequence(value, sequence) {
  return ` ${value} `.includes(` ${normalizeVehicleText(sequence)} `)
}

function resolveVehicleModel(rawName, rawClass) {
  const name = normalizeVehicleText(rawName)
  const vehicleClass = normalizeVehicleText(rawClass)
  if (!name || !vehicleClass) return { catalogVersion, recognized: false, id: null, displayName: String(rawName || '').trim(), manufacturer: null, className: String(rawClass || '').trim(), ruleId: null }
  for (const model of catalog) {
    if (!classFamilies[model.family].has(vehicleClass)) continue
    const alias = model.aliases.find((candidate) => containsSequence(name, candidate))
    if (!alias) continue
    return { catalogVersion, recognized: true, id: model.id, displayName: model.displayName, manufacturer: model.manufacturer, className: model.className, ruleId: `${model.id}:${normalizeVehicleText(alias)}` }
  }
  return { catalogVersion, recognized: false, id: null, displayName: String(rawName).trim(), manufacturer: null, className: String(rawClass).trim(), ruleId: null }
}

module.exports = { catalog, catalogVersion, normalizeVehicleText, resolveVehicleModel }
