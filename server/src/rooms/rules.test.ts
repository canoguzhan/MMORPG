import { test } from "node:test";
import assert from "node:assert/strict";
import { ABILITIES, dashEnd, expToNextLevel, grantExp, limitMove, MAP_HALF_SIZE, rollDamage, SLOTS } from "./rules.js";

test("limitMove allows a legal step", () => {
  assert.deepEqual(limitMove(0, 0, 0.5, 0, 100), { x: 0.5, z: 0 });
});

test("limitMove clips a teleport to the max step", () => {
  const r = limitMove(0, 0, 50, 0, 100);
  assert.ok(r.x > 0 && r.x < 2, `x=${r.x}`);
});

test("limitMove keeps players inside the map", () => {
  const r = limitMove(MAP_HALF_SIZE, 0, MAP_HALF_SIZE + 0.5, 0, 1000);
  assert.equal(r.x, MAP_HALF_SIZE);
});

test("grantExp levels up and carries over the remainder", () => {
  const p = { level: 1, exp: 0 };
  const gained = grantExp(p, expToNextLevel(1) + 5);
  assert.equal(gained, 1);
  assert.equal(p.level, 2);
  assert.equal(p.exp, 5);
});

test("rollDamage scales with level", () => {
  assert.equal(rollDamage("warrior", 1, () => 0), 14);
  assert.equal(rollDamage("warrior", 11, () => 0), 28);
});

test("dashEnd stops at the ability range", () => {
  const r = dashEnd(0, 0, 30, 0, 9);
  assert.deepEqual(r, { x: 9, z: 0 });
  assert.deepEqual(dashEnd(0, 0, 3, 4, 9), { x: 3, z: 4 });
});

test("every class has all four abilities", () => {
  for (const cls of Object.values(ABILITIES)) {
    for (const slot of SLOTS) assert.ok(cls[slot].cooldownMs > 0, slot);
  }
});
