# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Utsuwa, please report it by opening a GitHub issue or contacting the maintainer directly.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (if applicable)

## Security Considerations

### API Key Storage

Utsuwa stores API keys for LLM and TTS providers locally on your device. This means:

- Keys are stored locally on your device only
- Keys are not sent to any server other than the respective API providers
- Keys persist until you remove them in Settings or clear the app's data

**Recommendations:**
- Use Utsuwa on trusted devices only
- Consider using API keys with usage limits when possible
- Remove API keys in Settings if using a shared device

### Client-Side Application

Utsuwa stores all your data locally on your device. When self-hosting, chat, model-fetching, and Fish Audio speech requests are proxied through SvelteKit server-side API routes before reaching the provider. With `ALLOW_LOCAL_PROVIDER_HOSTS=true` set, speech requests to a local TTS server (Local TTS or OmniVoice) that the browser cannot reach directly are proxied the same way, only ever to `/v1/audio/speech` under the configured base URL. No data is stored server-side. The server acts only as a pass-through. When using the hosted version at utsuwa.ai, these requests pass through the deployment server in the same way.

### Third-Party Services

When you configure API keys, Utsuwa communicates directly with:
- LLM providers (OpenAI, Anthropic, Google, etc.)
- TTS providers (ElevenLabs, OpenAI, etc.)

Please review the privacy policies and terms of service of any providers you choose to use.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Updates

Security updates will be released as needed. Watch the repository for notifications about important updates.
