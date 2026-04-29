import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import FormData from "form-data";
import { parseStringPromise } from "xml2js";
import Workflow from "./models/Workflow.js";

const app = express();
const { CORS_ORIGIN } = process.env;
const allowedOrigins = (CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

const { PORT=4000, MONGO_URI, CAMUNDA_BASE_URL, ALLOWED_TOPICS } = process.env;
const ALLOWED_TOPIC_SET = new Set((ALLOWED_TOPICS||"").split(",").map(s=>s.trim()).filter(Boolean));

await mongoose.connect(MONGO_URI).then(() => {
  console.log("MongoDB connected");
}).catch(err => {
  console.error("MongoDB connection error:", err);
});

// --- Auth stub ---
function requireAdmin(req, res, next) {
  // TODO: verify JWT/role
  next();
}

// --- Validation: only whitelisted external service tasks; block script/callActivity ---
async function validateBpmnXml(xml) {
  const doc = await parseStringPromise(xml, { explicitArray: false });
  const defs = doc["bpmn:definitions"];
  if (!defs) throw new Error("Not a BPMN 2.0 file (missing bpmn:definitions).");

  const processes = []
    .concat(defs["bpmn:process"] || [])
    .flat();

  const serviceTasks = [];

  const collectTasks = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "bpmn:serviceTask") {
        const arr = Array.isArray(v) ? v : [v];
        serviceTasks.push(...arr);
      } else if (typeof v === "object") {
        collectTasks(v);
      }
    }
  };
  (Array.isArray(processes) ? processes : [processes]).forEach(p => collectTasks(p));

  const raw = JSON.stringify(defs);
  const banned = ['"bpmn:scriptTask"', '"bpmn:callActivity"'];
  for (const tag of banned) {
    if (raw.includes(tag)) {
      throw new Error(`Forbidden element found: ${tag.replace('"','').replace('"','')}`);
    }
  }

  for (const t of serviceTasks) {
    const attrs = t["$"] || {};
    const topic = attrs["camunda:topic"];
    const type = attrs["camunda:type"];
    if (type !== "external") throw new Error(`ServiceTask ${attrs.id || ""} must be camunda:type="external"`);
    if (!topic || !ALLOWED_TOPIC_SET.has(topic)) {
      throw new Error(`ServiceTask ${attrs.id || ""} uses non-whitelisted topic "${topic}"`);
    }
  }
}

// --- Deploy to Camunda 7 via REST ---
async function deployToCamunda({ name, xml }) {
  const form = new FormData();
  form.append("deployment-name", name);
  form.append("deploy-changed-only", "true");
  form.append("data", Buffer.from(xml), { filename: `${name}.bpmn`, contentType: "text/xml" });

  const { data } = await axios.post(
    `${CAMUNDA_BASE_URL}/engine-rest/deployment/create`,
    form,
    { headers: form.getHeaders() }
  );
  return data;
}

// Save draft
app.post("/api/workflows", requireAdmin, async (req, res) => {
  try {
    const { key, name, xml } = req.body;
    if (!key || !name || !xml) return res.status(400).json({ error: "key, name, xml are required" });
    const last = await Workflow.findOne({ key }).sort({ version: -1 });
    const version = (last?.version || 0) + 1;
    await validateBpmnXml(xml);
    const wf = await Workflow.create({ key, name, version, xml, status: "draft" });
    res.json(wf);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Publish
app.post("/api/workflows/:id/publish", requireAdmin, async (req, res) => {
  try {
    const wf = await Workflow.findById(req.params.id);
    if (!wf) return res.status(404).json({ error: "Not found" });
    await validateBpmnXml(wf.xml);
    const deploy = await deployToCamunda({ name: `${wf.key}-v${wf.version}`, xml: wf.xml });
    wf.status = "published";
    wf.camundaDeploymentId = deploy.id;
    await wf.save();
    res.json({ ok: true, deployment: deploy, workflow: wf });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Start an instance
app.post("/api/workflows/:key/start", async (req, res) => {
  try {
    const { key } = req.params;
    const variables = req.body?.variables || {};
    const { data } = await axios.post(
      `${CAMUNDA_BASE_URL}/engine-rest/process-definition/key/${encodeURIComponent(key)}/start`,
      { variables },
      { headers: { "Content-Type": "application/json" } }
    );
    res.json(data);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.get("/api/workflows", async (_req, res) => {
  const list = await Workflow.find().sort({ createdAt: -1 });
  res.json(list);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Backend on :${PORT}`));
