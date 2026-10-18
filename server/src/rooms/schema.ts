import { MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") name = "";
  @type("string") cls = "warrior";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rot = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("number") level = 1;
  @type("number") exp = 0;
  @type("number") gold = 0;
}

export class Monster extends Schema {
  @type("string") kind = "darkened_wolf";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rot = 0;
  @type("number") hp = 40;
  @type("number") maxHp = 40;
}

/** Kara Göktaşı: kırılana kadar çevresine Kararmış canavar çağırır. */
export class Stone extends Schema {
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") hp = 400;
  @type("number") maxHp = 400;
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Monster }) monsters = new MapSchema<Monster>();
  @type({ map: Stone }) stones = new MapSchema<Stone>();
}
