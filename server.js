const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SCENARIOS_FILE = path.join(DATA_DIR, "scenarios.json");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "cattleflow-dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      respondJson(res, error.statusCode, { error: error.message });
      return;
    }

    console.error(error);
    respondJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`CattleFlow Pro running at http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    const name = sanitizeText(body.name);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || password.length < 8) {
      throw new HttpError(400, "Name, valid email, and an 8-character password are required.");
    }

    const users = readData(USERS_FILE);
    if (users.some((user) => user.email === email)) {
      throw new HttpError(409, "An account with that email already exists.");
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeData(USERS_FILE, users);

    respondJson(res, 201, {
      token: signToken({ userId: user.id, email: user.email }),
      user: publicUser(user)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const users = readData(USERS_FILE);
    const user = users.find((entry) => entry.email === email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new HttpError(401, "Invalid email or password.");
    }

    respondJson(res, 200, {
      token: signToken({ userId: user.id, email: user.email }),
      user: publicUser(user)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = requireUser(req);
    respondJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projections") {
    const user = requireUser(req);
    const projections = readData(SCENARIOS_FILE)
      .filter((entry) => entry.userId === user.id)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    respondJson(res, 200, { projections });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projections") {
    const user = requireUser(req);
    const body = await readJsonBody(req);
    const title = sanitizeText(body.title);
    if (!title) {
      throw new HttpError(400, "Projection name is required.");
    }

    const calculation = calculateProjection(body.inputs || {});
    const projections = readData(SCENARIOS_FILE);
    const record = {
      id: crypto.randomUUID(),
      userId: user.id,
      title,
      createdAt: new Date().toISOString(),
      inputs: calculation.inputs,
      outputs: calculation.outputs,
      advisory: calculation.advisory
    };

    projections.push(record);
    writeData(SCENARIOS_FILE, projections);
    respondJson(res, 201, { projection: record });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/projections/")) {
    const user = requireUser(req);
    const projectionId = url.pathname.split("/").pop();
    const projections = readData(SCENARIOS_FILE);
    const filtered = projections.filter((entry) => !(entry.id === projectionId && entry.userId === user.id));

    if (filtered.length === projections.length) {
      throw new HttpError(404, "Projection not found.");
    }

    writeData(SCENARIOS_FILE, filtered);
    respondJson(res, 200, { ok: true });
    return;
  }

  throw new HttpError(404, "Route not found.");
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(path.join(ROOT, pathname));

  if (!safePath.startsWith(ROOT)) {
    respondText(res, 403, "Forbidden");
    return;
  }

  let filePath = safePath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, "index.html");
  }

  const file = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  res.end(file);
}

function requireUser(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    throw new HttpError(401, "Missing authorization token.");
  }

  const payload = verifyToken(token);
  if (!payload) {
    throw new HttpError(401, "Session expired or invalid.");
  }

  const users = readData(USERS_FILE);
  const user = users.find((entry) => entry.id === payload.userId);
  if (!user) {
    throw new HttpError(401, "User account was not found.");
  }

  return user;
}

function calculateProjection(rawInputs) {
  const dietMode = rawInputs.dietMode === "100" ? "100" : "8020";
  const inputs = {
    dietMode,
    acquisitionCost: toNumber(rawInputs.acquisitionCost),
    entryWeight: toNumber(rawInputs.entryWeight),
    finalWeight: toNumber(rawInputs.finalWeight),
    sellingPrice: toNumber(rawInputs.sellingPrice),
    dryMatterPercent: toNumber(rawInputs.dryMatterPercent),
    silagePrice: toNumber(rawInputs.silagePrice),
    concentratePrice: dietMode === "8020" ? toNumber(rawInputs.concentratePrice) : 0,
    caretakerSalary: toNumber(rawInputs.caretakerSalary)
  };

  const required = Object.entries(inputs).filter(([key]) => {
    if (key === "dietMode") {
      return false;
    }
    return key !== "concentratePrice" || dietMode === "8020";
  });
  if (required.some(([, value]) => !Number.isFinite(value) || value < 0)) {
    throw new HttpError(400, "All numeric fields must be valid non-negative values.");
  }
  if (inputs.finalWeight <= inputs.entryWeight) {
    throw new HttpError(400, "Final weight must be greater than entry weight.");
  }
  if (inputs.dryMatterPercent <= 0) {
    throw new HttpError(400, "Dry matter percent must be greater than zero.");
  }

  const days = 100;
  const dryMatterIntake = 0.025;
  const averageDailyGain = (inputs.finalWeight - inputs.entryWeight) / days;
  const averageBodyWeight = (inputs.entryWeight + inputs.finalWeight) / 2;
  const totalDryMatter = dryMatterIntake * averageBodyWeight * days;
  const asFedTotal = totalDryMatter / (inputs.dryMatterPercent / 100);

  const silageKg = Math.round(asFedTotal * (dietMode === "8020" ? 0.8 : 1));
  const concentrateKg = dietMode === "8020" ? Math.round(asFedTotal * 0.2) : 0;
  const costOfSilage = silageKg * inputs.silagePrice;
  const costOfConcentrates = concentrateKg * inputs.concentratePrice;
  const totalFeedCost = costOfSilage + costOfConcentrates;
  const totalExpenses = totalFeedCost + inputs.caretakerSalary;
  const grossSale = inputs.finalWeight * inputs.sellingPrice;
  const netIncome = grossSale - totalExpenses - inputs.acquisitionCost;
  const roiPercent = inputs.acquisitionCost > 0 ? (netIncome / inputs.acquisitionCost) * 100 : 0;

  let advisory = "Margin looks steady. Keep updating feed and market prices before locking the batch.";
  if (netIncome < 0) {
    advisory = "This batch projects a loss. Review acquisition cost, sale price, or target weight before proceeding.";
  } else if (inputs.dryMatterPercent < 30 || inputs.dryMatterPercent > 40) {
    advisory = "Dry matter is outside the usual 30% to 40% band, so ration quality should be checked before acting on the result.";
  } else if (averageDailyGain < 0.8) {
    advisory = "Average daily gain is on the low side. Revisit the feeding plan to confirm the target weight is realistic.";
  }

  return {
    inputs,
    outputs: {
      silageKg,
      concentrateKg,
      costOfSilage,
      costOfConcentrates,
      totalFeedCost,
      averageDailyGain,
      totalExpenses,
      grossSale,
      netIncome,
      roiPercent
    },
    advisory
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON payload.");
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    writeData(USERS_FILE, []);
  }
  if (!fs.existsSync(SCENARIOS_FILE)) {
    writeData(SCENARIOS_FILE, []);
  }
}

function readData(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeData(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function respondJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function respondText(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(encoded).digest("base64url");
  if (signature.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : NaN;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
