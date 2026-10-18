import { test } from "node:test";
import assert from "node:assert/strict";
import { expToNextLevel, grantExp, limitMove, MAP_HALF_SIZE, rollDamage } from "./rules.js";

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
