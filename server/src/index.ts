import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { VillageRoom } from "./rooms/VillageRoom.js";

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({ transport: new WebSocketTransport() });
gameServer.define("village", VillageRoom);

await gameServer.listen(port);
console.log(`Oyun sunucusu ws://localhost:${port} adresinde çalışıyor`);
