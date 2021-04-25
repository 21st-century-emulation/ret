/**
 * webserver.ts
 */
import { Application, Context, Router } from "./deps.ts";

const app = new Application();
const router = new Router();

const READ_MEMORY_API = Deno.env.get("READ_MEMORY_API");

router.get("/status", (context: Context) => {
  context.response.body = "Healthy";
});

router.get("/api/v1/debug/readMemory", (context: Context) => {
  const address = context.request.url.searchParams.get("address");

  console.log("Reading " + address);

  context.response.status = 200;
  context.response.type = "text/plain";
  context.response.body = "17";
});

router.post("/api/v1/execute", async (context: Context) => {
  const result = context.request.body();
  const value = await result.value;

  let flag = true;
  switch (value["opcode"]) {
    case 0xC1: // RNZ
      flag = !value["state"]["flags"]["zero"];
      break;
    case 0xC8: // RZ
      flag = value["state"]["flags"]["zero"];
      break;
    case 0xD1: // RNC
      flag = !value["state"]["flags"]["carry"];
      break;
    case 0xD8: // RC
      flag = value["state"]["flags"]["carry"];
      break;
    case 0xE1: // RPO
      flag = !value["state"]["flags"]["parity"];
      break;
    case 0xE8: // RPE
      flag = value["state"]["flags"]["parity"];
      break;
    case 0xF1: // RP
      flag = !value["state"]["flags"]["sign"];
      break;
    case 0xF8: // RM
      flag = value["state"]["flags"]["sign"];
      break;
    case 0xC9: // RET
      flag = true;
      break;
    case 0xD9: //RET
      flag = true;
      break;
    case 0xE9: //RET
      flag = true;
      break;
    default:
      context.response.status = 400;
      context.response.body = "Invalid opcode";
      return;
  }
  
  if (!flag) {
    value["state"]["cycles"] += 5; // 5 cycles for flag rejected ret
  } else {
    value["state"]["cycles"] += 11; // 11 cycles for performed ret

    // Push PC high byte
    const lowBytePull = fetch(`${READ_MEMORY_API}?id=${value["id"]}&address=${value["state"]["stackPointer"]}`);
    value["state"]["stackPointer"] += 1;
    if (value["state"]["stackPointer"] > 0xFFF) value["state"]["stackPointer"] -= 0xFFFF;
    const highBytePull = fetch(`${READ_MEMORY_API}?id=${value["id"]}&address=${value["state"]["stackPointer"]}`);
    value["state"]["stackPointer"] += 1;
    if (value["state"]["stackPointer"] > 0xFFF) value["state"]["stackPointer"] -= 0xFFFF;

    const responses = await Promise.all([lowBytePull, highBytePull]);
    value["state"]["programCounter"] = parseInt(await responses[0].text(), 10) | (parseInt(await responses[1].text(), 10) << 8);
  
  }

  context.response.status = 200;
  context.response.type = "application/json";
  context.response.body = JSON.stringify(value);
});

app.use(router.routes());

await app.listen("0.0.0.0:8080");