import { describe, it, expect, afterEach, spyOn } from "bun:test"
import { log, debug, info, warn, error, logDelegation, setClient, setLogLevel } from "./log"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockClient(): { client: { app: { log: (opts: any) => Promise<boolean> } }; calls: any[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = []
  return {
    client: {
      app: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        log: (opts: any) => {
          calls.push(opts)
          return Promise.resolve(true)
        },
      },
    },
    calls,
  }
}

afterEach(() => {
  setClient(null)
  setLogLevel("INFO")
})

describe("backward compatibility", () => {
  it("log('msg') routes to client with level info", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    log("msg")
    await Promise.resolve()
    expect(calls.length).toBe(1)
    expect(calls[0]).toMatchObject({ body: { service: "weave", level: "info", message: "msg" } })
  })

  it("log('msg', { key: 'val' }) includes extra in call", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    log("msg", { key: "val" })
    await Promise.resolve()
    expect(calls[0]).toMatchObject({
      body: { service: "weave", level: "info", message: "msg", extra: { key: "val" } },
    })
  })
})

describe("level gating", () => {
  it("setLogLevel('WARN') suppresses info()", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("WARN")
    info("x")
    await Promise.resolve()
    expect(calls.length).toBe(0)
  })

  it("setLogLevel('WARN') allows warn()", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("WARN")
    warn("x")
    await Promise.resolve()
    expect(calls.length).toBe(1)
  })

  it("setLogLevel('DEBUG') allows debug()", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("DEBUG")
    debug("x")
    await Promise.resolve()
    expect(calls.length).toBe(1)
  })

  it("error() always passes through regardless of level", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("ERROR")
    error("x")
    await Promise.resolve()
    expect(calls.length).toBe(1)
  })
})

describe("setLogLevel", () => {
  it("setLogLevel('ERROR') suppresses warn()", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("ERROR")
    warn("x")
    await Promise.resolve()
    expect(calls.length).toBe(0)
  })

  it("setLogLevel('DEBUG') allows debug()", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    setLogLevel("DEBUG")
    debug("x")
    await Promise.resolve()
    expect(calls.length).toBe(1)
  })

  it("default level suppresses debug (INFO default)", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    // default is INFO — debug should be suppressed
    debug("x")
    await Promise.resolve()
    expect(calls.length).toBe(0)
  })
})

describe("pre-client fallback", () => {
  it("error() without client outputs to console.error with [weave:ERROR]", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {})
    error("something bad")
    expect(spy.mock.calls.length).toBeGreaterThan(0)
    const firstArg = spy.mock.calls[0][0] as string
    expect(firstArg).toContain("[weave:ERROR]")
    spy.mockRestore()
  })

  it("info() without client is silently dropped", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {})
    info("x")
    expect(spy.mock.calls.length).toBe(0)
    spy.mockRestore()
  })

  it("warn() without client outputs to console.error with [weave:WARN]", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {})
    warn("something concerning")
    expect(spy.mock.calls.length).toBeGreaterThan(0)
    const firstArg = spy.mock.calls[0][0] as string
    expect(firstArg).toContain("[weave:WARN]")
    spy.mockRestore()
  })
})

describe("bridge error swallowing", () => {
  it("info() does not throw when client.app.log rejects", async () => {
    const rejectingClient = {
      app: {
        log: () => Promise.reject(new Error("network")),
      },
    }
    setClient(rejectingClient)
    expect(() => info("x")).not.toThrow()
    await Promise.resolve()
  })
})

describe("logDelegation", () => {
  it("logDelegation start routes to client with correct message", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    logDelegation({ phase: "start", agent: "thread" })
    await Promise.resolve()
    expect(calls.length).toBe(1)
    expect(calls[0].body.message).toContain("[delegation:start]")
    expect(calls[0].body.message).toContain("agent=thread")
  })

  it("logDelegation complete includes sessionId in extra", async () => {
    const { client, calls } = mockClient()
    setClient(client)
    logDelegation({ phase: "complete", agent: "pattern", sessionId: "s123" })
    await Promise.resolve()
    expect(calls.length).toBe(1)
    expect(calls[0].body.extra).toMatchObject({ sessionId: "s123" })
  })
})
