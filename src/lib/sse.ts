/**
 * Parse a Server-Sent Events stream from a fetch Response and call handlers
 * per event. (Ported from the adhouse-saas consumeSSE pattern.)
 */
export async function consumeSSE(
  response: Response,
  handlers: Record<string, (data: Record<string, unknown>) => void>,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Streaming not supported')

  const decoder = new TextDecoder()
  let buffer = ''
  let eventType = ''
  let eventData = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7)
      else if (line.startsWith('data: ')) eventData = line.slice(6)
      else if (line === '' && eventType && eventData) {
        try {
          handlers[eventType]?.(JSON.parse(eventData))
        } catch {
          /* skip malformed JSON */
        }
        eventType = ''
        eventData = ''
      }
    }
  }
}
