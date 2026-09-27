export class VoiceCatalog {
  constructor(baseUrl, fetcher = fetch) { this.baseUrl = baseUrl; this.fetcher = fetcher; this.voices = []; this.updated = 0; }
  async refresh() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const response = await this.fetcher(this.baseUrl + '/v1/audio/voices', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Cannot read saved voices (HTTP ${response.status}). Check OmniVoice is running and up to date.`);
      const payload = await response.json();
      if (!Array.isArray(payload.data)) throw new Error('OmniVoice returned an unsupported voice list.');
      this.voices = [...new Set(payload.data.filter(v => v.owned_by === 'local' && typeof v.id === 'string' && v.id.trim()).map(v => v.id))].sort();
      this.updated = Date.now();
      return this.voices;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async ensureFresh() { if (Date.now() - this.updated > 30000) await this.refresh(); }
}
export function parseCommand(raw, command, voices) {
  const input = String(raw).trim();
  if (input.slice(0, command.length).toLowerCase() !== command.toLowerCase() || (input.length > command.length && !/\s/.test(input[command.length]))) return null;
  const rest = input.slice(command.length).trim();
  const match = rest.match(/^(?:"([^"]+)"|\(([^)]+)\)|(\S+))\s+([\s\S]+)$/);
  if (!match) throw new Error(`Use ${command} samplename words to say. Put names with spaces in quotes.`);
  const name = match[1] || match[2] || match[3];
  const exact = voices.find(v => v === name);
  const matches = voices.filter(v => v.toLowerCase() === name.toLowerCase());
  const voice = exact || (matches.length === 1 ? matches[0] : null);
  if (!voice) throw new Error('Unknown or ambiguous sample name. Choose a saved voice from the window.');
  return { voice, text: match[4].trim() };
}
