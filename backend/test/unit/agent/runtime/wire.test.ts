import { streamAgentEvents } from '@/agent/runtime/wire';

function fakeAgent(events: unknown[]) {
  return {
    streamEvents: async function* () {
      for (const e of events) yield e as never;
    },
  };
}

describe('wire: streamEvents → SSE logical events', () => {
  it('maps chat stream chunks to delta and aggregates usage into done', async () => {
    const agent = fakeAgent([
      { event: 'on_chat_model_stream', data: { chunk: { content: '你好' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: '，GM' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: '' } } },
      { event: 'on_chat_model_end', data: { output: { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } } },
    ]);

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out).toEqual([
      { event: 'delta', data: { text: '你好' } },
      { event: 'delta', data: { text: '，GM' } },
      { event: 'done', data: { tokens: { prompt: 10, completion: 5, total: 15 } } },
    ]);
  });

  it('maps tool start/end with row count and duration', async () => {
    const agent = fakeAgent([
      { event: 'on_tool_start', name: 'get_character_overview', run_id: 'run-1', data: { input: { name: 'rama' } } },
      { event: 'on_tool_end', name: 'get_character_overview', run_id: 'run-1', data: { output: { content: '[{"guid":1},{"guid":2}]' } } },
    ]);

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out[0]).toMatchObject({ event: 'tool_call', data: { name: 'get_character_overview', args: { name: 'rama' } } });
    expect(out[1]).toMatchObject({ event: 'tool_result', data: { name: 'get_character_overview', rowCount: 2 } });
    expect(out[2].event).toBe('done');
  });

  it('emits error event on upstream failure', async () => {
    const agent = {
      streamEvents: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { event: 'on_chat_model_stream', data: { chunk: { content: '部分' } } } as never;
          throw Object.assign(new Error('boom'), { code: 'budget_exceeded' });
        },
      }),
    };

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out).toEqual([
      { event: 'delta', data: { text: '部分' } },
      { event: 'error', data: { message: 'boom', code: 'budget_exceeded' } },
    ]);
  });
});
