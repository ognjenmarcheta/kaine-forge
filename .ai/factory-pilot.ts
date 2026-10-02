import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { CONTROLLER_VERSION } from "./factory-checkouts";
import { propose } from "./factory-docker";
import { progress } from "./factory-progress";
import { initializeCandidate, applyCandidate, finishStorage } from "./factory-storage";
import type { FactoryStore } from "./factory-store";
import { validationCommand } from "./factory-validation";
import { applyFiles } from "./factory-workspace";
import {
  fingerprint,
  validateChanges,
  type FactoryConfig,
  type FactoryProvider,
  type FactoryRun
} from "./factory.util";

export const pilotTierSchema = z.enum(["docs", "code", "web"]);
type PilotTier = z.infer<typeof pilotTierSchema>;

export function pilotFingerprint(config: FactoryConfig, root: string): string {
  return fingerprint(
    JSON.stringify({
      image: config.image,
      models: config.models,
      stages: config.stages,
      effort: "high"
    }) +
      [
        ...readdirSync(path.join(root, ".ai")).filter(
          (file) => /^factory.*\.ts$/.test(file) && !file.endsWith(".spec.ts")
        ),
        "docker/factory-storage.mjs",
        "docker/factory-fetch.mjs",
        "docker/factory-worker.mjs",
        "docker/factory-provider.mjs",
        "docker/factory-proxy.mjs"
      ]
        .sort()
        .map((file) => readFileSync(path.join(root, ".ai", file), "utf8"))
        .join("\n")
  );
}

const cases = {
  docs: {
    file: "README.md",
    before: "# Counter\n",
    criterion: "The guide documents pnpm install, pnpm dev, and a Stop section explaining Ctrl+C.",
    check:
      "const fs=require('fs'),assert=require('assert/strict');const s=fs.readFileSync('README.md','utf8');for(const term of ['pnpm install','pnpm dev','Ctrl+C'])assert.ok(s.includes(term));assert.match(s,/^## Stop$/m)"
  },
  code: {
    file: "add.mjs",
    before: "export function add(a,b) { return a-b; }\n",
    criterion: "add returns the sum for positive, negative, zero, and fractional operands.",
    check:
      "const {add}=await import('./add.mjs');const {default:assert}=await import('node:assert/strict');for(const [a,b,want] of [[2,3,5],[-2,3,1],[0,0,0],[1.5,2.25,3.75],[-3,-7,-10]])assert.equal(add(a,b),want)"
  },
  web: {
    file: "index.html",
    before:
      '<!doctype html><html lang="en"><title>Counter</title><button>Increment</button><output aria-label="Count">0</output></html>',
    criterion:
      "The Increment button updates the visible count from zero to one and two, including keyboard activation.",
    check:
      "const {chromium}=require('/usr/local/lib/node_modules/playwright');const assert=require('assert/strict');(async()=>{const browser=await chromium.launch({headless:true});const context=await browser.newContext({recordVideo:{dir:'evidence'}});await context.tracing.start({screenshots:true,snapshots:true});const page=await context.newPage();await page.goto('file:///workspace/index.html');assert.equal(await page.locator('output').textContent(),'0');await page.getByRole('button',{name:'Increment',exact:true}).click();assert.equal(await page.locator('output').textContent(),'1');await page.getByRole('button',{name:'Increment',exact:true}).press('Enter');assert.equal(await page.locator('output').textContent(),'2');await page.screenshot({path:'evidence/counter.png'});await context.tracing.stop({path:'evidence/trace.zip'});await context.close();await browser.close()})().catch(e=>{console.error(e);process.exit(1)})"
  }
};

export async function runPilot(
  config: FactoryConfig,
  store: FactoryStore,
  root: string,
  provider: FactoryProvider,
  tier: PilotTier
) {
  const id = randomUUID();
  const release = store.acquire(id);
  try {
    const testCase = cases[tier];
    const workspace = path.join(store.directory, "..", "pilots", id);
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.join(workspace, "evidence"));
    writeFileSync(path.join(workspace, testCase.file), testCase.before);
    const run: FactoryRun = {
      controller: {
        version: CONTROLLER_VERSION,
        root,
        checkout: store.checkout ?? root,
        image: config.image,
        fingerprint: pilotFingerprint(config, root)
      },
      id,
      issue: 1,
      stage: "implement",
      provider,
      model: config.models[provider],
      revision: "0".repeat(40),
      authorization: "local-pilot",
      snapshot: pilotFingerprint(config, root),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      detail: `Local ${tier} pilot; no GitHub writes`,
      branch: "",
      pr: null,
      validation: [],
      result: null,
      invocations: []
    };
    store.save(run);
    const check = [
      "node",
      ...(tier === "code" ? ["--input-type=module"] : []),
      "-e",
      testCase.check
    ];
    try {
      initializeCandidate(
        config,
        run,
        store,
        workspace,
        [{ path: testCase.file, content: testCase.before }],
        false
      );
      if (await validationCommand(config, run, store, workspace, check))
        throw new Error("Broken pilot fixture unexpectedly passed");
      progress(store, id, "proposal", "started");
      const result = await propose(
        config,
        run,
        store,
        `Return the required structured result for issue 1, revision ${run.revision}. Fix this isolated ${tier} fixture. Return only ${testCase.file} in files, with its complete content. Do not claim to have executed tests. No tools are available. Acceptance criterion: ${testCase.criterion}\nCurrent file:\n${testCase.before}`
      );
      if (
        result.issue !== 1 ||
        result.revision !== run.revision ||
        result.status !== "completed" ||
        result.files.length !== 1
      )
        throw new Error("Pilot returned an invalid result");
      validateChanges(result, "implement", [testCase.file]);
      progress(store, id, "proposal", "passed");
      applyFiles(workspace, result);
      applyCandidate(config, run, result.files);
      if (!(await validationCommand(config, run, store, workspace, check)))
        throw new Error("Pilot failed independent verification");
      run.result = result;
      if (!finishStorage(config, run, store)) throw new Error("Pilot cleanup unverified");
      run.status = "completed";
      store.write(`pilot-${provider}-${tier}.json`, {
        fingerprint: run.snapshot,
        run: id,
        provider,
        tier,
        passed: true
      });
    } catch (error) {
      run.status = store.cancelled(id) ? "cancelled" : "failed";
      run.detail = error instanceof Error ? error.message : "Pilot failed";
    } finally {
      if (!finishStorage(config, run, store)) {
        run.status = "failed";
        run.detail += "; cleanup unverified; cancel before retrying";
      }
      run.finishedAt = new Date().toISOString();
      store.save(run);
    }
    return run;
  } finally {
    const recorded = store.runs().find((entry) => entry.id === id);
    if (recorded?.cleanup?.status !== "cleanup-unverified") release();
  }
}

export function requirePilots(config: FactoryConfig, store: FactoryStore, root: string): void {
  if (
    Object.values(config.stages).some(
      (selection) => selection.model !== config.models[selection.provider]
    )
  )
    throw new Error("Polling stage models must match the models verified by the provider pilots");
  for (const provider of ["codex", "claude"] as const)
    for (const tier of pilotTierSchema.options) {
      const receipt = z
        .object({
          fingerprint: z.literal(pilotFingerprint(config, root)),
          run: z.string().uuid(),
          provider: z.literal(provider),
          tier: z.literal(tier),
          passed: z.literal(true)
        })
        .parse(JSON.parse(readFileSync(store.file(`pilot-${provider}-${tier}.json`), "utf8")));
      const run = store.runs().find((entry) => entry.id === receipt.run);
      if (
        !run ||
        run.status !== "completed" ||
        run.authorization !== "local-pilot" ||
        run.provider !== provider ||
        run.model !== config.models[provider] ||
        run.snapshot !== receipt.fingerprint ||
        run.validation.at(-1)?.passed !== true ||
        run.invocations.some((invocation) => !invocation.cleanup)
      )
        throw new Error("Matching live pilot evidence is missing");
    }
  if (
    !store
      .runs()
      .some(
        (run) =>
          run.stage === "implement" &&
          run.authorization !== "local-pilot" &&
          run.status === "completed" &&
          run.pr &&
          run.candidate
      )
  )
    throw new Error("Complete one owner-approved issue through a verified draft PR before polling");
}
