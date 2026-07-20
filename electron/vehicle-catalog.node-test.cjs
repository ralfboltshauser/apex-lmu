const test = require('node:test')
const assert = require('node:assert/strict')
const { catalog, catalogVersion, resolveVehicleModel } = require('./vehicle-catalog.cjs')

test('every reviewed alias maps to exactly its declared canonical model', () => {
  assert.equal(catalogVersion, 1)
  for (const model of catalog) {
    for (const alias of model.aliases) {
      const resolved = resolveVehicleModel(alias, model.className)
      assert.equal(resolved.recognized, true, `${model.id}: ${alias}`)
      assert.equal(resolved.id, model.id, `${model.id}: ${alias}`)
    }
  }
})

test('team, season, livery and number wrappers merge only around a reviewed model sequence', () => {
  const first = resolveVehicleModel('Penske Porsche 963 2025 #6', 'Hypercar')
  const second = resolveVehicleModel('Proton Competition · Porsche 963 · #99', 'HYP')
  assert.equal(first.id, 'hypercar-porsche-963')
  assert.equal(second.id, first.id)
  assert.equal(first.displayName, 'Porsche 963')
})

test('models in the same class remain separate and longer evo rules win', () => {
  assert.notEqual(resolveVehicleModel('Ferrari 499P', 'Hypercar').id, resolveVehicleModel('Porsche 963', 'Hypercar').id)
  assert.notEqual(resolveVehicleModel('Peugeot 9X8 Evo', 'Hypercar').id, resolveVehicleModel('Peugeot 9X8', 'Hypercar').id)
  assert.notEqual(resolveVehicleModel('BMW M4 Evo LMGT3', 'LMGT3').id, resolveVehicleModel('BMW M4 LMGT3', 'LMGT3').id)
})

test('matching is case and whitespace stable but class guarded and never broad', () => {
  assert.equal(resolveVehicleModel('  PORSCHE   963  ', ' hyperCAR ').id, 'hypercar-porsche-963')
  assert.equal(resolveVehicleModel('Porsche 963', 'LMGT3').recognized, false)
  assert.equal(resolveVehicleModel('Team Porsche Prototype #6', 'Hypercar').recognized, false)
  assert.equal(resolveVehicleModel('963', 'Hypercar').recognized, false)
})

test('unknown, blank, malformed and future labels remain explicit', () => {
  for (const [name, vehicleClass] of [['Private Mod Car', 'GT3'], ['', 'GT3'], ['Porsche 963', ''], [null, null]]) {
    const result = resolveVehicleModel(name, vehicleClass)
    assert.equal(result.recognized, false)
    assert.equal(result.id, null)
    assert.equal(result.ruleId, null)
  }
})
