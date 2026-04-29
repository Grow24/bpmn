import "dotenv/config";
import http from "node:http";
import { Client, logger, Variables } from "camunda-external-task-client-js";
import axios from "axios";

const client = new Client({
  baseUrl: `${process.env.CAMUNDA_BASE_URL}/engine-rest`,
  use: logger
});

// Example: checkInventory
client.subscribe("checkInventory", async ({ task, taskService }) => {
  const sku = task.variables.get("sku");
  // TODO: replace with real DB lookup
  const inStock = true;
  const vars = new Variables();
  vars.set("inStock", inStock);
  await taskService.complete(task, vars);
});

// Example: sendEmail (replace with Zoho/SES/etc.)
client.subscribe("sendEmail", async ({ task, taskService }) => {
  const to = task.variables.get("to");
  const subject = task.variables.get("subject");
  const body = task.variables.get("body");
  console.log("Sending email:", { to, subject, body });
  await taskService.complete(task);
});

// Example: httpRequest (restrict to safe hosts)
const SAFE_HOSTS = new Set(["api.mycompany.local", "localhost"]);
client.subscribe("httpRequest", async ({ task, taskService }) => {
  const url = task.variables.get("url");
  const host = new URL(url).hostname;
  if (!SAFE_HOSTS.has(host)) throw new Error(`Forbidden host: ${host}`);
  const method = (task.variables.get("method") || "GET").toUpperCase();
  const payload = task.variables.get("payload") || null;
  const { data } = await axios({ url, method, data: payload });
  const vars = new Variables().set("response", data);
  await taskService.complete(task, vars);
});

if (process.env.PORT) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "workers" }));
  });
  server.listen(process.env.PORT, () => {
    console.log(`Worker health endpoint on :${process.env.PORT}`);
  });
}
