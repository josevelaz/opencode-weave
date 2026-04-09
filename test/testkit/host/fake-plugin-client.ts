export interface FakePromptPart {
  type: string
  text?: string
}

export interface FakePromptAsyncCall {
  path: { id: string }
  body: {
    parts: FakePromptPart[]
    agent?: string
  }
}

export interface FakeTodoItem {
  content: string
  status: string
  priority: string
}

export class FakePluginClient {
  readonly promptAsyncCalls: FakePromptAsyncCall[] = []
  readonly todoRequests: Array<{ path: { id: string } }> = []

  private readonly todosBySession = new Map<string, FakeTodoItem[]>()

  readonly session = {
    promptAsync: async (opts: FakePromptAsyncCall) => {
      this.promptAsyncCalls.push({
        path: { id: opts.path.id },
        body: {
          ...("agent" in opts.body ? { agent: opts.body.agent } : {}),
          parts: opts.body.parts.map(part => ({ ...part })),
        },
      })
    },
    todo: async (opts: { path: { id: string } }) => {
      this.todoRequests.push({ path: { id: opts.path.id } })
      return { data: this.todosBySession.get(opts.path.id) ?? [] }
    },
  }

  setSessionTodos(sessionID: string, todos: FakeTodoItem[]): void {
    this.todosBySession.set(sessionID, todos.map(todo => ({ ...todo })))
  }

  get lastPromptAsyncCall(): FakePromptAsyncCall | undefined {
    return this.promptAsyncCalls.length > 0
      ? this.promptAsyncCalls[this.promptAsyncCalls.length - 1]
      : undefined
  }

  clearEffects(): void {
    this.promptAsyncCalls.length = 0
    this.todoRequests.length = 0
  }
}
