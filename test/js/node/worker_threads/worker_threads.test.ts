import { bunEnv, bunExe } from "harness";
import fs from "node:fs";
import { join, relative, resolve } from "node:path";
import wt, {
  BroadcastChannel,
  getEnvironmentData,
  isMainThread,
  markAsUntransferable,
  MessageChannel,
  MessagePort,
  moveMessagePortToContext,
  parentPort,
  receiveMessageOnPort,
  resourceLimits,
  setEnvironmentData,
  SHARE_ENV,
  threadId,
  Worker,
  workerData,
} from "worker_threads";

test("support eval in worker", async () => {
  const worker = new Worker(`postMessage(1 + 1)`, {
    eval: true,
  });
  const result = await new Promise(resolve => {
    worker.on("message", resolve);
  });
  expect(result).toBe(2);
  await worker.terminate();
});

test("all worker_threads module properties are present", () => {
  expect(wt).toHaveProperty("getEnvironmentData");
  expect(wt).toHaveProperty("isMainThread");
  expect(wt).toHaveProperty("markAsUntransferable");
  expect(wt).toHaveProperty("moveMessagePortToContext");
  expect(wt).toHaveProperty("parentPort");
  expect(wt).toHaveProperty("receiveMessageOnPort");
  expect(wt).toHaveProperty("resourceLimits");
  expect(wt).toHaveProperty("SHARE_ENV");
  expect(wt).toHaveProperty("setEnvironmentData");
  expect(wt).toHaveProperty("threadId");
  expect(wt).toHaveProperty("workerData");
  expect(wt).toHaveProperty("BroadcastChannel");
  expect(wt).toHaveProperty("MessageChannel");
  expect(wt).toHaveProperty("MessagePort");
  expect(wt).toHaveProperty("Worker");

  expect(getEnvironmentData).toBeFunction();
  expect(isMainThread).toBeBoolean();
  expect(markAsUntransferable).toBeFunction();
  expect(moveMessagePortToContext).toBeFunction();
  expect(parentPort).toBeNull();
  expect(receiveMessageOnPort).toBeFunction();
  expect(resourceLimits).toBeDefined();
  expect(SHARE_ENV).toBeDefined();
  expect(setEnvironmentData).toBeFunction();
  expect(threadId).toBeNumber();
  expect(workerData).toBeNull();
  expect(BroadcastChannel).toBeDefined();
  expect(MessageChannel).toBeDefined();
  expect(MessagePort).toBeDefined();
  expect(Worker).toBeDefined();

  expect(() => {
    // @ts-expect-error no args
    wt.markAsUntransferable();
  }).toThrow("not yet implemented");

  expect(() => {
    // @ts-expect-error no args
    wt.moveMessagePortToContext();
  }).toThrow("not yet implemented");
});

test("all worker_threads worker instance properties are present", async () => {
  const worker = new Worker(new URL("./worker.js", import.meta.url).href);
  expect(worker).toHaveProperty("threadId");
  expect(worker).toHaveProperty("ref");
  expect(worker).toHaveProperty("unref");
  expect(worker).toHaveProperty("stdin");
  expect(worker).toHaveProperty("stdout");
  expect(worker).toHaveProperty("stderr");
  expect(worker).toHaveProperty("performance");
  expect(worker).toHaveProperty("terminate");
  expect(worker).toHaveProperty("postMessage");
  expect(worker).toHaveProperty("getHeapSnapshot");
  expect(worker).toHaveProperty("setMaxListeners");
  expect(worker).toHaveProperty("getMaxListeners");
  expect(worker).toHaveProperty("emit");
  expect(worker).toHaveProperty("addListener");
  expect(worker).toHaveProperty("on");
  expect(worker).toHaveProperty("prependListener");
  expect(worker).toHaveProperty("once");
  expect(worker).toHaveProperty("prependOnceListener");
  expect(worker).toHaveProperty("removeListener");
  expect(worker).toHaveProperty("off");
  expect(worker).toHaveProperty("removeAllListeners");
  expect(worker).toHaveProperty("listeners");
  expect(worker).toHaveProperty("rawListeners");
  expect(worker).toHaveProperty("listenerCount");
  expect(worker).toHaveProperty("eventNames");

  expect(worker.threadId).toBeNumber();
  expect(worker.ref).toBeFunction();
  expect(worker.unref).toBeFunction();
  expect(worker.stdin).toBeNull();
  expect(worker.stdout).toBeNull();
  expect(worker.stderr).toBeNull();
  expect(worker.performance).toBeDefined();
  expect(worker.terminate).toBeFunction();
  expect(worker.postMessage).toBeFunction();
  expect(worker.getHeapSnapshot).toBeFunction();
  expect(worker.setMaxListeners).toBeFunction();
  expect(worker.getMaxListeners).toBeFunction();
  expect(worker.emit).toBeFunction();
  expect(worker.addListener).toBeFunction();
  expect(worker.on).toBeFunction();
  expect(worker.prependListener).toBeFunction();
  expect(worker.once).toBeFunction();
  expect(worker.prependOnceListener).toBeFunction();
  expect(worker.removeListener).toBeFunction();
  expect(worker.off).toBeFunction();
  expect(worker.removeAllListeners).toBeFunction();
  expect(worker.listeners).toBeFunction();
  expect(worker.rawListeners).toBeFunction();
  expect(worker.listenerCount).toBeFunction();
  expect(worker.eventNames).toBeFunction();
  await worker.terminate();
});

test("threadId module and worker property is consistent", async () => {
  const worker1 = new Worker(new URL("./worker-thread-id.ts", import.meta.url).href);
  expect(threadId).toBe(0);
  expect(worker1.threadId).toBeGreaterThan(0);
  expect(() => worker1.postMessage({ workerId: worker1.threadId })).not.toThrow();
  const worker2 = new Worker(new URL("./worker-thread-id.ts", import.meta.url).href);
  expect(worker2.threadId).toBeGreaterThan(worker1.threadId);
  expect(() => worker2.postMessage({ workerId: worker2.threadId })).not.toThrow();
  await worker1.terminate();
  await worker2.terminate();
});

test("receiveMessageOnPort works across threads", async () => {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL("./worker.js", import.meta.url).href, {
    workerData: port2,
    transferList: [port2],
  });
  let sharedBuffer = new SharedArrayBuffer(8);
  let sharedBufferView = new Int32Array(sharedBuffer);
  let msg = { sharedBuffer };
  worker.postMessage(msg);
  expect(await Atomics.waitAsync(sharedBufferView, 0, 0).value).toBe("ok");
  const message = receiveMessageOnPort(port1);
  expect(message).toBeDefined();
  expect(message!.message).toBe("done!");
  await worker.terminate();
}, 9999999);

test("receiveMessageOnPort works as FIFO", () => {
  const { port1, port2 } = new MessageChannel();

  const message1 = { hello: "world" };
  const message2 = { foo: "bar" };

  // Make sure receiveMessageOnPort() works in a FIFO way, the same way it does
  // when we’re using events.
  expect(receiveMessageOnPort(port2)).toBe(undefined);
  port1.postMessage(message1);
  port1.postMessage(message2);
  expect(receiveMessageOnPort(port2)).toStrictEqual({ message: message1 });
  expect(receiveMessageOnPort(port2)).toStrictEqual({ message: message2 });
  expect(receiveMessageOnPort(port2)).toBe(undefined);
  expect(receiveMessageOnPort(port2)).toBe(undefined);

  // Make sure message handlers aren’t called.
  port2.on("message", () => {
    expect().fail("message handler must not be called");
  });
  port1.postMessage(message1);
  expect(receiveMessageOnPort(port2)).toStrictEqual({ message: message1 });
  port1.close();

  for (const value of [null, 0, -1, {}, []]) {
    expect(() => {
      // @ts-expect-error invalid type
      receiveMessageOnPort(value);
    }).toThrow();
  }
}, 9999999);

test("you can override globalThis.postMessage", async () => {
  const worker = new Worker(new URL("./worker-override-postMessage.js", import.meta.url).href);
  const message = await new Promise(resolve => {
    worker.on("message", resolve);
    worker.postMessage("Hello from worker!");
  });
  expect(message).toBe("Hello from worker!");
  await worker.terminate();
});

test("support require in eval", async () => {
  const worker = new Worker(`postMessage(require('process').argv[0])`, { eval: true });
  const result = await new Promise(resolve => {
    worker.on("message", resolve);
    worker.on("error", resolve);
  });
  expect(result).toBe(Bun.argv[0]);
  await worker.terminate();
});

test("support require in eval for a file", async () => {
  const cwd = process.cwd();
  console.log("cwd", cwd);
  const dir = import.meta.dir;
  const testfile = resolve(dir, "fixture-argv.js");
  const realpath = relative(cwd, testfile).replaceAll("\\", "/");
  console.log("realpath", realpath);
  expect(() => fs.accessSync(join(cwd, realpath))).not.toThrow();
  const worker = new Worker(`postMessage(require('./${realpath}').argv[0])`, { eval: true });
  const result = await new Promise(resolve => {
    worker.on("message", resolve);
    worker.on("error", resolve);
  });
  expect(result).toBe(Bun.argv[0]);
  await worker.terminate();
});

test("support require in eval for a file that doesnt exist", async () => {
  const worker = new Worker(`postMessage(require('./fixture-invalid.js').argv[0])`, { eval: true });
  const result = await new Promise(resolve => {
    worker.on("message", resolve);
    worker.on("error", resolve);
  });
  expect(result.toString()).toInclude(`error: Cannot find module './fixture-invalid.js' from 'blob:`);
  await worker.terminate();
});

test("support worker eval that throws", async () => {
  const worker = new Worker(`postMessage(throw new Error("boom"))`, { eval: true });
  const result = await new Promise(resolve => {
    worker.on("message", resolve);
    worker.on("error", resolve);
  });
  expect(result.toString()).toInclude(`error: Unexpected throw`);
  await worker.terminate();
});

describe("execArgv option", async () => {
  // this needs to be a subprocess to ensure that the parent's execArgv is not empty
  // otherwise we could not distinguish between the worker inheriting the parent's execArgv
  // vs. the worker getting a fresh empty execArgv
  async function run(execArgv: string, expected: string) {
    const proc = Bun.spawn({
      // pass --smol so that the parent thread has some known, non-empty execArgv
      cmd: [bunExe(), "--smol", "fixture-execargv.js", execArgv],
      env: bunEnv,
      cwd: __dirname,
    });
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(await new Response(proc.stdout).text()).toBe(expected);
  }

  it("inherits the parent's execArgv when falsy or unspecified", async () => {
    await run("null", '["--smol"]\n');
    await run("0", '["--smol"]\n');
  });
  it("provides empty execArgv when passed an empty array", async () => {
    // empty array should result in empty execArgv, not inherited from parent thread
    await run("[]", "[]\n");
  });
  it("can specify an array of strings", async () => {
    await run('["--no-warnings"]', '["--no-warnings"]\n');
  });
  // TODO(@190n) get our handling of non-string array elements in line with Node's
});

test("eval does not leak source code", async () => {
  const proc = Bun.spawn({
    cmd: [bunExe(), "eval-source-leak-fixture.js"],
    env: bunEnv,
    cwd: __dirname,
    stderr: "pipe",
    stdout: "ignore",
  });
  await proc.exited;
  const errors = await new Response(proc.stderr).text();
  if (errors.length > 0) throw new Error(errors);
  expect(proc.exitCode).toBe(0);
});
