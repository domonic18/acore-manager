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

  it('extracts text blocks from array content and skips thinking blocks (anthropic-protocol models)', async () => {
    const agent = fakeAgent([
      { event: 'on_chat_model_stream', data: { chunk: { content: [{ index: 0, type: 'thinking', thinking: '推理中' }] } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: [{ index: 1, type: 'text', text: '今天是' }] } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: [{ index: 1, type: 'text', text: '2026-09-22' }] } } },
      { event: 'on_chat_model_end', data: { output: { usage_metadata: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } } } },
    ]);

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out).toEqual([
      { event: 'delta', data: { text: '今天是' } },
      { event: 'delta', data: { text: '2026-09-22' } },
      { event: 'done', data: { tokens: { prompt: 8, completion: 4, total: 12 } } },
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

  it('marks tool_result as failed when the handler returns a structured error', async () => {
    const agent = fakeAgent([
      { event: 'on_tool_start', name: 'get_metrics_snapshot', run_id: 'run-3', data: { input: {} } },
      { event: 'on_tool_end', name: 'get_metrics_snapshot', run_id: 'run-3', data: { output: { error: 'datasource characters not initialized' } } },
    ]);

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out[1]).toMatchObject({
      event: 'tool_result',
      data: { name: 'get_metrics_snapshot', rowCount: null, error: 'datasource characters not initialized' },
    });
  });

  it('maps tool errors to a terminal tool_result so the frontend row does not stay running', async () => {
    const agent = fakeAgent([
      { event: 'on_tool_start', name: 'get_log_manifest', run_id: 'run-2', data: { input: { date: '2026-09-22' } } },
      { event: 'on_tool_error', name: 'get_log_manifest', run_id: 'run-2', data: { error: new Error('COS 未配置') } },
    ]);

    const out = [];
    for await (const ev of streamAgentEvents(agent as never, {}, {})) out.push(ev);

    expect(out[1]).toMatchObject({
      event: 'tool_result',
      data: { name: 'get_log_manifest', rowCount: null, error: 'COS 未配置' },
    });
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
