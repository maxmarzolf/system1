import type { ReactNode } from 'react'
import { JsonBlock, TextBlock } from './TraceBlocks'
import { asRecord, asRecords, formatLatency, type LooseRecord } from './traceFormat'

/**
 * Everything that went into and came out of the models for one submission: the LLM calls that
 * generated its question, the LLM calls made while grading it, and its Jev calls. Each call
 * shows its settings and timing, with the request and the response collapsed beneath.
 */

function tokens(usage: LooseRecord) {
  const input = usage.inputTokens ?? usage.input_tokens
  const output = usage.outputTokens ?? usage.output_tokens
  if (typeof input !== 'number' && typeof output !== 'number') return null
  return `${typeof input === 'number' ? input : '?'} in / ${typeof output === 'number' ? output : '?'} out`
}

function CallHeader({ parts, failed }: { parts: (string | null | undefined)[]; failed?: boolean }) {
  return (
    <span className={failed ? 'model-call-header model-call-header-failed' : 'model-call-header'}>
      {parts.filter(Boolean).join(' · ')}
    </span>
  )
}

function LlmExchange({ exchange }: { exchange: LooseRecord }) {
  const usage = asRecord(exchange.usage)
  const error = asRecord(exchange.error)
  const failed = exchange.ok === false
  return (
    <li className="model-call">
      <CallHeader
        failed={failed}
        parts={[
          `#${String(exchange.attempt ?? '?')}`,
          String(exchange.provider ?? ''),
          exchange.model ? String(exchange.model) : 'default model',
          formatLatency(exchange.latencyMs),
          tokens(usage),
          failed ? `failed: ${String(error.code ?? 'error')}` : null,
        ]}
      />
      <dl className="signal-trace-facts model-call-facts">
        <div><dt>Max tokens</dt><dd>{String(exchange.maxTokens ?? '—')}</dd></div>
        <div><dt>Temperature</dt><dd>{String(exchange.temperature ?? '—')}</dd></div>
        <div><dt>Timeout</dt><dd>{exchange.timeoutSeconds !== undefined ? `${String(exchange.timeoutSeconds)} s` : '—'}</dd></div>
        <div><dt>Started</dt><dd>{exchange.startedAt ? <time dateTime={String(exchange.startedAt)}>{String(exchange.startedAt)}</time> : '—'}</dd></div>
      </dl>
      <details className="signal-trace-raw">
        <summary>Request</summary>
        <h6>System prompt</h6>
        <TextBlock value={exchange.systemPrompt} />
        <h6>Payload</h6>
        <JsonBlock value={exchange.payload} />
      </details>
      <details className="signal-trace-raw">
        <summary>Response</summary>
        {failed ? <p className="model-call-error" role="note">{String(error.message ?? error.code ?? 'The call failed.')}</p> : null}
        {exchange.reply !== undefined ? (
          <>
            <h6>Reply</h6>
            <TextBlock value={exchange.reply} />
          </>
        ) : null}
        {exchange.parsed !== undefined ? (
          <>
            <h6>Parsed</h6>
            <JsonBlock value={exchange.parsed} />
          </>
        ) : null}
      </details>
    </li>
  )
}

function JevCall({ call, index }: { call: LooseRecord; index: number }) {
  const attempts = typeof call.attempts === 'number' && call.attempts > 1 ? `${call.attempts} attempts` : null
  return (
    <li className="model-call">
      <CallHeader
        parts={[
          `#${index + 1}`,
          'jev',
          call.model ? String(call.model) : null,
          formatLatency(call.latencyMs),
          tokens(asRecord(call.usage)),
          attempts,
          call.requestId ? `request ${String(call.requestId)}` : null,
        ]}
      />
      <details className="signal-trace-raw">
        <summary>Request</summary>
        {call.state !== undefined ? (
          <>
            <h6>State</h6>
            <JsonBlock value={call.state} />
          </>
        ) : null}
        <h6>Questions</h6>
        <JsonBlock value={call.questions ?? call.questionIds} />
      </details>
      <details className="signal-trace-raw">
        <summary>Response</summary>
        <h6>Answers</h6>
        <JsonBlock value={call.answers} />
      </details>
    </li>
  )
}

function Section({ title, empty, children, count }: { title: string; empty: string; count: number; children: ReactNode }) {
  return (
    <section className="model-call-section" aria-label={title}>
      <h5>{title}{count ? ` (${count})` : ''}</h5>
      {count ? <ol className="model-call-list">{children}</ol> : <p className="signal-trace-empty">{empty}</p>}
    </section>
  )
}

export default function ModelCallDetails({ generationTrace, evaluation }: { generationTrace: unknown; evaluation: unknown }) {
  const generation = asRecords(generationTrace)
  const record = asRecord(evaluation)
  const grading = asRecords(record.llmTrace)
  const jev = asRecords(record.jevTrace)
  return (
    <div className="model-call-details">
      <Section title="Generation" count={generation.length} empty="No generation calls were stored (questions made before tracing, or not LLM-generated).">
        {generation.map((exchange, index) => <LlmExchange key={index} exchange={exchange} />)}
      </Section>
      <Section title="Grading LLM calls" count={grading.length} empty="No LLM calls were made while grading.">
        {grading.map((exchange, index) => <LlmExchange key={index} exchange={exchange} />)}
      </Section>
      <Section title="Jev" count={jev.length} empty="Jev was not called.">
        {jev.map((call, index) => <JevCall key={index} call={call} index={index} />)}
      </Section>
    </div>
  )
}
